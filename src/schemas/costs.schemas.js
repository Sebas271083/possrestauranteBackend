import { Joi } from "celebrate";

export const rangeQuery = Joi.object({
  from: Joi.date().iso().required(),
  to: Joi.date().iso().required()
});
