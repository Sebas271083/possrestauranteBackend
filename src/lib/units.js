// src/lib/units.js
export const UOMS = {
  g:   { base: "g",    factor: 1 },
  kg:  { base: "g",    factor: 1000 },
  ml:  { base: "ml",   factor: 1 },
  l:   { base: "ml",   factor: 1000 },
  unidad: { base: "unidad", factor: 1 },
  u:      { base: "unidad", factor: 1 },
  un:     { base: "unidad", factor: 1 },
};

export function toBase(qty, uom, baseUnit) {
  const k = UOMS[(uom || "").toLowerCase()];
  if (!k) throw new Error("uom_desconocida");
  if (k.base !== baseUnit) throw new Error("uom_incompatible");
  return Number(qty || 0) * k.factor;
}

export function formatFromBase(qtyBase, baseUnit) {
  const q = Number(qtyBase || 0);
  if (baseUnit === "g")  return { qty: q / 1000, uom: "kg" };
  if (baseUnit === "ml") return { qty: q / 1000, uom: "L" };
  return { qty: q, uom: "un" };
}
