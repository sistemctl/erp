import { apiFetch } from '../api.js';
import { getUsuario } from '../auth.js';
import { showConfirm } from '../utils/toast.js';

export async function initNomina(container) {
  const usuario = getUsuario();
  const isAdminOrContador = ['admin', 'superadmin', 'contador'].includes(usuario.rol);

  if (!isAdminOrContador) {
    container.innerHTML = `
      <div class="container-xl py-5">
        <div class="alert alert-danger">
          <h4 class="alert-title">Acceso Denegado</h4>
          <div class="text-secondary">Usted no cuenta con permisos para gestionar la nómina de la empresa.</div>
        </div>
      </div>
    `;
    return;
  }

  let empleados = [];
  let nominas = [];
  let sedes = [];

  async function loadInitialData() {
    try {
      empleados = await apiFetch('/empleados');
      nominas = await apiFetch('/nomina');
      sedes = await apiFetch('/config/sedes').catch(() => []);
    } catch (e) {
      console.error('Error al precargar datos de nómina:', e);
    }
  }

  await loadInitialData();

  container.innerHTML = `
    <div class="container-xl">
      <div class="page-header d-print-none mb-4">
        <div class="row align-items-center">
          <div class="col">
            <h2 class="page-title">Gestión de Nómina y Personal</h2>
            <div class="text-secondary mt-1">Administración de contratos, liquidaciones bajo ley colombiana y control de pagos</div>
          </div>
        </div>
      </div>

      <!-- Navigation tabs -->
      <div class="card mb-4 d-print-none">
        <div class="card-header">
          <ul class="nav nav-tabs card-header-tabs" data-bs-toggle="tabs" role="tablist">
            <li class="nav-item" role="presentation">
              <a href="#tab-empleados" class="nav-link active" data-bs-toggle="tab" aria-selected="true" role="tab">
                <i class="ti ti-users me-1"></i> Directorio de Colaboradores
              </a>
            </li>
            <li class="nav-item" role="presentation">
              <a href="#tab-liquidaciones" class="nav-link" data-bs-toggle="tab" aria-selected="false" role="tab" tabindex="-1">
                <i class="ti ti-calculator me-1"></i> Liquidaciones de Nómina
              </a>
            </li>
          </ul>
        </div>
        <div class="card-body">
          <div class="tab-content">
            <!-- TAB 1: EMPLEADOS -->
            <div class="tab-pane active show" id="tab-empleados" role="tabpanel">
              <div class="d-flex justify-content-between align-items-center mb-3">
                <h3 class="card-title mb-0">Listado de Empleados</h3>
                <button id="btn-nuevo-empleado" class="btn btn-primary btn-sm">
                  <i class="ti ti-plus me-1"></i> Agregar Empleado
                </button>
              </div>

              <div class="table-responsive">
                <table class="table table-vcenter card-table table-hover table-striped">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Identificación</th>
                      <th>Cargo / Sede</th>
                      <th>Tipo Contrato</th>
                      <th class="text-end">Salario Base</th>
                      <th class="text-center">Estado</th>
                      <th class="text-end">Acciones</th>
                    </tr>
                  </thead>
                  <tbody id="empleados-table-body">
                    <!-- Dinámico -->
                  </tbody>
                </table>
              </div>
            </div>

            <!-- TAB 2: LIQUIDACIONES -->
            <div class="tab-pane" id="tab-liquidaciones" role="tabpanel">
              <div class="d-flex justify-content-between align-items-center mb-3">
                <h3 class="card-title mb-0">Historial de Liquidaciones</h3>
                <button id="btn-calcular-nomina" class="btn btn-success btn-sm">
                  <i class="ti ti-wallet me-1"></i> Procesar Liquidación
                </button>
              </div>

              <div class="table-responsive">
                <table class="table table-vcenter card-table table-hover table-striped">
                  <thead>
                    <tr>
                      <th>Colaborador</th>
                      <th>Período</th>
                      <th>Tipo</th>
                      <th class="text-end">Devengado</th>
                      <th class="text-end">Deducciones</th>
                      <th class="text-end">Neto a Pagar</th>
                      <th class="text-center">Estado</th>
                      <th class="text-end">Acciones</th>
                    </tr>
                  </thead>
                  <tbody id="nominas-table-body">
                    <!-- Dinámico -->
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal Empleado Form -->
    <div class="modal modal-blur fade" id="modal-empleado" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered" role="document">
        <div class="modal-content">
          <form id="form-empleado">
            <input type="hidden" id="emp-id">
            <div class="modal-header">
              <h5 class="modal-title" id="modal-title-empleado">Registrar Empleado</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              <div class="mb-3">
                <label class="form-label required">Nombre Completo</label>
                <input type="text" id="emp-nombre" class="form-control" required placeholder="Ej: Diana Valencia">
              </div>
              <div class="mb-3">
                <label class="form-label required">Cédula de Ciudadanía</label>
                <input type="text" id="emp-documento" class="form-control" required placeholder="Ej: 1020456789">
              </div>
              <div class="row">
                <div class="col-6 mb-3">
                  <label class="form-label">Teléfono</label>
                  <input type="text" id="emp-telefono" class="form-control" placeholder="Ej: 3109876543">
                </div>
                <div class="col-6 mb-3">
                  <label class="form-label">Email</label>
                  <input type="email" id="emp-email" class="form-control" placeholder="Ej: diana@techstore.com" spellcheck="false">
                </div>
              </div>
              <div class="row">
                <div class="col-6 mb-3">
                  <label class="form-label">Cargo</label>
                  <input type="text" id="emp-cargo" class="form-control" placeholder="Ej: Técnico Senior">
                </div>
                <div class="col-6 mb-3">
                  <label class="form-label required">Sede Principal</label>
                  <select id="emp-sede" class="form-select" required>
                    ${sedes.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('')}
                  </select>
                </div>
              </div>
              <div class="row">
                <div class="col-6 mb-3">
                  <label class="form-label required">Tipo Contrato</label>
                  <select id="emp-contrato" class="form-select" required>
                    <option value="indefinido">Indefinido</option>
                    <option value="fijo">Término Fijo</option>
                    <option value="prestacion_servicios">Prestación de Servicios</option>
                  </select>
                </div>
                <div class="col-6 mb-3">
                  <label class="form-label required">Salario Mensual ($ COP)</label>
                  <input type="number" id="emp-salario" class="form-control" min="0" required placeholder="COP">
                </div>
              </div>
              <div class="mb-3">
                <label class="form-check form-switch mt-2">
                  <input class="form-check-input" type="checkbox" id="emp-aux-transporte" checked>
                  <span class="form-check-label">Aplica Auxilio de Transporte (Si gana <= 2 SMLV)</span>
                </label>
              </div>
              <div class="mb-3">
                <label class="form-label required">Fecha de Ingreso</label>
                <input type="date" id="emp-fecha-ingreso" class="form-control" required>
              </div>
              <div class="row">
                <div class="col-6 mb-3">
                  <label class="form-label">Banco</label>
                  <input type="text" id="emp-banco" class="form-control" placeholder="Bancolombia">
                </div>
                <div class="col-6 mb-3">
                  <label class="form-label">Cuenta de Ahorros</label>
                  <input type="text" id="emp-cuenta" class="form-control" placeholder="987-654321-01">
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-link link-secondary" data-bs-dismiss="modal">Cancelar</button>
              <button type="submit" class="btn btn-primary ms-auto">Guardar Colaborador</button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- Modal Calcular Nómina -->
    <div class="modal modal-blur fade" id="modal-calcular-nomina" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered" role="document">
        <div class="modal-content">
          <form id="form-calcular-nomina">
            <div class="modal-header">
              <h5 class="modal-title">Procesar Liquidación de Nómina</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              <div class="mb-3">
                <label class="form-label required">Colaborador</label>
                <select id="calc-empleado" class="form-select" required>
                  <option value="">-- Seleccionar Colaborador Activo --</option>
                  ${empleados.filter(e => e.activo).map(e => `<option value="${e.id}">${e.nombre} (${e.cargo || 'N/A'})</option>`).join('')}
                </select>
              </div>
              <div class="row">
                <div class="col-6 mb-3">
                  <label class="form-label required">Frecuencia Pago</label>
                  <select id="calc-tipo-periodo" class="form-select" required>
                    <option value="quincenal">Quincenal</option>
                    <option value="mensual">Mensual</option>
                  </select>
                </div>
                <div class="col-6 mb-3">
                  <label class="form-label required">Período (YYYY-MM-DD o YYYY-MM)</label>
                  <input type="text" id="calc-periodo" class="form-control" required placeholder="Ej: 2026-06-15 o 2026-06">
                </div>
              </div>

              <h4 class="text-primary mt-3 mb-2">Devengados Adicionales (COP)</h4>
              <div class="row">
                <div class="col-6 mb-3">
                  <label class="form-label">Horas Extras</label>
                  <input type="number" id="calc-extras" class="form-control" min="0" value="0">
                </div>
                <div class="col-6 mb-3">
                  <label class="form-label">Recargos Nocturnos</label>
                  <input type="number" id="calc-recargos" class="form-control" min="0" value="0">
                </div>
              </div>
              <div class="row">
                <div class="col-6 mb-3">
                  <label class="form-label">Dominicales / Festivos</label>
                  <input type="number" id="calc-dominicales" class="form-control" min="0" value="0">
                </div>
                <div class="col-6 mb-3">
                  <label class="form-label">Bonificaciones Extra</label>
                  <input type="number" id="calc-bonos" class="form-control" min="0" value="0">
                </div>
              </div>

              <h4 class="text-danger mt-3 mb-2">Deducciones Adicionales (COP)</h4>
              <div class="mb-3">
                <label class="form-label">Préstamos / Libranzas</label>
                <input type="number" id="calc-prestamos" class="form-control" min="0" value="0">
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-link link-secondary" data-bs-dismiss="modal">Cancelar</button>
              <button type="submit" class="btn btn-success ms-auto"><i class="ti ti-calculator me-1"></i>Liquidar y Guardar</button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- Modal Detalle Liquidación -->
    <div class="modal modal-blur fade" id="modal-detalle-liquidacion" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered" role="document">
        <div class="modal-content" id="detalle-liquidacion-content">
          <!-- Carga dinámica -->
        </div>
      </div>
    </div>
  `;

  const tbodyEmp = document.getElementById('empleados-table-body');
  const tbodyNom = document.getElementById('nominas-table-body');
  const modalEmp = new bootstrap.Modal(document.getElementById('modal-empleado'));
  const modalCalc = new bootstrap.Modal(document.getElementById('modal-calcular-nomina'));
  const modalDetalle = new bootstrap.Modal(document.getElementById('modal-detalle-liquidacion'));

  const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

  function renderEmpleadosTable() {
    if (empleados.length === 0) {
      tbodyEmp.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-secondary">No hay empleados registrados.</td></tr>`;
      return;
    }

    tbodyEmp.innerHTML = empleados.map(e => `
      <tr>
        <td><strong>${e.nombre}</strong><div class="small text-secondary">${e.email || ''}</div></td>
        <td>${e.documento}</td>
        <td>${e.cargo || 'N/A'}<div class="small text-secondary">${e.sede ? e.sede.nombre : 'N/A'}</div></td>
        <td><span class="badge bg-blue-lt">${e.tipoContrato.toUpperCase()}</span></td>
        <td class="text-end fw-bold">${formatter.format(e.salarioBase)}</td>
        <td class="text-center">
          <span class="badge ${e.activo ? 'bg-success-lt' : 'bg-danger-lt'} px-2 py-1">${e.activo ? 'ACTIVO' : 'INACTIVO'}</span>
        </td>
        <td class="text-end">
          <button class="btn btn-outline-secondary btn-icon btn-sm btn-edit-emp" data-id="${e.id}" title="Editar" aria-label="Editar empleado">
            <i class="ti ti-edit"></i>
          </button>
          ${e.activo ? `
            <button class="btn btn-outline-danger btn-icon btn-sm btn-delete-emp" data-id="${e.id}" title="Desvincular" aria-label="Desvincular empleado">
              <i class="ti ti-user-x"></i>
            </button>
          ` : ''}
        </td>
      </tr>
    `).join('');

    // Attach listeners
    document.querySelectorAll('.btn-edit-emp').forEach(btn => {
      btn.addEventListener('click', () => openEditEmpleado(btn.dataset.id));
    });

    document.querySelectorAll('.btn-delete-emp').forEach(btn => {
      btn.addEventListener('click', () => desvincularEmpleado(btn.dataset.id));
    });
  }

  function renderNominasTable() {
    if (nominas.length === 0) {
      tbodyNom.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-secondary">No hay liquidaciones registradas en el sistema.</td></tr>`;
      return;
    }

    tbodyNom.innerHTML = nominas.map(n => {
      let badgeClass = 'bg-warning-lt';
      if (n.estado === 'aprobada') badgeClass = 'bg-blue-lt';
      else if (n.estado === 'pagada') badgeClass = 'bg-success-lt';

      return `
        <tr>
          <td><strong>${n.empleado ? n.empleado.nombre : 'N/A'}</strong><div class="small text-secondary">${n.empleado ? n.empleado.cargo : ''}</div></td>
          <td>${n.periodo}</td>
          <td><span class="badge bg-purple-lt">${n.tipoPeriodo.toUpperCase()}</span></td>
          <td class="text-end">${formatter.format(n.totalDevengado)}</td>
          <td class="text-end text-danger">-${formatter.format(n.totalDeducciones)}</td>
          <td class="text-end fw-bold text-primary">${formatter.format(n.neto)}</td>
          <td class="text-center">
            <span class="badge ${badgeClass} px-2 py-1">${n.estado.toUpperCase()}</span>
          </td>
          <td class="text-end">
            <button class="btn btn-outline-primary btn-icon btn-sm btn-ver-nom" data-id="${n.id}" title="Ver Detalle" aria-label="Ver detalle de nómina">
              <i class="ti ti-eye"></i>
            </button>
            <button class="btn btn-outline-secondary btn-icon btn-sm btn-pdf-nom" data-id="${n.id}" title="Descargar Desprendible PDF" aria-label="Descargar PDF de nómina">
              <i class="ti ti-file-text"></i>
            </button>
            ${n.estado === 'borrador' ? `
              <button class="btn btn-outline-danger btn-icon btn-sm btn-delete-nom" data-id="${n.id}" title="Eliminar Borrador" aria-label="Eliminar borrador de nómina">
                <i class="ti ti-trash"></i>
              </button>
            ` : ''}
          </td>
        </tr>
      `;
    }).join('');

    // Attach listeners
    document.querySelectorAll('.btn-ver-nom').forEach(btn => {
      btn.addEventListener('click', () => openDetalleLiquidacion(btn.dataset.id));
    });

    document.querySelectorAll('.btn-pdf-nom').forEach(btn => {
      btn.addEventListener('click', () => downloadDesprendible(btn.dataset.id));
    });

    document.querySelectorAll('.btn-delete-nom').forEach(btn => {
      btn.addEventListener('click', () => deleteNomina(btn.dataset.id));
    });
  }

  renderEmpleadosTable();
  renderNominasTable();

  // Create Form Employee Open
  document.getElementById('btn-nuevo-empleado').addEventListener('click', () => {
    document.getElementById('form-empleado').reset();
    document.getElementById('emp-id').value = '';
    document.getElementById('modal-title-empleado').textContent = 'Registrar Colaborador';
    modalEmp.show();
  });

  // Edit Employee Open
  function openEditEmpleado(id) {
    const e = empleados.find(emp => emp.id === id);
    if (!e) return;

    document.getElementById('emp-id').value = e.id;
    document.getElementById('emp-nombre').value = e.nombre;
    document.getElementById('emp-documento').value = e.documento;
    document.getElementById('emp-telefono').value = e.telefono || '';
    document.getElementById('emp-email').value = e.email || '';
    document.getElementById('emp-cargo').value = e.cargo || '';
    document.getElementById('emp-sede').value = e.sedeId;
    document.getElementById('emp-contrato').value = e.tipoContrato;
    document.getElementById('emp-salario').value = e.salarioBase;
    document.getElementById('emp-aux-transporte').checked = !!e.auxilioTransporte;
    document.getElementById('emp-fecha-ingreso').value = e.fechaIngreso ? e.fechaIngreso.split('T')[0] : '';
    document.getElementById('emp-banco').value = e.banco || '';
    document.getElementById('emp-cuenta').value = e.cuentaBancaria || '';
    document.getElementById('modal-title-empleado').textContent = 'Editar Ficha Colaborador';
    modalEmp.show();
  }

  // Submit Employee
  document.getElementById('form-empleado').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const id = document.getElementById('emp-id').value;
    const payload = {
      nombre: document.getElementById('emp-nombre').value,
      documento: document.getElementById('emp-documento').value,
      telefono: document.getElementById('emp-telefono').value,
      email: document.getElementById('emp-email').value,
      cargo: document.getElementById('emp-cargo').value,
      sedeId: document.getElementById('emp-sede').value,
      tipoContrato: document.getElementById('emp-contrato').value,
      salarioBase: document.getElementById('emp-salario').value,
      auxilioTransporte: document.getElementById('emp-aux-transporte').checked,
      fechaIngreso: document.getElementById('emp-fecha-ingreso').value,
      banco: document.getElementById('emp-banco').value,
      cuentaBancaria: document.getElementById('emp-cuenta').value
    };

    try {
      if (id) {
        await apiFetch(`/empleados/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await apiFetch('/empleados', { method: 'POST', body: JSON.stringify(payload) });
      }
      modalEmp.hide();
      await loadInitialData();
      renderEmpleadosTable();
    } catch (e) {
      alert('Error al guardar empleado: ' + e.message);
    }
  });

  // Soft delete employee
  async function desvincularEmpleado(id) {
    const verificado = await showConfirm('Desvincular Empleado', '¿Está seguro de que desea desvincular a este empleado del sistema? Esto cambiará su estado a inactivo.');
    if (!verificado) {
      return;
    }
    try {
      await apiFetch(`/empleados/${id}`, { method: 'DELETE' });
      await loadInitialData();
      renderEmpleadosTable();
    } catch (e) {
      alert('Error al desvincular empleado: ' + e.message);
    }
  }

  // Open Process Liquidación
  document.getElementById('btn-calcular-nomina').addEventListener('click', () => {
    document.getElementById('form-calcular-nomina').reset();
    modalCalc.show();
  });

  // Submit Process Liquidación
  document.getElementById('form-calcular-nomina').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const payload = {
      empleadoId: document.getElementById('calc-empleado').value,
      tipoPeriodo: document.getElementById('calc-tipo-periodo').value,
      periodo: document.getElementById('calc-periodo').value,
      horasExtra: document.getElementById('calc-extras').value || 0,
      recargosNocturnos: document.getElementById('calc-recargos').value || 0,
      dominicales: document.getElementById('calc-dominicales').value || 0,
      bonos: document.getElementById('calc-bonos').value || 0,
      deduccionPrestamos: document.getElementById('calc-prestamos').value || 0
    };

    try {
      await apiFetch('/nomina/calcular', { method: 'POST', body: JSON.stringify(payload) });
      modalCalc.hide();
      await loadInitialData();
      renderNominasTable();
    } catch (e) {
      alert('Error al calcular liquidación: ' + e.message);
    }
  });

  // Open Detalle Liquidación (Arqueo/Ficha)
  async function openDetalleLiquidacion(id) {
    const content = document.getElementById('detalle-liquidacion-content');
    content.innerHTML = `<div class="text-center py-5"><div class="spinner-border text-primary" role="status"></div></div>`;
    modalDetalle.show();

    try {
      const n = await apiFetch(`/nomina`).then(nList => nList.find(nom => nom.id === id));
      if (!n) throw new Error('Nómina no encontrada.');

      content.innerHTML = `
        <div class="modal-header">
          <h5 class="modal-title">Nómina: <strong>${n.empleado ? n.empleado.nombre : 'N/A'}</strong></h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div class="row mb-3 border-bottom pb-2">
            <div class="col-6">
              <span class="text-secondary small">Período:</span>
              <div class="fw-bold">${n.periodo} (${n.tipoPeriodo.toUpperCase()})</div>
            </div>
            <div class="col-6 text-end">
              <span class="text-secondary small">Estado:</span>
              <div><span class="badge bg-yellow text-yellow-fg px-2 py-1">${n.estado.toUpperCase()}</span></div>
            </div>
          </div>

          <h5 class="text-success mb-2"><i class="ti ti-plus me-1"></i>Devengados</h5>
          <table class="table table-sm table-striped mb-3">
            <tbody>
              <tr><td>Salario Base Período</td><td class="text-end font-weight-medium">${formatter.format(n.salarioBase)}</td></tr>
              ${parseFloat(n.auxilioTransporte) > 0 ? `<tr><td>Auxilio de Transporte</td><td class="text-end font-weight-medium text-success">${formatter.format(n.auxilioTransporte)}</td></tr>` : ''}
              ${parseFloat(n.horasExtra) > 0 ? `<tr><td>Horas Extras</td><td class="text-end text-success">${formatter.format(n.horasExtra)}</td></tr>` : ''}
              ${parseFloat(n.recargosNocturnos) > 0 ? `<tr><td>Recargos Nocturnos</td><td class="text-end text-success">${formatter.format(n.recargosNocturnos)}</td></tr>` : ''}
              ${parseFloat(n.dominicales) > 0 ? `<tr><td>Dominicales / Festivos</td><td class="text-end text-success">${formatter.format(n.dominicales)}</td></tr>` : ''}
              ${parseFloat(n.bonos) > 0 ? `<tr><td>Bonificaciones Extra</td><td class="text-end text-success">${formatter.format(n.bonos)}</td></tr>` : ''}
              <tr class="fw-bold table-light"><td>Total Devengado</td><td class="text-end text-success">${formatter.format(n.totalDevengado)}</td></tr>
            </tbody>
          </table>

          <h5 class="text-danger mb-2"><i class="ti ti-minus me-1"></i>Deducciones</h5>
          <table class="table table-sm table-striped mb-3">
            <tbody>
              ${parseFloat(n.deduccionEPS) > 0 ? `<tr><td>Salud (EPS 4%)</td><td class="text-end text-danger">-${formatter.format(n.deduccionEPS)}</td></tr>` : ''}
              ${parseFloat(n.deduccionPension) > 0 ? `<tr><td>Pensión (AFP 4%)</td><td class="text-end text-danger">-${formatter.format(n.deduccionPension)}</td></tr>` : ''}
              ${parseFloat(n.deduccionPrestamos) > 0 ? `<tr><td>Préstamos / Libranzas</td><td class="text-end text-danger">-${formatter.format(n.deduccionPrestamos)}</td></tr>` : ''}
              <tr class="fw-bold table-light"><td>Total Deducciones</td><td class="text-end text-danger">-${formatter.format(n.totalDeducciones)}</td></tr>
            </tbody>
          </table>

          <div class="card p-3 bg-blue-lt d-flex justify-content-between flex-row align-items-center">
            <span class="h4 mb-0 font-weight-medium">Neto a Recibir:</span>
            <span class="h2 text-primary font-weight-bold mb-0">${formatter.format(n.neto)}</span>
          </div>

          <div class="mt-4 d-flex justify-content-between">
            <div>
              ${n.estado === 'borrador' ? `
                <button class="btn btn-outline-success btn-sm btn-cambio-est" data-id="${n.id}" data-estado="aprobada">Aprobar Nómina</button>
              ` : ''}
              ${n.estado === 'aprobada' ? `
                <button class="btn btn-success btn-sm btn-cambio-est" data-id="${n.id}" data-estado="pagada"><i class="ti ti-check me-1"></i>Registrar Pago</button>
              ` : ''}
            </div>
            <button class="btn btn-outline-secondary btn-sm" id="btn-modal-pdf"><i class="ti ti-file-text me-1"></i>Comprobante PDF</button>
          </div>
        </div>
      `;

      // Event listener for estado change
      const btnEst = content.querySelector('.btn-cambio-est');
      if (btnEst) {
        btnEst.addEventListener('click', async () => {
          try {
            await apiFetch(`/nomina/${n.id}/estado`, {
              method: 'PUT',
              body: JSON.stringify({ estado: btnEst.dataset.estado })
            });
            modalDetalle.hide();
            await loadInitialData();
            renderNominasTable();
          } catch (e) {
            alert('Error: ' + e.message);
          }
        });
      }

      // Comprobante PDF click
      document.getElementById('btn-modal-pdf').addEventListener('click', () => downloadDesprendible(n.id));

    } catch (err) {
      content.innerHTML = `<div class="alert alert-danger m-3">${err.message}</div>`;
    }
  }

  // Download Desprendible PDF
  async function downloadDesprendible(id) {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/nomina/${id}/desprendible-pdf`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error('No se pudo descargar el comprobante de nómina.');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `comprobante_nomina_${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      alert(e.message);
    }
  }

  // Delete Nomina
  async function deleteNomina(id) {
    const verificado = await showConfirm('Eliminar Nómina', '¿Está seguro de que desea eliminar este borrador de nómina?');
    if (!verificado) {
      return;
    }
    try {
      await apiFetch(`/nomina/${id}`, { method: 'DELETE' });
      await loadInitialData();
      renderNominasTable();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  }
}
