function fmtAmount(n) {
  return Math.round(parseFloat(n) || 0).toLocaleString('es-CO');
}

function fmtDateStr(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleString('es-CO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function renderCierreTicketHtml({ caja = {}, detalle = { ventas: [], egresos: [] }, config = {} }) {
  const empresa = (config.nombreEmpresa || 'ERP TECHSTORE').toUpperCase();
  const sedeNombre = caja.sede?.nombre || 'General';
  const usrApertura = caja.usuarioApertura?.nombre || 'N/A';
  const usrCierre = caja.usuarioCierre?.nombre || usrApertura;

  const montoApertura = parseFloat(caja.montoApertura || 0);
  const totalEfectivo = parseFloat(caja.totalVentasEfectivo || 0);
  const totalNequi = parseFloat(caja.totalVentasNequi || 0);
  const totalDaviplata = parseFloat(caja.totalVentasDaviplata || 0);
  const totalTarjeta = parseFloat(caja.totalVentasTarjeta || 0);
  const totalTransferencia = parseFloat(caja.totalVentasTransferencia || 0);
  const totalEgresos = parseFloat(caja.totalEgresos || 0);
  const totalIngresos = totalEfectivo + totalNequi + totalDaviplata + totalTarjeta + totalTransferencia;

  const efectivoTeorico = montoApertura + totalEfectivo - totalEgresos;
  const diferencia = parseFloat(caja.diferencia || 0);

  let estadoTexto = 'CUADRADO PERFECTO';
  if (diferencia > 0) estadoTexto = `SOBRANTE: $${fmtAmount(diferencia)}`;
  else if (diferencia < 0) estadoTexto = `FALTANTE: $${fmtAmount(Math.abs(diferencia))}`;

  const ventasRows = (detalle.ventas || []).map(v => `
    <tr>
      <td style="text-align:left;">${v.numeroFactura || `Venta #${v.id}`}</td>
      <td style="text-align:center;">${v.medioPago || 'Efectivo'}</td>
      <td style="text-align:right;">$${fmtAmount(v.total)}</td>
    </tr>
  `).join('');

  const egresosRows = (detalle.egresos || []).map(e => `
    <tr>
      <td style="text-align:left;">${e.categoria || 'Egreso'}</td>
      <td style="text-align:left;">${e.motivo || '—'}</td>
      <td style="text-align:right;">-$${fmtAmount(e.monto)}</td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Ticket Cierre Z #${caja.id}</title>
      <style>
        @page { size: 80mm auto; margin: 0; }
        body {
          font-family: 'Courier New', Courier, monospace;
          font-size: 11px;
          line-height: 1.2;
          width: 72mm;
          margin: 0 auto;
          padding: 8px 0;
          color: #000;
        }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .fw-bold { font-weight: bold; }
        .divider-thick { border-top: 2px dashed #000; margin: 6px 0; }
        .divider-thin { border-top: 1px dashed #000; margin: 4px 0; }
        .row { display: flex; justify-content: space-between; margin-bottom: 2px; }
        table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 10px; }
        th { border-bottom: 1px solid #000; text-align: left; padding: 2px 0; }
        td { padding: 2px 0; }
        .signature-line { margin-top: 25px; border-top: 1px solid #000; text-align: center; font-size: 9px; padding-top: 2px; }
      </style>
    </head>
    <body>
      <div class="text-center fw-bold" style="font-size: 13px;">${empresa}</div>
      <div class="text-center">SEDE: ${sedeNombre.toUpperCase()}</div>
      <div class="text-center fw-bold" style="margin-top: 4px;">INFORME Z - CIERRE DE CAJA #${caja.id}</div>
      <div class="divider-thick"></div>

      <div class="row"><span>Fecha:</span> <span>${caja.fecha || '—'}</span></div>
      <div class="row"><span>Apertura por:</span> <span>${usrApertura}</span></div>
      <div class="row"><span>Hora Apertura:</span> <span>${fmtDateStr(caja.createdAt)}</span></div>
      <div class="row"><span>Cierre por:</span> <span>${usrCierre}</span></div>
      <div class="row"><span>Hora Cierre:</span> <span>${fmtDateStr(caja.horaCierre || caja.updatedAt)}</span></div>

      <div class="divider-thick"></div>
      <div class="fw-bold text-center">RESUMEN DE CAJA Y ARQUEO</div>
      <div class="divider-thin"></div>

      <div class="row"><span>Apertura (Monto Base):</span> <span>$${fmtAmount(montoApertura)}</span></div>
      <div class="row"><span>Efectivo (+):</span> <span>$${fmtAmount(totalEfectivo)}</span></div>
      <div class="row"><span>Nequi (+):</span> <span>$${fmtAmount(totalNequi)}</span></div>
      <div class="row"><span>Daviplata (+):</span> <span>$${fmtAmount(totalDaviplata)}</span></div>
      <div class="row"><span>Tarjeta (+):</span> <span>$${fmtAmount(totalTarjeta)}</span></div>
      <div class="row"><span>Transferencia (+):</span> <span>$${fmtAmount(totalTransferencia)}</span></div>
      <div class="row"><span>Egresos / Retiros (-):</span> <span>-$${fmtAmount(totalEgresos)}</span></div>

      <div class="divider-thin"></div>
      <div class="row fw-bold" style="font-size: 12px;"><span>TOTAL INGRESOS:</span> <span>$${fmtAmount(totalIngresos)}</span></div>
      <div class="row fw-bold"><span>EFECTIVO ESPERADO:</span> <span>$${fmtAmount(efectivoTeorico)}</span></div>
      <div class="divider-thin"></div>
      <div class="text-center fw-bold" style="font-size: 11px;">ARQUEO: ${estadoTexto}</div>
      <div class="divider-thick"></div>

      ${detalle.ventas?.length ? `
        <div class="fw-bold">VENTAS DEL TURNO (${detalle.ventas.length})</div>
        <table>
          <thead>
            <tr><th style="text-align:left;">Comprobante</th><th style="text-align:center;">Pago</th><th style="text-align:right;">Total</th></tr>
          </thead>
          <tbody>${ventasRows}</tbody>
        </table>
        <div class="divider-thin"></div>
      ` : ''}

      ${detalle.egresos?.length ? `
        <div class="fw-bold">RETIROS / EGRESOS (${detalle.egresos.length})</div>
        <table>
          <thead>
            <tr><th style="text-align:left;">Cat.</th><th style="text-align:left;">Motivo</th><th style="text-align:right;">Monto</th></tr>
          </thead>
          <tbody>${egresosRows}</tbody>
        </table>
        <div class="divider-thin"></div>
      ` : ''}

      ${caja.observaciones ? `
        <div style="margin-top: 4px; font-style: italic;">Obs: ${caja.observaciones}</div>
        <div class="divider-thin"></div>
      ` : ''}

      <div class="signature-line">Firma Cajero / Responsable</div>
      <div class="signature-line" style="margin-top: 20px;">Firma Supervisor / Administrador</div>

      <script>
        window.onload = function() {
          window.print();
        };
      </script>
    </body>
    </html>
  `;
}

export function printCierreTicket(ticketData) {
  const htmlContent = renderCierreTicketHtml(ticketData);
  const printWindow = window.open('', '_blank', 'width=400,height=600');
  if (printWindow) {
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  }
}
