import { Joi } from "celebrate";

export const supplierCreate = Joi.object({
  name: Joi.string().max(120).required(),
  tax_id: Joi.string().max(32).allow("", null),
  email: Joi.string().email().allow("", null),
  phone: Joi.string().max(40).allow("", null),
  address: Joi.string().max(200).allow("", null),
  notes: Joi.string().max(255).allow("", null),
  is_active: Joi.boolean().default(true)
});

export const supplierUpdate = supplierCreate.min(1);

export const poCreate = Joi.object({
  supplier_id: Joi.number().integer().required(),
  ref_number: Joi.string().max(60).allow("", null),
  notes: Joi.string().max(255).allow("", null),
  items: Joi.array().items(Joi.object({
    ingredient_id: Joi.number().integer().required(),
    qty: Joi.number().precision(3).min(0.001).required(),
    unit_cost: Joi.number().precision(4).min(0).required()
  })).min(1).required()
});

export const poStatusBody = Joi.object({
  status: Joi.string().valid("draft","sent","cancelled").required()
});

export const poReceiveBody = Joi.object({
  items: Joi.array().items(Joi.object({
    item_id: Joi.number().integer().required(),
    received_qty: Joi.number().precision(3).min(0).required(),
    unit_cost: Joi.number().precision(4).min(0).optional() // permitir ajustar costo real al recibir
  })).min(1).required(),
  ref_invoice: Joi.string().max(120).allow("", null),
  notes: Joi.string().max(255).allow("", null)
});
