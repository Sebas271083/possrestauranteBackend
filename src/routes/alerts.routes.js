import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { Ingredient } from "../models/index.js";

const router = express.Router();

// Insumos con stock por debajo de min_qty
router.get("/alerts/low-stock", requireAuth, async (_req, res, next) => {
  try {
    const rows = await Ingredient.findAll();
    const low = rows
      .filter(i => Number(i.stock_qty) <= Number(i.min_qty))
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json(low);
  } catch (e) { next(e); }
});
  
export default router;
