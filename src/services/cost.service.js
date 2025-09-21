import { Product, ProductIngredient, Ingredient, Category } from "../models/index.js";

/**
 * Costo unitario de un producto usando receta (sum(qty * ingrediente.cost_per_unit))
 * Devuelve { cost: number, breakdown: [{ingredient_id, name, qty, unit_cost, line_cost}] }
 */
export async function computeProductUnitCost(productId) {
  const pi = await ProductIngredient.findAll({
    where: { product_id: productId },
    include: [Ingredient]
  });

  let cost = 0;
  const breakdown = [];
  for (const row of pi) {
    const unitCost = Number(row.Ingredient?.cost_per_unit || 0);
    const line = Number(row.qty_per_unit) * unitCost;
    cost += line;
    breakdown.push({
      ingredient_id: row.ingredient_id,
      name: row.Ingredient?.name || "",
      qty: Number(row.qty_per_unit),
      unit_cost: unitCost,
      line_cost: Number(line.toFixed(4))
    });
  }
  return { cost: Number(cost.toFixed(4)), breakdown };
}

/**
 * Cachea costos unitarios de productos para evitar N consultas
 * getProductCost(productId) -> number
 */
export function makeProductCostCache() {
  const cache = new Map(); // productId -> cost
  return {
    async get(productId) {
      if (cache.has(productId)) return cache.get(productId);
      const { cost } = await computeProductUnitCost(productId);
      cache.set(productId, cost);
      return cost;
    }
  };
}
