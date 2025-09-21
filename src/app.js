// src/app.js
import "dotenv/config.js";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import pino from "pino-http";
import cookieParser from "cookie-parser";
import compression from "compression";
import morgan from "morgan";
import { errors as celebrateErrors } from "celebrate";
import path from "node:path";

import authRoutes from "./routes/auth.routes.js";
import salonRoutes from "./routes/salon.routes.js";
import kdsRoutes from "./routes/kds.routes.js";
import splitRoutes from "./routes/split.routes.js";
import cashRoutes from "./routes/cash.routes.js";
import inventoryRoutes from "./routes/inventory.routes.js";
import printRoutes from "./routes/print.routes.js";
import alertsRoutes from "./routes/alerts.routes.js";
import reportsRoutes from "./routes/reports.routes.js";
import auditRoutes from "./routes/audit.routes.js";
import mpRoutes from "./routes/mp.routes.js";
import afipRoutes from "./routes/afip.routes.js";
import mpRefundsRoutes from "./routes/mp.refunds.routes.js";
import purchaseRoutes from "./routes/purchase.routes.js";
import stocktakeRoutes from "./routes/stocktake.routes.js";
import costsRoutes from "./routes/costs.routes.js";
import pricingRoutes from "./routes/pricing.routes.js";
import catalogRoutes from "./routes/catalog.routes.js";
import productMediaRoutes from "./routes/product.media.routes.js";
import adminCatalogRoutes from "./routes/admin.catalog.routes.js";
import adminModifiersRoutes from "./routes/admin.modifiers.routes.js";
import cashierRoutes from "./routes/cashier.routes.js" ;
import cashierPaymentsRoutes from "./routes/cashier.payments.routes.js";
import cashierSessionsRoutes from "./routes/cashier.sessions.routes.js";
import hrRouter from "./routes/hr.routes.js";

import { errorHandler } from "./middleware/error.js";
import { sequelize } from "./config/db.js";
import "./models/index.js";

const app = express();

/* -------- Infra / seguridad -------- */
app.use(pino());

const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";

app.use(cors({
  origin: CORS_ORIGIN,
  credentials: true,
  methods: ["GET","POST","PATCH","PUT","DELETE","OPTIONS","HEAD"],
  allowedHeaders: ["Content-Type","Authorization"],
  exposedHeaders: ["Content-Length","Content-Range"],
}));

// Preflight genérico SIN usar app.options("*")
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", CORS_ORIGIN);
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS,HEAD");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }, // <- clave
    // si tenías COEP/COOP y no los necesitás en dev, desactivalos:
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
  })
);
app.use(compression());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

/* Body parsers
   Nota: el webhook de MP usa express.raw en su propia ruta dentro de mp.routes.js,
   por lo que este express.json() no interfiere. */
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());



app.use("/api/v1", adminCatalogRoutes);

if ((process.env.FILES_DRIVER || "local") === "local") {
  const uploadDir = process.env.UPLOAD_DIR || "./uploads";
  app.use(
    "/uploads",
    express.static(path.resolve(uploadDir), {
      maxAge: "7d",
      etag: true,
      immutable: false,
      setHeaders: (res) => {
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      // opcional: CORS tradicional (no es necesario para <img>, pero suma)
      res.setHeader("Access-Control-Allow-Origin", "*");
      }
  })
  );
}

/* -------- Healthchecks -------- */
app.get("/healthz", (_req, res) => res.json({ ok: true }));
app.get("/readyz", async (_req, res) => {
  try {
    await (await import("./config/db.js")).sequelize.authenticate();
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});
app.get("/health", (_req, res) => res.json({ ok: true }));

/* -------- Rutas -------- */
/* authRoutes define /auth/login, /auth/refresh, etc.
   Por eso lo montamos en /api/v1 (NO en /api/v1/auth). */
app.use("/api/v1", authRoutes);

app.use("/api/v1/salon", salonRoutes);
app.use("/api/v1/kds", kdsRoutes);
app.use("/api/v1", splitRoutes);
app.use("/api/v1", cashRoutes);
app.use("/api/v1", inventoryRoutes);
app.use("/api/v1", printRoutes);
app.use("/api/v1", alertsRoutes);
app.use("/api/v1", reportsRoutes);
app.use("/api/v1", auditRoutes);
app.use("/api/v1", mpRoutes);
app.use("/api/v1", afipRoutes);
app.use("/api/v1", mpRefundsRoutes);
app.use("/api/v1", purchaseRoutes);
app.use("/api/v1", stocktakeRoutes);
app.use("/api/v1", costsRoutes);
app.use("/api/v1", pricingRoutes);
app.use("/api/v1", catalogRoutes);
app.use("/api/v1", productMediaRoutes);
app.use("/api/v1", adminModifiersRoutes);
app.use("/api/v1/cashier", cashierRoutes)
app.use("/api/v1/cashier/payments", cashierPaymentsRoutes);
app.use("/api/v1/cashier/sessions", cashierSessionsRoutes);
app.use("/api/v1/reports", reportsRoutes); // <- para que /reports no requiera auth
app.use("/api/v1", hrRouter);




/* -------- 404 -------- */
app.use((req, res, _next) => {
  res.status(404).json({ error: "Not Found", path: req.originalUrl });
});


/* -------- Errores de celebrate -------- */
app.use(celebrateErrors());

/* -------- Handler de errores general -------- */
app.use(errorHandler);

export async function initApp() {
  await sequelize.sync({ alter: false }); // 👈 SOLO UNA VEZ
  return app;
}

export default app;
