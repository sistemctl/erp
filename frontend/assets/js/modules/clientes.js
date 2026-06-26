import { apiFetch } from '../api.js';
import { getUsuario } from '../auth.js';

export async function initClientes(container) {
  const usuario = getUsuario();
  const isAdminOrGerente = ['admin', 'superadmin', 'gerente_sede'].includes(usuario.rol);
  let clientes = [];

  async function loadClientes() {
    try {
      clientes = await apiFetch('/clientes');
    } catch (e) {
      console.error('Error al cargar clientes:', e);
    }
  }

  await loadClientes();

  container.innerHTML = `
    <div class="container-xl">
      <div class="page-header d-print-none mb-4">
        <div class="row align-items-center">
          <div class="col">
            <h2 class="page-title">CRM de Clientes</h2>
            <div class="text-secondary mt-1">Directorio unificado, historial de compras, reparaciones y control de deudas</div>
          </div>
          <div class="col-auto ms-auto">
            <button id="btn-crear-cliente" class="btn btn-primary">
              <i class="ti ti-plus me-2"></i> Crear Cliente
            </button>
          </div>
        </div>
      </div>

      <!-- Buscador -->
      <div class="card mb-4 d-print-none">
        <div class="card-body">
          <div class="input-icon">
            <span class="input-icon-addon"><i class="ti ti-search"></i></span>
            <input type="text" id="crm-search-input" class="form-control form-control-lg" placeholder="Buscar cliente por nombre, documento o teléfono...">
          </div>
        </div>
      </div>

      <!-- Tabla de Clientes -->
      <div class="card">
        <div class="table-responsive">
          <table class="table table-vcenter card-table table-hover table-striped">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Cédula / NIT</th>
                <th>Teléfono</th>
                <th>Correo Electrónico</th>
                <th>Dirección</th>
                <th class="text-end">Acciones</th>
              </tr>
            </thead>
            <tbody id="crm-table-body">
              <!-- Carga dinámica -->
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Modal Formulario Cliente -->
    <div class="modal modal-blur fade" id="modal-form-cliente" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered" role="document">
        <div class="modal-content">
          <form id="form-cliente">
            <input type="hidden" id="cli-id">
            <div class="modal-header">
              <h5 class="modal-title" id="modal-title-cliente">Registrar Cliente</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              <div class="mb-3">
                <label class="form-label required">Nombre Completo</label>
                <input type="text" id="form-cli-nombre" class="form-control" required placeholder="Ej: Carlos Mario Restrepo">
              </div>
              <div class="mb-3">
                <label class="form-label">Cédula o NIT</label>
                <input type="text" id="form-cli-documento" class="form-control" placeholder="Ej: 1017123456">
              </div>
              <div class="mb-3">
                <label class="form-label">Teléfono</label>
                <input type="text" id="form-cli-telefono" class="form-control" placeholder="Ej: 3001234567">
              </div>
              <div class="mb-3">
                <label class="form-label">Correo Electrónico</label>
                <input type="email" id="form-cli-email" class="form-control" placeholder="Ej: carlos@gmail.com">
              </div>
              <div class="mb-3">
                <label class="form-label">Dirección</label>
                <input type="text" id="form-cli-direccion" class="form-control" placeholder="Ej: Calle 45 #12-34">
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-link link-secondary" data-bs-dismiss="modal">Cancelar</button>
              <button type="submit" class="btn btn-primary ms-auto">Guardar Cliente</button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- Modal Ficha de Cliente (Detalle CRM) -->
    <div class="modal modal-blur fade" id="modal-ficha-cliente" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-xl modal-dialog-centered" role="document">
        <div class="modal-content" id="ficha-cliente-content">
          <!-- Carga dinámica -->
        </div>
      </div>
    </div>
  `;

  const tbody = document.getElementById('crm-table-body');
  const modalForm = new bootstrap.Modal(document.getElementById('modal-form-cliente'));
  const modalFicha = new bootstrap.Modal(document.getElementById('modal-ficha-cliente'));

  function renderClientesTable(data) {
    if (data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-secondary">No hay clientes registrados en el sistema.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(c => `
      <tr>
        <td>
          <div class="font-weight-medium text-dark">${c.nombre}</div>
        </td>
        <td>${c.documento || '<span class="text-secondary small">No registrado</span>'}</td>
        <td>${c.telefono || '<span class="text-secondary small">No registrado</span>'}</td>
        <td>${c.email || '<span class="text-secondary small">No registrado</span>'}</td>
        <td class="small text-secondary">${c.direccion || 'N/A'}</td>
        <td class="text-end">
          <button class="btn btn-outline-primary btn-icon btn-sm btn-ficha-cli" data-id="${c.id}" title="Ficha del Cliente">
            <i class="ti ti-user-check"></i>
          </button>
          <button class="btn btn-outline-secondary btn-icon btn-sm btn-edit-cli" data-id="${c.id}" title="Editar">
            <i class="ti ti-edit"></i>
          </button>
        </td>
      </tr>
    `).join('');

    // Listeners
    document.querySelectorAll('.btn-ficha-cli').forEach(btn => {
      btn.addEventListener('click', () => openFicha(btn.dataset.id));
    });

    document.querySelectorAll('.btn-edit-cli').forEach(btn => {
      btn.addEventListener('click', () => openEditForm(btn.dataset.id));
    });
  }

  renderClientesTable(clientes);

  // Search input filter
  document.getElementById('crm-search-input').addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase().trim();
    const filtered = clientes.filter(c => 
      c.nombre.toLowerCase().includes(val) || 
      (c.documento && c.documento.includes(val)) || 
      (c.telefono && c.telefono.includes(val))
    );
    renderClientesTable(filtered);
  });

  // Open Create Form
  document.getElementById('btn-crear-cliente').addEventListener('click', () => {
    document.getElementById('form-cliente').reset();
    document.getElementById('cli-id').value = '';
    document.getElementById('modal-title-cliente').textContent = 'Registrar Cliente';
    modalForm.show();
  });

  // Open Edit Form
  function openEditForm(id) {
    const c = clientes.find(cli => cli.id === id);
    if (!c) return;

    document.getElementById('cli-id').value = c.id;
    document.getElementById('form-cli-nombre').value = c.nombre;
    document.getElementById('form-cli-documento').value = c.documento || '';
    document.getElementById('form-cli-telefono').value = c.telefono || '';
    document.getElementById('form-cli-email').value = c.email || '';
    document.getElementById('form-cli-direccion').value = c.direccion || '';
    document.getElementById('modal-title-cliente').textContent = 'Editar Cliente';
    modalForm.show();
  }

  // Submit Client Form
  document.getElementById('form-cliente').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('cli-id').value;
    const payload = {
      nombre: document.getElementById('form-cli-nombre').value,
      documento: document.getElementById('form-cli-documento').value,
      telefono: document.getElementById('form-cli-telefono').value,
      email: document.getElementById('form-cli-email').value,
      direccion: document.getElementById('form-cli-direccion').value
    };

    try {
      if (id) {
        await apiFetch(`/clientes/${id}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      } else {
        await apiFetch('/clientes', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }
      modalForm.hide();
      await loadClientes();
      renderClientesTable(clientes);
    } catch (err) {
      alert('Error al guardar cliente: ' + err.message);
    }
  });

  // Open CRM Unified Ficha (Detail Modal)
  async function openFicha(id) {
    const content = document.getElementById('ficha-cliente-content');
    content.innerHTML = `<div class="text-center py-5"><div class="spinner-border text-primary" role="status"></div></div>`;
    modalFicha.show();

    try {
      const c = await apiFetch(`/clientes/${id}`);
      
      // Load History in Parallel
      const compras = await apiFetch(`/ventas?cliente=${id}`).catch(() => []);
      const reparaciones = await apiFetch(`/reparaciones?cliente=${id}`).catch(() => []);
      const facturas = await apiFetch(`/facturas?cliente=${id}`).catch(() => []);

      const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

      // Calcular deuda pendiente (Facturas pendientes o abonos parciales)
      const facturasMora = facturas.filter(f => ['pendiente', 'abono_parcial', 'vencida'].includes(f.estado));
      const totalDeuda = facturasMora.reduce((acc, curr) => acc + parseFloat(curr.total), 0);

      // Compras List HTML
      const comprasHtml = compras.length > 0 ? compras.map(com => `
        <tr>
          <td><span class="badge bg-blue text-white">${com.numeroVenta}</span></td>
          <td>${new Date(com.createdAt).toLocaleDateString()}</td>
          <td class="text-end fw-bold">${formatter.format(com.total)}</td>
          <td>${com.pagos.map(p => p.metodo.toUpperCase()).join('/')}</td>
        </tr>
      `).join('') : '<tr><td colspan="4" class="text-center py-3 text-secondary">Este cliente no ha realizado compras de catálogo.</td></tr>';

      // Reparaciones List HTML
      const reparacionesHtml = reparaciones.length > 0 ? reparaciones.map(rep => {
        let badgeClass = 'bg-blue-lt';
        if (rep.estado === 'entregado') badgeClass = 'bg-success-lt';
        else if (rep.estado === 'listo') badgeClass = 'bg-green-lt';
        else if (rep.estado === 'cancelado') badgeClass = 'bg-danger-lt';

        return `
          <tr>
            <td><span class="badge bg-purple text-white">${rep.numeroOrden}</span></td>
            <td>${new Date(rep.createdAt).toLocaleDateString()}</td>
            <td>${rep.tipoEquipo} ${rep.marca} ${rep.modelo}</td>
            <td><span class="badge ${badgeClass}">${rep.estado.toUpperCase()}</span></td>
            <td class="text-end fw-bold">${formatter.format(rep.totalCobrado)}</td>
          </tr>
        `;
      }).join('') : '<tr><td colspan="5" class="text-center py-3 text-secondary">Este cliente no registra órdenes de taller.</td></tr>';

      content.innerHTML = `
        <div class="modal-header">
          <h5 class="modal-title"><i class="ti ti-user-check me-1"></i>Ficha del Cliente CRM: <strong>${c.nombre}</strong></h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div class="row mb-4">
            <!-- Columna Datos del Cliente -->
            <div class="col-md-7 border-end">
              <h4 class="text-primary mb-3">Información de Contacto</h4>
              <table class="table table-sm table-striped">
                <tbody>
                  <tr><th style="width: 140px;">Cédula / NIT</th><td>${c.documento || 'No registrado'}</td></tr>
                  <tr><th>Teléfono</th><td>${c.telefono || 'No registrado'}</td></tr>
                  <tr><th>Correo Electrónico</th><td>${c.email || 'No registrado'}</td></tr>
                  <tr><th>Dirección</th><td>${c.direccion || 'No registrada'}</td></tr>
                  <tr><th>Fecha Registro</th><td>${new Date(c.createdAt).toLocaleDateString()}</td></tr>
                </tbody>
              </table>
            </div>
            <!-- Columna Deuda / Finanzas -->
            <div class="col-md-5">
              <h4 class="text-primary mb-3">Estado de Cuenta</h4>
              <div class="card p-3 ${totalDeuda > 0 ? 'bg-danger-lt' : 'bg-success-lt'}">
                <span class="text-secondary small">Deuda Total Pendiente:</span>
                <div class="h1 fw-bold ${totalDeuda > 0 ? 'text-danger' : 'text-success'} mb-0">${formatter.format(totalDeuda)}</div>
                ${totalDeuda > 0 ? `<span class="small text-danger mt-1">Registra ${facturasMora.length} factura(s) pendiente(s) de pago.</span>` : '<span class="small text-success mt-1">Al día con sus cuentas.</span>'}
              </div>
            </div>
          </div>

          <!-- Pestañas de Historial -->
          <div class="card mt-4">
            <div class="card-header">
              <ul class="nav nav-tabs card-header-tabs" data-bs-toggle="tabs" role="tablist">
                <li class="nav-item" role="presentation">
                  <a href="#tab-cli-compras" class="nav-link active" data-bs-toggle="tab" aria-selected="true" role="tab">
                    <i class="ti ti-shopping-cart me-1"></i> Historial de Compras
                  </a>
                </li>
                <li class="nav-item" role="presentation">
                  <a href="#tab-cli-reparaciones" class="nav-link" data-bs-toggle="tab" aria-selected="false" role="tab" tabindex="-1">
                    <i class="ti ti-tool me-1"></i> Historial de Taller
                  </a>
                </li>
              </ul>
            </div>
            <div class="card-body">
              <div class="tab-content">
                <!-- Compras -->
                <div class="tab-pane active show" id="tab-cli-compras" role="tabpanel">
                  <table class="table table-sm table-vcenter">
                    <thead>
                      <tr>
                        <th>No. Venta</th>
                        <th>Fecha</th>
                        <th class="text-end">Total</th>
                        <th>Pago</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${comprasHtml}
                    </tbody>
                  </table>
                </div>

                <!-- Reparaciones -->
                <div class="tab-pane" id="tab-cli-reparaciones" role="tabpanel">
                  <table class="table table-sm table-vcenter">
                    <thead>
                      <tr>
                        <th>No. Orden</th>
                        <th>Fecha</th>
                        <th>Dispositivo</th>
                        <th>Estado</th>
                        <th class="text-end">Costo Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${reparacionesHtml}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" data-bs-dismiss="modal">Cerrar Ficha</button>
        </div>
      `;

    } catch (err) {
      content.innerHTML = `<div class="alert alert-danger m-3">${err.message}</div>`;
    }
  }
}
