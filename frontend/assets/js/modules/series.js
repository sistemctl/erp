import { apiFetch } from '../api.js';
import { getUsuario } from '../auth.js';

export async function initSeries(container) {
  const usuario = getUsuario();
  const isAdminOrGerente = ['admin', 'gerente_sede'].includes(usuario.rol);
  let sedes = [];
  let productos = [];

  try {
    sedes = await apiFetch('/config/sedes');
    productos = await apiFetch('/productos').then(p => p.filter(prod => prod.tieneNumeroSerie));
  } catch (e) {
    console.error('Error al precargar datos en módulo series:', e);
  }

  container.innerHTML = `
    <div class="container-xl">
      <div class="page-header d-print-none mb-4">
        <div class="row align-items-center">
          <div class="col">
            <h2 class="page-title">Gestión de Números de Serie / IMEI</h2>
            <div class="text-secondary mt-1">Control de trazabilidad e historial de dispositivos por número único</div>
          </div>
          <div class="col-auto ms-auto d-print-none">
            <div class="btn-list">
              ${isAdminOrGerente ? `
                <button id="btn-nueva-serie" class="btn btn-primary">
                  <i class="ti ti-plus me-2"></i> Registrar IMEI/Serie
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      </div>

      <!-- Buscador -->
      <div class="row mb-4">
        <div class="col-lg-8">
          <div class="card">
            <div class="card-body">
              <h3 class="card-title">Consultar Historial por IMEI / Serie</h3>
              <form id="form-search-imei" class="row g-2">
                <div class="col-md-9">
                  <input type="text" id="input-search-imei" class="form-control" placeholder="Ingrese el IMEI o número de serie completo..." required>
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
                <option value="">Seleccione un producto...</option>
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
          <div class="modal-header">
            <h5 class="modal-title">Registrar IMEI / Serie</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <form id="form-create-serie">
            <div class="modal-body">
              <div class="mb-3">
                <label class="form-label">Producto</label>
                <select id="reg-producto" class="form-select" required>
                  ${productos.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('')}
                </select>
              </div>
              <div class="mb-3">
                <label class="form-label">Sede de Ingreso</label>
                <select id="reg-sede" class="form-select" required>
                  ${sedes.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('')}
                </select>
              </div>
              <div class="mb-3">
                <label class="form-label">Número de Serie o IMEI</label>
                <input type="text" id="reg-imei" class="form-control" placeholder="Ej: 358901234567890" required>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-link link-secondary" data-bs-dismiss="modal">Cancelar</button>
              <button type="submit" class="btn btn-primary ms-auto">Registrar Ingreso</button>
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
    document.getElementById('btn-nueva-serie').addEventListener('click', () => {
      document.getElementById('form-create-serie').reset();
      // Pre-seleccionar sede del usuario
      document.getElementById('reg-sede').value = usuario.sedeId;
      modalSerie.show();
    });

    document.getElementById('form-create-serie').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = {
        productoId: document.getElementById('reg-producto').value,
        sedeId: document.getElementById('reg-sede').value,
        serie: document.getElementById('reg-imei').value.trim()
      };

      try {
        await apiFetch('/series', { method: 'POST', body: JSON.stringify(data) });
        modalSerie.hide();
        loadSeries();
      } catch (err) {
        alert(err.message);
      }
    });
  }
}
