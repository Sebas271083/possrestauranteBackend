// src/routes/cashier.routes.js
import express from "express";
import { celebrate, Joi, Segments } from "celebrate";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { Op, fn, col } from "sequelize";
import { Order, OrderItem, Table, Payment } from "../models/index.js";
import { CashSession } from "../models/index.js";

const router = express.Router();

// Helpers
const round2 = (v) => Math.max(0, Math.round((Number(v) || 0) * 100) / 100);
const to2 = (v) => round2(v).toFixed(2);

// ===== GET /cashier/orders =====
// Lista de órdenes cobrables (open/ready/delivered) + pagado y pendiente
router.get("/orders", requireAuth, async (_req, res, next) => {
  try {
    const orders = await Order.findAll({
      where: { status: { [Op.in]: ["open", "ready", "delivered"] } },
      include: [{ model: Table }],
      order: [["id", "DESC"]],
    });

    // pagos por orden
    const pays = await Payment.findAll({
      attributes: ["order_id", [fn("SUM", col("amount")), "paid"]],
      group: ["order_id"],
      raw: true,
    });
    const paidMap = new Map(pays.map((p) => [Number(p.order_id), Number(p.paid) || 0]));

    const out = orders.map((o) => {
      const paid = paidMap.get(o.id) || 0;
      const due = Math.max(0, Number(o.grand_total || 0) - paid);
      return {
        id: o.id,
        status: o.status,
        subtotal: o.subtotal,
        service_total: o.service_total,
        discount_total: o.discount_total,
        grand_total: o.grand_total,
        paid,
        due,
        Table: o.Table ? { id: o.Table.id, label: o.Table.label } : null,
      };
    });

    res.json(out);
  } catch (e) { next(e); }
});

// ===== GET /cashier/orders/:id/summary =====
// Detalle de una orden (ítems + pagos + totales)
router.get("/orders/:id/summary", requireAuth, async (req, res, next) => {
  try {
    const o = await Order.findByPk(req.params.id, {
      include: [Table, OrderItem],
    });
    if (!o) return res.status(404).json({ error: "Orden no encontrada" });

    const pays = await Payment.findAll({
      where: { order_id: o.id },
      order: [["created_at", "ASC"]],
      raw: true,
    });
    const paid = pays.reduce((a, p) => a + Number(p.amount || 0), 0);

    res.json({
      order: o,
      payments: pays,
      paid,
    });
  } catch (e) { next(e); }
});

// ===== POST /cashier/orders/:id/settle =====
// Registrar pagos (parcial) y/o cerrar la orden (total)
// Si require_full_payment=true y falta dinero → 409 con { due } (no 500)
router.post(
  "/orders/:id/settle",
  requireAuth, requireRole("cashier", "manager", "admin"),
  celebrate({
    [Segments.PARAMS]: Joi.object({ id: Joi.number().integer().required() }),
    [Segments.BODY]: Joi.object({
      service_total: Joi.number().min(0).default(0),
      discount_total: Joi.number().min(0).default(0),
      payments: Joi.array().items(
        Joi.object({
          method: Joi.string().valid("cash", "card", "transfer", "other").required(),
          amount: Joi.number().min(0.01).required(),
          reference: Joi.string().allow("", null),
        })
      ).default([]),
      require_full_payment: Joi.boolean().default(true),
    }),
  }),
  async (req, res, next) => {
    const t = await Order.sequelize.transaction();
    try {
      const id = Number(req.params.id);
      const { service_total, discount_total, payments, require_full_payment } = req.body;

      const order = await Order.findByPk(id, { include: [Table, OrderItem], transaction: t, lock: t.LOCK.UPDATE });
      if (!order) { await t.rollback(); return res.status(404).json({ error: "Orden no encontrada" }); }
      if (order.status === "closed" || order.status === "void") {
        await t.rollback(); return res.status(409).json({ error: "Orden cerrada/anulada" });
      }

      // Recalcular totales con lo que digitó caja
      const subtotal = (order.OrderItems || [])
        .reduce((a, r) => a + Number(r.unit_price || 0) * Number(r.quantity || 0), 0);
      const grand = Math.max(0, subtotal - Number(discount_total || 0) + Number(service_total || 0));

      await order.update({
        subtotal: to2(subtotal),
        service_total: to2(service_total),
        discount_total: to2(discount_total),
        grand_total: to2(grand),
      }, { transaction: t });

      // Pagado existente
      const existingPays = await Payment.findAll({
        where: { order_id: order.id },
        attributes: [[fn("SUM", col("amount")), "paid"]],
        raw: true, transaction: t,
      });
      const alreadyPaid = Number(existingPays?.[0]?.paid || 0);

      // Pagos nuevos (solo si hay)
      const newPaid = (payments || []).reduce((a, p) => a + Number(p.amount || 0), 0);
      const totalPaid = round2(alreadyPaid + newPaid);
      const due = round2(grand - totalPaid);

      // Validación de cocina: si vas a cerrar, todo debe estar entregado
      if (require_full_payment) {
        const hasPendingKitchen = (order.OrderItems || [])
          .some(i => !["delivered", "void"].includes(i.status));
        if (hasPendingKitchen) {
          await t.rollback();
          return res.status(409).json({ error: "Cocina pendiente", code: "KITCHEN_PENDING" });
        }
      }

      // Si es cierre y falta dinero → 409 con due (no persistimos pagos)
      if (require_full_payment && due > 0.009) {
        await t.rollback();
        return res.status(409).json({ error: "Pago insuficiente", code: "INSUFFICIENT", due });
      }

      // 👉 Buscar sesión de caja abierta del usuario para asociar los pagos
      let session = null;
      if (payments?.length) {
        session = await CashSession.findOne({
          where: { status: "open", opened_by: req.user.sub },
          transaction: t, lock: t.LOCK.UPDATE,
        });
        if (!session) {
          await t.rollback();
          return res.status(409).json({ error: "Abrí una sesión de caja para cobrar", code: "NO_SESSION" });
        }
      }

      // Persistir pagos nuevos (en parcial SIEMPRE; en total solo si alcanzó)
      if (payments?.length) {
        const bulk = payments
          .filter(p => Number(p.amount) > 0)
          .map(p => ({
            order_id: order.id,
            session_id: session.id,     // <-- relación con la sesión abierta
            user_id: req.user.sub,      // <-- quién cobró
            method: p.method,
            amount: to2(p.amount),
            reference: (p.reference || null),
          }));
        if (bulk.length) {
          await Payment.bulkCreate(bulk, { transaction: t });
        }
      }

      // Si es cierre total y ya no hay saldo → cerrar y liberar mesa
      let closed = false;
      if (require_full_payment && due <= 0.009) {
        await order.update({ status: "closed", closed_at: new Date() }, { transaction: t });
        closed = true;

        // liberar mesa si no tiene otra orden abierta
        if (order.Table) {
          const stillOpen = await Order.count({
            where: { table_id: order.table_id, status: "open" },
            transaction: t,
          });
          if (stillOpen === 0) {
            await order.Table.update({ status: "free" }, { transaction: t });
          }
        }
      }

      await t.commit();
      return res.json({
        ok: true,
        order_id: order.id,
        closed,
        due: closed ? 0 : due,
      });
    } catch (e) {
      await t.rollback();
      next(e);
    }
  }
);

export default router;
