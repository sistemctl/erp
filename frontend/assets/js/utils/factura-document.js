import { numeroALetras } from './numero-a-letras.js';

const facFormatter = new Intl.NumberFormat('es-CO', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function fmtFacDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtFacMoney(n) {
  return facFormatter.format(parseFloat(n) || 0);
}

function getFacItems(f) {
  if (f.venta?.items?.length) {
    return f.venta.items.map((item) => ({
      codigo: item.producto?.codigoBarras || '—',
      descripcion: item.producto?.nombre || '—',
      cantidad: item.cantidad,
      precioUnitario: item.precioModificado,
      subtotal: item.subtotal
    }));
  }
  if (f.ordenReparacion) {
    const orden = f.ordenReparacion;
    const items = [{
      codigo: '—',
      descripcion: `Mano de obra: ${orden.tipoEquipo || ''} ${orden.marca || ''} ${orden.modelo || ''}`.trim(),
      cantidad: 1,
      precioUnitario: orden.costoManoObra,
      subtotal: orden.costoManoObra
    }];
    for (const rep of orden.repuestos || []) {
      items.push({
        codigo: rep.producto?.codigoBarras || '—',
        descripcion: rep.producto?.nombre || 'Repuesto',
        cantidad: rep.cantidad,
        precioUnitario: rep.costoUnitario,
        subtotal: rep.costoUnitario * rep.cantidad
      });
    }
    return items;
  }
  return [];
}

function getCondicionPago(estado) {
  if (estado === 'pagada') return 'Contado';
  if (estado === 'pendiente') return 'Crédito';
  if (estado === 'abono_parcial') return 'Crédito — abono parcial';
  if (estado === 'vencida') return 'Crédito — vencida';
  if (estado === 'anulada') return 'Anulada';
  return '—';
}

function numeroALetrasCOP(valor) {
  return numeroALetras(valor);
}

export function printFacturaDocumento() {
  const src = document.getElementById('factura-print-area');
  let host = document.getElementById('factura-print-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'factura-print-host';
    host.className = 'factura-print-host';
    host.setAttribute('aria-hidden', 'true');
    document.body.appendChild(host);
  }
  if (!src) {
    window.print();
    return;
  }
  host.innerHTML = src.outerHTML;
  const cleanup = () => {
    host.innerHTML = '';
    document.body.classList.remove('printing-factura');
    window.removeEventListener('afterprint', cleanup);
  };
  document.body.classList.add('printing-factura');
  window.addEventListener('afterprint', cleanup);
  window.print();
}

export function renderFacturaDocumento(f, config = {}) {
  const empresa = config.empresa || 'TechStore Colombia S.A.S.';
  const nit = config.nit || '—';
  const direccion = config.direccion || f.sede?.direccion || '—';
  const telefono = config.telefono || f.sede?.telefono || '—';
  const ivaPct = config.ivaDefecto ?? 19;
  const cliente = f.cliente;
  const items = getFacItems(f);
  const minRows = Math.max(items.length, 3);
  const vendedor = f.venta?.usuario?.nombre || '—';

  const itemRows = items.map((item) => `
    <tr>
      <td>${item.codigo}</td>
      <td>${item.descripcion}</td>
      <td class="text-center">UND</td>
      <td class="text-center">${item.cantidad}</td>
      <td class="text-end">${fmtFacMoney(item.precioUnitario)}</td>
      <td class="text-end">${fmtFacMoney(item.subtotal)}</td>
    </tr>
  `).join('');

  const blankRows = Array.from({ length: minRows - items.length }, () => `
    <tr class="cot-doc__row-empty"><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>
  `).join('');

  const pagosHtml = f.venta?.pagos?.length
    ? f.venta.pagos.map((p) => {
        const metodo = (p.metodo || 'Pago').replace(/_/g, ' ');
        return `<p class="mb-0 text-capitalize">${metodo}: ${fmtFacMoney(p.monto)}</p>`;
      }).join('')
    : '';

  const logoHtml = config.logoUrl
    ? `<img src="${config.logoUrl}" alt="${empresa}" class="cot-doc__logo">`
    : '';

  return `
    <article class="cot-doc cot-doc--factura" id="factura-print-area">
      <header class="cot-doc__header cot-doc__header--factura">
        <div class="cot-doc__logo-wrap">${logoHtml}</div>
        <div class="cot-doc__empresa cot-doc__empresa--center">
          <h1 class="cot-doc__empresa-nombre">${empresa.toUpperCase()}</h1>
          <p>NIT : ${nit}</p>
          <p>${direccion}</p>
          <p>${f.sede?.nombre || '—'} — COLOMBIA</p>
          ${telefono ? `<p>Tel: ${telefono}</p>` : ''}
          <p class="cot-doc__legal-line">Responsable de IVA</p>
        </div>
        <div class="cot-doc__qr" aria-hidden="true">
          <div class="cot-doc__qr-placeholder cot-doc__qr-placeholder--print">
            <svg viewBox="0 0 64 64" width="52" height="52" aria-hidden="true" class="cot-doc__qr-svg">
              <rect width="64" height="64" fill="#fff"/>
              <rect x="4" y="4" width="18" height="18" fill="#111"/>
              <rect x="42" y="4" width="18" height="18" fill="#111"/>
              <rect x="4" y="42" width="18" height="18" fill="#111"/>
              <rect x="28" y="28" width="8" height="8" fill="#111"/>
              <rect x="44" y="44" width="6" height="6" fill="#111"/>
              <rect x="52" y="36" width="6" height="6" fill="#111"/>
              <rect x="36" y="52" width="6" height="6" fill="#111"/>
            </svg>
            <span>${f.numeroFactura}</span>
          </div>
        </div>
      </header>

      <section class="cot-doc__grid cot-doc__grid--3">
        <div>
          <h2>Cliente</h2>
          <dl>
            <div><dt>Cliente</dt><dd>${cliente?.nombre || 'Cliente general'}</dd></div>
            <div><dt>NIT</dt><dd>${cliente?.documento || '—'}</dd></div>
            <div><dt>Dirección</dt><dd>${cliente?.direccion || '—'}</dd></div>
          </dl>
        </div>
        <div>
          <h2>Información adicional</h2>
          <dl>
            <div><dt>Teléfono</dt><dd>${cliente?.telefono || '—'}</dd></div>
            <div><dt>Vendedor</dt><dd>${vendedor}</dd></div>
            <div><dt>Correo</dt><dd>${cliente?.email || '—'}</dd></div>
          </dl>
        </div>
        <div class="cot-doc__doc-id">
          <div class="cot-doc__doc-id-inner">
            <strong>FACTURA DE VENTA</strong>
            <span>${f.numeroFactura}</span>
            <small>Generación: ${fmtFacDate(f.createdAt)}</small>
            <small>Vence: ${fmtFacDate(f.fechaVencimiento)}</small>
            <small>${(f.estado || '').toUpperCase()}</small>
          </div>
        </div>
      </section>

      <table class="cot-doc__table">
        <thead>
          <tr>
            <th>Código</th>
            <th>Descripción</th>
            <th>Unidad</th>
            <th>Cant.</th>
            <th>V. Unit</th>
            <th>Valor Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
          ${blankRows}
        </tbody>
      </table>
      <p class="cot-doc__items-count">Total ítems: ${items.length}</p>

      <footer class="cot-doc__footer">
        <div class="cot-doc__footer-left">
          <div>
            <h3>Condición de pago</h3>
            <p>${getCondicionPago(f.estado)}</p>
            ${pagosHtml}
          </div>
          <div>
            <h3>Valor en letras</h3>
            <p>${numeroALetrasCOP(f.total)}</p>
          </div>
        </div>
        <div class="cot-doc__totals">
          <div class="cot-doc__total-row"><span>Total bruto</span><span>${fmtFacMoney(f.subtotal)}</span></div>
          <div class="cot-doc__total-row"><span>IVA (${ivaPct}%)</span><span>${fmtFacMoney(f.iva)}</span></div>
          <div class="cot-doc__total-row cot-doc__total-row--final"><span>Total a pagar</span><span>${fmtFacMoney(f.total)}</span></div>
        </div>
      </footer>

      <p class="cot-doc__legal">
        Esta factura se asimila en todos sus efectos legales a una letra de cambio según el artículo 774 del Código de Comercio.
        Conserve este documento para garantías y trámites posteriores.
      </p>

      <div class="cot-doc__signatures">
        <div><span></span><small>Elaborado por</small></div>
        <div><span></span><small>Firma recibido</small></div>
      </div>

      <div class="cot-doc__page-bar">
        <span>ORIGINAL</span>
        <span>Página 1 de 1</span>
      </div>
    </article>
  `;
}
