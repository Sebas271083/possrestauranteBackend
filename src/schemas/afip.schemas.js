import { Joi } from "celebrate";

export const wsfeIssueBody = Joi.object({
  order_id: Joi.number().integer().required(),
  cbte_tipo: Joi.number().valid(1,6,11).default(11),    // 1=A, 6=B, 11=C
  pto_vta: Joi.number().integer().min(1),
  concepto: Joi.number().valid(1,2,3).default(1),
  doc_tipo: Joi.number().valid(80,96,99).default(99),
  doc_nro: Joi.string().default("0"),
  iva_rate: Joi.number().valid(27,21,10.5,5,2.5,0).default(21) // solo si cbte_tipo=6 (B)
});




export const voucherIdParam = Joi.object({ id: Joi.number().integer().required() });
