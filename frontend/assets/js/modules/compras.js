import { apiFetch } from '../api.js';
import { getUsuario } from '../auth.js';
import { erpAction, erpActions } from '../utils/action-buttons.js';
import { erpHeader } from '../utils/module-shell.js';
import { initBarcodeScanner, destroyBarcodeScanner } from '../utils/barcode.js';
import { showToast } from '../utils/toast.js';

let comprasKeydownHandler = null;

export async function initCompras(container) {
  destroyBarcodeScanner();
  const usuario = getUsuario();
  const isAdminOrContador = ['admin', 'superadmin', 'contador'].includes(usuario.rol);
  const isAdminOrGerente = ['admin', 'superadmin', 'gerente_sede'].includes(usuario.rol);

  let compras = [];
  let proveedores = [];
  let productos = [];
  let sedes = [];
  let cartItems = []; // Carro para crear orden de compra

  async function loadInitialData() {
    try {
      compras = await apiFetch('/compras');
      proveedores = await apiFetch('/proveedores');
      productos = await apiFetch('/productos').then(prods => prods.filter(p => p.activo !== false));
      sedes = await apiFetch('/config/sedes').catch(() => []);
    } catch (e) {
      console.error('Error al precargar datos de compras:', e);
    }
  }

  await loadInitialData();

  const defaultSedeId = usuario.sedeId || (sedes[0]?.id || '');

  const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

  const FUENTE_FONDOS_LABELS = {
    caja_efectivo: 'Caja (efectivo)',
    efectivo_externo: 'Dinero externo',
    transferencia_empresa: 'Transferencia empresa',
    otro: 'Otro'
  };

  function badgeOrigen(fuente, monto, extraTitle = '') {
    const label = FUENTE_FONDOS_LABELS[fuente] || fuente;
    const title = monto != null
      ? `${label} — ${formatter.format(monto)}${extraTitle ? ` · ${extraTitle}` : ''}`
      : label;
    return `<span class="compras-origen-badge compras-origen-badge--${fuente}" title="${title}">${label}</span>`;
  }

  function renderOrigenPagoCell(pagos, estadoPago) {
    if (!pagos || pagos.length === 0) {
      if (estadoPago === 'pagado' || estadoPago === 'abono_parcial') {
        return '<span class="compras-sin-detalle" title="Pago anterior al registro de origen">Sin detalle</span>';
      }
      return '<span class="compras-sin-detalle">Sin pagos</span>';
    }
    return `<div class="compras-origen-stack">${pagos.map((p) => {
      const extra = [p.pagadoPor, p.referencia].filter(Boolean).join(' · ');
      return badgeOrigen(p.fuenteFondos, parseFloat(p.monto), extra);
    }).join('')}</div>`;
  }

  const ORIGEN_LEYENDA = [
    { key: 'caja_efectivo', desc: 'Efectivo del turno en caja' },
    { key: 'transferencia_empresa', desc: 'Cuenta bancaria de la empresa' },
    { key: 'efectivo_externo', desc: 'Tercero, socio o caja menor' },
    { key: 'otro', desc: 'Otro medio no clasificado' }
  ];

  function renderOrigenLeyendaHtml() {
    return ORIGEN_LEYENDA.map((o) => `
      <div class="compras-origen-key compras-origen-key--${o.key}">
        <span class="compras-origen-key__dot" aria-hidden="true"></span>
        <div class="compras-origen-key__text">
          <span class="compras-origen-key__label">${FUENTE_FONDOS_LABELS[o.key]}</span>
          <span class="compras-origen-key__desc">${o.desc}</span>
        </div>
      </div>
    `).join('');
  }

  function renderHistorialPagosHtml(pagos) {
    if (!pagos || pagos.length === 0) {
      return `<p class="text-secondary small mb-0">Aún no hay pagos registrados para esta orden.</p>`;
    }
    return `
      <div class="table-responsive compras-pagos-table">
        <table class="table table-sm compras-table mb-0">
          <thead>
            <tr>
              <th>Fecha</th>
              <th class="text-end">Monto</th>
              <th>Origen del dinero</th>
              <th>Pagado por</th>
              <th>Referencia</th>
              <th>Registró</th>
            </tr>
          </thead>
          <tbody>
            ${pagos.map((p) => `
              <tr>
                <td class="text-nowrap">${new Date(p.createdAt).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}</td>
                <td class="text-end fw-bold text-danger">${formatter.format(p.monto)}</td>
                <td>${badgeOrigen(p.fuenteFondos)}</td>
                <td class="small">${p.pagadoPor || '—'}</td>
                <td class="small text-secondary">${p.referencia || '—'}</td>
                <td class="small">${p.usuario ? p.usuario.nombre : '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="container-xl erp-module compras-module">
      ${erpHeader({
        eyebrow: 'Abastecimiento',
        title: 'Compras e inventario entrante',
        subtitle: 'Órdenes de compra, recepción de mercancía y cuentas por pagar'
      })}

      <div class="card compras-shell mb-3 d-print-none">
        <div class="card-header compras-tabs-head bg-transparent border-bottom">
          <ul class="nav nav-tabs card-header-tabs compras-tabs" data-bs-toggle="tabs" role="tablist">
            <li class="nav-item" role="presentation">
              <a href="#tab-ordenes-compra" class="nav-link active" data-bs-toggle="tab" aria-selected="true" role="tab">
                <i class="ti ti-receipt me-1"></i> Historial de Órdenes
              </a>
            </li>
            ${isAdminOrContador ? `
              <li class="nav-item" role="presentation">
                <a href="#tab-nueva-oc" class="nav-link" data-bs-toggle="tab" aria-selected="false" role="tab" tabindex="-1">
                  <i class="ti ti-plus me-1"></i> Nueva Orden (OC)
                </a>
              </li>
            ` : ''}
            <li class="nav-item" role="presentation">
              <a href="#tab-cuentas-pagar" class="nav-link" data-bs-toggle="tab" aria-selected="false" role="tab" tabindex="-1">
                <i class="ti ti-wallet me-1"></i> Cuentas por Pagar (CPP)
              </a>
            </li>
          </ul>
        </div>
        <div class="card-body">
          <div class="tab-content">
            <!-- TAB 1: HISTORIAL DE ÓRDENES -->
            <div class="tab-pane active show" id="tab-ordenes-compra" role="tabpanel">
              <div class="compras-oc-layout">
                <div id="compras-oc-summary" class="compras-summary-grid"></div>

                <aside class="compras-origen-panel d-print-none" aria-label="Leyenda de origen del dinero">
                  <h3 class="compras-origen-panel__title">Origen del dinero en pagos</h3>
                  <p class="compras-origen-panel__hint">Al abonar una orden, indique si el pago sale de caja o de la empresa.</p>
                  <div class="compras-origen-keys">
                    ${renderOrigenLeyendaHtml()}
                  </div>
                </aside>

                <div class="compras-table-panel">
                  <div class="compras-table-panel__head">
                    <h3 class="compras-table-panel__title">Órdenes de compra</h3>
                    <span class="compras-table-panel__count" id="compras-oc-count"></span>
                  </div>
                  <div class="compras-table-scroll">
                    <table class="table compras-table mb-0">
                      <thead>
                        <tr>
                          <th>Orden</th>
                          <th>Fecha</th>
                          <th>Proveedor</th>
                          <th>Sede</th>
                          <th class="text-end">Total</th>
                          <th>Estado</th>
                          <th>Origen del pago</th>
                          <th class="text-end compras-th-actions">Acciones</th>
                        </tr>
                      </thead>
                      <tbody id="compras-table-body"></tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            <!-- TAB 2: NUEVA ORDEN (OC) -->
            ${isAdminOrContador ? `
              <div class="tab-pane" id="tab-nueva-oc" role="tabpanel">
                <form id="form-nueva-oc" class="oc-form">
                  <header class="oc-form__header">
                    <p class="oc-form__eyebrow">Orden de compra</p>
                    <h3 class="oc-form__title">Nueva orden</h3>
                    <p class="oc-form__lede">Proveedor, productos y emitir. El stock entra al <strong>recibir</strong> la mercancía.</p>
                  </header>

                  <section class="oc-section" aria-labelledby="oc-sec-proveedor">
                    <header class="oc-section__head">
                      <span class="oc-section__mark" aria-hidden="true">01</span>
                      <div>
                        <h4 id="oc-sec-proveedor" class="oc-section__title">Proveedor y destino</h4>
                        <p class="oc-section__hint">Proveedor, sede y fecha de llegada.</p>
                      </div>
                    </header>
                    <div class="oc-field-grid">
                      <div class="oc-field">
                        <label class="form-label required" for="oc-proveedor">Proveedor</label>
                        <select id="oc-proveedor" class="form-select" required>
                          <option value="">Seleccionar proveedor</option>
                          ${proveedores.map(p => `<option value="${p.id}">${p.nombre} (NIT: ${p.nit})</option>`).join('')}
                        </select>
                      </div>
                      <div class="oc-field">
                        <label class="form-label required" for="oc-sede">Sede destino</label>
                        <select id="oc-sede" class="form-select" required>
                          ${sedes.length === 0 ? '<option value="">Sin sedes configuradas</option>' : sedes.map(s => `<option value="${s.id}" ${s.id === defaultSedeId ? 'selected' : ''}>${s.nombre}</option>`).join('')}
                        </select>
                      </div>
                      <div class="oc-field">
                        <label class="form-label" for="oc-fecha-esperada">Fecha esperada</label>
                        <input type="date" id="oc-fecha-esperada" class="form-control">
                      </div>
                      <div class="oc-field">
                        <label class="form-label" for="oc-observaciones">Observaciones</label>
                        <input type="text" id="oc-observaciones" class="form-control" placeholder="Pedido urgente, referencia factura…">
                      </div>
                    </div>
                  </section>

                  <section class="oc-section" aria-labelledby="oc-sec-productos">
                    <header class="oc-section__head">
                      <span class="oc-section__mark" aria-hidden="true">02</span>
                      <div>
                        <h4 id="oc-sec-productos" class="oc-section__title">Productos</h4>
                        <p class="oc-section__hint">F2 para escanear, o busque y agregue.</p>
                      </div>
                    </header>

                    <div class="oc-add-panel">
                      <div class="oc-field oc-add-panel__scan">
                        <label class="form-label d-flex align-items-center gap-2" for="oc-scan">
                          <span>Escanear código</span>
                          <kbd class="small px-1 py-0" title="Atajo de teclado">F2</kbd>
                        </label>
                        <div class="input-group">
                          <span class="input-group-text"><i class="ti ti-barcode" aria-hidden="true"></i></span>
                          <input type="text" id="oc-scan" class="form-control" placeholder="Apunte el lector y escanee…" autocomplete="off" spellcheck="false" inputmode="none">
                        </div>
                      </div>

                      <div class="oc-add-panel__compose">
                        <div class="oc-field oc-field--picker">
                          <label class="form-label" for="btn-oc-buscar-producto">Producto</label>
                          <div class="oc-product-picker" id="oc-product-picker">
                            <input type="hidden" id="oc-producto-select" value="" autocomplete="off">
                            <div class="oc-product-picker__control input-group">
                              <span class="input-group-text" aria-hidden="true"><i class="ti ti-package"></i></span>
                              <input
                                type="text"
                                id="oc-producto-display"
                                class="form-control"
                                placeholder="Ningún producto seleccionado"
                                readonly
                                tabindex="-1"
                              >
                              <button type="button" class="btn btn-outline-primary" id="btn-oc-buscar-producto" title="Buscar producto">
                                <i class="ti ti-search me-1" aria-hidden="true"></i>Buscar
                              </button>
                              <button type="button" class="btn btn-outline-secondary oc-product-picker__clear" id="oc-producto-clear" title="Limpiar" aria-label="Limpiar producto" hidden>
                                <i class="ti ti-x" aria-hidden="true"></i>
                              </button>
                            </div>
                          </div>
                        </div>
                        <div class="oc-field oc-field--cost">
                          <label class="form-label" for="oc-producto-costo">Costo</label>
                          <div class="input-group">
                            <span class="input-group-text">$</span>
                            <input type="number" id="oc-producto-costo" class="form-control" placeholder="0" min="0" step="1" inputmode="numeric">
                          </div>
                        </div>
                        <div class="oc-field oc-field--qty">
                          <label class="form-label" for="oc-producto-cantidad">Cant.</label>
                          <input type="number" id="oc-producto-cantidad" class="form-control" value="1" min="1" inputmode="numeric">
                        </div>
                        <div class="oc-field oc-field--action">
                          <button type="button" id="btn-add-item-oc" class="btn btn-primary">
                            <i class="ti ti-plus" aria-hidden="true"></i>
                            <span>Agregar</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div class="oc-cart">
                      <h5 class="oc-cart__title">Artículos de la orden</h5>
                      <div class="table-responsive">
                        <table class="table table-vcenter oc-cart-table mb-0">
                          <thead>
                            <tr>
                              <th>Producto</th>
                              <th class="text-center" style="width: 110px;">Cantidad</th>
                              <th class="text-end" style="width: 150px;">Costo unit.</th>
                              <th class="text-end" style="width: 140px;">Total</th>
                              <th style="width: 48px;"></th>
                            </tr>
                          </thead>
                          <tbody id="oc-items-body">
                            <tr><td colspan="5" class="text-center text-secondary py-2">El carrito está vacío. Agregue productos arriba.</td></tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </section>

                  <footer class="oc-form__footer">
                    <div class="oc-form__total">
                      <span class="oc-form__total-label">Total orden</span>
                      <strong id="oc-cart-total" class="oc-form__total-value">$ 0</strong>
                    </div>
                    <button type="submit" class="btn btn-primary oc-form__submit">
                      <i class="ti ti-clipboard-check me-1" aria-hidden="true"></i>Emitir orden de compra
                    </button>
                  </footer>
                </form>
              </div>
            ` : ''}

            <!-- TAB 3: CUENTAS POR PAGAR (CPP) -->
            <div class="tab-pane" id="tab-cuentas-pagar" role="tabpanel">
              <div class="erp-list-workspace">
              <div class="card erp-filter-card">
                <div class="card-body py-2">
                  <div class="row g-2 align-items-end">
                    <div class="col-md-4">
                      <label class="form-label mb-1">Antigüedad</label>
                      <select id="cpp-filtro-mora" class="form-select form-select-sm">
                        <option value="">Todas las CPP</option>
                        <option value="al_dia">Al día</option>
                        <option value="0-30">Vencida 0-30 días</option>
                        <option value="30-60">Vencida 30-60 días</option>
                        <option value="60-90">Vencida 60-90 días</option>
                        <option value="+90">Vencida +90 días</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
              <div class="card erp-table-panel">
                <div class="table-responsive">
                <table class="table table-vcenter card-table table-hover mb-0">
                  <thead>
                    <tr>
                      <th>Factura / OC No.</th>
                      <th>Proveedor</th>
                      <th>Fecha Vencimiento</th>
                      <th class="text-center">Días</th>
                      <th class="text-end">Total Factura</th>
                      <th class="text-end">Saldo Pendiente</th>
                      <th class="text-center">Estado Pago</th>
                      <th class="text-end">Acciones</th>
                    </tr>
                  </thead>
                  <tbody id="cpp-table-body">
                    <!-- Dinámico -->
                  </tbody>
                </table>
                </div>
              </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal Buscar producto (Nueva OC) -->
    <div class="modal modal-blur fade" id="modal-oc-producto" tabindex="-1" role="dialog" aria-labelledby="modal-oc-producto-title" aria-hidden="true">
      <div class="modal-dialog modal-xl modal-dialog-centered" role="document">
        <div class="modal-content oc-product-modal">
          <div class="modal-header oc-product-modal__header">
            <div>
              <h5 class="modal-title" id="modal-oc-producto-title">Buscar producto</h5>
              <p class="oc-product-modal__lede mb-0">Busque → fije costo → agregue. El modal sigue abierto para cargar varios.</p>
            </div>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>
          <div class="modal-body oc-product-modal__body p-0">
            <aside class="oc-product-modal__cats" aria-label="Categorías">
              <p class="oc-product-modal__rail-label">Categorías</p>
              <div id="oc-producto-chips" class="oc-product-modal__cat-list" role="list"></div>
            </aside>
            <div class="oc-product-modal__main">
              <div class="oc-product-modal__search input-group">
                <span class="input-group-text"><i class="ti ti-search" aria-hidden="true"></i></span>
                <input
                  type="search"
                  id="oc-producto-search"
                  class="form-control"
                  placeholder="Nombre o código…"
                  autocomplete="off"
                  spellcheck="false"
                >
              </div>
              <div id="oc-producto-list" class="oc-product-modal__list" role="listbox"></div>
            </div>
            <aside class="oc-product-modal__added" aria-label="Productos en esta orden">
              <div class="oc-product-modal__ticket-head">
                <p class="oc-product-modal__rail-label mb-0">En esta orden</p>
                <span class="oc-product-modal__ticket-hint" id="oc-modal-ticket-hint">Vacía</span>
              </div>
              <div class="oc-product-modal__compose" id="oc-modal-compose" hidden>
                <div class="oc-product-modal__compose-head">
                  <div class="oc-product-modal__compose-name">
                    <span class="oc-product-modal__compose-label">Para agregar</span>
                    <strong id="oc-modal-prod-name">—</strong>
                  </div>
                  <button type="button" class="btn btn-ghost-secondary btn-icon btn-sm oc-product-modal__compose-cancel" id="oc-modal-compose-cancel" aria-label="Cancelar selección" title="Cancelar">
                    <i class="ti ti-x" aria-hidden="true"></i>
                  </button>
                </div>
                <div class="oc-product-modal__compose-fields">
                  <div class="oc-field oc-field--cost">
                    <label class="form-label" for="oc-modal-costo">Costo</label>
                    <div class="input-group">
                      <span class="input-group-text">$</span>
                      <input type="number" id="oc-modal-costo" class="form-control" placeholder="0" min="0" step="1" inputmode="numeric">
                    </div>
                  </div>
                  <div class="oc-field oc-field--qty">
                    <label class="form-label" for="oc-modal-cant">Cant.</label>
                    <input type="number" id="oc-modal-cant" class="form-control" value="1" min="1" inputmode="numeric">
                  </div>
                  <div class="oc-field oc-field--action">
                    <button type="button" id="oc-modal-add" class="btn btn-primary">
                      <i class="ti ti-plus" aria-hidden="true"></i>
                      <span>Agregar</span>
                    </button>
                  </div>
                </div>
              </div>
              <div id="oc-modal-cart-list" class="oc-product-modal__added-list"></div>
            </aside>
          </div>
          <div class="modal-footer oc-product-modal__footer">
            <div class="oc-product-modal__cart-summary" id="oc-modal-cart-summary" aria-live="polite">
              0 en la orden · $ 0
            </div>
            <button type="button" class="btn btn-primary" data-bs-dismiss="modal" id="oc-modal-listo">Listo</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal Recepción de Mercancías -->
    <div class="modal modal-blur fade" id="modal-recibir-mercancia" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-xl modal-dialog-centered" role="document">
        <div class="modal-content" id="recibir-mercancia-content">
          <!-- Dinámico -->
        </div>
      </div>
    </div>

    <!-- Modal Devolución de Mercancías -->
    <div class="modal modal-blur fade" id="modal-devolver-mercancia" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-xl modal-dialog-centered" role="document">
        <div class="modal-content" id="devolver-mercancia-content">
          <!-- Dinámico -->
        </div>
      </div>
    </div>

    <!-- Modal Ver Detalle Compra -->
    <div class="modal modal-blur fade" id="modal-ver-compra" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-centered" role="document">
        <div class="modal-content" id="ver-compra-content">
          <!-- Dinámico -->
        </div>
      </div>
    </div>

    <!-- Modal Registrar Pago Cuenta -->
    <div class="modal modal-blur fade" id="modal-pagar-cuenta" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered" role="document">
        <div class="modal-content">
          <form id="form-pagar-cuenta">
            <input type="hidden" id="pago-compra-id">
            <div class="modal-header">
              <h5 class="modal-title">Registrar Abono a Proveedor</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              <div class="mb-3">
                <label class="form-label">Proveedor</label>
                <input type="text" id="pago-prov-nombre" class="form-control-plaintext fw-bold" readonly>
              </div>
              <div class="row">
                <div class="col-6 mb-3">
                  <label class="form-label">Total Compra</label>
                  <input type="text" id="pago-total-compra" class="form-control-plaintext" readonly>
                </div>
                <div class="col-6 mb-3">
                  <label class="form-label">Saldo Pendiente</label>
                  <input type="text" id="pago-saldo-actual" class="form-control-plaintext text-danger" readonly>
                </div>
              </div>
              <div class="mb-3">
                <label class="form-label required">Monto del Pago / Abono ($ COP)</label>
                <input type="number" id="pago-monto-input" class="form-control" required min="1">
              </div>
              <div class="mb-3">
                <label class="form-label required">Origen del dinero</label>
                <select id="pago-fuente-fondos" class="form-select" required>
                  <option value="caja_efectivo">Caja — efectivo del turno</option>
                  <option value="efectivo_externo">Dinero externo / tercero</option>
                  <option value="transferencia_empresa" selected>Transferencia de la empresa</option>
                  <option value="otro">Otro</option>
                </select>
                <div id="pago-hint-caja" class="form-hint text-secondary small d-none">Se descontará de la caja abierta en esta sede.</div>
                <div id="pago-hint-externo" class="form-hint text-secondary small">No afecta el efectivo del turno en caja.</div>
              </div>
              <div class="mb-3" id="pago-pagado-por-wrap">
                <label class="form-label">Pagado por / responsable</label>
                <input type="text" id="pago-pagado-por" class="form-control" placeholder="Ej: César, socio, caja menor empresa…">
              </div>
              <div class="mb-3">
                <label class="form-label">Referencia (opcional)</label>
                <input type="text" id="pago-referencia" class="form-control" placeholder="Ej: Transferencia Bancolombia ref. 12345">
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-link link-secondary" data-bs-dismiss="modal">Cancelar</button>
              <button type="submit" class="btn btn-primary ms-auto">Registrar Pago</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  const tbodyCompras = document.getElementById('compras-table-body');
  const tbodyCpp = document.getElementById('cpp-table-body');
  const modalRecibir = new bootstrap.Modal(document.getElementById('modal-recibir-mercancia'));
  const modalDevolver = new bootstrap.Modal(document.getElementById('modal-devolver-mercancia'));
  const modalVer = new bootstrap.Modal(document.getElementById('modal-ver-compra'));
  const modalPagar = new bootstrap.Modal(document.getElementById('modal-pagar-cuenta'));

  function estadoMercPill(estado) {
    const map = {
      pendiente: 'compras-pill--warn',
      recibida: 'compras-pill--ok',
      parcial: 'compras-pill--info',
      cancelada: 'compras-pill--muted'
    };
    const labels = { pendiente: 'Merc. pendiente', recibida: 'Recibida', parcial: 'Parcial', cancelada: 'Cancelada' };
    return `<span class="compras-pill ${map[estado] || 'compras-pill--muted'}">${labels[estado] || estado}</span>`;
  }

  function estadoPagoPill(estadoPago) {
    const map = {
      pagado: 'compras-pill--ok',
      abono_parcial: 'compras-pill--warn',
      pendiente: 'compras-pill--danger'
    };
    const labels = { pagado: 'Pagado', abono_parcial: 'Abono parcial', pendiente: 'Por pagar' };
    return `<span class="compras-pill ${map[estadoPago] || 'compras-pill--muted'}">${labels[estadoPago] || estadoPago}</span>`;
  }

  function renderComprasSummary() {
    const summaryEl = document.getElementById('compras-oc-summary');
    const countEl = document.getElementById('compras-oc-count');
    if (!summaryEl) return;

    const porFuente = { caja_efectivo: 0, efectivo_externo: 0, transferencia_empresa: 0, otro: 0 };
    let totalPagado = 0;
    let pendientePago = 0;

    compras.forEach((c) => {
      pendientePago += parseFloat(c.saldoPendiente || 0);
      (c.pagos || []).forEach((p) => {
        const m = parseFloat(p.monto);
        totalPagado += m;
        if (porFuente[p.fuenteFondos] !== undefined) porFuente[p.fuenteFondos] += m;
      });
    });

    if (countEl) {
      countEl.textContent = `${compras.length} orden${compras.length === 1 ? '' : 'es'}`;
    }

    const topFuente = Object.entries(porFuente).sort((a, b) => b[1] - a[1]).find(([, v]) => v > 0);

    summaryEl.innerHTML = `
      <div class="compras-stat-card">
        <span class="compras-stat-card__label">Órdenes registradas</span>
        <span class="compras-stat-card__value">${compras.length}</span>
      </div>
      <div class="compras-stat-card compras-stat-card--accent">
        <span class="compras-stat-card__label">Total pagado a proveedores</span>
        <span class="compras-stat-card__value">${formatter.format(totalPagado)}</span>
      </div>
      <div class="compras-stat-card">
        <span class="compras-stat-card__label">Saldo por pagar</span>
        <span class="compras-stat-card__value compras-stat-card__value--danger">${formatter.format(pendientePago)}</span>
      </div>
      <div class="compras-stat-card compras-stat-card--fuente">
        <span class="compras-stat-card__label">Principal origen del dinero</span>
        ${topFuente
          ? `<div class="compras-stat-card__fuente">${badgeOrigen(topFuente[0], topFuente[1])}</div>`
          : '<span class="compras-stat-card__value compras-stat-card__value--sm">Sin pagos</span>'}
      </div>
    `;
  }

  function renderComprasTable() {
    renderComprasSummary();

    if (compras.length === 0) {
      tbodyCompras.innerHTML = `<tr><td colspan="8" class="text-center py-5 compras-empty">No hay órdenes de compra registradas.</td></tr>`;
      return;
    }

    tbodyCompras.innerHTML = compras.map(c => {
      const shortId = c.id.split('-')[0].toUpperCase();
      const provNombre = c.proveedor ? c.proveedor.nombre : 'N/A';

      return `
        <tr class="compras-row">
          <td><span class="compras-oc-id">OC-${shortId}</span></td>
          <td class="compras-td-date">${new Date(c.createdAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
          <td class="compras-td-prov" title="${provNombre}">${provNombre}</td>
          <td class="compras-td-sede">${c.sede ? c.sede.nombre : '—'}</td>
          <td class="text-end compras-td-total">${formatter.format(c.total)}</td>
          <td class="compras-td-estado">
            <div class="compras-estado-stack">
              ${estadoMercPill(c.estado)}
              ${estadoPagoPill(c.estadoPago)}
            </div>
          </td>
          <td class="compras-td-origen">${renderOrigenPagoCell(c.pagos, c.estadoPago)}</td>
          <td class="compras-td-actions erp-td-actions">
            <div class="erp-actions">
              ${erpAction('view', { className: 'btn-ver-oc', attrs: { 'data-id': c.id } })}
              ${isAdminOrGerente && (c.estado === 'pendiente' || c.estado === 'parcial') ? erpAction('recv', { className: 'btn-recibir-merc', attrs: { 'data-id': c.id } }) : ''}
              ${isAdminOrGerente && (c.estado === 'recibida' || c.estado === 'parcial') ? erpAction('return', { className: 'btn-devolver-merc', attrs: { 'data-id': c.id } }) : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Attach receipt and devolution listeners
    document.querySelectorAll('.btn-ver-oc').forEach(btn => {
      btn.addEventListener('click', () => openVerCompra(btn.dataset.id));
    });

    document.querySelectorAll('.btn-recibir-merc').forEach(btn => {
      btn.addEventListener('click', () => openRecibirMercancia(btn.dataset.id));
    });

    document.querySelectorAll('.btn-devolver-merc').forEach(btn => {
      btn.addEventListener('click', () => openDevolverMercancia(btn.dataset.id));
    });
  }

  function cppMoraMeta(fechaVencimientoPago) {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const vence = fechaVencimientoPago ? new Date(fechaVencimientoPago) : null;
    if (!vence) return { diasVencido: 0, diasHasta: null, clasificacion: 'al_dia', semaforo: 'green' };
    const diffDays = Math.ceil((vence - hoy) / (1000 * 60 * 60 * 24));
    if (diffDays >= 0) {
      return { diasVencido: 0, diasHasta: diffDays, clasificacion: 'al_dia', semaforo: 'green' };
    }
    const mora = Math.abs(diffDays);
    let clasificacion = '0-30';
    if (mora > 90) clasificacion = '+90';
    else if (mora > 60) clasificacion = '60-90';
    else if (mora > 30) clasificacion = '30-60';
    return { diasVencido: mora, diasHasta: diffDays, clasificacion, semaforo: mora > 30 ? 'red' : 'orange' };
  }

  function renderCppTable() {
    const filtroMora = document.getElementById('cpp-filtro-mora')?.value || '';
    let outstanding = compras.filter(c => ['pendiente', 'parcial', 'recibida'].includes(c.estado) && parseFloat(c.saldoPendiente) > 0);

    if (filtroMora) {
      outstanding = outstanding.filter(c => {
        const meta = cppMoraMeta(c.fechaVencimientoPago);
        if (filtroMora === 'al_dia') return meta.clasificacion === 'al_dia';
        return meta.clasificacion === filtroMora;
      });
    }

    if (outstanding.length === 0) {
      tbodyCpp.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-secondary">No registra cuentas por pagar pendientes.</td></tr>`;
      return;
    }

    tbodyCpp.innerHTML = outstanding.map(c => {
      const shortId = c.id.split('-')[0].toUpperCase();
      let payBadge = 'bg-danger-lt';
      if (c.estadoPago === 'pagado') payBadge = 'bg-success-lt';
      else if (c.estadoPago === 'abono_parcial') payBadge = 'bg-warning-lt';

      const meta = cppMoraMeta(c.fechaVencimientoPago);
      const diasLabel = meta.diasVencido > 0
        ? `<span class="badge bg-red-lt">${meta.diasVencido} d vencida</span>`
        : `<span class="badge bg-green-lt">${meta.diasHasta ?? 0} d</span>`;

      return `
        <tr>
          <td><span class="badge bg-blue text-white">OC-${shortId}</span></td>
          <td><strong>${c.proveedor ? c.proveedor.nombre : 'N/A'}</strong></td>
          <td class="${meta.diasVencido > 0 ? 'text-danger fw-bold' : ''}">
            ${c.fechaVencimientoPago ? new Date(c.fechaVencimientoPago).toLocaleDateString() : 'N/A'}
            ${meta.diasVencido > 0 ? ' <span class="badge bg-red-lt">VENCIDA</span>' : ''}
          </td>
          <td class="text-center">${diasLabel}</td>
          <td class="text-end">${formatter.format(c.total)}</td>
          <td class="text-end text-danger fw-bold">${formatter.format(c.saldoPendiente)}</td>
          <td class="text-center"><span class="badge ${payBadge} px-2 py-1">${c.estadoPago.toUpperCase()}</span></td>
          <td class="text-end">
            ${isAdminOrContador ? `
              <button class="btn btn-primary btn-sm btn-pagar-oc" data-id="${c.id}"><i class="ti ti-cash me-1"></i>Abonar</button>
            ` : ''}
          </td>
        </tr>
      `;
    }).join('');

    document.querySelectorAll('.btn-pagar-oc').forEach(btn => {
      btn.addEventListener('click', () => openAbonarCuenta(btn.dataset.id));
    });
  }

  renderComprasTable();
  renderCppTable();

  document.getElementById('cpp-filtro-mora')?.addEventListener('change', renderCppTable);

  const hashParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
  if (hashParams.get('tab') === 'cpp') {
    const cppTab = document.querySelector('a[href="#tab-cuentas-pagar"]');
    if (cppTab) bootstrap.Tab.getOrCreateInstance(cppTab).show();
  }

  // Nueva OC: Add items to Cart
  const selectProd = document.getElementById('oc-producto-select');
  const displayProd = document.getElementById('oc-producto-display');
  const inputCosto = document.getElementById('oc-producto-costo');
  const inputCant = document.getElementById('oc-producto-cantidad');
  const btnAddItem = document.getElementById('btn-add-item-oc');
  const btnBuscarProducto = document.getElementById('btn-oc-buscar-producto');
  const tbodyCart = document.getElementById('oc-items-body');
  const labelTotal = document.getElementById('oc-cart-total');
  const ocScan = document.getElementById('oc-scan');
  const searchProd = document.getElementById('oc-producto-search');
  const listProd = document.getElementById('oc-producto-list');
  const chipsProd = document.getElementById('oc-producto-chips');
  const clearProdBtn = document.getElementById('oc-producto-clear');
  const modalProductoEl = document.getElementById('modal-oc-producto');
  const modalProducto = modalProductoEl ? bootstrap.Modal.getOrCreateInstance(modalProductoEl) : null;
  const modalCompose = document.getElementById('oc-modal-compose');
  const modalProdName = document.getElementById('oc-modal-prod-name');
  const modalCosto = document.getElementById('oc-modal-costo');
  const modalCant = document.getElementById('oc-modal-cant');
  const modalAddBtn = document.getElementById('oc-modal-add');
  const modalCartSummary = document.getElementById('oc-modal-cart-summary');
  const modalCartList = document.getElementById('oc-modal-cart-list');
  let pickerMatches = [];
  let pickerActiveIdx = -1;
  let pickerCategoriaId = '';
  let modalSelectedProd = null;

  function escapeOcHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normalizeOcSearch(value) {
    return String(value ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  function findProductoByBarcode(barcode) {
    const code = String(barcode || '').trim().toLowerCase();
    if (!code) return null;
    return productos.find((p) => String(p.codigoBarras || '').trim().toLowerCase() === code) || null;
  }

  function productoCategoriaNombre(prod) {
    return prod?.categoria?.nombre || prod?.categoriaNombre || '';
  }

  function productoCategoriaId(prod) {
    return String(prod?.categoriaId || prod?.categoria?.id || '');
  }

  function categoriaChipLabel(nombre) {
    const raw = String(nombre || '').trim();
    if (!raw) return '';
    const parts = raw.split('/').map((p) => p.trim()).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : raw;
  }

  function productoSearchHaystack(prod) {
    return normalizeOcSearch(`${prod?.nombre || ''} ${prod?.codigoBarras || ''} ${productoCategoriaNombre(prod)}`);
  }

  function getPickerCategorias() {
    const map = new Map();
    productos.forEach((p) => {
      const id = productoCategoriaId(p);
      const nombre = productoCategoriaNombre(p);
      if (!id || !nombre || map.has(id)) return;
      map.set(id, nombre);
    });
    return Array.from(map.entries())
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  function scoreProductoMatch(prod, queryNorm, tokens) {
    const nombre = normalizeOcSearch(prod?.nombre || '');
    const codigo = normalizeOcSearch(prod?.codigoBarras || '');
    const haystack = productoSearchHaystack(prod);
    if (tokens.some((t) => !haystack.includes(t))) return -1;

    let score = 0;
    if (queryNorm && nombre.startsWith(queryNorm)) score += 100;
    else if (queryNorm && codigo.startsWith(queryNorm)) score += 90;
    else if (queryNorm && nombre.includes(queryNorm)) score += 50;
    else if (queryNorm && codigo.includes(queryNorm)) score += 40;
    if (tokens.length > 1) score += 10;
    return score;
  }

  function filterProductosPicker(query = '', categoriaId = '') {
    const qRaw = String(query || '').trim();
    const qNorm = normalizeOcSearch(qRaw);
    const tokens = qNorm.split(/\s+/).filter(Boolean);
    const catId = String(categoriaId || '');
    const canListByQuery = qNorm.length >= 2;

    // Catálogo vacío
    if (!productos.length) return { mode: 'guide', matches: [], query: qRaw };

    let list = productos;
    if (catId) list = list.filter((p) => productoCategoriaId(p) === catId);

    if (canListByQuery) {
      list = list
        .map((p) => ({ p, score: scoreProductoMatch(p, qNorm, tokens) }))
        .filter((row) => row.score >= 0)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return String(a.p.nombre || '').localeCompare(String(b.p.nombre || ''), 'es');
        })
        .map((row) => row.p);
    } else {
      // "Todas" o categoría sin texto: listar productos (A–Z), no bloquear con la guía
      list = [...list].sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));
    }

    const limit = canListByQuery || catId ? 40 : 80;
    return { mode: 'results', matches: list.slice(0, limit), query: qRaw, total: list.length, limit };
  }

  function highlightOcMatch(text, query) {
    const raw = String(text ?? '');
    const q = String(query || '').trim();
    if (!raw || !q || q.length < 2) return escapeOcHtml(raw);

    const normText = normalizeOcSearch(raw);
    const tokens = normalizeOcSearch(q).split(/\s+/).filter((t) => t.length >= 2);
    if (!tokens.length) return escapeOcHtml(raw);

    let best = null;
    tokens.forEach((token) => {
      const idx = normText.indexOf(token);
      if (idx < 0) return;
      if (!best || idx < best.idx) best = { idx, len: token.length };
    });
    if (!best) return escapeOcHtml(raw);

    let normPos = 0;
    let start = -1;
    let end = -1;
    for (let i = 0; i < raw.length; i++) {
      const ch = normalizeOcSearch(raw[i]);
      if (!ch) continue;
      if (normPos === best.idx) start = i;
      normPos += ch.length;
      if (start >= 0 && normPos >= best.idx + best.len) {
        end = i + 1;
        break;
      }
    }
    if (start < 0 || end < 0) return escapeOcHtml(raw);

    return (
      escapeOcHtml(raw.slice(0, start)) +
      `<mark class="oc-product-picker__mark">${escapeOcHtml(raw.slice(start, end))}</mark>` +
      escapeOcHtml(raw.slice(end))
    );
  }

  function syncPickerClearBtn() {
    if (!clearProdBtn) return;
    clearProdBtn.hidden = !(selectProd?.value || displayProd?.value);
  }

  function highlightPickerItem(idx) {
    if (!listProd) return;
    const items = Array.from(listProd.querySelectorAll('[role="option"]'));
    items.forEach((el, i) => {
      const on = i === idx;
      el.setAttribute('aria-selected', on ? 'true' : 'false');
      el.classList.toggle('is-active', on);
      if (on) el.scrollIntoView({ block: 'nearest' });
    });
    pickerActiveIdx = idx;
  }

  function renderProductoPickerRows(matches, query) {
    return matches.map((p, idx) => {
      const codigo = p.codigoBarras || 's/c';
      const cat = productoCategoriaNombre(p);
      const catShort = categoriaChipLabel(cat);
      const costo = Math.round(Number(p.precioCosto) || 0);
      return `
        <button type="button" class="oc-product-picker__item" role="option" id="oc-prod-opt-${idx}" data-id="${escapeOcHtml(p.id)}" aria-selected="false">
          <span class="oc-product-picker__main">
            <span class="oc-product-picker__name">${highlightOcMatch(p.nombre || 'Producto', query)}</span>
            <span class="oc-product-picker__meta">
              <span class="oc-product-picker__sku">${highlightOcMatch(codigo, query)}</span>
              ${cat ? `<span class="oc-product-picker__dot" aria-hidden="true">·</span><span class="oc-product-picker__cat" title="${escapeOcHtml(cat)}">${escapeOcHtml(catShort)}</span>` : ''}
            </span>
          </span>
          <span class="oc-product-picker__cost">${formatter.format(costo)}</span>
        </button>
      `;
    }).join('');
  }

  function renderProductoPickerChips() {
    if (!chipsProd) return;
    const cats = getPickerCategorias();
    chipsProd.innerHTML = `
      <button type="button" class="oc-product-modal__cat${!pickerCategoriaId ? ' is-active' : ''}" data-categoria="" role="listitem">
        Todas
      </button>
      ${cats.map((c) => {
        const short = categoriaChipLabel(c.nombre);
        return `
          <button type="button" class="oc-product-modal__cat${pickerCategoriaId === c.id ? ' is-active' : ''}" data-categoria="${escapeOcHtml(c.id)}" title="${escapeOcHtml(c.nombre)}" role="listitem">
            ${escapeOcHtml(short)}
          </button>
        `;
      }).join('')}
    `;
  }

  function renderProductoPicker(query = '') {
    if (!listProd) return;
    const result = filterProductosPicker(query, pickerCategoriaId);
    pickerMatches = result.matches;
    pickerActiveIdx = -1;
    renderProductoPickerChips();

    if (result.mode === 'guide') {
      listProd.innerHTML = `
        <div class="oc-product-picker__guide">
          <p class="oc-product-picker__guide-title">No hay productos en el catálogo</p>
          <p class="oc-product-picker__guide-hint">Cree productos en Inventario para usarlos aquí.</p>
        </div>
      `;
      return;
    }

    if (pickerMatches.length === 0) {
      listProd.innerHTML = `<div class="oc-product-picker__empty">Sin coincidencias. Pruebe otro término o categoría.</div>`;
      return;
    }

    const shown = pickerMatches.length;
    const total = Number(result.total || shown);
    const more = total > shown;
    listProd.innerHTML = `
      <div class="oc-product-picker__count">${shown}${more ? ` / ${total}` : ''} producto${shown === 1 ? '' : 's'}${more ? ' · filtre para acotar' : ''}</div>
      ${renderProductoPickerRows(pickerMatches, result.query || query)}
    `;
  }

  function openProductoPickerModal() {
    if (!modalProducto) return;
    pickerCategoriaId = '';
    if (searchProd) searchProd.value = '';
    clearModalCompose();
    renderProductoPicker('');
    updateModalCartSummary();
    modalProducto.show();
  }

  function clearProductoPicker({ keepFocus = false } = {}) {
    if (selectProd) selectProd.value = '';
    if (displayProd) displayProd.value = '';
    if (inputCosto) inputCosto.value = '';
    pickerCategoriaId = '';
    syncPickerClearBtn();
    if (keepFocus) btnBuscarProducto?.focus();
  }

  function updateModalCartSummary() {
    const n = cartItems.length;
    const tot = cartItems.reduce((sum, item) => sum + (item.cantidadPedida * item.precioUnitario), 0);
    if (modalCartSummary) {
      modalCartSummary.textContent = `${n} en la orden · ${formatter.format(tot)}`;
    }
    const ticketHint = document.getElementById('oc-modal-ticket-hint');
    if (ticketHint) {
      ticketHint.textContent = n === 0 ? 'Vacía' : `${n}`;
      ticketHint.classList.toggle('is-filled', n > 0);
    }

    if (!modalCartList) return;
    if (cartItems.length === 0) {
      modalCartList.innerHTML = `
        <div class="oc-product-modal__added-empty">
          <span class="oc-product-modal__added-empty-title">Sin ítems aún</span>
          <span class="oc-product-modal__added-empty-hint">Elija un producto de la lista, fije costo y pulse Agregar.</span>
        </div>`;
      return;
    }

    modalCartList.innerHTML = cartItems.map((item, idx) => {
      const sub = item.cantidadPedida * item.precioUnitario;
      return `
        <div class="oc-product-modal__added-item" data-idx="${idx}">
          <div class="oc-product-modal__added-top">
            <strong class="oc-product-modal__added-name" title="${escapeOcHtml(item.nombre)}">${escapeOcHtml(item.nombre)}</strong>
            <button type="button" class="btn btn-ghost-danger btn-icon btn-sm oc-modal-remove-item" data-idx="${idx}" aria-label="Quitar de la orden">
              <i class="ti ti-trash" aria-hidden="true"></i>
            </button>
          </div>
          <div class="oc-product-modal__added-meta">
            <span>× ${item.cantidadPedida}</span>
            <span>${formatter.format(item.precioUnitario)}</span>
            <span class="oc-product-modal__added-sub">${formatter.format(sub)}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  function clearModalCompose({ clearForm = false } = {}) {
    modalSelectedProd = null;
    if (modalCompose) modalCompose.hidden = true;
    if (modalProdName) modalProdName.textContent = '—';
    if (modalCosto) modalCosto.value = '';
    if (modalCant) modalCant.value = 1;
    if (clearForm) {
      if (selectProd) selectProd.value = '';
      if (displayProd) displayProd.value = '';
      if (inputCosto) inputCosto.value = '';
      if (inputCant) inputCant.value = 1;
      syncPickerClearBtn();
      highlightPickerItem(-1);
      searchProd?.focus();
    }
  }

  function selectProductoEnFormulario(prod) {
    if (!prod) return;
    if (selectProd) selectProd.value = prod.id;
    if (displayProd) displayProd.value = prod.nombre || '';
    if (inputCosto) inputCosto.value = Math.round(Number(prod.precioCosto) || 0);
    if (inputCant && (!inputCant.value || parseInt(inputCant.value, 10) < 1)) {
      inputCant.value = 1;
    }
    syncPickerClearBtn();
    selectProd?.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function chooseProductoFromPicker(prod) {
    if (!prod) return;
    modalSelectedProd = prod;
    selectProductoEnFormulario(prod);
    if (modalCompose) modalCompose.hidden = false;
    if (modalProdName) modalProdName.textContent = prod.nombre || 'Producto';
    const costo = Math.round(Number(prod.precioCosto) || 0);
    if (modalCosto) modalCosto.value = costo > 0 ? costo : '';
    if (modalCant) modalCant.value = 1;
    modalCompose?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    // Keep modal open for multi-add
    if (costo <= 0) {
      modalCosto?.focus();
      modalCosto?.select?.();
    } else {
      modalCant?.focus();
      modalCant?.select?.();
    }
  }

  function addFromModalCompose() {
    const prod = modalSelectedProd || productos.find((p) => p.id === selectProd?.value);
    if (!prod) {
      showToast('Sin producto', 'Elija un producto de la lista.', 'warning');
      return;
    }
    const costo = parseFloat(modalCosto?.value || 0);
    const cant = parseInt(modalCant?.value || 0, 10);
    if (costo <= 0 || cant <= 0) {
      showToast('Datos incompletos', 'Indique costo y cantidad válidos.', 'warning');
      modalCosto?.focus();
      return;
    }

    addProductoAlCarrito({
      productoId: prod.id,
      nombre: prod.nombre,
      cantidadPedida: cant,
      precioUnitario: costo
    });
    showToast('Producto agregado', `${prod.nombre} × ${cant}`, 'success');
    updateModalCartSummary();
    clearModalCompose();
    if (selectProd) selectProd.value = '';
    if (displayProd) displayProd.value = '';
    if (inputCosto) inputCosto.value = '';
    if (inputCant) inputCant.value = 1;
    syncPickerClearBtn();
    if (searchProd) {
      searchProd.value = '';
      renderProductoPicker('');
      searchProd.focus();
    }
  }

  function addProductoAlCarrito({ productoId, nombre, cantidadPedida, precioUnitario }) {
    const exist = cartItems.find((item) => item.productoId === productoId);
    if (exist) {
      exist.cantidadPedida += cantidadPedida;
    } else {
      cartItems.push({
        productoId,
        nombre,
        cantidadPedida,
        precioUnitario
      });
    }
    renderCart();
    updateModalCartSummary();
  }

  async function aplicarCodigoEscaneado(codigoRaw) {
    const codigo = String(codigoRaw || '').trim();
    if (!codigo) return;

    let prod = findProductoByBarcode(codigo);
    if (!prod) {
      try {
        const sedeId = document.getElementById('oc-sede')?.value || usuario.sedeId || '';
        const q = sedeId ? `?sedeId=${encodeURIComponent(sedeId)}` : '';
        const found = await apiFetch(`/productos/barcode/${encodeURIComponent(codigo)}${q}`);
        prod = found;
        if (prod?.id && !productos.some((p) => p.id === prod.id)) {
          productos.push(prod);
        }
      } catch (err) {
        showToast('Código no encontrado', err.message || `No hay producto con código: ${codigo}`, 'error');
        return;
      }
    }

    if (!prod) {
      showToast('Código no encontrado', `No hay producto con código: ${codigo}`, 'error');
      return;
    }

    selectProductoEnFormulario(prod);
    if (ocScan) ocScan.value = '';

    const costo = Math.round(Number(inputCosto?.value || prod.precioCosto) || 0);
    const cant = parseInt(inputCant?.value || 1, 10) || 1;

    if (costo <= 0) {
      showToast('Producto encontrado', `${prod.nombre}: indique el costo y pulse Agregar.`, 'warning');
      inputCosto?.focus();
      inputCosto?.select?.();
      return;
    }

    addProductoAlCarrito({
      productoId: prod.id,
      nombre: prod.nombre,
      cantidadPedida: cant,
      precioUnitario: costo
    });
    if (inputCant) inputCant.value = 1;
    clearProductoPicker();
    showToast('Producto agregado', `${prod.nombre} × ${cant}`, 'success');
  }

  if (btnBuscarProducto) {
    btnBuscarProducto.addEventListener('click', () => openProductoPickerModal());
  }

  if (displayProd) {
    displayProd.addEventListener('click', () => openProductoPickerModal());
  }

  if (modalProductoEl && searchProd && listProd) {
    modalProductoEl.addEventListener('shown.bs.modal', () => {
      searchProd.focus();
      searchProd.select?.();
    });

    searchProd.addEventListener('input', () => {
      renderProductoPicker(searchProd.value);
      if (pickerMatches.length) highlightPickerItem(0);
    });

    searchProd.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = Math.min((pickerActiveIdx < 0 ? -1 : pickerActiveIdx) + 1, pickerMatches.length - 1);
        if (next >= 0) highlightPickerItem(next);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (pickerMatches.length === 0) return;
        const prev = Math.max(pickerActiveIdx - 1, 0);
        highlightPickerItem(prev);
        return;
      }
      if (e.key === 'Enter') {
        if (pickerActiveIdx < 0 || !pickerMatches[pickerActiveIdx]) return;
        e.preventDefault();
        chooseProductoFromPicker(pickerMatches[pickerActiveIdx]);
      }
    });

    chipsProd?.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-categoria]');
      if (!chip) return;
      pickerCategoriaId = chip.getAttribute('data-categoria') || '';
      renderProductoPicker(searchProd.value);
      if (pickerMatches.length) highlightPickerItem(0);
      searchProd.focus();
    });

    listProd.addEventListener('click', (e) => {
      const item = e.target.closest('[data-id]');
      if (!item) return;
      const prod = productos.find((p) => p.id === item.dataset.id);
      if (prod) chooseProductoFromPicker(prod);
    });

    modalAddBtn?.addEventListener('click', () => addFromModalCompose());

    document.getElementById('oc-modal-compose-cancel')?.addEventListener('click', () => {
      clearModalCompose({ clearForm: true });
    });

    modalCompose?.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      clearModalCompose({ clearForm: true });
    });

    [modalCosto, modalCant].forEach((el) => {
      el?.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        addFromModalCompose();
      });
    });

    modalCartList?.addEventListener('click', (e) => {
      const btn = e.target.closest('.oc-modal-remove-item');
      if (!btn) return;
      const idx = parseInt(btn.dataset.idx, 10);
      if (!Number.isFinite(idx) || idx < 0 || idx >= cartItems.length) return;
      cartItems.splice(idx, 1);
      renderCart();
    });
  }

  if (clearProdBtn) {
    clearProdBtn.addEventListener('click', () => clearProductoPicker({ keepFocus: true }));
  }

  if (ocScan) {
    ocScan.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      aplicarCodigoEscaneado(ocScan.value);
    });
  }

  if (selectProd) {
    selectProd.addEventListener('change', () => {
      const pId = selectProd.value;
      if (!pId) return;
      const prod = productos.find((p) => p.id === pId);
      if (prod && inputCosto) {
        inputCosto.value = Math.round(Number(prod.precioCosto) || 0);
      }
    });

    btnAddItem?.addEventListener('click', () => {
      const pId = selectProd.value;
      const costo = parseFloat(inputCosto?.value || 0);
      const cant = parseInt(inputCant?.value || 0, 10);

      if (!pId || costo <= 0 || cant <= 0) {
        showToast('Datos incompletos', 'Seleccione producto, costo y cantidad válidos.', 'warning');
        btnBuscarProducto?.focus();
        return;
      }

      const prod = productos.find((p) => p.id === pId);
      if (!prod) return;

      addProductoAlCarrito({
        productoId: pId,
        nombre: prod.nombre,
        cantidadPedida: cant,
        precioUnitario: costo
      });
      if (inputCant) inputCant.value = 1;
      clearProductoPicker({ keepFocus: true });
    });

    // Lector USB HID global: solo si la pestaña Nueva OC está activa y no hay foco en oc-scan
    initBarcodeScanner((barcode) => {
      const tabNuevaOc = document.getElementById('tab-nueva-oc');
      if (!tabNuevaOc || !tabNuevaOc.classList.contains('active')) return;
      if (document.activeElement === ocScan) return; // oc-scan maneja Enter propio
      if (document.activeElement === searchProd) return;
      if (document.activeElement === modalCosto || document.activeElement === modalCant) return;
      aplicarCodigoEscaneado(barcode);
    });
  }

  function renderCart() {
    if (!tbodyCart || !labelTotal) return;

    if (cartItems.length === 0) {
      tbodyCart.innerHTML = `<tr><td colspan="5" class="text-center text-secondary py-3">El carrito está vacío. Agregue productos arriba.</td></tr>`;
      labelTotal.textContent = '$ 0';
      updateModalCartSummary();
      return;
    }

    let tot = 0;
    tbodyCart.innerHTML = cartItems.map((item, idx) => {
      const sub = item.cantidadPedida * item.precioUnitario;
      tot += sub;
      return `
        <tr>
          <td><strong>${item.nombre}</strong></td>
          <td class="text-center">
            <input type="number" class="form-control form-control-sm text-center oc-cart-qty" data-idx="${idx}" min="1" value="${item.cantidadPedida}" aria-label="Cantidad">
          </td>
          <td class="text-end">
            <input type="number" class="form-control form-control-sm text-end oc-cart-costo" data-idx="${idx}" min="0" step="1" value="${item.precioUnitario}" aria-label="Costo unitario">
          </td>
          <td class="text-end fw-bold text-primary oc-cart-sub" data-idx="${idx}">${formatter.format(sub)}</td>
          <td>
            <button type="button" class="btn btn-outline-danger btn-icon btn-sm btn-remove-cart" data-idx="${idx}" aria-label="Eliminar ítem del carrito">
              <i class="ti ti-trash"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    labelTotal.textContent = formatter.format(tot);
    updateModalCartSummary();

    tbodyCart.querySelectorAll('.oc-cart-qty').forEach((input) => {
      input.addEventListener('change', () => {
        const i = parseInt(input.dataset.idx, 10);
        const val = parseInt(input.value, 10);
        if (!Number.isFinite(val) || val < 1) {
          input.value = cartItems[i].cantidadPedida;
          return;
        }
        cartItems[i].cantidadPedida = val;
        renderCart();
      });
    });

    tbodyCart.querySelectorAll('.oc-cart-costo').forEach((input) => {
      input.addEventListener('change', () => {
        const i = parseInt(input.dataset.idx, 10);
        const val = parseFloat(input.value);
        if (!Number.isFinite(val) || val < 0) {
          input.value = cartItems[i].precioUnitario;
          return;
        }
        cartItems[i].precioUnitario = val;
        renderCart();
      });
    });

    tbodyCart.querySelectorAll('.btn-remove-cart').forEach((btn) => {
      btn.addEventListener('click', () => {
        cartItems.splice(parseInt(btn.dataset.idx, 10), 1);
        renderCart();
      });
    });
  }

  // Submit Nueva OC
  const formOC = document.getElementById('form-nueva-oc');
  if (formOC) {
    formOC.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (cartItems.length === 0) {
        showToast('Carrito vacío', 'Agregue al menos un artículo a la orden.', 'warning');
        return;
      }

      const sedeId = document.getElementById('oc-sede')?.value;
      if (!sedeId) {
        showToast('Sede requerida', 'Seleccione la sede destino del inventario.', 'warning');
        return;
      }

      const proveedorId = document.getElementById('oc-proveedor')?.value;
      if (!proveedorId) {
        showToast('Proveedor requerido', 'Seleccione el proveedor.', 'warning');
        return;
      }

      const submitBtn = formOC.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const payload = {
          proveedorId,
          sedeId,
          fechaEsperada: document.getElementById('oc-fecha-esperada').value || null,
          observaciones: document.getElementById('oc-observaciones').value || '',
          items: cartItems
        };

        await apiFetch('/compras', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        showToast('Orden emitida', 'La OC quedó pendiente. El stock entra al recibir la mercancía.', 'success');
        cartItems = [];
        formOC.reset();
        if (document.getElementById('oc-sede') && defaultSedeId) {
          document.getElementById('oc-sede').value = defaultSedeId;
        }
        clearProductoPicker();
        renderCart();

        const tabListEl = document.querySelector('a[href="#tab-ordenes-compra"]');
        if (tabListEl) {
          bootstrap.Tab.getOrCreateInstance(tabListEl).show();
        }

        await loadInitialData();
        renderComprasTable();
        renderCppTable();
      } catch (err) {
        showToast('Error', err.message || 'No se pudo emitir la orden.', 'error');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // F2 → enfocar escáner en Nueva OC (si la pestaña está activa y no hay modal)
  if (comprasKeydownHandler) {
    document.removeEventListener('keydown', comprasKeydownHandler);
  }
  comprasKeydownHandler = (e) => {
    if (e.key !== 'F2') return;
    if (document.querySelector('.modal.show')) return;
    const tabNuevaOc = document.getElementById('tab-nueva-oc');
    const scan = document.getElementById('oc-scan');
    if (!tabNuevaOc?.classList.contains('active') || !scan) return;
    e.preventDefault();
    scan.focus();
    scan.select();
  };
  document.addEventListener('keydown', comprasKeydownHandler);

  // Open Recepción Modal
  async function openRecibirMercancia(id) {
    const modalContent = document.getElementById('recibir-mercancia-content');
    modalContent.innerHTML = `<div class="text-center py-5"><div class="spinner-border text-primary" role="status"></div></div>`;
    modalRecibir.show();

    try {
      const oc = compras.find(c => c.id === id);
      if (!oc) throw new Error('Orden no encontrada');

      const shortId = oc.id.split('-')[0].toUpperCase();

      modalContent.innerHTML = `
        <form id="form-recibir-oc">
          <input type="hidden" id="rec-compra-id" value="${oc.id}">
          <div class="modal-header">
            <h5 class="modal-title">Recepción de Mercancía: <strong>OC-${shortId}</strong></h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <p class="text-secondary small mb-3">Ingrese las cantidades físicas que están ingresando al almacén de la sede: <strong>${oc.sede ? oc.sede.nombre : 'N/A'}</strong>.</p>
            <table class="table table-sm table-striped">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th class="text-center">Pedidas</th>
                  <th class="text-center">Recibidas Previamente</th>
                  <th class="text-center" style="width: 140px;">Recibiendo Ahora</th>
                </tr>
                             ${oc.items.map(item => {
                  const maxPosible = item.cantidadPedida - item.cantidadRecibida;
                  const isSerialized = item.producto.tieneNumeroSerie;
                  return `
                    <tr class="align-middle">
                      <td>
                        <strong>${item.producto.nombre}</strong>
                        <div class="mt-2 form-check form-switch small">
                          <input class="form-check-input switch-recibir-seriales" type="checkbox" data-pid="${item.productoId}" ${isSerialized ? 'checked' : ''}>
                          <label class="form-check-label text-secondary fw-semibold">Registrar Seriales / IMEIs</label>
                        </div>
                        <div class="mt-2 container-series-input ${isSerialized ? '' : 'd-none'}" data-pid="${item.productoId}">
                          <textarea class="form-control form-control-sm input-recibir-series" 
                                    data-pid="${item.productoId}" 
                                    rows="4" 
                                    placeholder="Escriba o escanee los seriales (uno por línea o comas)…" spellcheck="false" ${isSerialized ? 'required' : ''}></textarea>
                          <div class="small text-secondary mt-1"><span class="badge bg-blue-lt counter-series-rec" data-pid="${item.productoId}">0</span> de <span class="badge bg-secondary-lt max-series-rec" data-pid="${item.productoId}">${maxPosible}</span> seriales requeridos</div>
                        </div>
                      </td>
                      <td class="text-center">${item.cantidadPedida}</td>
                      <td class="text-center text-blue">${item.cantidadRecibida}</td>
                      <td class="text-center">
                        <input type="number" class="form-control form-control-sm input-recibir-cant" 
                                data-pid="${item.productoId}" 
                                value="${maxPosible}" 
                                min="0" 
                                max="${maxPosible}" required>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-link link-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="submit" class="btn btn-success ms-auto"><i class="ti ti-package me-1"></i>Ingresar a Inventario</button>
          </div>
        </form>
      `;

      // Listeners para actualizar dinámicamente los contadores de seriales y switches
      const modalForm = document.getElementById('form-recibir-oc');
      
      modalForm.querySelectorAll('.switch-recibir-seriales').forEach(sw => {
        sw.addEventListener('change', (e) => {
          const pid = sw.dataset.pid;
          const container = modalForm.querySelector(`.container-series-input[data-pid="${pid}"]`);
          const textarea = modalForm.querySelector(`.input-recibir-series[data-pid="${pid}"]`);
          if (e.target.checked) {
            container.classList.remove('d-none');
            textarea.required = true;
          } else {
            container.classList.add('d-none');
            textarea.required = false;
            textarea.value = '';
            const counterBadge = modalForm.querySelector(`.counter-series-rec[data-pid="${pid}"]`);
            if (counterBadge) counterBadge.textContent = '0';
          }
        });
      });

      modalForm.querySelectorAll('.input-recibir-cant').forEach(input => {
        input.addEventListener('input', (e) => {
          const pid = input.dataset.pid;
          const maxBadge = modalForm.querySelector(`.max-series-rec[data-pid="${pid}"]`);
          if (maxBadge) {
            maxBadge.textContent = e.target.value;
          }
        });
      });

      modalForm.querySelectorAll('.input-recibir-series').forEach(textarea => {
        textarea.addEventListener('input', (e) => {
          const pid = textarea.dataset.pid;
          const counterBadge = modalForm.querySelector(`.counter-series-rec[data-pid="${pid}"]`);
          if (counterBadge) {
            const text = e.target.value;
            const count = text.split(/[\n,]+/).map(s => s.trim()).filter(s => s.length > 0).length;
            counterBadge.textContent = count;
          }
        });
      });

      // Submit Recepción
      modalForm.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const inputs = document.querySelectorAll('.input-recibir-cant');
        const items = [];
        let validationError = null;

        inputs.forEach(input => {
          const pid = input.dataset.pid;
          const cant = parseInt(input.value || 0);
          
          const switchSeries = modalForm.querySelector(`.switch-recibir-seriales[data-pid="${pid}"]`);
          const seriesTextarea = modalForm.querySelector(`.input-recibir-series[data-pid="${pid}"]`);
          let series = [];
          
          if (switchSeries && switchSeries.checked && seriesTextarea && cant > 0) {
            const textVal = seriesTextarea.value.trim();
            series = textVal.split(/[\n,]+/).map(s => s.trim()).filter(s => s.length > 0);
            if (series.length !== cant) {
              validationError = `Debe ingresar exactamente ${cant} seriales para el producto serializado.`;
            }
          }

          items.push({
            productoId: pid,
            cantidadRecibida: cant,
            series
          });
        });

        if (validationError) {
          const { showToast } = await import('../utils/toast.js').catch(() => ({ showToast: alert }));
          showToast('Error de Validación', validationError, 'error');
          return;
        }

        try {
          await apiFetch(`/compras/${oc.id}/recibir`, {
            method: 'POST',
            body: JSON.stringify({ items })
          });
          modalRecibir.hide();
          await loadInitialData();
          renderComprasTable();
          renderCppTable();

          const { showToast } = await import('../utils/toast.js').catch(() => ({ showToast: alert }));
          showToast('Éxito', 'Inventario entrante y seriales actualizados con éxito.', 'success');
        } catch (err) {
          const { showToast } = await import('../utils/toast.js').catch(() => ({ showToast: alert }));
          showToast('Error', err.message, 'error');
        }
      });

    } catch (err) {
      modalContent.innerHTML = `<div class="alert alert-danger m-3">${err.message}</div>`;
    }
  }

  // Open Devolución Modal
  async function openDevolverMercancia(id) {
    const modalContent = document.getElementById('devolver-mercancia-content');
    modalContent.innerHTML = `<div class="text-center py-5"><div class="spinner-border text-primary" role="status"></div></div>`;
    modalDevolver.show();

    try {
      const oc = compras.find(c => c.id === id);
      if (!oc) throw new Error('Orden no encontrada');

      const shortId = oc.id.split('-')[0].toUpperCase();

      modalContent.innerHTML = `
        <form id="form-devolver-oc">
          <input type="hidden" id="dev-compra-id" value="${oc.id}">
          <div class="modal-header">
            <h5 class="modal-title">Devolución de Mercancía: <strong>OC-${shortId}</strong></h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <p class="text-secondary small mb-3">Ingrese las cantidades de mercancía que se devolverán al proveedor. Se descontarán del almacén de la sede: <strong>${oc.sede ? oc.sede.nombre : 'N/A'}</strong>.</p>
            <table class="table table-sm table-striped">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th class="text-center">Recibidas</th>
                  <th class="text-center" style="width: 140px;">Cantidad a Devolver</th>
                </tr>
              </thead>
              <tbody>
                ${oc.items.filter(item => item.cantidadRecibida > 0).map(item => {
                  const maxPosible = item.cantidadRecibida;
                  const isSerialized = item.producto.tieneNumeroSerie;
                  return `
                    <tr class="align-middle">
                      <td>
                        <strong>${item.producto.nombre}</strong>
                        <div class="mt-2 form-check form-switch small">
                          <input class="form-check-input switch-devolver-seriales" type="checkbox" data-pid="${item.productoId}" ${isSerialized ? 'checked' : ''}>
                          <label class="form-check-label text-secondary fw-semibold">Ingresar Seriales / IMEIs a Devolver</label>
                        </div>
                        <div class="mt-2 container-series-dev-input ${isSerialized ? '' : 'd-none'}" data-pid="${item.productoId}">
                          <textarea class="form-control form-control-sm input-devolver-series" 
                                    data-pid="${item.productoId}" 
                                    rows="4" 
                                    placeholder="Escriba o escanee los seriales a devolver (uno por línea o comas)…" spellcheck="false" ${isSerialized ? 'required' : ''}></textarea>
                          <div class="small text-secondary mt-1"><span class="badge bg-danger-lt counter-series-dev" data-pid="${item.productoId}">0</span> de <span class="badge bg-secondary-lt max-series-dev" data-pid="${item.productoId}">0</span> seriales ingresados</div>
                        </div>
                      </td>
                      <td class="text-center text-success fw-bold">${item.cantidadRecibida}</td>
                      <td class="text-center">
                        <input type="number" class="form-control form-control-sm input-devolver-cant" 
                                data-pid="${item.productoId}" 
                                value="0" 
                                min="0" 
                                max="${maxPosible}" required>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-link link-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="submit" class="btn btn-danger ms-auto"><i class="ti ti-arrow-back me-1"></i>Procesar Devolución</button>
          </div>
        </form>
      `;

      // Listeners
      const modalForm = document.getElementById('form-devolver-oc');
      
      modalForm.querySelectorAll('.switch-devolver-seriales').forEach(sw => {
        sw.addEventListener('change', (e) => {
          const pid = sw.dataset.pid;
          const container = modalForm.querySelector(`.container-series-dev-input[data-pid="${pid}"]`);
          const textarea = modalForm.querySelector(`.input-devolver-series[data-pid="${pid}"]`);
          if (e.target.checked) {
            container.classList.remove('d-none');
            textarea.required = true;
          } else {
            container.classList.add('d-none');
            textarea.required = false;
            textarea.value = '';
            const counterBadge = modalForm.querySelector(`.counter-series-dev[data-pid="${pid}"]`);
            if (counterBadge) counterBadge.textContent = '0';
          }
        });
      });

      modalForm.querySelectorAll('.input-devolver-cant').forEach(input => {
        input.addEventListener('input', (e) => {
          const pid = input.dataset.pid;
          const maxBadge = modalForm.querySelector(`.max-series-dev[data-pid="${pid}"]`);
          if (maxBadge) {
            maxBadge.textContent = e.target.value;
          }
        });
      });

      modalForm.querySelectorAll('.input-devolver-series').forEach(textarea => {
        textarea.addEventListener('input', (e) => {
          const pid = textarea.dataset.pid;
          const counterBadge = modalForm.querySelector(`.counter-series-dev[data-pid="${pid}"]`);
          if (counterBadge) {
            const text = e.target.value;
            const count = text.split(/[\n,]+/).map(s => s.trim()).filter(s => s.length > 0).length;
            counterBadge.textContent = count;
          }
        });
      });

      // Submit Devolución
      modalForm.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const inputs = modalForm.querySelectorAll('.input-devolver-cant');
        const items = [];
        let validationError = null;
        let totalDevuelto = 0;

        inputs.forEach(input => {
          const pid = input.dataset.pid;
          const cant = parseInt(input.value || 0);
          if (cant > 0) {
            totalDevuelto += cant;
            const switchSeries = modalForm.querySelector(`.switch-devolver-seriales[data-pid="${pid}"]`);
            const seriesTextarea = modalForm.querySelector(`.input-devolver-series[data-pid="${pid}"]`);
            let series = [];
            
            if (switchSeries && switchSeries.checked && seriesTextarea) {
              const textVal = seriesTextarea.value.trim();
              series = textVal.split(/[\n,]+/).map(s => s.trim()).filter(s => s.length > 0);
              if (series.length !== cant) {
                validationError = `Debe ingresar exactamente ${cant} seriales para el producto serializado.`;
              }
            }

            items.push({
              productoId: pid,
              cantidadDevolver: cant,
              series
            });
          }
        });

        if (totalDevuelto === 0) {
          const { showToast } = await import('../utils/toast.js').catch(() => ({ showToast: alert }));
          showToast('Error de Validación', 'Debe especificar al menos un ítem con cantidad mayor a 0 para devolver.', 'error');
          return;
        }

        if (validationError) {
          const { showToast } = await import('../utils/toast.js').catch(() => ({ showToast: alert }));
          showToast('Error de Validación', validationError, 'error');
          return;
        }

        try {
          await apiFetch(`/compras/${oc.id}/devolver`, {
            method: 'POST',
            body: JSON.stringify({ items })
          });
          modalDevolver.hide();
          await loadInitialData();
          renderComprasTable();
          renderCppTable();

          const { showToast } = await import('../utils/toast.js').catch(() => ({ showToast: alert }));
          showToast('Éxito', 'Mercancía devuelta e inventario actualizado con éxito.', 'success');
        } catch (err) {
          const { showToast } = await import('../utils/toast.js').catch(() => ({ showToast: alert }));
          showToast('Error', err.message, 'error');
        }
      });

    } catch (err) {
      modalContent.innerHTML = `<div class="alert alert-danger m-3">${err.message}</div>`;
    }
  }

  // Open Ver Compra Modal
  function openVerCompra(id) {
    const modalContent = document.getElementById('ver-compra-content');
    const oc = compras.find(c => c.id === id);
    if (!oc) return;

    const shortId = oc.id.split('-')[0].toUpperCase();
    let badgeClass = 'bg-warning-lt';
    if (oc.estado === 'recibida') badgeClass = 'bg-success-lt';
    else if (oc.estado === 'parcial') badgeClass = 'bg-blue-lt';
    else if (oc.estado === 'cancelada') badgeClass = 'bg-danger-lt';

    let payBadge = 'bg-danger-lt';
    if (oc.estadoPago === 'pagado') payBadge = 'bg-success-lt';
    else if (oc.estadoPago === 'abono_parcial') payBadge = 'bg-warning-lt';

    modalContent.innerHTML = `
      <div class="modal-header">
        <h5 class="modal-title">Detalle de Orden de Compra: <strong>OC-${shortId}</strong></h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
      </div>
      <div class="modal-body">
        <div class="row mb-3">
          <div class="col-md-6">
            <div class="text-secondary small">Proveedor</div>
            <div class="fw-bold">${oc.proveedor ? oc.proveedor.nombre : 'N/A'}</div>
            ${oc.proveedor && oc.proveedor.nit ? `<div class="text-secondary small">NIT: ${oc.proveedor.nit}</div>` : ''}
          </div>
          <div class="col-md-6 text-md-end">
            <div class="text-secondary small">Sede Destino</div>
            <div class="fw-bold">${oc.sede ? oc.sede.nombre : 'N/A'}</div>
            <div class="text-secondary small">Registrada por: ${oc.usuario ? oc.usuario.nombre : 'N/A'}</div>
          </div>
        </div>
        <div class="row mb-4 border-top border-bottom py-2 bg-light">
          <div class="col-6 col-md-3">
            <div class="text-secondary small">Fecha Emisión</div>
            <div class="fw-bold">${new Date(oc.createdAt).toLocaleDateString()}</div>
          </div>
          <div class="col-6 col-md-3">
            <div class="text-secondary small">Estado Mercancía</div>
            <div><span class="badge ${badgeClass}">${oc.estado.toUpperCase()}</span></div>
          </div>
          <div class="col-6 col-md-3">
            <div class="text-secondary small">Estado Pago</div>
            <div><span class="badge ${payBadge}">${oc.estadoPago.toUpperCase()}</span></div>
          </div>
          <div class="col-6 col-md-3 text-end">
            <div class="text-secondary small">Saldo Pendiente</div>
            <div class="fw-bold text-danger">${formatter.format(oc.saldoPendiente)}</div>
          </div>
        </div>

        <h6 class="mb-2">Productos en esta Orden</h6>
        <div class="table-responsive mb-3">
          <table class="table table-sm table-striped">
            <thead>
              <tr>
                <th>Producto</th>
                <th class="text-center">Cant. Pedida</th>
                <th class="text-center">Cant. Recibida</th>
                <th class="text-end">Costo Unitario</th>
                <th class="text-end">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${oc.items.map(item => `
                <tr>
                  <td>
                    <div><strong>${item.producto ? item.producto.nombre : 'N/A'}</strong></div>
                    ${item.producto && item.producto.codigoBarras ? `<div class="text-secondary small">${item.producto.codigoBarras}</div>` : ''}
                  </td>
                  <td class="text-center">${item.cantidadPedida}</td>
                  <td class="text-center text-blue fw-bold">${item.cantidadRecibida}</td>
                  <td class="text-end">${formatter.format(item.precioUnitario)}</td>
                  <td class="text-end fw-bold">${formatter.format(item.cantidadPedida * item.precioUnitario)}</td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="4" class="text-end fw-bold">TOTAL:</td>
                <td class="text-end fw-bold text-primary">${formatter.format(oc.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <h6 class="mb-2 mt-4"><i class="ti ti-cash me-1"></i> Historial de pagos y origen del dinero</h6>
        ${renderHistorialPagosHtml(oc.pagos)}

        ${oc.observaciones ? `
          <div class="mb-3">
            <div class="text-secondary small">Observaciones:</div>
            <p class="mb-0 text-secondary italic small">${oc.observaciones}</p>
          </div>
        ` : ''}
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary ms-auto" data-bs-dismiss="modal">Cerrar</button>
      </div>
    `;

    modalVer.show();
  }

  // Open Registrar Pago Account
  function openAbonarCuenta(id) {
    const oc = compras.find(c => c.id === id);
    if (!oc) return;

    document.getElementById('pago-compra-id').value = oc.id;
    document.getElementById('pago-prov-nombre').value = oc.proveedor ? oc.proveedor.nombre : 'N/A';
    document.getElementById('pago-total-compra').value = formatter.format(oc.total);
    document.getElementById('pago-saldo-actual').value = formatter.format(oc.saldoPendiente);
    document.getElementById('pago-monto-input').value = Math.round(oc.saldoPendiente);
    document.getElementById('pago-monto-input').setAttribute('max', oc.saldoPendiente);
    document.getElementById('pago-fuente-fondos').value = 'transferencia_empresa';
    document.getElementById('pago-pagado-por').value = '';
    document.getElementById('pago-referencia').value = '';
    document.getElementById('pago-fuente-fondos')?.dispatchEvent(new Event('change'));

    modalPagar.show();
  }

  // Submit Pago Cuenta
  document.getElementById('form-pagar-cuenta').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('pago-compra-id').value;
    const monto = document.getElementById('pago-monto-input').value;
    const fuenteFondos = document.getElementById('pago-fuente-fondos').value;
    const pagadoPor = document.getElementById('pago-pagado-por').value.trim();
    const referencia = document.getElementById('pago-referencia').value.trim();

    try {
      const res = await apiFetch(`/compras/${id}/pago`, {
        method: 'PUT',
        body: JSON.stringify({ monto, fuenteFondos, pagadoPor: pagadoPor || null, referencia: referencia || null })
      });
      modalPagar.hide();
      alert(res.message || 'Pago registrado correctamente.');
      await loadInitialData();
      renderComprasTable();
      renderCppTable();
    } catch (err) {
      alert('Error al procesar pago: ' + err.message);
    }
  });

  const pagoFuenteSelect = document.getElementById('pago-fuente-fondos');
  const pagoHintCaja = document.getElementById('pago-hint-caja');
  const pagoHintExterno = document.getElementById('pago-hint-externo');
  if (pagoFuenteSelect) {
    const updatePagoHints = () => {
      const esCaja = pagoFuenteSelect.value === 'caja_efectivo';
      pagoHintCaja?.classList.toggle('d-none', !esCaja);
      pagoHintExterno?.classList.toggle('d-none', esCaja);
    };
    pagoFuenteSelect.addEventListener('change', updatePagoHints);
    updatePagoHints();
  }
}

export function destroyCompras() {
  destroyBarcodeScanner();
  if (comprasKeydownHandler) {
    document.removeEventListener('keydown', comprasKeydownHandler);
    comprasKeydownHandler = null;
  }
}

