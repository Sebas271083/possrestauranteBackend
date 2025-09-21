import { Joi } from "celebrate";

export const openCashBody = Joi.object({
  opening_float: Joi.number().precision(2).min(0).default(0),
  notes: Joi.string().max(255).allow("", null)
});

export const closeCashBody = Joi.object({
  closing_cash_counted: Joi.number().precision(2).min(0).required(),
  notes: Joi.string().max(255).allow("", null)
});

export const paymentBody = Joi.object({
  order_id: Joi.number().integer().required(),
  method: Joi.string().valid("cash","card","mp_link","mp_point","other").required(),
  amount: Joi.number().precision(2).min(0.01).required(),
  ref: Joi.string().max(120).allow("", null),
  meta: Joi.object().unknown(true)
});
