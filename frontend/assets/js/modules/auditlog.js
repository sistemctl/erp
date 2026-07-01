import { apiFetch } from '../api.js';
import { erpAction } from '../utils/action-buttons.js';

let currentLogs = [];
let auditTabReady = false;

export function renderAuditLogTabHtml() {
  return `
    <div class="audit-tab">
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3 d-print-none">
        <div>
          <h4 class="mb-1 fw-bold">Bitácora de auditoría</h4>
          <p class="text-secondary small mb-0">Transacciones, cambios de precio y egresos registrados en el sistema.</p>
        </div>
        <div class="btn-list">
          <button type="button" id="btn-export-csv" class="btn btn-outline-secondary btn-sm">
            <i class="ti ti-file-spreadsheet me-1"></i> Exportar CSV
          </button>
          <button type="button" id="btn-print-pdf" class="btn btn-primary btn-sm">
            <i class="ti ti-printer me-1"></i> Imprimir
          </button>
        </div>
      </div>

      <div class="card mb-3 erp-filter-card d-print-none">
        <div class="card-body py-2">
          <form id="form-audit-filter" class="row g-3">
            <div class="col-md-3">
              <label class="form-label small fw-bold">Usuario / Email</label>
              <input type="text" id="filter-usuario" class="form-control form-control-sm" placeholder="Buscar por nombre o correo…" spellcheck="false">
            </div>
            <div class="col-md-2">
              <label class="form-label small fw-bold">Módulo</label>
              <select id="filter-modulo" class="form-select form-select-sm">
                <option value="">Todos los módulos</option>
                <option value="Autenticación">Autenticación</option>
                <option value="Productos">Productos</option>
                <option value="Reparaciones">Reparaciones</option>
                <option value="Sedes">Sedes</option>
                <option value="Usuarios">Usuarios</option>
                <option value="Ventas">Ventas</option>
                <option value="Caja">Caja</option>
                <option value="ConfiguracionSistema">Configuración Sistema</option>
                <option value="Proveedores">Proveedores</option>
                <option value="Compras">Compras</option>
                <option value="Nominas">Nóminas</option>
                <option value="TradeIn">TradeIn</option>
                <option value="Cotizaciones">Cotizaciones</option>
                <option value="Cartera">Cartera</option>
              </select>
            </div>
            <div class="col-md-2">
              <label class="form-label small fw-bold">Acción</label>
              <select id="filter-accion" class="form-select form-select-sm">
                <option value="">Todas las acciones</option>
                <option value="CREATE">CREATE</option>
                <option value="UPDATE">UPDATE</option>
                <option value="DELETE">DELETE</option>
                <option value="LOGIN">LOGIN</option>
                <option value="PRICE_OVERRIDE">PRICE_OVERRIDE</option>
                <option value="EGRESO_CAJA">EGRESO_CAJA</option>
              </select>
            </div>
            <div class="col-md-2">
              <label class="form-label small fw-bold">Desde</label>
              <input type="date" id="filter-desde" class="form-control form-control-sm">
            </div>
            <div class="col-md-2">
              <label class="form-label small fw-bold">Hasta</label>
              <input type="date" id="filter-hasta" class="form-control form-control-sm">
            </div>
            <div class="col-md-1 d-flex align-items-end">
              <button type="submit" class="btn btn-primary btn-sm w-100" aria-label="Buscar bitácora"><i class="ti ti-search"></i></button>
            </div>
          </form>
        </div>
      </div>

      <div class="erp-table-panel">
        <div class="table-responsive">
          <table class="table table-vcenter card-table table-hover mb-0">
            <thead>
              <tr>
                <th>Fecha / Hora</th>
                <th>Usuario</th>
                <th>Acción</th>
                <th>Módulo</th>
                <th>ID Registro</th>
                <th>Sede / IP</th>
                <th class="d-print-none text-end">Detalles</th>
              </tr>
            </thead>
            <tbody id="audit-log-tbody">
              <tr>
                <td colspan="7" class="text-center py-4 text-secondary">
                  <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
                  Cargando bitácora de auditoría…
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

export function renderAuditLogModalHtml() {
  return `
    <div class="modal modal-blur fade d-print-none" id="modal-audit-detail" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-centered" role="document">
        <div class="modal-content shadow-lg">
          <div class="modal-header">
            <h5 class="modal-title fw-bold"><i class="ti ti-eye me-1"></i> Detalles de auditoría</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <div class="row mb-3">
              <div class="col-md-6">
                <strong>Módulo:</strong> <span id="audit-det-modulo" class="text-primary"></span>
              </div>
              <div class="col-md-6">
                <strong>Acción:</strong> <span id="audit-det-accion" class="badge"></span>
              </div>
            </div>
            <div class="row mb-3">
              <div class="col-md-6">
                <strong>Usuario:</strong> <span id="audit-det-usuario"></span>
              </div>
              <div class="col-md-6">
                <strong>ID de Registro:</strong> <code id="audit-det-id"></code>
              </div>
            </div>
            <div class="border-top pt-3">
              <h4 class="fw-bold mb-2">Comparativa de cambios</h4>
              <div id="diff-container" class="table-responsive"></div>
            </div>
          </div>
          <div class="modal-footer bg-light">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function loadAuditLogs() {
  const tbody = document.getElementById('audit-log-tbody');
  if (!tbody) return;

  try {
    const usuario = document.getElementById('filter-usuario')?.value.trim() || '';
    const modulo = document.getElementById('filter-modulo')?.value || '';
    const accion = document.getElementById('filter-accion')?.value || '';
    const desde = document.getElementById('filter-desde')?.value || '';
    const hasta = document.getElementById('filter-hasta')?.value || '';

    const queryParams = new URLSearchParams();
    if (usuario) queryParams.append('usuario', usuario);
    if (modulo) queryParams.append('modulo', modulo);
    if (accion) queryParams.append('accion', accion);
    if (desde) queryParams.append('desde', desde);
    if (hasta) queryParams.append('hasta', hasta);

    const logs = await apiFetch(`/audit-log?${queryParams.toString()}`);
    currentLogs = logs;

    if (logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-secondary">No se encontraron registros de auditoría coincidentes.</td></tr>`;
      return;
    }

    tbody.innerHTML = logs.map((log, index) => {
      let actionBadge = 'bg-secondary-lt';
      if (log.accion === 'CREATE') actionBadge = 'bg-success-lt';
      else if (log.accion === 'UPDATE') actionBadge = 'bg-warning-lt';
      else if (log.accion === 'DELETE') actionBadge = 'bg-danger-lt';
      else if (log.accion === 'LOGIN') actionBadge = 'bg-info-lt';
      else if (log.accion === 'PRICE_OVERRIDE') actionBadge = 'bg-purple-lt';
      else if (log.accion === 'EGRESO_CAJA') actionBadge = 'bg-orange-lt';

      return `
        <tr>
          <td>
            <span class="fw-bold">${new Date(log.createdAt).toLocaleDateString()}</span><br>
            <span class="text-secondary small">${new Date(log.createdAt).toLocaleTimeString()}</span>
          </td>
          <td>
            <span class="fw-bold">${log.usuario ? log.usuario.nombre : 'Sistema / Externo'}</span><br>
            <span class="text-secondary small">${log.usuario ? log.usuario.email : ''}</span>
          </td>
          <td><span class="badge ${actionBadge} text-uppercase px-2 py-1">${log.accion}</span></td>
          <td><strong class="text-muted">${log.modulo}</strong></td>
          <td><code class="text-secondary">${log.registroId || 'N/A'}</code></td>
          <td>
            <span class="text-secondary fw-bold small">${log.sede ? log.sede.nombre : 'Sede Global / N/A'}</span><br>
            <code class="text-muted small">${log.ip || 'Localhost'}</code>
          </td>
          <td class="d-print-none text-end erp-td-actions">
            ${erpAction('view', { className: 'btn-view-detail', attrs: { 'data-index': index } })}
          </td>
        </tr>
      `;
    }).join('');

    document.querySelectorAll('.btn-view-detail').forEach((btn) => {
      btn.addEventListener('click', () => {
        const index = btn.getAttribute('data-index');
        showAuditDetail(currentLogs[index]);
      });
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-danger">Error al cargar bitácora: ${err.message}</td></tr>`;
  }
}

function showAuditDetail(log) {
  document.getElementById('audit-det-modulo').textContent = log.modulo;

  const badge = document.getElementById('audit-det-accion');
  badge.textContent = log.accion;
  badge.className = 'badge ';
  if (log.accion === 'CREATE') badge.classList.add('bg-success');
  else if (log.accion === 'UPDATE') badge.classList.add('bg-warning');
  else if (log.accion === 'DELETE') badge.classList.add('bg-danger');
  else if (log.accion === 'LOGIN') badge.classList.add('bg-info');
  else if (log.accion === 'PRICE_OVERRIDE') badge.classList.add('bg-purple');
  else if (log.accion === 'EGRESO_CAJA') badge.classList.add('bg-orange');
  else badge.classList.add('bg-secondary');

  document.getElementById('audit-det-usuario').textContent = log.usuario
    ? `${log.usuario.nombre} (${log.usuario.email})`
    : 'Sistema';
  document.getElementById('audit-det-id').textContent = log.registroId || 'N/A';

  const diffContainer = document.getElementById('diff-container');
  const vAnterior = log.valorAnterior || {};
  const vNuevo = log.valorNuevo || {};
  const allKeys = Array.from(new Set([...Object.keys(vAnterior), ...Object.keys(vNuevo)]));

  if (allKeys.length === 0) {
    diffContainer.innerHTML = `<div class="alert alert-light text-center py-3 text-secondary mb-0">No hay campos para contrastar.</div>`;
  } else {
    let rowsHtml = '';
    allKeys.forEach((key) => {
      if (key.toLowerCase().includes('password')) return;
      const valAnt = vAnterior[key] !== undefined ? JSON.stringify(vAnterior[key], null, 2) : '-';
      const valNue = vNuevo[key] !== undefined ? JSON.stringify(vNuevo[key], null, 2) : '-';
      let rowClass = '';
      if (valAnt === '-') rowClass = 'table-success-lt';
      else if (valNue === '-') rowClass = 'table-danger-lt';
      else if (valAnt !== valNue) rowClass = 'table-warning-lt';

      rowsHtml += `
        <tr class="${rowClass}">
          <td class="fw-bold text-muted">${key}</td>
          <td style="max-width:300px; white-space: pre-wrap;"><code class="text-danger">${valAnt.replace(/"/g, '')}</code></td>
          <td style="max-width:300px; white-space: pre-wrap;"><code class="text-success">${valNue.replace(/"/g, '')}</code></td>
        </tr>
      `;
    });

    diffContainer.innerHTML = `
      <table class="table table-vcenter table-bordered mb-0">
        <thead>
          <tr class="bg-light">
            <th>Propiedad / Campo</th>
            <th>Valor anterior</th>
            <th>Valor nuevo</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    `;
  }

  bootstrap.Modal.getOrCreateInstance(document.getElementById('modal-audit-detail')).show();
}

export async function initAuditLogTab() {
  const form = document.getElementById('form-audit-filter');
  if (!form || auditTabReady) {
    await loadAuditLogs();
    return;
  }

  document.getElementById('btn-export-csv')?.addEventListener('click', () => {
    if (currentLogs.length === 0) {
      alert('No hay datos para exportar.');
      return;
    }

    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'Fecha,Usuario,Email,Accion,Modulo,RegistroID,Sede,IP\n';
    currentLogs.forEach((log) => {
      const fecha = new Date(log.createdAt).toLocaleString().replace(/,/g, '');
      const user = log.usuario ? log.usuario.nombre : 'Sistema';
      const email = log.usuario ? log.usuario.email : '';
      csvContent += `"${fecha}","${user}","${email}","${log.accion}","${log.modulo}","${log.registroId || ''}","${log.sede ? log.sede.nombre : 'Global'}","${log.ip || 'Local'}"\n`;
    });

    const link = document.createElement('a');
    link.href = encodeURI(csvContent);
    link.download = `auditoria_erp_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  document.getElementById('btn-print-pdf')?.addEventListener('click', () => window.print());

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    loadAuditLogs();
  });

  auditTabReady = true;
  await loadAuditLogs();
}

/** Redirige la ruta antigua #/auditlog a configuración */
export async function initAuditLog() {
  window.location.hash = '#/config?tab=auditoria';
}
