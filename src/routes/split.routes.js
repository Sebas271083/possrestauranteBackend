import express from "express";
import { celebrate, Segments } from "celebrate";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { splitBody } from "../schemas/split.schemas.js";
import { Order, OrderItem, Table } from "../models/index.js";
import { audit } from "../services/audit.service.js";

const router = express.Router();

async function recalcOrder(orderId, t) {
  const items = await OrderItem.findAll({ where: { order_id: orderId }, transaction: t });
  const subtotal = items.reduce((a, i) => a + Number(i.unit_price) * i.quantity, 0);
  const order = await Order.findByPk(orderId, { transaction: t });
  const grand = subtotal - Number(order.discount_total) + Number(order.service_total);
  await order.update({
    subtotal: subtotal.toFixed(2),
    grand_total: Math.max(0, grand).toFixed(2)
  }, { transaction: t });
}

router.post(
  "/orders/split",
  requireAuth, requireRole("admin", "manager", "cashier"),
  celebrate({ [Segments.BODY]: splitBody }),
  async (req, res, next) => {
    const t = await Order.sequelize.transaction();
    try {
      const { source_order_id, target_table_id, move, notes } = req.body;

      const src = await Order.findByPk(source_order_id, { include: [Table], transaction: t });
      if (!src || src.status !== "open") { await t.rollback(); return res.status(400).json({ error: "Orden origen no abierta" }); }

      // Mesa destino: misma que la fuente por defecto
      let targetTableId = target_table_id || src.table_id;
      const targetTable = await Table.findByPk(targetTableId, { transaction: t });
      if (!targetTable) { await t.rollback(); return res.status(404).json({ error: "Mesa destino no encontrada" }); }

      // Crear orden destino abierta
      const tgt = await Order.create({
        table_id: targetTableId,
        waiter_id: src.waiter_id,
        guests: src.guests,
        status: "open",
        notes: notes || `[SPLIT de orden ${src.id}]`
      }, { transaction: t });

      await audit({
        user_id: req.user?.sub || null,
        action: "ORDER_SPLIT",
        entity: "Order",
        entity_id: tgt.id,
        meta: { source_order_id: src.id, target_order_id: tgt.id, moved: move }
      }, t);

      // Procesar movimientos
      for (const { item_id, quantity } of move) {
        const it = await OrderItem.findByPk(item_id, { transaction: t });
        if (!it || it.order_id !== src.id) { await t.rollback(); return res.status(400).json({ error: `Ítem inválido: ${item_id}` }); }
        if (quantity > it.quantity) { await t.rollback(); return res.status(400).json({ error: `Cantidad a mover mayor que la disponible en ítem ${item_id}` }); }

        if (quantity === it.quantity) {
          // mover entero
          await it.update({ order_id: tgt.id }, { transaction: t });
        } else {
          // partir: restar al original y crear copia
          await it.update({ quantity: it.quantity - quantity }, { transaction: t });
          await OrderItem.create({
            order_id: tgt.id,
            item_name: it.item_name,
            quantity,
            unit_price: it.unit_price,
            notes: it.notes,
            station: it.station,
            status: it.status, // conservamos estado
            modifiers_json: it.modifiers_json
          }, { transaction: t });
        }
      }

      // Recalcular totales
      await recalcOrder(src.id, t);
      await recalcOrder(tgt.id, t);

      // Estados de mesas
      await targetTable.update({ status: "occupied" }, { transaction: t }); // asegura ocupada
      // si la src quedó sin items, se podría liberar mesa (opcional):
      const remaining = await OrderItem.count({ where: { order_id: src.id }, transaction: t });
      if (remaining === 0) {
        await src.update({ notes: `[SPLIT salida → ${tgt.id}] ${src.notes || ""}` }, { transaction: t });
      }

      await t.commit();
      res.status(201).json({ ok: true, source_order_id: src.id, target_order_id: tgt.id });
    } catch (e) {
      await t.rollback();
      next(e);
    }
  }
);

export default router;
