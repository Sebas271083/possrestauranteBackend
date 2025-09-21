// src/routes/kds.routes.js
import express from "express";
import { celebrate, Segments } from "celebrate";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { Op, fn, col, where as sqWhere } from "sequelize";
import { OrderItem, Order, Table } from "../models/index.js";
import { recomputeOrderState } from "../services/orderState.service.js";
import {
  stationParam,
  queueQuery,
  itemIdParam,
  setStatusBody,
  orderIdParam
} from "../schemas/kds.schemas.js";

const router = express.Router();

/* ============================================================
   GET cola por estación
   - Front envía ?status=queued,in_kitchen (por ejemplo)
   - Compat: si piden queued, también trae 'pending' (histórico)
   - station puede ser 'all' para todas las estaciones
   ============================================================ */
router.get(
  "/:station/queue",
  requireAuth,
  celebrate({ [Segments.PARAMS]: stationParam, [Segments.QUERY]: queueQuery }),
  async (req, res, next) => {
    try {
      const reqStatuses = String(req.query.status || "")
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);

      if (reqStatuses.length === 0) {
        return res.status(400).json({ error: "Bad Request", detail: "status vacío" });
      }

      // compat con histórico: queued incluye pending
      const statuses = new Set(reqStatuses);
      if (statuses.has("queued")) statuses.add("pending");

      const st = String(req.params.station || "").toLowerCase().trim();

      const whereClause = { status: { [Op.in]: Array.from(statuses) } };
      if (st !== "all") {
        // comparar station en minúsculas
        whereClause[Op.and] = [sqWhere(fn("LOWER", col("OrderItem.station")), st)];
      }

      const rows = await OrderItem.findAll({
        where: whereClause,
        include: [
          {
            model: Order,
            attributes: ["id", "table_id", "status"],
            include: [{ model: Table, attributes: ["id", "label"] }]
          }
        ],
        order: [
          ["fired_at", "ASC"],
          ["created_at", "ASC"]
        ],
        limit: Number(req.query.limit) || 200
      });

      res.json(
        rows.map(r => ({
          id: r.id,
          item_name: r.item_name,
          quantity: r.quantity,
          notes: r.notes,
          status: r.status,
          station: r.station,
          fired_at: r.fired_at,
          created_at: r.created_at,
          order_id: r.order_id,
          order_status: r.Order?.status ?? null,
          table_id: r.Order?.table_id ?? null,
          table_label: r.Order?.Table?.label ?? null,
          modifiers: r.modifiers_json || null
        }))
      );
    } catch (e) {
      console.error("KDS_QUEUE_ERROR", e);
      next(e);
    }
  }
);

/* ============================================================
   Avanzar estado (new/queued/in_kitchen/ready/delivered)
   - Compat: si viene 'pending' lo tratamos como 'queued'
   ============================================================ */
router.post(
  "/items/:id/advance",
  requireAuth, // opcional: requireRole("kitchen","manager")
  celebrate({ [Segments.PARAMS]: itemIdParam }),
  async (req, res, next) => {
    const t = await OrderItem.sequelize.transaction();
    try {
      const it = await OrderItem.findByPk(req.params.id, { transaction: t });
      if (!it) {
        await t.rollback();
        return res.status(404).json({ error: "Ítem no encontrado" });
      }

      const s = it.status || "new";
      const current = s === "pending" ? "queued" : s; // compat

      const transitions = {
        new: "queued",
        queued: "in_kitchen",
        in_kitchen: "ready",
        ready: "delivered"
      };

      const next = transitions[current] || null;
      if (!next) {
        await t.rollback();
        return res.status(400).json({ error: `No se puede avanzar desde ${it.status}` });
      }

      await it.update({ status: next }, { transaction: t });
      try { await recomputeOrderState(it.order_id, t); } catch {}

      await t.commit();
      res.json({ ok: true, item_id: it.id, status: next });
    } catch (e) {
      await t.rollback();
      next(e);
    }
  }
);

/* ============================================================
   Setear estado explícito (incluye 'void')
   - delivered y void no retroceden
   ============================================================ */
router.post(
  "/items/:id/set-status",
  requireAuth,
  requireRole("manager", "admin"),
  celebrate({ [Segments.PARAMS]: itemIdParam, [Segments.BODY]: setStatusBody }),
  async (req, res, next) => {
    const t = await OrderItem.sequelize.transaction();
    try {
      const it = await OrderItem.findByPk(req.params.id, { transaction: t });
      if (!it) {
        await t.rollback();
        return res.status(404).json({ error: "Ítem no encontrado" });
      }

      const from = it.status || "new";
      const to = req.body.status;

      if ((from === "void" && to !== "void") || (from === "delivered" && to !== "delivered")) {
        await t.rollback();
        return res.status(400).json({ error: `Transición inválida: ${from} → ${to}` });
      }

      await it.update({ status: to }, { transaction: t });
      try { await recomputeOrderState(it.order_id, t); } catch {}

      await t.commit();
      res.json({ ok: true, item_id: it.id, from, to });
    } catch (e) {
      await t.rollback();
      next(e);
    }
  }
);

/* ============================================================
   Marcar toda la orden como 'delivered' si todo está listo
   ============================================================ */
router.post(
  "/orders/:orderId/mark-delivered",
  requireAuth,
  requireRole("manager", "admin"),
  celebrate({ [Segments.PARAMS]: orderIdParam }),
  async (req, res, next) => {
    const t = await Order.sequelize.transaction();
    try {
      const order = await Order.findByPk(req.params.orderId, {
        include: [OrderItem],
        transaction: t
      });
      if (!order) {
        await t.rollback();
        return res.status(404).json({ error: "Orden no encontrada" });
      }

      const invalid = order.OrderItems.some(i => !["ready", "delivered", "void"].includes(i.status));
      if (invalid) {
        await t.rollback();
        return res.status(400).json({ error: "Hay ítems pendientes o en cocina" });
      }

      const readyItems = order.OrderItems.filter(i => i.status === "ready");
      for (const it of readyItems) {
        await it.update({ status: "delivered" }, { transaction: t });
      }

      try { await recomputeOrderState(order.id, t); } catch {}
      await t.commit();

      res.json({ ok: true, order_id: order.id, status: "delivered", delivered_items: readyItems.length });
    } catch (e) {
      await t.rollback();
      next(e);
    }
  }
);

/* ============================================================
   Disparar todos los ítems 'new' (y 'pending' legacy) → 'queued'
   - El paso a 'in_kitchen' lo hace cocina con /items/:id/advance
   ============================================================ */
router.post(
  "/orders/:orderId/fire",
  requireAuth, // opcional: requireRole("kitchen","manager")
  celebrate({ [Segments.PARAMS]: orderIdParam }),
  async (req, res, next) => {
    const t = await OrderItem.sequelize.transaction();
    try {
      const order = await Order.findByPk(req.params.orderId, { transaction: t });
      if (!order) {
        await t.rollback();
        return res.status(404).json({ error: "Orden no encontrada" });
      }
      if (order.status !== "open") {
        await t.rollback();
        return res.status(409).json({ error: "La orden no está abierta" });
      }

      const [count] = await OrderItem.update(
        { status: "queued", fired_at: new Date() },
        { where: { order_id: order.id, status: { [Op.in]: ["new", "queued"] } }, transaction: t }
      );

      try { await recomputeOrderState(order.id, t); } catch {}
      await t.commit();

      res.json({ ok: true, queued: count });
    } catch (e) {
      await t.rollback();
      next(e);
    }
  }
);

export default router;
