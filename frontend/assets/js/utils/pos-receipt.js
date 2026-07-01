const METODO_LABELS = {
  efectivo: 'Efectivo',
  nequi: 'Nequi',
  daviplata: 'Daviplata',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  trade_in: 'Trade-in'
};

function fmtAmount(n) {
  return Math.round(parseFloat(n) || 0).toLocaleString('es-CO');
}

function fmtSiigoDate(d = new Date()) {
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  const h = String(dt.getHours()).padStart(2, '0');
  const min = String(dt.getMinutes()).padStart(2, '0');
  return `${y}/${m}/${day} ${h}:${min}`;
}

function fieldLine(label, value) {
  return `<p class="pos-receipt__line"><span>${label} :</span> ${value || '—'}</p>`;
}

/**
 * Ticket POS térmico — estilo Siigo POS (monoespaciado, 80mm).
 */
export function renderPosReceipt({
  empresaConfig = {},
  sedeNombre = '',
  sedeDireccion = '',
  cajeroNombre = '',
  clienteNombre = '',
  clienteDocumento = '',
  clienteDireccion = '',
  numeroFactura = '',
  fecha = new Date(),
  items = [],
  subtotal = 0,
  descuentoTotal = 0,
  iva = 0,
  total = 0,
  cobrarIva = true,
  pagos = [],
  esCredito = false
}) {
  const empresa = (empresaConfig.empresa || 'TechStore Colombia').toUpperCase();
  const nit = empresaConfig.nit || '';
  const direccion = empresaConfig.direccion || sedeDireccion || '';
  const telefono = empresaConfig.telefono || '';
  const ciudad = sedeNombre || 'Colombia';
  const telLine = telefono ? `Tels: ${telefono}` : 'Tels: /';

  const cliente = clienteNombre || 'CLIENTE GENERAL';
  const docCliente = clienteDocumento || '222222222-0';
  const dirCliente = clienteDireccion || '—';

  const itemRows = items.map((item) => `
    <tr>
      <td class="pos-receipt__ct">${item.cantidad}</td>
      <td class="pos-receipt__desc">${item.nombre}${item.imei ? `<br><span class="pos-receipt__imei">IMEI: ${item.imei}</span>` : ''}</td>
      <td class="pos-receipt__val">${fmtAmount(item.subtotal)}</td>
    </tr>
  `).join('');

  const totalPagado = pagos.reduce((acc, p) => acc + (parseFloat(p.monto) || 0), 0);
  const cambio = !esCredito && totalPagado > total ? totalPagado - total : 0;

  const pagosRows = pagos.length
    ? pagos.map((p) => `
        <div class="pos-receipt__pay-line">
          <span>${METODO_LABELS[p.metodo] || p.metodo}</span>
          <span>${fmtAmount(p.monto)}</span>
        </div>
      `).join('')
    : `<div class="pos-receipt__pay-line">
        <span>${esCredito ? 'Crédito' : 'Efectivo'}</span>
        <span>${fmtAmount(total)}</span>
      </div>`;

  const subtotalNeto = Math.max(0, parseFloat(subtotal) - parseFloat(descuentoTotal || 0));

  return `
    <article class="pos-receipt" id="pos-print-receipt">
      <header class="pos-receipt__head">
        <p class="pos-receipt__empresa">${empresa}</p>
        ${nit ? `<p>${nit}</p>` : ''}
        ${direccion ? `<p>${direccion}</p>` : ''}
        <p>${ciudad} - ${telLine}</p>
        <p class="pos-receipt__legal-line">Responsable de IVA</p>
      </header>

      <hr class="pos-receipt__rule pos-receipt__rule--thick">

      <p class="pos-receipt__title">Factura de venta : ${numeroFactura}</p>

      ${fieldLine('Fecha', fmtSiigoDate(fecha))}
      ${fieldLine('Cliente', cliente)}
      ${fieldLine('C.C / NIT', docCliente)}
      ${fieldLine('Dirección', dirCliente)}
      ${cajeroNombre ? fieldLine('Cajero', cajeroNombre) : ''}

      <hr class="pos-receipt__rule pos-receipt__rule--thick">

      <table class="pos-receipt__items">
        <thead>
          <tr>
            <th>CT</th>
            <th>Descripción</th>
            <th>Valor</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
        </tbody>
      </table>

      <hr class="pos-receipt__rule pos-receipt__rule--dash">

      <div class="pos-receipt__subtotal">
        <span>SUBTOTAL</span>
        <span>${fmtAmount(subtotalNeto)}</span>
      </div>
      ${descuentoTotal > 0 ? `
        <div class="pos-receipt__subtotal">
          <span>Descuento</span>
          <span>-${fmtAmount(descuentoTotal)}</span>
        </div>
      ` : ''}
      ${cobrarIva && iva > 0 ? `
        <div class="pos-receipt__subtotal">
          <span>IVA</span>
          <span>${fmtAmount(iva)}</span>
        </div>
      ` : ''}
      <div class="pos-receipt__total">
        <span>Total:</span>
        <span>${fmtAmount(total)}</span>
      </div>

      <hr class="pos-receipt__rule pos-receipt__rule--thick">

      <p class="pos-receipt__pay-title">Forma de Pago</p>
      ${pagosRows}
      <div class="pos-receipt__cambio">
        <span>Cambio:</span>
        <span>${fmtAmount(cambio)}</span>
      </div>
      ${esCredito && totalPagado < total ? `
        <div class="pos-receipt__subtotal">
          <span>Saldo crédito</span>
          <span>${fmtAmount(total - totalPagado)}</span>
        </div>
      ` : ''}

      <hr class="pos-receipt__rule pos-receipt__rule--thick">

      <footer class="pos-receipt__foot">
        <p>Elaborado por: ${empresaConfig.empresa || empresa} / POS</p>
        ${nit ? `<p>Nit: ${nit}</p>` : ''}
      </footer>
    </article>
  `;
}
