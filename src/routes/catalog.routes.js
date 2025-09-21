import express from "express";
import multer from "multer";
import path from "node:path";
import { celebrate, Joi, Segments } from "celebrate";
import { Op } from "sequelize";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { Product, Category } from "../models/index.js";
import { ModifierGroup } from "../models/index.js";
import { ModifierOption } from "../models/index.js";

const router = express.Router();

/* ---------- MULTER (uploads de imágenes) ---------- */
const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ts = Date.now();
    const ext = path.extname(file.originalname || "").toLowerCase();
    cb(null, `prod_${ts}${ext || ".jpg"}`);
  }
});
const upload = multer({ storage });

/* ===================================================
   CATEGORÍAS
   =================================================== */

router.get(
  "/catalog/categories",
  requireAuth, requireRole("admin", "manager"),
  async (_req, res, next) => {
    try {
      const rows = await Category.findAll({
        order: [["sort_order", "ASC"], ["name", "ASC"]],
      });
      res.json(rows);
    } catch (e) { next(e); }
  }
);

router.post(
  "/catalog/categories",
  requireAuth, requireRole("admin", "manager"),
  celebrate({
    [Segments.BODY]: Joi.object({
      name: Joi.string().min(2).max(150).required(),
      sort_order: Joi.number().integer().default(0)
    })
  }),
  async (req, res, next) => {
    try {
      const row = await Category.create({
        name: req.body.name,
        sort_order: req.body.sort_order ?? 0
      });
      res.status(201).json(row);
    } catch (e) { next(e); }
  }
);

router.patch(
  "/catalog/categories/:id",
  requireAuth, requireRole("admin", "manager"),
  celebrate({
    [Segments.PARAMS]: Joi.object({ id: Joi.number().integer().required() }),
    [Segments.BODY]: Joi.object({
      name: Joi.string().min(2).max(150).optional(),
      sort_order: Joi.number().integer().optional()
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
  "/catalog/categories/:id",
  requireAuth, requireRole("admin", "manager"),
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

/* ===================================================
   PRODUCTOS
   =================================================== */

router.get(
  "/catalog/products",
  requireAuth, requireRole("admin", "manager"),
  celebrate({
    [Segments.QUERY]: Joi.object({
      q: Joi.string().allow(""),
      category_id: Joi.number().integer().optional(),
      include_inactive: Joi.boolean().default(false)
    })
  }),
  async (req, res, next) => {
    try {
      const { q, category_id, include_inactive } = req.query;

      const where = {};
      if (!include_inactive) where.is_active = true;
      if (q) where.name = { [Op.like]: `%${q}%` };

      const include = [{
        model: Category,
        as: "Categories",
        through: { attributes: [] },
        required: !!category_id,
        ...(category_id ? { where: { id: Number(category_id) } } : {})
      }];


      if (category_id) {
        include[0].where = { id: Number(category_id) };
        include[0].required = true;
      }

      const rows = await Product.findAll({
        where,
        include,
        order: [["name", "ASC"]],
        attributes: ["id", "name", "price", "tax_rate", "sku", "station", "image_url", "is_active", "stock_deduct"]
      });
      res.json(rows);
    } catch (e) { next(e); }
  }
);

router.post(
  "/catalog/products",
  requireAuth, requireRole("admin", "manager"),
  celebrate({
    [Segments.BODY]: Joi.object({
      name: Joi.string().min(2).max(150).required(),
      price: Joi.number().min(0).required(),
      tax_rate: Joi.number().min(0).max(100).default(0),
      sku: Joi.string().allow(null, ""),
      station: Joi.string().allow(null, ""),
      is_active: Joi.boolean().default(true),
      stock_deduct: Joi.boolean().default(false),
      category_ids: Joi.array().items(Joi.number().integer()).default([])
    })
  }),
  async (req, res, next) => {
    try {
      const p = await Product.create({
        name: req.body.name,
        price: req.body.price,
        tax_rate: req.body.tax_rate ?? 0,
        sku: req.body.sku || null,
        station: req.body.station || null,
        is_active: !!req.body.is_active,
        stock_deduct: !!req.body.stock_deduct
      });
      if (req.body.category_ids?.length) {
        await p.setCategories(req.body.category_ids);
      }
      const full = await Product.findByPk(p.id, {
        include: [{ model: Category, through: { attributes: [] } }]
      });
      res.status(201).json(full);
    } catch (e) { next(e); }
  }
);

router.patch(
  "/catalog/products/:id",
  requireAuth, requireRole("admin", "manager"),
  celebrate({
    [Segments.PARAMS]: Joi.object({ id: Joi.number().integer().required() }),
    [Segments.BODY]: Joi.object({
      name: Joi.string().min(2).max(150),
      price: Joi.number().min(0),
      tax_rate: Joi.number().min(0).max(100),
      sku: Joi.string().allow(null, ""),
      station: Joi.string().allow(null, ""),
      is_active: Joi.boolean(),
      stock_deduct: Joi.boolean(),
      category_ids: Joi.array().items(Joi.number().integer())
    })
  }),
  async (req, res, next) => {
    try {
      const p = await Product.findByPk(req.params.id, { include: [Category] });
      if (!p) return res.status(404).json({ error: "Producto no encontrado" });

      const patch = { ...req.body };
      delete patch.category_ids;

      await p.update(patch);
      if (Array.isArray(req.body.category_ids)) {
        await p.setCategories(req.body.category_ids);
      }

      const full = await Product.findByPk(p.id, {
        include: [{ model: Category, through: { attributes: [] } }]
      });
      res.json(full);
    } catch (e) { next(e); }
  }
);

router.delete(
  "/catalog/products/:id",
  requireAuth, requireRole("admin", "manager"),
  celebrate({ [Segments.PARAMS]: Joi.object({ id: Joi.number().integer().required() }) }),
  async (req, res, next) => {
    try {
      const p = await Product.findByPk(req.params.id);
      if (!p) return res.status(404).json({ error: "Producto no encontrado" });
      await p.destroy();
      res.json({ ok: true });
    } catch (e) { next(e); }
  }
);

/* Imagen de producto */
router.post(
  "/catalog/products/:id/image",
  requireAuth, requireRole("admin", "manager"),
  upload.single("file"),
  async (req, res, next) => {
    try {
      const p = await Product.findByPk(req.params.id);
      if (!p) return res.status(404).json({ error: "Producto no encontrado" });
      if (!req.file) return res.status(400).json({ error: "Archivo requerido" });

      // servir bajo /uploads
      const url = `/uploads/${req.file.filename}`;
      await p.update({ image_url: url });
      res.json({ ok: true, image_url: url });
    } catch (e) { next(e); }
  }
);

// GET /catalog/products/:id -> producto + grupos + opciones (solo activos)
router.get(
  "/catalog/products/:id",
  requireAuth,
  async (req, res, next) => {
    try {
      const row = await Product.findByPk(req.params.id, {
        where: { is_active: true },
        include: [
          {
            model: Category,
            through: { attributes: [] }
          },
          {
            model: ModifierGroup,
            include: [ModifierOption],
            through: { attributes: [] },
            order: [[{ model: ModifierGroup }, "sort_order", "ASC"]]
          }
        ],
        order: [[{ model: ModifierGroup }, "name", "ASC"]]
      });
      if (!row) return res.status(404).json({ error: "Producto no encontrado" });
      res.json(row);
    } catch (e) {
      console.log("Error al agregar producto", e)
      next(e);
    }
  }
);


export default router;
