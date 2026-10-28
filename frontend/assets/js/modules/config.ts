import { apiRequired } from '../utils/api-required.js';
import { requireSelector } from '../utils/dom.js';
import type { ConfigSistema, SedeConfig, UsuarioConfig, UsuarioEditor, NotificacionConfig } from '../types/config.js';
import type { MedioPago } from '../types/finance.js';
type MedioEditor = MedioPago & { fijo: boolean; activo: boolean };
import { requireElement } from '../utils/dom.js';
import { errorMessage } from '../utils/errors.js';
import { apiFetch } from '../api.js';
import { requireUsuario } from '../auth.js';
import { showConfirm } from '../utils/toast.js';
import { applyDocumentBranding } from '../utils/branding.js';
import { renderAparienciaTabHtml, initConfigApariencia } from './config-apariencia.js';
import { renderAuditLogTabHtml, renderAuditLogModalHtml, initAuditLogTab } from './auditlog.js';
import { erpHeader } from '../utils/module-shell.js';
import { erpAction, erpActions } from '../utils/action-buttons.js';
import {
  renderNotificacionEmailPreviewHtml,
  initNotificacionEmailPreview,
  syncNotificacionEmailPreview
} from '../utils/notificacion-email-preview.js';

export async function initConfig(container: HTMLElement) {
  const usuario = requireUsuario();
  const isSuperadmin = usuario.rol === 'superadmin';
  const METODOS_BASE = [
    { id: 'efectivo', nombre: 'Efectivo' },
    { id: 'nequi', nombre: 'Nequi' },
    { id: 'daviplata', nombre: 'Daviplata' },
    { id: 'tarjeta', nombre: 'Tarjeta' },
    { id: 'transferencia', nombre: 'Transferencia' }
  ];
  let mediosPago: MedioEditor[] = [];

  if (!isSuperadmin) {
    container.innerHTML = `
      <div class="container-xl erp-module py-5">
        <div class="alert alert-danger">
          <h4 class="alert-title">Acceso denegado</h4>
          <div class="text-secondary">No tienes permisos para acceder a la configuración del sistema.</div>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="container-xl erp-module">
      ${erpHeader({
        eyebrow: 'Configuración',
        title: 'Sistema y accesos',
        subtitle: 'Empresa, sedes, usuarios, auditoría, respaldos y mensajería'
      })}

      <!-- Cuerpo con Pestañas -->
      <div class="card">
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
              <a href="#tab-config-twilio" class="nav-link" data-bs-toggle="tab" role="tab"><i class="ti ti-bell me-1"></i> Notificaciones</a>
            </li>
            <li class="nav-item" role="presentation">
              <a href="#tab-config-log" class="nav-link" data-bs-toggle="tab" role="tab"><i class="ti ti-mail-opened me-1"></i> Historial Envíos</a>
            </li>
            <li class="nav-item" role="presentation">
              <a href="#tab-config-apariencia" class="nav-link" data-bs-toggle="tab" role="tab"><i class="ti ti-palette me-1"></i> Apariencia</a>
            </li>
            <li class="nav-item" role="presentation">
              <a href="#tab-config-auditoria" class="nav-link" data-bs-toggle="tab" role="tab"><i class="ti ti-shield-lock me-1"></i> Auditoría</a>
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
                <div class="col-md-4">
                  <label class="form-label fw-bold">Plazo crédito a clientes (días)</label>
                  <input type="number" id="cfg-dias-plazo-credito" class="form-control" min="1" max="365" required>
                  <small class="text-secondary">Días para vencimiento de facturas a crédito en POS y taller.</small>
                </div>
                <div class="col-md-12 mt-3">
                  <label class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="cfg-cobrar-iva">
                    <span class="form-check-label fw-bold">Cobrar e incluir IVA en el Punto de Venta (POS)</span>
                  </label>
                  <small class="text-secondary d-block mt-1">Si se desactiva, el POS no sumará ningún impuesto adicional sobre el precio de venta del producto (se asume que el precio de venta ya incluye el IVA o que la venta no aplica IVA).</small>
                </div>
                <div class="col-md-12 mt-3">
                  <label class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="cfg-cobrar-iva-taller">
                    <span class="form-check-label fw-bold">Cobrar IVA en facturas de Taller</span>
                  </label>
                  <small class="text-secondary d-block mt-1">Desactivado: las reparaciones se facturan como exentas. Activado: el total cobrado incluye el IVA configurado arriba.</small>
                </div>
                <div class="col-md-12 mt-3">
                  <label class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="cfg-caja-compartida" checked>
                    <span class="form-check-label fw-bold">Caja compartida por sede</span>
                  </label>
                  <small class="text-secondary d-block mt-1">Activado: una caja abierta sirve a todos los usuarios de la sede (POS, egresos, cobros). Desactivado: cada usuario solo ve y usa la caja que él mismo abrió.</small>
                </div>

                <div class="col-md-12 mt-3">
                  <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-2">
                    <div>
                      <label class="form-label fw-bold mb-0">Medios de pago</label>
                      <div class="text-secondary small">Aparecen en el POS, recaudos de cartera y el desglose de Caja.</div>
                    </div>
                    <div class="input-group input-group-sm" style="max-width: 330px;">
                      <input type="text" id="cfg-nuevo-medio-pago" class="form-control" maxlength="40" placeholder="Ej: Bancolombia">
                      <button type="button" id="btn-agregar-medio-pago" class="btn btn-outline-primary" title="Agregar método de pago"><i class="ti ti-plus"></i></button>
                    </div>
                  </div>
                  <div id="cfg-medios-pago-lista" class="d-flex flex-wrap gap-2"></div>
                </div>

                <h4 class="text-secondary border-bottom pb-2 mt-4 mb-2"><i class="ti ti-cash me-1"></i> Nómina y fechas de pago</h4>
                <div class="col-md-3">
                  <label class="form-label fw-bold">Frecuencia de pago</label>
                  <select id="cfg-nomina-frecuencia" class="form-select">
                    <option value="quincenal">Quincenal (2 pagos al mes)</option>
                    <option value="mensual">Mensual</option>
                  </select>
                </div>
                <div class="col-md-3">
                  <label class="form-label fw-bold">Día corte 1.ª quincena</label>
                  <input type="number" id="cfg-nomina-corte" class="form-control" min="1" max="28" required>
                  <small class="text-secondary">Del 1 a este día cuenta como 1.ª quincena.</small>
                </div>
                <div class="col-md-3">
                  <label class="form-label fw-bold">Día pago 1.ª quincena</label>
                  <input type="number" id="cfg-nomina-pago1" class="form-control" min="1" max="31" required>
                </div>
                <div class="col-md-3">
                  <label class="form-label fw-bold">Día pago 2.ª quincena / mensual</label>
                  <input type="number" id="cfg-nomina-pago2" class="form-control" min="1" max="31" required>
                  <small class="text-secondary">Segunda quincena o único pago si es mensual.</small>
                </div>

                <h4 class="text-secondary border-bottom pb-2 mt-4 mb-2"><i class="ti ti-server me-1"></i> Servidor local</h4>
                <div class="col-md-4">
                  <label class="form-label fw-bold" for="cfg-puerto">Puerto HTTP</label>
                  <input type="number" id="cfg-puerto" class="form-control" min="1024" max="65535" step="1" required>
                  <small class="text-secondary">Rango permitido: 1024–65535. Por defecto 3000.</small>
                </div>
                <div class="col-md-8">
                  <div id="cfg-servidor-estado" class="alert alert-secondary mb-0 h-100 d-flex flex-column justify-content-center">
                    <span class="text-secondary">Cargando estado del servidor…</span>
                  </div>
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

            <!-- TAB 4: NOTIFICACIONES (TWILIO + SMTP) -->
            <div class="tab-pane" id="tab-config-twilio" role="tabpanel">
              <form id="form-config-twilio">
                <div class="row g-4">
                  <div class="col-lg-7">
                <div class="mb-3">
                  <label class="form-check form-switch mt-2">
                    <input class="form-check-input" type="checkbox" id="cfg-notif-activas">
                    <span class="form-check-label fw-bold text-primary">Activar Envío de Notificaciones</span>
                  </label>
                </div>

                <div class="row g-3 mb-4">
                  <div class="col-md-4">
                    <label class="form-check">
                      <input class="form-check-input" type="checkbox" id="cfg-sms-activo">
                      <span class="form-check-label fw-bold">Canal SMS</span>
                    </label>
                  </div>
                  <div class="col-md-4">
                    <label class="form-check">
                      <input class="form-check-input" type="checkbox" id="cfg-wa-activo">
                      <span class="form-check-label fw-bold">Canal WhatsApp</span>
                    </label>
                  </div>
                  <div class="col-md-4">
                    <label class="form-check">
                      <input class="form-check-input" type="checkbox" id="cfg-email-activo">
                      <span class="form-check-label fw-bold">Canal Correo (SMTP)</span>
                    </label>
                  </div>
                </div>

                <h4 class="text-secondary border-bottom pb-2"><i class="ti ti-mail me-1"></i> Correo SMTP</h4>
                <div class="row g-3 mb-3">
                  <div class="col-md-12">
                    <label class="form-check">
                      <input class="form-check-input" type="checkbox" id="cfg-email-factura-auto">
                      <span class="form-check-label">Enviar factura por correo al completar venta en POS (si el cliente tiene email)</span>
                    </label>
                  </div>
                  <div class="col-md-12">
                    <label class="form-check">
                      <input class="form-check-input" type="checkbox" id="cfg-email-cartera-recordatorio">
                      <span class="form-check-label">Recordatorio automático de cartera vencida por correo (lunes 08:00)</span>
                    </label>
                  </div>
                  <div class="col-md-4">
                    <label class="form-label">Días mínimos de mora para recordatorio</label>
                    <input type="number" id="cfg-dias-mora-recordatorio" class="form-control" min="1" max="365" value="7">
                  </div>
                  <div class="col-md-8">
                    <label class="form-label">Asunto — recordatorio cartera</label>
                    <input type="text" id="cfg-tpl-email-cartera-asunto" class="form-control" placeholder="Recordatorio de pago — {empresa}" spellcheck="false">
                  </div>
                  <div class="col-md-12">
                    <label class="form-label">Cuerpo — recordatorio cartera</label>
                    <textarea id="cfg-tpl-email-cartera-cuerpo" class="form-control" rows="3" spellcheck="false"></textarea>
                    <small class="text-secondary">Variables: <code>{cliente}</code>, <code>{factura}</code>, <code>{saldo}</code>, <code>{dias}</code>, <code>{empresa}</code></small>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">Servidor SMTP</label>
                    <input type="text" id="cfg-smtp-host" class="form-control" placeholder="smtp.gmail.com" spellcheck="false">
                  </div>
                  <div class="col-md-3">
                    <label class="form-label">Puerto</label>
                    <input type="number" id="cfg-smtp-port" class="form-control" placeholder="587" min="1" max="65535">
                    <small class="text-secondary">Gmail: use <strong>587</strong> sin SSL directo, o <strong>465</strong> con SSL directo.</small>
                  </div>
                  <div class="col-md-3 d-flex align-items-end">
                    <label class="form-check mb-2">
                      <input class="form-check-input" type="checkbox" id="cfg-smtp-secure">
                      <span class="form-check-label">SSL/TLS directo (solo puerto 465)</span>
                    </label>
                  </div>
                  <div class="col-md-12">
                    <label class="form-check">
                      <input class="form-check-input" type="checkbox" id="cfg-smtp-ignore-tls">
                      <span class="form-check-label">Omitir verificación de certificado TLS</span>
                      <span class="text-secondary small d-block">Actívelo si usa antivirus/proxy que intercepta correo (error “self-signed certificate”). En desarrollo suele no ser necesario.</span>
                    </label>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">Usuario SMTP</label>
                    <input type="text" id="cfg-smtp-user" class="form-control" spellcheck="false">
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">Contraseña SMTP</label>
                    <input type="password" id="cfg-smtp-pass" class="form-control" placeholder="Dejar vacío para no cambiar" spellcheck="false">
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">Correo remitente (De)</label>
                    <input type="email" id="cfg-smtp-from-email" class="form-control" placeholder="ventas@miempresa.com" spellcheck="false">
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">Nombre remitente</label>
                    <input type="text" id="cfg-smtp-from-name" class="form-control" placeholder="Servitec Gamers" spellcheck="false">
                  </div>
                  <div class="col-md-12">
                    <label class="form-label">Asunto — envío de factura</label>
                    <input type="text" id="cfg-tpl-email-factura-asunto" class="form-control" placeholder="Factura {factura} — {empresa}" spellcheck="false">
                  </div>
                  <div class="col-md-12">
                    <label class="form-label">Cuerpo — envío de factura</label>
                    <textarea id="cfg-tpl-email-factura-cuerpo" class="form-control" rows="3" placeholder="Estimado/a {cliente}…"></textarea>
                    <small class="text-secondary">Variables: <code>{cliente}</code>, <code>{factura}</code>, <code>{total}</code>, <code>{sede}</code> (dirección de la sede), <code>{empresa}</code></small>
                  </div>
                  <div class="col-md-8">
                    <label class="form-label">Probar conexión SMTP</label>
                    <input type="email" id="cfg-smtp-test-email" class="form-control" placeholder="correo@destino.com" spellcheck="false">
                  </div>
                  <div class="col-md-4 d-flex align-items-end">
                    <button type="button" class="btn btn-outline-primary w-100" id="btn-probar-smtp">
                      <i class="ti ti-plug-connected me-1"></i> Probar conexión
                    </button>
                  </div>
                </div>

                <h4 class="text-secondary border-bottom pb-2 mt-4"><i class="ti ti-key me-1"></i> Credenciales de Twilio API</h4>
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
                  Variables dinámicas: <code>{cliente}</code> (nombre cliente), <code>{equipo}</code> (dispositivo), <code>{sede}</code> (dirección de la sede), <code>{orden}</code> (número orden), <code>{total}</code> (monto cobrado).
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

                <button type="submit" class="btn btn-primary"><i class="ti ti-device-floppy me-1"></i> Guardar notificaciones</button>
                  </div>
                  <div class="col-lg-5">
                    ${renderNotificacionEmailPreviewHtml()}
                  </div>
                </div>
              </form>
            </div>

            <!-- TAB 5: HISTORIAL ENVÍOS (NOTIFICACIONES) -->
            <div class="tab-pane" id="tab-config-log" role="tabpanel">
              <div class="table-responsive">
                <table class="table table-vcenter card-table table-hover">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Referencia</th>
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

            ${renderAparienciaTabHtml()}

            <!-- TAB: AUDITORÍA -->
            <div class="tab-pane" id="tab-config-auditoria" role="tabpanel">
              ${renderAuditLogTabHtml()}
            </div>

            <!-- TAB: COPIA DE SEGURIDAD (BACKUP & RESTORE) -->
            <div class="tab-pane" id="tab-config-backup" role="tabpanel">
              <div class="row g-4">
                <div class="col-md-6">
                  <div class="card bg-light border-0 p-4">
                    <h3 class="fw-bold mb-2 text-primary"><i class="ti ti-download me-1"></i> Exportar Respaldo</h3>
                    <p class="text-secondary small mb-3">Descarga un respaldo completo y cifrado. Guarda su contraseña para poder restaurarlo.</p>
                    <label class="form-label" for="backup-password">Contraseña del respaldo</label>
                    <input type="password" id="backup-password" class="form-control mb-3" minlength="12" autocomplete="new-password" placeholder="Mínimo 12 caracteres">
                    <button id="btn-download-backup" class="btn btn-primary w-100">
                      <i class="ti ti-cloud-download me-1"></i> Descargar Respaldo JSON
                    </button>
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
                      <label class="form-label" for="restore-password">Contraseña del respaldo</label>
                      <input type="password" id="restore-password" class="form-control mb-3" minlength="12" required autocomplete="off">
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

    ${renderAuditLogModalHtml()}
  `;

  // --- VARIABLES ---
  let sedesList: SedeConfig[] = [];
  let sistemaConfig: Partial<ConfigSistema> = {};
  const modalSedeEl = requireElement('modal-sede', HTMLDivElement);
  const bootstrapModalSede = new bootstrap.Modal(modalSedeEl);
  const modalUsuarioEl = requireElement('modal-usuario', HTMLDivElement);
  const bootstrapModalUsuario = new bootstrap.Modal(modalUsuarioEl);

  function renderServidorEstado(data: ConfigSistema) {
    const el = requireElement('cfg-servidor-estado', HTMLDivElement);
    if (!el) return;
    const srv = data.servidor || {};
    const activo = srv.puertoActivo ?? data.puertoServidor ?? 3000;
    const configurado = srv.puertoConfigurado ?? data.puertoServidor ?? 3000;
    const urlLocal = srv.urlLocal || `http://localhost:${activo}`;
    const urlPublica = srv.urlPublica || null;
    const urlActiva = srv.urlActiva || urlPublica || urlLocal;
    const pendiente = srv.requiereReinicio || activo !== configurado;
    const tunelHtml = urlPublica
      ? `<div class="mt-2 small">Túnel activo: <a href="${urlPublica}" target="_blank" rel="noopener">${urlPublica}</a></div>`
      : `<div class="mt-2 small text-secondary">Cloudflare: <code>cloudflared tunnel --url http://127.0.0.1:${activo}</code></div>`;

    el.className = `alert mb-0 h-100 d-flex flex-column justify-content-center ${pendiente ? 'alert-warning' : 'alert-success'}`;
    el.innerHTML = pendiente
      ? `<strong>Reinicio pendiente.</strong> El servidor corre en el puerto <code>${activo}</code> (${urlLocal}). Tras guardar, reinicie con <code>npm run dev</code> para usar el puerto <code>${configurado}</code>.${tunelHtml}`
      : `<strong>Servidor activo.</strong> Puerto <code>${activo}</code> — <a href="${urlActiva}" target="_blank" rel="noopener">${urlActiva}</a>${urlPublica ? '' : `<br><span class="small text-secondary">Local: ${urlLocal}</span>`}${tunelHtml}`;
  }

  // --- MÉTODOS GENERALES ---
  const slugMetodo = (nombre: string) => nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 36);

  const normalizarMediosPago = (lista: MedioPago[] | null | undefined) => {
    const existentes = Array.isArray(lista) ? lista : [];
    return METODOS_BASE.map((base) => {
      const actual = existentes.find((item) => item?.id === base.id);
      return { ...base, activo: actual?.activo !== false, fijo: true };
    }).concat(existentes
      .filter((item) => item?.id && !METODOS_BASE.some((base) => base.id === item.id))
      .map((item) => ({ id: item.id, nombre: item.nombre || item.id, activo: item.activo !== false, fijo: false })));
  };

  const renderMediosPago = () => {
    const lista = requireElement('cfg-medios-pago-lista', HTMLDivElement);
    if (!lista) return;
    lista.innerHTML = mediosPago.map((medio) => `
      <div class="border rounded px-2 py-1 d-flex align-items-center gap-2 bg-light">
        <label class="form-check form-switch m-0" title="${medio.activo ? 'Disponible para cobrar' : 'Oculto para nuevos cobros'}">
          <input class="form-check-input cfg-medio-activo" type="checkbox" data-id="${medio.id}" ${medio.activo ? 'checked' : ''}>
        </label>
        <span class="small fw-semibold">${medio.nombre}</span>
        ${medio.fijo ? '<span class="text-secondary small">Base</span>' : `<button type="button" class="btn btn-ghost-danger btn-icon btn-sm btn-eliminar-medio" data-id="${medio.id}" title="Eliminar método"><i class="ti ti-trash"></i></button>`}
      </div>
    `).join('');
    lista.querySelectorAll<HTMLInputElement>('.cfg-medio-activo').forEach((input) => input.addEventListener('change', async () => {
      const medio = mediosPago.find((item) => item.id === input.dataset.id);
      if (medio) {
        medio.activo = input.checked;
        await guardarMediosPago();
      }
    }));
    lista.querySelectorAll<HTMLButtonElement>('.btn-eliminar-medio').forEach((button) => button.addEventListener('click', async () => {
      mediosPago = mediosPago.filter((medio) => medio.id !== button.dataset.id);
      renderMediosPago();
      await guardarMediosPago();
    }));
  };

  const guardarMediosPago = async () => {
    try {
      await apiRequired<ConfigSistema>('/config/sistema', {
        method: 'PUT',
        body: JSON.stringify({
          mediosPago: mediosPago.map(({ id, nombre, activo }) => ({ id, nombre, activo }))
        })
      });
    } catch (error) {
      alert(`No se pudieron guardar los medios de pago: ${errorMessage(error)}`);
    }
  };

  const loadConfig = async () => {
    try {
      const data = await apiRequired<ConfigSistema>('/config/sistema');
      sistemaConfig = data;
      // General
      requireElement('cfg-empresa', HTMLInputElement).value = String(data.empresa || '');
      requireElement('cfg-nit', HTMLInputElement).value = String(data.nit || '');
      requireElement('cfg-direccion', HTMLInputElement).value = String(data.direccion || '');
      requireElement('cfg-telefono', HTMLInputElement).value = String(data.telefono || '');
      requireElement('cfg-logourl', HTMLInputElement).value = String(data.logoUrl || '');
      requireElement('cfg-iva', HTMLInputElement).value = String(data.ivaDefecto || 19.00);
      requireElement('cfg-descuento-max', HTMLInputElement).value = String(data.descuentoMaximoPct || 15.00);
      requireElement('cfg-egreso-max', HTMLInputElement).value = String(data.egresoMaximoSinPin || 50000);
      requireElement('cfg-dias-plazo-credito', HTMLInputElement).value = String(data.diasPlazoCredito ?? 30);
      requireElement('cfg-cobrar-iva', HTMLInputElement).checked = !!data.cobrarIvaPos;
      requireElement('cfg-cobrar-iva-taller', HTMLInputElement).checked = !!data.cobrarIvaTaller;
      requireElement('cfg-caja-compartida', HTMLInputElement).checked = data.cajaCompartidaSede !== false;
      mediosPago = normalizarMediosPago(data.mediosPago);
      renderMediosPago();
      requireElement('cfg-nomina-frecuencia', HTMLSelectElement).value = String(data.nominaFrecuenciaDefault || 'quincenal');
      requireElement('cfg-nomina-corte', HTMLInputElement).value = String(data.nominaDiaCorteQuincena ?? 15);
      requireElement('cfg-nomina-pago1', HTMLInputElement).value = String(data.nominaDiaPago1 ?? 15);
      requireElement('cfg-nomina-pago2', HTMLInputElement).value = String(data.nominaDiaPago2 ?? 30);
      requireElement('cfg-puerto', HTMLInputElement).value = String(data.puertoServidor ?? 3000);
      renderServidorEstado(data);

      // Twilio y correo
      requireElement('cfg-notif-activas', HTMLInputElement).checked = !!data.notificacionesActivas;
      requireElement('cfg-sms-activo', HTMLInputElement).checked = !!data.smsActivo;
      requireElement('cfg-wa-activo', HTMLInputElement).checked = !!data.whatsappActivo;
      requireElement('cfg-email-activo', HTMLInputElement).checked = !!data.emailActivo;
      requireElement('cfg-email-factura-auto', HTMLInputElement).checked = !!data.emailFacturaAuto;
      requireElement('cfg-email-cartera-recordatorio', HTMLInputElement).checked = !!data.emailCarteraRecordatorio;
      requireElement('cfg-dias-mora-recordatorio', HTMLInputElement).value = String(data.diasMoraRecordatorioCartera ?? 7);
      requireElement('cfg-tpl-email-cartera-asunto', HTMLInputElement).value = String(data.templateEmailCarteraAsunto || '');
      requireElement('cfg-tpl-email-cartera-cuerpo', HTMLTextAreaElement).value = String(data.templateEmailCarteraCuerpo || '');
      requireElement('cfg-smtp-host', HTMLInputElement).value = String(data.smtpHost || '');
      requireElement('cfg-smtp-port', HTMLInputElement).value = String(data.smtpPort ?? 587);
      requireElement('cfg-smtp-secure', HTMLInputElement).checked = !!data.smtpSecure;
      requireElement('cfg-smtp-ignore-tls', HTMLInputElement).checked = !!data.smtpIgnoreTlsErrors;
      syncSmtpPortSecure(false);
      requireElement('cfg-smtp-user', HTMLInputElement).value = String(data.smtpUser || '');
      requireElement('cfg-smtp-pass', HTMLInputElement).value = String('');
      requireElement('cfg-smtp-from-email', HTMLInputElement).value = String(data.smtpFromEmail || '');
      requireElement('cfg-smtp-from-name', HTMLInputElement).value = String(data.smtpFromName || '');
      requireElement('cfg-tpl-email-factura-asunto', HTMLInputElement).value = String(data.templateEmailFacturaAsunto || '');
      requireElement('cfg-tpl-email-factura-cuerpo', HTMLTextAreaElement).value = String(data.templateEmailFacturaCuerpo || '');
      requireElement('cfg-twilio-sid', HTMLInputElement).value = String(data.twilioAccountSid || '');
      requireElement('cfg-twilio-token', HTMLInputElement).value = String('');
      requireElement('cfg-twilio-from', HTMLInputElement).value = String(data.twilioFromNumber || '');

      // Templates
      requireElement('cfg-tpl-recibido', HTMLTextAreaElement).value = String(data.templateRecibido || '');
      requireElement('cfg-tpl-listo', HTMLTextAreaElement).value = String(data.templateListo || '');
      requireElement('cfg-tpl-entregado', HTMLTextAreaElement).value = String(data.templateEntregado || '');
      syncNotificacionEmailPreview();

    } catch (e) {
      console.error("Error al cargar configuraciones:", e);
    }
  };

  // --- CONTROL DE SEDES ---
  const loadSedes = async () => {
    const tbody = requireElement('sedes-tbody', HTMLTableSectionElement);
    if (!tbody) return;

    try {
      const sedes = await apiRequired<SedeConfig[]>('/config/sedes');
      sedesList = sedes;
      
      // Llenar select de sedes en modal de usuarios
      const usrSedeSelect = requireElement('usr-sede', HTMLSelectElement);
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
          <td class="text-end erp-td-actions">
            ${erpActions(`
              ${erpAction('edit', { className: 'btn-edit-sede', attrs: { 'data-index': index } })}
              ${s.activa
                ? erpAction('unlink', {
                    className: 'btn-deactivate-sede',
                    label: 'Desactivar',
                    icon: 'ti-player-pause',
                    attrs: { 'data-id': s.id }
                  })
                : erpAction('return', {
                    className: 'btn-activate-sede',
                    label: 'Activar',
                    icon: 'ti-player-play',
                    attrs: { 'data-id': s.id }
                  })}
              ${erpAction('delete', {
                className: 'btn-force-delete-sede',
                label: 'Eliminar',
                attrs: { 'data-id': s.id, 'data-nombre': s.nombre }
              })}
            `)}
          </td>
        </tr>
      `).join('');

      // Escuchas
      document.querySelectorAll('.btn-edit-sede').forEach(btn => {
        btn.addEventListener('click', () => {
          const index = btn.getAttribute('data-index');
          openSedeModal(sedesList[Number(index)]);
        });
      });

      document.querySelectorAll('.btn-activate-sede').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const verificado = await showConfirm(
            'Activar sede',
            'La sede volverá a estar disponible para operaciones nuevas.'
          );
          if (!verificado) return;
          try {
            await apiFetch(`/config/sedes/${id}`, {
              method: 'PUT',
              body: JSON.stringify({ activa: true })
            });
            alert('Sede activada.');
            await loadSedes();
          } catch (err) {
            alert(errorMessage(err));
          }
        });
      });

      document.querySelectorAll('.btn-deactivate-sede').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const verificado = await showConfirm(
            'Desactivar sede',
            'La sede se marcará como inactiva y dejará de usarse en operaciones nuevas. El historial se conserva.'
          );
          if (!verificado) return;
          try {
            const resultado = await apiRequired<{message: string}>(`/config/sedes/${id}`, { method: 'DELETE' });
            alert(resultado.message);
            await loadSedes();
          } catch (err) {
            alert(errorMessage(err));
          }
        });
      });

      document.querySelectorAll('.btn-force-delete-sede').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const nombre = btn.getAttribute('data-nombre') || 'esta sede';
          const verificado = await showConfirm(
            'Eliminar sede definitivamente',
            `Se eliminará "${nombre}" y su inventario asociado. Si tiene clientes, se reasignarán a otra sede. Ventas, cajas y documentos de esa sede también se borrarán. Esta acción no se puede deshacer.`
          );
          if (!verificado) return;
          try {
            const resultado = await apiRequired<{message: string}>(`/config/sedes/${id}?force=true`, { method: 'DELETE' });
            alert(resultado.message);
            await loadSedes();
          } catch (err) {
            alert(errorMessage(err));
          }
        });
      });

    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-3 text-danger">Error: ${errorMessage(e)}</td></tr>`;
    }
  };

  const openSedeModal = (sede: SedeConfig | null = null) => {
    if (sede) {
      requireElement('modal-sede-title', HTMLHeadingElement).textContent = 'Editar Sede';
      requireElement('sede-id', HTMLInputElement).value = String(sede.id);
      requireElement('sede-nombre', HTMLInputElement).value = String(sede.nombre);
      requireElement('sede-direccion', HTMLInputElement).value = String(sede.direccion || '');
      requireElement('sede-telefono', HTMLInputElement).value = String(sede.telefono || '');
      requireElement('sede-activa', HTMLInputElement).checked = !!sede.activa;
    } else {
      requireElement('modal-sede-title', HTMLHeadingElement).textContent = 'Nueva Sede';
      requireElement('sede-id', HTMLInputElement).value = String('');
      requireElement('sede-nombre', HTMLInputElement).value = String('');
      requireElement('sede-direccion', HTMLInputElement).value = String('');
      requireElement('sede-telefono', HTMLInputElement).value = String('');
      requireElement('sede-activa', HTMLInputElement).checked = true;
    }
    bootstrapModalSede.show();
  };

  // --- CONTROL DE USUARIOS ---
  const loadUsuarios = async () => {
    const tbody = requireElement('usuarios-tbody', HTMLTableSectionElement);
    if (!tbody) return;

    try {
      const usuarios = await apiRequired<UsuarioConfig[]>('/config/usuarios');
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
          <td class="text-end erp-td-actions">
            ${erpActions(`
              ${erpAction('edit', {
                className: 'btn-edit-usuario',
                attrs: {
                  'data-id': u.id,
                  'data-nombre': u.nombre,
                  'data-email': u.email,
                  'data-rol': u.rol,
                  'data-sede': u.sedeId || '',
                  'data-activo': u.activo,
                },
              })}
              ${erpAction('delete', { className: 'btn-delete-usuario', attrs: { 'data-id': u.id }, label: 'Borrar' })}
            `)}
          </td>
        </tr>
      `).join('');

      // Escuchas
      document.querySelectorAll('.btn-edit-usuario').forEach(btn => {
        btn.addEventListener('click', () => {
          const user = {
            id: btn.getAttribute('data-id') || '',
            nombre: btn.getAttribute('data-nombre') || '',
            email: btn.getAttribute('data-email') || '',
            rol: btn.getAttribute('data-rol') || '',
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
              alert(errorMessage(err));
            }
          }
        });
      });

    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-3 text-danger">Error: ${errorMessage(e)}</td></tr>`;
    }
  };

  const openUsuarioModal = (user: UsuarioEditor | null = null) => {
    const passInput = requireElement('usr-password', HTMLInputElement);
    const helpPass = requireElement('help-usr-password', HTMLElement);
    
    if (user) {
      requireElement('modal-usuario-title', HTMLHeadingElement).textContent = 'Editar Usuario';
      requireElement('usr-id', HTMLInputElement).value = String(user.id);
      requireElement('usr-nombre', HTMLInputElement).value = String(user.nombre);
      requireElement('usr-email', HTMLInputElement).value = String(user.email);
      passInput.value = '';
      passInput.required = false;
      helpPass.style.display = 'block';
      requireElement('usr-rol', HTMLSelectElement).value = String(user.rol);
      requireElement('usr-sede', HTMLSelectElement).value = String(user.sedeId || '');
      requireElement('usr-activo', HTMLInputElement).checked = !!user.activo;
    } else {
      requireElement('modal-usuario-title', HTMLHeadingElement).textContent = 'Nuevo Usuario';
      requireElement('usr-id', HTMLInputElement).value = String('');
      requireElement('usr-nombre', HTMLInputElement).value = String('');
      requireElement('usr-email', HTMLInputElement).value = String('');
      passInput.value = '';
      passInput.required = true;
      helpPass.style.display = 'none';
      requireElement('usr-rol', HTMLSelectElement).value = String('cajero');
      requireElement('usr-sede', HTMLSelectElement).value = String('');
      requireElement('usr-activo', HTMLInputElement).checked = true;
    }
    bootstrapModalUsuario.show();
  };

  // --- BITÁCORA DE ENVÍOS (NOTIFICACIONES LOGS) ---
  const loadNotificationsLog = async () => {
    const tbody = requireElement('notif-log-tbody', HTMLTableSectionElement);
    if (!tbody) return;

    try {
      const log = await apiRequired<NotificacionConfig[]>('/notificaciones');
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
            <td><strong>${n.factura ? n.factura.numeroFactura : (n.orden ? n.orden.numeroOrden : '—')}</strong></td>
            <td>
              ${n.cliente ? n.cliente.nombre : 'Cliente N/A'}<br>
              <span class="text-secondary small">${n.cliente?.email || n.cliente?.telefono || ''}</span>
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
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-3 text-danger">Error cargando log: ${errorMessage(err)}</td></tr>`;
    }
  };

  // --- SUBMIT EVENTS ---

  // General y Límites
  requireElement('form-config-general', HTMLFormElement).addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      empresa: requireElement('cfg-empresa', HTMLInputElement).value.trim(),
      logoUrl: requireElement('cfg-logourl', HTMLInputElement).value.trim(),
      nit: requireElement('cfg-nit', HTMLInputElement).value.trim(),
      direccion: requireElement('cfg-direccion', HTMLInputElement).value.trim(),
      telefono: requireElement('cfg-telefono', HTMLInputElement).value.trim(),
      ivaDefecto: parseFloat(requireElement('cfg-iva', HTMLInputElement).value),
      descuentoMaximoPct: parseFloat(requireElement('cfg-descuento-max', HTMLInputElement).value),
      egresoMaximoSinPin: parseFloat(requireElement('cfg-egreso-max', HTMLInputElement).value),
      diasPlazoCredito: parseInt(requireElement('cfg-dias-plazo-credito', HTMLInputElement).value, 10) || 30,
      cobrarIvaPos: requireElement('cfg-cobrar-iva', HTMLInputElement).checked,
      cobrarIvaTaller: requireElement('cfg-cobrar-iva-taller', HTMLInputElement).checked,
      cajaCompartidaSede: requireElement('cfg-caja-compartida', HTMLInputElement).checked,
      mediosPago: mediosPago.map(({ id, nombre, activo }) => ({ id, nombre, activo })),
      nominaFrecuenciaDefault: requireElement('cfg-nomina-frecuencia', HTMLSelectElement).value,
      nominaDiaCorteQuincena: parseInt(requireElement('cfg-nomina-corte', HTMLInputElement).value, 10),
      nominaDiaPago1: parseInt(requireElement('cfg-nomina-pago1', HTMLInputElement).value, 10),
      nominaDiaPago2: parseInt(requireElement('cfg-nomina-pago2', HTMLInputElement).value, 10),
      puertoServidor: parseInt(requireElement('cfg-puerto', HTMLInputElement).value, 10),
    };

    try {
      const result = await apiRequired<ConfigSistema>('/config/sistema', {
        method: 'PUT',
        body: JSON.stringify(body)
      });

      const brand = applyDocumentBranding({
        empresa: result.empresa || body.empresa,
        logoUrl: result.logoUrl ?? body.logoUrl
      });

      const palabras = brand.empresa.split(' ');
      const primeraPalabra = palabras[0] || 'TechStore';
      const restoNombre = palabras.slice(1).join(' ') || '';
      const brandLink = document.querySelector('#sidebar-container .navbar-brand a');
      if (brandLink) {
        brandLink.innerHTML = `
          <div class="d-flex align-items-center">
            ${brand.logoUrl ? `<img src="${brand.logoUrl}" alt="${brand.empresa}" class="me-2 sidebar-logo">` : ''}
            <div>
              <span class="fs-2 fw-bold text-primary">${primeraPalabra}</span> <span class="fs-3 fw-light text-reset">${restoNombre}</span>
            </div>
          </div>
        `;
      }

      if (result.requiereReinicio) {
        alert(result.mensajeReinicio || 'Puerto guardado. Reinicie el servidor para aplicar el cambio.');
      } else {
        alert('Configuración corporativa y de límites actualizada correctamente.');
      }
      loadConfig();
    } catch (err) {
      alert(errorMessage(err));
    }
  });

  requireElement('btn-agregar-medio-pago', HTMLButtonElement).addEventListener('click', async () => {
    const input = requireElement('cfg-nuevo-medio-pago', HTMLInputElement);
    const nombre = input.value.trim();
    const id = slugMetodo(nombre);
    if (!id) return;
    if (mediosPago.some((medio) => medio.id === id)) {
      alert('Ya existe un medio de pago con ese nombre.');
      return;
    }
    mediosPago.push({ id, nombre, activo: true, fijo: false });
    input.value = '';
    renderMediosPago();
    await guardarMediosPago();
  });

  requireElement('cfg-nuevo-medio-pago', HTMLInputElement).addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      requireElement('btn-agregar-medio-pago', HTMLButtonElement).click();
    }
  });

  // Sedes (Guardar / Actualizar)
  requireElement('form-sede', HTMLFormElement).addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = requireElement('sede-id', HTMLInputElement).value;
    const body = {
      nombre: requireElement('sede-nombre', HTMLInputElement).value.trim(),
      direccion: requireElement('sede-direccion', HTMLInputElement).value.trim(),
      telefono: requireElement('sede-telefono', HTMLInputElement).value.trim(),
      activa: requireElement('sede-activa', HTMLInputElement).checked
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
      alert(errorMessage(err));
    }
  });

  // Usuarios (Guardar / Actualizar)
  requireElement('form-usuario', HTMLFormElement).addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = requireElement('usr-id', HTMLInputElement).value;
    const body = {
      password: undefined as string | undefined,
      nombre: requireElement('usr-nombre', HTMLInputElement).value.trim(),
      email: requireElement('usr-email', HTMLInputElement).value.trim(),
      rol: requireElement('usr-rol', HTMLSelectElement).value,
      sedeId: requireElement('usr-sede', HTMLSelectElement).value || null,
      activo: requireElement('usr-activo', HTMLInputElement).checked
    };

    const pass = requireElement('usr-password', HTMLInputElement).value;
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
      alert(errorMessage(err));
    }
  });

  // Twilio, SMTP y plantillas
  function syncSmtpPortSecure(fromUserToggle = true) {
    const portEl = requireElement('cfg-smtp-port', HTMLInputElement);
    const secureEl = requireElement('cfg-smtp-secure', HTMLInputElement);
    if (!portEl || !secureEl) return;

    if (fromUserToggle && secureEl.checked) {
      portEl.value = '465';
    } else if (fromUserToggle && !secureEl.checked) {
      portEl.value = '587';
    } else {
      const port = parseInt(portEl.value, 10) || 587;
      if (port === 465) secureEl.checked = true;
      else if (port === 587) secureEl.checked = false;
    }
  }

  document.getElementById('cfg-smtp-secure')?.addEventListener('change', () => syncSmtpPortSecure(true));
  document.getElementById('cfg-smtp-port')?.addEventListener('change', () => syncSmtpPortSecure(false));

  requireElement('form-config-twilio', HTMLFormElement).addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      smtpPass: undefined as string | undefined, twilioAuthToken: undefined as string | undefined,
      notificacionesActivas: requireElement('cfg-notif-activas', HTMLInputElement).checked,
      smsActivo: requireElement('cfg-sms-activo', HTMLInputElement).checked,
      whatsappActivo: requireElement('cfg-wa-activo', HTMLInputElement).checked,
      emailActivo: requireElement('cfg-email-activo', HTMLInputElement).checked,
      emailFacturaAuto: requireElement('cfg-email-factura-auto', HTMLInputElement).checked,
      emailCarteraRecordatorio: requireElement('cfg-email-cartera-recordatorio', HTMLInputElement).checked,
      diasMoraRecordatorioCartera: parseInt(requireElement('cfg-dias-mora-recordatorio', HTMLInputElement).value, 10) || 7,
      templateEmailCarteraAsunto: requireElement('cfg-tpl-email-cartera-asunto', HTMLInputElement).value.trim(),
      templateEmailCarteraCuerpo: requireElement('cfg-tpl-email-cartera-cuerpo', HTMLTextAreaElement).value.trim(),
      smtpHost: requireElement('cfg-smtp-host', HTMLInputElement).value.trim(),
      smtpPort: parseInt(requireElement('cfg-smtp-port', HTMLInputElement).value, 10) || 587,
      smtpSecure: requireElement('cfg-smtp-secure', HTMLInputElement).checked,
      smtpIgnoreTlsErrors: requireElement('cfg-smtp-ignore-tls', HTMLInputElement).checked,
      smtpUser: requireElement('cfg-smtp-user', HTMLInputElement).value.trim(),
      smtpFromEmail: requireElement('cfg-smtp-from-email', HTMLInputElement).value.trim(),
      smtpFromName: requireElement('cfg-smtp-from-name', HTMLInputElement).value.trim(),
      templateEmailFacturaAsunto: requireElement('cfg-tpl-email-factura-asunto', HTMLInputElement).value.trim(),
      templateEmailFacturaCuerpo: requireElement('cfg-tpl-email-factura-cuerpo', HTMLTextAreaElement).value.trim(),
      twilioAccountSid: requireElement('cfg-twilio-sid', HTMLInputElement).value.trim(),
      twilioFromNumber: requireElement('cfg-twilio-from', HTMLInputElement).value.trim(),
      templateRecibido: requireElement('cfg-tpl-recibido', HTMLTextAreaElement).value.trim(),
      templateListo: requireElement('cfg-tpl-listo', HTMLTextAreaElement).value.trim(),
      templateEntregado: requireElement('cfg-tpl-entregado', HTMLTextAreaElement).value.trim()
    };

    const smtpPass = requireElement('cfg-smtp-pass', HTMLInputElement).value;
    if (smtpPass) body.smtpPass = smtpPass;
    const twilioToken = requireElement('cfg-twilio-token', HTMLInputElement).value;
    if (twilioToken) body.twilioAuthToken = twilioToken;

    try {
      await apiRequired<ConfigSistema>('/config/sistema', {
        method: 'PUT',
        body: JSON.stringify(body)
      });
      alert('Configuración de notificaciones guardada correctamente.');
      loadConfig();
    } catch (err) {
      alert(errorMessage(err));
    }
  });

  document.getElementById('btn-probar-smtp')?.addEventListener('click', async () => {
    const btn = requireElement('btn-probar-smtp', HTMLButtonElement);
    const emailDestino = requireElement('cfg-smtp-test-email', HTMLInputElement).value.trim();
    if (!emailDestino) {
      alert('Indique un correo destino para la prueba.');
      return;
    }

    const payload = {
      smtpPass: undefined as string | undefined,
      emailDestino,
      smtpHost: requireElement('cfg-smtp-host', HTMLInputElement).value.trim(),
      smtpPort: parseInt(requireElement('cfg-smtp-port', HTMLInputElement).value, 10) || 587,
      smtpSecure: requireElement('cfg-smtp-secure', HTMLInputElement).checked,
      smtpIgnoreTlsErrors: requireElement('cfg-smtp-ignore-tls', HTMLInputElement).checked,
      smtpUser: requireElement('cfg-smtp-user', HTMLInputElement).value.trim(),
      smtpFromEmail: requireElement('cfg-smtp-from-email', HTMLInputElement).value.trim(),
      smtpFromName: requireElement('cfg-smtp-from-name', HTMLInputElement).value.trim(),
      empresa: requireElement('cfg-empresa', HTMLInputElement).value.trim() || 'ERP'
    };
    const smtpPass = requireElement('cfg-smtp-pass', HTMLInputElement).value;
    if (smtpPass) payload.smtpPass = smtpPass;

    try {
      btn.disabled = true;
      btn.innerHTML = '<i class="ti ti-loader-2 me-1"></i> Enviando…';
      const res = await apiRequired<{message: string}>('/config/sistema/probar-smtp', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      alert(res.message || 'Correo de prueba enviado.');
    } catch (err) {
      alert('Error SMTP: ' + errorMessage(err));
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-plug-connected me-1"></i> Probar conexión';
    }
  });

  // Descargar copia de seguridad (Backup) con token de autenticación
  requireElement('btn-download-backup', HTMLButtonElement).addEventListener('click', async () => {
    const btn = requireElement('btn-download-backup', HTMLButtonElement);
    try {
      btn.disabled = true;
      btn.innerHTML = '<i class="ti ti-loader-2 me-1"></i> Generando respaldo…';
      const token = localStorage.getItem('token');
      const response = await fetch('/api/config/backup', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: requireElement('backup-password', HTMLInputElement).value })
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'No se pudo descargar el respaldo.');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const fecha = new Date().toISOString().split('T')[0];
      a.download = `backup_erp_${fecha}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert(errorMessage(e));
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-cloud-download me-1"></i> Descargar Respaldo JSON';
    }
  });

  // Restaurar copia de seguridad (Restore)
  requireElement('form-restore-db', HTMLFormElement).addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = requireElement('restore-file', HTMLInputElement);
    if (!fileInput.files || fileInput.files.length === 0) return;

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const backupData = JSON.parse(typeof reader.result === 'string' ? reader.result : '') as unknown;
        
        const verificado = await showConfirm('Restaurar Base de Datos', '🚨 ¡ATENCIÓN! La restauración de base de datos vaciará las tablas actuales y cargará los datos de la copia de seguridad. ¿Estás seguro de continuar?');
        if (verificado) {
          const res = await apiRequired<{message: string}>('/config/restore', {
            method: 'POST',
            body: JSON.stringify({ backup: backupData, password: requireElement('restore-password', HTMLInputElement).value })
          });
          alert(res.message || 'Base de datos restaurada correctamente.');
          localStorage.removeItem('token');
          localStorage.removeItem('usuario');
          window.location.hash = '#/login';
          window.location.reload(); // Recargar SPA para reflejar cambios
        }
      } catch (err) {
        alert('Error procesando el archivo JSON: ' + errorMessage(err));
      }
    };
    reader.readAsText(file);
  });

  // --- BOTONES TRIGGERS ---
  requireElement('btn-add-sede', HTMLButtonElement).addEventListener('click', () => openSedeModal());
  requireElement('btn-add-usuario', HTMLButtonElement).addEventListener('click', () => openUsuarioModal());

  // Carga al alternar pestañas
  requireSelector('a[href="#tab-config-sedes"]', HTMLAnchorElement).addEventListener('shown.bs.tab', loadSedes);
  requireSelector('a[href="#tab-config-usuarios"]', HTMLAnchorElement).addEventListener('shown.bs.tab', () => {
    loadSedes().then(loadUsuarios);
  });
  requireSelector('a[href="#tab-config-log"]', HTMLAnchorElement).addEventListener('shown.bs.tab', loadNotificationsLog);
  document.querySelector('a[href="#tab-config-twilio"]')?.addEventListener('shown.bs.tab', syncNotificacionEmailPreview);
  const bootApariencia = () => {
    initConfigApariencia(sistemaConfig.temaInterfaz, {
      empresa: sistemaConfig.empresa,
      logoUrl: sistemaConfig.logoUrl,
      onSaved: (tema) => {
        sistemaConfig.temaInterfaz = tema;
      }
    });
  };

  document.querySelector('a[href="#tab-config-apariencia"]')?.addEventListener('shown.bs.tab', () => {
    bootApariencia();
  });
  document.querySelector('a[href="#tab-config-auditoria"]')?.addEventListener('shown.bs.tab', () => {
    initAuditLogTab();
  });

  // Inicialización
  await loadConfig();
  initNotificacionEmailPreview();
  bootApariencia();
  const retryEvents = new AbortController();
  const dirtyFields = new WeakSet<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>();
  const markDirty = (event: Event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) dirtyFields.add(event.target);
  };
  container.addEventListener('input', markDirty, { signal: retryEvents.signal });
  container.addEventListener('change', markDirty, { signal: retryEvents.signal });
  window.addEventListener('hashchange', () => retryEvents.abort(), { once: true, signal: retryEvents.signal });
  window.addEventListener('erp:retry-read', async () => {
    const activeTab = container.querySelector<HTMLElement>('.nav-tabs .nav-link.active');
    if (activeTab?.getAttribute('href') !== '#tab-config-general') {
      activeTab?.dispatchEvent(new Event('shown.bs.tab', { bubbles: true }));
      return;
    }
    const fields = Array.from(container.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input:not([type="file"]),select,textarea'));
    const draft = fields.filter(field => dirtyFields.has(field)).map(field => ({ field, value: field.value, checked: field instanceof HTMLInputElement ? field.checked : false }));
    await loadConfig();
    for (const { field, value, checked } of draft) if (field.isConnected) { field.value = value; if (field instanceof HTMLInputElement) field.checked = checked; }
  }, { signal: retryEvents.signal });

  const configParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
  if (configParams.get('tab') === 'auditoria') {
    const auditTab = document.querySelector('a[href="#tab-config-auditoria"]');
    if (auditTab) {
      bootstrap.Tab.getOrCreateInstance(auditTab).show();
      await initAuditLogTab();
    }
  }
}
