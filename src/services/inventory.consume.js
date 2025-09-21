// src/services/inventory.consume.js
import { Ingredient, ProductIngredient, StockMovement } from "../models/index.js";

/**
 * Descuenta insumos según la receta de cada producto en la orden.
 * - Asume que qty_per_unit está en la UNIDAD BASE del ingrediente (g/ml/unidad).
 * - Evita doble descuento: revisa si ya existen movimientos con ref = `sale O#<id>`.
 */
export async function consumeIngredientsForOrder(order, { transaction }) {
  const ref = `sale O#${order.id}`;

  // Evitar doble consumo si ya se procesó esta orden
  const already = await StockMovement.count({
    where: { type: "sale_deduction", ref },
    transaction,
  });
  if (already > 0) return false;

  const items = order.OrderItems || [];
  if (items.length === 0) return false;

  // Traemos todas las recetas de los productos involucrados
  const productIds = [...new Set(items.map(i => i.product_id))];
  const recipes = await ProductIngredient.findAll({
    where: { product_id: productIds },
    raw: true,
    transaction,
  });

  const byProduct = new Map();
  for (const r of recipes) {
    const arr = byProduct.get(r.product_id) || [];
    arr.push(r);
    byProduct.set(r.product_id, arr);
  }

  // Por cada ítem, descuenta sus ingredientes
  for (const it of items) {
    const rows = byProduct.get(it.product_id) || [];
    if (rows.length === 0) continue;

    const units = Number(it.quantity || 0);
    if (units <= 0) continue;

    for (const r of rows) {
      const qtyPerUnit = Number(r.qty_per_unit || 0);
      const waste = Number(r.waste_factor || 0); // 0..1
      const need = qtyPerUnit * (1 + waste) * units; // en base del ingrediente

      if (!(need > 0)) continue;

      const ing = await Ingredient.findByPk(r.ingredient_id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!ing) continue;

      const onHand = Number(ing.stock_qty || 0);
      const after = onHand - need;

      await ing.update({ stock_qty: after.toFixed(3) }, { transaction });

      await StockMovement.create({
        ingredient_id: ing.id,
        type: "sale_deduction",
        qty: -need, // negativo
        unit_cost: Number(ing.cost_per_unit || 0),
        ref,
        meta: { order_id: order.id, product_id: it.product_id, order_item_id: it.id },
        created_by: order.closed_by || order.updated_by || 0, // por si querés guardar quién cerró
      }, { transaction });
    }
  }

  return true;
}
