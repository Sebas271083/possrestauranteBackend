// src/routes/admin.audit.routes.js
import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { celebrate, Joi, Segments } from "celebrate";
import { AuditLog, User } from "../models/index.js";
import { Op } from "sequelize";

const router = express.Router();

router.get("/audit",
  requireAuth, requireRole("manager","admin"),
  celebrate({ [Segments.QUERY]: Joi.object({
    from: Joi.string().isoDate().optional(),
    to: Joi.string().isoDate().optional(),
    action: Joi.string().optional(),
    user_id: Joi.number().integer().optional(),
    entity: Joi.string().optional(),
    entity_id: Joi.number().integer().optional(),
    limit: Joi.number().integer().min(1).max(2000).default(200)
  })}),
  async (req,res,next)=>{
    try{
      const where = {};
      const { from, to, action, user_id, entity, entity_id } = req.query;
      if (action) where.action = action;
      if (user_id) where.user_id = Number(user_id);
      if (entity) where.entity = entity;
      if (entity_id) where.entity_id = Number(entity_id);
      if (from || to) {
        where.created_at = {};
        if (from) where.created_at[Op.gte] = new Date(from);
        if (to)   where.created_at[Op.lte] = new Date(to);
      }

      const rows = await AuditLog.findAll({
        where, order:[["id","DESC"]], limit: Number(req.query.limit),
        include: [{ model: User, attributes:["id","name"] }]
      });
      res.json(rows);
    }catch(e){ next(e); }
  }
);

export default router;
