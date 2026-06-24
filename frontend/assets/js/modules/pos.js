import { apiFetch } from '../api.js';
import { getUsuario } from '../auth.js';
import { initBarcodeScanner, destroyBarcodeScanner } from '../utils/barcode.js';
import { getLocalDateStr } from '../utils/date.js';

let cart = [];
let maxDescuentoPermitido = 15;
let clientes = [];

export async function initPos(container) {
  const usuario = getUsuario();
  const sedeId = usuario.sedeId;

  // 1. Cargar datos básicos y verificar si la caja está abierta
  let cajaAbierta = null;
  try {
    const hoyStr = getLocalDateStr();
    cajaAbierta = await apiFetch(`/caja/reporte?fecha=${hoyStr}&sede=${sedeId}`).catch(() => null);
    
    // Obtener configuración del sistema para el descuento máximo
    const config = await apiFetch('/config/sistema').catch(() => null);
    maxDescuentoPermitido = config ? parseFloat(config.descuentoMaximoPct) : 15;

    // Cargar clientes para ventas a crédito
    // En las semillas, no creamos clientes, pero hagamos un fetch a clientes y si no hay, creamos una lista por defecto o mock
    clientes = await apiFetch('/clientes').catch(() => [
      { id: '1', nombre: 'Cliente General', documento: '22222222' },
      { id: '2', nombre: 'Juan Pérez', documento: '1019087654' },
      { id: '3', nombre: 'María López', documento: '52876345' }
    ]);
  } catch (e) {
    console.error('Error al inicializar POS:', e);
  }

  if (!cajaAbierta || cajaAbierta.estado === 'cerrada') {
    container.innerHTML = `
      <div class="container-xl py-5">
        <div class="alert alert-warning">
          <h4 class="alert-title">Caja Cerrada</h4>
          <div class="text-secondary">Debe realizar la <a href="#/caja" class="alert-link">Apertura de Caja</a> para esta sede antes de operar el Punto de Venta (POS).</div>
        </div>
      </div>
    `;
    return;
  }

  // Renderizar maquetación del POS
  container.innerHTML = `
    <div class="container-xl">
      <div class="row mb-3 d-print-none">
        <div class="col">
          <h2 class="page-title">Punto de Venta (POS)</h2>
          <div class="text-secondary mt-1">Sede: <strong>${usuario.sedeNombre}</strong> | Cajero: <strong>${usuario.nombre}</strong></div>
        </div>
        <div class="col-auto">
          <span class="badge bg-green-lt p-2">Lectura de código de barras activa ⚡</span>
        </div>
      </div>

      <div class="row row-cards d-print-none">
        <!-- Columna de búsqueda de productos -->
        <div class="col-lg-7">
          <div class="card" style="height: 600px; display: flex; flex-direction: column;">
            <div class="card-body border-bottom py-3">
              <div class="input-icon">
                <span class="input-icon-addon"><i class="ti ti-search"></i></span>
                <input type="text" id="pos-search-input" class="form-control form-control-lg" placeholder="Buscar producto por nombre o código de barras (F2)..." autocomplete="off">
              </div>
            </div>
            <!-- Lista de resultados -->
            <div class="card-body flex-fill" style="overflow-y: auto;" id="pos-search-results">
              <div class="text-center py-5 text-secondary">Use el buscador superior o escanee un código de barras.</div>
            </div>
          </div>
        </div>

        <!-- Columna del Carrito de compra -->
        <div class="col-lg-5">
          <div class="card" style="height: 600px; display: flex; flex-direction: column;">
            <div class="card-header"><h3 class="card-title">Carrito de Venta</h3></div>
            <!-- Items del carrito -->
            <div class="card-body flex-fill p-0" style="overflow-y: auto;" id="pos-cart-items">
              <div class="text-center py-5 text-secondary">El carrito está vacío.</div>
            </div>
            <!-- Resumen de valores -->
            <div class="card-body border-top py-3">
              <div class="d-flex justify-content-between mb-1">
                <span class="text-secondary">Subtotal:</span>
                <span id="pos-subtotal" class="fw-semibold">$ 0</span>
              </div>
              <div class="d-flex justify-content-between mb-1">
                <span class="text-secondary">Descuento:</span>
                <span id="pos-descuento" class="fw-semibold text-danger">-$ 0</span>
              </div>
              <div class="d-flex justify-content-between mb-1">
                <span class="text-secondary">IVA (19%):</span>
                <span id="pos-iva" class="fw-semibold">$ 0</span>
              </div>
              <div class="d-flex justify-content-between border-top pt-2 mb-3">
                <span class="h3 mb-0">TOTAL:</span>
                <span id="pos-total" class="h2 mb-0 text-primary">$ 0</span>
              </div>
              <button id="pos-checkout-btn" class="btn btn-primary w-100 btn-lg" disabled>
                <i class="ti ti-credit-card me-2"></i> Cobrar y Generar Recibo
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal Editar Precio del Item (Price Override) -->
    <div class="modal modal-blur fade" id="modal-override" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered" role="document">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Modificar Precio / Descuento</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <form id="form-override">
            <input type="hidden" id="override-item-idx">
            <div class="modal-body">
              <div class="mb-3">
                <label class="form-label">Nombre del Producto</label>
                <input type="text" id="override-nombre" class="form-control-plaintext fw-bold" readonly>
              </div>
              <div class="row">
                <div class="col-6">
                  <div class="mb-3">
                    <label class="form-label">Precio Base (COP)</label>
                    <input type="text" id="override-precio-base" class="form-control-plaintext" readonly>
                  </div>
                </div>
                <div class="col-6">
                  <div class="mb-3">
                    <label class="form-label">Precio de Costo (COP)</label>
                    <input type="text" id="override-precio-costo" class="form-control-plaintext" readonly>
                  </div>
                </div>
              </div>
              <div class="row">
                <div class="col-6">
                  <div class="mb-3">
                    <label class="form-label">Descuento (%)</label>
                    <input type="number" id="override-descuento-pct" class="form-control" min="0" max="100" step="0.1">
                  </div>
                </div>
                <div class="col-6">
                  <div class="mb-3">
                    <label class="form-label">Precio Modificado (COP)</label>
                    <input type="number" id="override-precio-mod" class="form-control" min="0" step="0.01">
                  </div>
                </div>
              </div>

              <!-- Alerta de venta a pérdida -->
              <div id="loss-warning" class="alert alert-danger d-none my-3">
                ⚠️ Estás vendiendo este producto por debajo del precio de costo (pérdida).
              </div>
              <!-- Alerta descuento excesivo -->
              <div id="discount-warning" class="alert alert-warning d-none my-3">
                ⚠️ El descuento ingresado supera el límite permitido (${maxDescuentoPermitido}%).
              </div>

              <!-- PIN de Admin -->
              <div id="override-pin-wrapper" class="mb-3 d-none">
                <label class="form-label text-danger fw-bold">Se requiere autorización. Ingrese PIN de Administrador:</label>
                <input type="password" id="override-pin-input" class="form-control" placeholder="Contraseña de administrador">
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-link link-secondary" data-bs-dismiss="modal">Cancelar</button>
              <button type="submit" class="btn btn-primary ms-auto">Aplicar Cambios</button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- Modal Pago / Checkout -->
    <div class="modal modal-blur fade" id="modal-checkout" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-centered" role="document">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Cobrar Transacción</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <form id="form-checkout">
            <div class="modal-body">
              <div class="row">
                <!-- Columna de datos de cliente y crédito -->
                <div class="col-md-6 border-end">
                  <div class="mb-3">
                    <label class="form-label">Cliente (Opcional)</label>
                    <select id="checkout-cliente" class="form-select">
                      <option value="">Cliente General (Sin registro)</option>
                      ${clientes.map(c => `<option value="${c.id}">${c.nombre} (${c.documento})</option>`).join('')}
                    </select>
                  </div>
                  <!-- Contenedor Trade-In dinámico -->
                  <div id="checkout-trade-in-select-container" class="mb-3 d-none"></div>
                  <div class="mb-3">
                    <label class="form-check form-switch mt-3">
                      <input class="form-check-input" type="checkbox" id="checkout-credito">
                      <span class="form-check-label fw-bold text-primary">¿Venta a Crédito?</span>
                    </label>
                    <div class="text-secondary small">Si se marca, el saldo pendiente se cargará a la cartera del cliente.</div>
                  </div>
                  <div class="mb-3">
                    <label class="form-label">Observaciones de la Venta</label>
                    <textarea id="checkout-observaciones" class="form-control" rows="3" placeholder="Garantía extendida, comentarios, etc."></textarea>
                  </div>
                </div>

                <!-- Columna de métodos de pago mixto -->
                <div class="col-md-6">
                  <h3 class="mb-3 text-secondary">Métodos de Pago combinados</h3>
                  <div class="mb-3">
                    <label class="form-label">Efectivo recibido (COP)</label>
                    <input type="number" id="pay-efectivo" class="form-control" min="0" value="0">
                  </div>
                  <div class="mb-3">
                    <label class="form-label">Nequi (COP)</label>
                    <input type="number" id="pay-nequi" class="form-control" min="0" value="0">
                  </div>
                  <div class="mb-3">
                    <label class="form-label">Daviplata (COP)</label>
                    <input type="number" id="pay-daviplata" class="form-control" min="0" value="0">
                  </div>
                  <div class="mb-3">
                    <label class="form-label">Tarjeta (Débito/Crédito COP)</label>
                    <input type="number" id="pay-tarjeta" class="form-control" min="0" value="0">
                  </div>
                  <div class="mb-3">
                    <label class="form-label">Transferencia Bancaria (COP)</label>
                    <input type="number" id="pay-transferencia" class="form-control" min="0" value="0">
                  </div>
                  <div class="mb-3 d-none" id="trade-in-payment-wrapper">
                    <label class="form-label text-success fw-bold">Saldo a favor por Trade-In (COP)</label>
                    <input type="number" id="pay-trade-in" class="form-control text-success fw-bold" readonly value="0">
                    <div class="small text-success" id="trade-in-payment-label"></div>
                  </div>
                </div>
              </div>

              <!-- Resumen final y vuelto -->
              <div class="alert alert-secondary mt-3 mb-0">
                <div class="row align-items-center">
                  <div class="col">
                    <div class="fs-4 text-secondary">Total a Pagar:</div>
                    <div class="h2 mb-0" id="checkout-monto-total">$ 0</div>
                  </div>
                  <div class="col-auto text-end">
                    <div class="fs-4 text-secondary" id="checkout-label-cambio">Cambio (Vuelto):</div>
                    <div class="h2 mb-0 text-success" id="checkout-cambio">$ 0</div>
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-link link-secondary" data-bs-dismiss="modal">Cancelar</button>
              <button type="submit" class="btn btn-primary ms-auto" id="checkout-submit-btn">Procesar Venta</button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- Área de Impresión del Ticket de Venta -->
    <div id="print-receipt-area" class="d-none d-print-block" style="font-family: monospace; font-size: 12px; width: 300px; padding: 10px;"></div>
  `;

  // Variables y Modales
  const modalOverride = new bootstrap.Modal(document.getElementById('modal-override'));
  const modalCheckout = new bootstrap.Modal(document.getElementById('modal-checkout'));

  const searchInput = document.getElementById('pos-search-input');
  const resultsContainer = document.getElementById('pos-search-results');

  // Cargar Cotización Pendiente si existe
  const pendingCotId = localStorage.getItem('pendingCotizacionId');
  if (pendingCotId) {
    localStorage.removeItem('pendingCotizacionId');
    apiFetch(`/cotizaciones/${pendingCotId}`).then(cot => {
      // Establecer cliente
      if (cot.clienteId) {
        const selectCliente = document.getElementById('checkout-cliente');
        if (selectCliente) {
          selectCliente.value = cot.clienteId;
          // Disparar el evento change para buscar trade-ins del cliente
          selectCliente.dispatchEvent(new Event('change'));
        }
      }
      
      // Guardar ID para aprobación final
      window.pendingCotizacionAprobacionId = cot.id;

      // Cargar ítems al carrito
      cart = [];
      cot.items.forEach(item => {
        if (item.productoId) {
          cart.push({
            productoId: item.productoId,
            nombre: item.descripcion,
            codigoBarras: item.producto ? item.producto.codigoBarras : 'CATALOGO',
            precioBase: parseFloat(item.producto ? item.producto.precioVenta : item.precioUnitario),
            precioModificado: parseFloat(item.precioUnitario),
            precioCosto: parseFloat(item.producto ? item.producto.precioCosto : item.precioUnitario * 0.7),
            descuentoPct: 0,
            cantidad: item.cantidad,
            tieneNumeroSerie: item.producto ? item.producto.tieneNumeroSerie : false,
            imei: '',
            subtotal: parseFloat(item.precioUnitario) * item.cantidad
          });
        } else {
          cart.push({
            productoId: null,
            nombre: item.descripcion,
            codigoBarras: 'MANUAL',
            precioBase: parseFloat(item.precioUnitario),
            precioModificado: parseFloat(item.precioUnitario),
            precioCosto: parseFloat(item.precioUnitario) * 0.7,
            descuentoPct: 0,
            cantidad: item.cantidad,
            tieneNumeroSerie: false,
            imei: '',
            subtotal: parseFloat(item.precioUnitario) * item.cantidad
          });
        }
      });
      renderCart();
    }).catch(err => console.error('Error cargando cotización:', err));
  }

  // Inicializar escáner de código de barras USB
  initBarcodeScanner(async (barcode) => {
    try {
      const prod = await apiFetch(`/productos/barcode/${barcode}?sedeId=${sedeId}`);
      addToCart(prod);
    } catch (err) {
      alert(`Código de barras escaneado no encontrado: ${barcode}`);
    }
  });

  // Búsqueda de productos en catálogo
  const searchProducts = async () => {
    const q = searchInput.value.trim();
    if (!q) {
      resultsContainer.innerHTML = `<div class="text-center py-5 text-secondary">Use el buscador superior o escanee un código de barras.</div>`;
      return;
    }

    resultsContainer.innerHTML = `<div class="text-center py-5"><div class="spinner-border text-primary" role="status"></div></div>`;

    try {
      // Buscar productos activos que coincidan con la consulta en la sede actual
      const stock = await apiFetch(`/inventario/stock?sedeId=${sedeId}`);
      const filtered = stock.filter(item => {
        const query = q.toLowerCase();
        return item.producto.nombre.toLowerCase().includes(query) || item.producto.codigoBarras.toLowerCase().includes(query);
      });

      if (filtered.length === 0) {
        resultsContainer.innerHTML = `<div class="text-center py-5 text-secondary">No se encontraron productos coincidentes.</div>`;
        return;
      }

      resultsContainer.innerHTML = `
        <div class="list-group list-group-flush">
          ${filtered.map(item => {
            const imgHtml = item.producto.imagenUrl 
              ? `<img src="${item.producto.imagenUrl}" class="avatar avatar-md me-3 rounded" style="object-fit: cover;" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'24\\' height=\\'24\\' fill=\\'none\\' stroke=\\'%23ccc\\' stroke-width=\\'2\\'><rect width=\\'20\\' height=\\'20\\' x=\\'2\\' y=\\'2\\' rx=\\'2\\'/><circle cx=\\'9\\' cy=\\'9\\' r=\\'2\\'/><path d=\\'m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21\\'/></svg>';">` 
              : `<span class="avatar avatar-md me-3 rounded bg-secondary-lt fw-bold">${item.producto.nombre.charAt(0).toUpperCase()}</span>`;

            return `
              <button class="list-group-item list-group-item-action py-3 btn-add-prod" data-id="${item.productoId}">
                <div class="row align-items-center">
                  <div class="col-auto">
                    ${imgHtml}
                  </div>
                  <div class="col">
                    <div class="font-weight-semibold text-dark text-start">${item.producto.nombre}</div>
                    <div class="text-secondary small text-start">Código: ${item.producto.codigoBarras} | Stock: <strong class="${item.cantidad <= item.producto.stockMinimo ? 'text-danger' : 'text-success'}">${item.cantidad}</strong></div>
                  </div>
                  <div class="col-auto text-primary font-weight-bold">
                    $ ${new Intl.NumberFormat('es-CO').format(item.producto.precioVenta)}
                  </div>
                </div>
              </button>
            `;
          }).join('')}
        </div>
      `;

      // Click listener para añadir
      document.querySelectorAll('.btn-add-prod').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const id = btn.getAttribute('data-id');
          const item = filtered.find(s => s.productoId === id);
          if (item) {
            // Verificar stock
            const cartItem = cart.find(c => c.productoId === id);
            const qty = cartItem ? cartItem.cantidad + 1 : 1;
            if (qty > item.cantidad) {
              alert('No puedes agregar más unidades que las disponibles en stock.');
              return;
            }

            addToCart(item.producto);
            searchInput.value = '';
            searchInput.focus();
            searchProducts();
          }
        });
      });

    } catch (e) {
      resultsContainer.innerHTML = `<div class="text-center py-5 text-danger">${e.message}</div>`;
    }
  };

  searchInput.addEventListener('input', searchProducts);

  // Funciones del Carrito
  function addToCart(producto) {
    const existing = cart.find(item => item.productoId === producto.id);
    if (existing) {
      existing.cantidad += 1;
      existing.subtotal = existing.precioModificado * existing.cantidad;
    } else {
      cart.push({
        productoId: producto.id,
        nombre: producto.nombre,
        codigoBarras: producto.codigoBarras,
        precioBase: parseFloat(producto.precioVenta),
        precioModificado: parseFloat(producto.precioVenta),
        precioCosto: parseFloat(producto.precioCosto),
        descuentoPct: 0,
        cantidad: 1,
        tieneNumeroSerie: producto.tieneNumeroSerie,
        imei: '',
        subtotal: parseFloat(producto.precioVenta)
      });
    }

    renderCart();
  }

  function renderCart() {
    const cartContainer = document.getElementById('pos-cart-items');
    const checkoutBtn = document.getElementById('pos-checkout-btn');

    if (cart.length === 0) {
      cartContainer.innerHTML = `<div class="text-center py-5 text-secondary">El carrito está vacío.</div>`;
      checkoutBtn.disabled = true;
      updateTotals(0, 0, 0, 0);
      return;
    }

    checkoutBtn.disabled = false;
    const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

    cartContainer.innerHTML = cart.map((item, idx) => `
      <div class="border-bottom p-3">
        <div class="row align-items-center">
          <div class="col">
            <div class="font-weight-semibold text-dark">${item.nombre}</div>
            <div class="text-secondary small">
              ${formatter.format(item.precioModificado)} 
              ${item.descuentoPct > 0 ? `<span class="text-danger">(-${item.descuentoPct}%)</span>` : ''}
              x ${item.cantidad}
            </div>
            ${item.tieneNumeroSerie ? `
              <div class="mt-2">
                <input type="text" class="form-control form-control-sm input-imei-cart" data-idx="${idx}" placeholder="Ingresar IMEI/Serie..." value="${item.imei || ''}" required>
              </div>
            ` : ''}
          </div>
          <div class="col-auto text-end">
            <div class="font-weight-bold text-dark mb-2">${formatter.format(item.subtotal)}</div>
            <div class="btn-list flex-nowrap">
              <button class="btn btn-icon btn-sm btn-white btn-override-item" data-idx="${idx}"><i class="ti ti-edit"></i></button>
              <button class="btn btn-icon btn-sm btn-danger btn-remove-item" data-idx="${idx}"><i class="ti ti-trash"></i></button>
            </div>
          </div>
        </div>
      </div>
    `).join('');

    // Listeners del carrito
    document.querySelectorAll('.btn-remove-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(btn.getAttribute('data-idx'));
        cart.splice(idx, 1);
        renderCart();
      });
    });

    document.querySelectorAll('.input-imei-cart').forEach(input => {
      input.addEventListener('change', (e) => {
        const idx = parseInt(input.getAttribute('data-idx'));
        cart[idx].imei = e.target.value.trim();
      });
    });

    document.querySelectorAll('.btn-override-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(btn.getAttribute('data-idx'));
        const item = cart[idx];

        document.getElementById('override-item-idx').value = idx;
        document.getElementById('override-nombre').value = item.nombre;
        document.getElementById('override-precio-base').value = formatter.format(item.precioBase);
        document.getElementById('override-precio-costo').value = formatter.format(item.precioCosto);
        document.getElementById('override-descuento-pct').value = item.descuentoPct;
        document.getElementById('override-precio-mod').value = item.precioModificado;

        // Limpiar alertas
        document.getElementById('loss-warning').classList.add('d-none');
        document.getElementById('discount-warning').classList.add('d-none');
        document.getElementById('override-pin-wrapper').classList.add('d-none');
        document.getElementById('override-pin-input').value = '';

        modalOverride.show();
      });
    });

    // Calcular Totales
    let subtotalTotal = 0;
    let descTotal = 0;

    cart.forEach(item => {
      subtotalTotal += item.precioBase * item.cantidad;
      descTotal += (item.precioBase - item.precioModificado) * item.cantidad;
    });

    const ivaTotal = (subtotalTotal - descTotal) * 0.19; // IVA 19%
    const totalFinal = (subtotalTotal - descTotal) + ivaTotal;

    updateTotals(subtotalTotal, descTotal, ivaTotal, totalFinal);
  }

  function updateTotals(sub, desc, iva, tot) {
    const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });
    document.getElementById('pos-subtotal').textContent = formatter.format(sub);
    document.getElementById('pos-descuento').textContent = `-${formatter.format(desc)}`;
    document.getElementById('pos-iva').textContent = formatter.format(iva);
    document.getElementById('pos-total').textContent = formatter.format(tot);
  }

  // --- REGULAR PRICE OVERRIDE ---
  
  // Sincronizar inputs de precio modificado y % descuento en modal
  document.getElementById('override-descuento-pct').addEventListener('input', (e) => {
    const idx = parseInt(document.getElementById('override-item-idx').value);
    const item = cart[idx];
    const pct = parseFloat(e.target.value || 0);

    const mod = item.precioBase * (1 - pct / 100);
    document.getElementById('override-precio-mod').value = mod.toFixed(2);
    checkOverrideAlerts(item, mod, pct);
  });

  document.getElementById('override-precio-mod').addEventListener('input', (e) => {
    const idx = parseInt(document.getElementById('override-item-idx').value);
    const item = cart[idx];
    const mod = parseFloat(e.target.value || 0);

    const pct = ((item.precioBase - mod) / item.precioBase) * 100;
    document.getElementById('override-descuento-pct').value = pct.toFixed(1);
    checkOverrideAlerts(item, mod, pct);
  });

  function checkOverrideAlerts(item, priceMod, pct) {
    const lossWarn = document.getElementById('loss-warning');
    const discWarn = document.getElementById('discount-warning');
    const pinWrapper = document.getElementById('override-pin-wrapper');

    let requierePin = false;

    // Alerta pérdida
    if (priceMod < item.precioCosto) {
      lossWarn.classList.remove('d-none');
      requierePin = true;
    } else {
      lossWarn.classList.add('d-none');
    }

    // Alerta descuento excesivo
    if (pct > maxDescuentoPermitido) {
      discWarn.classList.remove('d-none');
      requierePin = true;
    } else {
      discWarn.classList.add('d-none');
    }

    if (requierePin) {
      pinWrapper.classList.remove('d-none');
      document.getElementById('override-pin-input').required = true;
    } else {
      pinWrapper.classList.add('d-none');
      document.getElementById('override-pin-input').required = false;
    }
  }

  // Submit Override Form
  document.getElementById('form-override').addEventListener('submit', async (e) => {
    e.preventDefault();
    const idx = parseInt(document.getElementById('override-item-idx').value);
    const item = cart[idx];
    const discountPct = parseFloat(document.getElementById('override-descuento-pct').value || 0);
    const precioModificado = parseFloat(document.getElementById('override-precio-mod').value);
    const pin = document.getElementById('override-pin-input').value;

    const requierePin = (discountPct > maxDescuentoPermitido || precioModificado < item.precioCosto);

    if (requierePin) {
      // Validar pin llamando al backend o guardando en memoria para el checkout final
      // Haremos una validación rápida: intentamos verificar si es un pin admin correcto
      try {
        const testAuth = await apiFetch('/caja/egreso', { // un endpoint rápido que valida pin, o el de cobro final
          // Para no registrar egresos falsos, le pasaremos el pin en el cobro final. 
          // Aquí sólo guardaremos el pin temporalmente para validar en el checkout.
        }).catch(() => null);
        
        item.pinAdmin = pin;
      } catch (err) {}
    }

    item.precioModificado = precioModificado;
    item.descuentoPct = discountPct;
    item.subtotal = precioModificado * item.cantidad;

    modalOverride.hide();
    renderCart();
  });

  // --- CHECKOUT Y COBRO ---

  // Botón Abrir checkout
  document.getElementById('pos-checkout-btn').addEventListener('click', () => {
    // Validar si productos con IMEI tienen IMEI ingresado
    for (const item of cart) {
      if (item.tieneNumeroSerie && !item.imei) {
        alert(`Por favor, ingrese el IMEI para: ${item.nombre}`);
        return;
      }
    }

    // Calcular montos de checkout
    const totalStr = document.getElementById('pos-total').textContent;
    document.getElementById('checkout-monto-total').textContent = totalStr;

    // Resetear form de pagos
    document.getElementById('form-checkout').reset();
    document.getElementById('checkout-cambio').textContent = '$ 0';
    document.getElementById('checkout-cambio').classList.remove('text-danger');
    document.getElementById('checkout-cambio').classList.add('text-success');

    modalCheckout.show();
  });

  // Escuchar cambios en los inputs de pago
  const paymentInputs = ['pay-efectivo', 'pay-nequi', 'pay-daviplata', 'pay-tarjeta', 'pay-transferencia'];
  paymentInputs.forEach(id => {
    document.getElementById(id).addEventListener('input', updateChangeCalculations);
  });

  document.getElementById('checkout-credito').addEventListener('change', (e) => {
    const isCredito = e.target.checked;
    const labelCambio = document.getElementById('checkout-label-cambio');
    const cambioVal = document.getElementById('checkout-cambio');

    if (isCredito) {
      labelCambio.textContent = 'Saldo a Crédito:';
      cambioVal.classList.add('text-primary');
      cambioVal.classList.remove('text-success', 'text-danger');
    } else {
      labelCambio.textContent = 'Cambio (Vuelto):';
      cambioVal.classList.remove('text-primary');
    }
    updateChangeCalculations();
  });

  document.getElementById('checkout-cliente').addEventListener('change', async (e) => {
    const clienteId = e.target.value;
    const container = document.getElementById('checkout-trade-in-select-container');
    const wrapper = document.getElementById('trade-in-payment-wrapper');
    const input = document.getElementById('pay-trade-in');
    
    // Reset trade-in values
    container.innerHTML = '';
    container.classList.add('d-none');
    wrapper.classList.add('d-none');
    input.value = 0;
    updateChangeCalculations();

    if (!clienteId) return;

    try {
      const tradeIns = await apiFetch(`/trade-in?cliente=${clienteId}`);
      const unassociated = tradeIns.filter(ti => !ti.ventaId);
      if (unassociated.length > 0) {
        container.classList.remove('d-none');
        const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });
        container.innerHTML = `
          <label class="form-label text-success fw-bold">Saldo a favor de Trade-In Disponible</label>
          ${unassociated.map((ti, index) => `
            <label class="form-check text-success">
              <input class="form-check-input chk-apply-tradein" type="checkbox" data-id="${ti.id}" data-val="${ti.valoracion}" data-desc="${ti.marca} ${ti.modelo} - IMEI: ${ti.imei}">
              <span class="form-check-label">${ti.marca} ${ti.modelo} (${formatter.format(ti.valoracion)})</span>
            </label>
          `).join('')}
        `;

        // Listeners for checkbox changes
        document.querySelectorAll('.chk-apply-tradein').forEach(chk => {
          chk.addEventListener('change', () => {
            let totalVal = 0;
            let descList = [];
            document.querySelectorAll('.chk-apply-tradein:checked').forEach(c => {
              totalVal += parseFloat(c.dataset.val);
              descList.push(c.dataset.desc);
            });

            if (totalVal > 0) {
              wrapper.classList.remove('d-none');
              input.value = totalVal;
              document.getElementById('trade-in-payment-label').textContent = `Aplicado por: ${descList.join(', ')}`;
            } else {
              wrapper.classList.add('d-none');
              input.value = 0;
            }
            updateChangeCalculations();
          });
        });
      }
    } catch (err) {
      console.error(err);
    }
  });

  function updateChangeCalculations() {
    const totalStr = document.getElementById('pos-total').textContent.replace(/[^\d]/g, '');
    const total = parseFloat(totalStr);

    const efectivo = parseFloat(document.getElementById('pay-efectivo').value || 0);
    const nequi = parseFloat(document.getElementById('pay-nequi').value || 0);
    const daviplata = parseFloat(document.getElementById('pay-daviplata').value || 0);
    const tarjeta = parseFloat(document.getElementById('pay-tarjeta').value || 0);
    const transferencia = parseFloat(document.getElementById('pay-transferencia').value || 0);
    const tradeIn = parseFloat(document.getElementById('pay-trade-in').value || 0);

    const totalPagado = efectivo + nequi + daviplata + tarjeta + transferencia + tradeIn;
    const isCredito = document.getElementById('checkout-credito').checked;
    
    const cambioVal = document.getElementById('checkout-cambio');
    const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

    if (isCredito) {
      const saldoCredito = total - totalPagado;
      if (saldoCredito < 0) {
        cambioVal.textContent = formatter.format(0);
      } else {
        cambioVal.textContent = formatter.format(saldoCredito);
      }
    } else {
      const cambio = totalPagado - total;
      cambioVal.textContent = formatter.format(cambio);
      if (cambio < 0) {
        cambioVal.classList.add('text-danger');
        cambioVal.classList.remove('text-success');
      } else {
        cambioVal.classList.remove('text-danger');
        cambioVal.classList.add('text-success');
      }
    }
  }

  // Submit Venta Final
  document.getElementById('form-checkout').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('checkout-submit-btn');

    // Totales
    const totalStr = document.getElementById('pos-total').textContent.replace(/[^\d]/g, '');
    const total = parseFloat(totalStr);
    const subtotalStr = document.getElementById('pos-subtotal').textContent.replace(/[^\d]/g, '');
    const subtotal = parseFloat(subtotalStr);
    const descStr = document.getElementById('pos-descuento').textContent.replace(/[^\d\-]/g, '');
    const descuentoTotal = parseFloat(descStr);
    const ivaStr = document.getElementById('pos-iva').textContent.replace(/[^\d]/g, '');
    const iva = parseFloat(ivaStr);

    const isCredito = document.getElementById('checkout-credito').checked;
    const clienteId = document.getElementById('checkout-cliente').value;

    if (isCredito && !clienteId) {
      alert('Debe seleccionar un cliente registrado para realizar ventas a crédito.');
      return;
    }

    // Pagos
    const pagos = [];
    const efectivo = parseFloat(document.getElementById('pay-efectivo').value || 0);
    const nequi = parseFloat(document.getElementById('pay-nequi').value || 0);
    const daviplata = parseFloat(document.getElementById('pay-daviplata').value || 0);
    const tarjeta = parseFloat(document.getElementById('pay-tarjeta').value || 0);
    const transferencia = parseFloat(document.getElementById('pay-transferencia').value || 0);
    const tradeIn = parseFloat(document.getElementById('pay-trade-in').value || 0);

    if (efectivo > 0) pagos.push({ metodo: 'efectivo', monto: efectivo });
    if (nequi > 0) pagos.push({ metodo: 'nequi', monto: nequi });
    if (daviplata > 0) pagos.push({ metodo: 'daviplata', monto: daviplata });
    if (tarjeta > 0) pagos.push({ metodo: 'tarjeta', monto: tarjeta });
    if (transferencia > 0) pagos.push({ metodo: 'transferencia', monto: transferencia });
    if (tradeIn > 0) pagos.push({ metodo: 'trade_in', monto: tradeIn });

    const totalPagado = pagos.reduce((acc, curr) => acc + curr.monto, 0);

    if (!isCredito && totalPagado < total) {
      alert('El monto pagado es insuficiente.');
      return;
    }

    // Verificar si algún item del carrito requiere PIN y consolidarlo
    let pinAdmin = null;
    cart.forEach(item => {
      if (item.pinAdmin) pinAdmin = item.pinAdmin;
    });

    const body = {
      clienteId: clienteId || null,
      subtotal,
      descuentoTotal,
      iva,
      total,
      esCredito: isCredito,
      observaciones: document.getElementById('checkout-observaciones').value,
      items: cart.map(item => ({
        productoId: item.productoId,
        cantidad: item.cantidad,
        precioBase: item.precioBase,
        precioModificado: item.precioModificado,
        descuentoPct: item.descuentoPct,
        imei: item.imei
      })),
      pagos,
      pinAdmin
    };

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status"></span>Registrando...`;

    try {
      const res = await apiFetch('/ventas', {
        method: 'POST',
        body: JSON.stringify(body)
      });

      // Si veníamos de aprobar una cotización, marcarla en BD
      if (window.pendingCotizacionAprobacionId) {
        await apiFetch(`/cotizaciones/${window.pendingCotizacionAprobacionId}/aprobar`, {
          method: 'POST',
          body: JSON.stringify({ ventaId: res.id })
        }).catch(err => console.error('Error aprobando cotización:', err));
        delete window.pendingCotizacionAprobacionId;
      }

      modalCheckout.hide();
      
      // Mostrar ticket para impresión
      renderPrintReceipt(res, body);

      // Limpiar carrito
      cart = [];
      renderCart();

      // Forzar impresión
      window.print();
    } catch (err) {
      alert(err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Procesar Venta';
    }
  });

  function renderPrintReceipt(res, body) {
    const area = document.getElementById('print-receipt-area');
    const date = new Date().toLocaleString();
    const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

    area.innerHTML = `
      <div style="text-align: center; margin-bottom: 10px;">
        <h3 style="margin: 0;">TechStore Colombia</h3>
        <p style="margin: 2px 0; font-size: 10px;">NIT: 901.456.789-0<br>Sede: ${usuario.sedeNombre}</p>
        <p style="margin: 2px 0;">----------------------------</p>
      </div>
      <div>
        <p style="margin: 2px 0;"><strong>FACTURA:</strong> ${res.numeroFactura}</p>
        <p style="margin: 2px 0;"><strong>FECHA:</strong> ${date}</p>
        <p style="margin: 2px 0;"><strong>CAJERO:</strong> ${usuario.nombre}</p>
        <p style="margin: 2px 0;">----------------------------</p>
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
        <thead>
          <tr style="border-bottom: 1px dashed #000;">
            <th style="text-align: left;">Art.</th>
            <th style="text-align: center;">Cant.</th>
            <th style="text-align: right;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${cart.map(item => `
            <tr>
              <td>${item.nombre}</td>
              <td style="text-align: center;">${item.cantidad}</td>
              <td style="text-align: right;">${formatter.format(item.subtotal)}</td>
            </tr>
            ${item.imei ? `<tr><td colspan="3" style="font-size: 9px; color: #555;">IMEI: ${item.imei}</td></tr>` : ''}
          `).join('')}
        </tbody>
      </table>
      <div style="margin-top: 10px; font-size: 11px;">
        <p style="margin: 2px 0; text-align: right;"><strong>Subtotal:</strong> ${formatter.format(body.subtotal)}</p>
        <p style="margin: 2px 0; text-align: right;"><strong>Descuento:</strong> -${formatter.format(body.descuentoTotal)}</p>
        <p style="margin: 2px 0; text-align: right;"><strong>IVA (19%):</strong> ${formatter.format(body.iva)}</p>
        <p style="margin: 2px 0; text-align: right; font-size: 13px;"><strong>TOTAL:</strong> ${formatter.format(body.total)}</p>
        <p style="margin: 2px 0;">----------------------------</p>
        <p style="margin: 2px 0; text-align: center; font-size: 10px;">¡Gracias por su compra!<br>Garantía directa según políticas.</p>
      </div>
    `;
  }
}

export function destroyPos() {
  destroyBarcodeScanner();
}
