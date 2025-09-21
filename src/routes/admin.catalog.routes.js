// src/routes/admin.catalog.routes.js
import express from "express";
import { celebrate, Joi, Segments } from "celebrate";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { Product, Category } from "../models/index.js";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";

const router = express.Router();

/* ---------- Categorías ---------- */
router.get(
  "/admin/catalog/categories",
  requireAuth, requireRole("admin","manager"),
  async (_req, res, next) => {
    try {
      const rows = await Category.findAll({ order: [["sort_order","ASC"],["name","ASC"]] });
      res.json(rows);
    } catch (e) { next(e); }
  }
);


// 🔎 Obtener un producto por ID
router.get("/admin/catalog/products/:id",
  requireAuth, /* opcional: requireRole("admin","manager"), */
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const prod = await Product.findByPk(id, { include: [Category] });
      if (!prod) return res.status(404).json({ error: "Producto no encontrado" });
      res.json(prod);
    } catch (e) { next(e); }
  }
);

router.post(
  "/admin/catalog/categories",
  requireAuth, requireRole("admin", "manager"),
  celebrate({
    [Segments.BODY]: Joi.object({
      name: Joi.string().min(2).max(150).required(),
      sort_order: Joi.number().integer().default(0)
    })
  }),
  async (req, res, next) => {
    const { name } = req.body;
    const desiredOrder = req.body.sort_order ?? 0;

    try {
      // 1) Intento de creación normal
      const row = await Category.create({ name, sort_order: desiredOrder });
      return res.status(201).json(row);
    } catch (e) {
      // 2) Si chocó con UNIQUE (ya existe)
      if (e.name === "SequelizeUniqueConstraintError") {
        try {
          // Buscar incluso si fue borrada (paranoid:true)
          const existing = await Category.findOne({ where: { name }, paranoid: false });
          if (!existing) {
            // Caso raro: no la encontró; re-lanzo
            throw e;
          }

          // Si estaba eliminada lógicamente, restaurar
          if (existing.deletedAt) {
            await existing.restore();
          }

          // Asegurar sort_order = 0 (o el que mandes) para "volver a verla" donde corresponda
          if (existing.sort_order !== desiredOrder) {
            await existing.update({ sort_order: desiredOrder });
          }

          return res.status(200).json({ ...existing.toJSON(), restored_or_updated: true });
        } catch (inner) {
          return next(inner);
        }
      }

      // 3) Validaciones normales
      if (e.name === "SequelizeValidationError") {
        return res.status(400).json({ error: e.errors?.[0]?.message || "Datos inválidos" });
      }

      // Otros errores
      return next(e);
    }
  }
);


router.patch(
  "/admin/catalog/categories/:id",
  requireAuth, requireRole("admin","manager"),
  celebrate({
    [Segments.PARAMS]: Joi.object({ id: Joi.number().integer().required() }),
    [Segments.BODY]: Joi.object({
      name: Joi.string().min(2).max(100),
      sort_order: Joi.number().integer().min(0)
    })
  }),
  async (req, res, next) => {
    try {
      const row = await Category.findByPk(req.params.id);
      if (!row) return res.status(404).json({ error: "Categoría no encontrada" });
      await row.update(req.body);
      res.json(row);
    } catch (e) { next(e); }
  }
);

router.delete(
  "/admin/catalog/categories/:id",
  requireAuth, requireRole("admin","manager"),
  celebrate({ [Segments.PARAMS]: Joi.object({ id: Joi.number().integer().required() }) }),
  async (req, res, next) => {
    try {
      const row = await Category.findByPk(req.params.id);
      if (!row) return res.status(404).json({ error: "Categoría no encontrada" });
      await row.destroy();
      res.json({ ok: true });
    } catch (e) { next(e); }
  }
);

/* ---------- Productos ---------- */
router.get(
  "/admin/catalog/products",
  requireAuth, requireRole("admin","manager"),
  async (_req, res, next) => {
    try {
      const rows = await Product.findAll({
        include: [{ model: Category, through: { attributes: [] } }],
        order: [["name","ASC"]]
      });
      res.json(rows);
    } catch (e) { next(e); }
  }
);

router.post(
  "/admin/catalog/products",
  requireAuth, requireRole("admin","manager"),
  celebrate({ [Segments.BODY]: Joi.object({
    name: Joi.string().min(2).max(150).required(),
    sku: Joi.string().allow(null, ""),
    station: Joi.string().allow(null, ""),
    price: Joi.number().precision(2).min(0).default(0),
    tax_rate: Joi.number().precision(2).min(0).default(0),
    is_active: Joi.boolean().default(true),
    stock_deduct: Joi.boolean().default(false),
    category_ids: Joi.array().items(Joi.number().integer()).default([])
  }) }),
  async (req, res, next) => {
    try {
      const { category_ids = [], ...rest } = req.body;
      const row = await Product.create(rest);
      if (category_ids.length) await row.setCategories(category_ids);
      const withCats = await Product.findByPk(row.id, { include: [Category] });
      res.status(201).json(withCats);
    } catch (e) { next(e); }
  }
);

router.patch(
  "/admin/catalog/products/:id",
  requireAuth, requireRole("admin","manager"),
  celebrate({
    [Segments.PARAMS]: Joi.object({ id: Joi.number().integer().required() }),
    [Segments.BODY]: Joi.object({
      name: Joi.string().min(2).max(150),
      sku: Joi.string().allow(null, ""),
      station: Joi.string().allow(null, ""),
      price: Joi.number().precision(2).min(0),
      tax_rate: Joi.number().precision(2).min(0),
      is_active: Joi.boolean(),
      stock_deduct: Joi.boolean(),
      category_ids: Joi.array().items(Joi.number().integer())
    })
  }),
  async (req, res, next) => {
    try {
      const { category_ids, ...rest } = req.body;
      const row = await Product.findByPk(req.params.id);
      if (!row) return res.status(404).json({ error: "Producto no encontrado" });
      await row.update(rest);
      if (Array.isArray(category_ids)) await row.setCategories(category_ids);
      const withCats = await Product.findByPk(row.id, { include: [Category] });
      res.json(withCats);
    } catch (e) { next(e); }
  }
);

router.delete(
  "/admin/catalog/products/:id",
  requireAuth, requireRole("admin","manager"),
  celebrate({ [Segments.PARAMS]: Joi.object({ id: Joi.number().integer().required() }) }),
  async (req, res, next) => {
    try {
      const row = await Product.findByPk(req.params.id);
      if (!row) return res.status(404).json({ error: "Producto no encontrado" });
      await row.destroy();
      res.json({ ok: true });
    } catch (e) { next(e); }
  }
);

/* ---------- Upload de imagen del producto ---------- */
const uploadDir = path.resolve(process.env.UPLOAD_DIR || "./uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const id = Date.now() + "_" + Math.random().toString(36).slice(2);
    cb(null, id + path.extname(file.originalname || ".jpg"));
  }
});
const upload = multer({ storage });

router.post(
  "/admin/catalog/products/:id/image",
  requireAuth, requireRole("admin","manager"),
  upload.single("file"),
  async (req, res, next) => {
    try {
      const row = await Product.findByPk(req.params.id);
      if (!row) return res.status(404).json({ error: "Producto no encontrado" });
      // la URL pública (servida por /uploads estáticos)
      const rel = "/uploads/" + path.basename(req.file.path);
      await row.update({ image_url: rel });
      res.json({ ok: true, image_url: rel });
    } catch (e) { next(e); }
  }
);

export default router;
