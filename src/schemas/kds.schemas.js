import { Joi } from "celebrate";

// Acepta cualquier nombre de estación razonable (cocina, barra, pizza, etc.)
export const stationParam = Joi.object({
  station: Joi.string().min(2).max(50).required()
});

// Defaults seguros para que nunca tire 400 si no mandás status o limit
export const queueQuery = Joi.object({
  status: Joi.string().default("queued,in_kitchen"), // se parsea abajo
  limit: Joi.number().integer().min(1).max(500).default(200)
});

export const itemIdParam = Joi.object({
  id: Joi.number().integer().required()
});

export const setStatusBody = Joi.object({
  status: Joi.string().valid("pending","in_kitchen","ready","delivered","void").required()
});

export const orderIdParam = Joi.object({
  orderId: Joi.number().integer().required()
});
