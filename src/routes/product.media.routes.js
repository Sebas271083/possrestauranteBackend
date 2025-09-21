import express from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { Product } from "../models/index.js";
import { storeProductImage, deleteProductImages } from "../services/storage.service.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() }); // buffer en memoria

// Subir o reemplazar imagen
router.post(
  "/products/:id/image",
  requireAuth, requireRole("admin","manager"),
  upload.single("image"),
  async (req, res, next) => {
    try {
      const p = await Product.findByPk(req.params.id);
      if (!p) return res.status(404).json({ error: "Producto no encontrado" });
      if (!req.file?.buffer) return res.status(400).json({ error: "Falta archivo" });

      // si ya tenía, borramos anteriores
      const prevKeys = [];
      if (p.image_key) {
        const base = p.image_key.replace(/\.jpg$/,"");
        prevKeys.push(p.image_key, `${base}_w512.jpg`, `${base}_w256.jpg`);
      }
      if (prevKeys.length) await deleteProductImages(prevKeys);

      const saved = await storeProductImage(req.file.buffer);
      await p.update({ image_key: saved.key, image_url: saved.url, thumb_url: saved.thumb });

      res.status(201).json({ ok: true, image_url: p.image_url, thumb_url: p.thumb_url });
    } catch (e) { next(e); }
  }
);

// Borrar imagen
router.delete(
  "/products/:id/image",
  requireAuth, requireRole("admin","manager"),
  async (req, res, next) => {
    try {
      const p = await Product.findByPk(req.params.id);
      if (!p) return res.status(404).json({ error: "Producto no encontrado" });

      if (p.image_key) {
        const base = p.image_key.replace(/\.jpg$/,"");
        await deleteProductImages([p.image_key, `${base}_w512.jpg`, `${base}_w256.jpg`]);
        await p.update({ image_key: null, image_url: null, thumb_url: null });
      }
      res.json({ ok: true });
    } catch (e) { next(e); }
  }
);

export default router;
