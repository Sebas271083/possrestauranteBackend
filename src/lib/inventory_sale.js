// src/lib/inventory_sale.js
import { Ingredient, ProductIngredient, StockMovement } from "../models/index.js";

export async function applySaleDeductionsForOrder(order, userId, t) {
  const items = (order.OrderItems || []).filter(
    it => it.status === "delivered" && !it.stock_applied_at
  );
  if (items.length === 0) return;

  for (const it of items) {
    const recipe = await ProductIngredient.findAll({
      where: { product_id: it.product_id },
      include: [{ model: Ingredient }],
      transaction: t,
      lock: t?.LOCK?.UPDATE
    });

    for (const r of recipe) {
      const ing = r.Ingredient;
      if (!ing) continue;

      // La receta está en UNIDAD BASE del insumo (g/ml/unidad)
      const perUnitBase =
        Number(r.qty_per_unit || 0) * (1 + Number(r.waste_factor || 0));
      const totalBase = perUnitBase * Number(it.quantity || 0);

      // Stock ↓
      const newOnHand = Number(ing.stock_qty || 0) - totalBase;
      await ing.update(
        { stock_qty: newOnHand.toFixed(3) },
        { transaction: t }
      );

      // Movimiento
      await StockMovement.create(
        {
          ingredient_id: ing.id,
          type: "sale_deduction",
          qty: -totalBase,
          unit_cost: Number(ing.cost_per_unit || 0), // referencial
          ref: `ORDER#${order.id}/ITEM#${it.id}`,
          meta: {
            order_id: order.id,
            order_item_id: it.id,
            product_id: it.product_id
          },
          created_by: userId || null
        },
        { transaction: t }
      );
    }

    await it.update({ stock_applied_at: new Date() }, { transaction: t });
  }
}
