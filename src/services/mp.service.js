import crypto from "crypto";
import { initMP } from "../config/mp.js";

export async function createCheckoutPreference({ order, items, backUrls }) {
  const mp = initMP();
  const preference = {
    items: items.map(i => ({
      title: i.item_name,
      quantity: i.quantity,
      currency_id: "ARS",
      unit_price: Number(i.unit_price)
    })),
    external_reference: `ORDER#${order.id}`,
    back_urls: backUrls || {
      success: `${process.env.PUBLIC_BASE_URL}/payments/success`,
      failure: `${process.env.PUBLIC_BASE_URL}/payments/failure`,
      pending: `${process.env.PUBLIC_BASE_URL}/payments/pending`
    },
    auto_return: "approved",
    notification_url: `${process.env.PUBLIC_BASE_URL}/api/v1/webhooks/mp`
  };

  const { body } = await mp.preferences.create(preference);
  return body; // contiene init_point, id, etc.
}

export async function getPaymentById(paymentId) {
  const mp = initMP();
  const { body } = await mp.payment.get(paymentId);
  return body;
}

/**
 * (Opcional) Verificación simple de firma de webhook.
 * Si usás la firma V2 de MP (X-Signature con keyId/ts/hmacSha256 etc.),
 * podés implementar acá. Como placeholder dejamos HMAC de body.
 */
export function verifyWebhookSignature(rawBody, signatureHeader) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return true; // si no configuraste secreto, no verificamos
  if (!signatureHeader) return false;

  // Placeholder genérico HMAC SHA256 del body (ajusta si habilitás firma V2 real)
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  return expected === signatureHeader;
}


// Refund TOTAL
export async function mpRefundFull({ paymentId }) {
  const mp = initMP();
  const { body } = await mp.refund.create({ payment_id: paymentId });
  return body; // incluye refund id, amount, status
}

// Refund PARCIAL
export async function mpRefundPartial({ paymentId, amount }) {
  const mp = initMP();
  const { body } = await mp.refund.create({ payment_id: paymentId, amount: Number(amount) });
  return body;
}

// Listar refunds de un pago
export async function mpListRefunds({ paymentId }) {
  const mp = initMP();
  const { body } = await mp.refund.get({ payment_id: paymentId });
  // SDK devuelve array con refunds
  return body;
}