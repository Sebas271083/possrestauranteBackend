import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { AuditLog } from "../models/index.js";

const router = express.Router();

router.get("/audit",
  requireAuth, requireRole("admin","manager"),
  async (_req,res,next)=> {
    try {
      const rows = await AuditLog.findAll({ order:[["created_at","DESC"]], limit: 200 });
      res.json(rows);
    } catch (e) { next(e); }
  }
);

export default router;
