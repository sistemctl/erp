const PDFDocument = require('pdfkit');
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
  fmtMoneyDecimal,
  loadLogoForPdf
} = require('./pdf-siigo-helpers');
const { labelUnidadMedida } = require('./unidad-medida');

function getFacturaItems(factura) {
  if (factura.venta?.items?.length) {
    return factura.venta.items.map((item) => ({
      codigo: item.producto?.codigoBarras || '—',
      descripcion: item.producto?.nombre || '—',
      unidad: labelUnidadMedida(item.producto?.unidadMedida),
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
      unidad: 'und',
      cantidad: 1,
      precioUnitario: orden.costoManoObra,
      subtotal: orden.costoManoObra
    }];
    for (const rep of orden.repuestos || []) {
      items.push({
        codigo: rep.producto?.codigoBarras || '—',
        descripcion: rep.producto?.nombre || 'Repuesto',
        unidad: labelUnidadMedida(rep.producto?.unidadMedida),
        cantidad: rep.cantidad,
        precioUnitario: rep.costoUnitario,
        subtotal: parseFloat(rep.costoUnitario) * rep.cantidad
      });
    }
    return items;
  }

  if (factura.ordenInstalacion) {
    const orden = factura.ordenInstalacion;
    const precioCerrado = orden.precioCerrado === true || orden.precioCerrado === 1;
    const valorServicio = parseFloat(orden.valorServicio) || 0;
    const sitio = (orden.sitio || '').trim();
    const desc = (orden.descripcion || '').trim();
    const items = [];

    if (valorServicio > 0 || precioCerrado || !(orden.materiales || []).length) {
      const partes = ['Servicio de instalación'];
      if (sitio) partes.push(sitio);
      if (desc) partes.push(desc);
      items.push({
        codigo: orden.numeroOrden || '—',
        descripcion: partes.join(' — '),
        unidad: 'und',
        cantidad: 1,
        precioUnitario: valorServicio,
        subtotal: valorServicio
      });
    }

    for (const mat of orden.materiales || []) {
      const cant = parseInt(mat.cantidad, 10) || 0;
      const unit = precioCerrado ? 0 : (parseFloat(mat.precioUnitario) || 0);
      const nombre = mat.producto?.nombre || 'Material';
      items.push({
        codigo: mat.producto?.codigoBarras || '—',
        descripcion: precioCerrado ? `${nombre} (incluido en servicio)` : nombre,
        unidad: labelUnidadMedida(mat.producto?.unidadMedida),
        cantidad: cant,
        precioUnitario: unit,
        subtotal: unit * cant
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
  const telefono = config.telefono || factura.sede?.telefono || '—';
  const ivaPct = config.ivaDefecto ?? 19;
  const cliente = factura.cliente;
  const items = getFacturaItems(factura);
  const vendedor = factura.venta?.usuario?.nombre
    || factura.ordenInstalacion?.tecnico?.nombre
    || '—';
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

  // Misma composición de la factura visual: empresa | QR | documento.
  const headerH = logoBuffer ? 108 : 88;
  const companyW = innerW * 0.38;
  const docW = innerW * 0.28;
  const qrAreaW = innerW - companyW - docW;
  let companyY = y + 4;

  if (logoBuffer) {
    try {
      doc.image(logoBuffer, innerX, y + 4, { fit: [companyW - 4, 44], align: 'left', valign: 'top' });
      companyY = y + 56;
    } catch (_) { /* omitir */ }
  }

  doc.font('Helvetica-Bold').fontSize(11).fillColor(INK)
    .text(empresa.toUpperCase(), innerX, companyY, { width: companyW });
  doc.font('Helvetica').fontSize(7.5).fillColor(MUTED);
  let hy = companyY + 16;
  [
    `NIT: ${nit}`,
    `Dirección: ${direccion}`,
    `Ciudad: ${factura.sede?.nombre || '—'} — COLOMBIA`,
    `Tel: ${telefono}`,
    ...(iva > 0 ? ['Responsable de IVA'] : [])
  ].forEach((line) => {
    doc.text(line, innerX, hy, { width: companyW });
    hy += 11;
  });

  if (qrBuffer) {
    const qrSize = 72;
    doc.image(qrBuffer, innerX + companyW + (qrAreaW - qrSize) / 2, y + 6, { width: qrSize, height: qrSize });
  }

  const boxX = innerX + companyW + qrAreaW;
  doc.save();
  doc.fillColor(BLUE).rect(boxX, y, docW, headerH).fill();
  doc.restore();
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#ffffff')
    .text('FACTURA DE VENTA', boxX, y + 18, { width: docW, align: 'center' });
  doc.fontSize(9).text(`N° ${factura.numeroFactura}`, boxX, y + 34, { width: docW, align: 'center' });
  doc.font('Helvetica').fontSize(7.5)
    .text((factura.estado || '').toUpperCase(), boxX, y + 52, { width: docW, align: 'center' });

  y += headerH + 10;
  doc.moveTo(innerX, y).lineTo(innerX + innerW, y).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
  y += 8;

  // —— Datos del cliente / documento ——
  const halfW = innerW / 2 - 6;
  const documentX = innerX + halfW + 12;
  const label = (x, top, name, value, width) => {
    doc.font('Helvetica-Bold').fontSize(6.5).fillColor(MUTED).text(name, x, top, { width });
    doc.font('Helvetica').fontSize(8).fillColor(INK).text(value || '—', x, top + 8, { width });
  };

  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(INK).text('DATOS DEL CLIENTE', innerX, y);
  label(innerX, y + 12, 'CLIENTE', cliente?.nombre || 'Cliente general', halfW / 2);
  label(innerX + halfW / 2, y + 12, 'NIT / C.C.', cliente?.documento || '—', halfW / 2);
  label(innerX, y + 32, 'DIRECCIÓN', cliente?.direccion || '—', halfW / 2);
  label(innerX + halfW / 2, y + 32, 'TELÉFONO', cliente?.telefono || '—', halfW / 2);

  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(INK).text('DATOS DEL DOCUMENTO', documentX, y);
  label(documentX, y + 12, 'FECHA FACTURA', fmtDate(factura.createdAt), halfW / 2);
  label(documentX + halfW / 2, y + 12, 'FECHA VENCIMIENTO', fmtDate(factura.fechaVencimiento), halfW / 2);
  label(documentX, y + 32, 'VENDEDOR', vendedor, halfW / 2);
  label(documentX + halfW / 2, y + 32, 'SEDE', factura.sede?.nombre || '—', halfW / 2);

  y += 62;

  // —— Tabla de ítems ——
  const columns = [
    { label: 'Código', width: 52, align: 'left' },
    { label: 'Descripción', width: 227, align: 'left' },
    { label: 'Unidad', width: 42, align: 'center' },
    { label: 'Cant.', width: 38, align: 'center' },
    { label: 'V. Unit', width: 72, align: 'right' },
    { label: 'Valor Total', width: 72, align: 'right' }
  ];
  const headerRowH = 20;
  const rowH = 20;
  const tableTop = y;

  doc.save();
  doc.fillColor('#e9ecef').rect(innerX, y, innerW, headerRowH).fill();
  doc.restore();
  let cellX = innerX;
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(INK);
  columns.forEach((column) => {
    doc.text(column.label, cellX + 4, y + 6, { width: column.width - 8, align: column.align });
    cellX += column.width;
  });

  y += headerRowH;
  const rows = Math.max(items.length, 3);
  doc.font('Helvetica').fontSize(8).fillColor(INK);
  for (let index = 0; index < rows; index += 1) {
    const item = items[index];
    if (index > 0) {
      doc.moveTo(innerX, y).lineTo(innerX + innerW, y).strokeColor('#e2e8f0').lineWidth(0.4).stroke();
    }
    const values = item
      ? [item.codigo, item.descripcion, item.unidad, String(item.cantidad), fmtMoneyDecimal(item.precioUnitario), fmtMoneyDecimal(item.subtotal)]
      : ['', '', '', '', '', ''];
    cellX = innerX;
    values.forEach((value, indexCell) => {
      const column = columns[indexCell];
      doc.text(value, cellX + 4, y + 5, { width: column.width - 8, align: column.align, ellipsis: true });
      cellX += column.width;
    });
    y += rowH;
  }
  doc.rect(innerX, tableTop, innerW, headerRowH + rows * rowH).strokeColor('#cbd5e1').lineWidth(0.5).stroke();

  doc.font('Helvetica').fontSize(7.5).fillColor(MUTED)
    .text(`Total ítems: ${items.length}`, innerX, y + 10);
  y += 14;

  const footerTop = y;
  const totalsW = 185;
  const leftW = innerW - totalsW - 10;

  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(INK).text('CONDICIÓN DE PAGO', innerX, footerTop);
  doc.font('Helvetica').fontSize(8).fillColor(MUTED)
    .text(getCondicionPago(factura), innerX, footerTop + 12, { width: leftW });

  let letrasY = footerTop + 30;
  if (factura.venta?.pagos?.length) {
    factura.venta.pagos.forEach((p) => {
      doc.text(`${String(p.metodo || 'Pago').replace(/_/g, ' ')}: ${fmtMoneyDecimal(p.monto)}`, innerX, letrasY, { width: leftW });
      letrasY += 10;
    });
    letrasY += 4;
  }

  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(INK).text('VALOR EN LETRAS', innerX, letrasY);
  doc.font('Helvetica').fontSize(8).fillColor(INK)
    .text(numeroALetras(total), innerX, letrasY + 12, { width: leftW });

  const tx = innerX + innerW - totalsW;
  const totalRows = [
    ['Total bruto', fmtMoneyDecimal(subtotal)],
    [(parseFloat(iva) || 0) > 0 ? `IVA (${ivaPct}%)` : 'IVA (Exento)', fmtMoneyDecimal(iva)],
    ['Total a pagar', fmtMoneyDecimal(total)]
  ];
  let totalY = footerTop;
  totalRows.forEach(([name, value], index) => {
    const isFinal = index === totalRows.length - 1;
    if (isFinal) {
      doc.save();
      doc.fillColor('#e9ecef').rect(tx, totalY, totalsW, 20).fill();
      doc.restore();
    }
    doc.font(isFinal ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor(INK);
    doc.text(name, tx + 6, totalY + 6, { width: totalsW / 2 });
    doc.text(value, tx + totalsW / 2, totalY + 6, { width: totalsW / 2 - 6, align: 'right' });
    totalY += 20;
  });

  y = Math.max(totalY, letrasY + 42) + 14;
  doc.font('Helvetica').fontSize(6.5).fillColor(MUTED)
    .text(
      'Esta factura se asimila en todos sus efectos legales a una letra de cambio según el artículo 774 del Código de Comercio. ' +
      'Conserve este documento para garantías y trámites posteriores.',
      innerX, y, { width: innerW * 0.72, align: 'justify' }
    );

  const signatureY = PAGE_H - MARGIN - 52;
  doc.moveTo(innerX, signatureY).lineTo(innerX + 150, signatureY).strokeColor(INK).lineWidth(0.5).stroke();
  doc.moveTo(innerX + innerW - 150, signatureY).lineTo(innerX + innerW, signatureY).stroke();
  doc.fontSize(7.5).fillColor(MUTED)
    .text('Elaborado por', innerX, signatureY + 4, { width: 150, align: 'center' })
    .text('Firma recibido', innerX + innerW - 150, signatureY + 4, { width: 150, align: 'center' });

  const barY = PAGE_H - MARGIN - 18;
  doc.save();
  doc.fillColor('#e9ecef').rect(MARGIN, barY, CONTENT_W, 18).fill();
  doc.restore();
  doc.font('Helvetica-Bold').fontSize(7).fillColor(MUTED)
    .text('ORIGINAL', MARGIN + 14, barY + 5)
    .text('Página 1 de 1', MARGIN, barY + 5, { width: CONTENT_W - 14, align: 'right' });
}

function buildFacturaPdfBuffer(factura, config = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    generarFacturaPDF(doc, factura, config)
      .then(() => doc.end())
      .catch(reject);
  });
}

module.exports = { generarFacturaPDF, getFacturaItems, getCondicionPago, buildFacturaPdfBuffer };
