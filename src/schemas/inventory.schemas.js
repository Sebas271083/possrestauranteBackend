import { Joi } from "celebrate";

export const idParam = Joi.object({ id: Joi.number().integer().required() });

export const ingredientCreate = Joi.object({
  name: Joi.string().max(120).required(),
  sku: Joi.string().max(64).allow("", null),
  unit: Joi.string().max(20).default("unidad"),
  stock_qty: Joi.number().precision(3).min(0).default(0),
  min_qty: Joi.number().precision(3).min(0).default(0),
  cost_per_unit: Joi.number().precision(4).min(0).default(0),
  is_active: Joi.boolean().default(true)
});
export const ingredientUpdate = Joi.object({
  name: Joi.string().max(120),
  sku: Joi.string().max(64).allow("", null),
  unit: Joi.string().max(20),
  stock_qty: Joi.number().precision(3).min(0),
  min_qty: Joi.number().precision(3).min(0),
  cost_per_unit: Joi.number().precision(4).min(0),
  is_active: Joi.boolean()
}).min(1);

export const recipeSetBody = Joi.object({
  items: Joi.array().items(Joi.object({
    ingredient_id: Joi.number().integer().required(),
    qty_per_unit: Joi.number().precision(3).min(0.001).required(),
    waste_factor: Joi.number().precision(4).min(0).max(1).default(0)
  })).min(1).required()
});

export const purchaseBody = Joi.object({
  ingredient_id: Joi.number().integer().required(),
  qty: Joi.alternatives().try(Joi.number(), Joi.string().trim()).required(), // acepta "7,5"
  uom: Joi.string().valid("g","kg","ml","l","unidad","u","un").optional(),
  cost_uom: Joi.string().valid("g","kg","ml","l","unidad","u","un").optional(),
  unit_cost: Joi.alternatives().try(Joi.number(), Joi.string().trim()).default(0),
  ref: Joi.string().allow("", null),
  meta: Joi.object().unknown(true).optional(),
});


export const adjustBody = Joi.object({
  ingredient_id: Joi.number().integer().required(),
  qty: Joi.alternatives().try(Joi.number(), Joi.string().trim()).required(), // delta (+/-)
  uom: Joi.string().valid("g","kg","ml","l","unidad","u","un").optional(),
  ref: Joi.string().allow("", null),
  meta: Joi.object().unknown(true).optional(),
});

export const countBody = Joi.object({
  ingredient_id: Joi.number().integer().required(),
  target_qty: Joi.alternatives().try(Joi.number(), Joi.string().trim()).required(),
  uom: Joi.string().valid("g","kg","ml","l","unidad","u","un").optional(),
  ref: Joi.string().allow("", null),
  meta: Joi.object().unknown(true).optional(),
});
