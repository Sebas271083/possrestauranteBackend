import { Order, OrderItem } from "../models/index.js";

export async function recomputeOrderState(orderId, t = null) {
  const items = await OrderItem.findAll({ where: { order_id: orderId }, transaction: t });
  if (!items.length) return; // nada que hacer

  const counts = items.reduce((acc, it) => {
    acc[it.status] = (acc[it.status] || 0) + 1;
    return acc;
  }, {});

  let next = "open";
  const total = items.length;
  const ready = (counts.ready || 0);
  const delivered = (counts.delivered || 0);

  if (delivered === total) next = "delivered";
  else if (ready === total) next = "ready";
  else next = "open";

  const order = await Order.findByPk(orderId, { transaction: t });
  if (order && order.status !== next) {
    await order.update({ status: next }, { transaction: t });
  }
}
