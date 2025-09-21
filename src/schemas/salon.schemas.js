// src/schemas/salon.schemas.js
import { Joi } from "celebrate";

const catalogItem = Joi.object({
  product_id: Joi.number().integer().required(),
  quantity: Joi.number().integer().min(1).default(1),
  option_ids: Joi.array().items(Joi.number().integer()).default([]),
  notes: Joi.string().allow("", null),
});

export const idParam = Joi.object({ id: Joi.number().integer().required() });
export const itemIdParam = Joi.object({ itemId: Joi.number().integer().required() });

export const areaCreate = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  color: Joi.string().max(20).allow("", null),
  sort_order: Joi.number().integer().min(0).default(0)
});

export const areaUpdate = Joi.object({
  name: Joi.string().min(1).max(100),
  color: Joi.string().max(20).allow("", null),
  sort_order: Joi.number().integer().min(0),
  is_active: Joi.boolean()
}).min(1);

export const tableCreate = Joi.object({
  area_id: Joi.number().integer().required(),
  label: Joi.string().max(50).required(),
  capacity: Joi.number().integer().min(1).default(2),
  status: Joi.string().valid("free", "occupied", "reserved", "blocked").default("free"),
  note: Joi.string().max(255).allow("", null),

  layout_x: Joi.number().integer().min(0).default(40),
  layout_y: Joi.number().integer().min(0).default(40),
  layout_w: Joi.number().integer().min(32).max(640).default(96),
  layout_h: Joi.number().integer().min(32).max(640).default(96),
  layout_rot: Joi.number().integer().min(0).max(359).default(0),
  layout_shape: Joi.string().valid("circle", "rect").default("circle")
}).required();

export const tableUpdate = Joi.object({
  area_id: Joi.number().integer(),
  label: Joi.string().max(50),
  capacity: Joi.number().integer().min(1),
  status: Joi.string().valid("free", "occupied", "reserved", "blocked"),
  note: Joi.string().max(255).allow("", null)
}).min(1);

export const openTableBody = Joi.object({
  guests: Joi.number().integer().min(1).default(1),
  notes: Joi.string().max(255).allow("", null)
});

export const orderItemsBody = Joi.object({
  items: Joi.array().items(
    Joi.object({
      item_name: Joi.string().max(150).required(),
      quantity: Joi.number().integer().min(1).required(),
      unit_price: Joi.number().precision(2).min(0).required(),
      notes: Joi.string().max(255).allow("", null),
      station: Joi.string().max(50).allow("", null),
      modifiers_json: Joi.object().unknown(true)
    })
  ).min(1).required()
});

export const patchItemBody = Joi.object({
  quantity: Joi.number().integer().min(1),
  status: Joi.string().valid("pending", "in_kitchen", "ready", "delivered", "void"),
  notes: Joi.string().max(255).allow("", null)
}).min(1);

export const closeOrderBody = Joi.object({
  service_total: Joi.number().precision(2).min(0).default(0),
  discount_total: Joi.number().precision(2).min(0).default(0),
  notes: Joi.string().max(255).allow("", null)
});

export const transferBody = Joi.object({
  target_table_id: Joi.number().integer().required()
});

export const joinOrdersBody = Joi.object({
  source_order_id: Joi.number().integer().required(),
  target_order_id: Joi.number().integer().required().disallow(Joi.ref("source_order_id"))
});


// Ítem por catálogo
const productItem = Joi.object({
  product_id: Joi.number().integer().required(),
  quantity: Joi.number().integer().min(1).required(),
  // IDs de opciones seleccionadas (modificadores)
  option_ids: Joi.array().items(Joi.number().integer()).default([]),
  notes: Joi.string().max(255).allow("", null)
});

// Ítem manual (compatibilidad)
const manualItem = Joi.object({
  item_name: Joi.string().min(1).max(150).required(),
  unit_price: Joi.number().precision(2).min(0).required(),
  quantity: Joi.number().integer().min(1).default(1),
  notes: Joi.string().allow("", null),
  station: Joi.string().allow("", null),
  modifiers_json: Joi.object().unknown(true).allow(null),
  cost_override: Joi.number().precision(4).allow(null),
});


export const orderItemsBodyV2 = Joi.object({
  items: Joi.array().min(1).items(
    Joi.alternatives().try(catalogItem, manualItem)
  ).required()
});


