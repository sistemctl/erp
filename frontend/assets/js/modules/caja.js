import { apiFetch } from '../api.js';
import { getUsuario } from '../auth.js';
import { getLocalDateStr } from '../utils/date.js';
import { showToast, showConfirm } from '../utils/toast.js';
import { erpHeader } from '../utils/module-shell.js';
import { erpAction } from '../utils/action-buttons.js';

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
      <div class="card mb-4 d-print-none">
        <div class="card-header">
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
          </ul>
        </div>
        <div class="card-body">
          <div class="tab-content">
            <!-- TAB 1: CAJA ACTIVA -->
            <div class="tab-pane active show" id="tab-caja-activa" role="tabpanel">
              ${isAdminOrContador ? `
                <div class="card mb-3 d-print-none shadow-sm">
                  <div class="card-body py-2">
                    <div class="row align-items-center">
                      <div class="col-md-4">
                        <label class="form-label small fw-bold mb-1 text-primary">Sede de Caja a Monitorear</label>
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
              <div class="alert alert-info py-2 mb-4 d-print-none">
                <i class="ti ti-info-circle me-1"></i>
                Consulte cierres por rango de fechas. Haga clic en una fila o en <strong>Ver análisis</strong> para ver el desglose exacto por método de pago de ese día.
              </div>
              <form id="form-filtros-historial-caja" class="row g-3 mb-4">
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
                  <button type="submit" class="btn btn-primary w-100"><i class="ti ti-search me-1"></i> Consultar</button>
                </div>
              </form>

              <div class="table-responsive">
                <table class="table table-vcenter card-table table-hover table-striped caja-historial-table">
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

            <!-- TAB 3: ANÁLISIS DE GASTOS -->
            <div class="tab-pane" id="tab-analisis-gastos" role="tabpanel">
              <form id="form-analisis-gastos" class="row g-3 mb-4">
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
                  <button type="submit" class="btn btn-primary w-100"><i class="ti ti-refresh me-1"></i> Actualizar</button>
                </div>
              </form>

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
  `;

  const modalApertura = new bootstrap.Modal(document.getElementById('modal-apertura'));
  const modalEgreso = new bootstrap.Modal(document.getElementById('modal-egreso'));
  const modalCierre = new bootstrap.Modal(document.getElementById('modal-cierre'));
  const modalDetallePast = new bootstrap.Modal(document.getElementById('modal-detalle-past-caja'));

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

  const METODOS_PAGO_CAJA = [
    { key: 'totalVentasEfectivo', label: 'Efectivo', icon: 'ti-cash', tone: 'green' },
    { key: 'totalVentasNequi', label: 'Nequi', icon: 'ti-device-mobile', tone: 'purple' },
    { key: 'totalVentasDaviplata', label: 'Daviplata', icon: 'ti-wallet', tone: 'pink' },
    { key: 'totalVentasTarjeta', label: 'Tarjeta', icon: 'ti-credit-card', tone: 'blue' },
    { key: 'totalVentasTransferencia', label: 'Transferencia', icon: 'ti-building-bank', tone: 'cyan' }
  ];

  const HISTORIAL_COLS = 13;
  let historialCache = [];

  const calcTotalIngresos = (cajaData) =>
    METODOS_PAGO_CAJA.reduce((sum, m) => sum + parseFloat(cajaData[m.key] || 0), 0);

  const buildDesglosePagosHtml = (cajaData, opts = {}) => {
    const {
      title = 'Ingresos del día por método de pago',
      totalLabel = 'Total cobrado',
      showNote = true,
      embedded = false
    } = opts;

    const montos = METODOS_PAGO_CAJA.map(m => ({
      ...m,
      monto: parseFloat(cajaData[m.key] || 0)
    }));
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
      const data = await apiFetch(`/caja/reporte?fecha=${hoyStr}&sede=${currentSedeId}`).catch(() => null);

      if (!data || data.estado === 'cerrada') {
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
        document.getElementById('form-egreso').reset();
        document.getElementById('pin-admin-wrapper').classList.add('d-none');
        modalEgreso.show();
      });

      document.getElementById('btn-pos-cierre').addEventListener('click', () => {
        document.getElementById('form-cierre').reset();
        document.getElementById('cierre-efectivo').value = saldoEfectivoTeorico;
        document.getElementById('cierre-nequi').value = data.totalVentasNequi;
        document.getElementById('cierre-daviplata').value = data.totalVentasDaviplata;
        document.getElementById('cierre-tarjeta').value = data.totalVentasTarjeta;
        document.getElementById('cierre-transferencia').value = data.totalVentasTransferencia;
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

  // PIN Admin logic
  document.getElementById('egreso-monto').addEventListener('input', (e) => {
    const val = parseFloat(e.target.value || 0);
    const pinWrapper = document.getElementById('pin-admin-wrapper');
    if (val > limiteEgresoSinPin) {
      pinWrapper.classList.remove('d-none');
      document.getElementById('egreso-pin').required = true;
    } else {
      pinWrapper.classList.add('d-none');
      document.getElementById('egreso-pin').required = false;
    }
  });

  // Submit Egreso
  document.getElementById('form-egreso').addEventListener('submit', async (e) => {
    e.preventDefault();
    const montoVal = parseFloat(document.getElementById('egreso-monto').value);
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

  // Submit Cierre
  document.getElementById('form-cierre').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      totalVentasEfectivo: parseFloat(document.getElementById('cierre-efectivo').value || 0),
      totalVentasNequi: parseFloat(document.getElementById('cierre-nequi').value || 0),
      totalVentasDaviplata: parseFloat(document.getElementById('cierre-daviplata').value || 0),
      totalVentasTarjeta: parseFloat(document.getElementById('cierre-tarjeta').value || 0),
      totalVentasTransferencia: parseFloat(document.getElementById('cierre-transferencia').value || 0),
      observaciones: document.getElementById('cierre-observaciones').value,
      sedeId: currentSedeId
    };

    try {
      const res = await apiFetch('/caja/cierre', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      modalCierre.hide();
      
      const diff = parseFloat(res.caja.diferencia);
      if (diff === 0) {
        showToast('Cierre Exitoso', 'Cierre exitoso. Caja cuadriculada a la perfección.', 'success');
      } else if (diff > 0) {
        showToast('Cierre Exitoso', `Cierre exitoso. Se detectó un SOBRANTE de caja de: ${formatter.format(diff)}`, 'warning');
      } else {
        showToast('Cierre Exitoso', `Cierre exitoso. Se detectó un FALTANTE de caja de: ${formatter.format(Math.abs(diff))}`, 'warning');
      }

      loadCajaStatus();

      if (res.caja?.id) {
        showToast('Ver análisis', 'Abriendo el desglose del cierre en Historial…', 'info');
        await abrirHistorialConCaja(res.caja.id, res.caja.fecha);
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
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
      </div>
    `;

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
    document.getElementById('form-egreso')?.reset();
    modalEgreso.show();
  }
}
