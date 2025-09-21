import express from "express";
import { celebrate, Segments } from "celebrate";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { wsfeIssueBody, voucherIdParam } from "../schemas/afip.schemas.js";
import { authorizeInvoiceForOrder } from "../services/afip.wsfe.service.js";
import { AfipVoucher } from "../models/AfipVoucher.js";

const router = express.Router();

// Emitir CAE para una orden (Factura C por defecto)
router.post(
  "/afip/wsfe/issue",
  requireAuth, requireRole("admin","manager","cashier"),
  celebrate({ [Segments.BODY]: wsfeIssueBody }),
  async (req, res, next) => {
    try {
      const v = await authorizeInvoiceForOrder(
        req.body.order_id,
        {
          cbteTipo: req.body.cbte_tipo,
          ptoVta: req.body.pto_vta,
          concepto: req.body.concepto,
          docTipo: req.body.doc_tipo,
          docNro: req.body.doc_nro
        },
        req.user
      );
      res.status(201).json(v);
    } catch (e) { next(e); }
  }
);

// Consultar CAE guardado
router.get(
  "/afip/wsfe/vouchers/:id",
  requireAuth, requireRole("admin","manager"),
  celebrate({ [Segments.PARAMS]: voucherIdParam }),
  async (req,res,next)=>{
    try {
      const row = await AfipVoucher.findByPk(req.params.id);
      if (!row) return res.status(404).json({ error: "Voucher no encontrado" });
      res.json(row);
    } catch (e) { next(e); }
  }
);

export default router;
