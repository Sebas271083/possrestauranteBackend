import { Joi } from "celebrate";

export const pricingSuggestBody = Joi.object({
  // modo 1: productos del catálogo
  product_ids: Joi.array().items(Joi.number().integer()).min(1),

  // modo 2: items manuales (nombre + costo)
  manual_items: Joi.array().items(Joi.object({
    item_name: Joi.string().max(120).required(),
    unit_cost: Joi.number().precision(4).min(0).required()
  })),

  // estrategia
  markup: Joi.number().precision(4).min(0),          // ej 0.6 → +60%
  target_margin: Joi.number().precision(4).min(0).max(0.95), // ej 0.7 → 70%

  // redondeo
  round_to: Joi.number().valid(1,5,10,50,100).default(10), // múltiplo
  psychological: Joi.boolean().default(false)              // termina en .99
}).xor("product_ids","manual_items") // uno u otro
  .xor("markup","target_margin");     // una estrategia
