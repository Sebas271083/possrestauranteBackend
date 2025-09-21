import { Joi } from "celebrate";

export const loginBody = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  twofa_token: Joi.string().length(6).optional() // si el user tiene 2FA habilitado
});

export const refreshBody = Joi.object({
  refresh_token: Joi.string().required()
});

export const twofaSetupBody = Joi.object({
  // nada por ahora
});

export const twofaVerifyBody = Joi.object({
  token: Joi.string().length(6).required()
});
