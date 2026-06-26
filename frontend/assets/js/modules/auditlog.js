import { apiFetch } from '../api.js';

export async function initAuditLog(container) {
  container.innerHTML = `
    <div class="container-xl">
      <!-- Encabezado de página -->
      <div class="page-header d-print-none mb-4 animate__animated animate__fadeIn">
        <div class="row align-items-center">
          <div class="col">
            <h2 class="page-title text-primary"><i class="ti ti-shield-lock me-2"></i>Bitácora de Auditoría (Audit Log)</h2>
            <div class="text-secondary mt-1">Historial detallado de todas las transacciones, modificaciones de precios y egresos del sistema</div>
          </div>
          <div class="col-auto ms-auto d-print-none">
            <div class="btn-list">
              <button id="btn-export-csv" class="btn btn-outline-secondary">
                <i class="ti ti-file-spreadsheet me-1"></i> Exportar CSV
              </button>
              <button id="btn-print-pdf" class="btn btn-primary">
                <i class="ti ti-printer me-1"></i> Imprimir Reporte
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Tarjeta de filtros -->
      <div class="card mb-4 d-print-none shadow-sm border-0">
        <div class="card-header bg-transparent py-3 border-0">
          <h3 class="card-title fw-bold text-secondary"><i class="ti ti-filter me-2"></i>Filtros Avanzados</h3>
        </div>
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

      <!-- Tabla de Logs -->
      <div class="card shadow-sm border-0 animate__animated animate__fadeInUp">
        <div class="table-responsive">
          <table class="table table-vcenter card-table table-hover">
            <thead class="bg-light">
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

    <!-- Modal para comparar cambios (JSON DIFF) -->
    <div class="modal modal-blur fade d-print-none" id="modal-audit-detail" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-centered" role="document">
        <div class="modal-content shadow-lg">
          <div class="modal-header">
            <h5 class="modal-title fw-bold"><i class="ti ti-eye me-1"></i> Detalles de Auditoría e Historial de Cambios</h5>
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
              <h4 class="fw-bold mb-2">Comparativa de Cambios</h4>
              <div id="diff-container" class="table-responsive">
                <!-- Se inyecta la comparativa dinámica -->
              </div>
            </div>
          </div>
          <div class="modal-footer bg-light">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar Detalle</button>
          </div>
        </div>
      </div>
    </div>
  `;

  let currentLogs = [];

  const loadAuditLogs = async () => {
    const tbody = document.getElementById('audit-log-tbody');
    if (!tbody) return;

    try {
      const usuario = document.getElementById('filter-usuario').value.trim();
      const modulo = document.getElementById('filter-modulo').value;
      const accion = document.getElementById('filter-accion').value;
      const desde = document.getElementById('filter-desde').value;
      const hasta = document.getElementById('filter-hasta').value;

      let queryParams = new URLSearchParams();
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
            <td>
              <span class="badge ${actionBadge} text-uppercase px-2 py-1">${log.accion}</span>
            </td>
            <td><strong class="text-muted">${log.modulo}</strong></td>
            <td><code class="text-secondary">${log.registroId || 'N/A'}</code></td>
            <td>
              <span class="text-secondary fw-bold small">${log.sede ? log.sede.nombre : 'Sede Global / N/A'}</span><br>
              <code class="text-muted small">${log.ip || 'Localhost'}</code>
            </td>
            <td class="d-print-none text-end">
               <button class="btn btn-light btn-icon btn-sm btn-view-detail" data-index="${index}" title="Ver Comparativa" aria-label="Ver comparativa de auditoría">
                <i class="ti ti-eye text-primary"></i>
              </button>
            </td>
          </tr>
        `;
      }).join('');

      // Agregar escuchas para botones de ver detalle
      document.querySelectorAll('.btn-view-detail').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const index = btn.getAttribute('data-index');
          showAuditDetail(currentLogs[index]);
        });
      });

    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-danger">Error al cargar bitácora: ${err.message}</td></tr>`;
    }
  };

  const showAuditDetail = (log) => {
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

    document.getElementById('audit-det-usuario').textContent = log.usuario ? `${log.usuario.nombre} (${log.usuario.email})` : 'Sistema';
    document.getElementById('audit-det-id').textContent = log.registroId || 'N/A';

    const diffContainer = document.getElementById('diff-container');
    
    // Generar tabla comparativa de valores
    const vAnterior = log.valorAnterior || {};
    const vNuevo = log.valorNuevo || {};

    // Obtener todas las claves únicas
    const allKeys = Array.from(new Set([...Object.keys(vAnterior), ...Object.keys(vNuevo)]));

    if (allKeys.length === 0) {
      diffContainer.innerHTML = `<div class="alert alert-light text-center py-3 text-secondary">No hay campos para contrastar (Login o evento simple).</div>`;
    } else {
      let rowsHtml = '';
      allKeys.forEach(key => {
        // Omitir contraseñas o campos innecesarios
        if (key.toLowerCase().includes('password')) return;

        const valAnt = vAnterior[key] !== undefined ? JSON.stringify(vAnterior[key], null, 2) : '-';
        const valNue = vNuevo[key] !== undefined ? JSON.stringify(vNuevo[key], null, 2) : '-';
        
        let rowClass = '';
        if (valAnt === '-') rowClass = 'table-success-lt'; // Campo nuevo
        else if (valNue === '-') rowClass = 'table-danger-lt'; // Campo eliminado
        else if (valAnt !== valNue) rowClass = 'table-warning-lt'; // Modificado

        rowsHtml += `
          <tr class="${rowClass}">
            <td class="fw-bold text-muted">${key}</td>
            <td style="max-width:300px; white-space: pre-wrap;"><code class="text-danger">${valAnt.replace(/"/g, '')}</code></td>
            <td style="max-width:300px; white-space: pre-wrap;"><code class="text-success">${valNue.replace(/"/g, '')}</code></td>
          </tr>
        `;
      });

      diffContainer.innerHTML = `
        <table class="table table-vcenter table-bordered">
          <thead>
            <tr class="bg-light">
              <th>Propiedad / Campo</th>
              <th>Valor Anterior</th>
              <th>Valor Nuevo</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      `;
    }

    const modal = new bootstrap.Modal(document.getElementById('modal-audit-detail'));
    modal.show();
  };

  // Exportar a CSV
  document.getElementById('btn-export-csv').addEventListener('click', () => {
    if (currentLogs.length === 0) {
      alert("No hay datos para exportar.");
      return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Fecha,Usuario,Email,Accion,Modulo,RegistroID,Sede,IP\n";

    currentLogs.forEach(log => {
      const fecha = new Date(log.createdAt).toLocaleString().replace(/,/g, '');
      const user = log.usuario ? log.usuario.nombre : 'Sistema';
      const email = log.usuario ? log.usuario.email : '';
      const accion = log.accion;
      const modulo = log.modulo;
      const id = log.registroId || '';
      const sede = log.sede ? log.sede.nombre : 'Global';
      const ip = log.ip || 'Local';

      csvContent += `"${fecha}","${user}","${email}","${accion}","${modulo}","${id}","${sede}","${ip}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `auditoria_erp_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  // Imprimir PDF (Usa la vista de impresión del navegador)
  document.getElementById('btn-print-pdf').addEventListener('click', () => {
    window.print();
  });

  // Escuchar formulario de filtros
  document.getElementById('form-audit-filter').addEventListener('submit', (e) => {
    e.preventDefault();
    loadAuditLogs();
  });

  // Carga inicial
  await loadAuditLogs();
}
