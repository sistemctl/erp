import { apiFetch } from '../api.js';
import { getUsuario } from '../auth.js';
import { showConfirm } from '../utils/toast.js';
import { erpHeader } from '../utils/module-shell.js';
import { erpAction, erpActions } from '../utils/action-buttons.js';

export async function initProveedores(container) {
  const usuario = getUsuario();
  const isAdminOrContador = ['admin', 'superadmin', 'contador'].includes(usuario.rol);
  let proveedores = [];

  async function loadProveedores() {
    try {
      proveedores = await apiFetch('/proveedores');
    } catch (e) {
      console.error('Error al cargar proveedores:', e);
    }
  }

  await loadProveedores();

  container.innerHTML = `
    <div class="container-xl erp-module">
      ${erpHeader({
        eyebrow: 'Proveedores',
        title: 'Directorio comercial',
        subtitle: 'Contactos y datos bancarios para compras y cuentas por pagar',
        actionsHtml: isAdminOrContador ? `
          <button id="btn-nuevo-proveedor" class="btn btn-primary">
            <i class="ti ti-plus me-2"></i> Nuevo proveedor
          </button>
        ` : ''
      })}

      <!-- Buscador -->
      <div class="card mb-4 d-print-none erp-filter-card">
        <div class="card-body">
          <div class="input-icon">
            <span class="input-icon-addon"><i class="ti ti-search"></i></span>
            <input type="text" id="prov-search-input" class="form-control form-control-lg" placeholder="Buscar proveedor por nombre, NIT o contacto…" spellcheck="false">
          </div>
        </div>
      </div>

      <!-- Tabla de Proveedores -->
      <div class="card">
        <div class="table-responsive">
          <table class="table table-vcenter card-table table-hover table-striped">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>NIT</th>
                <th>Contacto Principal</th>
                <th>Teléfono / Correo</th>
                <th>Información Bancaria</th>
                ${isAdminOrContador ? `<th class="text-end">Acciones</th>` : ''}
              </tr>
            </thead>
            <tbody id="prov-table-body">
              <!-- Carga dinámica -->
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Modal Formulario Proveedor -->
    <div class="modal modal-blur fade" id="modal-form-proveedor" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered" role="document">
        <div class="modal-content">
          <form id="form-proveedor">
            <input type="hidden" id="prov-id">
            <div class="modal-header">
              <h5 class="modal-title" id="modal-title-proveedor">Registrar Proveedor</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              <div class="mb-3">
                <label class="form-label required">Nombre Comercial / Razón Social</label>
                <input type="text" id="form-prov-nombre" class="form-control" required placeholder="Ej: Distribuidora Tecnológica SAS">
              </div>
              <div class="mb-3">
                <label class="form-label required">NIT</label>
                <input type="text" id="form-prov-nit" class="form-control" required placeholder="Ej: 900.123.456-7">
              </div>
              <div class="row">
                <div class="col-6 mb-3">
                  <label class="form-label">Nombre Contacto</label>
                  <input type="text" id="form-prov-contacto" class="form-control" placeholder="Ej: Pedro Infante">
                </div>
                <div class="col-6 mb-3">
                  <label class="form-label">Teléfono</label>
                  <input type="text" id="form-prov-telefono" class="form-control" placeholder="Ej: 3007654321">
                </div>
              </div>
              <div class="mb-3">
                <label class="form-label">Correo Electrónico</label>
                <input type="email" id="form-prov-email" class="form-control" placeholder="Ej: ventas@proveedor.com" spellcheck="false">
              </div>
              <div class="mb-3">
                <label class="form-label">Dirección</label>
                <input type="text" id="form-prov-direccion" class="form-control" placeholder="Ej: Zona Industrial, Bogotá">
              </div>
              <div class="row">
                <div class="col-6 mb-3">
                  <label class="form-label">Banco</label>
                  <input type="text" id="form-prov-banco" class="form-control" placeholder="Bancolombia">
                </div>
                <div class="col-6 mb-3">
                  <label class="form-label">Cuenta de Ahorros/Corriente</label>
                  <input type="text" id="form-prov-cuenta" class="form-control" placeholder="123-456789-01">
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-link link-secondary" data-bs-dismiss="modal">Cancelar</button>
              <button type="submit" class="btn btn-primary ms-auto">Guardar Proveedor</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  const tbody = document.getElementById('prov-table-body');
  const modalForm = new bootstrap.Modal(document.getElementById('modal-form-proveedor'));

  function renderProveedoresTable(data) {
    if (data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-secondary">No hay proveedores registrados en el sistema.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(p => `
      <tr>
        <td><strong>${p.nombre}</strong><div class="small text-secondary">${p.direccion || 'N/A'}</div></td>
        <td>${p.nit}</td>
        <td>${p.contacto || '<span class="text-secondary small">N/A</span>'}</td>
        <td>${p.telefono || ''}<div class="small text-secondary">${p.email || ''}</div></td>
        <td>
          ${p.cuentaBancaria ? `<strong>${p.banco || 'Banco'}</strong> - Ahorros: ${p.cuentaBancaria}` : '<span class="text-secondary small">Sin registrar</span>'}
        </td>
        ${isAdminOrContador ? `
          <td class="text-end erp-td-actions">
            ${erpActions(`
              ${erpAction('edit', { className: 'btn-edit-prov', attrs: { 'data-id': p.id } })}
              ${erpAction('delete', { className: 'btn-delete-prov', attrs: { 'data-id': p.id } })}
            `)}
          </td>
        ` : ''}
      </tr>
    `).join('');

    // Attach listeners
    if (isAdminOrContador) {
      document.querySelectorAll('.btn-edit-prov').forEach(btn => {
        btn.addEventListener('click', () => openEditForm(btn.dataset.id));
      });

      document.querySelectorAll('.btn-delete-prov').forEach(btn => {
        btn.addEventListener('click', () => deleteProveedor(btn.dataset.id));
      });
    }
  }

  renderProveedoresTable(proveedores);

  // Search input filter
  document.getElementById('prov-search-input').addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase().trim();
    const filtered = proveedores.filter(p => 
      p.nombre.toLowerCase().includes(val) || 
      p.nit.includes(val) || 
      (p.contacto && p.contacto.toLowerCase().includes(val))
    );
    renderProveedoresTable(filtered);
  });

  // Open Create Form
  const btnNuevo = document.getElementById('btn-nuevo-proveedor');
  if (btnNuevo) {
    btnNuevo.addEventListener('click', () => {
      document.getElementById('form-proveedor').reset();
      document.getElementById('prov-id').value = '';
      document.getElementById('modal-title-proveedor').textContent = 'Registrar Proveedor';
      modalForm.show();
    });
  }

  // Open Edit Form
  function openEditForm(id) {
    const p = proveedores.find(prov => prov.id === id);
    if (!p) return;

    document.getElementById('prov-id').value = p.id;
    document.getElementById('form-prov-nombre').value = p.nombre;
    document.getElementById('form-prov-nit').value = p.nit;
    document.getElementById('form-prov-contacto').value = p.contacto || '';
    document.getElementById('form-prov-telefono').value = p.telefono || '';
    document.getElementById('form-prov-email').value = p.email || '';
    document.getElementById('form-prov-direccion').value = p.direccion || '';
    document.getElementById('form-prov-banco').value = p.banco || '';
    document.getElementById('form-prov-cuenta').value = p.cuentaBancaria || '';
    document.getElementById('modal-title-proveedor').textContent = 'Editar Proveedor';
    modalForm.show();
  }

  // Submit Proveedor
  document.getElementById('form-proveedor').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('prov-id').value;
    const payload = {
      nombre: document.getElementById('form-prov-nombre').value,
      nit: document.getElementById('form-prov-nit').value,
      contacto: document.getElementById('form-prov-contacto').value,
      telefono: document.getElementById('form-prov-telefono').value,
      email: document.getElementById('form-prov-email').value,
      direccion: document.getElementById('form-prov-direccion').value,
      banco: document.getElementById('form-prov-banco').value,
      cuentaBancaria: document.getElementById('form-prov-cuenta').value
    };

    try {
      if (id) {
        await apiFetch(`/proveedores/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await apiFetch('/proveedores', { method: 'POST', body: JSON.stringify(payload) });
      }
      modalForm.hide();
      await loadProveedores();
      renderProveedoresTable(proveedores);
    } catch (err) {
      alert('Error al guardar proveedor: ' + err.message);
    }
  });

  async function deleteProveedor(id) {
    const verificado = await showConfirm('Eliminar Proveedor', '¿Está seguro de que desea eliminar a este proveedor? Esta acción no se puede deshacer.');
    if (!verificado) {
      return;
    }
    try {
      await apiFetch(`/proveedores/${id}`, { method: 'DELETE' });
      await loadProveedores();
      renderProveedoresTable(proveedores);
    } catch (err) {
      alert('Error al eliminar proveedor: ' + err.message);
    }
  }
}
