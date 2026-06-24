import { apiFetch } from '../api.js';
import { getUsuario } from '../auth.js';

export async function initRentabilidad(container) {
  const usuario = getUsuario();
  const isAdminOrGerente = ['admin', 'gerente_sede'].includes(usuario.rol);
  const isContador = usuario.rol === 'contador';

  if (!isAdminOrGerente && !isContador) {
    container.innerHTML = `
      <div class="container-xl py-5">
        <div class="alert alert-danger">
          <h4 class="alert-title">Acceso Denegado</h4>
          <div class="text-secondary">Usted no tiene permisos para ver el análisis de rentabilidad.</div>
        </div>
      </div>
    `;
    return;
  }

  let tecnicos = [];
  try {
    tecnicos = await apiFetch('/config/usuarios').then(users => users.filter(u => u.rol === 'tecnico'));
  } catch (e) {
    console.error('Error al precargar técnicos:', e);
  }

  container.innerHTML = `
    <div class="container-xl">
      <div class="page-header d-print-none mb-4">
        <div class="row align-items-center">
          <div class="col">
            <h2 class="page-title">Análisis de Rentabilidad de Reparaciones</h2>
            <div class="text-secondary mt-1">Comparativa de ingresos de mano de obra y costos de repuestos por técnico y equipo</div>
          </div>
        </div>
      </div>

      <!-- Filtros -->
      <div class="card mb-4 d-print-none">
        <div class="card-body">
          <form id="form-filtros-rentabilidad" class="row g-3">
            <div class="col-md-3">
              <label class="form-label">Técnico</label>
              <select id="filtro-tecnico" class="form-select">
                <option value="">-- Todos los Técnicos --</option>
                ${tecnicos.map(t => `<option value="${t.id}">${t.nombre}</option>`).join('')}
              </select>
            </div>
            <div class="col-md-3">
              <label class="form-label">Desde</label>
              <input type="date" id="filtro-desde" class="form-control">
            </div>
            <div class="col-md-3">
              <label class="form-label">Hasta</label>
              <input type="date" id="filtro-hasta" class="form-control">
            </div>
            <div class="col-md-3 d-flex align-items-end">
              <button type="submit" class="btn btn-primary w-100"><i class="ti ti-filter me-1"></i> Filtrar</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Tarjetas de Resumen (KPIs) -->
      <div class="row row-cards mb-4" id="kpis-rentabilidad">
        <!-- Se rellena dinámicamente -->
      </div>

      <!-- Detalle Tabla de Rentabilidad -->
      <div class="card">
        <div class="card-header d-flex justify-content-between align-items-center">
          <h3 class="card-title">Desglose de Márgenes Financieros</h3>
          <button class="btn btn-outline-secondary btn-sm" onclick="window.print()">
            <i class="ti ti-printer me-1"></i> Imprimir Reporte
          </button>
        </div>
        <div class="table-responsive">
          <table class="table table-vcenter card-table table-hover table-striped">
            <thead>
              <tr>
                <th>Orden</th>
                <th>Fecha</th>
                <th>Equipo</th>
                <th>Técnico</th>
                <th class="text-end">Mano de Obra</th>
                <th class="text-end">Costo Repuestos</th>
                <th class="text-end">Total Cobrado</th>
                <th class="text-end">Margen (COP)</th>
                <th class="text-center">Margen (%)</th>
              </tr>
            </thead>
            <tbody id="rentabilidad-table-body">
              <!-- Se rellena dinámicamente -->
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  const tbody = document.getElementById('rentabilidad-table-body');
  const kpisContainer = document.getElementById('kpis-rentabilidad');

  async function loadReport() {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4"><div class="spinner-border text-primary" role="status"></div></td></tr>`;

    try {
      const tecnico = document.getElementById('filtro-tecnico').value;
      const desde = document.getElementById('filtro-desde').value;
      const hasta = document.getElementById('filtro-hasta').value;

      let query = '';
      const params = [];
      if (tecnico) params.push(`tecnico=${tecnico}`);
      if (desde) params.push(`desde=${desde}`);
      if (hasta) params.push(`hasta=${hasta}`);
      if (params.length > 0) {
        query = '?' + params.join('&');
      }

      const data = await apiFetch(`/reparaciones/rentabilidad/reporte${query}`);
      const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

      if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-secondary">No se encontraron registros de rentabilidad.</td></tr>`;
        kpisContainer.innerHTML = '';
        return;
      }

      let totalCobradoAcum = 0;
      let totalCostoAcum = 0;
      let totalMargenAcum = 0;

      tbody.innerHTML = data.map(r => {
        const orden = r.orden || {};
        const manoObra = parseFloat(orden.costoManoObra || 0);
        const costoRepuestos = parseFloat(orden.costoRepuestos || 0);
        const cobrado = parseFloat(r.totalCobrado || 0);
        const costoReal = parseFloat(r.costoReal || 0);
        const margen = cobrado - (costoReal + manoObra);
        const pctMargen = cobrado > 0 ? (margen / cobrado) * 100 : 0;

        totalCobradoAcum += cobrado;
        // Costo total de la reparación es repuestos + mano de obra (que se le paga al técnico o representa costo de producción)
        totalCostoAcum += (costoReal + manoObra);
        totalMargenAcum += margen;

        let badgeClass = 'bg-green-lt';
        if (pctMargen < 20) badgeClass = 'bg-danger-lt';
        else if (pctMargen < 45) badgeClass = 'bg-warning-lt';

        return `
          <tr>
            <td><strong class="text-blue">${orden.numeroOrden || 'N/A'}</strong></td>
            <td>${orden.createdAt ? new Date(orden.createdAt).toLocaleDateString() : 'N/A'}</td>
            <td>${orden.tipoEquipo || ''} ${orden.marca || ''} ${orden.modelo || ''}</td>
            <td>${orden.tecnico ? orden.tecnico.nombre : 'N/A'}</td>
            <td class="text-end">${formatter.format(manoObra)}</td>
            <td class="text-end text-danger">${formatter.format(costoRepuestos)}</td>
            <td class="text-end fw-bold text-primary">${formatter.format(cobrado)}</td>
            <td class="text-end fw-bold ${margen >= 0 ? 'text-success' : 'text-danger'}">${formatter.format(margen)}</td>
            <td class="text-center">
              <span class="badge ${badgeClass} px-2 py-1">${pctMargen.toFixed(1)}%</span>
            </td>
          </tr>
        `;
      }).join('');

      // Calcular KPI global
      const pctMargenPromedio = totalCobradoAcum > 0 ? (totalMargenAcum / totalCobradoAcum) * 100 : 0;

      kpisContainer.innerHTML = `
        <div class="col-sm-6 col-lg-3">
          <div class="card card-sm">
            <div class="card-body">
              <div class="row align-items-center">
                <div class="col-auto">
                  <span class="bg-blue text-white avatar"><i class="ti ti-cash fs-1"></i></span>
                </div>
                <div class="col">
                  <div class="font-weight-medium">Ingresos Totales</div>
                  <div class="text-secondary h3 mb-0">${formatter.format(totalCobradoAcum)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="col-sm-6 col-lg-3">
          <div class="card card-sm">
            <div class="card-body">
              <div class="row align-items-center">
                <div class="col-auto">
                  <span class="bg-red text-white avatar"><i class="ti ti-calculator fs-1"></i></span>
                </div>
                <div class="col">
                  <div class="font-weight-medium">Costos Operativos</div>
                  <div class="text-secondary h3 mb-0">${formatter.format(totalCostoAcum)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="col-sm-6 col-lg-3">
          <div class="card card-sm">
            <div class="card-body">
              <div class="row align-items-center">
                <div class="col-auto">
                  <span class="bg-green text-white avatar"><i class="ti ti-trending-up fs-1"></i></span>
                </div>
                <div class="col">
                  <div class="font-weight-medium">Margen Neto</div>
                  <div class="text-secondary h3 mb-0">${formatter.format(totalMargenAcum)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="col-sm-6 col-lg-3">
          <div class="card card-sm">
            <div class="card-body">
              <div class="row align-items-center">
                <div class="col-auto">
                  <span class="bg-purple text-white avatar"><i class="ti ti-chart-pie fs-1"></i></span>
                </div>
                <div class="col">
                  <div class="font-weight-medium">Margen Promedio</div>
                  <div class="text-secondary h3 mb-0">${pctMargenPromedio.toFixed(2)}%</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-danger">Error al cargar rentabilidad: ${err.message}</td></tr>`;
      kpisContainer.innerHTML = '';
    }
  }

  document.getElementById('form-filtros-rentabilidad').addEventListener('submit', (e) => {
    e.preventDefault();
    loadReport();
  });

  loadReport();
}
