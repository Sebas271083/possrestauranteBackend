// src/routes/cashier.sessions.routes.js
import express from "express";
import { celebrate, Joi, Segments } from "celebrate";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { CashSession, Payment } from "../models/index.js";
import { Op, fn, col } from "sequelize";

const router = express.Router();

// Abrir sesión
router.post("/open",
  requireAuth, requireRole("cashier","manager","admin"),
  celebrate({ [Segments.BODY]: Joi.object({ opening_float: Joi.number().min(0).default(0) }) }),
  async (req,res,next)=>{
    try{
      const already = await CashSession.findOne({ where:{ status:"open", opened_by: req.user.sub }});
      if (already) return res.status(409).json({ error:"Ya tenés una sesión abierta", session_id: already.id });

      const row = await CashSession.create({ opened_by: req.user.sub, opening_float: req.body.opening_float });
      res.status(201).json(row);
    }catch(e){ next(e); }
  }
);

// Listar sesiones (con filtros)
router.get("/",
  requireAuth, requireRole("manager","admin"),
  async (req,res,next)=>{
    try{
      const rows = await CashSession.findAll({ order:[["id","DESC"]] });
      res.json(rows);
    }catch(e){ next(e); }
  }
);

// Resumen de una sesión (totales por método)
router.get("/:id/summary",
  requireAuth, requireRole("cashier","manager","admin"),
  async (req,res,next)=>{
    try{
      const sid = Number(req.params.id);
      const byMethod = await Payment.findAll({
        where: { session_id: sid },
        attributes: ["method", [fn("SUM", col("amount")), "sum"]],
        group: ["method"], raw: true
      });
      const total = byMethod.reduce((a,r)=> a + Number(r.sum||0), 0);
      res.json({ byMethod, total });
    }catch(e){ next(e); }
  }
);

// Cerrar sesión (arqueo)
router.post("/:id/close",
  requireAuth, requireRole("cashier","manager","admin"),
  celebrate({ [Segments.BODY]: Joi.object({
    counted_total: Joi.number().min(0).required(),
    notes: Joi.string().allow("", null)
  }) }),
  async (req,res,next)=>{
    try{
      const s = await CashSession.findByPk(req.params.id);
      if (!s || s.status !== "open") return res.status(404).json({ error:"Sesión no abierta" });

      const payments = await Payment.findAll({ where:{ session_id: s.id }, raw:true });
      const expected = payments.reduce((a,p)=> a+Number(p.amount||0), 0) + Number(s.opening_float||0);

      const counted = Number(req.body.counted_total||0);
      const diff = counted - expected;

      await s.update({
        closed_by: req.user.sub, closed_at: new Date(),
        counted_total: counted.toFixed(2),
        expected_total: expected.toFixed(2),
        diff_total: diff.toFixed(2),
        notes: req.body.notes || null,
        status: "closed"
      });

      res.json({ ok:true, session_id: s.id, expected: s.expected_total, counted: s.counted_total, diff: s.diff_total });
    }catch(e){ next(e); }
  }
);

export default router;
