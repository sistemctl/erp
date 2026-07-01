const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const { numeroALetras } = require('./numero-a-letras');
const { calcCotIvaItems, etiquetaIvaCot } = require('./cotizacion-iva');

const MARGIN = 32;
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BLUE = '#1a56a8';
const GRAY_BG = '#e9ecef';
const BORDER = '#7a92a8';
const INK = '#1a1a1a';
const MUTED = '#4a5568';

const formatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtMoney(n) {
  return formatter.format(parseFloat(n) || 0);
}

function labelValue(doc, x, y, label, value, width) {
  doc.fontSize(7.5).fillColor(MUTED).text(label, x, y, { width, continued: false });
  doc.fontSize(8.5).fillColor(INK).text(value || '—', x, y + 9, { width });
}

function calcIva(items, ivaPct) {
  return calcCotIvaItems(items, ivaPct);
}

async function loadLogoForPdf(logoUrl) {
  if (!logoUrl || typeof logoUrl !== 'string') return null;
  try {
    if (/^https?:\/\//i.test(logoUrl)) {
      const res = await fetch(logoUrl);
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    }
    let filePath;
    if (logoUrl.startsWith('/uploads/')) {
      filePath = path.join(__dirname, '..', logoUrl);
    } else if (logoUrl.startsWith('/')) {
      filePath = path.join(__dirname, '..', '..', 'frontend', logoUrl.replace(/^\//, ''));
    } else {
      filePath = path.isAbsolute(logoUrl) ? logoUrl : path.join(__dirname, '..', logoUrl);
    }
    if (fs.existsSync(filePath)) return fs.readFileSync(filePath);
  } catch (_) { /* sin logo */ }
  return null;
}

async function generarCotizacionPDF(doc, cotizacion, config = {}) {
  const empresa = config.empresa || 'TechStore Colombia S.A.S.';
  const nit = config.nit || '—';
  const direccion = config.direccion || cotizacion.sede?.direccion || '—';
  const telefono = config.telefono || cotizacion.sede?.telefono || '—';
  const ivaPct = config.ivaDefecto ?? 19;
  const { base, iva, total } = calcIva(cotizacion.items, ivaPct);
  const ivaLabel = etiquetaIvaCot(iva, ivaPct);

  const cliente = cotizacion.cliente;
  const vendedor = cotizacion.usuario?.nombre || '—';
  const qrPayload = JSON.stringify({
    tipo: 'cotizacion',
    numero: cotizacion.numeroCotizacion,
    id: cotizacion.id,
    total
  });

  let qrBuffer = null;
  try {
    qrBuffer = await QRCode.toBuffer(qrPayload, { margin: 0, width: 140 });
  } catch (_) { /* sin QR */ }

  const logoBuffer = await loadLogoForPdf(config.logoUrl);

  let y = MARGIN;

  // Marco exterior
  doc.save();
  doc.lineWidth(1).strokeColor(BORDER).rect(MARGIN, MARGIN, CONTENT_W, PAGE_H - MARGIN * 2).stroke();
  doc.restore();

  const innerX = MARGIN + 14;
  const innerW = CONTENT_W - 28;

  // —— Encabezado ——
  const headerH = logoBuffer ? 108 : 88;
  const colLeftW = innerW * 0.38;
  const colRightW = innerW * 0.28;
  const colCenterW = innerW - colLeftW - colRightW;

  let empresaTextX = innerX;
  let empresaTextY = y + 4;
  const logoMaxH = 44;
  const logoMaxW = colLeftW - 4;

  if (logoBuffer) {
    try {
      doc.image(logoBuffer, innerX, y + 4, { fit: [logoMaxW, logoMaxH], align: 'left', valign: 'top' });
      empresaTextY = y + logoMaxH + 8;
    } catch (_) { /* logo inválido */ }
  }

  doc.font('Helvetica-Bold').fontSize(11).fillColor(INK)
    .text(empresa.toUpperCase(), empresaTextX, empresaTextY, { width: colLeftW });

  doc.font('Helvetica').fontSize(7.5).fillColor(MUTED);
  let hy = empresaTextY + 16;
  const empresaLines = [
    `NIT: ${nit}`,
    `Dirección: ${direccion}`,
    `Ciudad: ${cotizacion.sede?.nombre || '—'} — COLOMBIA`,
    `Tel: ${telefono}`
  ];
  empresaLines.forEach((line) => {
    doc.text(line, innerX, hy, { width: colLeftW });
    hy += 11;
  });

  if (qrBuffer) {
    const qrSize = 72;
    doc.image(qrBuffer, innerX + colLeftW + (colCenterW - qrSize) / 2, y + 6, { width: qrSize, height: qrSize });
  }

  const boxX = innerX + colLeftW + colCenterW;
  doc.save();
  doc.fillColor(BLUE).rect(boxX, y, colRightW, headerH).fill();
  doc.restore();

  doc.font('Helvetica-Bold').fontSize(10).fillColor('#ffffff')
    .text('COTIZACIÓN', boxX, y + 18, { width: colRightW, align: 'center' });
  doc.fontSize(9).text(`N° ${cotizacion.numeroCotizacion}`, boxX, y + 34, { width: colRightW, align: 'center' });
  doc.font('Helvetica').fontSize(7.5)
    .text(`Estado: ${(cotizacion.estado || '').toUpperCase()}`, boxX, y + 52, { width: colRightW, align: 'center' });

  y += headerH + 10;
  doc.moveTo(innerX, y).lineTo(innerX + innerW, y).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
  y += 8;

  // —— Datos cliente / documento ——
  const gridH = 62;
  const halfW = innerW / 2 - 6;

  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(INK).text('DATOS DEL CLIENTE', innerX, y);
  labelValue(doc, innerX, y + 12, 'Cliente', cliente?.nombre || 'Cliente general', halfW);
  labelValue(doc, innerX, y + 32, 'NIT / C.C.', cliente?.documento || '—', halfW);

  const rx = innerX + halfW + 12;
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(INK).text('DATOS DEL DOCUMENTO', rx, y);
  labelValue(doc, rx, y + 12, 'Fecha cotización', fmtDate(cotizacion.createdAt), halfW);
  labelValue(doc, rx + halfW / 2, y + 12, 'Fecha vencimiento', fmtDate(cotizacion.fechaVencimiento), halfW / 2);
  labelValue(doc, rx, y + 32, 'Vendedor', vendedor, halfW / 2);
  labelValue(doc, rx + halfW / 2, y + 32, 'Sede', cotizacion.sede?.nombre || '—', halfW / 2);
  labelValue(doc, rx, y + 52, 'Dirección cliente', cliente?.direccion || '—', halfW);
  labelValue(doc, rx + halfW / 2, y + 52, 'Teléfono', cliente?.telefono || '—', halfW / 2);

  y += gridH + 6;

  // —— Tabla de ítems ——
  const cols = [
    { key: 'codigo', label: 'Código', w: 52, align: 'left' },
    { key: 'desc', label: 'Descripción', w: 227, align: 'left' },
    { key: 'unidad', label: 'Unidad', w: 42, align: 'center' },
    { key: 'cant', label: 'Cant.', w: 38, align: 'center' },
    { key: 'unit', label: 'Valor Unitario', w: 72, align: 'right' },
    { key: 'total', label: 'Valor Total', w: 72, align: 'right' }
  ];

  const tableX = innerX;
  const rowH = 18;
  const headerRowH = 20;

  doc.save();
  doc.fillColor(GRAY_BG).rect(tableX, y, innerW, headerRowH).fill();
  doc.restore();

  let cx = tableX;
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(INK);
  cols.forEach((col) => {
    doc.text(col.label, cx + 4, y + 6, { width: col.w - 8, align: col.align });
    cx += col.w;
  });

  y += headerRowH;
  doc.font('Helvetica').fontSize(8).fillColor(INK);

  const items = cotizacion.items || [];
  const minRows = 6;
  const rows = Math.max(items.length, minRows);

  for (let i = 0; i < rows; i++) {
    const item = items[i];
    if (i > 0) {
      doc.moveTo(tableX, y).lineTo(tableX + innerW, y).strokeColor('#e2e8f0').lineWidth(0.4).stroke();
    }

    const codigo = item?.producto?.codigoBarras || (item ? '—' : '');
    const desc = item?.descripcion || '';
    const cant = item ? String(item.cantidad) : '';
    const unit = item ? fmtMoney(item.precioUnitario) : '';
    const sub = item ? fmtMoney(item.subtotal) : '';

    cx = tableX;
    const cells = [codigo, desc, 'UND', cant, unit, sub];
    cells.forEach((val, idx) => {
      doc.text(val, cx + 4, y + 5, { width: cols[idx].w - 8, align: cols[idx].align, ellipsis: true });
      cx += cols[idx].w;
    });
    y += rowH;
  }

  doc.rect(tableX, y - rows * rowH - headerRowH, innerW, rows * rowH + headerRowH).strokeColor('#cbd5e1').lineWidth(0.5).stroke();

  y += 10;

  // —— Pie: condiciones + totales ——
  const footerTop = y;
  const totalsW = 175;
  const leftW = innerW - totalsW - 10;

  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(INK).text('CONDICIÓN DE PAGO', innerX, footerTop);
  doc.font('Helvetica').fontSize(8).fillColor(MUTED)
    .text('Cotización informativa — sujeta a disponibilidad de inventario.', innerX, footerTop + 12, { width: leftW });

  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(INK).text('VALOR EN LETRAS', innerX, footerTop + 30);
  doc.font('Helvetica').fontSize(8).fillColor(INK)
    .text(numeroALetras(total), innerX, footerTop + 42, { width: leftW });

  if (cotizacion.notas) {
    doc.font('Helvetica-Bold').fontSize(7.5).text('OBSERVACIONES', innerX, footerTop + 58);
    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED)
      .text(cotizacion.notas, innerX, footerTop + 70, { width: leftW });
  }

  const tx = innerX + innerW - totalsW;
  let ty = footerTop;
  const totalRows = [
    ['Total bruto', fmtMoney(base)],
    [ivaLabel, fmtMoney(iva)],
    ['Total a pagar', fmtMoney(total)]
  ];

  totalRows.forEach(([label, val], idx) => {
    const isFinal = idx === totalRows.length - 1;
    if (isFinal) {
      doc.save();
      doc.fillColor(GRAY_BG).rect(tx, ty, totalsW, 20).fill();
      doc.restore();
    }
    doc.font(isFinal ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor(INK);
    doc.text(label, tx + 6, ty + 6, { width: totalsW / 2 });
    doc.text(val, tx + totalsW / 2, ty + 6, { width: totalsW / 2 - 6, align: 'right' });
    ty += 20;
  });

  y = Math.max(ty, footerTop + 90) + 16;

  // Texto legal
  doc.font('Helvetica').fontSize(6.5).fillColor(MUTED)
    .text(
      'Este documento es una cotización y no constituye factura de venta. Los precios pueden variar según disponibilidad. ' +
      'La validez de esta oferta está sujeta a la fecha de vencimiento indicada.',
      innerX, y, { width: innerW * 0.72, align: 'justify' }
    );

  // Firmas
  const sigY = PAGE_H - MARGIN - 52;
  doc.moveTo(innerX, sigY).lineTo(innerX + 150, sigY).strokeColor(INK).lineWidth(0.5).stroke();
  doc.moveTo(innerX + innerW - 150, sigY).lineTo(innerX + innerW, sigY).stroke();
  doc.fontSize(7.5).fillColor(MUTED)
    .text('Elaborado por', innerX, sigY + 4, { width: 150, align: 'center' })
    .text('Firma aceptación cliente', innerX + innerW - 150, sigY + 4, { width: 150, align: 'center' });

  // Barra inferior
  const barY = PAGE_H - MARGIN - 18;
  doc.save();
  doc.fillColor(GRAY_BG).rect(MARGIN, barY, CONTENT_W, 18).fill();
  doc.restore();
  doc.font('Helvetica-Bold').fontSize(7).fillColor(MUTED)
    .text('ORIGINAL', MARGIN + 14, barY + 5)
    .text('Página 1 de 1', MARGIN, barY + 5, { width: CONTENT_W - 14, align: 'right' });

  // Texto vertical lateral
  doc.save();
  doc.fontSize(5.5).fillColor('#94a3b8');
  doc.rotate(-90, { origin: [PAGE_W - 18, PAGE_H / 2] });
  doc.text(`Documento generado por ${empresa}`, PAGE_W - 18, PAGE_H / 2 - 80, { width: 200 });
  doc.restore();
}

module.exports = { generarCotizacionPDF, fmtMoney, fmtDate, numeroALetras, calcIva };
