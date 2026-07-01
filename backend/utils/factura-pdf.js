const QRCode = require('qrcode');
const { numeroALetras } = require('./numero-a-letras');
const {
  MARGIN,
  PAGE_W,
  PAGE_H,
  CONTENT_W,
  BLUE,
  BORDER,
  INK,
  MUTED,
  fmtDate,
  fmtDateIso,
  fmtMoneyDecimal,
  labelValue,
  loadLogoForPdf,
  drawItemsTable,
  drawTotalsBlock,
  drawPageFooter
} = require('./pdf-siigo-helpers');

function getFacturaItems(factura) {
  if (factura.venta?.items?.length) {
    return factura.venta.items.map((item) => ({
      codigo: item.producto?.codigoBarras || '—',
      descripcion: item.producto?.nombre || '—',
      unidad: 'UND',
      cantidad: item.cantidad,
      precioUnitario: item.precioModificado,
      subtotal: item.subtotal
    }));
  }

  if (factura.ordenReparacion) {
    const orden = factura.ordenReparacion;
    const items = [{
      codigo: '—',
      descripcion: `Mano de obra: ${orden.tipoEquipo || ''} ${orden.marca || ''} ${orden.modelo || ''}`.trim(),
      unidad: 'UND',
      cantidad: 1,
      precioUnitario: orden.costoManoObra,
      subtotal: orden.costoManoObra
    }];
    for (const rep of orden.repuestos || []) {
      items.push({
        codigo: rep.producto?.codigoBarras || '—',
        descripcion: rep.producto?.nombre || 'Repuesto',
        unidad: 'UND',
        cantidad: rep.cantidad,
        precioUnitario: rep.costoUnitario,
        subtotal: parseFloat(rep.costoUnitario) * rep.cantidad
      });
    }
    return items;
  }

  return [];
}

function getCondicionPago(factura) {
  if (factura.estado === 'pagada') return 'Contado';
  if (factura.estado === 'pendiente') return 'Crédito';
  if (factura.estado === 'abono_parcial') return 'Crédito — abono parcial';
  if (factura.estado === 'vencida') return 'Crédito — vencida';
  if (factura.estado === 'anulada') return 'Anulada';
  return '—';
}

async function generarFacturaPDF(doc, factura, config = {}) {
  const empresa = config.empresa || 'TechStore Colombia S.A.S.';
  const nit = config.nit || '—';
  const direccion = config.direccion || factura.sede?.direccion || '—';
  const telefono = config.telefono || factura.sede?.telefono || config.telefono || '—';
  const ivaPct = config.ivaDefecto ?? 19;
  const cliente = factura.cliente;
  const items = getFacturaItems(factura);
  const vendedor = factura.venta?.usuario?.nombre || '—';
  const subtotal = parseFloat(factura.subtotal) || 0;
  const iva = parseFloat(factura.iva) || 0;
  const total = parseFloat(factura.total) || 0;

  const qrPayload = JSON.stringify({
    tipo: 'factura',
    numero: factura.numeroFactura,
    id: factura.id,
    nit,
    total
  });

  let qrBuffer = null;
  try {
    qrBuffer = await QRCode.toBuffer(qrPayload, { margin: 0, width: 140 });
  } catch (_) { /* sin QR */ }

  const logoBuffer = await loadLogoForPdf(config.logoUrl);
  let y = MARGIN;

  doc.save();
  doc.lineWidth(1).strokeColor(BORDER).rect(MARGIN, MARGIN, CONTENT_W, PAGE_H - MARGIN * 2).stroke();
  doc.restore();

  const innerX = MARGIN + 14;
  const innerW = CONTENT_W - 28;

  // —— Encabezado: logo | empresa | QR ——
  const headerH = 92;
  const logoW = 78;
  const qrW = 78;
  const centerW = innerW - logoW - qrW - 16;
  const centerX = innerX + logoW + 8;

  if (logoBuffer) {
    try {
      doc.image(logoBuffer, innerX, y + 4, { fit: [logoW, 48], align: 'left', valign: 'top' });
    } catch (_) { /* omitir */ }
  }

  doc.font('Helvetica-Bold').fontSize(11).fillColor(INK)
    .text(empresa.toUpperCase(), centerX, y + 4, { width: centerW, align: 'center' });
  doc.font('Helvetica').fontSize(7.5).fillColor(MUTED);
  let hy = y + 20;
  [
    `NIT : ${nit}`,
    direccion,
    `${factura.sede?.nombre || '—'} — COLOMBIA`,
    telefono ? `Tel: ${telefono}` : null,
    'Responsable de IVA'
  ].filter(Boolean).forEach((line) => {
    doc.text(line, centerX, hy, { width: centerW, align: 'center' });
    hy += 10;
  });

  if (qrBuffer) {
    doc.image(qrBuffer, innerX + innerW - qrW, y + 6, { width: 68, height: 68 });
  }

  y += headerH;
  doc.moveTo(innerX, y).lineTo(innerX + innerW, y).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
  y += 8;

  // —— Cliente | adicional | caja factura ——
  const colW = (innerW - 16) / 3;
  const c1 = innerX;
  const c2 = innerX + colW + 8;
  const c3 = innerX + (colW + 8) * 2;

  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(INK).text('CLIENTE', c1, y);
  labelValue(doc, c1, y + 12, 'Cliente', cliente?.nombre || 'Cliente general', colW);
  labelValue(doc, c1, y + 32, 'NIT', cliente?.documento || '—', colW);
  labelValue(doc, c1, y + 52, 'Dirección', cliente?.direccion || '—', colW);

  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(INK).text('INFORMACIÓN ADICIONAL', c2, y);
  labelValue(doc, c2, y + 12, 'Teléfono', cliente?.telefono || '—', colW);
  labelValue(doc, c2, y + 32, 'Vendedor', vendedor, colW);
  labelValue(doc, c2, y + 52, 'Correo', cliente?.email || '—', colW);

  doc.save();
  doc.fillColor(BLUE).rect(c3, y, colW, 68).fill();
  doc.restore();
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff')
    .text('FACTURA DE VENTA', c3, y + 10, { width: colW, align: 'center' });
  doc.fontSize(8).text(factura.numeroFactura, c3, y + 26, { width: colW, align: 'center' });
  doc.font('Helvetica').fontSize(7)
    .text(`Generación: ${fmtDateIso(factura.createdAt)}`, c3, y + 40, { width: colW, align: 'center' })
    .text(`Vence: ${fmtDateIso(factura.fechaVencimiento)}`, c3, y + 52, { width: colW, align: 'center' });

  y += 78;

  const tableResult = drawItemsTable(doc, innerX, innerW, y, items, { minRows: 5, useDecimals: true });
  y = tableResult.y;

  doc.font('Helvetica').fontSize(7.5).fillColor(MUTED)
    .text(`Total ítems: ${tableResult.itemCount}`, innerX, y);
  y += 14;

  const footerTop = y;
  const totalsW = 185;
  const leftW = innerW - totalsW - 10;

  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(INK).text('CONDICIÓN DE PAGO', innerX, footerTop);
  doc.font('Helvetica').fontSize(8).fillColor(MUTED)
    .text(getCondicionPago(factura), innerX, footerTop + 12, { width: leftW });

  if (factura.venta?.pagos?.length) {
    let py = footerTop + 26;
    factura.venta.pagos.forEach((p) => {
      doc.text(`${p.metodo}: ${fmtMoneyDecimal(p.monto)}`, innerX, py, { width: leftW });
      py += 10;
    });
  }

  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(INK).text('VALOR EN LETRAS', innerX, footerTop + 48);
  doc.font('Helvetica').fontSize(8).fillColor(INK)
    .text(numeroALetras(total), innerX, footerTop + 60, { width: leftW });

  const tx = innerX + innerW - totalsW;
  drawTotalsBlock(doc, tx, footerTop, totalsW, [
    ['Total bruto', fmtMoneyDecimal(subtotal)],
    [`IVA (${ivaPct}%)`, fmtMoneyDecimal(iva)],
    ['Total a pagar', fmtMoneyDecimal(total)]
  ]);

  y = footerTop + 88;
  doc.font('Helvetica').fontSize(6.5).fillColor(MUTED)
    .text(
      'Esta factura se asimila en todos sus efectos legales a una letra de cambio según el artículo 774 del Código de Comercio. ' +
      'Conserve este documento para garantías y trámites posteriores.',
      innerX, y, { width: innerW * 0.72, align: 'justify' }
    );

  drawPageFooter(doc, empresa, innerX, innerW);
}

module.exports = { generarFacturaPDF, getFacturaItems, getCondicionPago };
