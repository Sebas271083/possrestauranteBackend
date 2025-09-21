import { Printer, PrintJob, Order, OrderItem } from "../models/index.js";
import { renderKitchenTicket, renderCashReceipt } from "./escpos.service.js";
import { AfipVoucher } from "../models/AfipVoucher.js";
import { renderFiscalReceipt } from "./escpos.service.js";

export async function enqueueKitchen({ station, order_id, printerRole="kitchen" }, t) {
  const printer = await Printer.findOne({ where: { role: printerRole, is_active: true }, transaction: t });
  if (!printer) throw new Error("No hay impresora de cocina activa");

  const order = await Order.findByPk(order_id, { transaction: t });
  const items = await OrderItem.findAll({ where: { order_id, station }, transaction: t });

  const payload = renderKitchenTicket({ order, items, station, width: printer.width_chars });
  const job = await PrintJob.create({
    printer_id: printer.id,
    type: "kitchen_ticket",
    ref: `ORDER#${order_id}`,
    payload
  }, { transaction: t });

  return job;
}

export async function enqueueCash({ order_id, copy=1, printerRole="cash" }, t) {
  const printer = await Printer.findOne({ where: { role: printerRole, is_active: true }, transaction: t });
  if (!printer) throw new Error("No hay impresora de caja activa");

  const order = await Order.findByPk(order_id, { transaction: t });
  const items = await OrderItem.findAll({ where: { order_id }, transaction: t });

  const payload = renderCashReceipt({ order, items, copy, width: printer.width_chars });
  const job = await PrintJob.create({
    printer_id: printer.id,
    type: "cash_receipt",
    ref: `ORDER#${order_id}`,
    payload
  }, { transaction: t });

  return job;
}

export async function enqueueFiscalByVoucher({ voucher_id, printerRole="cash" }, t) {
  const printer = await Printer.findOne({ where: { role: printerRole, is_active: true }, transaction: t });
  if (!printer) throw new Error("No hay impresora de caja activa");

  const voucher = await AfipVoucher.findByPk(voucher_id, { transaction: t });
  if (!voucher) throw new Error("Voucher AFIP no encontrado");

  const order = await Order.findByPk(voucher.order_id, { transaction: t });
  const items = await OrderItem.findAll({ where: { order_id: voucher.order_id }, transaction: t });

  // reconstruimos payload QR
  const qrPayload = {
    ver: 1,
    fecha: voucher.response_json?.Fecha || voucher.created_at?.toISOString()?.slice(0,10)?.replaceAll("-",""),
    cuit: Number(voucher.cuit),
    ptoVta: Number(voucher.pto_vta),
    tipoCmp: Number(voucher.cbte_tipo),
    nroCmp: Number(voucher.cbte_nro),
    importe: Number(order.grand_total),
    moneda: "PES",
    ctz: 1,
    tipoDocRec: 99,
    nroDocRec: 0,
    tipoCodAut: "E",
    codAut: Number(voucher.cae)
  };

  const payload = renderFiscalReceipt({
    order, items, voucher, qrPayload, width: printer.width_chars
  });

  const job = await PrintJob.create({
    printer_id: printer.id,
    type: "cash_receipt",
    ref: `AFIP#${voucher.id}`,
    payload
  }, { transaction: t });

  return job;
}