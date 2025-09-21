import { Joi } from "celebrate";

export const mpCreateBody = Joi.object({
  order_id: Joi.number().integer().required(),
  // opcional por si querés overridear back URLs
  back_urls: Joi.object({
    success: Joi.string().uri(),
    failure: Joi.string().uri(),
    pending: Joi.string().uri()
  }).optional()
});

// Webhook: MercadoPago envía varias formas: topic=payment, type, data.id, etc.
export const mpWebhookQuery = Joi.object({
  topic: Joi.string().optional(),
  type: Joi.string().optional()
});


export const paymentIdParam = Joi.object({
  id: Joi.number().integer().required() // id del pago LOCAL (tabla payments), NO el de MP
});

export const refundPartialBody = Joi.object({
  amount: Joi.number().precision(2).min(0.01).required(),
  reason: Joi.string().max(180).allow("", null)
});