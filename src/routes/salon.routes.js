import express from "express";
import { celebrate, Joi, Segments } from "celebrate";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import {
  Area, Table, Order, OrderItem, TransferLog,
  ModifierGroup, ModifierOption, Product, Payment
} from "../models/index.js";
import { deductForProductSale } from "../services/inventory.service.js";
import { audit } from "../services/audit.service.js";
import { Op } from "sequelize";
import {
  idParam, itemIdParam,
  areaCreate, areaUpdate,
  tableCreate, tableUpdate,
  openTableBody, orderItemsBody, patchItemBody,
  closeOrderBody, transferBody, joinOrdersBody,
  orderItemsBodyV2
} from "../schemas/salon.schemas.js";


const router = express.Router();

/* ===================== ÁREAS ===================== */
router.get("/areas", requireAuth, async (_req, res, next) => {
  try {
    const rows = await Area.findAll({ order: [["sort_order", "ASC"], ["name", "ASC"]] });
    res.json(rows);
  } catch (e) { next(e); }
});

router.post(
  "/areas",
  requireAuth, requireRole("admin", "manager"),
  celebrate({ [Segments.BODY]: areaCreate }),
  async (req, res, next) => {
    try { const row = await Area.create(req.body); res.status(201).json(row); }
    catch (e) { next(e); }
  }
);



router.patch(
  "/areas/:id",
  requireAuth, requireRole("admin", "manager"),
  celebrate({ [Segments.PARAMS]: idParam, [Segments.BODY]: areaUpdate }),
  async (req, res, next) => {
    try {
      const row = await Area.findByPk(req.params.id);
      if (!row) return res.status(404).json({ error: "Área no encontrada" });
      await row.update(req.body);
      res.json(row);
    } catch (e) { next(e); }
  }
);

/* ===================== MESAS ===================== */
router.get("/tables", requireAuth, async (_req, res, next) => {
  try {
    const rows = await Table.findAll({ include: [{ model: Area }], order: [["area_id", "ASC"], ["label", "ASC"]] });
    res.json(rows);
  } catch (e) { next(e); }
});

router.post(
  "/tables",
  requireAuth, requireRole("admin", "manager"),
  celebrate({ [Segments.BODY]: tableCreate }),
  async (req, res, next) => {
    try { const row = await Table.create(req.body); res.status(201).json(row); }
    catch (e) { next(e); }
  }
);

router.patch(
  "/tables/:id",
  requireAuth, requireRole("admin", "manager"),
  celebrate({ [Segments.PARAMS]: idParam, [Segments.BODY]: tableUpdate }),
  async (req, res, next) => {
    try {
      const row = await Table.findByPk(req.params.id);
      if (!row) return res.status(404).json({ error: "Mesa no encontrada" });
      await row.update(req.body);
      res.json(row);
    } catch (e) { next(e); }
  }
);

/* ===================== ÓRDENES ===================== */
// devolvemos órdenes "activas" (cobrables): open/ready/delivered
router.get("/orders/open", requireAuth, async (_req, res, next) => {
  try {
    const rows = await Order.findAll({
      where: { status: { [Op.in]: ["open", "ready", "delivered"] } },
      include: [Table]
    });
    res.json(rows);
  } catch (e) {
    next(e);
    console.log("Error", e)
  }

});

router.get("/orders/:id", requireAuth, async (req, res, next) => {
  try {
    const o = await Order.findByPk(req.params.id, {
      include: [
        { model: Table },
        { model: OrderItem }
      ]
    });
    if (!o) return res.status(404).json({ error: "Orden no encontrada" });
    res.json(o);
  } catch (e) { next(e); }
});

/* Abrir mesa => crea orden "open" */
router.post(
  "/tables/:id/open",
  requireAuth,
  celebrate({ [Segments.PARAMS]: idParam, [Segments.BODY]: openTableBody }),
  async (req, res, next) => {
    try {
      const table = await Table.findByPk(req.params.id);
      if (!table) return res.status(404).json({ error: "Mesa no encontrada" });

      const open = await Order.findOne({ where: { table_id: table.id, status: "open" } });
      if (open) return res.status(409).json({ error: "La mesa ya tiene una orden abierta", order_id: open.id });

      const order = await Order.create({
        table_id: table.id,
        waiter_id: req.user?.sub || null,
        guests: req.body.guests || 1,
        notes: req.body.notes || null,
        status: "open"
      });

      await table.update({ status: "occupied" });
      res.status(201).json(order);
    } catch (e) { next(e); }
  }
);

/* Agregar ítems a una orden */
router.post(
  "/orders/:id/items",
  requireAuth,
  celebrate({ [Segments.PARAMS]: idParam, [Segments.BODY]: orderItemsBodyV2 }),
  async (req, res, next) => {
    const t = await Order.sequelize.transaction();
    try {
      const order = await Order.findByPk(req.params.id, { transaction: t });
      if (!order || ["closed", "void"].includes(order.status)) {
        await t.rollback();
        return res.status(400).json({ error: "Orden cerrada/anulada" });
      }
      const out = [];

      for (const incoming of req.body.items) {
        if (incoming.product_id) {
          // --- Modo catálogo ---
          const prod = await Product.findByPk(incoming.product_id, {
            include: [{ model: ModifierGroup, include: [ModifierOption] }],
            transaction: t
          });
          if (!prod || !prod.is_active) {
            await t.rollback();
            return res.status(400).json({ error: `Producto inválido o inactivo: ${incoming.product_id}` });
          }

          const validOptionIds = new Set(
            (prod.ModifierGroups || []).flatMap(g => (g.ModifierOptions || []).map(o => o.id))
          );
          const selectedIds = (incoming.option_ids || []).filter(id => validOptionIds.has(id));

          const optionsRows = selectedIds.length
            ? await ModifierOption.findAll({ where: { id: selectedIds }, transaction: t })
            : [];

          const delta = optionsRows.reduce((acc, o) => acc + Number(o.price_delta), 0);
          const unitPrice = Number(prod.price) + delta;

          const modifiers_json = {
            groups: (prod.ModifierGroups || []).map(g => ({
              id: g.id,
              name: g.name,
              selected: (g.ModifierOptions || [])
                .filter(o => selectedIds.includes(o.id))
                .map(o => ({ id: o.id, name: o.name, price_delta: o.price_delta }))
            }))
          };

          // 👇 ahora guardamos product_id
          const row = await OrderItem.create(
            {
              order_id: order.id,
              product_id: prod.id,
              item_name: prod.name,
              quantity: incoming.quantity,
              unit_price: unitPrice.toFixed(2),
              notes: incoming.notes || null,
              station: prod.station || null,
              modifiers_json,
              status: "pending"               // 👈 asegurar estado inicial
            },
            { transaction: t }
          );
          out.push(row);

          await audit({
            user_id: req.user?.sub || null,
            action: "ORDER_ITEM_ADD",
            entity: "OrderItem",
            entity_id: row.id,
            meta: { order_id: order.id, product_id: prod.id, source: "catalog", quantity: incoming.quantity, unit_price: unitPrice }
          }, t);

          await deductForProductSale({
            product_id: prod.id,
            units: incoming.quantity,
            order_id: order.id,
            user_id: req.user?.sub || null
          }, t);
        } else {
          // --- Modo manual (compat) ---
          const row = await OrderItem.create(
            {
              order_id: order.id,
              item_name: incoming.item_name,
              quantity: incoming.quantity,
              unit_price: Number(incoming.unit_price).toFixed(2),
              notes: incoming.notes || null,
              station: incoming.station || null,
              modifiers_json: incoming.modifiers_json || null,
              cost_override: incoming.cost_override ?? null,
              status: "pending"               // 👈
            },
            { transaction: t }
          );
          out.push(row);

          await audit({
            user_id: req.user?.sub || null,
            action: "ORDER_ITEM_ADD",
            entity: "OrderItem",
            entity_id: row.id,
            meta: { order_id: order.id, source: "manual", quantity: incoming.quantity, unit_price: Number(incoming.unit_price) }
          }, t);
        }
      }

      // Recalcular totales
      const itemsAll = await OrderItem.findAll({ where: { order_id: order.id }, transaction: t });
      const subtotal = itemsAll.reduce((acc, r) => acc + (Number(r.unit_price) * r.quantity), 0);
      const grand = subtotal - Number(order.discount_total) + Number(order.service_total);

      await order.update(
        { subtotal: subtotal.toFixed(2), grand_total: Math.max(0, grand).toFixed(2) },
        { transaction: t }
      );

      await t.commit();
      res.status(201).json({ added: out.length, items: out, order_totals: { subtotal: order.subtotal, grand_total: order.grand_total } });
    } catch (e) {
      await t.rollback();
      next(e);
    }
  }
);

/* Transferir orden abierta de una mesa a otra */
router.post(
  "/tables/:sourceId/transfer",
  requireAuth, requireRole("admin", "manager"),
  celebrate({ [Segments.PARAMS]: Joi.object({ sourceId: Joi.number().integer().required() }), [Segments.BODY]: transferBody }),
  async (req, res, next) => {
    try {
      const sourceTable = await Table.findByPk(req.params.sourceId);
      const targetTable = await Table.findByPk(req.body.target_table_id);
      if (!sourceTable || !targetTable) return res.status(404).json({ error: "Mesa origen/destino no encontrada" });

      const order = await Order.findOne({ where: { table_id: sourceTable.id, status: "open" } });
      if (!order) return res.status(409).json({ error: "No hay orden abierta en mesa origen" });

      const targetOpen = await Order.findOne({ where: { table_id: targetTable.id, status: "open" } });
      if (targetOpen) return res.status(409).json({ error: "La mesa destino ya tiene orden abierta" });

      await order.update({ table_id: targetTable.id });
      await sourceTable.update({ status: "free" });
      await targetTable.update({ status: "occupied" });

      await TransferLog.create({
        action: "transfer_order",
        source_table_id: sourceTable.id,
        target_table_id: targetTable.id,
        source_order_id: order.id,
        performed_by: req.user?.sub || null
      });

      await audit({
        user_id: req.user?.sub || null,
        action: "ORDER_TRANSFER",
        entity: "Order",
        entity_id: order.id,
        meta: { from_table: sourceTable.id, to_table: targetTable.id }
      });

      res.json({ ok: true, order_id: order.id });
    } catch (e) { next(e); }
  }
);

/* Unir órdenes (merge) */
router.post(
  "/orders/join",
  requireAuth, requireRole("admin", "manager"),
  celebrate({ [Segments.BODY]: joinOrdersBody }),
  async (req, res, next) => {
    try {
      const { source_order_id, target_order_id } = req.body;
      if (source_order_id === target_order_id) return res.status(400).json({ error: "Órdenes iguales" });

      const src = await Order.findByPk(source_order_id);
      const tgt = await Order.findByPk(target_order_id);
      if (!src || !tgt) return res.status(404).json({ error: "Orden source/target no encontrada" });
      if (src.status !== "open" || tgt.status !== "open") return res.status(400).json({ error: "Ambas órdenes deben estar abiertas" });

      await OrderItem.update({ order_id: tgt.id }, { where: { order_id: src.id } });
      await src.update({ status: "closed", closed_at: new Date(), notes: `[JOIN->${tgt.id}] ${src.notes || ""}` });

      await audit({
        user_id: req.user?.sub || null,
        action: "ORDER_JOIN",
        entity: "Order",
        entity_id: tgt.id,
        meta: { source_order_id: src.id, target_order_id: tgt.id }
      });

      await TransferLog.create({
        action: "join_orders",
        source_order_id: src.id,
        target_order_id: tgt.id,
        performed_by: req.user?.sub || null
      });

      res.json({ ok: true, target_order_id: tgt.id });
    } catch (e) { next(e); }
  }
);

/* Cerrar orden */
router.post(
  "/orders/:id/close",
  requireAuth, requireRole("admin", "manager", "cashier"),
  celebrate({ [Segments.PARAMS]: idParam, [Segments.BODY]: closeOrderBody }),
  async (req, res, next) => {
    const t = await Order.sequelize.transaction();
    try {
      const order = await Order.findByPk(req.params.id, { include: [Table, OrderItem], transaction: t });
      if (!order) { await t.rollback(); return res.status(404).json({ error: "Orden no encontrada" }); }
      if (order.status === "closed") { await t.rollback(); return res.status(409).json({ error: "La orden ya está cerrada" }); }

      const hayPendientes = order.OrderItems.some(i => !["delivered", "void"].includes(i.status));
      if (hayPendientes) { await t.rollback(); return res.status(400).json({ error: "Hay ítems pendientes/en cocina" }); }

      const service_total = req.body?.service_total ?? order.service_total ?? 0;
      const discount_total = req.body?.discount_total ?? order.discount_total ?? 0;
      const subtotal = order.OrderItems.reduce((acc, r) => acc + Number(r.unit_price) * r.quantity, 0);
      const grand = Math.max(0, subtotal - Number(discount_total) + Number(service_total));

      const again = await OrderItem.findAll({ where: { order_id: order.id }, transaction: t });
      const invalid = again.some(i => !["delivered", "void"].includes(i.status));
      if (invalid) { await t.rollback(); return res.status(400).json({ error: "Hay ítems no entregados" }); }

      await order.update({
        subtotal: subtotal.toFixed(2),
        service_total: Number(service_total).toFixed(2),
        discount_total: Number(discount_total).toFixed(2),
        grand_total: grand.toFixed(2),
        status: "closed",
        closed_at: new Date()
      }, { transaction: t });

      await audit({
        user_id: req.user?.sub || null,
        action: "ORDER_CLOSE",
        entity: "Order",
        entity_id: order.id,
        meta: {
          subtotal: order.subtotal,
          discount_total: order.discount_total,
          service_total: order.service_total,
          grand_total: order.grand_total
        }
      });

      const table = order.Table || await Table.findByPk(order.table_id, { transaction: t });
      const otraAbierta = await Order.count({ where: { table_id: order.table_id, status: "open" }, transaction: t });
      if (table && otraAbierta === 0) await table.update({ status: "free" }, { transaction: t });

      await t.commit();
      res.json({ ok: true, order_id: order.id, grand_total: order.grand_total });
    } catch (e) { await t.rollback(); next(e); }
  }
);

/* Plano del área */
router.get("/areas/:id/floor", requireAuth, async (req, res, next) => {
  try {
    const tables = await Table.findAll({ where: { area_id: req.params.id }, order: [["label", "ASC"]] });
    res.json(tables);
  } catch (e) { next(e); }
});

/* Guardar layout de UNA mesa */
router.patch(
  "/tables/:id/layout",
  requireAuth, requireRole("admin", "manager"),
  celebrate({
    [Segments.BODY]: Joi.object({
      layout_x: Joi.number().min(0).required(),
      layout_y: Joi.number().min(0).required(),
      layout_w: Joi.number().min(32).max(640).required(),
      layout_h: Joi.number().min(32).max(640).required(),
      layout_rot: Joi.number().min(0).max(359).required(),
      layout_shape: Joi.string().valid("circle", "rect").required()
    })
  }),
  async (req, res, next) => {
    try {
      const t = await Table.findByPk(req.params.id);
      if (!t) return res.status(404).json({ error: "Mesa no encontrada" });
      await t.update(req.body);
      res.json(t);
    } catch (e) { next(e); }
  }
);

/* Guardado masivo del plano */
router.post("/areas/:id/floor/bulk",
  requireAuth, requireRole("admin", "manager"),
  async (req, res, next) => {
    try {
      const updates = req.body || [];
      const t = await Table.sequelize.transaction();
      try {
        for (const u of updates) {
          await Table.update({
            layout_x: u.layout_x, layout_y: u.layout_y, layout_w: u.layout_w,
            layout_h: u.layout_h, layout_rot: u.layout_rot, layout_shape: u.layout_shape
          }, { where: { id: u.id, area_id: req.params.id }, transaction: t });
        }
        await t.commit();
        res.json({ ok: true, count: updates.length });
      } catch (e) { await t.rollback(); throw e; }
    } catch (e) { next(e); }
  }
);

/* Liberar mesa (sin consumo) */
router.post(
  "/tables/:id/free",
  requireAuth, requireRole("admin", "manager", "cashier"),
  celebrate({
    [Segments.PARAMS]: Joi.object({ id: Joi.number().integer().required() }),
    [Segments.BODY]: Joi.object({ reason: Joi.string().max(200).default("no_show") })
  }),
  async (req, res, next) => {
    try {
      const table = await Table.findByPk(req.params.id);
      if (!table) return res.status(404).json({ error: "Mesa no encontrada" });

      const order = await Order.findOne({ where: { table_id: table.id, status: "open" } });
      if (!order) {
        await table.update({ status: "free" });
        return res.json({ ok: true, freed: true, note: "no_open_order" });
      }

      let itemsCount = 0, paymentsCount = 0;
      try { itemsCount = await OrderItem.count({ where: { order_id: order.id } }); } catch { }
      try { paymentsCount = await Payment.count({ where: { order_id: order.id } }); } catch { }

      if (itemsCount > 0 || paymentsCount > 0) {
        return res.status(409).json({ error: "Orden con consumo/pagos", order_id: order.id, itemsCount, paymentsCount });
      }

      await order.update({
        status: "void",
        closed_at: new Date(),
        notes: `[VOID_EMPTY:${req.body.reason}] ${order.notes || ""}`
      });
      await table.update({ status: "free" });

      await audit({
        user_id: req.user?.sub || null,
        action: "ORDER_VOID_EMPTY",
        entity: "Order",
        entity_id: order.id,
        meta: { table_id: table.id, reason: req.body.reason }
      });

      res.json({ ok: true, freed: true, order_id: order.id });
    } catch (e) {
      console.error("FREE_TABLE_ERROR", { message: e.message, stack: e.stack, table_id: req.params?.id });
      next(e);
    }
  }
);

// PATCH: editar renglón del ticket (cantidad / notas / status)
router.patch(
  "/orders/items/:itemId",
  requireAuth,
  celebrate({ [Segments.PARAMS]: itemIdParam, [Segments.BODY]: patchItemBody }),
  async (req, res, next) => {
    const t = await Order.sequelize.transaction();
    try {
      const it = await OrderItem.findByPk(req.params.itemId, { transaction: t });
      if (!it) { await t.rollback(); return res.status(404).json({ error: "Ítem no encontrado" }); }

      const order = await Order.findByPk(it.order_id, { transaction: t });
      if (!order || order.status !== "open") {
        await t.rollback(); return res.status(409).json({ error: "La orden no está abierta" });
      }

      // ⬇️ BLOQUE NUEVO: solo se puede editar cantidad si aún no fue enviado a cocina
      const safeIsNew = (s) => !s || s === "new" || s === "pending";
      if (Object.prototype.hasOwnProperty.call(req.body, "quantity")) {
        if (!safeIsNew(it.status)) {
          await t.rollback();
          return res.status(409).json({ error: "Solo se puede editar antes de enviar a cocina" });
        }
      }

      const prevQty = it.quantity;
      const next = {};
      if (typeof req.body.quantity === "number" && req.body.quantity > 0) next.quantity = req.body.quantity;
      if (typeof req.body.notes === "string") next.notes = req.body.notes;
      if (typeof req.body.status === "string") next.status = req.body.status;

      await it.update(next, { transaction: t });
      // Ajuste inventario si cambió cantidad y el ítem proviene de catálogo
      const delta = (next.quantity ?? prevQty) - prevQty;
      try {
        if (it.product_id && delta !== 0) {
          if (delta > 0) {
            await deductForProductSale({
              product_id: it.product_id,
              units: delta,
              order_id: order.id,
              user_id: req.user?.sub || null
            }, t);
          } else {
            // si tenés un servicio de “restock” por renglón, lo usamos:
            const inv = await import("../services/inventory.service.js");
            if (typeof inv.restockForItem === "function") {
              await inv.restockForItem({
                product_id: it.product_id,
                units: Math.abs(delta),     // devolvemos stock
                order_id: order.id,
                user_id: req.user?.sub || null
              }, t);
            }
          }
        }
      } catch { /* si no existe el servicio, seguimos */ }

      // Recalcular totales
      const itemsAll = await OrderItem.findAll({ where: { order_id: order.id }, transaction: t });
      const subtotal = itemsAll.reduce((a, r) => a + Number(r.unit_price) * r.quantity, 0);
      const grand = Math.max(0, subtotal - Number(order.discount_total) + Number(order.service_total));
      await order.update({ subtotal: subtotal.toFixed(2), grand_total: grand.toFixed(2) }, { transaction: t });

      // Auditoría
      await audit({
        user_id: req.user?.sub || null,
        action: "ORDER_ITEM_PATCH",
        entity: "OrderItem",
        entity_id: it.id,
        meta: { order_id: order.id, changes: next, prev_quantity: prevQty }
      }, t);

      await t.commit();
      res.json({ ok: true, item: it, order_totals: { subtotal: order.subtotal, grand_total: order.grand_total } });
    } catch (e) { await t.rollback(); next(e); }
  }
);

// DELETE: eliminar renglón del ticket
router.delete(
  "/orders/items/:itemId",
  requireAuth,
  celebrate({ [Segments.PARAMS]: itemIdParam }),
  async (req, res, next) => {
    const t = await Order.sequelize.transaction();
    try {
      const it = await OrderItem.findByPk(req.params.itemId, { transaction: t });
      if (!it) { await t.rollback(); return res.status(404).json({ error: "Ítem no encontrado" }); }

      const order = await Order.findByPk(it.order_id, { transaction: t });
      if (!order || order.status !== "open") {
        await t.rollback(); return res.status(409).json({ error: "La orden no está abierta" });
      }

      // Restock si aplica (ítem de catálogo)
      try {
        if (it.product_id && it.quantity > 0) {
          const inv = await import("../services/inventory.service.js");
          if (typeof inv.restockForItem === "function") {
            await inv.restockForItem({
              product_id: it.product_id,
              units: it.quantity,
              order_id: order.id,
              user_id: req.user?.sub || null
            }, t);
          }
        }
      } catch { /* opcional */ }

      await it.destroy({ transaction: t });

      // Recalcular totales
      const itemsAll = await OrderItem.findAll({ where: { order_id: order.id }, transaction: t });
      const subtotal = itemsAll.reduce((a, r) => a + Number(r.unit_price) * r.quantity, 0);
      const grand = Math.max(0, subtotal - Number(order.discount_total) + Number(order.service_total));
      await order.update({ subtotal: subtotal.toFixed(2), grand_total: grand.toFixed(2) }, { transaction: t });

      await audit({
        user_id: req.user?.sub || null,
        action: "ORDER_ITEM_DELETE",
        entity: "OrderItem",
        entity_id: Number(req.params.itemId),
        meta: { order_id: order.id }
      }, t);

      await t.commit();
      res.json({ ok: true, order_totals: { subtotal: order.subtotal, grand_total: order.grand_total } });
    } catch (e) { await t.rollback(); next(e); }
  }
);


// DELETE mesa (solo libre)
router.delete(
  "/tables/:id",
  requireAuth, requireRole("admin", "manager"),
  celebrate({ [Segments.PARAMS]: idParam }),
  async (req, res, next) => {
    try {
      const row = await Table.findByPk(req.params.id);
      if (!row) return res.status(404).json({ error: "Mesa no encontrada" });
      if (row.status !== "free") return res.status(409).json({ error: "No se puede borrar una mesa ocupada" });
      await row.destroy();
      res.json({ ok: true });
    } catch (e) { next(e); }
  }
);

// Alias POST para borrar (útil si DELETE te da problemas)
router.post(
  "/tables/:id/delete",
  requireAuth, requireRole("admin", "manager"),
  celebrate({ [Segments.PARAMS]: idParam }),
  async (req, res, next) => {
    try {
      const row = await Table.findByPk(req.params.id);
      if (!row) return res.status(404).json({ error: "Mesa no encontrada" });
      if (row.status !== "free") return res.status(409).json({ error: "No se puede borrar una mesa ocupada" });
      await row.destroy();
      res.json({ ok: true });
    } catch (e) { next(e); }
  }
);


// Anular orden (sin pagos) y liberar mesa
router.post(
  "/orders/:id/void",
  requireAuth, requireRole("admin", "manager", "cashier"),
  async (req, res, next) => {
    const t = await Order.sequelize.transaction();
    try {
      const order = await Order.findByPk(req.params.id, { include: [Table], transaction: t });
      if (!order) { await t.rollback(); return res.status(404).json({ error: "Orden no encontrada" }); }
      if (order.status === "void") { await t.rollback(); return res.status(409).json({ error: "La orden ya fue anulada" }); }

      // No permitir anular si tiene pagos
      const paymentsCount = await Payment.count({ where: { order_id: order.id }, transaction: t });
      if (paymentsCount > 0) {
        await t.rollback();
        return res.status(409).json({ error: "Orden con pagos", paymentsCount });
      }

      // (opcional) revertir stock si llevás inventario por renglón
      await OrderItem.destroy({ where: { order_id: order.id }, transaction: t });

      await order.update({
        status: "void",
        closed_at: new Date(),
        subtotal: "0.00",
        discount_total: "0.00",
        service_total: "0.00",
        grand_total: "0.00",
        notes: `[VOID:${req.body?.reason || "customer_left"}] ${order.notes || ""}`
      }, { transaction: t });

      if (order.Table) await order.Table.update({ status: "free" }, { transaction: t });

      await audit({
        user_id: req.user?.sub || null,
        action: "ORDER_VOID",
        entity: "Order",
        entity_id: order.id,
        meta: { reason: req.body?.reason || "customer_left" }
      }, t);

      await t.commit();
      res.json({ ok: true, order_id: order.id });
    } catch (e) {
      await t.rollback();
      next(e);
    }
  }
);

// POST /salon/orders/:id/fire
router.post("/orders/:id/fire", requireAuth, async (req, res, next) => {
  try {
    const order = await Order.findByPk(req.params.id, { include: [OrderItem, Table] });
    if (!order) return res.status(404).json({ error: "Orden no encontrada" });
    if (order.status !== "open") return res.status(409).json({ error: "Orden no abierta" });

    const now = new Date();

    // 👇 new + pending + null → queued
    const [count] = await OrderItem.update(
      { status: "queued", fired_at: now },
      {
        where: {
          order_id: order.id,
          [Op.or]: [{ status: null }, { status: "new" }, { status: "pending" }]
        }
      }
    );

    res.json({ ok: true, queued: count });
  } catch (e) { next(e); }
});


export default router;
