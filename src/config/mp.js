import mercadopago from "mercadopago";

export function initMP() {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) throw new Error("Falta MP_ACCESS_TOKEN en el .env");
  mercadopago.configure({ access_token: token });
  return mercadopago;
}
