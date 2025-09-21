import express from "express";
import { celebrate, Segments } from "celebrate";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { mpCreateBody, mpWebhookQuery } from "../schemas/mp.schemas.js";
import { Order, OrderItem, Payment, Table } from "../models/index.js";
import { createCheckoutPreference, getPaymentById, verifyWebhookSignature, mpListRefunds } from "../services/mp.service.js";
import { audit } from "../services/audit.service.js";
import { Op } from "sequelize";

const router = express.Router();

/**
 * Crear link de pago (Checkout Pro)
 */
router.post(
  "/payments/mp/create-link",
  requireAuth, requireRole("admin","manager","cashier"),
  celebrate({ [Segments.BODY]: mpCreateBody }),
  async (req, res, next) => {
    try {
      const order = await Order.findByPk(req.body.order_id, { include: [OrderItem] });
      if (!order) return res.status(404).json({ error: "Orden no encontrada" });
      if (order.status === "void") return res.status(400).json({ error: "Orden anulada" });
      if (Number(order.grand_total) <= 0) return res.status(400).json({ error: "Total inválido" });

      const pref = await createCheckoutPreference({
        order,
        items: order.OrderItems,
        backUrls: req.body.back_urls
      });

      await audit({
        user_id: req.user?.sub || null,
        action: "MP_LINK_CREATE",
        entity: "Order",
        entity_id: order.id,
        meta: { preference_id: pref.id, init_point: pref.init_point }
      });

      res.status(201).json({ preference_id: pref.id, init_point: pref.init_point });
    } catch (e) { next(e); }
  }
);

/**
 * Webhook de MercadoPago
 * - Verifica firma (opcional)
 * - Detecta payment approved → crea Payment positivo
 * - Detecta refund → crea Payment negativo (idempotente)
 */
router.post(
  "/webhooks/mp",
  celebrate({ [Segments.QUERY]: mpWebhookQuery }),
  express.raw({ type: "*/*" }),
  async (req, res, next) => {
    // 1) Firma (opcional)
    try {
      const sig = req.get("X-Signature");
      const ok = verifyWebhookSignature(req.body, sig);
      if (!ok) return res.status(401).json({ error: "Invalid signature" });
    } catch { /* sin secreto, seguimos */ }

    // 2) Parse body (intentamos JSON)
    let payload = {};
    try { payload = JSON.parse(req.body.toString("utf8")); } catch { /* noop */ }

    try {
      const eventType = (payload?.type || req.query?.type || "").toLowerCase();

      // ============ RAMA: REFUND ============
      if (eventType === "refund") {
        const refundId = payload?.data?.id || req.query?.id;
        if (!refundId) return res.status(202).json({ ok: true, note: "refund event without id" });

        // Idempotencia: ¿ya está registrado?
        const exists = await Payment.findOne({ where: { ref: String(refundId) } });
        if (exists) return res.status(200).json({ ok: true, note: "refund already processed" });

        const parentPaymentId = payload?.data?.payment_id || payload?.payment_id || null;
        if (!parentPaymentId) return res.status(202).json({ ok: true, note: "missing parent payment id" });

        // Buscar pago padre local por ref = payment_id de MP
        const parent = await Payment.findOne({ where: { ref: String(parentPaymentId) } });
        if (!parent) return res.status(202).json({ ok: true, note: "parent payment not found locally" });

        // Consultar refunds en MP y tomar el refund puntual
        const list = await mpListRefunds({ paymentId: parentPaymentId });
        const r = Array.isArray(list) ? list.find(x => String(x.id) === String(refundId)) : null;
        if (!r) return res.status(202).json({ ok: true, note: "refund not found in MP list" });

        await Payment.create({
          order_id: parent.order_id,
          session_id: null,
          method: parent.method,                 // mp_link / mp_point
          amount: -Number(r.amount || r.transaction_amount || 0),
          ref: String(r.id),                     // refund_id MP
          parent_payment_id: parent.id,
          meta: { mp_refund: r },
          created_by: null
        });

        await audit({
          user_id: null,
          action: "PAYMENT_REFUND_ADD",
          entity: "Payment",
          entity_id: parent.id,
          meta: { type: "webhook", mp_payment_id: parent.ref, mp_refund_id: r.id, amount: r.amount }
        });

        return res.status(200).json({ ok: true });
      }

      // ============ RAMA: PAYMENT ============
      // MP puede mandar ?topic=payment&id=... o body { type: "payment", data:{ id } }
      const paymentId =
        req.query?.id ||
        req.query?.["data.id"] ||
        payload?.data?.id ||
        payload?.id;

      if (!paymentId) return res.status(202).json({ ok: true, note: "No payment id" });

      const p = await getPaymentById(paymentId);

      const ext = p.external_reference || "";
      const match = ext.match(/^ORDER#(\d+)$/);
      if (!match) return res.status(202).json({ ok: true, note: "No external_reference ORDER#<id>" });

      const orderId = Number(match[1]);

      // Idempotencia pagos
      const existsPay = await Payment.findOne({ where: { ref: String(p.id) } });
      if (existsPay) return res.status(200).json({ ok: true, note: "already processed" });

      // Solo registramos aprobados
      if (p.status === "approved") {
        const amount = Number(p.transaction_amount || p.amount || 0);
        const pay = await Payment.create({
          order_id: orderId,
          session_id: null,
          method: "mp_link",
          amount,
          ref: String(p.id),
          meta: {
            status: p.status,
            status_detail: p.status_detail,
            payment_method_id: p.payment_method_id,
            payment_type_id: p.payment_type_id,
            installments: p.installments,
            order: p.order?.id || null
          },
          created_by: null
        });

        // Actualizar orden si quedó pagada
        const order = await Order.findByPk(orderId, { include: [OrderItem, Table] });
        if (order) {
          const subtotal = order.OrderItems.reduce((a,i)=> a + Number(i.unit_price)*i.quantity, 0);
          const grand = Math.max(0, subtotal - Number(order.discount_total) + Number(order.service_total));
          const otherSum = (await Payment.sum("amount", { where: { order_id: orderId, id: { [Op.ne]: pay.id } } })) || 0;
          const paidSum = Number(amount) + Number(otherSum);

          if (Math.abs(paidSum - grand) <= 0.009) {
            const willClose = order.status === "delivered";
            await order.update({ status: willClose ? "closed" : order.status, grand_total: grand.toFixed(2) });
            if (willClose && order.Table) await order.Table.update({ status: "free" });
          }

          await audit({
            user_id: null,
            action: "PAYMENT_ADD",
            entity: "Payment",
            entity_id: pay.id,
            meta: { order_id: order.id, method: "mp_link", amount, payment_id: p.id, status: p.status }
          });
        }
      }

      return res.status(200).json({ ok: true });
    } catch (e) {
      next(e);
    }
  }
);

export default router;
