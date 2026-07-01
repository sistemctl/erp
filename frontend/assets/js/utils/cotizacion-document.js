import { numeroALetras } from './numero-a-letras.js';
import { calcCotIvaItems, etiquetaIvaCot } from './cotizacion-iva.js';

const cotFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

const QR_SVG = `
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
`;

function fmtCotDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function printCotizacionDocumento() {
  const src = document.getElementById('cotizacion-print-area');
  let host = document.getElementById('cotizacion-print-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'cotizacion-print-host';
    host.className = 'cotizacion-print-host';
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
    document.body.classList.remove('printing-cotizacion');
    window.removeEventListener('afterprint', cleanup);
  };
  document.body.classList.add('printing-cotizacion');
  window.addEventListener('afterprint', cleanup);
  window.print();
}

export function renderCotizacionDocumento(c, config = {}) {
  const empresa = config.empresa || 'TechStore Colombia S.A.S.';
  const nit = config.nit || '—';
  const direccion = config.direccion || c.sede?.direccion || '—';
  const telefono = config.telefono || c.sede?.telefono || '—';
  const ivaPct = config.ivaDefecto ?? 19;
  const { base, iva, total } = calcCotIvaItems(c.items, ivaPct);
  const ivaLabel = etiquetaIvaCot(iva, ivaPct);
  const cliente = c.cliente;
  const minRows = Math.max(c.items.length, 3);
  const emptyRows = minRows - c.items.length;

  const itemRows = c.items.map((item) => `
    <tr>
      <td>${item.producto?.codigoBarras || '—'}</td>
      <td>${item.descripcion}</td>
      <td class="text-center">UND</td>
      <td class="text-center">${item.cantidad}</td>
      <td class="text-end">${cotFormatter.format(item.precioUnitario)}</td>
      <td class="text-end">${cotFormatter.format(item.subtotal)}</td>
    </tr>
  `).join('');

  const blankRows = Array.from({ length: emptyRows }, () => `
    <tr class="cot-doc__row-empty"><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>
  `).join('');

  const logoHtml = config.logoUrl
    ? `<img src="${config.logoUrl}" alt="${empresa}" class="cot-doc__logo">`
    : '';

  return `
    <article class="cot-doc cot-doc--cotizacion" id="cotizacion-print-area">
      <header class="cot-doc__header">
        <div class="cot-doc__empresa">
          ${logoHtml}
          <h1 class="cot-doc__empresa-nombre">${empresa.toUpperCase()}</h1>
          <p>NIT: ${nit}</p>
          <p>Dirección: ${direccion}</p>
          <p>Ciudad: ${c.sede?.nombre || '—'} — COLOMBIA</p>
          <p>Tel: ${telefono}</p>
        </div>
        <div class="cot-doc__qr" aria-hidden="true">
          <div class="cot-doc__qr-placeholder cot-doc__qr-placeholder--print">
            ${QR_SVG}
            <span>${c.numeroCotizacion}</span>
          </div>
        </div>
        <div class="cot-doc__doc-id">
          <div class="cot-doc__doc-id-inner">
            <strong>COTIZACIÓN</strong>
            <span>N° ${c.numeroCotizacion}</span>
            <small>${(c.estado || '').toUpperCase()}</small>
          </div>
        </div>
      </header>

      <section class="cot-doc__grid">
        <div>
          <h2>Datos del cliente</h2>
          <dl>
            <div><dt>Cliente</dt><dd>${cliente?.nombre || 'Cliente general'}</dd></div>
            <div><dt>NIT / C.C.</dt><dd>${cliente?.documento || '—'}</dd></div>
            <div><dt>Dirección</dt><dd>${cliente?.direccion || '—'}</dd></div>
            <div><dt>Teléfono</dt><dd>${cliente?.telefono || '—'}</dd></div>
          </dl>
        </div>
        <div>
          <h2>Datos del documento</h2>
          <dl>
            <div><dt>Fecha cotización</dt><dd>${fmtCotDate(c.createdAt)}</dd></div>
            <div><dt>Fecha vencimiento</dt><dd>${fmtCotDate(c.fechaVencimiento)}</dd></div>
            <div><dt>Vendedor</dt><dd>${c.usuario?.nombre || '—'}</dd></div>
            <div><dt>Sede</dt><dd>${c.sede?.nombre || '—'}</dd></div>
          </dl>
        </div>
      </section>

      <table class="cot-doc__table">
        <thead>
          <tr>
            <th>Código</th>
            <th>Descripción</th>
            <th>Unidad</th>
            <th>Cant.</th>
            <th>Valor Unitario</th>
            <th>Valor Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
          ${blankRows}
        </tbody>
      </table>
      <p class="cot-doc__items-count">Total ítems: ${c.items.length}</p>

      <footer class="cot-doc__footer">
        <div class="cot-doc__footer-left">
          <div>
            <h3>Condición de pago</h3>
            <p>Cotización informativa — sujeta a disponibilidad de inventario.</p>
          </div>
          <div>
            <h3>Valor en letras</h3>
            <p>${numeroALetras(total)}</p>
          </div>
          ${c.notas ? `
            <div>
              <h3>Observaciones</h3>
              <p>${c.notas}</p>
            </div>
          ` : ''}
        </div>
        <div class="cot-doc__totals">
          <div class="cot-doc__total-row"><span>Total bruto</span><span>${cotFormatter.format(base)}</span></div>
          <div class="cot-doc__total-row"><span>${ivaLabel}</span><span>${cotFormatter.format(iva)}</span></div>
          <div class="cot-doc__total-row cot-doc__total-row--final"><span>Total a pagar</span><span>${cotFormatter.format(total)}</span></div>
        </div>
      </footer>

      <p class="cot-doc__legal">
        Este documento es una cotización y no constituye factura de venta. Los precios pueden variar según disponibilidad.
        La validez de esta oferta está sujeta a la fecha de vencimiento indicada.
      </p>

      <div class="cot-doc__signatures">
        <div><span></span><small>Elaborado por</small></div>
        <div><span></span><small>Firma aceptación cliente</small></div>
      </div>

      <div class="cot-doc__page-bar">
        <span>ORIGINAL</span>
        <span>Página 1 de 1</span>
      </div>
    </article>
  `;
}
