import { apiFetch } from '../api.js';
import { getUsuario } from '../auth.js';
import { getLocalDateStr } from '../utils/date.js';
import { showToast, showConfirm } from '../utils/toast.js';

export async function initCaja(container) {
  const usuario = getUsuario();
  let currentSedeId = usuario.sedeId;
  const isAdminOrContador = ['admin', 'superadmin', 'contador'].includes(usuario.rol);

  let activeCaja = null;
  let limiteEgresoSinPin = 50000;
  let sedes = [];

  try {
    sedes = await apiFetch('/config/sedes').catch(() => []);
  } catch (e) {
    console.error('Error precargando sedes:', e);
  }

  container.innerHTML = `
    <div class="container-xl">
      <div class="page-header d-print-none mb-4">
        <div class="row align-items-center">
          <div class="col">
            <h2 class="page-title">Control y Cuadre de Caja Diaria</h2>
            <div class="text-secondary mt-1">Monitoreo de ingresos, retiros físicos y cierres diarios por sede</div>
          </div>
        </div>
      </div>

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
                  <div class="mt-2 text-secondary">Consultando estado de caja...</div>
                </div>
              </div>
            </div>

            <!-- TAB 2: HISTORIAL DE CIERRES -->
            <div class="tab-pane" id="tab-historial-cajas" role="tabpanel">
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
                <table class="table table-vcenter card-table table-hover table-striped">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Sede</th>
                      <th>Apertura CC</th>
                      <th class="text-end">Base Apertura</th>
                      <th class="text-end">Egresos</th>
                      <th class="text-end">Diferencia</th>
                      <th class="text-center">Estado</th>
                      <th class="text-end">Acciones</th>
                    </tr>
                  </thead>
                  <tbody id="historial-cajas-table-body">
                    <tr><td colspan="8" class="text-center py-4 text-secondary">Haga clic en Consultar para cargar el historial de cajas.</td></tr>
                  </tbody>
                </table>
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
                    <textarea id="cierre-observaciones" class="form-control" rows="2" placeholder="Describa diferencias si las hay..."></textarea>
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
                <tr><td colspan="6" class="text-center py-3">Consultando retiros...</td></tr>
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
    } catch (err) {
      showToast('Error', err.message, 'error');
    }
  });

  // --- TAB 2: HISTORIAL DE CIERRES ---
  const tbodyHist = document.getElementById('historial-cajas-table-body');
  document.getElementById('form-filtros-historial-caja').addEventListener('submit', async (e) => {
    e.preventDefault();
    tbodyHist.innerHTML = `<tr><td colspan="8" class="text-center py-4"><div class="spinner-border text-primary" role="status"></div></td></tr>`;
    
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
        tbodyHist.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-secondary">No se encontraron cierres de caja en el rango seleccionado.</td></tr>`;
        return;
      }

      tbodyHist.innerHTML = historyData.map(c => {
        let statusBadge = 'bg-success-lt';
        if (c.estado === 'abierta') statusBadge = 'bg-yellow-lt';

        return `
          <tr>
            <td><strong>${c.fecha}</strong></td>
            <td>${c.sede ? c.sede.nombre : 'N/A'}</td>
            <td>${c.usuarioCierre ? c.usuarioCierre.nombre : (c.usuarioApertura ? c.usuarioApertura.nombre : 'N/A')}</td>
            <td class="text-end font-weight-medium">${formatter.format(c.montoApertura)}</td>
            <td class="text-end text-danger">${formatter.format(c.totalEgresos)}</td>
            <td class="text-end fw-bold ${parseFloat(c.diferencia) >= 0 ? 'text-success' : 'text-danger'}">${formatter.format(c.diferencia)}</td>
            <td class="text-center"><span class="badge ${statusBadge} px-2 py-1">${c.estado.toUpperCase()}</span></td>
            <td class="text-end">
              <button class="btn btn-outline-primary btn-sm btn-ver-past-caja" data-id="${c.id}">
                <i class="ti ti-eye me-1"></i>Detalle
              </button>
            </td>
          </tr>
        `;
      }).join('');

      document.querySelectorAll('.btn-ver-past-caja').forEach(btn => {
        btn.addEventListener('click', () => openPastCajaDetalle(btn.dataset.id, historyData));
      });

    } catch (err) {
      tbodyHist.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-danger">Error: ${err.message}</td></tr>`;
    }
  });

  async function openPastCajaDetalle(id, historyList) {
    const c = historyList.find(item => String(item.id) === String(id));
    if (!c) return;

    const content = document.getElementById('detalle-past-caja-content');
    content.innerHTML = `
      <div class="modal-header">
        <h5 class="modal-title">Cierre de Caja: <strong>${c.fecha}</strong></h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
      </div>
      <div class="modal-body">
        <div class="row mb-3">
          <div class="col-6">
            <span class="text-secondary small">Sede:</span>
            <div class="fw-bold">${c.sede ? c.sede.nombre : 'N/A'}</div>
          </div>
          <div class="col-6 text-end">
            <span class="text-secondary small">Estado:</span>
            <div><span class="badge bg-green-lt px-2 py-1">${c.estado.toUpperCase()}</span></div>
          </div>
        </div>

        <table class="table table-striped table-sm">
          <tbody>
            <tr><th>Base Apertura</th><td class="text-end fw-bold text-primary">${formatter.format(c.montoApertura)}</td></tr>
            <tr><th>Ventas Efectivo</th><td class="text-end">${formatter.format(c.totalVentasEfectivo)}</td></tr>
            <tr><th>Ventas Nequi</th><td class="text-end">${formatter.format(c.totalVentasNequi)}</td></tr>
            <tr><th>Ventas Daviplata</th><td class="text-end">${formatter.format(c.totalVentasDaviplata)}</td></tr>
            <tr><th>Ventas Tarjeta</th><td class="text-end">${formatter.format(c.totalVentasTarjeta)}</td></tr>
            <tr><th>Ventas Transferencias</th><td class="text-end">${formatter.format(c.totalVentasTransferencia)}</td></tr>
            <tr><th class="text-danger">Total Egresos (Retiros)</th><td class="text-end text-danger">-${formatter.format(c.totalEgresos)}</td></tr>
            <tr class="table-light fw-bold"><th>Diferencia / Arqueo</th><td class="text-end ${parseFloat(c.diferencia) >= 0 ? 'text-success' : 'text-danger'}">${formatter.format(c.diferencia)}</td></tr>
          </tbody>
        </table>

        ${c.observaciones ? `
          <div class="mt-3">
            <span class="text-secondary small">Observaciones del Cierre:</span>
            <blockquote class="blockquote border-left pl-3 mt-1 bg-light p-2 small">${c.observaciones}</blockquote>
          </div>
        ` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary w-100" data-bs-dismiss="modal">Cerrar</button>
      </div>
    `;

    modalDetallePast.show();
  }

  // Carga inicial
  await loadLimites();
  await loadCategorias();
  await loadCajaStatus();
}
