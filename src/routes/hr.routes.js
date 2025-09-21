// src/routes/hr.routes.js
// type: module
import express from "express";
import { celebrate, Segments } from "celebrate";
import { Op } from "sequelize";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { Employee, WorkSession } from "../models/index.js";
import {
  employeeCreate,
  employeeUpdate,
  idParam,
  clockInBody,
  clockOutBody,
  sessionAdjustBody,
} from "../schemas/hr.schemas.js";

const router = express.Router();

function getUserId(req) {
  return Number(req?.user?.sub ?? req?.user?.id ?? req?.user?.user_id ?? 0) || null;
}

/* =========================================================
   EMPLEADOS
   ========================================================= */

router.get("/hr/employees", requireAuth, async (_req, res, next) => {
  try {
    const rows = await Employee.findAll({
      order: [
        ["last_name", "ASC"],
        ["first_name", "ASC"],
      ],
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.get("/hr/employees/pin-available", async (req, res, next) => {
  try {
    const pin = String(req.query.pin || "").trim();
    if (!/^\d{4,6}$/.test(pin)) return res.json({ available: false, reason: "invalid" });
    const exists = await Employee.findOne({ where: { pin_code: pin } });
    return res.json({ available: !exists });
  } catch (e) {
    next(e);
  }
});

router.post(
  "/hr/employees",
  requireAuth,
  requireRole("admin", "manager"),
  celebrate({ [Segments.BODY]: employeeCreate }),
  async (req, res, next) => {
    try {
      const row = await Employee.create(req.body);
      res.status(201).json(row);
    } catch (e) {
      next(e);
    }
  }
);

router.patch(
  "/hr/employees/:id",
  requireAuth,
  requireRole("admin", "manager"),
  celebrate({ [Segments.PARAMS]: idParam, [Segments.BODY]: employeeUpdate }),
  async (req, res, next) => {
    try {
      const row = await Employee.findByPk(req.params.id);
      if (!row) return res.status(404).json({ error: "Empleado no encontrado" });
      await row.update(req.body);
      res.json(row);
    } catch (e) {
      next(e);
    }
  }
);

/* =========================================================
   FICHADA (KIOSCO): IN / OUT y TOGGLE
   ========================================================= */

// Entrada
router.post(
  "/hr/clock/in",
  celebrate({ [Segments.BODY]: clockInBody }),
  async (req, res, next) => {
    const t = await WorkSession.sequelize.transaction();
    try {
      const { pin_code, note, at, source } = req.body;
      const emp = await Employee.findOne({
        where: { pin_code, is_active: true },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!emp) {
        await t.rollback();
        return res.status(404).json({ error: "PIN inválido o empleado inactivo" });
      }

      const open = await WorkSession.findOne({
        where: { employee_id: emp.id, check_out_at: null },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (open) {
        await t.rollback();
        return res.status(409).json({ error: "Ya tenés una sesión abierta" });
      }

      const now = at ? new Date(at) : new Date();
      const s = await WorkSession.create(
        {
          employee_id: emp.id,
          check_in_at: now,
          source_in: source || "kiosk",
          note: note || null,
        },
        { transaction: t }
      );

      await t.commit();
      res.status(201).json({ ok: true, session: s });
    } catch (e) {
      await t.rollback();
      next(e);
    }
  }
);

// Salida
router.post(
  "/hr/clock/out",
  celebrate({ [Segments.BODY]: clockOutBody }),
  async (req, res, next) => {
    const t = await WorkSession.sequelize.transaction();
    try {
      const { pin_code, note, at, break_minutes, source } = req.body;
      const emp = await Employee.findOne({
        where: { pin_code, is_active: true },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!emp) {
        await t.rollback();
        return res.status(404).json({ error: "PIN inválido o empleado inactivo" });
      }

      const open = await WorkSession.findOne({
        where: { employee_id: emp.id, check_out_at: null },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!open) {
        await t.rollback();
        return res.status(409).json({ error: "No hay sesión abierta" });
      }

      const now = at ? new Date(at) : new Date();
      await open.update(
        {
          check_out_at: now,
          break_minutes: Number(break_minutes || 0),
          source_out: source || "kiosk",
          note: note || open.note,
        },
        { transaction: t }
      );

      await t.commit();
      res.json({ ok: true, session: open });
    } catch (e) {
      await t.rollback();
      next(e);
    }
  }
);

// Toggle IN/OUT — para kiosco: /hr/attendance/punch
router.post("/hr/attendance/punch", async (req, res, next) => {
  const t = await WorkSession.sequelize.transaction();
  try {
    const { pin_code, station = null, note = null, at = null, source = "kiosk" } = req.body || {};
    if (!pin_code) {
      await t.rollback();
      return res.status(400).json({ error: "Falta pin_code" });
    }

    const emp = await Employee.findOne({
      where: { pin_code: String(pin_code), is_active: true },
      attributes: ["id", "first_name", "last_name"],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!emp) {
      await t.rollback();
      return res.status(404).json({ error: "PIN inválido o empleado inactivo" });
    }

    // ¿Sesión abierta?
    const open = await WorkSession.findOne({
      where: { employee_id: emp.id, check_out_at: null },
      order: [["check_in_at", "DESC"]],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    const now = at ? new Date(at) : new Date();

    if (open) {
      // OUT
      await open.update(
        {
          check_out_at: now,
          source_out: source,
          note: note || open.note,
          // opcional: station_out si tu modelo lo tiene
          ...(WorkSession.rawAttributes?.station_out && station ? { station_out: station } : {}),
        },
        { transaction: t }
      );

      await t.commit();
      return res.json({
        status: "out",
        at: open.check_out_at,
        employee: { id: emp.id, first_name: emp.first_name, last_name: emp.last_name },
        station,
      });
    } else {
      // IN
      const payload = {
        employee_id: emp.id,
        check_in_at: now,
        source_in: source,
        note: note || null,
        // opcional: station_in si tu modelo lo tiene
        ...(WorkSession.rawAttributes?.station_in && station ? { station_in: station } : {}),
      };
      const created = await WorkSession.create(payload, { transaction: t });

      await t.commit();
      return res.json({
        status: "in",
        at: created.check_in_at,
        employee: { id: emp.id, first_name: emp.first_name, last_name: emp.last_name },
        station,
      });
    }
  } catch (e) {
    await t.rollback();
    next(e);
  }
});

/* =========================================================
   SESIONES: LISTAR / AJUSTAR
   ========================================================= */

// Listar sesiones por rango
router.get("/hr/sessions", requireAuth, requireRole("admin", "manager"), async (req, res, next) => {
  try {
    const { from, to, employee_id } = req.query;
    const where = {};
    if (employee_id) where.employee_id = Number(employee_id);
    if (from || to) {
      where.check_in_at = {};
      if (from) where.check_in_at[Op.gte] = new Date(from);
      if (to) where.check_in_at[Op.lte] = new Date(to);
    }

    const rows = await WorkSession.findAll({
      where,
      include: [{ model: Employee }],
      order: [["check_in_at", "DESC"]],
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// Ajustar sesión puntual
router.patch(
  "/hr/sessions/:id",
  requireAuth,
  requireRole("admin", "manager"),
  celebrate({ [Segments.PARAMS]: idParam, [Segments.BODY]: sessionAdjustBody }),
  async (req, res, next) => {
    const t = await WorkSession.sequelize.transaction();
    try {
      const row = await WorkSession.findByPk(req.params.id, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!row) {
        await t.rollback();
        return res.status(404).json({ error: "Sesión no encontrada" });
      }

      const { check_in_at, check_out_at, break_minutes, note } = req.body;
      const approver = getUserId(req);

      await row.update(
        {
          check_in_at: new Date(check_in_at),
          check_out_at: new Date(check_out_at),
          break_minutes: Number(break_minutes || 0),
          note: note || row.note,
          approved_by: approver,
          approved_at: new Date(),
        },
        { transaction: t }
      );

      await t.commit();
      res.json(row);
    } catch (e) {
      await t.rollback();
      next(e);
    }
  }
);

/* =========================================================
   RESUMEN HORAS / COSTO POR PERÍODO
   ========================================================= */

router.get("/hr/payroll/preview", requireAuth, requireRole("admin", "manager"), async (req, res, next) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: "Parámetros 'from' y 'to' requeridos (YYYY-MM-DD)" });

    const sessions = await WorkSession.findAll({
      where: { check_in_at: { [Op.gte]: new Date(from), [Op.lte]: new Date(to) } },
      include: [{ model: Employee }],
    });

    const map = new Map();
    for (const s of sessions) {
      const emp = s.Employee;
      if (!emp) continue;
      const id = emp.id;

      const inAt = new Date(s.check_in_at);
      const outAt = s.check_out_at ? new Date(s.check_out_at) : null;
      let minutes = 0;
      if (outAt && outAt > inAt) {
        minutes = Math.max(0, (outAt - inAt) / 60000 - Number(s.break_minutes || 0));
      }

      const prev = map.get(id) || { employee: emp, minutes: 0, hours: 0, cost: 0 };
      prev.minutes += minutes;
      prev.hours = prev.minutes / 60;
      const hr = Number(emp.hourly_rate || 0);
      prev.cost = prev.hours * hr;
      map.set(id, prev);
    }

    const rows = Array.from(map.values()).map((r) => ({
      employee_id: r.employee.id,
      name: `${r.employee.last_name}, ${r.employee.first_name}`,
      hours: Number(r.hours.toFixed(2)),
      cost: Number(r.cost.toFixed(2)),
      hourly_rate: Number(r.employee.hourly_rate || 0),
    }));

    const totals = rows.reduce(
      (a, b) => ({ hours: a.hours + b.hours, cost: a.cost + b.cost }),
      { hours: 0, cost: 0 }
    );

    res.json({ from, to, rows, totals });
  } catch (e) {
    next(e);
  }
});

router.get("/hr/attendance", requireAuth, requireRole("admin","manager"), async (req, res, next) => {
  try {
    const { from, to, employee_id } = req.query;

    // rango [from 00:00, to 23:59]
    const fromDate = from ? new Date(`${from}T00:00:00.000Z`) : null;
    const toDate   = to   ? new Date(`${to}T23:59:59.999Z`)   : null;

    const where = {};
    if (employee_id) where.employee_id = Number(employee_id);

    // traer sesiones que toquen el rango (in dentro, out dentro, o que lo crucen entero)
    if (fromDate || toDate) {
      const rangeCI = {};
      const rangeCO = {};
      if (fromDate) { rangeCI[Op.gte] = fromDate; rangeCO[Op.gte] = fromDate; }
      if (toDate)   { rangeCI[Op.lte] = toDate;   rangeCO[Op.lte] = toDate;   }

      where[Op.or] = [
        { check_in_at:  rangeCI },
        { check_out_at: rangeCO },
        ...(fromDate && toDate
          ? [{ [Op.and]: [{ check_in_at: { [Op.lt]: fromDate } }, { check_out_at: { [Op.gt]: toDate } }] }]
          : []
        ),
      ];
    }

    const sessions = await WorkSession.findAll({
      where,
      include: [{ model: Employee, attributes: ["id","first_name","last_name"] }],
      order: [["check_in_at","DESC"]],
    });

    // helper inRange (para filtrar cada punch dentro del rango exacto)
    const inRange = (d) => {
      if (!d) return false;
      const ts = new Date(d).getTime();
      if (fromDate && ts < fromDate.getTime()) return false;
      if (toDate   && ts > toDate.getTime())   return false;
      return true;
    };

    // aplanar sesiones -> eventos
    const events = [];
    for (const s of sessions) {
      const emp = s.Employee ? { first_name: s.Employee.first_name, last_name: s.Employee.last_name } : null;

      if (!fromDate && !toDate) {
        // sin filtro: emitimos ambos si existen
        if (s.check_in_at)  events.push({ id: `${s.id}-in`,  employee_id: s.employee_id, type: "in",  at: s.check_in_at,  station: s.station_in  ?? null, employee: emp });
        if (s.check_out_at) events.push({ id: `${s.id}-out`, employee_id: s.employee_id, type: "out", at: s.check_out_at, station: s.station_out ?? null, employee: emp });
      } else {
        if (s.check_in_at  && inRange(s.check_in_at))  events.push({ id: `${s.id}-in`,  employee_id: s.employee_id, type: "in",  at: s.check_in_at,  station: s.station_in  ?? null, employee: emp });
        if (s.check_out_at && inRange(s.check_out_at)) events.push({ id: `${s.id}-out`, employee_id: s.employee_id, type: "out", at: s.check_out_at, station: s.station_out ?? null, employee: emp });
      }
    }

    // orden por fecha desc como pedía tu UI
    events.sort((a, b) => new Date(b.at) - new Date(a.at));

    res.json(events);
  } catch (e) {
    next(e);
  }
});


router.get("/hr/employees/pin-available", requireAuth, requireRole("admin","manager"), async (req, res, next) => {
  try {
    const pin = String(req.query.pin || "").trim();
    const excludeId = req.query.exclude_id ? Number(req.query.exclude_id) : null;

    // formato 4–6 dígitos
    if (!/^\d{4,6}$/.test(pin)) return res.json({ available: false, reason: "invalid" });

    const where = { pin_code: pin };
    if (excludeId) where.id = { [Op.ne]: excludeId };

    const count = await Employee.count({ where });
    res.json({ available: count === 0 });
  } catch (e) {
    next(e);
  }
});
  
export default router;
