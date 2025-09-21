import fs from "fs/promises";
import { AfipServices } from "facturajs";
import { afipConfig } from "../config/afip.config.js";
import { Order, OrderItem } from "../models/index.js";
import { AfipVoucher } from "../models/AfipVoucher.js";
import { audit } from "./../services/audit.service.js";


const IVA_ID_MAP = {
  27: 3,
  21: 5,
  10.5: 4,
  5: 8,
  2.5: 9,
  0: 3 // no gravado/exento no se informa acá; dejamos por compatibilidad
};



function calcNetoIva(total, rate) {
  if (!rate || rate <= 0) return { neto: total, iva: 0 };
  const neto = Number((total / (1 + rate / 100)).toFixed(2));
  const iva = Number((total - neto).toFixed(2));
  return { neto, iva };
}


function buildAFIP() {
  return new AfipServices({
    homo: afipConfig.homo,
    cacheTokensPath: afipConfig.cacheTokensPath,
    privateKeyPath: afipConfig.keyPath,
    certPath: afipConfig.certPath
  });
}

/** Devuelve el último nro autorizado (para numerar el próximo) */
export async function getLastAuthorizedNumber({ cbteTipo, ptoVta }) {
  const afip = buildAFIP();
  const { cuit } = afipConfig;
  const resp = await afip.execRemote("wsfev1", "FECompUltimoAutorizado", {
    Auth: { Cuit: Number(cuit) },
    params: { PtoVta: Number(ptoVta), CbteTipo: Number(cbteTipo) }
  });
  // respuesta típica: { FECompUltimoAutorizadoResult: { CbteNro: 44, ... } }
  const out = resp?.FECompUltimoAutorizadoResult?.CbteNro ?? 0;
  return Number(out);
}

/** Autoriza CAE (Factura C por defecto). Para B, enviar IVA. */
export async function authorizeInvoiceForOrder(orderId, {
  cbteTipo = afipConfig.cbteTipoDefault,
  ptoVta = afipConfig.ptoVta,
  concepto = 1,
  docTipo = 99,
  docNro = "0",
  moneda = "PES",
  cotizacion = 1,
  iva_rate = 21
} = {}, reqUser = null) {

  const order = await Order.findByPk(orderId, { include: [OrderItem] });
  if (!order) throw new Error("Orden no encontrada");
  if (order.status === "void") throw new Error("Orden anulada");

  const subtotal = order.OrderItems.reduce((a,i)=> a + Number(i.unit_price) * i.quantity, 0);
  const base = Math.max(0, subtotal - Number(order.discount_total || 0) + Number(order.service_total || 0));

  let impNeto = base;
  let impIVA = 0;
  let Iva = undefined;

  if (cbteTipo === 6) { // Factura B
    const { neto, iva } = calcNetoIva(base, iva_rate);
    impNeto = neto;
    impIVA = iva;
    const Id = IVA_ID_MAP[iva_rate] ?? 5; // default 21%
    Iva = [{ Id, BaseImp: Number(neto.toFixed(2)), Importe: Number(iva.toFixed(2)) }];
  }

  const impTotal = Number((impNeto + impIVA).toFixed(2));

  const last = await getLastAuthorizedNumber({ cbteTipo, ptoVta });
  const cbteNro = last + 1;

  const today = new Date();
  const yyyymmdd = today.toISOString().slice(0,10).replaceAll("-","");

  const detalle = [{
    Concepto: concepto,
    DocTipo: docTipo,
    DocNro: String(docNro),
    CbteDesde: cbteNro,
    CbteHasta: cbteNro,
    CbteFch: yyyymmdd,
    ImpTotal: impTotal,
    ImpTotConc: 0,
    ImpNeto: Number(impNeto.toFixed(2)),
    ImpOpEx: 0,
    ImpIVA: Number(impIVA.toFixed(2)),
    Iva,                       // <-- solo para B
    FchServDesde: (concepto === 2 || concepto === 3) ? yyyymmdd : undefined,
    FchServHasta: (concepto === 2 || concepto === 3) ? yyyymmdd : undefined,
    FchVtoPago: yyyymmdd,
    MonId: moneda,
    MonCotiz: Number(cotizacion)
  }];

  const reqPayload = {
    FeCAEReq: {
      FeCabReq: {
        CantReg: 1,
        PtoVta: Number(ptoVta),
        CbteTipo: Number(cbteTipo)
      },
      FeDetReq: { FECAEDetRequest: detalle }
    }
  };

  const afip = buildAFIP();
  const { cuit } = afipConfig;

  const resp = await afip.execRemote("wsfev1", "FECAESolicitar", {
    Auth: { Cuit: Number(cuit) },
    params: reqPayload
  });

  const det = resp?.FECAESolicitarResult?.FeDetResp?.FECAEDetResponse?.[0];
  if (!det) throw new Error("Respuesta WSFE inválida");

  const { Resultado, CAE, CAEFchVto, Observaciones, Errors } = det;

  if (Resultado !== "A") {
    const obs = Observaciones?.Obs?.map(o => `${o.Code}:${o.Msg}`).join(" | ");
    const err = Errors?.Err?.map(e => `${e.Code}:${e.Msg}`).join(" | ");
    throw new Error(`AFIP rechazó el comprobante. Obs: ${obs || "-"} Err: ${err || "-"}`);
  }

  const row = await AfipVoucher.create({
    order_id: order.id,
    cuit: String(cuit),
    pto_vta: Number(ptoVta),
    cbte_tipo: Number(cbteTipo),
    cbte_nro: Number(cbteNro),
    cae: String(CAE),
    cae_vto: String(CAEFchVto),
    resultado: String(Resultado),
    request_json: reqPayload,
    response_json: resp
  });

  await audit({
    user_id: reqUser?.sub || null,
    action: "AFIP_FE_CAESOLICITAR_OK",
    entity: "AfipVoucher",
    entity_id: row.id,
    meta: { order_id: order.id, cbte_tipo, pto_vta, cbte_nro, cae: CAE, cae_vto: CAEFchVto, iva_rate: cbteTipo===6?iva_rate:0 }
  });

  // 👉 devolvemos también datos útiles para QR
  return {
    ...row.get({ plain: true }),
    qr_payload: {
      ver: 1,
      fecha: yyyymmdd,
      cuit: Number(cuit),
      ptoVta: Number(ptoVta),
      tipoCmp: Number(cbteTipo),
      nroCmp: Number(cbteNro),
      importe: impTotal,
      moneda: "PES",
      ctz: 1,
      tipoDocRec: Number(docTipo),
      nroDocRec: Number(docNro || 0),
      tipoCodAut: "E",
      codAut: Number(CAE)
    }
  };
}
