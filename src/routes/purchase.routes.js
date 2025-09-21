import express from "express";
import { celebrate, Segments } from "celebrate";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { Supplier, Ingredient, PurchaseOrder, PurchaseOrderItem, StockMovement } from "../models/index.js";
import { supplierCreate, supplierUpdate, poCreate, poStatusBody, poReceiveBody } from "../schemas/purchase.schemas.js";
import { audit } from "../services/audit.service.js";

const router = express.Router();

/* ===== Proveedores ===== */
router.get("/suppliers", requireAuth, async (_req,res,next)=> {
  try { res.json(await Supplier.findAll({ order:[["name","ASC"]] })); } catch(e){ next(e); }
});

router.post("/suppliers",
  requireAuth, requireRole("admin","manager"),
  celebrate({ [Segments.BODY]: supplierCreate }),
  async (req,res,next)=> {
    try {
      const row = await Supplier.create(req.body);
      await audit({ user_id: req.user?.sub || null, action:"SUPPLIER_CREATE", entity:"Supplier", entity_id: row.id, meta: row });
      res.status(201).json(row);
    } catch(e){ next(e); }
  }
);

router.patch("/suppliers/:id",
  requireAuth, requireRole("admin","manager"),
  celebrate({ [Segments.BODY]: supplierUpdate }),
  async (req,res,next)=> {
    try {
      const row = await Supplier.findByPk(req.params.id);
      if (!row) return res.status(404).json({ error:"Proveedor no encontrado" });
      await row.update(req.body);
      res.json(row);
    } catch(e){ next(e); }
  }
);

/* ===== Órdenes de Compra ===== */
router.post("/purchase-orders",
  requireAuth, requireRole("admin","manager"),
  celebrate({ [Segments.BODY]: poCreate }),
  async (req,res,next)=> {
    const t = await PurchaseOrder.sequelize.transaction();
    try {
      const { supplier_id, ref_number, notes, items } = req.body;
      const po = await PurchaseOrder.create({ supplier_id, ref_number, notes, status: "draft" }, { transaction: t });
      let total = 0;
      for (const it of items) {
        total += Number(it.qty) * Number(it.unit_cost);
        await PurchaseOrderItem.create({ purchase_order_id: po.id, ...it }, { transaction: t });
      }
      await po.update({ total_estimated: total.toFixed(2) }, { transaction: t });
      await audit({ user_id: req.user?.sub || null, action:"PO_CREATE", entity:"PurchaseOrder", entity_id: po.id, meta:{ total_estimated: total } }, t);
      await t.commit();
      res.status(201).json({ id: po.id });
    } catch(e){ await t.rollback(); next(e); }
  }
);

router.patch("/purchase-orders/:id/status",
  requireAuth, requireRole("admin","manager"),
  celebrate({ [Segments.BODY]: poStatusBody }),
  async (req,res,next)=> {
    try {
      const po = await PurchaseOrder.findByPk(req.params.id);
      if (!po) return res.status(404).json({ error:"OC no encontrada" });
      if (po.status === "received") return res.status(409).json({ error:"OC ya recibida" });
      await po.update({ status: req.body.status });
      res.json(po);
    } catch(e){ next(e); }
  }
);

/* ===== Recepción de OC → entra stock ===== */
router.post("/purchase-orders/:id/receive",
  requireAuth, requireRole("admin","manager"),
  celebrate({ [Segments.BODY]: poReceiveBody }),
  async (req,res,next)=> {
    const t = await PurchaseOrder.sequelize.transaction();
    try {
      const po = await PurchaseOrder.findByPk(req.params.id, { include:[PurchaseOrderItem], transaction: t });
      if (!po) { await t.rollback(); return res.status(404).json({ error:"OC no encontrada" }); }
      if (po.status === "cancelled") { await t.rollback(); return res.status(400).json({ error:"OC cancelada" }); }

      let receivedSomething = false;
      for (const r of req.body.items) {
        const item = po.PurchaseOrderItems.find(x => x.id === r.item_id);
        if (!item) { await t.rollback(); return res.status(400).json({ error:`Item no pertenece a la OC: ${r.item_id}` }); }

        const addQty = Number(r.received_qty);
        if (addQty <= 0) continue;

        // Actualizar received_qty + (opcional) unit_cost real
        const finalUnitCost = r.unit_cost != null ? Number(r.unit_cost) : Number(item.unit_cost);
        await item.update({
          received_qty: (Number(item.received_qty) + addQty).toFixed(3),
          unit_cost: finalUnitCost
        }, { transaction: t });

        // Aumentar stock del ingrediente y actualizar costo
        const ing = await Ingredient.findByPk(item.ingredient_id, { transaction: t });
        await ing.update({
          stock_qty: (Number(ing.stock_qty) + addQty).toFixed(3),
          cost_per_unit: finalUnitCost
        }, { transaction: t });

        // Registrar movimiento de compra
        await StockMovement.create({
          ingredient_id: ing.id,
          type: "purchase",
          qty: addQty,
          unit_cost: finalUnitCost,
          ref: req.body.ref_invoice || `PO#${po.id}`,
          meta: { po_id: po.id, po_item_id: item.id, notes: req.body.notes || null },
          created_by: req.user.sub
        }, { transaction: t });

        receivedSomething = true;
      }

      // Estado de la OC
      const items = await PurchaseOrderItem.findAll({ where: { purchase_order_id: po.id }, transaction: t });
      const allReceived = items.every(it => Number(it.received_qty) >= Number(it.qty) - 0.0001);
      const someReceived = items.some(it => Number(it.received_qty) > 0);

      await po.update({ status: allReceived ? "received" : (someReceived ? "partially_received" : po.status) }, { transaction: t });

      await audit({ user_id: req.user?.sub || null, action:"PO_RECEIVE", entity:"PurchaseOrder", entity_id: po.id, meta:{ ref_invoice: req.body.ref_invoice } }, t);

      await t.commit();
      res.status(201).json({ ok:true, status: po.status });
    } catch(e){ await t.rollback(); next(e); }
  }
);

export default router;
