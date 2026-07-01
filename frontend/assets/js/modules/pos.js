import { apiFetch } from '../api.js';
import { getUsuario } from '../auth.js';
import { initBarcodeScanner, destroyBarcodeScanner } from '../utils/barcode.js';
import { getLocalDateStr } from '../utils/date.js';
import { showToast } from '../utils/toast.js';
import { renderPosReceipt } from '../utils/pos-receipt.js';

let posKeydownHandler = null;
let cart = [];
let maxDescuentoPermitido = 15;
let clientes = [];
let selectedCategoryId = null;
let cobrarIva = true;
let ivaPct = 0.19;
let currentSedeId = null;
let sedes = [];
let empresaConfig = {
  empresa: 'TechStore Colombia',
  nit: '',
  direccion: '',
  telefono: '',
  logoUrl: ''
};

function getSedeNombre(sedes, sedeId, fallback = 'Sede') {
  const match = sedes.find((s) => String(s.id) === String(sedeId));
  return match?.nombre || fallback;
}

function renderPosSessionBar({ usuario, isAdmin, sedes, currentSedeId, cajaAbierta, sedeFallback }) {
  const sedeNombre = getSedeNombre(sedes, currentSedeId, sedeFallback || usuario.sedeNombre || 'Sede');
  const cajaOk = cajaAbierta && cajaAbierta.estado !== 'cerrada';

  return `
    <div class="pos-session-bar d-print-none" role="region" aria-label="Estado de la caja">
      <div class="pos-session-bar__chips">
        <span class="pos-session-chip ${cajaOk ? 'pos-session-chip--live' : 'pos-session-chip--warn'}">
          <i class="ti ${cajaOk ? 'ti-lock-open' : 'ti-lock'}" aria-hidden="true"></i>
          ${cajaOk ? 'Caja abierta' : 'Caja cerrada'}
        </span>
        <span class="pos-session-chip">
          <i class="ti ti-building-store" aria-hidden="true"></i>
          ${sedeNombre}
        </span>
        <span class="pos-session-chip">
          <i class="ti ti-user" aria-hidden="true"></i>
          ${usuario.nombre}
        </span>
        ${cajaOk ? `
          <span class="pos-session-chip pos-session-chip--scan">
            <i class="ti ti-scan" aria-hidden="true"></i>
            Escáner listo
          </span>
        ` : ''}
      </div>
      ${isAdmin ? `
        <div class="pos-session-bar__admin">
          <label class="pos-session-bar__label" for="select-pos-sede">Operar en</label>
          <select id="select-pos-sede" class="form-select form-select-sm pos-session-sede-select" aria-label="Sede para ventas">
            ${sedes.map((s) => `<option value="${s.id}" ${String(s.id) === String(currentSedeId) ? 'selected' : ''}>${s.nombre}</option>`).join('')}
          </select>
        </div>
      ` : ''}
    </div>
  `;
}

export async function initPos(container) {
  const usuario = getUsuario();
  const isAdmin = ['admin', 'superadmin'].includes(usuario.rol);
  currentSedeId = usuario.sedeId;

  try {
    if (isAdmin) {
      sedes = await apiFetch('/config/sedes').catch(() => []);
      if (!currentSedeId && sedes.length > 0) {
        currentSedeId = sedes[0].id;
      }
    }
  } catch (e) {
    console.error('Error precargando sedes en POS:', e);
  }

  async function loadAndRenderPOS() {
    destroyBarcodeScanner();
    
    // 1. Cargar datos básicos y verificar si la caja está abierta
    let cajaAbierta = null;
    try {
      const hoyStr = getLocalDateStr();
      cajaAbierta = await apiFetch(`/caja/reporte?fecha=${hoyStr}&sede=${currentSedeId}`).catch(() => null);
    
    // Obtener configuración del sistema para el descuento máximo e IVA
    const config = await apiFetch('/config/sistema').catch(() => null);
    maxDescuentoPermitido = config ? parseFloat(config.descuentoMaximoPct) : 15;
    cobrarIva = config && config.cobrarIvaPos !== undefined ? !!config.cobrarIvaPos : true;
    ivaPct = config && config.ivaDefecto !== undefined ? parseFloat(config.ivaDefecto) / 100 : 0.19;
    if (config) {
      empresaConfig = {
        empresa: config.empresa || 'TechStore Colombia',
        nit: config.nit || '',
        direccion: config.direccion || '',
        telefono: config.telefono || '',
        logoUrl: config.logoUrl || ''
      };
    }

    // Cargar clientes para ventas a crédito
    clientes = await apiFetch('/clientes').catch(() => [
      { id: '1', nombre: 'Cliente General', documento: '22222222' },
      { id: '2', nombre: 'Juan Pérez', documento: '1019087654' },
      { id: '3', nombre: 'María López', documento: '52876345' }
    ]);
  } catch (e) {
    console.error('Error al inicializar POS:', e);
  }

  // Cargar categorías del catálogo directamente de la base de datos
  let categories = [];
  try {
    categories = await apiFetch('/productos/categorias').catch(() => []);
  } catch (e) {
    console.error('Error al obtener categorías:', e);
  }


    if (!cajaAbierta || cajaAbierta.estado === 'cerrada') {
      container.innerHTML = `
        <div class="container-xl erp-module pos-module">
          ${renderPosSessionBar({ usuario, isAdmin, sedes, currentSedeId, cajaAbierta: null, sedeFallback: usuario.sedeNombre })}
          <div class="pos-gate-card">
            <div class="pos-gate-card__icon" aria-hidden="true"><i class="ti ti-lock"></i></div>
            <h2 class="pos-gate-card__title">Abre la caja para vender</h2>
            <p class="pos-gate-card__text">El punto de venta solo funciona con una caja abierta en esta sede. Haz la apertura y vuelve aquí para facturar.</p>
            <a href="#/caja" class="btn btn-primary">Ir a apertura de caja</a>
          </div>
        </div>
      `;
      if (isAdmin) {
        const selectPosSede = document.getElementById('select-pos-sede');
        if (selectPosSede) {
          selectPosSede.addEventListener('change', (e) => {
            currentSedeId = e.target.value;
            cart = [];
            loadAndRenderPOS();
          });
        }
      }
      return;
    }

    // Renderizar maquetación del POS
    container.innerHTML = `
      <div class="container-xl erp-module pos-module">
        ${renderPosSessionBar({ usuario, isAdmin, sedes, currentSedeId, cajaAbierta, sedeFallback: usuario.sedeNombre })}

        <div class="pos-workspace d-print-none">
          <section class="pos-panel pos-panel--catalog" aria-labelledby="pos-catalog-heading">
            <div class="pos-panel__head">
              <div>
                <p class="pos-panel__step">Paso 1</p>
                <h2 class="pos-panel__title" id="pos-catalog-heading">Agregar productos</h2>
                <p class="pos-panel__hint">Busca por nombre, toca una tarjeta o escanea el código de barras.</p>
              </div>
              <kbd class="pos-kbd-hint" title="Atajo de teclado">F2</kbd>
            </div>
            <div class="pos-panel__body pos-panel__body--catalog">
              <div class="pos-search-wrap">
                <label class="visually-hidden" for="pos-search-input">Buscar producto</label>
                <div class="input-icon">
                  <span class="input-icon-addon"><i class="ti ti-search" aria-hidden="true"></i></span>
                  <input type="text" id="pos-search-input" class="form-control form-control-lg pos-search-input" placeholder="Nombre o código de barras…" autocomplete="off" spellcheck="false">
                </div>
              </div>
              <div id="pos-categories-container" class="pos-categories" role="toolbar" aria-label="Filtrar por categoría"></div>
              <div class="pos-results" id="pos-search-results">
                <div class="pos-empty">
                  <i class="ti ti-scan" aria-hidden="true"></i>
                  <p>Escanea un producto o escribe para buscar en el catálogo.</p>
                </div>
              </div>
            </div>
          </section>

          <section class="pos-panel pos-panel--sale" aria-labelledby="pos-sale-heading">
            <div class="pos-panel__head pos-panel__head--sale">
              <div>
                <p class="pos-panel__step">Paso 2</p>
                <h2 class="pos-panel__title" id="pos-sale-heading">Cobrar venta</h2>
                <p class="pos-panel__hint">Revisa los ítems y presiona cobrar cuando el cliente pague.</p>
              </div>
              <span class="pos-cart-count" id="pos-cart-count" aria-live="polite">0 productos</span>
            </div>
            <div class="pos-panel__body pos-panel__body--sale">
              <div class="pos-cart-scroll" id="pos-cart-items">
                <div class="pos-empty pos-empty--compact">
                  <i class="ti ti-shopping-cart" aria-hidden="true"></i>
                  <p>Aún no hay productos en esta venta.</p>
                </div>
              </div>
              <div class="pos-totals">
                <div class="pos-totals__row">
                  <span>Subtotal</span>
                  <span id="pos-subtotal" class="pos-totals__val">$ 0</span>
                </div>
                <div class="pos-totals__row pos-totals__row--muted">
                  <span>Descuento</span>
                  <span id="pos-descuento" class="pos-totals__val text-danger">−$ 0</span>
                </div>
                <div class="pos-totals__row pos-totals__row--muted">
                  <span>IVA</span>
                  <span id="pos-iva" class="pos-totals__val">$ 0</span>
                </div>
                <div class="pos-totals__grand">
                  <span>Total a cobrar</span>
                  <span id="pos-total" class="pos-totals__grand-val">$ 0</span>
                </div>
                <button type="button" id="pos-checkout-btn" class="btn btn-primary btn-lg w-100 pos-checkout-btn" disabled>
                  <i class="ti ti-cash me-2" aria-hidden="true"></i>Cobrar venta
                </button>
              </div>
            </div>
          </section>
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

    <!-- Área de impresión ticket POS (80mm) -->
    <div id="print-receipt-area" class="pos-receipt-print-host d-none d-print-block" aria-hidden="true"></div>
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
            imagenUrl: item.producto ? item.producto.imagenUrl : null,
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
      const prod = await apiFetch(`/productos/barcode/${barcode}?sedeId=${currentSedeId}`);
      addToCart(prod);
    } catch (err) {
      showToast('Error de Búsqueda', `Código de barras escaneado no encontrado: ${barcode}`, 'error');
    }
  });

  // Búsqueda de productos en catálogo
  const searchProducts = async () => {
    const q = searchInput.value.trim();

    resultsContainer.innerHTML = `<div class="pos-empty"><div class="spinner-border text-primary" role="status" aria-label="Buscando"></div></div>`;

    try {
      // Buscar productos activos que coincidan con la consulta en la sede actual
      const stock = await apiFetch(`/inventario/stock?sedeId=${currentSedeId}`);
      const filtered = stock.filter(item => {
        if (selectedCategoryId && item.producto.categoriaId !== selectedCategoryId) {
          return false;
        }
        if (!q) return true;
        const query = q.toLowerCase();
        return item.producto.nombre.toLowerCase().includes(query) || item.producto.codigoBarras.toLowerCase().includes(query);
      });

      if (filtered.length === 0) {
        resultsContainer.innerHTML = `
          <div class="pos-empty">
            <i class="ti ti-search-off" aria-hidden="true"></i>
            <p>No hay productos con ese nombre o código en esta sede.</p>
          </div>
        `;
        return;
      }

      resultsContainer.innerHTML = `
        <div class="row row-cards g-2 p-2">
          ${filtered.map(item => {
            const brandName = item.producto.categoria ? item.producto.categoria.nombre : 'GENÉRICO';
            const imgHtml = item.producto.imagenUrl 
              ? `<img src="${item.producto.imagenUrl}" class="pos-product-card-img" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'24\\' height=\\'24\\' fill=\\'none\\' stroke=\\'%23ccc\\' stroke-width=\\'2\\'><rect width=\\'20\\' height=\\'20\\' x=\\'2\\' y=\\'2\\' rx=\\'2\\'/><circle cx=\\'9\\' cy=\\'9\\' r=\\'2\\'/><path d=\\'m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21\\'/></svg>';">` 
              : `<div class="pos-product-card-fallback">${item.producto.nombre.charAt(0).toUpperCase()}</div>`;

            return `
              <div class="col-6 col-sm-4 col-md-3 animate__animated animate__fadeIn">
                <div class="card pos-product-card btn-add-prod" data-id="${item.productoId}">
                  <!-- Imagen -->
                  ${imgHtml}
                  
                  <!-- Detalle -->
                  <div class="card-body p-2 d-flex flex-column justify-content-between flex-fill">
                    <div class="d-flex flex-column">
                      <span class="pos-product-card-brand">${brandName}</span>
                      <div class="pos-product-card-title text-truncate" title="${item.producto.nombre}">${item.producto.nombre}</div>
                    </div>
                    
                    <div class="pos-product-card-footer">
                      <span class="pos-product-card-price">$ ${new Intl.NumberFormat('es-CO').format(item.producto.precioVenta)}</span>
                      <span class="pos-product-card-stock">Stock: <strong class="${item.cantidad <= item.producto.stockMinimo ? 'text-danger' : 'text-success'}">${item.cantidad}</strong></span>
                    </div>
                  </div>
                </div>
              </div>
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
              showToast('Stock Insuficiente', 'No puedes agregar más unidades que las disponibles en stock.', 'error');
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

  if (posKeydownHandler) {
    document.removeEventListener('keydown', posKeydownHandler);
  }
  posKeydownHandler = (e) => {
    if (e.key !== 'F2') return;
    const input = document.getElementById('pos-search-input');
    if (!input) return;
    e.preventDefault();
    input.focus();
    input.select();
  };
  document.addEventListener('keydown', posKeydownHandler);

  const renderCategoryButtons = () => {
    const catsContainer = document.getElementById('pos-categories-container');
    if (!catsContainer) return;

    const allBtnClass = selectedCategoryId === null ? 'pos-cat-pill is-active' : 'pos-cat-pill';
    let buttonsHtml = `<button type="button" class="${allBtnClass} btn-cat-filter" data-id="all">Todos</button>`;

    categories.forEach(c => {
      const btnClass = selectedCategoryId === c.id ? 'pos-cat-pill is-active' : 'pos-cat-pill';
      buttonsHtml += `<button type="button" class="${btnClass} btn-cat-filter" data-id="${c.id}">${c.nombre}</button>`;
    });

    catsContainer.innerHTML = buttonsHtml;

    document.querySelectorAll('.btn-cat-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        const catId = btn.getAttribute('data-id');
        selectedCategoryId = catId === 'all' ? null : catId;
        renderCategoryButtons();
        searchProducts();
      });
    });
  };

  // Renderizar botones e iniciar catálogo por defecto
  renderCategoryButtons();
  searchProducts();

  // Funciones del Carrito
  function addToCart(producto) {
    if (producto.autoDetectedImei) {
      const isAlreadyInCart = cart.some(item => item.imei === producto.autoDetectedImei);
      if (isAlreadyInCart) {
        showToast('Serial ya agregado', `El serial/IMEI ${producto.autoDetectedImei} ya está en el carrito.`, 'warning');
        return;
      }
    }

    // Si tiene número de serie, no agruparlos para poder registrar cada IMEI individualmente en el carrito
    const existing = producto.tieneNumeroSerie ? null : cart.find(item => item.productoId === producto.id);
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
        imei: producto.autoDetectedImei || '',
        imagenUrl: producto.imagenUrl,
        subtotal: parseFloat(producto.precioVenta)
      });
    }

    renderCart();
  }

  function updateCartCount() {
    const badge = document.getElementById('pos-cart-count');
    if (!badge) return;
    const units = cart.reduce((sum, item) => sum + item.cantidad, 0);
    badge.textContent = units === 1 ? '1 producto' : `${units} productos`;
  }

  function renderCart() {
    const cartContainer = document.getElementById('pos-cart-items');
    const checkoutBtn = document.getElementById('pos-checkout-btn');

    if (cart.length === 0) {
      cartContainer.innerHTML = `
        <div class="pos-empty pos-empty--compact">
          <i class="ti ti-shopping-cart" aria-hidden="true"></i>
          <p>Aún no hay productos en esta venta.</p>
        </div>
      `;
      checkoutBtn.disabled = true;
      updateTotals(0, 0, 0, 0);
      updateCartCount();
      return;
    }

    checkoutBtn.disabled = false;
    const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

    cartContainer.innerHTML = cart.map((item, idx) => {
      const initial = item.nombre.charAt(0).toUpperCase();
      const mediaHtml = item.imagenUrl
        ? `<img src="${item.imagenUrl}" class="pos-cart-line__img" alt="" onerror="this.hidden=true;this.nextElementSibling.hidden=false">
           <span class="pos-cart-line__fallback" hidden aria-hidden="true">${initial}</span>`
        : `<span class="pos-cart-line__fallback" aria-hidden="true">${initial}</span>`;

      const qtyControl = item.tieneNumeroSerie
        ? `<span class="pos-qty-fixed" aria-label="Cantidad fija">1 ud.</span>`
        : `
          <div class="pos-qty-stepper" role="group" aria-label="Cantidad de ${item.nombre}">
            <button type="button" class="pos-qty-btn btn-dec-qty" data-idx="${idx}" aria-label="Quitar una unidad">−</button>
            <input type="number" class="pos-qty-input input-qty-cart" data-idx="${idx}" value="${item.cantidad}" min="1" inputmode="numeric" aria-label="Cantidad">
            <button type="button" class="pos-qty-btn btn-inc-qty" data-idx="${idx}" aria-label="Agregar una unidad">+</button>
          </div>
        `;

      return `
        <article class="pos-cart-line">
          <div class="pos-cart-line__media">${mediaHtml}</div>
          <div class="pos-cart-line__body">
            <div class="pos-cart-line__head">
              <h3 class="pos-cart-line__name" title="${item.nombre}">${item.nombre}</h3>
              <span class="pos-cart-line__subtotal">${formatter.format(item.subtotal)}</span>
            </div>
            <div class="pos-cart-line__unit">
              ${formatter.format(item.precioModificado)} c/u
              ${item.descuentoPct > 0 ? `<span class="pos-cart-line__disc">−${item.descuentoPct}%</span>` : ''}
            </div>
            <div class="pos-cart-line__foot">
              <div class="pos-cart-line__qty">
                <span class="pos-cart-line__qty-label">Cant.</span>
                ${qtyControl}
              </div>
              <div class="pos-cart-line__actions">
                <button type="button" class="pos-cart-line__action btn-override-item" data-idx="${idx}" title="Cambiar precio o descuento" aria-label="Cambiar precio o descuento">
                  <i class="ti ti-edit" aria-hidden="true"></i>
                </button>
                <button type="button" class="pos-cart-line__action pos-cart-line__action--danger btn-remove-item" data-idx="${idx}" title="Quitar producto" aria-label="Quitar producto">
                  <i class="ti ti-trash" aria-hidden="true"></i>
                </button>
              </div>
            </div>
            ${item.tieneNumeroSerie ? `
              <div class="pos-cart-line__imei">
                <label class="visually-hidden" for="imei-${idx}">IMEI o serie</label>
                <div class="input-icon input-icon-sm">
                  <span class="input-icon-addon"><i class="ti ti-barcode" aria-hidden="true"></i></span>
                  <input type="text" id="imei-${idx}" class="form-control form-control-sm input-imei-cart" data-idx="${idx}" placeholder="IMEI o número de serie" value="${item.imei || ''}" required spellcheck="false">
                </div>
              </div>
            ` : ''}
          </div>
        </article>
      `;
    }).join('');

    // Listeners del carrito
    document.querySelectorAll('.btn-remove-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(btn.getAttribute('data-idx'));
        cart.splice(idx, 1);
        renderCart();
      });
    });

    document.querySelectorAll('.btn-inc-qty').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-idx'));
        cart[idx].cantidad += 1;
        cart[idx].subtotal = cart[idx].precioModificado * cart[idx].cantidad;
        renderCart();
      });
    });

    document.querySelectorAll('.btn-dec-qty').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-idx'));
        cart[idx].cantidad -= 1;
        if (cart[idx].cantidad <= 0) {
          cart.splice(idx, 1);
        } else {
          cart[idx].subtotal = cart[idx].precioModificado * cart[idx].cantidad;
        }
        renderCart();
      });
    });

    document.querySelectorAll('.input-qty-cart').forEach(input => {
      input.addEventListener('change', (e) => {
        const idx = parseInt(input.getAttribute('data-idx'));
        let val = parseInt(e.target.value);
        if (isNaN(val) || val <= 0) {
          cart.splice(idx, 1);
        } else {
          cart[idx].cantidad = val;
          cart[idx].subtotal = cart[idx].precioModificado * cart[idx].cantidad;
        }
        renderCart();
      });
    });

    document.querySelectorAll('.input-imei-cart').forEach(input => {
      input.addEventListener('change', (e) => {
        const idx = parseInt(input.getAttribute('data-idx'));
        const val = e.target.value.trim();

        if (val) {
          const duplicateIdx = cart.findIndex((item, i) => i !== idx && item.imei === val);
          if (duplicateIdx !== -1) {
            showToast('Serial Duplicado', `El serial/IMEI ${val} ya fue ingresado en otro artículo del carrito.`, 'warning');
            e.target.value = '';
            cart[idx].imei = '';
            return;
          }
        }
        cart[idx].imei = val;
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

    const ivaTotal = cobrarIva ? (subtotalTotal - descTotal) * ivaPct : 0;
    const totalFinal = (subtotalTotal - descTotal) + ivaTotal;

    updateTotals(subtotalTotal, descTotal, ivaTotal, totalFinal);
    updateCartCount();
  }

  function updateTotals(sub, desc, iva, tot) {
    const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });
    document.getElementById('pos-subtotal').textContent = formatter.format(sub);
    document.getElementById('pos-descuento').textContent = `-${formatter.format(desc)}`;
    
    // Cambiar la etiqueta de IVA dinámicamente según configuración
    const ivaValEl = document.getElementById('pos-iva');
    if (ivaValEl && ivaValEl.previousElementSibling) {
      ivaValEl.previousElementSibling.textContent = cobrarIva ? `IVA (${(ivaPct * 100).toFixed(0)}%):` : 'IVA (Exento):';
    }
    
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
    const imeis = [];
    for (const item of cart) {
      if (item.tieneNumeroSerie) {
        if (!item.imei) {
          showToast('IMEI Requerido', `Por favor, ingrese el IMEI para: ${item.nombre}`, 'warning');
          return;
        }
        imeis.push(item.imei);
      }
    }

    // Validar si hay seriales duplicados
    const uniqueImeis = new Set(imeis);
    if (imeis.length !== uniqueImeis.size) {
      showToast('Seriales Duplicados', 'Hay números de serie duplicados en el carrito. Cada artículo debe tener un serial único.', 'warning');
      return;
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
      showToast('Venta a Crédito', 'Debe seleccionar un cliente registrado para realizar ventas a crédito.', 'warning');
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
      showToast('Pago Insuficiente', 'El monto pagado es insuficiente.', 'error');
      return;
    }

    // Verificar si algún item del carrito requiere PIN y consolidarlo
    let pinAdmin = null;
    cart.forEach(item => {
      if (item.pinAdmin) pinAdmin = item.pinAdmin;
    });

    const body = {
      clienteId: clienteId || null,
      sedeId: currentSedeId,
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
    submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status"></span>Registrando…`;

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
      const itemsVendidos = [...cart];
      renderPrintReceipt(res, body, itemsVendidos);

      // Limpiar carrito
      cart = [];
      renderCart();

      // Forzar impresión
      window.print();
    } catch (err) {
      showToast('Error', err.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Procesar Venta';
    }
  });

  function renderPrintReceipt(res, body, items) {
    const area = document.getElementById('print-receipt-area');
    const sedeActual = sedes.find(s => s.id === currentSedeId);
    const cliente = body.clienteId
      ? clientes.find((c) => String(c.id) === String(body.clienteId))
      : null;

    area.innerHTML = renderPosReceipt({
      empresaConfig,
      sedeNombre: sedeActual?.nombre || usuario.sedeNombre || '',
      sedeDireccion: sedeActual?.direccion || '',
      cajeroNombre: usuario.nombre,
      clienteNombre: cliente?.nombre || '',
      clienteDocumento: cliente?.documento || '',
      clienteDireccion: cliente?.direccion || '',
      numeroFactura: res.numeroFactura,
      fecha: new Date(),
      items,
      subtotal: body.subtotal,
      descuentoTotal: body.descuentoTotal,
      iva: body.iva,
      total: body.total,
      cobrarIva,
      pagos: body.pagos || [],
      esCredito: body.esCredito
    });
  }

  if (isAdmin) {
    const selectPosSede = document.getElementById('select-pos-sede');
    if (selectPosSede) {
      selectPosSede.addEventListener('change', (e) => {
        currentSedeId = e.target.value;
        cart = [];
        loadAndRenderPOS();
      });
    }
  }
}

  loadAndRenderPOS();
}

export function destroyPos() {
  destroyBarcodeScanner();
  if (posKeydownHandler) {
    document.removeEventListener('keydown', posKeydownHandler);
    posKeydownHandler = null;
  }
}
