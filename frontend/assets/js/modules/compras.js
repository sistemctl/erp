import { apiFetch } from '../api.js';
import { getUsuario } from '../auth.js';
import { erpAction, erpActions } from '../utils/action-buttons.js';

export async function initCompras(container) {
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
      <header class="compras-header d-print-none">
        <div class="compras-header__eyebrow">Abastecimiento</div>
        <h1 class="compras-header__title">Compras e inventario entrante</h1>
        <p class="compras-header__sub">Órdenes de compra, recepción de mercancía y cuentas por pagar</p>
      </header>

      <div class="card compras-shell mb-4 d-print-none">
        <div class="card-header compras-tabs-head">
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
                <form id="form-nueva-oc">
                  <div class="row mb-4">
                    <div class="col-md-4">
                      <label class="form-label required">Proveedor</label>
                      <select id="oc-proveedor" class="form-select" required>
                        <option value="">-- Seleccionar Proveedor --</option>
                        ${proveedores.map(p => `<option value="${p.id}">${p.nombre} (NIT: ${p.nit})</option>`).join('')}
                      </select>
                    </div>
                    <div class="col-md-3">
                      <label class="form-label required">Sede destino (inventario)</label>
                      <select id="oc-sede" class="form-select" required>
                        ${sedes.length === 0 ? '<option value="">Sin sedes configuradas</option>' : sedes.map(s => `<option value="${s.id}" ${s.id === defaultSedeId ? 'selected' : ''}>${s.nombre}</option>`).join('')}
                      </select>
                    </div>
                    <div class="col-md-2">
                      <label class="form-label">Fecha Esperada</label>
                      <input type="date" id="oc-fecha-esperada" class="form-control">
                    </div>
                    <div class="col-md-3">
                      <label class="form-label">Observaciones</label>
                      <input type="text" id="oc-observaciones" class="form-control" placeholder="Ej: Pedido urgente pantallas">
                    </div>
                  </div>

                  <h3 class="mb-3 text-secondary">Agregar Productos al Pedido</h3>
                  <div class="row g-2 align-items-end mb-4 border p-3 rounded bg-light-lt">
                    <div class="col-md-6">
                      <label class="form-label">Producto del Catálogo</label>
                      <select id="oc-producto-select" class="form-select select2">
                        <option value="">-- Buscar Producto --</option>
                        ${productos.map(p => `<option value="${p.id}">${p.nombre} (Costo sugerido: $${p.precioCosto})</option>`).join('')}
                      </select>
                    </div>
                    <div class="col-md-2">
                      <label class="form-label">Costo Unitario ($)</label>
                      <input type="number" id="oc-producto-costo" class="form-control" placeholder="Costo COP">
                    </div>
                    <div class="col-md-2">
                      <label class="form-label">Cantidad</label>
                      <input type="number" id="oc-producto-cantidad" class="form-control" value="1" min="1">
                    </div>
                    <div class="col-md-2">
                      <button type="button" id="btn-add-item-oc" class="btn btn-primary w-100"><i class="ti ti-plus me-1"></i> Agregar</button>
                    </div>
                  </div>

                  <h3 class="mb-3">Artículos de la Orden</h3>
                  <div class="table-responsive mb-4">
                    <table class="table table-vcenter table-striped">
                      <thead>
                        <tr>
                          <th>Producto</th>
                          <th class="text-center" style="width: 100px;">Cantidad</th>
                          <th class="text-end" style="width: 150px;">Costo Unit.</th>
                          <th class="text-end" style="width: 150px;">Total</th>
                          <th style="width: 50px;"></th>
                        </tr>
                      </thead>
                      <tbody id="oc-items-body">
                        <tr><td colspan="5" class="text-center text-secondary py-3">El carro de la orden está vacío.</td></tr>
                      </tbody>
                    </table>
                  </div>

                  <div class="d-flex justify-content-between align-items-center border-top pt-3">
                    <div class="h2 text-primary mb-0">Total Orden: <strong id="oc-cart-total">$ 0</strong></div>
                    <button type="submit" class="btn btn-success"><i class="ti ti-check me-1"></i>Emitir Orden de Compra</button>
                  </div>
                </form>
              </div>
            ` : ''}

            <!-- TAB 3: CUENTAS POR PAGAR (CPP) -->
            <div class="tab-pane" id="tab-cuentas-pagar" role="tabpanel">
              <div class="table-responsive">
                <table class="table table-vcenter card-table table-striped table-hover">
                  <thead>
                    <tr>
                      <th>Factura / OC No.</th>
                      <th>Proveedor</th>
                      <th>Fecha Vencimiento</th>
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

  function renderCppTable() {
    const outstanding = compras.filter(c => ['pendiente', 'parcial', 'recibida'].includes(c.estado) && parseFloat(c.saldoPendiente) > 0);

    if (outstanding.length === 0) {
      tbodyCpp.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-secondary">No registra cuentas por pagar pendientes.</td></tr>`;
      return;
    }

    tbodyCpp.innerHTML = outstanding.map(c => {
      const shortId = c.id.split('-')[0].toUpperCase();
      let payBadge = 'bg-danger-lt';
      if (c.estadoPago === 'pagado') payBadge = 'bg-success-lt';
      else if (c.estadoPago === 'abono_parcial') payBadge = 'bg-warning-lt';

      const isVencida = new Date(c.fechaVencimientoPago) < new Date();

      return `
        <tr>
          <td><span class="badge bg-blue text-white">OC-${shortId}</span></td>
          <td><strong>${c.proveedor ? c.proveedor.nombre : 'N/A'}</strong></td>
          <td class="${isVencida ? 'text-danger fw-bold' : ''}">
            ${c.fechaVencimientoPago ? new Date(c.fechaVencimientoPago).toLocaleDateString() : 'N/A'}
            ${isVencida ? ' <span class="badge bg-red-lt">VENCIDA</span>' : ''}
          </td>
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

    // Attach payments listeners
    document.querySelectorAll('.btn-pagar-oc').forEach(btn => {
      btn.addEventListener('click', () => openAbonarCuenta(btn.dataset.id));
    });
  }

  renderComprasTable();
  renderCppTable();

  const hashParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
  if (hashParams.get('tab') === 'cpp') {
    const cppTab = document.querySelector('a[href="#tab-cuentas-pagar"]');
    if (cppTab) bootstrap.Tab.getOrCreateInstance(cppTab).show();
  }

  // Nueva OC: Add items to Cart
  const selectProd = document.getElementById('oc-producto-select');
  const inputCosto = document.getElementById('oc-producto-costo');
  const inputCant = document.getElementById('oc-producto-cantidad');
  const btnAddItem = document.getElementById('btn-add-item-oc');
  const tbodyCart = document.getElementById('oc-items-body');
  const labelTotal = document.getElementById('oc-cart-total');

  if (selectProd) {
    selectProd.addEventListener('change', () => {
      const pId = selectProd.value;
      if (!pId) return;
      const prod = productos.find(p => p.id === pId);
      if (prod) {
        inputCosto.value = Math.round(prod.precioCosto);
      }
    });

    btnAddItem.addEventListener('click', () => {
      const pId = selectProd.value;
      const costo = parseFloat(inputCosto.value || 0);
      const cant = parseInt(inputCant.value || 0);

      if (!pId || costo <= 0 || cant <= 0) {
        alert('Debe seleccionar producto, costo y cantidad válidos.');
        return;
      }

      const prod = productos.find(p => p.id === pId);
      if (!prod) return;

      // Check duplicates
      const exist = cartItems.find(item => item.productoId === pId);
      if (exist) {
        exist.cantidadPedida += cant;
      } else {
        cartItems.push({
          productoId: pId,
          nombre: prod.nombre,
          cantidadPedida: cant,
          precioUnitario: costo
        });
      }

      renderCart();
    });
  }

  function renderCart() {
    if (cartItems.length === 0) {
      tbodyCart.innerHTML = `<tr><td colspan="5" class="text-center text-secondary py-3">El carro de la orden está vacío.</td></tr>`;
      labelTotal.textContent = '$ 0';
      return;
    }

    let tot = 0;
    tbodyCart.innerHTML = cartItems.map((item, idx) => {
      const sub = item.cantidadPedida * item.precioUnitario;
      tot += sub;
      return `
        <tr>
          <td><strong>${item.nombre}</strong></td>
          <td class="text-center">${item.cantidadPedida}</td>
          <td class="text-end">${formatter.format(item.precioUnitario)}</td>
          <td class="text-end fw-bold text-primary">${formatter.format(sub)}</td>
          <td>
            <button type="button" class="btn btn-outline-danger btn-icon btn-sm btn-remove-cart" data-idx="${idx}" aria-label="Eliminar ítem del carrito">
              <i class="ti ti-trash"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    labelTotal.textContent = formatter.format(tot);

    document.querySelectorAll('.btn-remove-cart').forEach(btn => {
      btn.addEventListener('click', () => {
        cartItems.splice(parseInt(btn.dataset.idx), 1);
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
        alert('Debe agregar al menos un artículo a la orden de compra.');
        return;
      }

      const sedeId = document.getElementById('oc-sede')?.value;
      if (!sedeId) {
        alert('Debe seleccionar la sede destino donde ingresará el inventario.');
        return;
      }

      try {
        const payload = {
          proveedorId: document.getElementById('oc-proveedor').value,
          sedeId,
          fechaEsperada: document.getElementById('oc-fecha-esperada').value || null,
          observaciones: document.getElementById('oc-observaciones').value || '',
          items: cartItems
        };

        await apiFetch('/compras', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        alert('Orden de compra emitida con éxito.');
        cartItems = [];
        formOC.reset();
        renderCart();
        
        // Tab switch programmatically back to list
        const tabListEl = document.querySelector('a[href="#tab-ordenes-compra"]');
        bootstrap.Tab.getInstance(tabListEl).show();

        await loadInitialData();
        renderComprasTable();
        renderCppTable();
      } catch (err) {
        alert('Error al emitir orden de compra: ' + err.message);
      }
    });
  }

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
