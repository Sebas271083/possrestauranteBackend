import express from "express";
import { celebrate, Segments } from "celebrate";
import { requireAuth } from "../middleware/auth.js";
import { Product } from "../models/index.js";
import { computeProductUnitCost } from "../services/cost.service.js";
import { pricingSuggestBody } from "../schemas/pricing.schemas.js";

const router = express.Router();

function priceFromCost(cost, { markup, target_margin }) {
  if (markup != null) return cost * (1 + Number(markup));
  if (target_margin != null) return cost / (1 - Number(target_margin));
  return cost;
}

function roundSmart(p, round_to, psychological) {
  let r = Math.round(p / round_to) * round_to; // redondeo al múltiplo
  if (psychological) {
    // Ajuste para terminar en .99 (si se puede)
    r = Math.max(round_to, r);
    // Llevar a 1 peso abajo y sumar 0.99
    const base = Math.floor(r) - 1;
    return Number((base + 0.99).toFixed(2));
  }
  return Number(r.toFixed(2));
}

/**
 * POST /pricing/suggestions
 * - Recibe product_ids (catálogo) o manual_items (costo directo)
 * - Devuelve costo calculado y precio sugerido
 */
router.post(
  "/pricing/suggestions",
  requireAuth,
  celebrate({ [Segments.BODY]: pricingSuggestBody }),
  async (req, res, next) => {
    try {
      const { product_ids, manual_items, markup, target_margin, round_to, psychological } = req.body;
      const out = [];

      if (product_ids?.length) {
        const prods = await Product.findAll({ where: { id: product_ids } });
        for (const p of prods) {
          const { cost, breakdown } = await computeProductUnitCost(p.id);
          const raw = priceFromCost(cost, { markup, target_margin });
          const suggested = roundSmart(raw, round_to, psychological);
          out.push({
            type: "catalog",
            product_id: p.id,
            name: p.name,
            unit_cost: Number(cost.toFixed(4)),
            suggested_price: suggested,
            method: markup != null ? { kind: "markup", value: Number(markup) } : { kind: "target_margin", value: Number(target_margin) },
            rounding: { round_to, psychological },
            breakdown
          });
        }
      }

      if (manual_items?.length) {
        for (const m of manual_items) {
          const cost = Number(m.unit_cost);
          const raw = priceFromCost(cost, { markup, target_margin });
          const suggested = roundSmart(raw, round_to, psychological);
          out.push({
            type: "manual",
            product_id: null,
            name: m.item_name,
            unit_cost: Number(cost.toFixed(4)),
            suggested_price: suggested,
            method: markup != null ? { kind: "markup", value: Number(markup) } : { kind: "target_margin", value: Number(target_margin) },
            rounding: { round_to, psychological }
          });
        }
      }

      res.status(200).json(out);
    } catch (e) { next(e); }
  }
);

export default router;
