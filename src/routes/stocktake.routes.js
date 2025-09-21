import express from "express";
import { celebrate, Segments } from "celebrate";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { StockCount, StockCountItem, Ingredient, StockMovement } from "../models/index.js";
import { stockCountCreate, stockCountSubmit } from "../schemas/stocktake.schemas.js";
import { audit } from "../services/audit.service.js";

const router = express.Router();

// Crear sesión de conteo con items
router.post("/stocktake",
  requireAuth, requireRole("admin","manager"),
  celebrate({ [Segments.BODY]: stockCountCreate }),
  async (req,res,next)=> {
    const t = await StockCount.sequelize.transaction();
    try {
      const sc = await StockCount.create({ name: req.body.name, notes: req.body.notes || null }, { transaction: t });
      for (const it of req.body.items) {
        await StockCountItem.create({ stock_count_id: sc.id, ingredient_id: it.ingredient_id, counted_qty: it.counted_qty }, { transaction: t });
      }
      await audit({ user_id: req.user?.sub || null, action:"STOCKTAKE_CREATE", entity:"StockCount", entity_id: sc.id, meta: { items: req.body.items.length } }, t);
      await t.commit();
      res.status(201).json({ id: sc.id });
    } catch(e){ await t.rollback(); next(e); }
  }
);

// Enviar conteo → genera ajustes por diferencias y cierra
router.post("/stocktake/:id/submit",
  requireAuth, requireRole("admin","manager"),
  celebrate({ [Segments.BODY]: stockCountSubmit }),
  async (req,res,next)=> {
    const t = await StockCount.sequelize.transaction();
    try {
      const sc = await StockCount.findByPk(req.params.id, { include:[StockCountItem], transaction: t });
      if (!sc) { await t.rollback(); return res.status(404).json({ error:"Stocktake no encontrado" }); }
      if (sc.status !== "open") { await t.rollback(); return res.status(400).json({ error:"Stocktake no está open" }); }

      // Actualizar items con lo enviado (si cambió algo)
      const map = new Map(sc.StockCountItems.map(i => [i.ingredient_id, i]));
      for (const it of req.body.items) {
        const row = map.get(it.ingredient_id);
        if (row) await row.update({ counted_qty: it.counted_qty }, { transaction: t });
        else await StockCountItem.create({ stock_count_id: sc.id, ingredient_id: it.ingredient_id, counted_qty: it.counted_qty }, { transaction: t });
      }

      // Generar ajustes por diferencia = counted - system
      const itemsAll = await StockCountItem.findAll({ where: { stock_count_id: sc.id }, include:[Ingredient], transaction: t });
      const adjustments = [];
      for (const it of itemsAll) {
        const ing = it.Ingredient;
        const diff = Number(it.counted_qty) - Number(ing.stock_qty);
        if (Math.abs(diff) >= 0.001) {
          // actualizar stock del ingrediente
          await ing.update({ stock_qty: (Number(ing.stock_qty) + diff).toFixed(3) }, { transaction: t });
          // movimiento de ajuste (+ o -)
          const mov = await StockMovement.create({
            ingredient_id: ing.id,
            type: "adjustment",
            qty: diff,
            unit_cost: Number(ing.cost_per_unit),
            ref: `STOCKTAKE#${sc.id}`,
            meta: { before: Number(ing.stock_qty) - diff, after: ing.stock_qty, counted: it.counted_qty },
            created_by: req.user.sub
          }, { transaction: t });
          adjustments.push({ ingredient_id: ing.id, diff: Number(diff.toFixed(3)), movement_id: mov.id });
        }
      }

      await sc.update({ status: "adjusted", notes: req.body.notes || sc.notes }, { transaction: t });
      await audit({ user_id: req.user?.sub || null, action:"STOCKTAKE_SUBMIT", entity:"StockCount", entity_id: sc.id, meta: { adjustments } }, t);

      await t.commit();
      res.json({ ok:true, adjustments });
    } catch(e){ await t.rollback(); next(e); }
  }
);

export default router;
