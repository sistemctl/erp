import { apiFetch } from '../api.js';
import { getUsuario } from '../auth.js';
import { showToast } from '../utils/toast.js';
import { erpHeader } from '../utils/module-shell.js';

export async function initSeries(container) {
  const usuario = getUsuario();
  const isAdminOrGerente = ['admin', 'superadmin', 'gerente_sede'].includes(usuario.rol);
  let sedes = [];
  let productos = [];

  try {
    sedes = await apiFetch('/config/sedes');
    productos = await apiFetch('/productos').then(p => p.filter(prod => prod.tieneNumeroSerie));
  } catch (e) {
    console.error('Error al precargar datos en módulo series:', e);
  }

  const defaultSedeId = usuario.sedeId || (sedes[0]?.id || '');

  container.innerHTML = `
    <div class="container-xl erp-module">
      ${erpHeader({
        eyebrow: 'Series',
        title: 'IMEI y trazabilidad',
        subtitle: 'Historial de dispositivos por número único',
        actionsHtml: isAdminOrGerente ? `
          <button id="btn-nueva-serie" class="btn btn-primary">
            <i class="ti ti-plus me-2"></i> Registrar IMEI
          </button>
        ` : ''
      })}

      <!-- Buscador -->
      <div class="row mb-4">
        <div class="col-lg-8">
          <div class="card">
            <div class="card-body">
              <h3 class="card-title">Consultar Historial por IMEI / Serie</h3>
              <form id="form-search-imei" class="row g-2">
                <div class="col-md-9">
                  <input type="text" id="input-search-imei" class="form-control" placeholder="Ingrese el IMEI o número de serie completo…" required spellcheck="false">
                </div>
                <div class="col-md-3">
                  <button type="submit" class="btn btn-primary w-100">Consultar Historial</button>
                </div>
              </form>
              <div id="historial-resultado" class="mt-3"></div>
            </div>
          </div>
        </div>

        <div class="col-lg-4">
          <div class="card">
            <div class="card-body">
              <h3 class="card-title">Filtro por Producto</h3>
              <select id="select-producto-series" class="form-select mb-3">
                <option value="">Seleccione un producto…</option>
                ${productos.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>
      </div>

      <!-- Listado General de Series -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Listado de Series en Stock</h3>
        </div>
        <div class="table-responsive">
          <table class="table table-vcenter card-table">
            <thead>
              <tr>
                <th>IMEI / Serie</th>
                <th>Producto</th>
                <th>Sede Actual</th>
                <th>Estado</th>
                <th>Cliente Comprador</th>
                <th>Fecha Venta</th>
              </tr>
            </thead>
            <tbody id="series-table-body">
              <tr>
                <td colspan="6" class="text-center py-4 text-secondary">Seleccione un producto para ver sus series en stock.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Modal Registrar Serie -->
    <div class="modal modal-blur fade" id="modal-serie" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered" role="document">
        <div class="modal-content">
          <div class="modal-header d-flex flex-column align-items-start border-bottom-0 pb-0">
            <div class="d-flex w-100 justify-content-between align-items-center">
              <h5 class="modal-title">Registrar IMEI / Serie</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <ul class="nav nav-tabs card-header-tabs mt-3 w-100" id="reg-mode-tabs" role="tablist">
              <li class="nav-item" role="presentation">
                <button class="nav-link active" id="tab-bulk-mode" data-bs-toggle="tab" data-bs-target="#bulk-mode-pane" type="button" role="tab">Carga Masiva (Lote)</button>
              </li>
              <li class="nav-item" role="presentation">
                <button class="nav-link" id="tab-continuous-mode" data-bs-toggle="tab" data-bs-target="#continuous-mode-pane" type="button" role="tab">Escaneo Continuo ⚡</button>
              </li>
            </ul>
          </div>
          <form id="form-create-serie">
            <div class="modal-body pb-2">
              <div class="mb-3">
                <label class="form-label">Producto</label>
                <select id="reg-producto" class="form-select" required>
                  ${productos.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('')}
                </select>
              </div>
              <div class="mb-3">
                <label class="form-label">Sede de Ingreso</label>
                <select id="reg-sede" class="form-select" required>
                  ${sedes.map(s => `<option value="${s.id}" ${s.id === defaultSedeId ? 'selected' : ''}>${s.nombre}</option>`).join('')}
                </select>
              </div>
              
              <div class="tab-content" id="reg-mode-content">
                <!-- PESTAÑA 1: CARGA MASIVA -->
                <div class="tab-pane fade show active" id="bulk-mode-pane" role="tabpanel">
                  <div class="mb-3">
                    <label class="form-label d-flex justify-content-between">
                      <span>Números de Serie / IMEIs (uno por línea o comas)</span>
                      <span class="badge bg-blue-lt" id="seriales-counter">0 detectados</span>
                    </label>
                    <textarea id="reg-imei" class="form-control" rows="5" placeholder="Escriba o pegue los seriales aquí…" spellcheck="false"></textarea>
                  </div>
                </div>

                <!-- PESTAÑA 2: ESCANEO CONTINUO -->
                <div class="tab-pane fade" id="continuous-mode-pane" role="tabpanel">
                  <div class="mb-3">
                    <label class="form-label">Escanear Código de Barras / Serial</label>
                    <input type="text" id="reg-imei-continuous" class="form-control" placeholder="Escanee y pulse enter para guardar…" spellcheck="false">
                  </div>
                  <div class="mb-3">
                    <label class="form-label">Bitácora de Escaneos (Sesión Actual)</label>
                    <div id="continuous-logs" class="border rounded p-2 overflow-auto bg-surface-light text-secondary" style="max-height: 150px; font-size: 0.85rem; background-color: #f6f8fb;">
                      <div class="text-center py-2 text-secondary-50">Esperando escaneos…</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-link link-secondary" data-bs-dismiss="modal">Cerrar</button>
              <button type="submit" id="btn-submit-reg" class="btn btn-primary ms-auto">Registrar Ingreso</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  const modalSerie = new bootstrap.Modal(document.getElementById('modal-serie'));
  const selectProd = document.getElementById('select-producto-series');
  const tbody = document.getElementById('series-table-body');

  const loadSeries = async () => {
    const prodId = selectProd.value;
    if (!prodId) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-secondary">Seleccione un producto para ver sus series en stock.</td></tr>`;
      return;
    }

    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4"><div class="spinner-border text-primary" role="status"></div></td></tr>`;

    try {
      const data = await apiFetch(`/series?producto=${prodId}`);
      if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-secondary">No hay series registradas para este producto.</td></tr>`;
        return;
      }

      tbody.innerHTML = data.map(s => {
        let estadoBadge = '';
        if (s.estado === 'en_stock') estadoBadge = '<span class="badge bg-green-lt">En Stock</span>';
        else if (s.estado === 'vendido') estadoBadge = '<span class="badge bg-secondary-lt">Vendido</span>';
        else if (s.estado === 'en_reparacion') estadoBadge = '<span class="badge bg-yellow-lt">En Taller</span>';
        else if (s.estado === 'reacondicionado') estadoBadge = '<span class="badge bg-blue-lt">Reacondicionado</span>';

        return `
          <tr>
            <td><code class="fw-bold text-dark">${s.serie}</code></td>
            <td>${s.producto.nombre}</td>
            <td>${s.sede.nombre}</td>
            <td>${estadoBadge}</td>
            <td>${s.cliente ? s.cliente.nombre : '-'}</td>
            <td>${s.fechaVenta ? new Date(s.fechaVenta).toLocaleDateString() : '-'}</td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-danger">Error al cargar listado: ${err.message}</td></tr>`;
    }
  };

  selectProd.addEventListener('change', loadSeries);

  // Consultar Historial IMEI
  document.getElementById('form-search-imei').addEventListener('submit', async (e) => {
    e.preventDefault();
    const imei = document.getElementById('input-search-imei').value.trim();
    const resDiv = document.getElementById('historial-resultado');
    resDiv.innerHTML = `<div class="spinner-border text-primary" role="status"></div>`;

    try {
      const data = await apiFetch(`/series/${imei}/historial`);
      const info = data.info;
      const rep = data.reparaciones;

      resDiv.innerHTML = `
        <div class="border p-3 rounded bg-surface">
          <div class="row">
            <div class="col-md-6">
              <div class="mb-1"><span class="text-secondary">Producto:</span> <strong>${info.producto.nombre}</strong></div>
              <div class="mb-1"><span class="text-secondary">Código Barras:</span> <code>${info.producto.codigoBarras}</code></div>
              <div class="mb-1"><span class="text-secondary">Estado actual:</span> <span class="badge bg-blue-lt">${info.estado.toUpperCase()}</span></div>
            </div>
            <div class="col-md-6">
              <div class="mb-1"><span class="text-secondary">Sede:</span> ${info.sede.nombre}</div>
              <div class="mb-1"><span class="text-secondary">Comprador:</span> ${info.cliente ? `${info.cliente.nombre} (${info.cliente.telefono})` : 'Ninguno'}</div>
              <div class="mb-1"><span class="text-secondary">Fecha Venta:</span> ${info.fechaVenta ? new Date(info.fechaVenta).toLocaleDateString() : 'N/A'}</div>
            </div>
          </div>
          
          <h4 class="mt-3 mb-2">Historial en Taller de Reparaciones</h4>
          ${rep.length === 0 ? `
            <div class="text-secondary small">Este equipo nunca ha ingresado a taller.</div>
          ` : `
            <div class="table-responsive">
              <table class="table table-vcenter table-sm card-table">
                <thead>
                  <tr>
                    <th>Orden #</th>
                    <th>Ingreso</th>
                    <th>Estado</th>
                    <th>Diagnóstico</th>
                  </tr>
                </thead>
                <tbody>
                  ${rep.map(r => `
                    <tr>
                      <td><a href="#/reparaciones?buscar=${r.numeroOrden}" class="fw-semibold">#${r.numeroOrden}</a></td>
                      <td>${new Date(r.createdAt).toLocaleDateString()}</td>
                      <td><span class="badge bg-secondary-lt">${r.estado}</span></td>
                      <td class="text-truncate" style="max-width: 150px;">${r.diagnostico || 'Sin diagnóstico'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      `;
    } catch (err) {
      resDiv.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
    }
  });

  // Botón nueva serie
  if (isAdminOrGerente) {
    const tabBulk = document.getElementById('tab-bulk-mode');
    const tabContinuous = document.getElementById('tab-continuous-mode');
    const btnSubmit = document.getElementById('btn-submit-reg');
    const inputContinuous = document.getElementById('reg-imei-continuous');
    const logsDiv = document.getElementById('continuous-logs');

    // Cambiar visibilidad de botón de lote según pestaña activa
    tabBulk.addEventListener('shown.bs.tab', () => {
      btnSubmit.classList.remove('d-none');
    });
    tabContinuous.addEventListener('shown.bs.tab', () => {
      btnSubmit.classList.add('d-none');
      inputContinuous.focus();
    });

    document.getElementById('btn-nueva-serie').addEventListener('click', () => {
      document.getElementById('form-create-serie').reset();
      document.getElementById('seriales-counter').textContent = '0 detectados';
      logsDiv.innerHTML = '<div class="text-center py-2 text-secondary-50">Esperando escaneos…</div>';
      // Pre-seleccionar sede del usuario o la primera disponible
      document.getElementById('reg-sede').value = usuario.sedeId || sedes[0]?.id || '';
      
      // Resetear a pestaña Carga Masiva
      const firstTab = new bootstrap.Tab(tabBulk);
      firstTab.show();

      modalSerie.show();
    });

    // Contador de seriales en área de texto
    document.getElementById('reg-imei').addEventListener('input', (e) => {
      const text = e.target.value;
      const count = text.split(/[\n,]+/).map(s => s.trim()).filter(s => s.length > 0).length;
      document.getElementById('seriales-counter').textContent = `${count} detectados`;
    });

    // Envío del formulario de lote (Modo Masivo)
    document.getElementById('form-create-serie').addEventListener('submit', async (e) => {
      e.preventDefault();

      const isBulkActive = tabBulk.classList.contains('active');
      if (!isBulkActive) return;

      const prodId = document.getElementById('reg-producto').value;
      const sedeId = document.getElementById('reg-sede').value;
      const textVal = document.getElementById('reg-imei').value;
      const series = textVal.split(/[\n,]+/).map(s => s.trim()).filter(s => s.length > 0);

      if (series.length === 0) {
        showToast('Error', 'Por favor, ingrese al menos un número de serie válido.', 'error');
        return;
      }

      try {
        const res = await apiFetch('/series/bulk', {
          method: 'POST',
          body: JSON.stringify({ series, productoId: prodId, sedeId })
        });
        showToast('Éxito', res.message, 'success');
        modalSerie.hide();
        loadSeries();
      } catch (err) {
        showToast('Error', err.message, 'error');
      }
    });

    // Evento Escaneo Continuo (Auto-guardado al presionar Enter/escanear)
    inputContinuous.addEventListener('keypress', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const serie = inputContinuous.value.trim();
        if (!serie) return;

        const prodId = document.getElementById('reg-producto').value;
        const sedeId = document.getElementById('reg-sede').value;

        // Limpiar input inmediatamente para agilizar el próximo escaneo
        inputContinuous.value = '';

        if (logsDiv.innerHTML.includes('Esperando escaneos…')) {
          logsDiv.innerHTML = '';
        }

        const logId = 'log-' + Date.now();
        const logItem = document.createElement('div');
        logItem.id = logId;
        logItem.className = 'd-flex justify-content-between align-items-center mb-1 py-1 border-bottom';
        logItem.innerHTML = `
          <span><code>${serie}</code></span>
          <span class="text-secondary small"><span class="spinner-border spinner-border-sm text-primary" role="status"></span> Guardando…</span>
        `;
        logsDiv.insertBefore(logItem, logsDiv.firstChild);

        try {
          await apiFetch('/series', {
            method: 'POST',
            body: JSON.stringify({ serie, productoId: prodId, sedeId })
          });

          logItem.querySelector('.text-secondary').className = 'text-success small fw-bold';
          logItem.querySelector('.text-success').innerHTML = '<i class="ti ti-circle-check me-1"></i> Registrado';

          showToast('Serial Registrado', `El serial ${serie} se registró exitosamente.`, 'success');
          loadSeries();
        } catch (err) {
          logItem.querySelector('.text-secondary').className = 'text-danger small fw-bold';
          logItem.querySelector('.text-danger').innerHTML = `<i class="ti ti-circle-x me-1"></i> ${err.message}`;

          showToast('Error de Escaneo', `${serie}: ${err.message}`, 'error');
        }
      }
    });
  }
}
