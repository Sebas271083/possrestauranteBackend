import express from "express";
import { celebrate, Segments } from "celebrate";
import { requireAuth } from "../middleware/auth.js";
import { Order, OrderItem, Product, Category, ProductIngredient } from "../models/index.js";
import { Op, fn, col, literal } from "sequelize";
import { rangeQuery } from "../schemas/costs.schemas.js";
import { makeProductCostCache } from "../services/cost.service.js";

const router = express.Router();

function rangeWhere(column, from, to) {
    return { [column]: { [Op.gte]: new Date(from), [Op.lte]: new Date(to) } };
}

/**
 * 1) CMV total por rango (aprox)
 * Suma: sum( qty * costo_unitario_producto )
 * Donde costo_unitario_producto = sum(receta.qty * ingredient.cost_per_unit actual)
 */
router.get(
    "/reports/costs/cmv",
    requireAuth,
    celebrate({ [Segments.QUERY]: rangeQuery }),
    async (req, res, next) => {
        try {
            const { from, to } = req.query;

            // Tomamos todos los ítems de órdenes cerradas en rango
            const items = await OrderItem.findAll({
                include: [{
                    model: Order,
                    attributes: [],
                    where: { status: "closed", ...rangeWhere("closed_at", from, to) }
                }, {
                    model: Product,
                    attributes: ["id", "name"],
                    required: false // manual items pueden no tener product
                }]
            });

            const costCache = makeProductCostCache();
            let cmv = 0;
            let missing = 0;

            for (const it of items) {
                if (it.Product?.id) {
                    // catálogo → costo por receta
                    const unitCost = await costCache.get(it.Product.id);
                    cmv += unitCost * it.quantity;
                } else if (it.cost_override != null) {
                    // manual con costo cargado
                    cmv += Number(it.cost_override) * it.quantity;
                } else {
                    // manual sin costo → lo marcamos como excluido
                    missing += 1;
                }
            }


            res.json({ from, to, cmv: Number(cmv.toFixed(2)), excluded_manual_items: missing });
        } catch (e) { next(e); }
    }
);

/**
 * 2) Margen por producto:
 * revenue = sum(qty * unit_price)
 * cost    = sum(qty * costo_unitario_producto)
 * margin  = revenue - cost ; margin_pct = margin / revenue
 */
router.get(
    "/reports/margin/by-product",
    requireAuth,
    celebrate({ [Segments.QUERY]: rangeQuery }),
    async (req, res, next) => {
        try {
            const { from, to } = req.query;

            // Sumamos revenue por item_name (lo hacías en ventas); pero acá necesitamos el Product real
            const items = await OrderItem.findAll({
                attributes: ["product_id", "item_name",
                    [fn("SUM", col("quantity")), "qty"],
                    [fn("SUM", literal("quantity * unit_price")), "revenue"]
                ],
                include: [{
                    model: Order,
                    attributes: [],
                    where: { status: "closed", ...rangeWhere("closed_at", from, to) }
                }, {
                    model: Product,
                    attributes: ["id", "name"]
                }],
                group: ["product_id", "item_name", "Product.id", "Product.name"],
                order: [[literal("revenue"), "DESC"]]
            });

            const costCache = makeProductCostCache();
            const out = [];

            for (const row of items) {
                const pid = row.product_id;
                if (!pid) continue; // ignoramos manuales

                const qty = Number(row.get("qty"));
                const revenue = Number(row.get("revenue"));
                const unitCost = await costCache.get(pid);
                const cost = unitCost * qty;
                const margin = revenue - cost;
                const margin_pct = revenue > 0 ? Number((margin / revenue * 100).toFixed(2)) : 0;

                out.push({
                    product_id: pid,
                    product_name: row.Product?.name || row.item_name,
                    qty,
                    revenue: Number(revenue.toFixed(2)),
                    cost: Number(cost.toFixed(2)),
                    margin: Number(margin.toFixed(2)),
                    margin_pct
                });
            }

            res.json(out);
        } catch (e) { next(e); }
    }
);

/**
 * 3) Margen por categoría (aprox)
 * Mapeamos producto → categorías y agregamos revenue/cost.
 */
router.get(
    "/reports/margin/by-category",
    requireAuth,
    celebrate({ [Segments.QUERY]: rangeQuery }),
    async (req, res, next) => {
        try {
            const { from, to } = req.query;

            // Traer products con categorías
            const prods = await Product.findAll({ include: [Category] });
            const prodToCats = new Map();
            for (const p of prods) {
                prodToCats.set(p.id, p.Categories?.map(c => c.name) || ["Sin categoría"]);
            }

            const items = await OrderItem.findAll({
                attributes: ["product_id",
                    [fn("SUM", col("quantity")), "qty"],
                    [fn("SUM", literal("quantity * unit_price")), "revenue"]
                ],
                include: [{
                    model: Order,
                    attributes: [],
                    where: { status: "closed", ...rangeWhere("closed_at", from, to) }
                }],
                group: ["product_id"]
            });

            const costCache = makeProductCostCache();
            const catAgg = new Map();

            for (const it of items) {
                const pid = it.product_id;
                if (!pid) continue; // manual fuera
                const qty = Number(it.get("qty"));
                const revenue = Number(it.get("revenue"));
                const unitCost = await costCache.get(pid);
                const cost = unitCost * qty;
                const margin = revenue - cost;

                const cats = prodToCats.get(pid) || ["Sin categoría"];
                for (const c of cats) {
                    const prev = catAgg.get(c) || { category: c, qty: 0, revenue: 0, cost: 0, margin: 0 };
                    prev.qty += qty;
                    prev.revenue += revenue;
                    prev.cost += cost;
                    prev.margin += margin;
                    catAgg.set(c, prev);
                }
            }

            const out = Array.from(catAgg.values()).map(x => ({
                ...x,
                revenue: Number(x.revenue.toFixed(2)),
                cost: Number(x.cost.toFixed(2)),
                margin: Number(x.margin.toFixed(2)),
                margin_pct: x.revenue > 0 ? Number((x.margin / x.revenue * 100).toFixed(2)) : 0
            })).sort((a, b) => b.margin - a.margin);

            res.json(out);
        } catch (e) { next(e); }
    }
);

export default router;
