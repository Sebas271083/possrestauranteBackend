// Muy básico: genera bytes ESC/POS en un Buffer
function ESC(...bytes) { return Buffer.from(bytes); }

class EscPosBuilder {
  constructor({ width = 42 } = {}) {
    this.width = width;
    this.parts = [];
    // Init printer
    this.parts.push(ESC(0x1B,0x40)); // initialize
  }
  text(line="") {
    this.parts.push(Buffer.from(line.normalize("NFKD"), "utf8"));
    this.parts.push(Buffer.from("\n"));
    return this;
  }
  align(mode="left") {
    const map = { left:0, center:1, right:2 };
    this.parts.push(ESC(0x1B,0x61, map[mode] ?? 0));
    return this;
  }
  bold(on=true) {
    this.parts.push(ESC(0x1B,0x45, on ? 1 : 0));
    return this;
  }
  double(on=true) {
    // double height+width
    this.parts.push(ESC(0x1D,0x21, on ? 0x11 : 0x00));
    return this;
  }
  hr(char="-") {
    this.text(char.repeat(this.width));
    return this;
  }
  cut() {
    this.parts.push(ESC(0x1D,0x56,0x42,0x00)); // partial cut
    return this;
  }
  feed(n=2) {
    this.parts.push(ESC(0x1B,0x64,n));
    return this;
  }
  join() { return Buffer.concat(this.parts); }
}

// Helpers de formato
function amount(n){ return Number(n).toFixed(2); }
function line2col(left, right, width=42) {
  const l = String(left);
  const r = String(right);
  const spaces = Math.max(1, width - l.length - r.length);
  return l + " ".repeat(spaces) + r;
}

export function renderKitchenTicket({ order, items, station, width=42 }) {
  const b = new EscPosBuilder({ width });
  b.align("center").bold(true).text("TICKET COCINA").bold(false);
  b.text(`Orden #${order.id}  Mesa ${order.table_id ?? "-"}`);
  b.hr();
  b.align("left");
  for (const it of items) {
    b.bold(true).text(`${it.quantity} x ${it.item_name}`).bold(false);
    if (it.modifiers_json?.groups) {
      for (const g of it.modifiers_json.groups) {
        const sel = g.selected?.map(s=>s.name).join(", ");
        if (sel) b.text(`  - ${g.name}: ${sel}`);
      }
    }
    if (it.notes) b.text(`  * ${it.notes}`);
  }
  b.hr();
  b.text(`Estación: ${station}`);
  b.feed(3).cut();
  return b.join();
}

export function renderCashReceipt({ order, items, copy=1, width=42 }) {
  const all = [];
  for (let i=0; i<copy; i++){
    const b = new EscPosBuilder({ width });
    b.align("center").bold(true).text("COMPROBANTE NO FISCAL").bold(false);
    b.text(`Orden #${order.id}  Mesa ${order.table_id ?? "-"}`);
    b.hr();
    b.align("left");
    for (const it of items) {
      const total = Number(it.unit_price) * it.quantity;
      b.text(line2col(`${it.quantity} x ${it.item_name}`, amount(total), width));
    }
    b.hr();
    b.text(line2col("SUBTOTAL", amount(order.subtotal), width));
    if (Number(order.discount_total) > 0) b.text(line2col("DESCUENTO", `- ${amount(order.discount_total)}`, width));
    if (Number(order.service_total) > 0) b.text(line2col("SERVICIO", amount(order.service_total), width));
    b.bold(true).text(line2col("TOTAL", amount(order.grand_total), width)).bold(false);
    b.feed(4).cut();
    all.push(b.join());
  }
  return Buffer.concat(all);
}

function qrcode(data) {
  // ESC/POS QR: GS ( k — Modelo 49 (0x31)
  const storeLen = Buffer.byteLength(data);
  const pL = (storeLen + 3) & 0xFF;
  const pH = ((storeLen + 3) >> 8) & 0xFF;
  return Buffer.concat([
    // Set module size
    ESC(0x1D,0x28,0x6B, 0x03,0x00, 0x31,0x43, 0x04), // 4= tamaño medio
    // Set error correction (48=L,49=M,50=Q,51=H)
    ESC(0x1D,0x28,0x6B, 0x03,0x00, 0x31,0x45, 0x31), // M
    // Store data
    ESC(0x1D,0x28,0x6B, pL,pH, 0x31,0x50,0x30),
    Buffer.from(data, "utf8"),
    // Print
    ESC(0x1D,0x28,0x6B, 0x03,0x00, 0x31,0x51,0x30)
  ]);
}

function afipQRUrl(payload) {
  // https://www.afip.gob.ar/fe/qr/?p=base64(JSON)
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json, "utf8").toString("base64");
  return `https://www.afip.gob.ar/fe/qr/?p=${b64}`;
}

export function renderFiscalReceipt({ order, items, voucher, qrPayload, width=42 }) {
  const b = new EscPosBuilder({ width });
  b.align("center").bold(true).text("COMPROBANTE FISCAL").bold(false);
  b.text(`Tipo: ${voucher.cbte_tipo}  PV:${voucher.pto_vta}  Nro:${voucher.cbte_nro}`);
  b.text(`Fecha: ${new Date().toLocaleString()}`);
  b.hr();
  b.align("left");
  for (const it of items) {
    const total = Number(it.unit_price) * it.quantity;
    b.text(line2col(`${it.quantity} x ${it.item_name}`, amount(total), width));
  }
  b.hr();
  b.text(line2col("SUBTOTAL", amount(order.subtotal), width));
  if (Number(order.discount_total) > 0) b.text(line2col("DESCUENTO", `- ${amount(order.discount_total)}`, width));
  if (Number(order.service_total) > 0) b.text(line2col("SERVICIO", amount(order.service_total), width));
  b.bold(true).text(line2col("TOTAL", amount(order.grand_total), width)).bold(false);

  b.hr();
  b.text(`CAE: ${voucher.cae}`);
  b.text(`Vto CAE: ${voucher.cae_vto}`);

  // QR
  const url = afipQRUrl(qrPayload);
  b.feed(1).align("center");
  b.parts.push(qrcode(url)); // imprimimos el QR del link AFIP
  b.feed(1).text(url);       // y dejamos el link visible como fallback
  b.feed(4).cut();
  return b.join();
}
