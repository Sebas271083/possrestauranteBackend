import express from "express";
import { celebrate, Segments } from "celebrate";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { Ingredient, Product, ProductIngredient, StockMovement } from "../models/index.js";
import { ingredientCreate, ingredientUpdate, idParam, recipeSetBody, purchaseBody, adjustBody, countBody } from "../schemas/inventory.schemas.js";
import { UOMS } from "../lib/units.js";
import { parseLocaleNumber } from "../lib/numbers.js";

const router = express.Router();

// factor para pasar de una uom -> base (ej: kg -> g = 1000)
function factorToBase(uom, base) {
  const u = String(uom || base || "unidad").toLowerCase();
  const k = UOMS[u];
  if (!k || k.base !== base) return 1;
  return u === base ? 1 : k.factor;
}
function toBaseQty(qty, uom, base) {
  return (Number(qty) || 0) * factorToBase(uom, base);
}
function costToBaseUnit(unitCost, costUom, base) {
  return (Number(unitCost) || 0) / factorToBase(costUom, base);
}

// --------- INGREDIENTES ----------
router.get("/inventory/ingredients", requireAuth, async (_req, res, next) => {
  try { res.json(await Ingredient.findAll({ order: [["name", "ASC"]] })); } catch (e) { next(e); }
});

function getUserId(req) {
  return Number(req?.user?.sub ?? req?.user?.id ?? req?.user?.user_id ?? 0) || null;
}

router.post("/inventory/ingredients",
  requireAuth, requireRole("admin", "manager"),
  celebrate({ [Segments.BODY]: ingredientCreate }),
  async (req, res, next) => {
    try {
      const row = await Ingredient.create(req.body);
      res.status(201).json(row);
    } catch (e) { next(e); }
  }
);

router.patch("/inventory/ingredients/:id",
  requireAuth, requireRole("admin", "manager"),
  celebrate({ [Segments.PARAMS]: idParam, [Segments.BODY]: ingredientUpdate }),
  async (req, res, next) => {
    try {
      const row = await Ingredient.findByPk(req.params.id);
      if (!row) return res.status(404).json({ error: "Insumo no encontrado" });
      await row.update(req.body);
      res.json(row);
    } catch (e) { next(e); }
  }
);

// --------- RECETAS ----------
router.get("/inventory/products/:id/recipe",
  requireAuth,
  celebrate({ [Segments.PARAMS]: idParam }),
  async (req, res, next) => {
    try {
      const rows = await ProductIngredient.findAll({
        where: { product_id: req.params.id },
        include: [{ model: Product }, { model: Ingredient }]
      });
      res.json(rows);
    } catch (e) { next(e); }
  }
);

router.post("/inventory/products/:id/recipe",
  requireAuth, requireRole("admin", "manager"),
  celebrate({ [Segments.PARAMS]: idParam, [Segments.BODY]: recipeSetBody }),
  async (req, res, next) => {
    const t = await ProductIngredient.sequelize.transaction();
    try {
      const pid = Number(req.params.id);
      await ProductIngredient.destroy({ where: { product_id: pid }, transaction: t });
      for (const it of req.body.items) {
        await ProductIngredient.create({ product_id: pid, ...it }, { transaction: t });
      }
      await t.commit();
      res.json({ ok: true });
    } catch (e) { await t.rollback(); next(e); }
  }
);

// --------- MOVIMIENTOS ----------
router.get("/inventory/movements",
  requireAuth, requireRole("admin", "manager"),
  async (_req, res, next) => {
    try {
      const rows = await StockMovement.findAll({ order: [["created_at", "DESC"]], limit: 500 });
      res.json(rows);
    } catch (e) { next(e); }
  }
);


function parseAR(v) {
  if (typeof v === "number") return v;
  const s = String(v ?? "").trim();
  if (!s) return 0;
  if (s.includes(",")) return Number(s.replace(/\./g, "").replace(",", "."));
  return Number(s);
}
// Compra
router.post("/inventory/purchase",
  requireAuth, requireRole("admin", "manager"),
  celebrate({ [Segments.BODY]: purchaseBody }),
  async (req, res, next) => {
    const t = await StockMovement.sequelize.transaction();
    try {
      const createdBy = getUserId(req);
      if (!createdBy) { await t.rollback(); return res.status(401).json({ error: "No se pudo identificar el usuario (token sin sub/id)" }); }

      const { ingredient_id, qty, uom, unit_cost, cost_uom, ref, meta } = req.body;

      const ing = await Ingredient.findByPk(ingredient_id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!ing) { await t.rollback(); return res.status(404).json({ error: "Insumo no encontrado" }); }

      // ⬇️ convierte cantidades y costos a la unidad base del insumo
      const base = ing.unit; // "g" | "ml" | "unidad"
      const qtyBase = toBaseQty(parseAR(qty), (uom || base), base);
      const costBase = costToBaseUnit(parseAR(unit_cost), (cost_uom || (base === "g" ? "kg" : base === "ml" ? "l" : "unidad")), base);

      // actualiza stock y costo base
      await ing.update({
        stock_qty: (Number(ing.stock_qty) + qtyBase).toFixed(3),
        cost_per_unit: Number(costBase.toFixed(4)),
      }, { transaction: t });

      // crea movimiento en base
      const mov = await StockMovement.create({
        ingredient_id: ing.id,
        type: "purchase",
        qty: qtyBase,
        unit_cost: costBase,               // costo por unidad base
        ref: ref || null,
        meta: { ...(meta || {}), cost_uom: cost_uom || null }, // para mostrar en UI
        created_by: createdBy
      }, { transaction: t });

      await t.commit();
      res.status(201).json(mov);
    } catch (e) { await t.rollback(); next(e); }
  }
);
// Ajuste (+/-)
router.post("/inventory/adjust",
  requireAuth, requireRole("admin", "manager"),
  celebrate({ [Segments.BODY]: adjustBody }),
  async (req, res, next) => {
    const t = await StockMovement.sequelize.transaction();
    try {
      const createdBy = getUserId(req);
      if (!createdBy) { await t.rollback(); return res.status(401).json({ error: "No se pudo identificar el usuario" }); }
      const { ingredient_id } = req.body;
      const qtyRaw = parseAR(req.body.qty);
      const uom = (req.body.uom || "").toLowerCase();
      const ref = req.body.ref || null;
      const metaIn = req.body.meta || null;

      const ing = await Ingredient.findByPk(ingredient_id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!ing) { await t.rollback(); return res.status(404).json({ error: "Insumo no encontrado" }); }

      const base = ing.unit;
      const qtyBase = toBaseQty(qtyRaw, uom || base, base);
      const onHandAfter = Number(ing.stock_qty || 0) + qtyBase;

      await ing.update({ stock_qty: onHandAfter.toFixed(3) }, { transaction: t });

      const mov = await StockMovement.create({
        ingredient_id: ing.id,
        type: "adjustment",
        qty: qtyBase.toFixed(3),
        unit_cost: Number(ing.cost_per_unit || 0).toFixed(4), // referencial
        ref,
        meta: { ...(metaIn || {}), uom: uom || base },
        created_by: createdBy
      }, { transaction: t });

      await t.commit();
      res.status(201).json(mov);
    } catch (e) { await t.rollback(); next(e); }
  }
);


/* ---------- Conteo: fijar stock exacto (delta = target - actual), sin tocar costo base ---------- */
router.post("/inventory/count",
  requireAuth, requireRole("admin", "manager"),
  celebrate({ [Segments.BODY]: countBody }),
  async (req, res, next) => {
    const t = await StockMovement.sequelize.transaction();
    try {
      const createdBy = getUserId(req);
      if (!createdBy) { await t.rollback(); return res.status(401).json({ error: "No se pudo identificar el usuario (token sin sub/id)" }); }

      const { ingredient_id, target_qty, uom, ref, meta } = req.body;

      const ing = await Ingredient.findByPk(ingredient_id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!ing) { await t.rollback(); return res.status(404).json({ error: "Insumo no encontrado" }); }

      const base = ing.unit;
      const targetBase = toBaseQty(parseAR(target_qty), (uom || base), base);
      const deltaBase = targetBase - Number(ing.stock_qty || 0);

      await ing.update({ stock_qty: targetBase.toFixed(3) }, { transaction: t });

      const mov = await StockMovement.create({
        ingredient_id: ing.id,
        type: "adjustment",
        qty: deltaBase,
        unit_cost: Number(ing.cost_per_unit || 0),
        ref: ref || null,
        meta: { ...(meta || {}), count: true },
        created_by: createdBy
      }, { transaction: t });

      await t.commit();
      res.status(201).json(mov);
    } catch (e) { await t.rollback(); next(e); }
  }
);

router.get("/inventory/products/:id/producible",
  requireAuth,
  celebrate({ [Segments.PARAMS]: idParam }),
  async (req, res, next) => {
    try {
      const pid = Number(req.params.id);

      const rows = await ProductIngredient.findAll({
        where: { product_id: pid },
        include: [{ model: Ingredient, attributes: ["id", "name", "unit", "stock_qty"] }]
      });

      if (!rows.length) return res.json({ producible: Infinity, limiting: null, breakdown: [] });

      const breakdown = rows.map(r => {
        const needPerUnit = Number(r.qty_per_unit || 0) * (1 + Number(r.waste_factor || 0)); // en base del insumo
        const onHand = Number(r.Ingredient?.stock_qty || 0);
        const producible = needPerUnit > 0 ? Math.floor(onHand / needPerUnit) : Infinity;
        return {
          ingredient_id: r.ingredient_id,
          ingredient: r.Ingredient?.name,
          unit: r.Ingredient?.unit,
          need_per_unit: needPerUnit,
          on_hand: onHand,
          producible
        };
      });

      const limiting = breakdown.reduce((a, b) => (b.producible < (a?.producible ?? Infinity) ? b : a), null);
      const producible = limiting?.producible ?? 0;

      res.json({ producible, limiting, breakdown });
    } catch (e) { next(e); }
  }
);

// ----- Costo de receta por producto -----
router.get("/inventory/products/:id/recipe/cost",
  requireAuth,
  celebrate({ [Segments.PARAMS]: idParam }),
  async (req, res, next) => {
    try {
      const pid = Number(req.params.id);

      const rows = await ProductIngredient.findAll({
        where: { product_id: pid },
        include: [
          { model: Ingredient, attributes: ["id", "name", "unit", "cost_per_unit"] }
        ],
        order: [["id", "ASC"]]
      });

      if (!rows || rows.length === 0) {
        return res.json({ product_id: pid, cost: 0, breakdown: [] });
      }

      let cost = 0;
      const breakdown = rows.map(r => {
        const ing = r.Ingredient;
        const qtyBase = Number(r.qty_per_unit || 0);     // en unidad base del insumo
        const wf = Number(r.waste_factor || 0);          // 0..1
        const cpu = Number(ing?.cost_per_unit || 0);     // costo por unidad base
        const qtyWithWaste = qtyBase * (1 + wf);
        const subtotal = cpu * qtyWithWaste;

        cost += subtotal;
        return {
          ingredient_id: r.ingredient_id,
          name: ing?.name || null,
          unit: ing?.unit || null,           // "g" | "ml" | "unidad"
          qty_base: qtyBase,                  // cantidad neta por unidad de producto
          waste_factor: wf,                   // 0..1
          cpu_base: cpu,                      // costo por unidad base
          subtotal
        };
      });

      res.json({ product_id: pid, cost, breakdown });
    } catch (e) { next(e); }
  }
);

router.get("/inventory/products/:id/available", requireAuth, async (req, res, next) => {
  try {
    const pid = Number(req.params.id);
    const rows = await ProductIngredient.findAll({ where: { product_id: pid }, include: [{ model: Ingredient }] });
    if (!rows.length) return res.json({ product_id: pid, available: null, reason: "no_recipe" });

    let minServings = Infinity;
    for (const r of rows) {
      const ing = r.Ingredient;
      if (!ing) continue;
      const need = Number(r.qty_per_unit || 0) * (1 + Number(r.waste_factor || 0));
      if (need <= 0) continue;
      const onHand = Number(ing.stock_qty || 0);
      const servings = Math.floor(onHand / need);
      minServings = Math.min(minServings, servings);
    }
    if (!isFinite(minServings)) minServings = 0;
    res.json({ product_id: pid, available: minServings });
  } catch (e) { next(e); }
});

// disponible para varios (query ids=1,2,3)
router.get("/inventory/products/available", requireAuth, async (req, res, next) => {
  try {
    const ids = String(req.query.ids || "").split(",").map(n => Number(n)).filter(Boolean);
    const out = {};
    for (const pid of ids) {
      const rows = await ProductIngredient.findAll({ where: { product_id: pid }, include: [{ model: Ingredient }] });
      if (!rows.length) { out[pid] = { available: null, reason: "no_recipe" }; continue; }
      let minServings = Infinity;
      for (const r of rows) {
        const ing = r.Ingredient;
        if (!ing) continue;
        const need = Number(r.qty_per_unit || 0) * (1 + Number(r.waste_factor || 0));
        if (need <= 0) continue;
        const onHand = Number(ing.stock_qty || 0);
        const servings = Math.floor(onHand / need);
        minServings = Math.min(minServings, servings);
      }
      out[pid] = { available: isFinite(minServings) ? minServings : 0 };
    }
    res.json(out);
  } catch (e) { next(e); }
});


export default router;
