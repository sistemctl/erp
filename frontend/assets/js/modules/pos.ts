import type { ClienteDTO, SedeDTO, CategoriaDTO, SessionUser, PagoInput, VentaCreada } from '../../../../shared/contracts';
import type { CartItem, ProductoPos, StockPos, CajaPos, PosConfig, SaleBody, CotizacionPos, TradeInPos } from '../types/pos.js';
import type { MedioPago } from '../types/finance.js';
import { requireSelector, eventField } from '../utils/dom.js';
import { requireElement } from '../utils/dom.js';
import { errorMessage } from '../utils/errors.js';
import { watchDataChanges } from '../utils/live-data.js';
import { bindQuickAction } from '../utils/quick-actions.js';
import { apiFetch } from '../api.js';
import { requireUsuario } from '../auth.js';
import { initBarcodeScanner, destroyBarcodeScanner } from '../utils/barcode.js';
import { showToast } from '../utils/toast.js';
import { renderPosReceipt } from '../utils/pos-receipt.js';
import { formatStockUnidad, labelUnidadMedida } from '../utils/unidad-medida.js';

let posKeydownHandler: ((event: KeyboardEvent) => void) | null = null;
let cart: CartItem[] = [];
let maxDescuentoPermitido = 15;
let clientes: ClienteDTO[] = [];
let selectedCategoryId: string | null = null;
let cobrarIva = true;
let ivaPct = 0.19;
let saleTotals = { subtotal: 0, descuentoTotal: 0, iva: 0, total: 0 };
let pendingSale: { signature: string; key: string } | null = null;
const roundMoney = (value: number) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
} as Record<string, string>)[char] ?? char);
let currentSedeId: string | null = null;
let sedes: SedeDTO[] = [];
let mediosPagoActivos: MedioPago[] = [
  { id: 'efectivo', nombre: 'Efectivo' }, { id: 'nequi', nombre: 'Nequi' },
  { id: 'daviplata', nombre: 'Daviplata' }, { id: 'tarjeta', nombre: 'Tarjeta' },
  { id: 'transferencia', nombre: 'Transferencia' }
];
let empresaConfig = {
  empresa: 'TechStore Colombia',
  nit: '',
  direccion: '',
  telefono: '',
  logoUrl: ''
};

function getSedeNombre(sedes: readonly SedeDTO[], sedeId: string | null, fallback = 'Sede') {
  const match = sedes.find((s) => String(s.id) === String(sedeId));
  return match?.nombre || fallback;
}

function renderPosSessionBar({ usuario, isAdmin, sedes, currentSedeId, cajaAbierta, sedeFallback }: { usuario: SessionUser; isAdmin: boolean; sedes: SedeDTO[]; currentSedeId: string | null; cajaAbierta: CajaPos | null; sedeFallback?: string }) {
  const sedeNombre = getSedeNombre(sedes, currentSedeId, sedeFallback || usuario.sedeNombre || 'Sede');
  const cajaOk = cajaAbierta?.estado === 'abierta' && !cajaAbierta.cierrePendiente;
  const abiertaPor = cajaAbierta?.estado === 'abierta' ? cajaAbierta.usuarioApertura?.nombre : null;

  return `
    <div class="pos-session-bar d-print-none" role="region" aria-label="Estado de la caja">
      <div class="pos-session-bar__primary">
        <span class="pos-session-chip ${cajaOk ? 'pos-session-chip--live' : 'pos-session-chip--warn'}">
          <i class="ti ${cajaOk ? 'ti-lock-open' : 'ti-lock'}" aria-hidden="true"></i>
          ${(cajaAbierta?.estado !== 'sin_registro' && cajaAbierta?.cierrePendiente) ? 'Cierre pendiente' : cajaOk ? 'Caja abierta' : 'Caja cerrada'}
        </span>
        ${cajaOk ? `
          <span class="pos-session-chip pos-session-chip--scan">
            <i class="ti ti-scan" aria-hidden="true"></i>
            Escáner listo
          </span>
        ` : ''}
        ${abiertaPor ? `
          <span class="pos-session-chip" title="Quién abrió la caja de esta sede">
            <i class="ti ti-user-check" aria-hidden="true"></i>
            Abrió: ${escapeHtml(abiertaPor)}
          </span>
        ` : ''}
      </div>
      <div class="pos-session-bar__meta">
        <span class="pos-session-chip" title="Sede">
          <i class="ti ti-building-store" aria-hidden="true"></i>
          ${escapeHtml(sedeNombre)}
        </span>
        <span class="pos-session-chip" title="Cajero">
          <i class="ti ti-user" aria-hidden="true"></i>
          ${escapeHtml(usuario.nombre)}
        </span>
        ${isAdmin ? `
          <div class="pos-session-bar__admin">
            <label class="pos-session-bar__label" for="select-pos-sede">Sede</label>
            <select id="select-pos-sede" class="form-select form-select-sm pos-session-sede-select" aria-label="Sede para ventas">
              ${sedes.map((s) => `<option value="${s.id}" ${String(s.id) === String(currentSedeId) ? 'selected' : ''}>${escapeHtml(s.nombre)}</option>`).join('')}
            </select>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

export async function initPos(container: HTMLElement) {
  const usuario = requireUsuario();
  const isAdmin = ['admin', 'superadmin'].includes(usuario.rol);
  currentSedeId = usuario.sedeId;

  try {
    if (isAdmin) {
      try {
        sedes = (await apiFetch<SedeDTO[]>('/config/sedes')) ?? [];
      } catch (err) {
        showToast('Error', errorMessage(err) || 'No se pudieron cargar las sedes.', 'error');
        sedes = [];
      }
      if (!currentSedeId && sedes.length > 0) {
        currentSedeId = sedes[0].id;
      }
    }
  } catch (e) {
    console.error('Error precargando sedes en POS:', e);
  }

  async function loadAndRenderPOS() {
    destroyBarcodeScanner();
    if (posKeydownHandler) {
      document.removeEventListener('keydown', posKeydownHandler);
      posKeydownHandler = null;
    }
    
    // 1. Cargar datos básicos y verificar si la caja está abierta
    let cajaAbierta: CajaPos | null = null;
    let cajaCompartida = true;
    try {
      cajaAbierta = await apiFetch<CajaPos>(`/caja/reporte?sede=${currentSedeId}`, { silent: true }).catch(() => null);
    
    // Obtener configuración del sistema para el descuento máximo e IVA
    let config: PosConfig | null = null;
    try {
      config = await apiFetch<PosConfig>('/config/sistema');
    } catch (err) {
      showToast('Aviso', errorMessage(err) || 'No se pudo cargar la configuración; se usan valores por defecto.', 'warning');
    }
    maxDescuentoPermitido = config ? parseFloat(String(config.descuentoMaximoPct)) : 15;
    cobrarIva = config && config.cobrarIvaPos !== undefined ? !!config.cobrarIvaPos : true;
    ivaPct = config && config.ivaDefecto !== undefined ? parseFloat(String(config.ivaDefecto)) / 100 : 0.19;
    cajaCompartida = !config || config.cajaCompartidaSede !== false;
    if (Array.isArray(config?.mediosPago)) {
      mediosPagoActivos = config.mediosPago.filter((medio) => medio?.id && medio.activo !== false);
    }
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
    try {
      clientes = (await apiFetch<ClienteDTO[]>('/clientes')) ?? [];
    } catch (err) {
      showToast('Error', errorMessage(err) || 'No se pudieron cargar los clientes.', 'error');
      clientes = [];
    }
  } catch (e) {
    console.error('Error al inicializar POS:', e);
    showToast('Error', errorMessage(e) || 'Error al inicializar el punto de venta.', 'error');
  }

  // Cargar categorías del catálogo directamente de la base de datos
  let categories: CategoriaDTO[] = [];
  try {
    categories = (await apiFetch<CategoriaDTO[]>('/productos/categorias')) ?? [];
  } catch (e) {
    console.error('Error al obtener categorías:', e);
    showToast('Error', errorMessage(e) || 'No se pudieron cargar las categorías.', 'error');
    categories = [];
  }


    if (!container.isConnected || window.location.hash.split('?')[0] !== '#/pos') return;
    if (!cajaAbierta || cajaAbierta.estado !== 'abierta' || cajaAbierta.cierrePendiente) {
      const pendiente = cajaAbierta && cajaAbierta.estado !== 'sin_registro' && cajaAbierta.cierrePendiente;
      const gateText = pendiente
        ? `La caja del ${escapeHtml(cajaAbierta?.fecha)} sigue abierta. La abrió ${escapeHtml(cajaAbierta?.estado !== 'sin_registro' && cajaAbierta?.usuarioApertura?.nombre || 'un cajero')}. Realiza el conteo del efectivo, cierra esa caja y abre la de hoy para vender.`
        : cajaCompartida
        ? 'La caja es por sede: si otro cajero ya la abrió en esta misma sede, deberías poder vender aquí. Revisa el selector de sede arriba o ve a Caja para abrirla.'
        : 'Con “Caja compartida” desactivada, cada usuario debe abrir su propia caja. Ve a Caja, haz la apertura con tu usuario y vuelve al POS.';
      container.innerHTML = `
        <div class="container-xl erp-module pos-module">
          ${renderPosSessionBar({ usuario, isAdmin, sedes, currentSedeId, cajaAbierta, sedeFallback: usuario.sedeNombre })}
          <div class="pos-gate-card" role="status">
            <div class="pos-gate-card__icon" aria-hidden="true"><i class="ti ti-lock"></i></div>
            <h2 class="pos-gate-card__title">${pendiente ? 'Tienes un cierre pendiente del día anterior' : 'Abre la caja para vender'}</h2>
            <p class="pos-gate-card__text">${gateText}</p>
            <a href="#/caja?sede=${encodeURIComponent(currentSedeId ?? '')}" class="btn btn-primary">${pendiente ? 'Ir al cierre pendiente' : 'Ir a apertura de caja'}</a>
          </div>
        </div>
      `;
      if (isAdmin) {
        const selectPosSede = requireElement('select-pos-sede', HTMLSelectElement);
        if (selectPosSede) {
          selectPosSede.addEventListener('change', (e) => {
            currentSedeId = eventField(e).value;
            cart = [];
            loadAndRenderPOS();
          });
        }
      }
      watchDataChanges(container, ['caja'], loadAndRenderPOS);
      return;
    }

    // Renderizar maquetación del POS
    container.innerHTML = `
      <div class="container-xl erp-module pos-module">
        ${renderPosSessionBar({ usuario, isAdmin, sedes, currentSedeId, cajaAbierta, sedeFallback: usuario.sedeNombre })}

        <div class="pos-workspace d-print-none">
          <section class="pos-panel pos-panel--catalog" aria-labelledby="pos-catalog-heading">
            <div class="pos-panel__head">
              <div class="pos-panel__heading">
                <span class="pos-step-badge" aria-hidden="true">1</span>
                <div class="pos-panel__heading-text">
                  <p class="pos-panel__step">Paso 1</p>
                  <h2 class="pos-panel__title" id="pos-catalog-heading">Agregar productos</h2>
                </div>
              </div>
              <kbd class="pos-kbd-hint" title="Enfocar búsqueda">F2</kbd>
            </div>
            <div class="pos-panel__body pos-panel__body--catalog">
              <div class="pos-toolbar">
                <div class="pos-search-wrap">
                  <label class="visually-hidden" for="pos-search-input">Buscar producto</label>
                  <div class="input-icon">
                    <span class="input-icon-addon"><i class="ti ti-search" aria-hidden="true"></i></span>
                    <input type="text" id="pos-search-input" class="form-control form-control-lg pos-search-input" placeholder="Nombre o código de barras…" autocomplete="off" spellcheck="false">
                  </div>
                </div>
                <div id="pos-categories-container" class="pos-categories" role="toolbar" aria-label="Filtrar por categoría"></div>
              </div>
              <div class="pos-results" id="pos-search-results">
                <div class="pos-empty">
                  <i class="ti ti-scan" aria-hidden="true"></i>
                  <p>Escanea o busca un producto para empezar.</p>
                </div>
              </div>
            </div>
          </section>

          <section class="pos-panel pos-panel--sale" aria-labelledby="pos-sale-heading">
            <div class="pos-panel__head pos-panel__head--sale">
              <div class="pos-panel__heading">
                <span class="pos-step-badge pos-step-badge--sale" aria-hidden="true">2</span>
                <div class="pos-panel__heading-text">
                  <p class="pos-panel__step">Paso 2</p>
                  <h2 class="pos-panel__title" id="pos-sale-heading">Productos</h2>
                </div>
              </div>
              <span class="pos-cart-count" id="pos-cart-count" aria-live="polite">0 productos</span>
              <button type="button" id="pos-clear-cart" class="btn btn-sm btn-link">Vaciar</button>
              <button type="button" id="pos-close-mobile-cart" class="pos-mobile-close btn btn-sm btn-outline-secondary" aria-label="Cerrar carrito"><i class="ti ti-x"></i></button>
            </div>
            <div class="pos-panel__body pos-panel__body--sale">
              <div class="pos-cart-scroll" id="pos-cart-items">
                <div class="pos-empty pos-empty--compact">
                  <i class="ti ti-shopping-cart" aria-hidden="true"></i>
                  <p>El carrito está vacío.</p>
                </div>
              </div>
              <div class="pos-totals">
                <div class="pos-totals__lines">
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
                </div>
                <div class="pos-totals__grand">
                  <span>Total a cobrar</span>
                  <span id="pos-total" class="pos-totals__grand-val">$ 0</span>
                </div>
                <button type="button" id="pos-checkout-btn" class="btn btn-primary btn-lg w-100 pos-checkout-btn" disabled>
                  <span>Continuar al pago</span><i class="ti ti-arrow-right" aria-hidden="true"></i>
                </button>
              </div>
            </div>
          </section>
        </div>
        <button type="button" id="pos-mobile-cart-toggle" class="pos-mobile-summary btn btn-primary" aria-controls="pos-sale-heading" aria-expanded="false"><span><i class="ti ti-shopping-cart"></i> Ver carrito <small id="pos-mobile-count">0 productos</small></span><strong id="pos-mobile-total">$ 0</strong></button>
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
                    <label class="form-label">Descuento / aumento (%)</label>
                    <input type="number" id="override-descuento-pct" class="form-control" max="100" step="0.1" aria-describedby="override-ajuste-ayuda">
                  </div>
                </div>
                <div class="col-6">
                  <div class="mb-3">
                    <label class="form-label">Precio Modificado (COP)</label>
                    <input type="number" id="override-precio-mod" class="form-control" min="0" step="0.01">
                  </div>
                </div>
              </div>
              <div id="override-ajuste-ayuda" class="text-secondary small mt-n2">
                Use un valor negativo para aumentar el precio; uno positivo aplica descuento.
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
    <div class="pos-payment-step" id="modal-checkout" hidden>
      <div class="pos-payment-layout">
        <div class="pos-payment-content">
          <div class="pos-payment-header">
            <button type="button" id="pos-back-to-cart" class="btn btn-icon btn-outline-secondary" aria-label="Volver a productos"><i class="ti ti-arrow-left"></i></button>
            <h2 class="pos-panel__title">Datos del pago</h2>
          </div>
          <form id="form-checkout">
            <div class="modal-body">
              <div class="row">
                <!-- Columna de datos de cliente y crédito -->
                <div class="col-md-6 border-end">
                  <div class="mb-3">
                    <label class="form-label">Cliente (Opcional)</label>
                    ${(() => {
                      const consumidor = clientes.find((c) => c.nombre === 'Consumidor Final' || ['222222222', '222222222-0', '222222222222'].includes(c.documento ?? ''));
                      return `
                        <input type="hidden" id="checkout-cliente" value="${consumidor?.id || ''}">
                        <button type="button" id="btn-buscar-cliente-checkout" class="btn btn-outline-secondary w-100 text-start d-flex align-items-center justify-content-between">
                          <span id="checkout-cliente-nombre">${escapeHtml(consumidor?.nombre || 'Consumidor Final')}</span>
                          <i class="ti ti-search"></i>
                        </button>
                      `;
                    })()}
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
                  <div id="checkout-payment-methods"></div>
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
              <button type="button" class="btn btn-link link-secondary" id="pos-cancel-payment">Volver</button>
              <button type="submit" class="btn btn-primary ms-auto" id="checkout-submit-btn">Crear venta</button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <div class="modal modal-blur fade" id="modal-buscar-cliente-checkout" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable pos-client-search-dialog" role="document">
        <div class="modal-content pos-client-search-modal">
          <div class="modal-header pos-client-search-header">
            <div class="d-flex align-items-center gap-2">
              <span class="avatar avatar-sm bg-primary-lt text-primary"><i class="ti ti-users"></i></span>
              <div>
                <h5 class="modal-title">Buscar cliente</h5>
                <div class="text-secondary small">Selecciona quién realiza la compra</div>
              </div>
            </div>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>
          <div class="modal-body pos-client-search-body">
            <div class="input-icon">
              <span class="input-icon-addon"><i class="ti ti-search"></i></span>
              <input type="search" id="checkout-cliente-busqueda" class="form-control form-control-lg" placeholder="Nombre, documento o teléfono" autocomplete="off">
            </div>
            <div class="d-flex align-items-center justify-content-between mt-4 mb-2">
              <span class="text-secondary small fw-semibold text-uppercase">Resultados</span>
              <span id="checkout-clientes-contador" class="text-secondary small"></span>
            </div>
            <div id="checkout-clientes-resultados" class="pos-client-results"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Área de impresión ticket POS (80mm) -->
    <div id="print-receipt-area" class="pos-receipt-print-host d-none d-print-block" aria-hidden="true"></div>
  `;

  // Variables y Modales
  const modalOverride = new bootstrap.Modal(requireElement('modal-override', HTMLDivElement));
  const salePanel = requireSelector('.pos-panel--sale', HTMLElement, container);
  const paymentStep = requireElement('modal-checkout', HTMLDivElement);
  salePanel.append(paymentStep);
  const paymentSummary = requireSelector('.alert.alert-secondary', HTMLElement, paymentStep);
  paymentSummary.classList.add('pos-payment-summary');
  requireSelector('.modal-footer', HTMLElement, paymentStep).prepend(paymentSummary);
  let checkoutSignature: string | null = null;
  const setMobileCart = (open: boolean) => {
    salePanel.dataset.mobileOpen = String(open);
    requireElement('pos-mobile-cart-toggle', HTMLButtonElement).setAttribute('aria-expanded', String(open));
  };
  const modalCheckout = {
    show() {
      salePanel.dataset.step = 'payment';
      requireSelector('.pos-panel--catalog', HTMLElement, container).inert = true;
      paymentStep.hidden = false;
      if (window.innerWidth < 992) setMobileCart(true);
      requireElement('pos-back-to-cart', HTMLButtonElement).focus();
    },
    hide() {
      salePanel.dataset.step = 'products';
      requireSelector('.pos-panel--catalog', HTMLElement, container).inert = false;
      paymentStep.hidden = true;
      requireElement('pos-checkout-btn', HTMLButtonElement).focus();
    }
  };
  requireElement('pos-back-to-cart', HTMLButtonElement).addEventListener('click', () => modalCheckout.hide());
  requireElement('pos-cancel-payment', HTMLButtonElement).addEventListener('click', () => modalCheckout.hide());
  requireElement('pos-mobile-cart-toggle', HTMLButtonElement).addEventListener('click', () => setMobileCart(true));
  requireElement('pos-close-mobile-cart', HTMLButtonElement).addEventListener('click', () => { setMobileCart(false); requireElement('pos-mobile-cart-toggle', HTMLButtonElement).focus(); });
  requireElement('pos-clear-cart', HTMLButtonElement).addEventListener('click', () => {
    cart = [];
    pendingSale = null;
    checkoutSignature = null;
    renderCart();
  });
  const modalBuscarCliente = new bootstrap.Modal(requireElement('modal-buscar-cliente-checkout', HTMLDivElement));

  const searchInput = requireElement('pos-search-input', HTMLInputElement);
  const resultsContainer = requireElement('pos-search-results', HTMLDivElement);

  const esConsumidorFinal = (cliente: ClienteDTO | undefined) => cliente?.nombre === 'Consumidor Final' ||
    ['222222222', '222222222-0', '222222222222'].includes(cliente?.documento ?? '');
  const actualizarClienteCheckout = (cliente: ClienteDTO | undefined) => {
    const input = requireElement('checkout-cliente', HTMLInputElement);
    input.value = cliente?.id || '';
    requireElement('checkout-cliente-nombre', HTMLElement).textContent = cliente?.nombre || 'Consumidor Final';
    input.dispatchEvent(new Event('change'));
  };
  const renderClientesCheckout = (query = '') => {
    const term = query.trim().toLowerCase();
    const results = clientes.filter((cliente) => {
      const haystack = `${cliente.nombre || ''} ${cliente.documento || ''} ${cliente.telefono || ''}`.toLowerCase();
      return !term || haystack.includes(term);
    }).slice(0, 50);
    const list = requireElement('checkout-clientes-resultados', HTMLDivElement);
    requireElement('checkout-clientes-contador', HTMLElement).textContent = results.length === 50 && clientes.length > 50
      ? '50 resultados'
      : `${results.length} ${results.length === 1 ? 'cliente' : 'clientes'}`;
    list.innerHTML = results.length ? results.map((cliente) => {
      const initial = (cliente.nombre || '?').trim().charAt(0).toUpperCase();
      return `
      <button type="button" class="checkout-cliente-opcion" data-id="${cliente.id}">
        <span class="avatar avatar-sm checkout-cliente-avatar">${escapeHtml(initial)}</span>
        <span class="checkout-cliente-info">
          <span class="checkout-cliente-titulo">${escapeHtml(cliente.nombre || 'Sin nombre')}</span>
          <span class="checkout-cliente-meta"><i class="ti ti-id-badge"></i>${escapeHtml(cliente.documento || 'Sin documento')}${cliente.telefono ? `<span class="checkout-cliente-separador">·</span><i class="ti ti-phone"></i>${escapeHtml(cliente.telefono)}` : ''}</span>
        </span>
        <i class="ti ti-chevron-right checkout-cliente-arrow"></i>
      </button>
    `;
    }).join('') : '<div class="pos-client-empty"><i class="ti ti-user-off"></i><span>No se encontraron clientes.</span></div>';
    list.querySelectorAll<HTMLButtonElement>('.checkout-cliente-opcion').forEach((button) => button.addEventListener('click', () => {
      actualizarClienteCheckout(clientes.find((cliente) => String(cliente.id) === button.dataset.id));
      modalBuscarCliente.hide();
    }));
  };
  requireElement('btn-buscar-cliente-checkout', HTMLButtonElement).addEventListener('click', () => {
    const input = requireElement('checkout-cliente-busqueda', HTMLInputElement);
    input.value = '';
    renderClientesCheckout();
    modalBuscarCliente.show();
    setTimeout(() => input.focus(), 150);
  });
  requireElement('checkout-cliente-busqueda', HTMLInputElement).addEventListener('input', (event) => renderClientesCheckout(eventField(event).value));

  // Cargar Cotización Pendiente si existe
  const pendingCotId = localStorage.getItem('pendingCotizacionId');
  if (pendingCotId) {
    localStorage.removeItem('pendingCotizacionId');
    apiFetch<CotizacionPos>(`/cotizaciones/${pendingCotId}`).then(cot => {
      if (!cot) throw new Error("No se encontró la cotización.");
      // Establecer cliente
      if (cot.clienteId) {
        const selectCliente = requireElement('checkout-cliente', HTMLInputElement);
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
            precioBase: parseFloat(String(item.producto ? item.producto.precioVenta : item.precioUnitario)),
            precioModificado: parseFloat(String(item.precioUnitario)),
            precioCosto: parseFloat(String(item.producto ? item.producto.precioCosto : Number(item.precioUnitario) * 0.7)),
            descuentoPct: 0,
            cantidad: item.cantidad,
            tieneNumeroSerie: item.producto ? item.producto.tieneNumeroSerie : false,
            tieneIVA: item.producto?.tieneIVA !== false,
            imei: '',
            imagenUrl: item.producto ? item.producto.imagenUrl : null,
            subtotal: parseFloat(String(item.precioUnitario)) * item.cantidad
          });
        } else {
          cart.push({
            productoId: null,
            nombre: item.descripcion,
            codigoBarras: 'MANUAL',
            precioBase: parseFloat(String(item.precioUnitario)),
            precioModificado: parseFloat(String(item.precioUnitario)),
            precioCosto: parseFloat(String(item.precioUnitario)) * 0.7,
            descuentoPct: 0,
            cantidad: item.cantidad,
            tieneNumeroSerie: false,
            imei: '',
            subtotal: parseFloat(String(item.precioUnitario)) * item.cantidad
          });
        }
      });
      renderCart();
    }).catch(err => console.error('Error cargando cotización:', err));
  }

  // Inicializar escáner de código de barras USB
  initBarcodeScanner(async (barcode) => {
    try {
      const prod = await apiFetch<ProductoPos>(`/productos/barcode/${barcode}?sedeId=${currentSedeId}`);
      if (prod) addToCart(prod);
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
      const stock = await apiFetch<StockPos[]>(`/inventario/stock?sedeId=${currentSedeId}`);
      const filtered = (stock ?? []).filter(item => {
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
        <div class="pos-product-grid">
          ${filtered.map(item => {
            const brandName = item.producto.categoria ? item.producto.categoria.nombre : 'GENÉRICO';
            const comboSummary = item.producto.esCombo
              ? (item.producto.componentes || []).map((row) => `${row.cantidad}× ${row.nombre || row.producto?.nombre || 'Producto'}`).join(' · ')
              : '';
            const imgHtml = item.producto.imagenUrl 
              ? `<img src="${escapeHtml(item.producto.imagenUrl)}" class="pos-product-card-img" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'24\\' height=\\'24\\' fill=\\'none\\' stroke=\\'%23ccc\\' stroke-width=\\'2\\'><rect width=\\'20\\' height=\\'20\\' x=\\'2\\' y=\\'2\\' rx=\\'2\\'/><circle cx=\\'9\\' cy=\\'9\\' r=\\'2\\'/><path d=\\'m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21\\'/></svg>';">`
              : `<div class="pos-product-card-fallback">${escapeHtml(item.producto.nombre.charAt(0).toUpperCase())}</div>`;

            return `
              <button type="button" class="pos-product-card btn-add-prod" data-id="${item.productoId}">
                ${imgHtml}
                <div class="pos-product-card-body">
                  <span class="pos-product-card-brand">${escapeHtml(brandName)}${item.producto.esCombo ? ' <span class="pos-combo-badge">Combo</span>' : ''}</span>
                  <div class="pos-product-card-title" title="${escapeHtml(item.producto.nombre)}">${escapeHtml(item.producto.nombre)}</div>
                  ${comboSummary ? `<div class="pos-product-card-combo" title="${escapeHtml(comboSummary)}">${escapeHtml(comboSummary)}</div>` : ''}
                  <div class="pos-product-card-footer">
                    <span class="pos-product-card-price">$ ${new Intl.NumberFormat('es-CO').format(Number(item.producto.precioVenta))}</span>
                    <span class="pos-product-card-stock">${item.producto.esServicio
                      ? '<strong class="text-azure">Servicio</strong>'
                      : item.producto.esCombo
                        ? `Armables <strong class="${item.cantidad <= 0 ? 'text-danger' : 'text-success'}">${item.cantidad}</strong>`
                        : `Stock <strong class="${item.cantidad <= item.producto.stockMinimo ? 'text-danger' : 'text-success'}">${formatStockUnidad(item.cantidad, item.producto.unidadMedida)}</strong>`}</span>
                  </div>
                </div>
              </button>
            `;
          }).join('')}
        </div>
      `;

      // Click listener para añadir
      document.querySelectorAll('.btn-add-prod').forEach(btn => {
      if (!(btn instanceof HTMLButtonElement)) return;
        btn.addEventListener('click', (e) => {
          const id = btn.getAttribute('data-id');
          const item = filtered.find(s => s.productoId === id);
          if (item) {
            // Verificar stock (los servicios no consumen inventario)
            const cartItem = cart.find(c => c.productoId === id);
            const qty = cartItem ? cartItem.cantidad + 1 : 1;
            if (!item.producto.esServicio && qty > item.cantidad) {
              const ud = labelUnidadMedida(item.producto.unidadMedida);
              showToast('Stock Insuficiente', `No puedes agregar más ${ud} de las disponibles en stock.`, 'error');
              return;
            }

            addToCart({ ...item.producto, disponibilidadCombo: item.cantidad });
            searchInput.value = '';
            searchInput.focus();
            searchProducts();
          }
        });
      });

    } catch (e) {
      resultsContainer.innerHTML = `<div class="text-center py-5 text-danger">${escapeHtml(errorMessage(e))}</div>`;
    }
  };

  searchInput.addEventListener('input', searchProducts);
  watchDataChanges(container, ['productos', 'inventario', 'series', 'compras', 'ventas', 'clientes'], async () => {
    await searchProducts();
    clientes = (await apiFetch<ClienteDTO[]>('/clientes')) ?? [];
    if (document.getElementById('modal-buscar-cliente-checkout')?.classList.contains('show')) {
      renderClientesCheckout(document.querySelector<HTMLInputElement>('#checkout-cliente-busqueda')?.value || '');
    }
  });

  if (posKeydownHandler) {
    document.removeEventListener('keydown', posKeydownHandler);
  }
  posKeydownHandler = (e) => {
    if (e.key !== 'F2') return;
    const input = requireElement('pos-search-input', HTMLInputElement);
    if (!input) return;
    e.preventDefault();
    input.focus();
    input.select();
  };
  document.addEventListener('keydown', posKeydownHandler);

  const renderCategoryButtons = () => {
    const catsContainer = requireElement('pos-categories-container', HTMLDivElement);
    if (!catsContainer) return;

    const allBtnClass = selectedCategoryId === null ? 'pos-cat-pill is-active' : 'pos-cat-pill';
    let buttonsHtml = `<button type="button" class="${allBtnClass} btn-cat-filter" data-id="all">Todos</button>`;

    categories.forEach(c => {
      const btnClass = selectedCategoryId === c.id ? 'pos-cat-pill is-active' : 'pos-cat-pill';
      buttonsHtml += `<button type="button" class="${btnClass} btn-cat-filter" data-id="${c.id}">${escapeHtml(c.nombre)}</button>`;
    });

    catsContainer.innerHTML = buttonsHtml;

    document.querySelectorAll('.btn-cat-filter').forEach(btn => {
      if (!(btn instanceof HTMLButtonElement)) return;
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
  function addToCart(producto: ProductoPos) {
    if (salePanel.dataset.step === 'payment') return;
    const disponibilidadCombo = Number.parseInt(
      String(producto.disponibilidadCombo ?? producto.stocks?.[0]?.cantidad),
      10
    );
    if (producto.esCombo && Number.isFinite(disponibilidadCombo) && disponibilidadCombo < 1) {
      showToast('Combo agotado', 'No hay suficientes componentes para armar este combo en la sede.', 'warning');
      return;
    }
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
      if (producto.esCombo && Number.isFinite(disponibilidadCombo) && existing.cantidad >= disponibilidadCombo) {
        showToast('Combo agotado', `Solo hay ${disponibilidadCombo} combo(s) armable(s) en esta sede.`, 'warning');
        return;
      }
      existing.cantidad += 1;
      existing.subtotal = existing.precioModificado * existing.cantidad;
    } else {
      cart.push({
        productoId: producto.id,
        nombre: producto.nombre,
        codigoBarras: producto.codigoBarras,
        precioBase: parseFloat(String(producto.precioVenta)),
        precioModificado: parseFloat(String(producto.precioVenta)),
        precioCosto: parseFloat(String(producto.precioCosto)),
        descuentoPct: 0,
        cantidad: 1,
        unidadMedida: producto.unidadMedida || 'und',
        tieneNumeroSerie: producto.esServicio ? false : producto.tieneNumeroSerie,
        esServicio: !!producto.esServicio,
        tieneIVA: producto.tieneIVA !== false,
        esCombo: !!producto.esCombo,
        componentes: producto.componentes || [],
        disponibilidadCombo: Number.isFinite(disponibilidadCombo) ? disponibilidadCombo : null,
        imei: producto.autoDetectedImei || '',
        imagenUrl: producto.imagenUrl,
        subtotal: parseFloat(String(producto.precioVenta))
      });
    }

    renderCart();
  }

  function updateCartCount() {
    const badge = requireElement('pos-cart-count', HTMLElement);
    if (!badge) return;
    const units = cart.reduce((sum, item) => sum + item.cantidad, 0);
    badge.textContent = units === 1 ? '1 producto' : `${units} productos`;
    requireElement('pos-mobile-count', HTMLElement).textContent = badge.textContent;
    requireElement('pos-mobile-total', HTMLElement).textContent = requireElement('pos-total', HTMLElement).textContent;
    requireElement('pos-clear-cart', HTMLButtonElement).disabled = !cart.length;
    requireSelector('span', HTMLSpanElement, requireElement('pos-checkout-btn', HTMLButtonElement)).textContent = `Continuar · ${requireElement('pos-total', HTMLElement).textContent}`;
  }

  function renderCart() {
    const cartContainer = requireElement('pos-cart-items', HTMLDivElement);
    const checkoutBtn = requireElement('pos-checkout-btn', HTMLButtonElement);

    if (cart.length === 0) {
      cartContainer.innerHTML = `
        <div class="pos-empty pos-empty--compact">
          <i class="ti ti-shopping-cart" aria-hidden="true"></i>
          <p>El carrito está vacío.</p>
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
        ? `<img src="${escapeHtml(item.imagenUrl)}" class="pos-cart-line__img" alt="" onerror="this.hidden=true;this.nextElementSibling.hidden=false">
           <span class="pos-cart-line__fallback" hidden aria-hidden="true">${escapeHtml(initial)}</span>`
        : `<span class="pos-cart-line__fallback" aria-hidden="true">${escapeHtml(initial)}</span>`;

      const ud = labelUnidadMedida(item.unidadMedida);
      const qtyControl = item.tieneNumeroSerie
        ? `<span class="pos-qty-fixed" aria-label="Cantidad fija">1 ${ud}</span>`
        : `
          <div class="pos-qty-stepper" role="group" aria-label="Cantidad de ${escapeHtml(item.nombre)}">
            <button type="button" class="pos-qty-btn btn-dec-qty" data-idx="${idx}" aria-label="Quitar ${ud}">−</button>
            <input type="number" class="pos-qty-input input-qty-cart" data-idx="${idx}" value="${item.cantidad}" min="1" inputmode="numeric" aria-label="Cantidad en ${ud}">
            <button type="button" class="pos-qty-btn btn-inc-qty" data-idx="${idx}" aria-label="Agregar ${ud}">+</button>
          </div>
        `;

      return `
        <article class="pos-cart-line">
          <div class="pos-cart-line__media">${mediaHtml}</div>
          <div class="pos-cart-line__body">
            <div class="pos-cart-line__head">
              <h3 class="pos-cart-line__name" title="${escapeHtml(item.nombre)}">${escapeHtml(item.nombre)}${item.esCombo ? ' <span class="pos-combo-badge">Combo</span>' : ''}</h3>
              <span class="pos-cart-line__subtotal">${formatter.format(item.subtotal)}</span>
            </div>
            <div class="pos-cart-line__unit">
              ${formatter.format(item.precioModificado)} / ${ud}
              ${item.descuentoPct > 0 ? `<span class="pos-cart-line__disc">−${item.descuentoPct}%</span>` : ''}
            </div>
            <div class="pos-cart-line__foot">
              <div class="pos-cart-line__qty">
                <span class="pos-cart-line__qty-label">${ud}</span>
                ${qtyControl}
              </div>
              <div class="pos-cart-line__actions">
                <button type="button" class="pos-cart-line__action btn-override-item" data-idx="${idx}" title="Cambiar precio o descuento" aria-label="Cambiar precio o descuento">
                  <span>${formatter.format(item.precioModificado)}</span><i class="ti ti-edit" aria-hidden="true"></i>
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
                  <input type="text" id="imei-${idx}" class="form-control form-control-sm input-imei-cart" data-idx="${idx}" placeholder="IMEI o número de serie" value="${escapeHtml(item.imei || '')}" required spellcheck="false">
                </div>
              </div>
            ` : ''}
          </div>
        </article>
      `;
    }).join('');

    // Listeners del carrito
    document.querySelectorAll('.btn-remove-item').forEach(btn => {
      if (!(btn instanceof HTMLButtonElement)) return;
      btn.addEventListener('click', (e) => {
        const idx = parseInt(btn.getAttribute('data-idx') ?? '');
        cart.splice(idx, 1);
        renderCart();
      });
    });

    document.querySelectorAll('.btn-inc-qty').forEach(btn => {
      if (!(btn instanceof HTMLButtonElement)) return;
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-idx') ?? '');
        if (cart[idx].esCombo && cart[idx].disponibilidadCombo != null && cart[idx].cantidad >= cart[idx].disponibilidadCombo) {
          showToast('Combo agotado', `Solo hay ${cart[idx].disponibilidadCombo} combo(s) armable(s) en esta sede.`, 'warning');
          return;
        }
        cart[idx].cantidad += 1;
        cart[idx].subtotal = cart[idx].precioModificado * cart[idx].cantidad;
        renderCart();
      });
    });

    document.querySelectorAll('.btn-dec-qty').forEach(btn => {
      if (!(btn instanceof HTMLButtonElement)) return;
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-idx') ?? '');
        cart[idx].cantidad -= 1;
        if (cart[idx].cantidad <= 0) {
          cart.splice(idx, 1);
        } else {
          cart[idx].subtotal = cart[idx].precioModificado * cart[idx].cantidad;
        }
        renderCart();
      });
    });

    document.querySelectorAll<HTMLInputElement>('.input-qty-cart').forEach(input => {
      input.addEventListener('change', (e) => {
        const idx = parseInt(input.getAttribute('data-idx') ?? '');
        let val = parseInt(eventField(e).value);
        if (isNaN(val) || val <= 0) {
          cart.splice(idx, 1);
        } else {
          if (cart[idx].esCombo && cart[idx].disponibilidadCombo != null && val > cart[idx].disponibilidadCombo) {
            showToast('Stock insuficiente', `Solo hay ${cart[idx].disponibilidadCombo} combo(s) armable(s).`, 'warning');
            val = cart[idx].disponibilidadCombo;
          }
          cart[idx].cantidad = val;
          cart[idx].subtotal = cart[idx].precioModificado * cart[idx].cantidad;
        }
        renderCart();
      });
    });

    document.querySelectorAll<HTMLInputElement>('.input-imei-cart').forEach(input => {
      input.addEventListener('change', (e) => {
        const idx = parseInt(input.getAttribute('data-idx') ?? '');
        const val = eventField(e).value.trim();

        if (val) {
          const duplicateIdx = cart.findIndex((item, i) => i !== idx && item.imei === val);
          if (duplicateIdx !== -1) {
            showToast('Serial Duplicado', `El serial/IMEI ${val} ya fue ingresado en otro artículo del carrito.`, 'warning');
            eventField(e).value = '';
            cart[idx].imei = '';
            return;
          }
        }
        cart[idx].imei = val;
      });
    });

    document.querySelectorAll('.btn-override-item').forEach(btn => {
      if (!(btn instanceof HTMLButtonElement)) return;
      btn.addEventListener('click', (e) => {
        const idx = parseInt(btn.getAttribute('data-idx') ?? '');
        const item = cart[idx];

        requireElement('override-item-idx', HTMLInputElement).value = String(idx);
        requireElement('override-nombre', HTMLInputElement).value = item.nombre;
        requireElement('override-precio-base', HTMLInputElement).value = formatter.format(item.precioBase);
        requireElement('override-precio-costo', HTMLInputElement).value = formatter.format(item.precioCosto);
        requireElement('override-descuento-pct', HTMLInputElement).value = String(item.descuentoPct);
        requireElement('override-precio-mod', HTMLInputElement).value = String(item.precioModificado);

        // Limpiar alertas
        requireElement('loss-warning', HTMLDivElement).classList.add('d-none');
        requireElement('discount-warning', HTMLDivElement).classList.add('d-none');
        requireElement('override-pin-wrapper', HTMLDivElement).classList.add('d-none');
        requireElement('override-pin-input', HTMLInputElement).value = '';

        modalOverride.show();
      });
    });

    // Calcular Totales
    let subtotalTotal = 0;
    let descTotal = 0;
    let ivaTotal = 0;

    cart.forEach(item => {
      const base = roundMoney(item.precioBase * item.cantidad);
      const net = roundMoney(item.precioModificado * item.cantidad);
      subtotalTotal = roundMoney(subtotalTotal + base);
      descTotal = roundMoney(descTotal + base - net);
      if (cobrarIva && item.tieneIVA !== false) ivaTotal = roundMoney(ivaTotal + roundMoney(net * ivaPct));
    });

    const totalFinal = roundMoney(subtotalTotal - descTotal + ivaTotal);

    updateTotals(subtotalTotal, descTotal, ivaTotal, totalFinal);
    updateCartCount();
  }

  function updateTotals(sub: number, desc: number, iva: number, tot: number) {
    saleTotals = { subtotal: sub, descuentoTotal: desc, iva, total: tot };
    const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });
    requireElement('pos-subtotal', HTMLElement).textContent = formatter.format(sub);
    requireElement('pos-descuento', HTMLElement).textContent = `-${formatter.format(desc)}`;
    
    // Cambiar la etiqueta de IVA dinámicamente según configuración
    const ivaValEl = requireElement('pos-iva', HTMLElement);
    if (ivaValEl && ivaValEl.previousElementSibling) {
      ivaValEl.previousElementSibling.textContent = cobrarIva ? `IVA (${(ivaPct * 100).toFixed(0)}%):` : 'IVA (Exento):';
    }
    
    requireElement('pos-iva', HTMLElement).textContent = formatter.format(iva);
    requireElement('pos-total', HTMLElement).textContent = formatter.format(tot);
  }

  // --- REGULAR PRICE OVERRIDE ---
  
  // Sincronizar inputs de precio modificado y % descuento en modal
  requireElement('override-descuento-pct', HTMLInputElement).addEventListener('input', (e) => {
    const idx = parseInt(requireElement('override-item-idx', HTMLInputElement).value);
    const item = cart[idx];
    const pct = parseFloat(eventField(e).value || '0');

    const mod = item.precioBase * (1 - pct / 100);
    requireElement('override-precio-mod', HTMLInputElement).value = mod.toFixed(2);
    checkOverrideAlerts(item, mod, pct);
  });

  requireElement('override-precio-mod', HTMLInputElement).addEventListener('input', (e) => {
    const idx = parseInt(requireElement('override-item-idx', HTMLInputElement).value);
    const item = cart[idx];
    const mod = parseFloat(eventField(e).value || '0');

    const pct = ((item.precioBase - mod) / item.precioBase) * 100;
    requireElement('override-descuento-pct', HTMLInputElement).value = pct.toFixed(1);
    checkOverrideAlerts(item, mod, pct);
  });

  function checkOverrideAlerts(item: CartItem, priceMod: number, pct: number) {
    const lossWarn = requireElement('loss-warning', HTMLDivElement);
    const discWarn = requireElement('discount-warning', HTMLDivElement);
    const pinWrapper = requireElement('override-pin-wrapper', HTMLDivElement);

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
      requireElement('override-pin-input', HTMLInputElement).required = true;
    } else {
      pinWrapper.classList.add('d-none');
      requireElement('override-pin-input', HTMLInputElement).required = false;
    }
  }

  // Submit Override Form
  requireElement('form-override', HTMLFormElement).addEventListener('submit', async (e) => {
    e.preventDefault();
    const idx = parseInt(requireElement('override-item-idx', HTMLInputElement).value);
    const item = cart[idx];
    const discountPct = parseFloat(requireElement('override-descuento-pct', HTMLInputElement).value || '0');
    const precioModificado = parseFloat(requireElement('override-precio-mod', HTMLInputElement).value);
    const pin = requireElement('override-pin-input', HTMLInputElement).value;

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

  const renderPaymentInputs = () => {
    const wrapper = requireElement('checkout-payment-methods', HTMLDivElement);
    wrapper.innerHTML = mediosPagoActivos.map((medio) => `
      <div class="pos-payment-method ${medio.id === 'efectivo' ? 'is-selected' : ''}">
        <button type="button" class="pos-payment-choice" data-payment="${escapeHtml(medio.id)}" aria-pressed="${medio.id === 'efectivo'}" aria-controls="pay-${escapeHtml(medio.id)}"><i class="ti ${medio.id === 'efectivo' ? 'ti-cash' : medio.id === 'tarjeta' ? 'ti-credit-card' : 'ti-wallet'}" aria-hidden="true"></i><span class="pos-payment-label">${escapeHtml(medio.nombre)}</span><i class="ti ti-check pos-payment-check" aria-hidden="true"></i></button>
        <div class="pos-payment-amount" ${medio.id === 'efectivo' ? '' : 'hidden'}>
        <label class="form-label" for="pay-${escapeHtml(medio.id)}">${medio.id === 'efectivo' ? 'Efectivo recibido' : 'Monto'} (COP)</label>
        <input type="number" id="pay-${escapeHtml(medio.id)}" class="form-control pay-metodo" data-metodo="${escapeHtml(medio.id)}" min="0" step="0.01" value="0">
        ${medio.id === 'sistecredito' || medio.recaudoDiferido ? '<div class="form-hint">Sistecredito liquida este valor después; no entra a Caja hoy.</div>' : ''}
        </div>
      </div>
    `).join('');
    wrapper.querySelectorAll('.pay-metodo').forEach((input) => {
      input.addEventListener('input', updateChangeCalculations);
    });
    wrapper.querySelectorAll('[data-payment]').forEach(button => button.addEventListener('click', () => {
      const method = button.closest('.pos-payment-method');
      if (!(method instanceof HTMLElement)) return;
      const selected = !method.classList.contains('is-selected');
      method.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
      requireSelector('.pos-payment-amount', HTMLElement, method).hidden = !selected;
      const input = requireSelector('input', HTMLInputElement, method);
      if (selected) input.focus();
      else { input.value = '0'; updateChangeCalculations(); }
    }));
  };
  renderPaymentInputs();

  // Botón Abrir checkout
  requireElement('pos-checkout-btn', HTMLButtonElement).addEventListener('click', async () => {
    // Validar si productos con IMEI tienen IMEI ingresado
    const imeis = [];
    for (const item of cart) {
      if (item.tieneNumeroSerie) {
        if (!item.imei) {
          showToast('IMEI Requerido', `Por favor, ingrese el IMEI para: ${escapeHtml(item.nombre)}`, 'warning');
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

    try {
      const configActual = await apiFetch<PosConfig>('/config/sistema');
      if (Array.isArray(configActual?.mediosPago)) {
        mediosPagoActivos = configActual?.mediosPago.filter((medio) => medio?.id && medio.activo !== false);
      }
    } catch (error) {
      console.warn('No se pudo actualizar la lista de medios de pago.', error);
    }
    const signature = JSON.stringify({ cart, mediosPagoActivos });
    const resetPayment = signature !== checkoutSignature;
    if (resetPayment) renderPaymentInputs();

    // Calcular montos de checkout
    const totalStr = requireElement('pos-total', HTMLElement).textContent;
    requireElement('checkout-monto-total', HTMLDivElement).textContent = totalStr;
    requireElement('checkout-submit-btn', HTMLButtonElement).textContent = `Crear venta · ${totalStr}`;

    // Resetear form de pagos
    if (resetPayment) {
      requireElement('form-checkout', HTMLFormElement).reset();
      actualizarClienteCheckout(clientes.find(esConsumidorFinal));
      checkoutSignature = signature;
    }
    requireElement('checkout-cambio', HTMLDivElement).textContent = '$ 0';
    requireElement('checkout-cambio', HTMLDivElement).classList.remove('text-danger');
    requireElement('checkout-cambio', HTMLDivElement).classList.add('text-success');

    updateChangeCalculations();
    modalCheckout.show();
  });

  requireElement('checkout-credito', HTMLInputElement).addEventListener('change', (e) => {
    const isCredito = requireElement('checkout-credito', HTMLInputElement).checked;
    const labelCambio = requireElement('checkout-label-cambio', HTMLDivElement);
    const cambioVal = requireElement('checkout-cambio', HTMLDivElement);

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

  requireElement('checkout-cliente', HTMLInputElement).addEventListener('change', async (e) => {
    const clienteId = eventField(e).value;
    const container = requireElement('checkout-trade-in-select-container', HTMLDivElement);
    const wrapper = requireElement('trade-in-payment-wrapper', HTMLDivElement);
    const input = requireElement('pay-trade-in', HTMLInputElement);
    
    // Reset trade-in values
    container.innerHTML = '';
    container.classList.add('d-none');
    wrapper.classList.add('d-none');
    input.value = String(0);
    updateChangeCalculations();

    if (!clienteId) return;

    try {
      const tradeIns = await apiFetch<TradeInPos[]>(`/trade-in?cliente=${clienteId}`);
      const unassociated = (tradeIns ?? []).filter(ti => !ti.ventaId);
      if (unassociated.length > 0) {
        container.classList.remove('d-none');
        const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });
        container.innerHTML = `
          <label class="form-label text-success fw-bold">Saldo a favor de Trade-In Disponible</label>
          ${unassociated.map((ti, index) => `
            <label class="form-check text-success">
              <input class="form-check-input chk-apply-tradein" type="checkbox" data-id="${ti.id}" data-val="${ti.valoracion}" data-desc="${escapeHtml(ti.marca)} ${escapeHtml(ti.modelo)} - IMEI: ${escapeHtml(ti.imei)}">
              <span class="form-check-label">${escapeHtml(ti.marca)} ${escapeHtml(ti.modelo)} (${formatter.format(Number(ti.valoracion))})</span>
            </label>
          `).join('')}
        `;

        // Listeners for checkbox changes
        document.querySelectorAll<HTMLInputElement>('.chk-apply-tradein').forEach(chk => {
          chk.addEventListener('change', () => {
            let totalVal = 0;
            let descList: string[] = [];
            document.querySelectorAll<HTMLInputElement>('.chk-apply-tradein:checked').forEach(c => {
              totalVal += parseFloat(String(c.dataset.val));
              descList.push(c.dataset.desc ?? '');
            });

            if (totalVal > 0) {
              wrapper.classList.remove('d-none');
              input.value = String(totalVal);
              requireElement('trade-in-payment-label', HTMLDivElement).textContent = `Aplicado por: ${descList.join(', ')}`;
            } else {
              wrapper.classList.add('d-none');
              input.value = String(0);
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
    const total = saleTotals.total;

    const pagosNormales = [...document.querySelectorAll<HTMLInputElement>('.pay-metodo')]
      .reduce((sum, input) => sum + parseFloat(String(input.value || '0')), 0);
    const tradeIn = parseFloat(requireElement('pay-trade-in', HTMLInputElement).value || '0');

    const totalPagado = pagosNormales + tradeIn;
    const isCredito = requireElement('checkout-credito', HTMLInputElement).checked;
    
    const cambioVal = requireElement('checkout-cambio', HTMLDivElement);
    const cambioLabel = requireElement('checkout-label-cambio', HTMLDivElement);
    const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

    if (isCredito) {
      const saldoCredito = total - totalPagado;
      cambioLabel.textContent = 'Saldo a crédito:';
      if (saldoCredito < 0) {
        cambioVal.textContent = formatter.format(0);
      } else {
        cambioVal.textContent = formatter.format(saldoCredito);
      }
    } else {
      const cambio = totalPagado - total;
      cambioLabel.textContent = cambio < 0 ? 'Falta por pagar:' : 'Cambio a devolver:';
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
  requireElement('form-checkout', HTMLFormElement).addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = requireElement('checkout-submit-btn', HTMLButtonElement);

    // Totales
    const { total, subtotal, descuentoTotal, iva } = saleTotals;

    const isCredito = requireElement('checkout-credito', HTMLInputElement).checked;
    const clienteId = requireElement('checkout-cliente', HTMLInputElement).value;
    const clienteSel = clientes.find((c) => String(c.id) === String(clienteId));
    const clienteEsConsumidorFinal = !clienteId ||
      clienteSel?.nombre === 'Consumidor Final' ||
      ['222222222', '222222222-0', '222222222222'].includes(clienteSel?.documento ?? '');

    const pagoSistecredito = parseFloat(document.querySelector<HTMLInputElement>('#pay-sistecredito')?.value || '0');
    if (isCredito && clienteEsConsumidorFinal && pagoSistecredito <= 0) {
      showToast('Venta a Crédito', 'Debe seleccionar un cliente registrado para realizar ventas a crédito.', 'warning');
      return;
    }

    // Pagos
    const pagos: PagoInput[] = [];
    const tradeIn = parseFloat(requireElement('pay-trade-in', HTMLInputElement).value || '0');

    document.querySelectorAll<HTMLInputElement>('.pay-metodo').forEach((input) => {
      const monto = parseFloat(String(input.value || '0'));
      if (monto > 0) pagos.push({ metodo: input.dataset.metodo || '', monto });
    });
    if (tradeIn > 0) pagos.push({ metodo: 'trade_in', monto: tradeIn });

    const totalPagado = pagos.reduce((acc, curr) => acc + curr.monto, 0);

    if (!isCredito && totalPagado < total) {
      showToast('Pago Insuficiente', 'El monto pagado es insuficiente.', 'error');
      return;
    }

    // Verificar si algún item del carrito requiere PIN y consolidarlo
    let pinAdmin: string | null = null;
    cart.forEach(item => {
      if (item.pinAdmin) pinAdmin = item.pinAdmin;
    });

    const body: SaleBody = {
      clienteId: clienteId || null,
      sedeId: currentSedeId,
      subtotal,
      descuentoTotal,
      iva,
      total,
      esCredito: isCredito,
      observaciones: requireElement('checkout-observaciones', HTMLTextAreaElement).value,
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
    const signature = JSON.stringify({ ...body, pinAdmin: null });
    if (!pendingSale || pendingSale.signature !== signature) {
      pendingSale = { signature, key: (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID() : `pos-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` };
    }
    body.idempotencyKey = pendingSale.key;

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status"></span>Registrando…`;

    try {
      const res = await apiFetch<VentaCreada>('/ventas', {
        method: 'POST',
        body: JSON.stringify(body)
      });

      if (!res) throw new Error("No se recibió el resultado de la venta.");
      // Si veníamos de aprobar una cotización, marcarla en BD
      if (window.pendingCotizacionAprobacionId) {
        await apiFetch(`/cotizaciones/${window.pendingCotizacionAprobacionId}/aprobar`, {
          method: 'POST',
          body: JSON.stringify({ ventaId: res.ventaId })
        }).catch(err => console.error('Error aprobando cotización:', err));
        delete window.pendingCotizacionAprobacionId;
      }

      modalCheckout.hide();
      
      // Mostrar ticket para impresión
      const itemsVendidos = [...cart];
      const savedItems = [...(res.items || [])];
      const canonicalItems = itemsVendidos.map((item) => {
        const index = savedItems.findIndex((saved) => String(saved.productoId) === String(item.productoId) && Number(saved.cantidad) === Number(item.cantidad));
        return { ...item, ...(index >= 0 ? savedItems.splice(index, 1)[0] : {}) };
      });
      renderPrintReceipt(res, { ...body, ...res, items: body.items }, canonicalItems);

      // Limpiar carrito
      cart = [];
      pendingSale = null;
      checkoutSignature = null;
      setMobileCart(false);
      renderCart();

      // Forzar impresión
      window.print();
    } catch (err) {
      showToast('Error', errorMessage(err), 'error');
      if (err && typeof err === 'object' && 'code' in err && err.code === 'CAJA_CIERRE_PENDIENTE') {
        modalCheckout.hide();
        await loadAndRenderPOS();
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = `Crear venta · ${requireElement('checkout-monto-total', HTMLDivElement).textContent}`;
    }
  });

  function renderPrintReceipt(res: VentaCreada, body: SaleBody, items: CartItem[]) {
    const area = requireElement('print-receipt-area', HTMLDivElement);
    const sedeActual = sedes.find(s => s.id === currentSedeId);
    const cliente = body.clienteId
      ? clientes.find((c) => String(c.id) === String(body.clienteId))
      : null;

    area.innerHTML = renderPosReceipt({
      empresaConfig,
      sedeNombre: sedeActual?.nombre || usuario.sedeNombre || '',
      sedeDireccion: sedeActual?.direccion || '',
      cajeroNombre: usuario.nombre,
      clienteNombre: cliente?.nombre || 'Consumidor Final',
      clienteDocumento: cliente?.documento || '222222222',
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
      cambio: body.cambio,
      esCredito: body.esCredito
    });
  }

  if (isAdmin) {
    const selectPosSede = requireElement('select-pos-sede', HTMLSelectElement);
    if (selectPosSede) {
      selectPosSede.addEventListener('change', (e) => {
        currentSedeId = eventField(e).value;
        cart = [];
        loadAndRenderPOS();
      });
    }
  }
}

  await loadAndRenderPOS();
  bindQuickAction(container, 'venta', () => document.getElementById('pos-search-input')?.focus());
}

export function destroyPos() {
  destroyBarcodeScanner();
  if (posKeydownHandler) {
    document.removeEventListener('keydown', posKeydownHandler);
    posKeydownHandler = null;
  }
}
