import { apiFetch } from '../api.js';
import { getUsuario } from '../auth.js';

export async function initDashboard(container) {
  const usuario = getUsuario();
  const isAdmin = ['admin', 'superadmin'].includes(usuario.rol);

  // Obtener sedes y configuración del sistema
  let sedes = [];
  let config = { empresa: 'TechStore Colombia' };
  try {
    if (isAdmin) {
      sedes = await apiFetch('/config/sedes');
    }
    config = await apiFetch('/config/sistema');
  } catch (e) {
    console.error('Error al obtener datos iniciales del dashboard:', e);
  }

  // Renderizar Estructura del Dashboard y Filtros
  container.innerHTML = `
    <div class="container-xl">
      <!-- Page header -->
      <div class="page-header d-print-none mb-4">
        <div class="row align-items-center">
          <div class="col">
            <h2 class="page-title">Dashboard Analítico</h2>
            <div class="text-secondary mt-1">${config.empresa} — Resumen operativo y financiero</div>
          </div>
          <!-- Filtros -->
          <div class="col-auto ms-auto d-print-none">
            <div class="btn-list">
              ${isAdmin ? `
                <div class="input-icon">
                  <select id="filter-sede" class="form-select">
                    <option value="">Todas las Sedes</option>
                    ${sedes.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('')}
                  </select>
                </div>
              ` : ''}
              <div class="input-icon">
                <select id="filter-periodo" class="form-select">
                  <option value="hoy" selected>Hoy</option>
                  <option value="semana">Últimos 7 días</option>
                  <option value="mes">Último mes</option>
                  <option value="año">Último año</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- KPI Grid Row 1 -->
      <div id="kpi-grid-row1" class="row row-cards mb-3"></div>

      <!-- KPI Grid Row 2 -->
      <div id="kpi-grid-row2" class="row row-cards mb-4"></div>

      <!-- Chart and Details Row -->
      <div class="row row-cards">
        <div class="col-lg-8">
          <div class="card">
            <div class="card-body">
              <h3 class="card-title">Tendencia de Ventas (Últimos 7 días)</h3>
              <div class="chart-container" style="position: relative; height: 300px; width: 100%;">
                <canvas id="chart-ventas"></canvas>
              </div>
            </div>
          </div>
        </div>

        <div class="col-lg-4">
          <div class="card" style="height: 360px;">
            <div class="card-body">
              <h3 class="card-title">Resumen de Operación</h3>
              <div class="list-group list-group-flush list-group-hoverable">
                <div class="list-group-item">
                  <div class="row align-items-center">
                    <div class="col-auto"><span class="badge bg-green"></span></div>
                    <div class="col text-truncate">
                      <a href="#/pos" class="text-body d-block fw-semibold">Punto de Venta (POS)</a>
                      <div class="d-block text-secondary text-truncate mt-n1">
                        Generar facturas de venta y cobros rápidos.
                      </div>
                    </div>
                  </div>
                </div>
                <div class="list-group-item">
                  <div class="row align-items-center">
                    <div class="col-auto"><span class="badge bg-blue"></span></div>
                    <div class="col text-truncate">
                      <a href="#/reparaciones" class="text-body d-block fw-semibold">Taller de Reparación</a>
                      <div class="d-block text-secondary text-truncate mt-n1">
                        Verificar reparaciones entrantes y actualizar estados.
                      </div>
                    </div>
                  </div>
                </div>
                <div class="list-group-item">
                  <div class="row align-items-center">
                    <div class="col-auto"><span class="badge bg-yellow"></span></div>
                    <div class="col text-truncate">
                      <a href="#/inventario" class="text-body d-block fw-semibold">Catálogo e Inventario</a>
                      <div class="d-block text-secondary text-truncate mt-n1">
                        Controlar stock mínimo por sede y traslados.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Variables de control de los gráficos
  let chartVentasInstance = null;

  // Cargar datos del Dashboard
  const loadDashboardData = async () => {
    const sedeId = isAdmin ? document.getElementById('filter-sede').value : usuario.sedeId;
    const periodo = document.getElementById('filter-periodo').value;

    try {
      // 1. Cargar KPIs
      const kpis = await apiFetch(`/dashboard/kpis?sede=${sedeId}&periodo=${periodo}`);
      renderKPIs(kpis);

      // 2. Cargar Gráfica
      const graficaData = await apiFetch(`/dashboard/graficas/ventas?sede=${sedeId}`);
      renderChart(graficaData);
    } catch (e) {
      console.error('Error al cargar datos del dashboard:', e);
    }
  };

  // Asignar listeners de filtros
  if (isAdmin) {
    document.getElementById('filter-sede').addEventListener('change', loadDashboardData);
  }
  document.getElementById('filter-periodo').addEventListener('change', loadDashboardData);

  // Primera carga
  await loadDashboardData();

  function renderKPIs(kpis) {
    const formatterCOP = new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    });

    const row1 = document.getElementById('kpi-grid-row1');
    const row2 = document.getElementById('kpi-grid-row2');

    // Row 1: Ventas, Productos Vendidos, Reparaciones Activas, Tiempo Promedio
    row1.innerHTML = `
      <div class="col-sm-6 col-lg-3">
        <div class="card card-sm card-kpi">
          <div class="card-body">
            <div class="row align-items-center">
              <div class="col-auto">
                <span class="bg-primary text-white avatar"><i class="ti ti-wallet fs-2"></i></span>
              </div>
              <div class="col">
                <div class="font-weight-medium fs-3">${formatterCOP.format(kpis.ventasTotal)}</div>
                <div class="text-secondary">Ventas Totales</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="col-sm-6 col-lg-3">
        <div class="card card-sm card-kpi">
          <div class="card-body">
            <div class="row align-items-center">
              <div class="col-auto">
                <span class="bg-green text-white avatar"><i class="ti ti-shopping-cart fs-2"></i></span>
              </div>
              <div class="col">
                <div class="font-weight-medium fs-3">${kpis.unidadesVendidas}</div>
                <div class="text-secondary">Unidades Vendidas</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="col-sm-6 col-lg-3">
        <div class="card card-sm card-kpi">
          <div class="card-body">
            <div class="row align-items-center">
              <div class="col-auto">
                <span class="bg-yellow text-white avatar"><i class="ti ti-tool fs-2"></i></span>
              </div>
              <div class="col">
                <div class="font-weight-medium fs-3">${kpis.reparacionesActivas}</div>
                <div class="text-secondary">Reparaciones Activas</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="col-sm-6 col-lg-3">
        <div class="card card-sm card-kpi">
          <div class="card-body">
            <div class="row align-items-center">
              <div class="col-auto">
                <span class="bg-purple text-white avatar"><i class="ti ti-clock fs-2"></i></span>
              </div>
              <div class="col">
                <div class="font-weight-medium fs-3">${kpis.tiempoPromedio} días</div>
                <div class="text-secondary">Tiempo Promedio</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Row 2: Dinero en Caja, Stock Bajo Alerta, Cartera Pendiente, Clientes Nuevos
    row2.innerHTML = `
      <div class="col-sm-6 col-lg-3">
        <div class="card card-sm card-kpi">
          <div class="card-body">
            <div class="row align-items-center">
              <div class="col-auto">
                <span class="bg-teal text-white avatar"><i class="ti ti-cash fs-2"></i></span>
              </div>
              <div class="col">
                <div class="font-weight-medium fs-3">${formatterCOP.format(kpis.dineroEnCaja)}</div>
                <div class="text-secondary">Dinero en Caja</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="col-sm-6 col-lg-3">
        <div class="card card-sm card-kpi">
          <div class="card-body">
            <div class="row align-items-center">
              <div class="col-auto">
                <span class="bg-red text-white avatar"><i class="ti ti-alert-triangle fs-2"></i></span>
              </div>
              <div class="col">
                <div class="font-weight-medium fs-3">${kpis.stockBajoCount}</div>
                <div class="text-secondary">Stock Bajo Alerta</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="col-sm-6 col-lg-3">
        <div class="card card-sm card-kpi">
          <div class="card-body">
            <div class="row align-items-center">
              <div class="col-auto">
                <span class="bg-orange text-white avatar"><i class="ti ti-file-invoice fs-2"></i></span>
              </div>
              <div class="col">
                <div class="font-weight-medium fs-3">${formatterCOP.format(kpis.totalCartera)}</div>
                <div class="text-secondary">Cartera Pendiente</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="col-sm-6 col-lg-3">
        <div class="card card-sm card-kpi">
          <div class="card-body">
            <div class="row align-items-center">
              <div class="col-auto">
                <span class="bg-cyan text-white avatar"><i class="ti ti-users fs-2"></i></span>
              </div>
              <div class="col">
                <div class="font-weight-medium fs-3">${kpis.clientesNuevos}</div>
                <div class="text-secondary">Clientes Nuevos</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderChart(graficaData) {
    const ctx = document.getElementById('chart-ventas').getContext('2d');
    
    const labels = graficaData.map(d => d.fecha);
    const data = graficaData.map(d => d.total);

    // Destruir instancia anterior para evitar duplicaciones
    if (chartVentasInstance) {
      chartVentasInstance.destroy();
    }

    const isDarkMode = document.body.getAttribute('data-bs-theme') === 'dark';
    const gridColor = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)';
    const textColor = isDarkMode ? '#f1f5f9' : '#1e293b';

    chartVentasInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Ventas en COP',
          data: data,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.1)',
          fill: true,
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 4,
          pointBackgroundColor: '#2563eb'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                let value = context.parsed.y;
                return ' Ventas: ' + new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value);
              }
            }
          }
        },
        scales: {
          y: {
            grid: {
              color: gridColor
            },
            ticks: {
              color: textColor,
              callback: function(value) {
                if (value >= 1000000) {
                  return '$' + (value / 1000000) + 'M';
                }
                if (value >= 1000) {
                  return '$' + (value / 1000) + 'K';
                }
                return '$' + value;
              }
            }
          },
          x: {
            grid: {
              color: gridColor
            },
            ticks: {
              color: textColor
            }
          }
        }
      }
    });
  }
}
