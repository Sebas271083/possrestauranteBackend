import { celebrate, Segments, Joi } from 'celebrate';

export const idParam = Joi.object({ id: Joi.number().integer().required() });

export const employeeCreate = Joi.object({
  first_name: Joi.string().min(1).required(),
  last_name:  Joi.string().min(1).required(),
  email: Joi.string().email().allow(null, ""),
  phone: Joi.string().allow(null, ""),
  dni:   Joi.string().allow(null, ""),
  cuil:  Joi.string().allow(null, ""),
  role:  Joi.string().allow(null, ""),
  pin_code: Joi.string().pattern(/^\d{4,6}$/).allow(null, ""),
  hire_date: Joi.date().iso().allow(null, ""),
  termination_date: Joi.date().iso().allow(null, ""),
  is_active: Joi.boolean().default(true),
  hourly_rate: Joi.number().min(0).default(0),
  base_salary: Joi.number().min(0).default(0),
});

export const employeeUpdate = employeeCreate.fork(
  Object.keys(employeeCreate.describe().keys),
  (schema) => schema.optional()
);

export const clockInBody = Joi.object({
  pin_code: Joi.string().pattern(/^\d{4,6}$/).required(),
  note: Joi.string().allow("", null),
  at: Joi.date().iso().optional(),      // manual override
  source: Joi.string().valid("kiosk","manual","api").default("kiosk")
});

export const clockOutBody = Joi.object({
  pin_code: Joi.string().pattern(/^\d{4,6}$/).required(),
  note: Joi.string().allow("", null),
  at: Joi.date().iso().optional(),
  break_minutes: Joi.number().integer().min(0).default(0),
  source: Joi.string().valid("kiosk","manual","api").default("kiosk")
});

export const sessionAdjustBody = Joi.object({
  check_in_at: Joi.date().iso().required(),
  check_out_at: Joi.date().iso().required(),
  break_minutes: Joi.number().integer().min(0).default(0),
  note: Joi.string().allow("", null)
});
