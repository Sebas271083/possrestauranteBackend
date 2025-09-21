import { Joi } from "celebrate";

export const stockCountCreate = Joi.object({
  name: Joi.string().max(120).required(),
  notes: Joi.string().max(255).allow("", null),
  items: Joi.array().items(Joi.object({
    ingredient_id: Joi.number().integer().required(),
    counted_qty: Joi.number().precision(3).min(0).required()
  })).min(1).required()
});

export const stockCountSubmit = Joi.object({
  // permitir enviar ítems actualizados
  items: Joi.array().items(Joi.object({
    ingredient_id: Joi.number().integer().required(),
    counted_qty: Joi.number().precision(3).min(0).required()
  })).min(1).required(),
  notes: Joi.string().max(255).allow("", null)
});
