const priceFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0
});

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildLabelHtml(product, options = {}) {
  const { includePrice = false } = options;
  const nombre = escapeHtml((product.nombre || 'Producto').slice(0, 42));
  const codigo = escapeHtml(product.codigoBarras || '');
  const priceHtml = includePrice && product.precioVenta != null
    ? `<div class="barcode-label__price">${escapeHtml(priceFormatter.format(Number(product.precioVenta)))}</div>`
    : '';

  return `
    <div class="barcode-label">
      <div class="barcode-label__name">${nombre}</div>
      <svg class="barcode-label__svg" data-barcode="${codigo}"></svg>
      <div class="barcode-label__code">${codigo}</div>
      ${priceHtml}
    </div>
  `;
}

function renderBarcodesInContainer(container) {
  if (!window.JsBarcode || !container) return;
  container.querySelectorAll('svg[data-barcode]').forEach((svg) => {
    const value = svg.getAttribute('data-barcode');
    if (!value) return;
    try {
      window.JsBarcode(svg, value, {
        format: 'CODE128',
        width: 1.4,
        height: 42,
        displayValue: false,
        margin: 2
      });
    } catch (_) {
      /* código inválido para Code128 */
    }
  });
}

export function renderBarcodeLabelsHtml(products, options = {}) {
  const { copies = 1, includePrice = false } = options;
  const labels = [];

  for (const product of products) {
    const count = Math.max(1, parseInt(copies, 10) || 1);
    for (let i = 0; i < count; i += 1) {
      labels.push(buildLabelHtml(product, { includePrice }));
    }
  }

  return `<div class="barcode-labels-sheet">${labels.join('')}</div>`;
}

export function renderBarcodePreview(product, options = {}) {
  const html = renderBarcodeLabelsHtml([product], { ...options, copies: 1 });
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  renderBarcodesInContainer(wrapper);
  return wrapper.innerHTML;
}

export function printBarcodeLabels(products, options = {}) {
  let host = document.getElementById('barcode-print-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'barcode-print-host';
    host.className = 'barcode-print-host';
    document.body.appendChild(host);
  }

  host.innerHTML = renderBarcodeLabelsHtml(products, options);
  renderBarcodesInContainer(host);

  const cleanup = () => {
    document.body.classList.remove('printing-barcode');
    window.removeEventListener('afterprint', cleanup);
  };

  window.addEventListener('afterprint', cleanup);
  document.body.classList.add('printing-barcode');
  window.print();
}

export function isInternalBarcode(codigo) {
  return /^29\d{10}$/.test(String(codigo || '').trim());
}
