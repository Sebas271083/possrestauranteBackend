import { Ingredient, ProductIngredient, StockMovement } from "../models/index.js";

/**
 * Descarga stock por N unidades de un product_id
 */
export async function deductForProductSale({ product_id, units, order_id, user_id }, t) {
    const recipe = await ProductIngredient.findAll({ where: { product_id }, transaction: t, include: [Ingredient] });
    for (const r of recipe) {
        const need = Number(r.qty_per_unit) * units * (1 + Number(r.waste_factor || 0));
        // Actualizar stock del ingrediente
        const ing = r.Ingredient;
        await ing.update({ stock_qty: (Number(ing.stock_qty) - need).toFixed(3) }, { transaction: t });

        // Registrar movimiento
        await StockMovement.create({
            ingredient_id: ing.id,
            type: "sale_deduction",
            qty: -need, // negativo
            unit_cost: Number(ing.cost_per_unit),
            ref: `ORDER#${order_id}`,
            meta: { product_id, units },
            created_by: user_id
        }, { transaction: t });
    }
}
