import { apiFetch } from '../api.js';
import { getUsuario } from '../auth.js';
import { erpHeader } from '../utils/module-shell.js';
import { showToast } from '../utils/toast.js';

const fmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

const ESTADO_LABEL = {
  borrador: 'Borrador',
  en_proceso: 'En proceso',
  entregada: 'Entregada',
  cancelada: 'Cancelada'
};

const ESTADO_BADGE = {
  borrador: 'bg-secondary-lt',
  en_proceso: 'bg-azure-lt',
  entregada: 'bg-success-lt',
  cancelada: 'bg-danger-lt'
};

export async function initInstalaciones(container) {
  const usuario = getUsuario();
  const canWrite = ['admin', 'superadmin', 'gerente_sede', 'tecnico'].includes(usuario.rol);
  const needsSedePicker = !usuario.sedeId || ['admin', 'superadmin'].includes(usuario.rol);

  let ordenes = [];
  let clientes = [];
  let tecnicos = [];
  let productos = [];
  let sedes = [];
  let filtroEstado = '';
  let filtroBuscar = '';

  async function loadData() {
    ordenes = await apiFetch('/instalaciones').catch(() => []);
    clientes = await apiFetch('/clientes').catch(() => []);
    tecnicos = await apiFetch('/config/usuarios-operativos?rol=tecnico').catch(() => []);
    productos = (await apiFetch('/productos').catch(() => [])).filter((p) => p.activo !== false && !p.esServicio);
    if (needsSedePicker) {
      sedes = await apiFetch('/config/sedes').catch(() => []);
    }
  }

  await loadData();
  const defaultSedeId = usuario.sedeId || (sedes[0]?.id || '');

  container.innerHTML = `
    <div class="container-xl erp-module">
      ${erpHeader({
        eyebrow: 'Campo',
        title: 'Instalaciones',
        subtitle: 'Materiales del inventario + mano de obra en sitio',
        actionsHtml: canWrite ? `
          <button type="button" id="btn-nueva-instalacion" class="btn btn-primary">
            <i class="ti ti-plus me-2"></i> Nueva instalación
          </button>
        ` : ''
      })}

      <div class="card mb-3">
        <div class="card-body py-3">
          <div class="row g-2 align-items-end">
            <div class="col-md-5">
              <label class="form-label">Buscar</label>
              <input type="search" id="inst-buscar" class="form-control" placeholder="Orden, sitio o cliente…" autocomplete="off">
            </div>
            <div class="col-md-3">
              <label class="form-label">Estado</label>
              <select id="inst-filtro-estado" class="form-select">
                <option value="">Todos</option>
                <option value="borrador">Borrador</option>
                <option value="en_proceso">En proceso</option>
                <option value="entregada">Entregada</option>
                <option value="cancelada">Cancelada</option>
              </select>
            </div>
            <div class="col-md-2">
              <button type="button" id="inst-btn-filtrar" class="btn btn-outline-primary w-100">Filtrar</button>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="table-responsive">
          <table class="table table-vcenter card-table table-hover mb-0">
            <thead>
              <tr>
                <th>Orden</th>
                <th>Cliente</th>
                <th>Sitio</th>
                <th>Sede</th>
                <th>Estado</th>
                <th class="text-end">Total</th>
                <th class="w-1"></th>
              </tr>
            </thead>
            <tbody id="inst-table-body"></tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="modal modal-blur fade" id="modal-nueva-instalacion" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-centered" role="document">
        <form id="form-nueva-instalacion" class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Nueva orden de instalación</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <div class="row g-3">
              <div class="col-md-6">
                <label class="form-label required">Cliente</label>
                <select id="inst-cliente" class="form-select" required>
                  <option value="">— Seleccionar —</option>
                  ${clientes.map((c) => `<option value="${c.id}">${c.nombre}${c.documento ? ` (${c.documento})` : ''}</option>`).join('')}
                </select>
              </div>
              ${needsSedePicker ? `
              <div class="col-md-6">
                <label class="form-label required">Sede</label>
                <select id="inst-sede" class="form-select" required>
                  ${sedes.map((s) => `<option value="${s.id}" ${s.id === defaultSedeId ? 'selected' : ''}>${s.nombre}</option>`).join('')}
                </select>
              </div>` : ''}
              <div class="col-md-6">
                <label class="form-label">Técnico</label>
                <select id="inst-tecnico" class="form-select">
                  <option value="">— Por asignar —</option>
                  ${tecnicos.map((t) => `<option value="${t.id}">${t.nombre}</option>`).join('')}
                </select>
              </div>
              <div class="col-md-6">
                <label class="form-label">Fecha programada</label>
                <input type="date" id="inst-fecha" class="form-control">
              </div>
              <div class="col-md-6">
                <label class="form-label">Sitio / proyecto</label>
                <input type="text" id="inst-sitio" class="form-control" placeholder="Ej: Casa cliente, local X">
              </div>
              <div class="col-md-6">
                <label class="form-label">Valor servicio ($)</label>
                <input type="number" id="inst-valor-servicio" class="form-control" min="0" step="1000" value="0" placeholder="Mano de obra">
              </div>
              <div class="col-12">
                <label class="form-label">Dirección</label>
                <input type="text" id="inst-direccion" class="form-control" placeholder="Dirección del sitio">
              </div>
              <div class="col-12">
                <label class="form-label">Descripción del trabajo</label>
                <textarea id="inst-descripcion" class="form-control" rows="2" placeholder="Ej: Instalación 5 cámaras + NVR"></textarea>
              </div>
              <div class="col-12">
                <label class="form-label">Observaciones</label>
                <input type="text" id="inst-obs" class="form-control">
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-link link-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="submit" class="btn btn-primary ms-auto">Crear orden</button>
          </div>
        </form>
      </div>
    </div>

    <div class="modal modal-blur fade" id="modal-detalle-instalacion" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable" role="document">
        <div class="modal-content" id="detalle-instalacion-content"></div>
      </div>
    </div>
  `;

  const modalNueva = new bootstrap.Modal(document.getElementById('modal-nueva-instalacion'));
  const modalDetalle = new bootstrap.Modal(document.getElementById('modal-detalle-instalacion'));

  function ordenesFiltradas() {
    return ordenes.filter((o) => {
      if (filtroEstado && o.estado !== filtroEstado) return false;
      if (!filtroBuscar) return true;
      const q = filtroBuscar.toLowerCase();
      return (
        (o.numeroOrden || '').toLowerCase().includes(q) ||
        (o.sitio || '').toLowerCase().includes(q) ||
        (o.cliente?.nombre || '').toLowerCase().includes(q)
      );
    });
  }

  function renderTabla() {
    const body = document.getElementById('inst-table-body');
    const list = ordenesFiltradas();
    if (!list.length) {
      body.innerHTML = `<tr><td colspan="7" class="text-center text-secondary py-4">No hay órdenes de instalación.</td></tr>`;
      return;
    }
    body.innerHTML = list.map((o) => `
      <tr>
        <td><span class="fw-bold">${o.numeroOrden}</span></td>
        <td>${o.cliente?.nombre || '—'}</td>
        <td>${o.sitio || '—'}</td>
        <td>${o.sede?.nombre || '—'}</td>
        <td><span class="badge ${ESTADO_BADGE[o.estado] || 'bg-secondary-lt'}">${ESTADO_LABEL[o.estado] || o.estado}</span></td>
        <td class="text-end">${fmt.format(parseFloat(o.totalCobrado) || 0)}</td>
        <td>
          <button type="button" class="btn btn-sm btn-ghost-primary btn-ver-inst" data-id="${o.id}">
            Abrir
          </button>
        </td>
      </tr>
    `).join('');

    body.querySelectorAll('.btn-ver-inst').forEach((btn) => {
      btn.addEventListener('click', () => abrirDetalle(btn.dataset.id));
    });
  }

  async function abrirDetalle(id) {
    const content = document.getElementById('detalle-instalacion-content');
    content.innerHTML = `<div class="p-5 text-center"><div class="spinner-border text-primary"></div></div>`;
    modalDetalle.show();

    try {
      const orden = await apiFetch(`/instalaciones/${id}`);
      const locked = ['entregada', 'cancelada'].includes(orden.estado);
      const materiales = orden.materiales || [];

      content.innerHTML = `
        <div class="modal-header">
          <div>
            <h5 class="modal-title mb-0">${orden.numeroOrden}</h5>
            <div class="text-secondary small">${orden.cliente?.nombre || ''} · ${orden.sede?.nombre || ''}</div>
          </div>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div class="row g-3 mb-3">
            <div class="col-md-3">
              <div class="text-secondary small">Estado</div>
              <span class="badge ${ESTADO_BADGE[orden.estado]}">${ESTADO_LABEL[orden.estado]}</span>
            </div>
            <div class="col-md-3">
              <div class="text-secondary small">Técnico</div>
              <div>${orden.tecnico?.nombre || 'Sin asignar'}</div>
            </div>
            <div class="col-md-3">
              <div class="text-secondary small">Sitio</div>
              <div>${orden.sitio || '—'}</div>
            </div>
            <div class="col-md-3">
              <div class="text-secondary small">Dirección</div>
              <div>${orden.direccion || '—'}</div>
            </div>
          </div>

          ${canWrite && !locked ? `
          <div class="card mb-3">
            <div class="card-body">
              <div class="row g-2 align-items-end">
                <div class="col-md-3">
                  <label class="form-label">Valor servicio ($)</label>
                  <input type="number" id="det-valor-servicio" class="form-control" min="0" step="1000" value="${parseFloat(orden.valorServicio) || 0}">
                </div>
                <div class="col-md-3">
                  <label class="form-label">Técnico</label>
                  <select id="det-tecnico" class="form-select">
                    <option value="">— Por asignar —</option>
                    ${tecnicos.map((t) => `<option value="${t.id}" ${orden.tecnicoId === t.id ? 'selected' : ''}>${t.nombre}</option>`).join('')}
                  </select>
                </div>
                <div class="col-md-4">
                  <label class="form-label">Observaciones</label>
                  <input type="text" id="det-obs" class="form-control" value="${(orden.observaciones || '').replace(/"/g, '&quot;')}">
                </div>
                <div class="col-md-2">
                  <button type="button" class="btn btn-outline-primary w-100" id="btn-guardar-inst">Guardar</button>
                </div>
              </div>
            </div>
          </div>
          ` : `
          <div class="alert alert-info mb-3">
            Servicio: <strong>${fmt.format(parseFloat(orden.valorServicio) || 0)}</strong>
            · Materiales (costo): <strong>${fmt.format(parseFloat(orden.costoMateriales) || 0)}</strong>
            · Total: <strong>${fmt.format(parseFloat(orden.totalCobrado) || 0)}</strong>
          </div>
          `}

          <div class="d-flex justify-content-between align-items-center mb-2">
            <h4 class="mb-0">Materiales</h4>
            <div class="text-secondary small">Descuenta stock de la sede al agregar</div>
          </div>
          <div class="table-responsive mb-3">
            <table class="table table-sm table-vcenter">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th class="text-center">Cant.</th>
                  <th>Series</th>
                  <th class="text-end">Costo u.</th>
                  <th class="w-1"></th>
                </tr>
              </thead>
              <tbody>
                ${materiales.length ? materiales.map((m) => `
                  <tr>
                    <td>${m.producto?.nombre || '—'}</td>
                    <td class="text-center">${m.cantidad}</td>
                    <td class="small">${Array.isArray(m.series) && m.series.length ? m.series.join(', ') : '—'}</td>
                    <td class="text-end">${fmt.format(parseFloat(m.costoUnitario) || 0)}</td>
                    <td>
                      ${canWrite && !locked ? `
                        <button type="button" class="btn btn-sm btn-ghost-danger btn-rm-mat" data-mid="${m.id}" title="Revertir al inventario">
                          <i class="ti ti-trash"></i>
                        </button>` : ''}
                    </td>
                  </tr>
                `).join('') : `<tr><td colspan="5" class="text-center text-secondary py-3">Sin materiales aún.</td></tr>`}
              </tbody>
            </table>
          </div>

          ${canWrite && !locked ? `
          <div class="card bg-light-lt">
            <div class="card-body">
              <h4 class="mb-3">Agregar material</h4>
              <div class="row g-2 align-items-end">
                <div class="col-md-5">
                  <label class="form-label">Producto</label>
                  <select id="mat-producto" class="form-select">
                    <option value="">— Seleccionar —</option>
                    ${productos.map((p) => `<option value="${p.id}" data-serie="${p.tieneNumeroSerie ? '1' : '0'}">${p.nombre}</option>`).join('')}
                  </select>
                </div>
                <div class="col-md-2">
                  <label class="form-label">Cantidad</label>
                  <input type="number" id="mat-cantidad" class="form-control" min="1" value="1">
                </div>
                <div class="col-md-3" id="mat-series-wrap" style="display:none">
                  <label class="form-label">Series / IMEI</label>
                  <input type="text" id="mat-series" class="form-control" placeholder="Separadas por coma">
                </div>
                <div class="col-md-2">
                  <button type="button" class="btn btn-primary w-100" id="btn-add-mat">Agregar</button>
                </div>
              </div>
              <p class="form-hint mb-0 mt-2">Si el producto lleva serie, indique exactamente la misma cantidad de series.</p>
            </div>
          </div>
          ` : ''}

          <div class="mt-3 d-flex justify-content-end gap-3 fw-bold">
            <span>Servicio: ${fmt.format(parseFloat(orden.valorServicio) || 0)}</span>
            <span>Materiales: ${fmt.format(parseFloat(orden.costoMateriales) || 0)}</span>
            <span class="text-primary">Total: ${fmt.format(parseFloat(orden.totalCobrado) || 0)}</span>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-link link-secondary" data-bs-dismiss="modal">Cerrar</button>
          ${canWrite && !locked ? `
            <button type="button" class="btn btn-success" id="btn-cerrar-inst">
              <i class="ti ti-check me-1"></i> Marcar entregada
            </button>
          ` : ''}
        </div>
      `;

      const matSelect = document.getElementById('mat-producto');
      const seriesWrap = document.getElementById('mat-series-wrap');
      if (matSelect) {
        matSelect.addEventListener('change', () => {
          const opt = matSelect.selectedOptions[0];
          seriesWrap.style.display = opt?.dataset.serie === '1' ? '' : 'none';
        });
      }

      document.getElementById('btn-guardar-inst')?.addEventListener('click', async () => {
        try {
          await apiFetch(`/instalaciones/${id}`, {
            method: 'PUT',
            body: JSON.stringify({
              valorServicio: document.getElementById('det-valor-servicio').value,
              tecnicoId: document.getElementById('det-tecnico').value || null,
              observaciones: document.getElementById('det-obs').value
            })
          });
          showToast('Éxito', 'Orden actualizada.', 'success');
          await loadData();
          renderTabla();
          abrirDetalle(id);
        } catch (err) {
          showToast('Error', err.message, 'error');
        }
      });

      document.getElementById('btn-add-mat')?.addEventListener('click', async () => {
        const productoId = document.getElementById('mat-producto').value;
        const cantidad = parseInt(document.getElementById('mat-cantidad').value, 10);
        const seriesRaw = document.getElementById('mat-series')?.value || '';
        const series = seriesRaw.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
        if (!productoId || !cantidad) {
          showToast('Aviso', 'Seleccione producto y cantidad.', 'warning');
          return;
        }
        try {
          const payload = { productoId, cantidad };
          if (series.length) payload.series = series;
          await apiFetch(`/instalaciones/${id}/materiales`, {
            method: 'POST',
            body: JSON.stringify(payload)
          });
          showToast('Éxito', 'Material descontado del inventario.', 'success');
          await loadData();
          renderTabla();
          abrirDetalle(id);
        } catch (err) {
          showToast('Error', err.message, 'error');
        }
      });

      content.querySelectorAll('.btn-rm-mat').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm('¿Revertir este material al inventario?')) return;
          try {
            await apiFetch(`/instalaciones/${id}/materiales/${btn.dataset.mid}`, { method: 'DELETE' });
            showToast('Éxito', 'Material revertido.', 'success');
            await loadData();
            renderTabla();
            abrirDetalle(id);
          } catch (err) {
            showToast('Error', err.message, 'error');
          }
        });
      });

      document.getElementById('btn-cerrar-inst')?.addEventListener('click', async () => {
        if (!confirm('¿Marcar esta instalación como entregada?')) return;
        try {
          await apiFetch(`/instalaciones/${id}/cerrar`, { method: 'POST', body: '{}' });
          showToast('Éxito', 'Instalación entregada.', 'success');
          await loadData();
          renderTabla();
          abrirDetalle(id);
        } catch (err) {
          showToast('Error', err.message, 'error');
        }
      });
    } catch (err) {
      content.innerHTML = `<div class="p-4 text-danger">${err.message}</div>`;
    }
  }

  document.getElementById('btn-nueva-instalacion')?.addEventListener('click', () => {
    document.getElementById('form-nueva-instalacion').reset();
    modalNueva.show();
  });

  document.getElementById('form-nueva-instalacion').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.submitter;
    btn.disabled = true;
    try {
      const payload = {
        clienteId: document.getElementById('inst-cliente').value,
        tecnicoId: document.getElementById('inst-tecnico').value || null,
        sitio: document.getElementById('inst-sitio').value || null,
        direccion: document.getElementById('inst-direccion').value || null,
        descripcion: document.getElementById('inst-descripcion').value || null,
        valorServicio: document.getElementById('inst-valor-servicio').value || 0,
        fechaProgramada: document.getElementById('inst-fecha').value || null,
        observaciones: document.getElementById('inst-obs').value || null
      };
      if (needsSedePicker) {
        payload.sedeId = document.getElementById('inst-sede').value;
      }
      const creada = await apiFetch('/instalaciones', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      modalNueva.hide();
      showToast('Éxito', `Orden ${creada.numeroOrden} creada.`, 'success');
      await loadData();
      renderTabla();
      abrirDetalle(creada.id);
    } catch (err) {
      showToast('Error', err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('inst-btn-filtrar').addEventListener('click', () => {
    filtroEstado = document.getElementById('inst-filtro-estado').value;
    filtroBuscar = document.getElementById('inst-buscar').value.trim();
    renderTabla();
  });

  document.getElementById('inst-buscar').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('inst-btn-filtrar').click();
    }
  });

  renderTabla();
}
