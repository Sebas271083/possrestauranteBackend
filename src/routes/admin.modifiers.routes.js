import express from "express";
import { celebrate, Joi, Segments } from "celebrate";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { ModifierGroup, ModifierOption, Product } from "../models/index.js";

const router = express.Router();

// ===== Groups =====
router.get("/admin/catalog/modifiers/groups", requireAuth, requireRole("admin","manager"), async (_req,res,next)=>{
  try {
    const rows = await ModifierGroup.findAll({ order: [["name","ASC"]] });
    res.json(rows);
  } catch(e){ next(e); }
});

router.post("/admin/catalog/modifiers/groups",
  requireAuth, requireRole("admin","manager"),
  celebrate({ [Segments.BODY]: Joi.object({
    name: Joi.string().min(2).max(100).required(),
    min_select: Joi.number().integer().min(0).default(0),
    max_select: Joi.number().integer().min(0).default(1), // 0 => sin límite
    required: Joi.boolean().default(false)
  })}),
  async (req,res,next)=>{
    try {
      const row = await ModifierGroup.create(req.body);
      res.status(201).json(row);
    } catch(e){ next(e); }
  }
);

router.patch("/admin/catalog/modifiers/groups/:id",
  requireAuth, requireRole("admin","manager"),
  celebrate({ [Segments.BODY]: Joi.object({
    name: Joi.string().min(2).max(100),
    min_select: Joi.number().integer().min(0),
    max_select: Joi.number().integer().min(0),
    required: Joi.boolean()
  })}),
  async (req,res,next)=>{
    try {
      const row = await ModifierGroup.findByPk(req.params.id);
      if (!row) return res.status(404).json({ error: "Grupo no encontrado" });
      await row.update(req.body);
      res.json(row);
    } catch(e){ next(e); }
  }
);

router.delete("/admin/catalog/modifiers/groups/:id",
  requireAuth, requireRole("admin","manager"),
  async (req,res,next)=>{
    try {
      const row = await ModifierGroup.findByPk(req.params.id);
      if (!row) return res.status(404).json({ error: "Grupo no encontrado" });
      await row.destroy();
      res.json({ ok:true });
    } catch(e){ next(e); }
  }
);

// ===== Options =====
router.get("/admin/catalog/modifiers/groups/:groupId/options",
  requireAuth, requireRole("admin","manager"),
  async (req,res,next)=>{
    try {
      const rows = await ModifierOption.findAll({ where: { group_id: req.params.groupId }, order: [["name","ASC"]] });
      res.json(rows);
    } catch(e){ next(e); }
  }
);

router.post("/admin/catalog/modifiers/groups/:groupId/options",
  requireAuth, requireRole("admin","manager"),
  celebrate({ [Segments.BODY]: Joi.object({
    name: Joi.string().min(1).max(100).required(),
    price_delta: Joi.number().precision(2).default(0)
  })}),
  async (req,res,next)=>{
    try {
      const opt = await ModifierOption.create({
        group_id: req.params.groupId,
        name: req.body.name,
        price_delta: req.body.price_delta ?? 0
      });
      res.status(201).json(opt);
    } catch(e){ next(e); }
  }
);

router.patch("/admin/catalog/modifiers/options/:id",
  requireAuth, requireRole("admin","manager"),
  celebrate({ [Segments.BODY]: Joi.object({
    name: Joi.string().min(1).max(100),
    price_delta: Joi.number().precision(2)
  })}),
  async (req,res,next)=>{
    try {
      const opt = await ModifierOption.findByPk(req.params.id);
      if (!opt) return res.status(404).json({ error: "Opción no encontrada" });
      await opt.update(req.body);
      res.json(opt);
    } catch(e){ next(e); }
  }
);

router.delete("/admin/catalog/modifiers/options/:id",
  requireAuth, requireRole("admin","manager"),
  async (req,res,next)=>{
    try {
      const opt = await ModifierOption.findByPk(req.params.id);
      if (!opt) return res.status(404).json({ error: "Opción no encontrada" });
      await opt.destroy();
      res.json({ ok:true });
    } catch(e){ next(e); }
  }
);

// ===== Vincular grupos a producto =====
router.post("/admin/catalog/products/:id/modifiers/attach",
  requireAuth, requireRole("admin","manager"),
  celebrate({ [Segments.BODY]: Joi.object({
    group_id: Joi.number().integer().required(),
    sort_order: Joi.number().integer().min(0).default(0)
  })}),
  async (req,res,next)=>{
    try {
      const p = await Product.findByPk(req.params.id);
      if (!p) return res.status(404).json({ error: "Producto no encontrado" });
      await p.addModifierGroup(req.body.group_id, { through: { sort_order: req.body.sort_order } });
      res.json({ ok:true });
    } catch(e){ next(e); }
  }
);

router.delete("/admin/catalog/products/:id/modifiers/:groupId",
  requireAuth, requireRole("admin","manager"),
  async (req,res,next)=>{
    try {
      const p = await Product.findByPk(req.params.id);
      if (!p) return res.status(404).json({ error: "Producto no encontrado" });
      await p.removeModifierGroup(req.params.groupId);
      res.json({ ok:true });
    } catch(e){ next(e); }
  }
);

export default router;
