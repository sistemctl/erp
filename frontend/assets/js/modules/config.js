import { apiFetch } from '../api.js';
import { getUsuario } from '../auth.js';
import { showConfirm } from '../utils/toast.js';

export async function initConfig(container) {
  const usuario = getUsuario();
  
  container.innerHTML = `
    <div class="container-xl">
      <!-- Encabezado -->
      <div class="page-header d-print-none mb-4 animate__animated animate__fadeIn">
        <div class="row align-items-center">
          <div class="col">
            <h2 class="page-title text-primary"><i class="ti ti-settings me-2"></i>Configuración del Sistema</h2>
            <div class="text-secondary mt-1">Gestión corporativa, control de accesos por roles, límites de seguridad de caja, respaldos y pasarela de mensajería</div>
          </div>
        </div>
      </div>

      <!-- Cuerpo con Pestañas -->
      <div class="card shadow-sm border-0 animate__animated animate__fadeInUp">
        <div class="card-header bg-transparent border-bottom">
          <ul class="nav nav-tabs card-header-tabs" data-bs-toggle="tabs" role="tablist">
            <li class="nav-item" role="presentation">
              <a href="#tab-config-general" class="nav-link active" data-bs-toggle="tab" role="tab"><i class="ti ti-building me-1"></i> Empresa y Límites</a>
            </li>
            <li class="nav-item" role="presentation">
              <a href="#tab-config-sedes" class="nav-link" data-bs-toggle="tab" role="tab"><i class="ti ti-map-pin me-1"></i> Sedes</a>
            </li>
            <li class="nav-item" role="presentation">
              <a href="#tab-config-usuarios" class="nav-link" data-bs-toggle="tab" role="tab"><i class="ti ti-users me-1"></i> Usuarios y Accesos</a>
            </li>
            <li class="nav-item" role="presentation">
              <a href="#tab-config-twilio" class="nav-link" data-bs-toggle="tab" role="tab"><i class="ti ti-brand-twilio me-1"></i> Twilio y Plantillas</a>
            </li>
            <li class="nav-item" role="presentation">
              <a href="#tab-config-log" class="nav-link" data-bs-toggle="tab" role="tab"><i class="ti ti-mail-opened me-1"></i> Historial Envíos</a>
            </li>
            <li class="nav-item" role="presentation">
              <a href="#tab-config-backup" class="nav-link" data-bs-toggle="tab" role="tab"><i class="ti ti-database me-1"></i> Copia de Seguridad</a>
            </li>
          </ul>
        </div>
        <div class="card-body">
          <div class="tab-content">
            
            <!-- TAB 1: GENERAL Y LÍMITES -->
            <div class="tab-pane active show" id="tab-config-general" role="tabpanel">
              <form id="form-config-general" class="row g-3">
                <h4 class="text-secondary border-bottom pb-2 mb-2"><i class="ti ti-building me-1"></i> Datos de la Empresa</h4>
                <div class="col-md-6">
                  <label class="form-label fw-bold">Nombre de la Empresa</label>
                  <input type="text" id="cfg-empresa" class="form-control" required>
                </div>
                <div class="col-md-6">
                  <label class="form-label fw-bold">NIT / CC</label>
                  <input type="text" id="cfg-nit" class="form-control">
                </div>
                <div class="col-md-6">
                  <label class="form-label fw-bold">Dirección Principal</label>
                  <input type="text" id="cfg-direccion" class="form-control">
                </div>
                <div class="col-md-6">
                  <label class="form-label fw-bold">Teléfono Corporativo</label>
                  <input type="text" id="cfg-telefono" class="form-control">
                </div>
                <div class="col-md-12">
                  <label class="form-label fw-bold">URL del Logo de la Empresa</label>
                  <input type="url" id="cfg-logourl" class="form-control" placeholder="https://ejemplo.com/logo.png">
                  <small class="text-secondary">Si se proporciona una URL, se mostrará esta imagen en la barra lateral en lugar del texto del logo.</small>
                </div>
                
                <h4 class="text-secondary border-bottom pb-2 mt-4 mb-2"><i class="ti ti-shield-alert me-1"></i> Políticas Financieras e Impuestos</h4>
                <div class="col-md-4">
                  <label class="form-label fw-bold">Tarifa de IVA General (%)</label>
                  <input type="number" id="cfg-iva" class="form-control" min="0" max="100" step="0.1" required>
                </div>
                <div class="col-md-4">
                  <label class="form-label fw-bold">Descuento Máximo sin PIN (%)</label>
                  <input type="number" id="cfg-descuento-max" class="form-control" min="0" max="100" step="0.1" required>
                </div>
                <div class="col-md-4">
                  <label class="form-label fw-bold">Límite de Egreso sin PIN (COP)</label>
                  <input type="number" id="cfg-egreso-max" class="form-control" min="0" step="100" required>
                </div>
                <div class="col-md-12 mt-3">
                  <label class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="cfg-cobrar-iva">
                    <span class="form-check-label fw-bold">Cobrar e incluir IVA en el Punto de Venta (POS)</span>
                  </label>
                  <small class="text-secondary d-block mt-1">Si se desactiva, el POS no sumará ningún impuesto adicional sobre el precio de venta del producto (se asume que el precio de venta ya incluye el IVA o que la venta no aplica IVA).</small>
                </div>
                
                <div class="col-12 mt-4">
                  <button type="submit" class="btn btn-primary"><i class="ti ti-device-floppy me-1"></i> Guardar Configuración General</button>
                </div>
              </form>
            </div>

            <!-- TAB 2: SEDES (CRUD) -->
            <div class="tab-pane" id="tab-config-sedes" role="tabpanel">
              <div class="d-flex justify-content-between align-items-center mb-3">
                <h4 class="text-secondary mb-0"><i class="ti ti-map-pin me-1"></i> Sedes Registradas</h4>
                <button class="btn btn-primary btn-sm" id="btn-add-sede"><i class="ti ti-plus me-1"></i> Nueva Sede</button>
              </div>
              <div class="table-responsive">
                <table class="table table-vcenter card-table table-hover">
                  <thead>
                    <tr>
                      <th>Nombre Sede</th>
                      <th>Dirección</th>
                      <th>Teléfono</th>
                      <th>Estado</th>
                      <th class="text-end">Acciones</th>
                    </tr>
                  </thead>
                  <tbody id="sedes-tbody">
                     <tr><td colspan="5" class="text-center py-3">Cargando sedes…</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- TAB 3: USUARIOS Y ACCESOS (CRUD) -->
            <div class="tab-pane" id="tab-config-usuarios" role="tabpanel">
              <div class="d-flex justify-content-between align-items-center mb-3">
                <h4 class="text-secondary mb-0"><i class="ti ti-users me-1"></i> Usuarios y Permisos</h4>
                <button class="btn btn-primary btn-sm" id="btn-add-usuario"><i class="ti ti-user-plus me-1"></i> Nuevo Usuario</button>
              </div>
              <div class="table-responsive">
                <table class="table table-vcenter card-table table-hover">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Usuario</th>
                      <th>Rol</th>
                      <th>Sede Asignada</th>
                      <th>Estado</th>
                      <th class="text-end">Acciones</th>
                    </tr>
                  </thead>
                  <tbody id="usuarios-tbody">
                     <tr><td colspan="6" class="text-center py-3">Cargando usuarios…</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- TAB 4: TWILIO Y PLANTILLAS -->
            <div class="tab-pane" id="tab-config-twilio" role="tabpanel">
              <form id="form-config-twilio">
                <div class="mb-3">
                  <label class="form-check form-switch mt-2">
                    <input class="form-check-input" type="checkbox" id="cfg-notif-activas">
                    <span class="form-check-label fw-bold text-primary">Activar Envío de Notificaciones</span>
                  </label>
                </div>

                <div class="row g-3 mb-4">
                  <div class="col-md-6">
                    <label class="form-check">
                      <input class="form-check-input" type="checkbox" id="cfg-sms-activo">
                      <span class="form-check-label fw-bold">Habilitar Canal SMS</span>
                    </label>
                  </div>
                  <div class="col-md-6">
                    <label class="form-check">
                      <input class="form-check-input" type="checkbox" id="cfg-wa-activo">
                      <span class="form-check-label fw-bold">Habilitar Canal WhatsApp</span>
                    </label>
                  </div>
                </div>

                <h4 class="text-secondary border-bottom pb-2"><i class="ti ti-key me-1"></i> Credenciales de Twilio API</h4>
                <div class="row g-3 mb-4">
                  <div class="col-md-6">
                    <label class="form-label">Twilio Account SID</label>
                    <input type="text" id="cfg-twilio-sid" class="form-control" placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxx" spellcheck="false">
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">Twilio Auth Token</label>
                    <input type="password" id="cfg-twilio-token" class="form-control" placeholder="••••••••••••••••••••••••••••" spellcheck="false">
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">Número Remitente (Twilio Sender Number / whatsapp:+1…)</label>
                    <input type="text" id="cfg-twilio-from" class="form-control" placeholder="Ej: +14155238886" spellcheck="false">
                  </div>
                </div>

                <h4 class="text-secondary border-bottom pb-2"><i class="ti ti-template me-1"></i> Plantillas de Mensajes por Estado</h4>
                <div class="alert alert-info py-2 small">
                  Variables dinámicas: <code>{cliente}</code> (nombre cliente), <code>{equipo}</code> (dispositivo), <code>{sede}</code> (sede física), <code>{orden}</code> (número orden), <code>{total}</code> (monto cobrado).
                </div>

                <div class="mb-3">
                  <label class="form-label">Mensaje: <strong>Recibido / Ingreso a Taller</strong></label>
                  <textarea id="cfg-tpl-recibido" class="form-control" rows="2" placeholder="Plantilla al registrar el equipo…"></textarea>
                </div>

                <div class="mb-3">
                  <label class="form-label">Mensaje: <strong>Listo para Retiro</strong></label>
                  <textarea id="cfg-tpl-listo" class="form-control" rows="2" placeholder="Plantilla al finalizar la reparación…"></textarea>
                </div>

                <div class="mb-3">
                  <label class="form-label">Mensaje: <strong>Entregado a Cliente</strong></label>
                  <textarea id="cfg-tpl-entregado" class="form-control" rows="2" placeholder="Plantilla al entregar y facturar…"></textarea>
                </div>

                <button type="submit" class="btn btn-primary"><i class="ti ti-device-floppy me-1"></i> Guardar Plantillas y Pasarela</button>
              </form>
            </div>

            <!-- TAB 5: HISTORIAL ENVÍOS (NOTIFICACIONES) -->
            <div class="tab-pane" id="tab-config-log" role="tabpanel">
              <div class="table-responsive">
                <table class="table table-vcenter card-table table-hover">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Orden</th>
                      <th>Cliente</th>
                      <th>Mensaje</th>
                      <th>Canal</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody id="notif-log-tbody">
                     <tr><td colspan="6" class="text-center py-4">Cargando bitácora de envíos…</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- TAB 6: COPIA DE SEGURIDAD (BACKUP & RESTORE) -->
            <div class="tab-pane" id="tab-config-backup" role="tabpanel">
              <div class="row g-4">
                <div class="col-md-6">
                  <div class="card bg-light border-0 p-4">
                    <h3 class="fw-bold mb-2 text-primary"><i class="ti ti-download me-1"></i> Exportar Respaldo</h3>
                    <p class="text-secondary small mb-3">Genera y descarga una copia completa del ERP en formato JSON. Incluye inventarios, ventas, historial de reparaciones, clientes y nóminas.</p>
                    <a href="/api/config/backup" id="btn-download-backup" class="btn btn-primary w-100" target="_blank">
                      <i class="ti ti-cloud-download me-1"></i> Descargar Respaldo JSON
                    </a>
                  </div>
                </div>
                <div class="col-md-6">
                  <div class="card bg-light border-0 p-4">
                    <h3 class="fw-bold mb-2 text-danger"><i class="ti ti-upload me-1"></i> Restaurar Respaldo</h3>
                    <p class="text-secondary small mb-3">Sube un archivo de copia de seguridad previamente descargado. <strong class="text-danger">Esta acción truncará todas las tablas e importará los datos del archivo.</strong></p>
                    
                    <form id="form-restore-db">
                      <div class="mb-3">
                        <input type="file" id="restore-file" class="form-control" accept=".json" required>
                      </div>
                      <button type="submit" class="btn btn-danger w-100">
                        <i class="ti ti-refresh-alert me-1"></i> Subir y Restaurar Base de Datos
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>

    <!-- MODAL SEDE (Crear / Editar) -->
    <div class="modal modal-blur fade" id="modal-sede" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered" role="document">
        <form id="form-sede" class="modal-content shadow-lg">
          <div class="modal-header">
            <h5 class="modal-title fw-bold" id="modal-sede-title">Nueva Sede</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="sede-id">
            <div class="mb-3">
              <label class="form-label fw-bold">Nombre de la Sede</label>
              <input type="text" id="sede-nombre" class="form-control" required placeholder="Ej: Sede Centro">
            </div>
            <div class="mb-3">
              <label class="form-label fw-bold">Dirección</label>
              <input type="text" id="sede-direccion" class="form-control" placeholder="Ej: Carrera 10 #15-20">
            </div>
            <div class="mb-3">
              <label class="form-label fw-bold">Teléfono</label>
              <input type="text" id="sede-telefono" class="form-control" placeholder="Ej: 3001234567">
            </div>
            <div class="mb-3">
              <label class="form-check form-switch mt-2">
                <input class="form-check-input" type="checkbox" id="sede-activa" checked>
                <span class="form-check-label fw-bold">Sede Activa</span>
              </label>
            </div>
          </div>
          <div class="modal-footer bg-light">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="submit" class="btn btn-primary"><i class="ti ti-device-floppy me-1"></i> Guardar Sede</button>
          </div>
        </form>
      </div>
    </div>

    <!-- MODAL USUARIO (Crear / Editar) -->
    <div class="modal modal-blur fade" id="modal-usuario" tabindex="-1" role="dialog" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered" role="document">
        <form id="form-usuario" class="modal-content shadow-lg">
          <div class="modal-header">
            <h5 class="modal-title fw-bold" id="modal-usuario-title">Nuevo Usuario</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="usr-id">
            <div class="mb-3">
              <label class="form-label fw-bold">Nombre Completo</label>
              <input type="text" id="usr-nombre" class="form-control" required placeholder="Ej: Juan Pérez">
            </div>
            <div class="mb-3">
              <label class="form-label fw-bold">Nombre de Usuario</label>
               <input type="text" id="usr-email" class="form-control" required placeholder="Ej: juanperez" spellcheck="false">
            </div>
            <div class="mb-3">
              <label class="form-label fw-bold" id="lbl-usr-password">Contraseña</label>
              <input type="password" id="usr-password" class="form-control" placeholder="••••••••">
              <small class="text-secondary" id="help-usr-password" style="display:none;">Dejar en blanco para mantener la contraseña actual.</small>
            </div>
            <div class="mb-3">
              <label class="form-label fw-bold">Rol / Perfil</label>
              <select id="usr-rol" class="form-select" required>
                <option value="cajero">Cajero / Vendedor</option>
                <option value="tecnico">Técnico de Taller</option>
                <option value="gerente_sede">Gerente de Sede</option>
                <option value="contador">Contador</option>
                <option value="admin">Administrador General</option>
                <option value="superadmin">Superadministrador</option>
              </select>
            </div>
            <div class="mb-3">
              <label class="form-label fw-bold">Sede Física Asignada</label>
              <select id="usr-sede" class="form-select">
                <option value="">Sede Global / N/A</option>
              </select>
            </div>
            <div class="mb-3">
              <label class="form-check form-switch mt-2">
                <input class="form-check-input" type="checkbox" id="usr-activo" checked>
                <span class="form-check-label fw-bold">Usuario Activo</span>
              </label>
            </div>
          </div>
          <div class="modal-footer bg-light">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="submit" class="btn btn-primary"><i class="ti ti-device-floppy me-1"></i> Guardar Usuario</button>
          </div>
        </form>
      </div>
    </div>
  `;

  // --- VARIABLES ---
  let sedesList = [];
  const modalSedeEl = document.getElementById('modal-sede');
  const bootstrapModalSede = new bootstrap.Modal(modalSedeEl);
  const modalUsuarioEl = document.getElementById('modal-usuario');
  const bootstrapModalUsuario = new bootstrap.Modal(modalUsuarioEl);

  // --- MÉTODOS GENERALES ---
  const loadConfig = async () => {
    try {
      const data = await apiFetch('/config/sistema');
      
      // General
      document.getElementById('cfg-empresa').value = data.empresa || '';
      document.getElementById('cfg-nit').value = data.nit || '';
      document.getElementById('cfg-direccion').value = data.direccion || '';
      document.getElementById('cfg-telefono').value = data.telefono || '';
      document.getElementById('cfg-logourl').value = data.logoUrl || '';
      document.getElementById('cfg-iva').value = data.ivaDefecto || 19.00;
      document.getElementById('cfg-descuento-max').value = data.descuentoMaximoPct || 15.00;
      document.getElementById('cfg-egreso-max').value = data.egresoMaximoSinPin || 50000;
      document.getElementById('cfg-cobrar-iva').checked = !!data.cobrarIvaPos;

      // Twilio
      document.getElementById('cfg-notif-activas').checked = !!data.notificacionesActivas;
      document.getElementById('cfg-sms-activo').checked = !!data.smsActivo;
      document.getElementById('cfg-wa-activo').checked = !!data.whatsappActivo;
      document.getElementById('cfg-twilio-sid').value = data.twilioAccountSid || '';
      document.getElementById('cfg-twilio-token').value = data.twilioAuthToken || '';
      document.getElementById('cfg-twilio-from').value = data.twilioFromNumber || '';

      // Templates
      document.getElementById('cfg-tpl-recibido').value = data.templateRecibido || '';
      document.getElementById('cfg-tpl-listo').value = data.templateListo || '';
      document.getElementById('cfg-tpl-entregado').value = data.templateEntregado || '';

    } catch (e) {
      console.error("Error al cargar configuraciones:", e);
    }
  };

  // --- CONTROL DE SEDES ---
  const loadSedes = async () => {
    const tbody = document.getElementById('sedes-tbody');
    if (!tbody) return;

    try {
      const sedes = await apiFetch('/config/sedes');
      sedesList = sedes;
      
      // Llenar select de sedes en modal de usuarios
      const usrSedeSelect = document.getElementById('usr-sede');
      usrSedeSelect.innerHTML = `<option value="">Sede Global / N/A</option>` + 
        sedes.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');

      if (sedes.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-3 text-secondary">No hay sedes creadas.</td></tr>`;
        return;
      }

      tbody.innerHTML = sedes.map((s, index) => `
        <tr>
          <td><strong class="text-primary">${s.nombre}</strong></td>
          <td>${s.direccion || 'N/A'}</td>
          <td>${s.telefono || 'N/A'}</td>
          <td>
            <span class="badge ${s.activa ? 'bg-success' : 'bg-secondary'} text-white">
              ${s.activa ? 'Activa' : 'Inactiva'}
            </span>
          </td>
          <td class="text-end">
            <button class="btn btn-sm btn-light btn-edit-sede" data-index="${index}">
              <i class="ti ti-edit text-primary me-1"></i> Editar
            </button>
            <button class="btn btn-sm btn-light btn-delete-sede text-danger" data-id="${s.id}">
              <i class="ti ti-trash me-1"></i> Borrar
            </button>
          </td>
        </tr>
      `).join('');

      // Escuchas
      document.querySelectorAll('.btn-edit-sede').forEach(btn => {
        btn.addEventListener('click', () => {
          const index = btn.getAttribute('data-index');
          openSedeModal(sedesList[index]);
        });
      });

      document.querySelectorAll('.btn-delete-sede').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const verificado = await showConfirm('Eliminar Sede', '¿Estás seguro de eliminar esta sede? Esto podría afectar a los usuarios y ventas asociadas.');
          if (verificado) {
            try {
              await apiFetch(`/config/sedes/${id}`, { method: 'DELETE' });
              alert('Sede eliminada.');
              loadSedes();
            } catch (err) {
              alert(err.message);
            }
          }
        });
      });

    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-3 text-danger">Error: ${e.message}</td></tr>`;
    }
  };

  const openSedeModal = (sede = null) => {
    if (sede) {
      document.getElementById('modal-sede-title').textContent = 'Editar Sede';
      document.getElementById('sede-id').value = sede.id;
      document.getElementById('sede-nombre').value = sede.nombre;
      document.getElementById('sede-direccion').value = sede.direccion || '';
      document.getElementById('sede-telefono').value = sede.telefono || '';
      document.getElementById('sede-activa').checked = !!sede.activa;
    } else {
      document.getElementById('modal-sede-title').textContent = 'Nueva Sede';
      document.getElementById('sede-id').value = '';
      document.getElementById('sede-nombre').value = '';
      document.getElementById('sede-direccion').value = '';
      document.getElementById('sede-telefono').value = '';
      document.getElementById('sede-activa').checked = true;
    }
    bootstrapModalSede.show();
  };

  // --- CONTROL DE USUARIOS ---
  const loadUsuarios = async () => {
    const tbody = document.getElementById('usuarios-tbody');
    if (!tbody) return;

    try {
      const usuarios = await apiFetch('/config/usuarios');
      if (usuarios.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-3 text-secondary">No hay usuarios registrados.</td></tr>`;
        return;
      }

      tbody.innerHTML = usuarios.map((u) => `
        <tr>
          <td><strong class="text-dark">${u.nombre}</strong></td>
          <td><code>${u.email}</code></td>
          <td><span class="badge bg-blue-lt text-uppercase">${u.rol}</span></td>
          <td><span class="fw-bold">${u.sede ? u.sede.nombre : 'Sede Global / N/A'}</span></td>
          <td>
            <span class="badge ${u.activo ? 'bg-success' : 'bg-secondary'} text-white">
              ${u.activo ? 'Activo' : 'Suspendido'}
            </span>
          </td>
          <td class="text-end">
            <button class="btn btn-sm btn-light btn-edit-usuario" data-id="${u.id}" data-nombre="${u.nombre}" data-email="${u.email}" data-rol="${u.rol}" data-sede="${u.sedeId || ''}" data-activo="${u.activo}">
              <i class="ti ti-edit text-primary me-1"></i> Editar
            </button>
            <button class="btn btn-sm btn-light btn-delete-usuario text-danger" data-id="${u.id}">
              <i class="ti ti-trash me-1"></i> Borrar
            </button>
          </td>
        </tr>
      `).join('');

      // Escuchas
      document.querySelectorAll('.btn-edit-usuario').forEach(btn => {
        btn.addEventListener('click', () => {
          const user = {
            id: btn.getAttribute('data-id'),
            nombre: btn.getAttribute('data-nombre'),
            email: btn.getAttribute('data-email'),
            rol: btn.getAttribute('data-rol'),
            sedeId: btn.getAttribute('data-sede'),
            activo: btn.getAttribute('data-activo') === 'true'
          };
          openUsuarioModal(user);
        });
      });

      document.querySelectorAll('.btn-delete-usuario').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const verificado = await showConfirm('Eliminar Usuario', '¿Estás seguro de eliminar permanentemente este usuario?');
          if (verificado) {
            try {
              await apiFetch(`/config/usuarios/${id}`, { method: 'DELETE' });
              alert('Usuario eliminado.');
              loadUsuarios();
            } catch (err) {
              alert(err.message);
            }
          }
        });
      });

    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-3 text-danger">Error: ${e.message}</td></tr>`;
    }
  };

  const openUsuarioModal = (user = null) => {
    const passInput = document.getElementById('usr-password');
    const helpPass = document.getElementById('help-usr-password');
    
    if (user) {
      document.getElementById('modal-usuario-title').textContent = 'Editar Usuario';
      document.getElementById('usr-id').value = user.id;
      document.getElementById('usr-nombre').value = user.nombre;
      document.getElementById('usr-email').value = user.email;
      passInput.value = '';
      passInput.required = false;
      helpPass.style.display = 'block';
      document.getElementById('usr-rol').value = user.rol;
      document.getElementById('usr-sede').value = user.sedeId || '';
      document.getElementById('usr-activo').checked = !!user.activo;
    } else {
      document.getElementById('modal-usuario-title').textContent = 'Nuevo Usuario';
      document.getElementById('usr-id').value = '';
      document.getElementById('usr-nombre').value = '';
      document.getElementById('usr-email').value = '';
      passInput.value = '';
      passInput.required = true;
      helpPass.style.display = 'none';
      document.getElementById('usr-rol').value = 'cajero';
      document.getElementById('usr-sede').value = '';
      document.getElementById('usr-activo').checked = true;
    }
    bootstrapModalUsuario.show();
  };

  // --- BITÁCORA DE ENVÍOS (NOTIFICACIONES LOGS) ---
  const loadNotificationsLog = async () => {
    const tbody = document.getElementById('notif-log-tbody');
    if (!tbody) return;

    try {
      const log = await apiFetch('/notificaciones');
      if (log.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-3 text-secondary">No se han registrado envíos de notificaciones.</td></tr>`;
        return;
      }

      tbody.innerHTML = log.map(n => {
        let statusBadge = 'bg-success';
        if (n.estado === 'fallido') statusBadge = 'bg-danger';
        else if (n.estado === 'pendiente') statusBadge = 'bg-warning';

        return `
          <tr>
            <td>${new Date(n.createdAt).toLocaleString()}</td>
            <td><strong>${n.orden ? n.orden.numeroOrden : 'N/A'}</strong></td>
            <td>
              ${n.cliente ? n.cliente.nombre : 'Cliente N/A'}<br>
              <span class="text-secondary small">${n.cliente ? n.cliente.telefono : ''}</span>
            </td>
            <td class="text-truncate" style="max-width: 300px;" title="${n.mensaje}">${n.mensaje}</td>
            <td><span class="badge bg-secondary-lt text-uppercase">${n.canal}</span></td>
            <td>
              <span class="badge ${statusBadge} text-white" ${n.errorDetalle ? `title="${n.errorDetalle}" style="cursor:help;"` : ''}>
                ${n.estado.toUpperCase()}
              </span>
            </td>
          </tr>
        `;
      }).join('');

    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-3 text-danger">Error cargando log: ${err.message}</td></tr>`;
    }
  };

  // --- SUBMIT EVENTS ---

  // General y Límites
  document.getElementById('form-config-general').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      empresa: document.getElementById('cfg-empresa').value.trim(),
      logoUrl: document.getElementById('cfg-logourl').value.trim(),
      nit: document.getElementById('cfg-nit').value.trim(),
      direccion: document.getElementById('cfg-direccion').value.trim(),
      telefono: document.getElementById('cfg-telefono').value.trim(),
      ivaDefecto: parseFloat(document.getElementById('cfg-iva').value),
      descuentoMaximoPct: parseFloat(document.getElementById('cfg-descuento-max').value),
      egresoMaximoSinPin: parseFloat(document.getElementById('cfg-egreso-max').value),
      cobrarIvaPos: document.getElementById('cfg-cobrar-iva').checked
    };

    try {
      await apiFetch('/config/sistema', {
        method: 'PUT',
        body: JSON.stringify(body)
      });

      // Actualizar visualmente la barra lateral y el título del sitio sin recargar
      const palabras = body.empresa.split(' ');
      const primeraPalabra = palabras[0] || 'TechStore';
      const restoNombre = palabras.slice(1).join(' ') || '';
      const brandLink = document.querySelector('#sidebar-container .navbar-brand a');
      if (brandLink) {
        brandLink.innerHTML = `
          <div class="d-flex align-items-center">
            ${body.logoUrl ? `<img src="${body.logoUrl}" alt="${body.empresa}" class="me-2 sidebar-logo">` : ''}
            <div>
              <span class="fs-2 fw-bold text-primary">${primeraPalabra}</span> <span class="fs-3 fw-light text-reset">${restoNombre}</span>
            </div>
          </div>
        `;
      }
      document.title = `${body.empresa} - ERP`;

      alert('Configuración corporativa y de límites actualizada correctamente.');
      loadConfig();
    } catch (err) {
      alert(err.message);
    }
  });

  // Sedes (Guardar / Actualizar)
  document.getElementById('form-sede').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('sede-id').value;
    const body = {
      nombre: document.getElementById('sede-nombre').value.trim(),
      direccion: document.getElementById('sede-direccion').value.trim(),
      telefono: document.getElementById('sede-telefono').value.trim(),
      activa: document.getElementById('sede-activa').checked
    };

    try {
      if (id) {
        await apiFetch(`/config/sedes/${id}`, {
          method: 'PUT',
          body: JSON.stringify(body)
        });
      } else {
        await apiFetch('/config/sedes', {
          method: 'POST',
          body: JSON.stringify(body)
        });
      }
      bootstrapModalSede.hide();
      alert('Sede guardada con éxito.');
      loadSedes();
    } catch (err) {
      alert(err.message);
    }
  });

  // Usuarios (Guardar / Actualizar)
  document.getElementById('form-usuario').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('usr-id').value;
    const body = {
      nombre: document.getElementById('usr-nombre').value.trim(),
      email: document.getElementById('usr-email').value.trim(),
      rol: document.getElementById('usr-rol').value,
      sedeId: document.getElementById('usr-sede').value || null,
      activo: document.getElementById('usr-activo').checked
    };

    const pass = document.getElementById('usr-password').value;
    if (pass) body.password = pass;

    try {
      if (id) {
        await apiFetch(`/config/usuarios/${id}`, {
          method: 'PUT',
          body: JSON.stringify(body)
        });
      } else {
        await apiFetch('/config/usuarios', {
          method: 'POST',
          body: JSON.stringify(body)
        });
      }
      bootstrapModalUsuario.hide();
      alert('Usuario registrado con éxito.');
      loadUsuarios();
    } catch (err) {
      alert(err.message);
    }
  });

  // Twilio y Plantillas
  document.getElementById('form-config-twilio').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      notificacionesActivas: document.getElementById('cfg-notif-activas').checked,
      smsActivo: document.getElementById('cfg-sms-activo').checked,
      whatsappActivo: document.getElementById('cfg-wa-activo').checked,
      twilioAccountSid: document.getElementById('cfg-twilio-sid').value.trim(),
      twilioAuthToken: document.getElementById('cfg-twilio-token').value.trim(),
      twilioFromNumber: document.getElementById('cfg-twilio-from').value.trim(),
      templateRecibido: document.getElementById('cfg-tpl-recibido').value.trim(),
      templateListo: document.getElementById('cfg-tpl-listo').value.trim(),
      templateEntregado: document.getElementById('cfg-tpl-entregado').value.trim()
    };

    try {
      await apiFetch('/config/sistema', {
        method: 'PUT',
        body: JSON.stringify(body)
      });
      alert('Configuración de mensajería guardada correctamente.');
      loadConfig();
    } catch (err) {
      alert(err.message);
    }
  });

  // Restaurar copia de seguridad (Restore)
  document.getElementById('form-restore-db').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById('restore-file');
    if (!fileInput.files || fileInput.files.length === 0) return;

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const backupData = JSON.parse(evt.target.result);
        
        const verificado = await showConfirm('Restaurar Base de Datos', '🚨 ¡ATENCIÓN! La restauración de base de datos vaciará las tablas actuales y cargará los datos de la copia de seguridad. ¿Estás seguro de continuar?');
        if (verificado) {
          const res = await apiFetch('/config/restore', {
            method: 'POST',
            body: JSON.stringify(backupData)
          });
          alert(res.message || 'Base de datos restaurada correctamente.');
          window.location.reload(); // Recargar SPA para reflejar cambios
        }
      } catch (err) {
        alert('Error procesando el archivo JSON: ' + err.message);
      }
    };
    reader.readAsText(file);
  });

  // --- BOTONES TRIGGERS ---
  document.getElementById('btn-add-sede').addEventListener('click', () => openSedeModal());
  document.getElementById('btn-add-usuario').addEventListener('click', () => openUsuarioModal());

  // Carga al alternar pestañas
  document.querySelector('a[href="#tab-config-sedes"]').addEventListener('shown.bs.tab', loadSedes);
  document.querySelector('a[href="#tab-config-usuarios"]').addEventListener('shown.bs.tab', () => {
    loadSedes().then(loadUsuarios);
  });
  document.querySelector('a[href="#tab-config-log"]').addEventListener('shown.bs.tab', loadNotificationsLog);

  // Inicialización
  await loadConfig();
}
