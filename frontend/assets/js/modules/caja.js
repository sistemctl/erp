import { apiFetch } from '../api.js';
import { getUsuario } from '../auth.js';
import { getLocalDateStr } from '../utils/date.js';
import { showToast, showConfirm } from '../utils/toast.js';
import { erpHeader } from '../utils/module-shell.js';
import { erpAction } from '../utils/action-buttons.js';
import { printCierreTicket } from '../utils/cierre-ticket-print.js';

export async function initCaja(container) {
  const usuario = getUsuario();
  let currentSedeId = usuario.sedeId;
  const isAdminOrContador = ['admin', 'superadmin', 'contador'].includes(usuario.rol);

  let activeCaja = null;
  let limiteEgresoSinPin = 50000;
  let sedes = [];

  try {
    sedes = await apiFetch('/config/sedes').catch(() => []);
    if (!currentSedeId && sedes.length > 0) {
      currentSedeId = sedes[0].id;
    }
  } catch (e) {
    console.error('Error precargando sedes:', e);
  }

  container.innerHTML = `
    <div class="container-xl erp-module">
      ${erpHeader({
        eyebrow: 'Caja',
        title: 'Control y cuadre diario',
        subtitle: 'Ingresos, retiros físicos y cierres por sede'
      })}

      <!-- Navigation tabs -->
      <div class="card mb-3 d-print-none">
        <div class="card-header bg-transparent border-bottom">
          <ul class="nav nav-tabs card-header-tabs" data-bs-toggle="tabs" role="tablist">
            <li class="nav-item" role="presentation">
              <a href="#tab-caja-activa" class="nav-link active" data-bs-toggle="tab" aria-selected="true" role="tab">
                <i class="ti ti-lock-open me-1"></i> Caja Activa
              </a>
            </li>
            <li class="nav-item" role="presentation">
              <a href="#tab-historial-cajas" class="nav-link" data-bs-toggle="tab" aria-selected="false" role="tab" tabindex="-1">
                <i class="ti ti-history me-1"></i> Historial de Cierres
              </a>
            </li>
            <li class="nav-item" role="presentation">
              <a href="#tab-analisis-gastos" class="nav-link" data-bs-toggle="tab" aria-selected="false" role="tab" tabindex="-1">
                <i class="ti ti-chart-donut me-1"></i> Análisis de Gastos
              </a>
            </li>
            <li class="nav-item" role="presentation">
              <a href="#tab-movimientos-caja" class="nav-link" data-bs-toggle="tab" aria-selected="false" role="tab" tabindex="-1">
                <i class="ti ti-arrows-exchange me-1"></i> Movimientos
              </a>
            </li>
          </ul>
        </div>
        <div class="card-body">
          <div class="tab-content">
            <!-- TAB 1: CAJA ACTIVA -->
            <div class="tab-pane active show" id="tab-caja-activa" role="tabpanel">
              ${isAdminOrContador ? `
                <div class="card mb-2 d-print-none erp-filter-card">
                  <div class="card-body py-2">
                    <div class="row align-items-end g-2">
                      <div class="col-md-4">
                        <label class="form-label mb-1">Sede de Caja a Monitorear</label>
                        <select id="select-caja-sede" class="form-select form-select-sm">
                          ${sedes.map(s => `<option value="${s.id}" ${s.id === currentSedeId ? 'selected' : ''}>${s.nombre}</option>`).join('')}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              ` : ''}
              <div id="caja-modulo-body">
                <div class="text-center py-5">
                  <div class="spinner-border text-primary" role="status"></div>
                  <div class="mt-2 text-secondary">Consultando estado de caja…</div>
                </div>
              </div>
            </div>

            <!-- TAB 2: HISTORIAL DE CIERRES -->
            <div class="tab-pane" id="tab-historial-cajas" role="tabpanel">
              <div class="alert alert-info py-2 mb-2 d-print-none">
                <i class="ti ti-info-circle me-1"></i>
                Consulte cierres por rango de fechas. Haga clic en una fila o en <strong>Ver análisis</strong> para ver el desglose exacto por método de pago de ese día.
              </div>
              <div class="erp-list-workspace">
              <div class="card erp-filter-card">
                <div class="card-body">
                  <form id="form-filtros-historial-caja" class="row g-2 align-items-end">
                    ${['admin', 'superadmin'].includes(usuario.rol) ? `
                      <div class="col-md-4">
                        <label class="form-label">Sede</label>
                        <select id="hist-caja-sede" class="form-select">
                          <option value="">-- Todas las Sedes --</option>
                          ${sedes.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('')}
                        </select>
                      </div>
                    ` : `<input type="hidden" id="hist-caja-sede" value="">`}
                    <div class="col-md-3">
                      <label class="form-label">Desde</label>
                      <input type="date" id="hist-caja-desde" class="form-control">
                    </div>
                    <div class="col-md-3">
                      <label class="form-label">Hasta</label>
                      <input type="date" id="hist-caja-hasta" class="form-control">
                    </div>
                    <div class="col-md-2 d-flex align-items-end">
                      <button type="submit" class="btn btn-primary w-100 erp-filter-submit"><i class="ti ti-filter me-1"></i>Filtrar</button>
                    </div>
                  </form>
                </div>
              </div>

              <div class="card erp-table-panel">
                <div class="table-responsive">
                  <table class="table table-vcenter card-table table-hover caja-historial-table mb-0">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Sede</th>
                        <th>Cajero</th>
                        <th class="text-end">Efectivo</th>
                        <th class="text-end">Nequi</th>
                        <th class="text-end">Daviplata</th>
                        <th class="text-end">Tarjeta</th>
                        <th class="text-end">Transf.</th>
                        <th class="text-end">Total cobrado</th>
                        <th class="text-end">Egresos</th>
                        <th class="text-end">Diferencia</th>
                        <th class="text-center">Estado</th>
                        <th class="text-end">Acciones</th>
                      </tr>
                    </thead>
                    <tbody id="historial-cajas-table-body">
                      <tr><td colspan="13" class="text-center py-4 text-secondary">Seleccione fechas y haga clic en Consultar.</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
              </div>
            </div>

            <!-- TAB 3: ANÁLISIS DE GASTOS -->
            <div class="tab-pane" id="tab-analisis-gastos" role="tabpanel">
              <div class="card mb-2 erp-filter-card">
                <div class="card-body">
                  <form id="form-analisis-gastos" class="row g-2 align-items-end">
                ${isAdminOrContador ? `
                  <div class="col-md-3">
                    <label class="form-label">Sede</label>
                    <select id="analisis-gastos-sede" class="form-select">
                      ${sedes.map(s => `<option value="${s.id}" ${s.id === currentSedeId ? 'selected' : ''}>${s.nombre}</option>`).join('')}
                    </select>
                  </div>
                ` : `<input type="hidden" id="analisis-gastos-sede" value="${currentSedeId}">`}
                <div class="col-md-3">
                  <label class="form-label">Período</label>
                  <select id="analisis-gastos-periodo" class="form-select">
                    <option value="hoy">Hoy</option>
                    <option value="semana">Últimos 7 días</option>
                    <option value="mes" selected>Último mes</option>
                    <option value="año">Último año</option>
                  </select>
                </div>
                <div class="col-md-2 d-flex align-items-end">
                  <button type="submit" class="btn btn-primary w-100 erp-filter-submit"><i class="ti ti-filter me-1"></i>Filtrar</button>
                </div>
                  </form>
                </div>
              </div>

              <div class="row g-4">
                <div class="col-lg-4">
                  <div class="card">
                    <div class="card-body">
                      <h3 class="card-title">Por categoría</h3>
                      <div id="caja-gastos-total" class="fw-bold fs-3 text-danger mb-2">—</div>
                      <div style="position:relative;height:240px">
                        <canvas id="caja-chart-gastos"></canvas>
                      </div>
                      <div id="caja-gastos-empty" class="text-secondary small text-center py-3 d-none">
                        Sin egresos en el período. Registre retiros en Caja activa.
                      </div>
                    </div>
                  </div>
                </div>
                <div class="col-lg-8">
                  <div class="card">
                    <div class="card-header"><h3 class="card-title mb-0">Resumen por categoría</h3></div>
                    <div class="table-responsive">
                      <table class="table table-vcenter card-table table-sm mb-0">
                        <thead>
                          <tr>
                            <th>Categoría</th>
                            <th class="text-center">Movimientos</th>
                            <th class="text-end">Total</th>
                            <th class="text-end">% del total</th>
                          </tr>
                        </thead>
                        <tbody id="caja-gastos-categorias-tbody">
                          <tr><td colspan="4" class="text-center py-4 text-secondary">Seleccione período y actualice.</td></tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div class="card mt-3">
                    <div class="card-header"><h3 class="card-title mb-0">Movimientos registrados</h3></div>
                    <div class="table-responsive" style="max-height:280px;overflow-y:auto">
                      <table class="table table-vcenter card-table table-hover table-sm mb-0">
                        <thead class="sticky-top bg-white">
                          <tr>
                            <th>Fecha</th>
                            <th>Categoría</th>
                            <th>Motivo</th>
                            <th>Cajero</th>
                            <th class="text-end">Monto</th>
                          </tr>
                        </thead>
                        <tbody id="caja-gastos-detalle-tbody"></tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- TAB 4: MOVIMIENTOS FINANCIEROS -->
            <div class="tab-pane" id="tab-movimientos-caja" role="tabpanel">
              <div class="erp-list-workspace movimiento-workspace">
                <div class="card erp-filter-card">
                  <div class="card-body">
                    <form id="form-filtros-movimientos-caja" class="row g-2 align-items-end">
                      ${['admin', 'superadmin'].includes(usuario.rol) ? `
                        <div class="col-md-3">
                          <label class="form-label" for="mov-caja-sede">Sede</label>
                          <select id="mov-caja-sede" class="form-select">
                            <option value="">Todas las sedes</option>
                            ${sedes.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('')}
                          </select>
                        </div>
                      ` : `<input type="hidden" id="mov-caja-sede" value="">`}
                      <div class="col-6 col-md-2">
                        <label class="form-label" for="mov-caja-desde">Desde</label>
                        <input type="date" id="mov-caja-desde" class="form-control">
                      </div>
                      <div class="col-6 col-md-2">
                        <label class="form-label" for="mov-caja-hasta">Hasta</label>
                        <input type="date" id="mov-caja-hasta" class="form-control">
                      </div>
                      <div class="col-md-3">
                        <label class="form-label" for="mov-caja-tipo">Tipo</label>
                        <select id="mov-caja-tipo" class="form-select">
                          <option value="">Todos los movimientos</option>
                          <option value="apertura">Aperturas</option>
                          <option value="venta">Ventas</option>
                          <option value="abono">Abonos</option>
                          <option value="egreso">Egresos</option>
                          <option value="pago_compra">Pagos a proveedor</option>
                          <option value="devolucion">Devoluciones</option>
                        </select>
                      </div>
                      <div class="col-md-2 d-flex align-items-end">
                        <button type="submit" class="btn btn-primary w-100 erp-filter-submit"><i class="ti ti-filter me-1"></i>Filtrar</button>
                      </div>
                    </form>
                  </div>
                </div>

                <div class="card erp-table-panel movimiento-panel">
                  <div class="table-responsive">
                    <table class="table table-vcenter card-table table-hover mb-0 movimiento-table">
                      <thead>
                        <tr>
                          <th>Fecha y hora</th>
                          <th>Movimiento</th>
                          <th>Concepto</th>
                          <th>Responsable</th>
                          <th>Medio</th>
                          <th class="text-end">Valor</th>
                          <th class="text-end">Acciones</th>
                        </tr>
                      </thead>
                      <tbody id="movimientos-caja-tbody">
                        <tr><td colspan="7" class="text-center py-4 text-secondary">Seleccione un período para consultar movimientos.</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <div class="movimiento-pagination" id="movimientos-caja-pagination" hidden>
                    <button type="button" class="btn btn-sm btn-outline-secondary" id="mov-caja-prev" title="Página anterior" aria-label="Página anterior"><i class="ti ti-chevron-left"></i></button>
                    <span id="mov-caja-page-info" class="text-secondary small"></span>
                    <button type="button" class="btn btn-sm btn-outline-secondary" id="mov-caja-next" title="Página siguiente" aria-label="Página siguiente"><i class="ti ti-chevron-right"></i></button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal Apertura de Caja -->
    <div class="modal modal-blur fade" id="modal-apertura" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered" role="document">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Apertura de Caja Diaria</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <form id="form-apertura">
            <div class="modal-body">
              <div class="mb-3">
                <label class="form-label">Monto de Apertura (Efectivo Base en COP)</label>
                <input type="number" id="apertura-monto" class="form-control" placeholder="Ej: 100000" min="0" required>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-link link-secondary" data-bs-dismiss="modal">Cancelar</button>
              <button type="submit" class="btn btn-primary ms-auto">Abrir Caja de la Sede</button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- Modal Registrar Egreso -->
    <div class="modal modal-blur fade" id="modal-egreso" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered" role="document">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Registrar Retiro de Caja (Egreso)</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <form id="form-egreso">
            <div class="modal-body">
              <div class="mb-3">
                <label class="form-label">Monto a Retirar (COP)</label>
                <input type="number" id="egreso-monto" class="form-control" min="100" required placeholder="Ej: 15000">
                <div class="mt-2 d-flex align-items-center gap-2 flex-wrap">
                  <button type="button" class="btn btn-sm btn-outline-danger" id="btn-sacar-todo-efectivo">
                    <i class="ti ti-cash-off me-1"></i> Sacar todo el efectivo
                  </button>
                  <span class="text-secondary small" id="egreso-saldo-hint"></span>
                </div>
              </div>
              <div class="mb-3">
                <label class="form-label">Categoría del Egreso</label>
                <select id="egreso-categoria" class="form-select" required></select>
              </div>
              <div class="mb-3">
                <label class="form-label">Motivo Detallado (Obligatorio)</label>
                <input type="text" id="egreso-motivo" class="form-control" required placeholder="Ej: Compra de papelería urgente">
              </div>
              
              <!-- Campo PIN de Admin si supera el límite -->
              <div id="pin-admin-wrapper" class="mb-3 d-none">
                <label class="form-label text-danger fw-bold">Requiere PIN del Administrador (Monto alto)</label>
                <input type="password" id="egreso-pin" class="form-control" placeholder="Contraseña de Administrador">
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-link link-secondary" data-bs-dismiss="modal">Cancelar</button>
              <button type="submit" class="btn btn-danger ms-auto">Registrar Egreso</button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- Modal Cierre de Caja -->
    <div class="modal modal-blur fade" id="modal-cierre" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-centered" role="document">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Cierre y Cuadre de Caja Diaria</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <form id="form-cierre">
            <div class="modal-body">
              <div class="alert alert-info">
                Por favor, realice el conteo de dinero físico e ingrese los totales por cada método de pago.
              </div>
              <div class="row">
                <div class="col-md-6">
                  <h4 class="mb-3">Valores en Caja</h4>
                  <div class="mb-3">
                    <label class="form-label">Efectivo Físico Contado</label>
                    <input type="number" id="cierre-efectivo" class="form-control" required min="0">
                  </div>
                  <div class="mb-3">
                    <label class="form-label">Total Nequi</label>
                    <input type="number" id="cierre-nequi" class="form-control" required min="0">
                  </div>
                  <div class="mb-3">
                    <label class="form-label">Total Daviplata</label>
                    <input type="number" id="cierre-daviplata" class="form-control" required min="0">
                  </div>
                </div>
                <div class="col-md-6">
                  <h4 class="mb-3">&nbsp;</h4>
                  <div class="mb-3">
                    <label class="form-label">Total Tarjetas</label>
                    <input type="number" id="cierre-tarjeta" class="form-control" required min="0">
                  </div>
                  <div class="mb-3">
                    <label class="form-label">Total Transferencias</label>
                    <input type="number" id="cierre-transferencia" class="form-control" required min="0">
                  </div>
                  <div id="cierre-medios-extra"></div>
                  <div class="mb-3">
                    <label class="form-label">Observaciones y Notas</label>
                    <textarea id="cierre-observaciones" class="form-control" rows="2" placeholder="Describa diferencias si las hay…"></textarea>
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-link link-secondary" data-bs-dismiss="modal">Cancelar</button>
              <button type="submit" class="btn btn-primary ms-auto">Proceder con el Cierre</button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- Modal Detalle Past Caja -->
    <div class="modal modal-blur fade" id="modal-detalle-past-caja" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-centered" role="document">
        <div class="modal-content" id="detalle-past-caja-content">
          <!-- Dinámico -->
        </div>
      </div>
    </div>

    <!-- Modal Reporte Z Cierre -->
    <div class="modal modal-blur fade" id="modal-cierre-z-report" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-centered" role="document">
        <div class="modal-content" id="cierre-z-modal-content">
          <!-- Dinámico -->
        </div>
      </div>
    </div>

    <div class="modal modal-blur fade" id="modal-detalle-movimiento-caja" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered" role="document">
        <div class="modal-content" id="detalle-movimiento-caja-content"></div>
      </div>
    </div>
  `;

  const modalApertura = new bootstrap.Modal(document.getElementById('modal-apertura'));
  const modalEgreso = new bootstrap.Modal(document.getElementById('modal-egreso'));
  const modalCierre = new bootstrap.Modal(document.getElementById('modal-cierre'));
  const modalDetallePast = new bootstrap.Modal(document.getElementById('modal-detalle-past-caja'));
  const modalCierreZReport = new bootstrap.Modal(document.getElementById('modal-cierre-z-report'));
  const modalDetalleMovimiento = new bootstrap.Modal(document.getElementById('modal-detalle-movimiento-caja'));

  if (isAdminOrContador) {
    const selectSede = document.getElementById('select-caja-sede');
    if (selectSede) {
      selectSede.addEventListener('change', (e) => {
        currentSedeId = e.target.value;
        loadCajaStatus();
      });
    }
  }

  const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);

  const METODOS_PAGO_CAJA = [
    { key: 'totalVentasEfectivo', label: 'Efectivo', icon: 'ti-cash', tone: 'green' },
    { key: 'totalVentasNequi', label: 'Nequi', icon: 'ti-device-mobile', tone: 'purple' },
    { key: 'totalVentasDaviplata', label: 'Daviplata', icon: 'ti-wallet', tone: 'pink' },
    { key: 'totalVentasTarjeta', label: 'Tarjeta', icon: 'ti-credit-card', tone: 'blue' },
    { key: 'totalVentasTransferencia', label: 'Transferencia', icon: 'ti-building-bank', tone: 'cyan' }
  ];
  let mediosPagoConfigurados = [];

  const HISTORIAL_COLS = 13;
  let historialCache = [];

  const getMetodosCaja = (cajaData) => {
    const base = METODOS_PAGO_CAJA.map((medio) => ({ ...medio, monto: parseFloat(cajaData[medio.key] || 0) }));
    const idsBase = new Set(['efectivo', 'nequi', 'daviplata', 'tarjeta', 'transferencia']);
    const extras = mediosPagoConfigurados
      .filter((medio) => medio?.id && !idsBase.has(medio.id))
      .map((medio, index) => ({
        key: medio.id,
        label: medio.nombre || medio.id,
        icon: 'ti-wallet',
        tone: ['indigo', 'orange', 'azure', 'lime'][index % 4],
        monto: parseFloat(cajaData.totalesPorMetodo?.[medio.id] || 0)
      }));
    return [...base, ...extras];
  };

  const calcTotalIngresos = (cajaData) =>
    getMetodosCaja(cajaData).reduce((sum, m) => sum + m.monto, 0);

  const buildDesglosePagosHtml = (cajaData, opts = {}) => {
    const {
      title = 'Ingresos del día por método de pago',
      totalLabel = 'Total cobrado',
      showNote = true,
      embedded = false
    } = opts;

    const montos = getMetodosCaja(cajaData);
    const totalIngresos = montos.reduce((sum, m) => sum + m.monto, 0);

    const tarjetas = montos.map(m => {
      const pct = totalIngresos > 0 ? Math.round((m.monto / totalIngresos) * 100) : 0;
      return `
        <div class="col-sm-6 col-lg-4 col-xl">
          <div class="caja-metodo-card">
            <div class="d-flex align-items-center gap-2 mb-2">
              <span class="avatar avatar-sm bg-${m.tone}-lt text-${m.tone}"><i class="ti ${m.icon}"></i></span>
              <span class="caja-metodo-label">${m.label}</span>
            </div>
            <div class="caja-metodo-monto">${formatter.format(m.monto)}</div>
            <div class="caja-metodo-bar mt-2">
              <div class="caja-metodo-bar-fill bg-${m.tone}" style="width: ${pct}%"></div>
            </div>
            <div class="caja-metodo-pct text-secondary">${pct}% del total</div>
          </div>
        </div>
      `;
    }).join('');

    const inner = `
      <div class="${embedded ? '' : 'card-header'} d-flex flex-wrap align-items-center justify-content-between gap-2 ${embedded ? 'mb-3' : ''}">
        <h3 class="${embedded ? 'h4' : 'card-title'} mb-0"><i class="ti ti-chart-pie me-1"></i> ${title}</h3>
        <div class="text-end">
          <div class="text-secondary small">${totalLabel}</div>
          <div class="fw-bold fs-4 text-primary">${formatter.format(totalIngresos)}</div>
        </div>
      </div>
      <div class="${embedded ? '' : 'card-body'}">
        <div class="row g-3">${tarjetas}</div>
        ${showNote ? `
          <p class="text-secondary small mb-0 mt-3">
            Incluye ventas del POS, cobros de reparaciones y abonos de cartera de esta sesión.
            Base de apertura: ${formatter.format(parseFloat(cajaData.montoApertura || 0))} · Egresos: ${formatter.format(parseFloat(cajaData.totalEgresos || 0))}.
          </p>
        ` : ''}
      </div>
    `;

    return embedded
      ? `<div class="caja-desglose-embedded">${inner}</div>`
      : `<div class="card mb-4">${inner}</div>`;
  };

  const setDefaultHistorialFechas = () => {
    const hasta = getLocalDateStr();
    const desdeDate = new Date();
    desdeDate.setDate(desdeDate.getDate() - 30);
    const desde = desdeDate.toISOString().split('T')[0];
    const elDesde = document.getElementById('hist-caja-desde');
    const elHasta = document.getElementById('hist-caja-hasta');
    if (elDesde && !elDesde.value) elDesde.value = desde;
    if (elHasta && !elHasta.value) elHasta.value = hasta;
  };

  // Cargar categorías de egreso en el select
  const loadCategorias = async () => {
    try {
      const cats = await apiFetch('/caja/categorias-egreso');
      const select = document.getElementById('egreso-categoria');
      if (select) {
        select.innerHTML = cats.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Consultar configuración de límites
  const loadLimites = async () => {
    try {
      const sysConfig = await apiFetch('/config/sistema');
      limiteEgresoSinPin = parseFloat(sysConfig.egresoMaximoSinPin || 50000);
      mediosPagoConfigurados = Array.isArray(sysConfig.mediosPago)
        ? sysConfig.mediosPago.filter((medio) => medio?.id && medio.activo !== false)
        : [];
    } catch (e) {
      console.error(e);
    }
  };

  const loadCajaStatus = async () => {
    const body = document.getElementById('caja-modulo-body');
    if (!body) return;
    body.innerHTML = `<div class="text-center py-5"><div class="spinner-border text-primary" role="status"></div></div>`;

    try {
      const hoyStr = getLocalDateStr();
      const data = await apiFetch(`/caja/reporte?fecha=${hoyStr}&sede=${currentSedeId}`, { silent: true }).catch(() => null);

      if (!data?.id || data.estado === 'cerrada' || data.estado === 'sin_registro') {
        activeCaja = null;
        body.innerHTML = `
          <div class="card p-5 text-center">
            <div class="mb-3">
              <i class="ti ti-lock fs-1 text-secondary"></i>
            </div>
            <h3>Caja Cerrada o Inactiva</h3>
            <p class="text-secondary">Para comenzar a operar y registrar transacciones en el Punto de Venta, debe realizar la apertura base de la caja hoy.</p>
            <div class="mt-4">
              <button id="btn-abrir-caja-inicio" class="btn btn-primary">Hacer Apertura de Caja</button>
            </div>
          </div>
        `;

        document.getElementById('btn-abrir-caja-inicio').addEventListener('click', () => {
          document.getElementById('form-apertura').reset();
          modalApertura.show();
        });
        return;
      }

      // Caja abierta
      activeCaja = data;
      const saldoEfectivoTeorico = parseFloat(data.montoApertura) + parseFloat(data.totalVentasEfectivo) - parseFloat(data.totalEgresos);

      body.innerHTML = `
        <div class="row row-cards mb-4">
          <div class="col-md-4">
            <div class="card card-sm">
              <div class="card-body">
                <div class="d-flex align-items-center">
                  <span class="avatar bg-green-lt me-3"><i class="ti ti-lock-open fs-2"></i></span>
                  <div>
                    <h3 class="mb-0">Estado: ABIERTA</h3>
                    <div class="text-secondary small">Abierta el ${new Date(data.createdAt).toLocaleDateString()} a las ${new Date(data.createdAt).toLocaleTimeString()}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="col-md-4">
            <div class="card card-sm">
              <div class="card-body">
                <div class="d-flex align-items-center">
                  <span class="avatar bg-blue-lt me-3"><i class="ti ti-cash fs-2"></i></span>
                  <div>
                    <h3 class="mb-0">${formatter.format(saldoEfectivoTeorico)}</h3>
                    <div class="text-secondary small">Efectivo Físico Teórico en Caja</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="col-md-4">
            <div class="card card-sm">
              <div class="card-body">
                <div class="d-flex align-items-center">
                  <span class="avatar bg-red-lt me-3"><i class="ti ti-upload fs-2"></i></span>
                  <div>
                    <h3 class="mb-0">${formatter.format(data.totalEgresos)}</h3>
                    <div class="text-secondary small">Total Retiros de Caja (Egresos)</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        ${buildDesglosePagosHtml(data)}

        <div class="mb-4 btn-list text-start">
          <button id="btn-pos-egreso" class="btn btn-danger">
            <i class="ti ti-plus me-2"></i> Registrar Egreso / Retiro
          </button>
          <button id="btn-pos-cierre" class="btn btn-primary">
            <i class="ti ti-lock me-2"></i> Hacer Cierre de Caja
          </button>
          ${['admin', 'superadmin'].includes(usuario.rol) ? `
            <button id="btn-pos-liberar" class="btn btn-warning">
              <i class="ti ti-key me-2"></i> Liberar Caja (Admin)
            </button>
          ` : ''}
        </div>

        <div class="card">
          <div class="card-header"><h3 class="card-title">Historial de Retiros de Caja (Egresos del Día)</h3></div>
          <div class="table-responsive">
            <table class="table table-vcenter card-table table-hover">
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Cajero</th>
                  <th>Categoría</th>
                  <th>Motivo</th>
                  <th>Monto (COP)</th>
                  <th>Autorización</th>
                </tr>
              </thead>
              <tbody id="egresos-table-body">
                 <tr><td colspan="6" class="text-center py-3">Consultando retiros…</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      `;

      loadEgresosList();

      document.getElementById('btn-pos-egreso').addEventListener('click', () => {
        abrirModalEgreso();
      });

      document.getElementById('btn-pos-cierre').addEventListener('click', () => {
        document.getElementById('form-cierre').reset();
        document.getElementById('cierre-efectivo').value = saldoEfectivoTeorico;
        document.getElementById('cierre-nequi').value = data.totalVentasNequi;
        document.getElementById('cierre-daviplata').value = data.totalVentasDaviplata;
        document.getElementById('cierre-tarjeta').value = data.totalVentasTarjeta;
        document.getElementById('cierre-transferencia').value = data.totalVentasTransferencia;
        const extrasCierre = getMetodosCaja(data).filter((medio) => !METODOS_PAGO_CAJA.some((base) => base.key === medio.key));
        document.getElementById('cierre-medios-extra').innerHTML = extrasCierre.map((medio) => `
          <div class="mb-3">
            <label class="form-label">Total ${medio.label}</label>
            <input type="number" class="form-control cierre-medio-extra" data-metodo="${medio.key}" min="0" value="${medio.monto}">
          </div>
        `).join('');
        modalCierre.show();
      });

      if (['admin', 'superadmin'].includes(usuario.rol)) {
        document.getElementById('btn-pos-liberar').addEventListener('click', async () => {
          const confirmed = await showConfirm(
            '¿Liberar Caja?',
            'Se cerrará administrativamente esta caja abierta utilizando los saldos teóricos actuales del sistema (diferencia cero). Esta acción se registrará en la auditoría.'
          );
          if (confirmed) {
            try {
              const res = await apiFetch('/caja/liberar', {
                method: 'POST',
                body: JSON.stringify({ sedeId: currentSedeId })
              });
              showToast('Éxito', res.message, 'success');
              loadCajaStatus();
            } catch (err) {
              showToast('Error', err.message, 'error');
            }
          }
        });
      }


    } catch (err) {
      body.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
    }
  };

  const loadEgresosList = async () => {
    const tbody = document.getElementById('egresos-table-body');
    if (!tbody) return;
    try {
      const queryFecha = activeCaja ? activeCaja.fecha : getLocalDateStr();
      const data = await apiFetch(`/caja/egresos?sede=${currentSedeId}&fecha=${queryFecha}`);

      if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-3 text-secondary">No se han registrado retiros de caja para esta sesión.</td></tr>`;
        return;
      }

      tbody.innerHTML = data.map(e => `
        <tr>
          <td>${new Date(e.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
          <td>${e.usuario ? e.usuario.nombre : 'Cajero'}</td>
          <td><span class="badge bg-secondary-lt">${e.categoria.nombre}</span></td>
          <td class="fw-semibold text-truncate" style="max-width: 250px;">${e.motivo}</td>
          <td class="fw-bold text-danger">${formatter.format(e.monto)}</td>
          <td>${e.requirioPin ? '<span class="badge bg-red text-white">PIN Admin</span>' : '<span class="badge bg-green-lt">Autónomo</span>'}</td>
        </tr>
      `).join('');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-3 text-danger">Error al cargar retiros.</td></tr>`;
    }
  };

  // Submit Apertura
  document.getElementById('form-apertura').addEventListener('submit', async (e) => {
    e.preventDefault();
    const monto = document.getElementById('apertura-monto').value;
    try {
      await apiFetch('/caja/apertura', {
        method: 'POST',
        body: JSON.stringify({ montoApertura: parseFloat(monto), sedeId: currentSedeId })
      });
      modalApertura.hide();
      loadCajaStatus();
    } catch (err) {
      showToast('Error', err.message, 'error');
    }
  });

  // Helpers egreso / saldo efectivo
  const getSaldoEfectivoDisponible = () => {
    if (!activeCaja) return 0;
    return parseFloat(activeCaja.montoApertura || 0)
      + parseFloat(activeCaja.totalVentasEfectivo || 0)
      - parseFloat(activeCaja.totalEgresos || 0);
  };

  const syncEgresoPinPorMonto = (val) => {
    const pinWrapper = document.getElementById('pin-admin-wrapper');
    if (!pinWrapper) return;
    if (val > limiteEgresoSinPin) {
      pinWrapper.classList.remove('d-none');
      document.getElementById('egreso-pin').required = true;
    } else {
      pinWrapper.classList.add('d-none');
      document.getElementById('egreso-pin').required = false;
    }
  };

  const actualizarBtnSacarTodo = () => {
    const btn = document.getElementById('btn-sacar-todo-efectivo');
    const hint = document.getElementById('egreso-saldo-hint');
    const saldo = getSaldoEfectivoDisponible();
    if (!btn) return;

    btn.disabled = !(activeCaja && saldo > 0);
    if (hint) {
      hint.textContent = activeCaja
        ? `Disponible en caja: ${formatter.format(saldo)}`
        : 'No hay caja abierta';
    }
  };

  const abrirModalEgreso = () => {
    document.getElementById('form-egreso').reset();
    document.getElementById('pin-admin-wrapper').classList.add('d-none');
    document.getElementById('egreso-pin').required = false;
    actualizarBtnSacarTodo();
    modalEgreso.show();
  };

  // PIN Admin logic
  document.getElementById('egreso-monto').addEventListener('input', (e) => {
    syncEgresoPinPorMonto(parseFloat(e.target.value || 0));
  });

  document.getElementById('btn-sacar-todo-efectivo').addEventListener('click', () => {
    const saldo = getSaldoEfectivoDisponible();
    if (!activeCaja || saldo <= 0) {
      showToast('No disponible', 'No hay efectivo disponible en caja para retirar.', 'warning');
      actualizarBtnSacarTodo();
      return;
    }
    const montoInput = document.getElementById('egreso-monto');
    montoInput.value = saldo;
    syncEgresoPinPorMonto(saldo);
    showToast('Monto cargado', `Se cargó todo el efectivo disponible (${formatter.format(saldo)}). Complete categoría y motivo para registrar.`, 'info');
  });

  // Submit Egreso
  document.getElementById('form-egreso').addEventListener('submit', async (e) => {
    e.preventDefault();
    const montoVal = parseFloat(document.getElementById('egreso-monto').value);
    const saldo = getSaldoEfectivoDisponible();

    if (!activeCaja) {
      showToast('Error', 'No hay caja abierta para registrar el egreso.', 'error');
      return;
    }
    if (montoVal > saldo) {
      showToast('Monto inválido', `El monto no puede superar el efectivo en caja (${formatter.format(saldo)}).`, 'error');
      return;
    }

    const data = {
      monto: montoVal,
      categoriaId: document.getElementById('egreso-categoria').value,
      motivo: document.getElementById('egreso-motivo').value,
      sedeId: currentSedeId
    };

    if (montoVal > limiteEgresoSinPin) {
      data.pinAdmin = document.getElementById('egreso-pin').value;
    }

    try {
      await apiFetch('/caja/egreso', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      modalEgreso.hide();
      loadCajaStatus();
    } catch (err) {
      showToast('Error', err.message, 'error');
    }
  });

  // Mostrar Modal interactivo del Reporte Z
  const mostrarModalReporteZ = async (cajaId) => {
    const content = document.getElementById('cierre-z-modal-content');
    if (!content) return;

    content.innerHTML = `
      <div class="modal-body text-center py-5">
        <div class="spinner-border text-primary" role="status"></div>
        <div class="mt-2 text-secondary">Cargando Informe Z de Cierre…</div>
      </div>
    `;
    modalCierreZReport.show();

    try {
      const zData = await apiFetch(`/caja/${cajaId}/detalle-z`);
      const { caja, detalle } = zData;

      const diff = parseFloat(caja.diferencia || 0);
      let diffBadge = '<span class="badge bg-success-lt fs-3 px-3 py-2"><i class="ti ti-check me-1"></i> Caja Cuadrada a la Perfección</span>';
      if (diff > 0) {
        diffBadge = `<span class="badge bg-warning-lt fs-3 px-3 py-2"><i class="ti ti-alert-triangle me-1"></i> Sobrante de Caja: ${formatter.format(diff)}</span>`;
      } else if (diff < 0) {
        diffBadge = `<span class="badge bg-danger-lt fs-3 px-3 py-2"><i class="ti ti-alert-circle me-1"></i> Faltante de Caja: ${formatter.format(Math.abs(diff))}</span>`;
      }

      content.innerHTML = `
        <div class="modal-header bg-light py-3">
          <h4 class="modal-title">
            <i class="ti ti-report-money text-primary me-2"></i>Informe Z de Cierre de Caja #${caja.id}
          </h4>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div class="text-center mb-4">
            ${diffBadge}
            <div class="text-secondary small mt-2">Sede: ${caja.sede?.nombre || 'General'} | Fecha: ${caja.fecha} | Cierre por: ${caja.usuarioCierre?.nombre || 'N/A'}</div>
          </div>

          ${buildDesglosePagosHtml(caja, {
            title: 'Resumen de Ventas e Ingresos por Medio de Pago',
            totalLabel: 'Total Ventas',
            showNote: false,
            embedded: true
          })}

          <div class="card mt-3 mb-3">
            <div class="card-header py-2"><h4 class="card-title mb-0">Arqueo de Efectivo</h4></div>
            <div class="card-body p-0">
              <table class="table table-sm mb-0">
                <tbody>
                  <tr><th class="ps-3">Fondo Base (Apertura)</th><td class="text-end pe-3">${formatter.format(caja.montoApertura)}</td></tr>
                  <tr><th class="ps-3">Efectivo Ingresado por Ventas</th><td class="text-end pe-3 text-success">+${formatter.format(caja.totalVentasEfectivo)}</td></tr>
                  <tr><th class="ps-3 text-danger">Retiros / Egresos Realizados</th><td class="text-end pe-3 text-danger">-${formatter.format(caja.totalEgresos)}</td></tr>
                  <tr class="table-light"><th class="ps-3">Efectivo Esperado Teórico</th><td class="text-end pe-3 fw-bold">${formatter.format(parseFloat(caja.montoApertura) + parseFloat(caja.totalVentasEfectivo) - parseFloat(caja.totalEgresos))}</td></tr>
                  <tr class="table-light"><th class="ps-3">Diferencia Final</th><td class="text-end pe-3 fw-bold ${diff >= 0 ? 'text-success' : 'text-danger'}">${formatter.format(caja.diferencia)}</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          ${caja.observaciones ? `
            <div class="alert alert-warning py-2 mb-0">
              <strong>Observaciones de Cierre:</strong> ${caja.observaciones}
            </div>
          ` : ''}
        </div>
        <div class="modal-footer d-flex justify-content-between flex-wrap gap-2">
          <div>
            <button type="button" id="btn-z-ir-historia" class="btn btn-outline-secondary">
              <i class="ti ti-history me-1"></i> Ver en Historial
            </button>
          </div>
          <div class="d-flex gap-2">
            <button type="button" id="btn-z-ticket-print" class="btn btn-dark">
              <i class="ti ti-printer me-1"></i> Imprimir Ticket Térmico Z
            </button>
            <a href="/api/caja/${caja.id}/reporte-z-pdf" target="_blank" class="btn btn-primary">
              <i class="ti ti-file-pdf me-1"></i> Descargar PDF (Reporte Z)
            </a>
          </div>
        </div>
      `;

      document.getElementById('btn-z-ticket-print')?.addEventListener('click', () => {
        printCierreTicket(zData);
      });

      document.getElementById('btn-z-ir-historia')?.addEventListener('click', async () => {
        modalCierreZReport.hide();
        await abrirHistorialConCaja(caja.id, caja.fecha);
      });
    } catch (err) {
      content.innerHTML = `
        <div class="modal-body py-4">
          <div class="alert alert-danger mb-0">Error al cargar Informe Z: ${err.message}</div>
        </div>
      `;
    }
  };

  // Submit Cierre
  document.getElementById('form-cierre').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      totalVentasEfectivo: parseFloat(document.getElementById('cierre-efectivo').value || 0),
      totalVentasNequi: parseFloat(document.getElementById('cierre-nequi').value || 0),
      totalVentasDaviplata: parseFloat(document.getElementById('cierre-daviplata').value || 0),
      totalVentasTarjeta: parseFloat(document.getElementById('cierre-tarjeta').value || 0),
      totalVentasTransferencia: parseFloat(document.getElementById('cierre-transferencia').value || 0),
      totalesPorMetodo: Object.fromEntries([...document.querySelectorAll('.cierre-medio-extra')]
        .map((input) => [input.dataset.metodo, parseFloat(input.value || 0)])),
      observaciones: document.getElementById('cierre-observaciones').value,
      sedeId: currentSedeId
    };

    try {
      const res = await apiFetch('/caja/cierre', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      modalCierre.hide();

      showToast('Cierre Exitoso', 'Caja cerrada exitosamente. Desplegando Reporte Z…', 'success');

      loadCajaStatus();

      if (res.caja?.id) {
        await mostrarModalReporteZ(res.caja.id);
      }
    } catch (err) {
      showToast('Error', err.message, 'error');
    }
  });

  // --- TAB 2: HISTORIAL DE CIERRES ---
  const tbodyHist = document.getElementById('historial-cajas-table-body');

  const renderHistorialRows = (historyData, highlightId = null) => {
    historialCache = historyData;

    tbodyHist.innerHTML = historyData.map(c => {
      const statusBadge = c.estado === 'abierta' ? 'bg-yellow-lt' : 'bg-success-lt';
      const totalCobrado = calcTotalIngresos(c);
      const isHighlight = highlightId && String(c.id) === String(highlightId);

      return `
        <tr class="caja-historial-row ${isHighlight ? 'caja-historial-row-highlight' : ''}" data-id="${c.id}" role="button" tabindex="0">
          <td><strong>${c.fecha}</strong></td>
          <td>${c.sede ? c.sede.nombre : 'N/A'}</td>
          <td class="text-truncate" style="max-width: 120px;">${c.usuarioCierre ? c.usuarioCierre.nombre : (c.usuarioApertura ? c.usuarioApertura.nombre : 'N/A')}</td>
          <td class="text-end text-nowrap small">${formatter.format(c.totalVentasEfectivo)}</td>
          <td class="text-end text-nowrap small">${formatter.format(c.totalVentasNequi)}</td>
          <td class="text-end text-nowrap small">${formatter.format(c.totalVentasDaviplata)}</td>
          <td class="text-end text-nowrap small">${formatter.format(c.totalVentasTarjeta)}</td>
          <td class="text-end text-nowrap small">${formatter.format(c.totalVentasTransferencia)}</td>
          <td class="text-end fw-bold text-primary text-nowrap">${formatter.format(totalCobrado)}</td>
          <td class="text-end text-danger text-nowrap small">${formatter.format(c.totalEgresos)}</td>
          <td class="text-end fw-bold text-nowrap ${parseFloat(c.diferencia) >= 0 ? 'text-success' : 'text-danger'}">${formatter.format(c.diferencia)}</td>
          <td class="text-center"><span class="badge ${statusBadge} px-2 py-1">${c.estado.toUpperCase()}</span></td>
          <td class="text-end erp-td-actions">
            ${erpAction('chart', { className: 'btn-ver-past-caja', attrs: { 'data-id': c.id }, label: 'Ver' })}
          </td>
        </tr>
      `;
    }).join('');

    tbodyHist.querySelectorAll('.caja-historial-row').forEach(row => {
      const open = () => openPastCajaDetalle(row.dataset.id, historialCache);
      row.addEventListener('click', (e) => {
        if (e.target.closest('.btn-ver-past-caja')) return;
        open();
      });
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      });
    });

    tbodyHist.querySelectorAll('.btn-ver-past-caja').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openPastCajaDetalle(btn.dataset.id, historialCache);
      });
    });

    if (highlightId) {
      const row = tbodyHist.querySelector(`tr[data-id="${highlightId}"]`);
      row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const loadHistorialCajas = async (highlightId = null) => {
    tbodyHist.innerHTML = `<tr><td colspan="${HISTORIAL_COLS}" class="text-center py-4"><div class="spinner-border text-primary" role="status"></div></td></tr>`;

    try {
      const histSede = document.getElementById('hist-caja-sede') ? document.getElementById('hist-caja-sede').value : '';
      const desde = document.getElementById('hist-caja-desde').value;
      const hasta = document.getElementById('hist-caja-hasta').value;

      const params = [];
      if (histSede) params.push(`sede=${histSede}`);
      if (desde) params.push(`desde=${desde}`);
      if (hasta) params.push(`hasta=${hasta}`);

      const query = params.length > 0 ? '?' + params.join('&') : '';
      const historyData = await apiFetch(`/caja/historial${query}`);

      if (historyData.length === 0) {
        tbodyHist.innerHTML = `<tr><td colspan="${HISTORIAL_COLS}" class="text-center py-4 text-secondary">No se encontraron cierres de caja en el rango seleccionado.</td></tr>`;
        return;
      }

      renderHistorialRows(historyData, highlightId);

      if (highlightId) {
        openPastCajaDetalle(highlightId, historialCache);
      }
    } catch (err) {
      tbodyHist.innerHTML = `<tr><td colspan="${HISTORIAL_COLS}" class="text-center py-4 text-danger">Error: ${err.message}</td></tr>`;
    }
  };

  const abrirHistorialConCaja = async (cajaId, fecha) => {
    const tabEl = document.querySelector('a[href="#tab-historial-cajas"]');
    if (tabEl) bootstrap.Tab.getOrCreateInstance(tabEl).show();

    if (fecha) {
      document.getElementById('hist-caja-desde').value = fecha;
      document.getElementById('hist-caja-hasta').value = fecha;
    }
    await loadHistorialCajas(cajaId);
  };

  document.getElementById('form-filtros-historial-caja').addEventListener('submit', async (e) => {
    e.preventDefault();
    await loadHistorialCajas();
  });

  document.querySelector('a[href="#tab-historial-cajas"]')?.addEventListener('shown.bs.tab', () => {
    setDefaultHistorialFechas();
  });

  // --- TAB 4: MOVIMIENTOS FINANCIEROS ---
  const movimientosCajaTbody = document.getElementById('movimientos-caja-tbody');
  const movimientosCajaPagination = document.getElementById('movimientos-caja-pagination');
  let movimientosCajaPage = 1;
  let movimientosCajaLoaded = false;
  let movimientosCajaCache = [];
  let movimientosCajaMeta = { page: 1, totalPages: 1, total: 0 };

  const setDefaultMovimientosCajaFechas = () => {
    const hasta = getLocalDateStr();
    const desdeDate = new Date();
    desdeDate.setDate(desdeDate.getDate() - 30);
    const desde = desdeDate.toISOString().split('T')[0];
    const elDesde = document.getElementById('mov-caja-desde');
    const elHasta = document.getElementById('mov-caja-hasta');
    if (elDesde && !elDesde.value) elDesde.value = desde;
    if (elHasta && !elHasta.value) elHasta.value = hasta;
  };

  const formatMovimientoFecha = (fecha) => {
    const date = new Date(fecha);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('es-CO', {
      dateStyle: 'short', timeStyle: 'short'
    });
  };

  const renderMovimientosCaja = (data) => {
    movimientosCajaCache = data.items || [];
    movimientosCajaMeta = data.pagination || movimientosCajaMeta;
    const items = movimientosCajaCache;

    if (!items.length) {
      movimientosCajaTbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-secondary">No hay movimientos financieros para los filtros seleccionados.</td></tr>';
      movimientosCajaPagination.hidden = true;
      return;
    }

    movimientosCajaTbody.innerHTML = items.map((movimiento) => {
      const isEntrada = movimiento.direccion === 'entrada';
      const directionClass = isEntrada ? 'movimiento-direction--in' : 'movimiento-direction--out';
      const directionIcon = isEntrada ? 'ti-arrow-down-left' : 'ti-arrow-up-right';
      const directionLabel = isEntrada ? 'Entrada' : 'Salida';
      const productos = movimiento.origen?.items || [];
      const productosCompletos = productos.map((item) => `${item.nombre} × ${item.cantidad}`).join(' · ');
      const productosResumidos = productos.length > 2
        ? `${productos.slice(0, 2).map((item) => `${item.nombre} × ${item.cantidad}`).join(' · ')} + ${productos.length - 2} más`
        : productosCompletos;
      const lineaSecundaria = productosResumidos ? `Productos: ${productosResumidos}` : movimiento.referencia;
      return `
        <tr class="movimiento-row" data-id="${escapeHtml(movimiento.id)}">
          <td class="text-nowrap text-secondary small">${escapeHtml(formatMovimientoFecha(movimiento.fecha))}</td>
          <td><span class="movimiento-direction ${directionClass}"><i class="ti ${directionIcon}"></i>${directionLabel}</span></td>
          <td>
            <div class="fw-semibold">${escapeHtml(movimiento.concepto)}</div>
            <div class="small text-secondary text-truncate movimiento-reference" title="${escapeHtml(productosCompletos || movimiento.referencia)}">${escapeHtml(lineaSecundaria)}</div>
          </td>
          <td>${escapeHtml(movimiento.responsable)}</td>
          <td><span class="text-secondary small">${escapeHtml(movimiento.medioPago || '—')}</span></td>
          <td class="text-end text-nowrap fw-bold ${isEntrada ? 'text-success' : 'text-danger'}">${isEntrada ? '+' : '−'}${formatter.format(movimiento.monto)}</td>
          <td class="text-end erp-td-actions">${erpAction('view', { className: 'btn-ver-movimiento-caja', attrs: { 'data-id': movimiento.id }, label: 'Ver origen y detalle' })}</td>
        </tr>
      `;
    }).join('');

    movimientosCajaPagination.hidden = false;
    document.getElementById('mov-caja-page-info').textContent = `Página ${movimientosCajaMeta.page} de ${movimientosCajaMeta.totalPages} · ${movimientosCajaMeta.total} movimientos`;
    document.getElementById('mov-caja-prev').disabled = movimientosCajaMeta.page <= 1;
    document.getElementById('mov-caja-next').disabled = movimientosCajaMeta.page >= movimientosCajaMeta.totalPages;

    movimientosCajaTbody.querySelectorAll('.btn-ver-movimiento-caja').forEach((button) => {
      button.addEventListener('click', () => openDetalleMovimientoCaja(button.dataset.id));
    });
  };

  const loadMovimientosCaja = async (page = 1) => {
    movimientosCajaPage = page;
    setDefaultMovimientosCajaFechas();
    movimientosCajaTbody.innerHTML = '<tr><td colspan="7" class="text-center py-4"><div class="spinner-border spinner-border-sm text-primary" role="status"></div></td></tr>';
    movimientosCajaPagination.hidden = true;

    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      const sede = document.getElementById('mov-caja-sede')?.value;
      const desde = document.getElementById('mov-caja-desde')?.value;
      const hasta = document.getElementById('mov-caja-hasta')?.value;
      const tipo = document.getElementById('mov-caja-tipo')?.value;
      if (sede) params.set('sede', sede);
      if (desde) params.set('desde', desde);
      if (hasta) params.set('hasta', hasta);
      if (tipo) params.set('tipo', tipo);
      renderMovimientosCaja(await apiFetch(`/caja/movimientos?${params.toString()}`));
      movimientosCajaLoaded = true;
    } catch (error) {
      movimientosCajaTbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-danger">Error al cargar movimientos: ${escapeHtml(error.message)}</td></tr>`;
    }
  };

  const openDetalleMovimientoCaja = (id) => {
    const movimiento = movimientosCajaCache.find((item) => item.id === id);
    if (!movimiento) return;
    const isEntrada = movimiento.direccion === 'entrada';
    const origen = movimiento.origen || {};
    const origenRows = [
      ['Módulo de origen', origen.modulo],
      ['Documento', origen.documento],
      ['Cliente / proveedor', origen.tercero],
      ['Sede', origen.sede],
      ['Autorizó', origen.autorizador]
    ].filter(([, value]) => value);
    const pagosHtml = origen.pagos?.length ? `
      <section class="movimiento-origin-section">
        <h6>Pagos de la operación</h6>
        <div class="movimiento-origin-list">${origen.pagos.map((pago) =>
          `<div><span>${escapeHtml(pago.medio)}</span><strong>${formatter.format(pago.monto)}</strong></div>`
        ).join('')}</div>
      </section>
    ` : '';
    const itemsHtml = origen.items?.length ? `
      <section class="movimiento-origin-section">
        <h6>Productos de la venta</h6>
        <div class="movimiento-origin-list">${origen.items.map((item) =>
          `<div><span>${escapeHtml(item.nombre)}</span><strong>${escapeHtml(item.cantidad)} und.</strong></div>`
        ).join('')}</div>
      </section>
    ` : '';
    const content = document.getElementById('detalle-movimiento-caja-content');
    content.innerHTML = `
      <div class="modal-header">
        <div>
          <p class="text-secondary small mb-1">Movimiento financiero</p>
          <h5 class="modal-title mb-0">${escapeHtml(movimiento.concepto)}</h5>
        </div>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
      </div>
      <div class="modal-body">
        <div class="movimiento-detail-amount ${isEntrada ? 'movimiento-detail-amount--in' : 'movimiento-detail-amount--out'}">
          <span>${isEntrada ? 'Entrada' : 'Salida'}</span>
          <strong>${isEntrada ? '+' : '−'}${formatter.format(movimiento.monto)}</strong>
        </div>
        <dl class="movimiento-detail-grid mb-0">
          <div><dt>Fecha y hora</dt><dd>${escapeHtml(formatMovimientoFecha(movimiento.fecha))}</dd></div>
          <div><dt>Medio</dt><dd>${escapeHtml(movimiento.medioPago || '—')}</dd></div>
          <div><dt>Responsable</dt><dd>${escapeHtml(movimiento.responsable)}</dd></div>
          <div><dt>Referencia</dt><dd>${escapeHtml(movimiento.referencia)}</dd></div>
          <div class="movimiento-detail-grid__wide"><dt>Detalle</dt><dd>${escapeHtml(movimiento.detalle || 'Sin detalle')}</dd></div>
        </dl>
        ${origenRows.length ? `
          <section class="movimiento-origin-section">
            <h6>De dónde proviene</h6>
            <dl class="movimiento-detail-grid mb-0">
              ${origenRows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}
              ${origen.totalOperacion != null ? `<div><dt>Total de la operación</dt><dd class="fw-semibold">${formatter.format(origen.totalOperacion)}</dd></div>` : ''}
            </dl>
          </section>
        ` : ''}
        ${pagosHtml}
        ${itemsHtml}
      </div>
      <div class="modal-footer d-flex justify-content-between gap-2">
        ${origen.ruta ? `<a href="${escapeHtml(origen.ruta)}" class="btn btn-outline-primary"><i class="ti ti-external-link me-1"></i>Abrir origen</a>` : '<span></span>'}
        <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cerrar</button>
      </div>
    `;
    modalDetalleMovimiento.show();
  };

  document.getElementById('form-filtros-movimientos-caja')?.addEventListener('submit', (event) => {
    event.preventDefault();
    loadMovimientosCaja(1);
  });
  document.getElementById('mov-caja-prev')?.addEventListener('click', () => {
    if (movimientosCajaMeta.page > 1) loadMovimientosCaja(movimientosCajaMeta.page - 1);
  });
  document.getElementById('mov-caja-next')?.addEventListener('click', () => {
    if (movimientosCajaMeta.page < movimientosCajaMeta.totalPages) loadMovimientosCaja(movimientosCajaMeta.page + 1);
  });
  document.querySelector('a[href="#tab-movimientos-caja"]')?.addEventListener('shown.bs.tab', () => {
    if (!movimientosCajaLoaded) loadMovimientosCaja(1);
  });

  async function openPastCajaDetalle(id, historyList) {
    const c = historyList.find(item => String(item.id) === String(id));
    if (!c) return;

    const totalCobrado = calcTotalIngresos(c);
    const saldoEfectivoTeorico = parseFloat(c.montoApertura) + parseFloat(c.totalVentasEfectivo) - parseFloat(c.totalEgresos);
    const cierreHora = c.horaCierre ? new Date(c.horaCierre).toLocaleString('es-CO') : '—';

    const content = document.getElementById('detalle-past-caja-content');
    content.innerHTML = `
      <div class="modal-header">
        <h5 class="modal-title">Análisis de caja — <strong>${c.fecha}</strong></h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
      </div>
      <div class="modal-body">
        <div class="row g-3 mb-4">
          <div class="col-sm-6 col-md-3">
            <span class="text-secondary small">Sede</span>
            <div class="fw-bold">${c.sede ? c.sede.nombre : 'N/A'}</div>
          </div>
          <div class="col-sm-6 col-md-3">
            <span class="text-secondary small">Cierre por</span>
            <div class="fw-bold">${c.usuarioCierre ? c.usuarioCierre.nombre : 'N/A'}</div>
          </div>
          <div class="col-sm-6 col-md-3">
            <span class="text-secondary small">Hora de cierre</span>
            <div class="fw-bold">${cierreHora}</div>
          </div>
          <div class="col-sm-6 col-md-3">
            <span class="text-secondary small">Estado</span>
            <div><span class="badge bg-green-lt px-2 py-1">${c.estado.toUpperCase()}</span></div>
          </div>
        </div>

        ${buildDesglosePagosHtml(c, {
          title: 'Desglose por método de pago',
          totalLabel: 'Total cobrado ese día',
          showNote: false,
          embedded: true
        })}

        <div class="card mt-3">
          <div class="card-header"><h4 class="card-title mb-0">Cuadre y arqueo</h4></div>
          <div class="card-body p-0">
            <table class="table table-sm mb-0">
              <tbody>
                <tr><th class="ps-3">Base de apertura</th><td class="text-end pe-3 fw-semibold">${formatter.format(c.montoApertura)}</td></tr>
                <tr><th class="ps-3">Efectivo físico teórico al cierre</th><td class="text-end pe-3">${formatter.format(saldoEfectivoTeorico)}</td></tr>
                <tr><th class="ps-3">Total ingresos (todos los métodos)</th><td class="text-end pe-3 fw-bold text-primary">${formatter.format(totalCobrado)}</td></tr>
                <tr><th class="ps-3 text-danger">Egresos / retiros</th><td class="text-end pe-3 text-danger">-${formatter.format(c.totalEgresos)}</td></tr>
                <tr class="table-light"><th class="ps-3">Diferencia de arqueo</th><td class="text-end pe-3 fw-bold ${parseFloat(c.diferencia) >= 0 ? 'text-success' : 'text-danger'}">${formatter.format(c.diferencia)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        ${c.observaciones ? `
          <div class="mt-3">
            <span class="text-secondary small">Observaciones del cierre</span>
            <div class="bg-light rounded p-2 small mt-1">${c.observaciones}</div>
          </div>
        ` : ''}
      </div>
      <div class="modal-footer d-flex justify-content-between">
        <div class="d-flex gap-2">
          <a href="/api/caja/${c.id}/reporte-z-pdf" target="_blank" class="btn btn-outline-primary">
            <i class="ti ti-file-pdf me-1"></i> Descargar Reporte Z (PDF)
          </a>
          <button type="button" class="btn btn-outline-dark btn-print-past-ticket" data-id="${c.id}">
            <i class="ti ti-printer me-1"></i> Ticket Térmico
          </button>
        </div>
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
      </div>
    `;

    content.querySelector('.btn-print-past-ticket')?.addEventListener('click', async () => {
      try {
        const zData = await apiFetch(`/caja/${c.id}/detalle-z`);
        printCierreTicket(zData);
      } catch (err) {
        showToast('Error', err.message, 'error');
      }
    });

    modalDetallePast.show();
  }

  let cajaGastosChart = null;
  const GASTOS_COLORS = ['#2563eb', '#dc2626', '#d97706', '#059669', '#7c3aed', '#0891b2', '#db2777', '#64748b'];

  const loadAnalisisGastos = async () => {
    const sedeEl = document.getElementById('analisis-gastos-sede');
    const sedeId = sedeEl ? sedeEl.value : currentSedeId;
    const periodo = document.getElementById('analisis-gastos-periodo')?.value || 'mes';

    try {
      const data = await apiFetch(`/dashboard/gastos-por-categoria?sede=${sedeId}&periodo=${periodo}`);
      const cats = data.porCategoria || [];
      const total = data.totalGeneral || 0;

      const totalEl = document.getElementById('caja-gastos-total');
      if (totalEl) totalEl.textContent = total > 0 ? `Total: ${formatter.format(total)}` : 'Sin gastos';

      const canvas = document.getElementById('caja-chart-gastos');
      const emptyEl = document.getElementById('caja-gastos-empty');
      emptyEl?.classList.toggle('d-none', total > 0);
      canvas?.classList.toggle('d-none', total === 0);

      if (cajaGastosChart) {
        cajaGastosChart.destroy();
        cajaGastosChart = null;
      }

      if (total > 0 && canvas) {
        cajaGastosChart = new Chart(canvas.getContext('2d'), {
          type: 'doughnut',
          data: {
            labels: cats.map(c => c.nombre),
            datasets: [{
              data: cats.map(c => c.total),
              backgroundColor: cats.map((_, i) => GASTOS_COLORS[i % GASTOS_COLORS.length])
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } },
              tooltip: {
                callbacks: {
                  label: (ctx) => ` ${ctx.label}: ${formatter.format(ctx.parsed)}`
                }
              }
            }
          }
        });
      }

      const catTbody = document.getElementById('caja-gastos-categorias-tbody');
      if (catTbody) {
        if (cats.length === 0) {
          catTbody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-secondary">Sin egresos en el período.</td></tr>`;
        } else {
          catTbody.innerHTML = cats.map(c => {
            const pct = total > 0 ? ((c.total / total) * 100).toFixed(1) : 0;
            return `
              <tr>
                <td class="fw-semibold">${c.nombre}</td>
                <td class="text-center">${c.cantidad}</td>
                <td class="text-end fw-bold text-danger">${formatter.format(c.total)}</td>
                <td class="text-end text-secondary">${pct}%</td>
              </tr>
            `;
          }).join('');
        }
      }

      const detTbody = document.getElementById('caja-gastos-detalle-tbody');
      if (detTbody) {
        const detalle = data.detalle || [];
        detTbody.innerHTML = detalle.length === 0
          ? `<tr><td colspan="5" class="text-center py-3 text-secondary">Sin movimientos.</td></tr>`
          : detalle.map(e => `
            <tr>
              <td class="text-nowrap">${new Date(e.fecha).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}</td>
              <td><span class="badge bg-secondary-lt">${e.categoria}</span></td>
              <td class="text-truncate" style="max-width:160px">${e.motivo}</td>
              <td class="small">${e.usuario}</td>
              <td class="text-end fw-bold text-danger">${formatter.format(e.monto)}</td>
            </tr>
          `).join('');
      }
    } catch (err) {
      showToast('Error', err.message, 'error');
    }
  };

  document.getElementById('form-analisis-gastos')?.addEventListener('submit', (e) => {
    e.preventDefault();
    loadAnalisisGastos();
  });

  document.querySelector('a[href="#tab-analisis-gastos"]')?.addEventListener('shown.bs.tab', () => {
    loadAnalisisGastos();
  });

  // Carga inicial
  await loadLimites();
  await loadCategorias();
  setDefaultHistorialFechas();
  await loadCajaStatus();

  const hashParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
  if (hashParams.get('accion') === 'egreso' && activeCaja) {
    abrirModalEgreso();
  }
}
