import { Joi } from "celebrate";

export const splitBody = Joi.object({
  source_order_id: Joi.number().integer().required(),
  target_table_id: Joi.number().integer().optional(), // si querés mover a otra mesa
  move: Joi.array().items(
    Joi.object({
      item_id: Joi.number().integer().required(),
      quantity: Joi.number().integer().min(1).required()
    })
  ).min(1).required(),
  notes: Joi.string().max(255).allow("", null)
});
