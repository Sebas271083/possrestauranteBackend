import { Joi } from "celebrate";

export const printerCreate = Joi.object({
  name: Joi.string().max(80).required(),
  role: Joi.string().valid("kitchen","bar","cash","other").required(),
  interface: Joi.string().valid("network","file").default("network"),
  host: Joi.string().ip({ version: ["ipv4","ipv6"] }).when("interface",{ is:"network", then:Joi.required() }),
  port: Joi.number().integer().min(1).max(65535).default(9100),
  file_path: Joi.string().max(255).when("interface",{ is:"file", then:Joi.required() }),
  width_chars: Joi.number().integer().min(24).max(64).default(42),
  codepage: Joi.string().max(20).default("CP437"),
  is_active: Joi.boolean().default(true)
});

export const idParam = Joi.object({ id: Joi.number().integer().required() });

export const enqueueKitchenBody = Joi.object({
  order_id: Joi.number().integer().required(),
  station: Joi.string().max(50).required(), // cocina / barra / pizza (para filtrar ítems por station)
  reprint: Joi.boolean().default(false)
});

export const enqueueCashBody = Joi.object({
  order_id: Joi.number().integer().required(),
  copy_count: Joi.number().integer().min(1).max(3).default(1),
  reprint: Joi.boolean().default(false)
});
