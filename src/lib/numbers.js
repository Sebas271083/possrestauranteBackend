export function parseLocaleNumber(v) {
  if (typeof v === "number") return v;
  if (v == null) return 0;
  const s = String(v).trim();
  if (s === "") return 0;

  // Si el usuario usa formato es-AR (1.234,56)
  if (s.includes(",")) {
    return Number(s.replace(/\./g, "").replace(",", "."));
  }
  // Si no hay coma, tomamos punto como decimal normal (1000.0000 -> 1000)
  return Number(s);
}