const fs = require('fs');
const path = require('path');

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

function fmtDateIso(d) {
  if (!d) return '—';
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtMoney(n) {
  return formatter.format(parseFloat(n) || 0);
}

function fmtMoneyDecimal(n) {
  return (parseFloat(n) || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function labelValue(doc, x, y, label, value, width) {
  doc.fontSize(7.5).fillColor(MUTED).text(label, x, y, { width, continued: false });
  doc.fontSize(8.5).fillColor(INK).text(value || '—', x, y + 9, { width });
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

function drawItemsTable(doc, innerX, innerW, y, items, { minRows = 6, useDecimals = true } = {}) {
  const cols = [
    { label: 'Código', w: 52, align: 'left' },
    { label: 'Descripción', w: 200, align: 'left' },
    { label: 'Unidad', w: 40, align: 'center' },
    { label: 'Cant.', w: 36, align: 'center' },
    { label: 'V. Unit', w: 72, align: 'right' },
    { label: 'Valor Total', w: 72, align: 'right' }
  ];

  const tableX = innerX;
  const rowH = 18;
  const headerRowH = 20;
  const fmt = useDecimals ? fmtMoneyDecimal : fmtMoney;

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

  const rows = Math.max(items.length, minRows);
  for (let i = 0; i < rows; i++) {
    const item = items[i];
    if (i > 0) {
      doc.moveTo(tableX, y).lineTo(tableX + innerW, y).strokeColor('#e2e8f0').lineWidth(0.4).stroke();
    }

    const cells = item
      ? [
          item.codigo || '—',
          item.descripcion || '',
          item.unidad || 'UND',
          String(item.cantidad),
          fmt(item.precioUnitario),
          fmt(item.subtotal)
        ]
      : ['', '', '', '', '', ''];

    cx = tableX;
    cells.forEach((val, idx) => {
      doc.text(val, cx + 4, y + 5, { width: cols[idx].w - 8, align: cols[idx].align, ellipsis: true });
      cx += cols[idx].w;
    });
    y += rowH;
  }

  doc.rect(tableX, y - rows * rowH - headerRowH, innerW, rows * rowH + headerRowH)
    .strokeColor('#cbd5e1').lineWidth(0.5).stroke();

  return { y: y + 6, itemCount: items.length };
}

function drawTotalsBlock(doc, tx, ty, totalsW, rows) {
  rows.forEach(([label, val], idx) => {
    const isFinal = idx === rows.length - 1;
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
  return ty;
}

function drawPageFooter(doc, empresa, innerX, innerW) {
  const sigY = PAGE_H - MARGIN - 52;
  doc.moveTo(innerX, sigY).lineTo(innerX + 150, sigY).strokeColor(INK).lineWidth(0.5).stroke();
  doc.moveTo(innerX + innerW - 150, sigY).lineTo(innerX + innerW, sigY).stroke();
  doc.fontSize(7.5).fillColor(MUTED)
    .text('Elaborado por', innerX, sigY + 4, { width: 150, align: 'center' })
    .text('Firma recibido', innerX + innerW - 150, sigY + 4, { width: 150, align: 'center' });

  const barY = PAGE_H - MARGIN - 18;
  doc.save();
  doc.fillColor(GRAY_BG).rect(MARGIN, barY, CONTENT_W, 18).fill();
  doc.restore();
  doc.font('Helvetica-Bold').fontSize(7).fillColor(MUTED)
    .text('ORIGINAL', MARGIN + 14, barY + 5)
    .text('Página 1 de 1', MARGIN, barY + 5, { width: CONTENT_W - 14, align: 'right' });

  doc.save();
  doc.fontSize(5.5).fillColor('#94a3b8');
  doc.rotate(-90, { origin: [PAGE_W - 18, PAGE_H / 2] });
  doc.text(`Generado e impreso por ${empresa}`, PAGE_W - 18, PAGE_H / 2 - 80, { width: 220 });
  doc.restore();
}

module.exports = {
  MARGIN,
  PAGE_W,
  PAGE_H,
  CONTENT_W,
  BLUE,
  GRAY_BG,
  BORDER,
  INK,
  MUTED,
  fmtDate,
  fmtDateIso,
  fmtMoney,
  fmtMoneyDecimal,
  labelValue,
  loadLogoForPdf,
  drawItemsTable,
  drawTotalsBlock,
  drawPageFooter
};
