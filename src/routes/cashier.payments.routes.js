// src/routes/cashier.payments.routes.js
import express from "express";
import { celebrate, Joi, Segments } from "celebrate";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { Payment, Order, Table, CashSession, User } from "../models/index.js";
import { Op } from "sequelize";

const router = express.Router();

router.get("/",
  requireAuth, requireRole("cashier","manager","admin"),
  celebrate({ [Segments.QUERY]: Joi.object({
    from: Joi.string().isoDate().optional(),
    to: Joi.string().isoDate().optional(),
    method: Joi.string().valid("cash","card","transfer","other").optional(),
    user_id: Joi.number().integer().optional(),
    session_id: Joi.number().integer().optional(),
    order_id: Joi.number().integer().optional(),
    limit: Joi.number().integer().min(1).max(2000).default(200),
  })}),
  async (req,res,next)=>{
    try{
      const where = {};
      const { from, to, method, user_id, session_id, order_id } = req.query;

      if (method) where.method = method;
      if (user_id) where.user_id = Number(user_id);
      if (session_id) where.session_id = Number(session_id);
      if (order_id) where.order_id = Number(order_id);

      if (from || to) {
        where.created_at = {};
        if (from) where.created_at[Op.gte] = new Date(from);
        if (to)   where.created_at[Op.lte] = new Date(to);
      }

      const rows = await Payment.findAll({
        where,
        include: [
          { model: Order, include: [{ model: Table, attributes: ["id","label"] }] },
          { model: CashSession },
          // { model: User, attributes:["id","name"] } // si tenés User
        ],
        order: [["id","DESC"]],
        limit: Number(req.query.limit)
      });
      res.json(rows);
    }catch(e){ next(e); }
  }
);

export default router;
