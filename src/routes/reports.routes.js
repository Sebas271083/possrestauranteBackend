// src/routes/reports.routes.js
import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { celebrate, Joi, Segments } from "celebrate";
import { Order, OrderItem, Payment, Product, Category } from "../models/index.js";
import { Op, fn, col, literal } from "sequelize";

const router = express.Router();

// Ventas por día
router.get("/sales/daily",
  requireAuth,
  celebrate({ [Segments.QUERY]: Joi.object({
    from: Joi.string().isoDate().required(),
    to: Joi.string().isoDate().required(),
  })}),
  async (req,res,next)=>{
    try{
      const { from, to } = req.query;
      const rows = await Order.findAll({
        attributes: [
          [fn("DATE", col("closed_at")), "day"],
          [fn("SUM", col("grand_total")), "sum_total"]
        ],
        where: { status:"closed", closed_at: { [Op.between]: [new Date(from), new Date(to)] } },
        group: [literal("DATE(closed_at)")],
        order: [literal("DATE(closed_at) ASC")],
        raw: true
      });
      res.json(rows);
    } catch(e){ next(e); }
  }
);

// Mix de pagos
router.get("/payments/mix",
  requireAuth,
  celebrate({ [Segments.QUERY]: Joi.object({
    from: Joi.string().isoDate().required(),
    to: Joi.string().isoDate().required(),
  })}),
  async (req,res,next)=>{
    try{
      const { from, to } = req.query;
      const rows = await Payment.findAll({
        attributes: ["method", [fn("SUM", col("amount")), "sum"]],
        where: { created_at: { [Op.between]: [new Date(from), new Date(to)] } },
        group: ["method"], raw: true
      });
      res.json(rows);
    }catch(e){ next(e); }
  }
);

// Top productos
router.get("/products/top",
  requireAuth,
  celebrate({ [Segments.QUERY]: Joi.object({
    from: Joi.string().isoDate().required(),
    to: Joi.string().isoDate().required(),
    limit: Joi.number().integer().min(1).max(50).default(10)
  })}),
  async (req,res,next)=>{
    try{
      const { from, to, limit } = req.query;
      const rows = await OrderItem.findAll({
        attributes: [
          "product_id", "item_name",
          [fn("SUM", col("quantity")), "qty"],
          [fn("SUM", literal("quantity * unit_price")), "revenue"]
        ],
        where: { created_at: { [Op.between]: [new Date(from), new Date(to)] } },
        group: ["product_id","item_name"],
        order: [[literal("qty"), "DESC"]],
        limit: Number(limit),
        raw: true
      });
      res.json(rows);
    }catch(e){ next(e); }
  }
);

export default router;
