import express from "express";
import { celebrate, Segments } from "celebrate";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { paymentIdParam, refundPartialBody } from "../schemas/mp.schemas.js";
import { Payment, Order } from "../models/index.js";
import { mpRefundFull, mpRefundPartial, mpListRefunds } from "../services/mp.service.js";
import { audit } from "../services/audit.service.js";
import { Op } from "sequelize";

const router = express.Router();

/** Helper: total pagado (incluye negativos) */
async function orderPaidSum(orderId, t) {
  const rows = await Payment.findAll({ where: { order_id: orderId }, transaction: t });
  return rows.reduce((a,p)=> a + Number(p.amount), 0);
}

/** Helper: monto ya devuelto para un payment padre */
async function refundedSumForPayment(parentId, t) {
  const rows = await Payment.findAll({ where: { parent_payment_id: parentId }, transaction: t });
  return rows.reduce((a,p)=> a + Math.min(0, Number(p.amount)), 0); // suma negativos
}

/**
 * Refund TOTAL
 * id = id del pago en TU DB (tabla payments) que tiene method mp_link/mp_point
 */
router.post(
  "/payments/:id/refund",
  requireAuth, requireRole("admin","manager"),
  celebrate({ [Segments.PARAMS]: paymentIdParam }),
  async (req, res, next) => {
    const t = await Payment.sequelize.transaction();
    try {
      const pay = await Payment.findByPk(req.params.id, { transaction: t });
      if (!pay) { await t.rollback(); return res.status(404).json({ error: "Pago no encontrado" }); }
      if (!["mp_link","mp_point"].includes(pay.method)) { await t.rollback(); return res.status(400).json({ error: "El pago no es de MercadoPago" }); }

      const originalAmount = Number(pay.amount);
      if (!(originalAmount > 0)) { await t.rollback(); return res.status(400).json({ error: "Pago inválido para refund" }); }

      // Validar que no esté totalmente devuelto
      const alreadyRefunded = Math.abs(await refundedSumForPayment(pay.id, t)); // positivos
      const remaining = originalAmount - alreadyRefunded;
      if (remaining <= 0.009) { await t.rollback(); return res.status(409).json({ error: "Pago ya totalmente devuelto" }); }

      // Hacer refund total en MP
      const mpRefund = await mpRefundFull({ paymentId: pay.ref }); // OJO: pay.ref guarda el payment_id de MP

      // Idempotencia: si ya existe un negativo con ref = mpRefund.id, no duplicar
      const exists = await Payment.findOne({ where: { ref: String(mpRefund.id) }, transaction: t });
      if (!exists) {
        await Payment.create({
          order_id: pay.order_id,
          session_id: null,
          method: pay.method,
          amount: -remaining,                 // negativo
          ref: String(mpRefund.id),           // id del refund en MP
          parent_payment_id: pay.id,          // enlace al pago original
          meta: { mp_refund: mpRefund },
          created_by: req.user.sub
        }, { transaction: t });

        await audit({
          user_id: req.user.sub,
          action: "PAYMENT_REFUND_ADD",
          entity: "Payment",
          entity_id: pay.id,
          meta: { type: "full", mp_payment_id: pay.ref, mp_refund_id: mpRefund.id, amount: remaining }
        }, t);
      }

      // Recalcular saldos de la orden (opcional cerrar/reabrir)
      const order = await Order.findByPk(pay.order_id, { transaction: t });
      if (order) {
        const paid = await orderPaidSum(order.id, t);
        // No cerramos ni abrimos automáticamente aquí; solo devolvemos saldo
        await order.update({ /* solo si querés marcar algo */ }, { transaction: t });
      }

      await t.commit();
      res.status(201).json({ ok: true, refunded: remaining.toFixed(2), mp_refund_id: mpRefund.id });
    } catch (e) { await t.rollback(); next(e); }
  }
);

/**
 * Refund PARCIAL
 */
router.post(
  "/payments/:id/refund-partial",
  requireAuth, requireRole("admin","manager"),
  celebrate({ [Segments.PARAMS]: paymentIdParam, [Segments.BODY]: refundPartialBody }),
  async (req, res, next) => {
    const t = await Payment.sequelize.transaction();
    try {
      const pay = await Payment.findByPk(req.params.id, { transaction: t });
      if (!pay) { await t.rollback(); return res.status(404).json({ error: "Pago no encontrado" }); }
      if (!["mp_link","mp_point"].includes(pay.method)) { await t.rollback(); return res.status(400).json({ error: "El pago no es de MercadoPago" }); }

      const originalAmount = Number(pay.amount);
      if (!(originalAmount > 0)) { await t.rollback(); return res.status(400).json({ error: "Pago inválido para refund" }); }

      const alreadyRefunded = Math.abs(await refundedSumForPayment(pay.id, t));
      const remaining = originalAmount - alreadyRefunded;

      const amount = Number(req.body.amount);
      if (amount > remaining + 0.009) { await t.rollback(); return res.status(400).json({ error: "El monto supera lo disponible para devolución", remaining }); }
      if (amount <= 0) { await t.rollback(); return res.status(400).json({ error: "Monto inválido" }); }

      // Hacer refund parcial en MP
      const mpRefund = await mpRefundPartial({ paymentId: pay.ref, amount });

      // Idempotencia
      const exists = await Payment.findOne({ where: { ref: String(mpRefund.id) }, transaction: t });
      if (!exists) {
        await Payment.create({
          order_id: pay.order_id,
          session_id: null,
          method: pay.method,
          amount: -amount,                     // negativo
          ref: String(mpRefund.id),
          parent_payment_id: pay.id,
          meta: { mp_refund: mpRefund, reason: req.body.reason || null },
          created_by: req.user.sub
        }, { transaction: t });

        await audit({
          user_id: req.user.sub,
          action: "PAYMENT_REFUND_ADD",
          entity: "Payment",
          entity_id: pay.id,
          meta: { type: "partial", mp_payment_id: pay.ref, mp_refund_id: mpRefund.id, amount }
        }, t);
      }

      // Recalcular saldos (igual que arriba, no tocamos estado acá)
      const order = await Order.findByPk(pay.order_id, { transaction: t });
      if (order) {
        const paid = await orderPaidSum(order.id, t);
        await order.update({ /* marker opcional */ }, { transaction: t });
      }

      await t.commit();
      res.status(201).json({ ok: true, refunded: amount.toFixed(2), mp_refund_id: mpRefund.id });
    } catch (e) { await t.rollback(); next(e); }
  }
);

/**
 * Listar refunds (locales + MP)
 * Devuelve lo registrado en tu DB y, además, los refunds que responde MP.
 */
router.get(
  "/payments/:id/refunds",
  requireAuth, requireRole("admin","manager","cashier"),
  celebrate({ [Segments.PARAMS]: paymentIdParam }),
  async (req, res, next) => {
    try {
      const pay = await Payment.findByPk(req.params.id);
      if (!pay) return res.status(404).json({ error: "Pago no encontrado" });
      if (!["mp_link","mp_point"].includes(pay.method)) return res.status(400).json({ error: "El pago no es de MercadoPago" });

      // Locales
      const locals = await Payment.findAll({ where: { parent_payment_id: pay.id } });

      // MP
      const remote = await mpListRefunds({ paymentId: pay.ref });

      res.json({ local: locals, mp: remote });
    } catch (e) { next(e); }
  }
);

export default router;
