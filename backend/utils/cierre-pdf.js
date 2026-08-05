const PDFDocument = require('pdfkit');
const {
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
  fmtMoney,
  loadLogoForPdf
} = require('./pdf-siigo-helpers');

/**
 * Genera un PDF estructurado del Informe Z / Arqueo de Cierre de Caja.
 * @param {Object} caja - Objeto modelo Caja con sede, usuarioApertura, usuarioCierre, egresos
 * @param {Object} config - Configuración del sistema (empresa, logo, etc.)
 * @param {Object} detalle - { ventas: [], egresos: [], abonos: [] }
 * @returns {Promise<Buffer>}
 */
async function generarCierrePDF(caja, config = {}, detalle = { ventas: [], egresos: [], abonos: [] }) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: MARGIN,
        info: {
          Title: `Informe Z - Cierre de Caja #${caja.id}`,
          Author: config.nombreEmpresa || 'ERP TechStore',
          Subject: 'Arqueo e Informe de Cierre de Caja'
        }
      });

      const buffers = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      const innerX = MARGIN;
      const innerW = CONTENT_W;

      // 1. Cargar Logo si está configurado
      const logoBuffer = await loadLogoForPdf(config.logoUrl);
      let y = MARGIN;

      // Header Block
      if (logoBuffer) {
        try {
          doc.image(logoBuffer, innerX, y, { fit: [140, 50] });
        } catch (_) {}
      }

      // Empresa & Titulo
      doc.font('Helvetica-Bold').fontSize(16).fillColor(BLUE).text(config.nombreEmpresa || 'ERP TECHSTORE', innerX + 160, y, { align: 'right', width: innerW - 160 });
      doc.fontSize(11).fillColor(INK).text('INFORME Z / ARQUEO DE CIERRE DE CAJA', innerX + 160, y + 20, { align: 'right', width: innerW - 160 });
      doc.fontSize(8.5).fillColor(MUTED).text(`Sede: ${caja.sede?.nombre || 'General'} | Cierre ID: #${caja.id}`, innerX + 160, y + 35, { align: 'right', width: innerW - 160 });

      y += 55;

      // Línea divisoria
      doc.strokeColor(BORDER).lineWidth(1).moveTo(innerX, y).lineTo(innerX + innerW, y).stroke();
      y += 10;

      // Box 1: Información de la Sesión de Caja
      doc.save();
      doc.fillColor(GRAY_BG).roundedRect(innerX, y, innerW, 45, 4).fill();
      doc.restore();

      const fApertura = caja.createdAt ? new Date(caja.createdAt).toLocaleString('es-CO') : '—';
      const fCierre = caja.horaCierre ? new Date(caja.horaCierre).toLocaleString('es-CO') : 'En curso / Reciente';
      const usrApertura = caja.usuarioApertura?.nombre || 'N/A';
      const usrCierre = caja.usuarioCierre?.nombre || usrApertura;

      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(BLUE).text('INFORMACIÓN DE LA SESIÓN', innerX + 10, y + 6);

      doc.font('Helvetica').fontSize(8).fillColor(INK);
      doc.text(`Fecha Caja: ${caja.fecha}`, innerX + 10, y + 20);
      doc.text(`Hora Apertura: ${fApertura}`, innerX + 10, y + 31);

      doc.text(`Apertura por: ${usrApertura}`, innerX + 220, y + 20);
      doc.text(`Hora Cierre: ${fCierre}`, innerX + 220, y + 31);

      doc.text(`Cierre por: ${usrCierre}`, innerX + 410, y + 20);
      doc.text(`Estado: ${(caja.estado || 'cerrada').toUpperCase()}`, innerX + 410, y + 31);

      y += 55;

      // Box 2: Resumen Financiero y Cuadre de Caja
      doc.font('Helvetica-Bold').fontSize(11).fillColor(BLUE).text('1. RESUMEN DE VENTAS Y CUADRE DE CAJA', innerX, y);
      y += 16;

      const totalEfectivoIngresos = parseFloat(caja.totalVentasEfectivo || 0);
      const totalNequi = parseFloat(caja.totalVentasNequi || 0);
      const totalDaviplata = parseFloat(caja.totalVentasDaviplata || 0);
      const totalTarjeta = parseFloat(caja.totalVentasTarjeta || 0);
      const totalTransferencia = parseFloat(caja.totalVentasTransferencia || 0);
      const totalEgresos = parseFloat(caja.totalEgresos || 0);
      const montoApertura = parseFloat(caja.montoApertura || 0);

      const totalIngresosDigitales = totalNequi + totalDaviplata + totalTarjeta + totalTransferencia;
      const totalVentasGlobal = totalEfectivoIngresos + totalIngresosDigitales;

      const efectivoTeoricoEsperado = montoApertura + totalEfectivoIngresos - totalEgresos;
      const diferencia = parseFloat(caja.diferencia || 0);

      // Tabla de Desglose por Medio de Pago
      const colW = innerW / 4;
      const rowH = 18;

      // Encabezado de tabla
      doc.save();
      doc.fillColor(BLUE).rect(innerX, y, innerW, rowH).fill();
      doc.restore();

      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#ffffff');
      doc.text('Medio de Pago', innerX + 8, y + 5, { width: colW * 2 });
      doc.text('Tipo', innerX + colW * 2 + 8, y + 5, { width: colW - 8 });
      doc.text('Total Registrado', innerX + colW * 3 + 8, y + 5, { width: colW - 16, align: 'right' });

      y += rowH;

      const medios = [
        { nombre: 'Monto Base Inicial (Apertura)', tipo: 'Fondo Caja', valor: montoApertura },
        { nombre: 'Efectivo', tipo: 'Físico', valor: totalEfectivoIngresos },
        { nombre: 'Nequi', tipo: 'Digital', valor: totalNequi },
        { nombre: 'Daviplata', tipo: 'Digital', valor: totalDaviplata },
        { nombre: 'Tarjeta de Crédito / Débito', tipo: 'Electrónico', valor: totalTarjeta },
        { nombre: 'Transferencia Bancaria', tipo: 'Bancario', valor: totalTransferencia },
        { nombre: 'Total Egresos / Retiros', tipo: 'Salida de Efectivo', valor: -totalEgresos }
      ];

      doc.font('Helvetica').fontSize(8.5).fillColor(INK);
      medios.forEach((m, idx) => {
        if (idx % 2 === 1) {
          doc.save();
          doc.fillColor(GRAY_BG).rect(innerX, y, innerW, rowH).fill();
          doc.restore();
        }

        const valStr = m.valor < 0 ? `- ${fmtMoney(Math.abs(m.valor))}` : fmtMoney(m.valor);
        const textColor = m.valor < 0 ? '#c53030' : INK;

        doc.fillColor(INK).text(m.nombre, innerX + 8, y + 5, { width: colW * 2 });
        doc.fillColor(MUTED).text(m.tipo, innerX + colW * 2 + 8, y + 5, { width: colW - 8 });
        doc.fillColor(textColor).text(valStr, innerX + colW * 3 + 8, y + 5, { width: colW - 16, align: 'right' });

        y += rowH;
      });

      y += 8;

      // Box de Totales y Arqueo (Cuadre)
      doc.save();
      doc.strokeColor(BORDER).rect(innerX, y, innerW, 48).stroke();
      doc.restore();

      doc.font('Helvetica-Bold').fontSize(9).fillColor(INK);
      doc.text('TOTAL VENTAS DEL DÍA:', innerX + 10, y + 8);
      doc.fillColor(BLUE).text(fmtMoney(totalVentasGlobal), innerX + 180, y + 8, { align: 'right', width: 120 });

      doc.fillColor(INK).text('EFECTIVO ESPERADO EN CAJA:', innerX + 10, y + 22);
      doc.text(fmtMoney(efectivoTeoricoEsperado), innerX + 180, y + 22, { align: 'right', width: 120 });

      // Columna derecha del arqueo
      doc.text('RESULTADO ARQUEO:', innerX + 320, y + 8);
      let estadoTexto = 'CUADRADO PERFECTO';
      let estadoColor = '#2f855a'; // verde

      if (diferencia > 0) {
        estadoTexto = `SOBRANTE DE ${fmtMoney(diferencia)}`;
        estadoColor = '#c05621'; // naranja
      } else if (diferencia < 0) {
        estadoTexto = `FALTANTE DE ${fmtMoney(Math.abs(diferencia))}`;
        estadoColor = '#e53e3e'; // rojo
      }

      doc.fillColor(estadoColor).fontSize(10).text(estadoTexto, innerX + 320, y + 24, { width: innerW - 330 });

      y += 60;

      // Observaciones
      if (caja.observaciones) {
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(MUTED).text('OBSERVACIONES DE CIERRE:', innerX, y);
        y += 12;
        doc.font('Helvetica-Oblique').fontSize(8).fillColor(INK).text(caja.observaciones, innerX, y, { width: innerW });
        y += doc.heightOfString(caja.observaciones, { width: innerW }) + 10;
      }

      // Box 3: Detalle de Transacciones (si existe)
      if (detalle.ventas?.length || detalle.egresos?.length || detalle.abonos?.length) {
        doc.font('Helvetica-Bold').fontSize(11).fillColor(BLUE).text('2. LISTADO DETALLADO DE TRANSACCIONES DEL TURNO', innerX, y);
        y += 16;

        // Ventas
        if (detalle.ventas?.length) {
          doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(`• Ventas Realizadas (${detalle.ventas.length})`, innerX, y);
          y += 12;

          const vCols = [
            { label: 'Factura / ID', w: 90 },
            { label: 'Cliente', w: 180 },
            { label: 'Medio de Pago', w: 120 },
            { label: 'Total', w: 140, align: 'right' }
          ];

          doc.save();
          doc.fillColor(GRAY_BG).rect(innerX, y, innerW, 16).fill();
          doc.restore();

          let cx = innerX;
          doc.font('Helvetica-Bold').fontSize(7.5).fillColor(INK);
          vCols.forEach(c => {
            doc.text(c.label, cx + 4, y + 4, { width: c.w - 8, align: c.align || 'left' });
            cx += c.w;
          });

          y += 16;
          doc.font('Helvetica').fontSize(7.5);

          for (const v of detalle.ventas) {
            if (y > PAGE_H - 60) {
              doc.addPage();
              y = MARGIN;
            }
            cx = innerX;
            doc.text(v.numeroFactura || `Venta #${v.id}`, cx + 4, y + 3, { width: vCols[0].w - 8 });
            cx += vCols[0].w;
            doc.text(v.cliente || 'Cliente General', cx + 4, y + 3, { width: vCols[1].w - 8 });
            cx += vCols[1].w;
            doc.text(v.medioPago || 'Efectivo', cx + 4, y + 3, { width: vCols[2].w - 8 });
            cx += vCols[2].w;
            doc.text(fmtMoney(v.total), cx + 4, y + 3, { width: vCols[3].w - 8, align: 'right' });

            y += 14;
          }
          y += 10;
        }

        // Egresos
        if (detalle.egresos?.length) {
          if (y > PAGE_H - 100) {
            doc.addPage();
            y = MARGIN;
          }

          doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(`• Retiros / Egresos Realizados (${detalle.egresos.length})`, innerX, y);
          y += 12;

          const eCols = [
            { label: 'Categoría', w: 120 },
            { label: 'Motivo / Detalle', w: 230 },
            { label: 'Monto', w: 180, align: 'right' }
          ];

          doc.save();
          doc.fillColor(GRAY_BG).rect(innerX, y, innerW, 16).fill();
          doc.restore();

          let cx = innerX;
          doc.font('Helvetica-Bold').fontSize(7.5).fillColor(INK);
          eCols.forEach(c => {
            doc.text(c.label, cx + 4, y + 4, { width: c.w - 8, align: c.align || 'left' });
            cx += c.w;
          });

          y += 16;
          doc.font('Helvetica').fontSize(7.5);

          for (const eg of detalle.egresos) {
            if (y > PAGE_H - 60) {
              doc.addPage();
              y = MARGIN;
            }
            cx = innerX;
            doc.text(eg.categoria || 'Gasto General', cx + 4, y + 3, { width: eCols[0].w - 8 });
            cx += eCols[0].w;
            doc.text(eg.motivo || '—', cx + 4, y + 3, { width: eCols[1].w - 8 });
            cx += eCols[1].w;
            doc.fillColor('#c53030').text(`- ${fmtMoney(eg.monto)}`, cx + 4, y + 3, { width: eCols[2].w - 8, align: 'right' });
            doc.fillColor(INK);

            y += 14;
          }
          y += 10;
        }
      }

      // Pie de página firmas
      if (y > PAGE_H - 100) {
        doc.addPage();
        y = MARGIN;
      } else {
        y += 25;
      }

      const sigW = 200;
      doc.strokeColor(BORDER).lineWidth(0.8);
      doc.moveTo(innerX + 30, y + 30).lineTo(innerX + 30 + sigW, y + 30).stroke();
      doc.moveTo(innerX + innerW - 30 - sigW, y + 30).lineTo(innerX + innerW - 30, y + 30).stroke();

      doc.font('Helvetica').fontSize(8).fillColor(MUTED);
      doc.text('Firma Cajero / Responsable', innerX + 30, y + 35, { width: sigW, align: 'center' });
      doc.text('Firma Supervisor / Administrador', innerX + innerW - 30 - sigW, y + 35, { width: sigW, align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generarCierrePDF
};
