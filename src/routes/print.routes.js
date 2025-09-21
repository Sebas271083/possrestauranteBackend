import express from "express";
import { celebrate, Segments } from "celebrate";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { Printer, PrintJob } from "../models/index.js";
import { printerCreate, idParam, enqueueKitchenBody, enqueueCashBody } from "../schemas/print.schemas.js";
import { enqueueKitchen, enqueueCash } from "../services/printQueue.service.js";
import { enqueueFiscalByVoucher } from "../services/printQueue.service.js";
import { voucherIdParam } from "../schemas/afip.schemas.js";

const router = express.Router();

// Impresoras
router.get("/printers", requireAuth, requireRole("admin","manager"), async (_req,res,next)=>{
  try { res.json(await Printer.findAll({ order:[["name","ASC"]] })); }
  catch(e){ next(e); }
});

router.post("/printers",
  requireAuth, requireRole("admin","manager"),
  celebrate({ [Segments.BODY]: printerCreate }),
  async (req,res,next)=>{ try {
    const row = await Printer.create(req.body);
    res.status(201).json(row);
  } catch(e){ next(e); } }
);

// Encolar ticket cocina/barra por estación
router.post("/print/kitchen",
  requireAuth,
  celebrate({ [Segments.BODY]: enqueueKitchenBody }),
  async (req,res,next)=>{ const t = await PrintJob.sequelize.transaction();
    try {
      const job = await enqueueKitchen({ station: req.body.station, order_id: req.body.order_id }, t);
      await t.commit();
      res.status(201).json({ ok:true, job_id: job.id });
    } catch(e){ await t.rollback(); next(e); } }
);

// Encolar ticket caja (no fiscal)
router.post("/print/cash",
  requireAuth, requireRole("admin","manager","cashier"),
  celebrate({ [Segments.BODY]: enqueueCashBody }),
  async (req,res,next)=>{ const t = await PrintJob.sequelize.transaction();
    try {
      const job = await enqueueCash({ order_id: req.body.order_id, copy: req.body.copy_count }, t);
      await t.commit();
      res.status(201).json({ ok:true, job_id: job.id });
    } catch(e){ await t.rollback(); next(e); } }
);

// Ver cola
router.get("/print/jobs",
  requireAuth, requireRole("admin","manager"),
  async (_req,res,next)=>{ try {
    const rows = await PrintJob.findAll({ order:[["created_at","DESC"]], limit: 100 });
    res.json(rows);
  } catch(e){ next(e); } }
);

// Descargar payload (debug)
router.get("/print/jobs/:id/payload",
  requireAuth, requireRole("admin","manager"),
  celebrate({ [Segments.PARAMS]: idParam }),
  async (req,res,next)=>{ try {
    const job = await PrintJob.findByPk(req.params.id);
    if (!job) return res.status(404).json({ error:"Job no encontrado" });
    res.setHeader("Content-Type","application/octet-stream");
    res.setHeader("Content-Disposition",`attachment; filename=job_${job.id}.escpos`);
    res.send(job.payload);
  } catch(e){ next(e); } }
);


// Reimprimir ticket fiscal (por voucher)
router.post(
  "/print/fiscal/:id/reprint",
  requireAuth, requireRole("admin","manager","cashier"),
  celebrate({ [Segments.PARAMS]: voucherIdParam }),
  async (req,res,next)=>{ const t = await PrintJob.sequelize.transaction();
    try {
      const job = await enqueueFiscalByVoucher({ voucher_id: req.params.id }, t);
      await t.commit();
      res.status(201).json({ ok:true, job_id: job.id });
    } catch (e) { await t.rollback(); next(e); } }
);


export default router;
