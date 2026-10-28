interface RmaDTO { id: string; numero: string; serie: string; producto?: { nombre: string }; cliente?: { nombre: string }; dentroDeGarantia: boolean; estado: string; createdAt: string; }
interface RmaLookup { producto?: { nombre: string }; cliente?: { nombre: string }; estadoSerie: string; fechaVenta: string | null; fechaVenceGarantia: string | null; diasGarantia: number; dentroDeGarantia: boolean; }
import { requireElement } from '../utils/dom.js';
import { errorMessage } from '../utils/errors.js';
import { watchDataChanges } from '../utils/live-data.js';
import { apiFetch } from '../api.js';
import { requireUsuario } from '../auth.js';
import { showToast } from '../utils/toast.js';
import { erpHeader } from '../utils/module-shell.js';

const ESTADOS = [
  { value: 'abierto', label: 'Abierto' },
  { value: 'en_revision', label: 'En revisión' },
  { value: 'aprobado', label: 'Aprobado' },
  { value: 'rechazado', label: 'Rechazado' },
  { value: 'cerrado', label: 'Cerrado' }
];

function fmtDate(v: string | null | undefined) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleDateString('es-CO');
  } catch {
    return '—';
  }
}

export async function initRma(container: HTMLElement) {
  const usuario = requireUsuario();
  let reclamos: RmaDTO[] = [];
  let lookup: RmaLookup | null = null;

  async function loadList() {
    try {
      reclamos = (await apiFetch<RmaDTO[]>('/rma')) ?? [];
    } catch (err) {
      showToast('Error', errorMessage(err) || 'No se pudieron cargar los reclamos.', 'error');
      reclamos = [];
    }
  }

  function renderTable() {
    const body = requireElement('rma-table-body', HTMLTableSectionElement);
    if (!body) return;
    if (!reclamos.length) {
      body.innerHTML = `<tr><td colspan="7" class="text-secondary text-center py-4">No hay reclamos de garantía registrados.</td></tr>`;
      return;
    }
    body.innerHTML = reclamos.map((r) => `
      <tr>
        <td><strong>${r.numero}</strong></td>
        <td><code>${r.serie}</code></td>
        <td>${r.producto?.nombre || '—'}</td>
        <td>${r.cliente?.nombre || '—'}</td>
        <td>
          <span class="badge ${r.dentroDeGarantia ? 'bg-green-lt' : 'bg-orange-lt'}">
            ${r.dentroDeGarantia ? 'En garantía' : 'Fuera'}
          </span>
        </td>
        <td>
          <select class="form-select form-select-sm rma-estado" data-id="${r.id}">
            ${ESTADOS.map((e) => `<option value="${e.value}" ${r.estado === e.value ? 'selected' : ''}>${e.label}</option>`).join('')}
          </select>
        </td>
        <td class="text-secondary small">${fmtDate(r.createdAt)}</td>
      </tr>
    `).join('');

    body.querySelectorAll('.rma-estado').forEach((sel) => {
      sel.addEventListener('change', async (e) => {
        if (!(e.currentTarget instanceof HTMLSelectElement)) return;
        const id = e.currentTarget.dataset.id;
        if (!id) return;
        try {
          await apiFetch(`/rma/${id}/estado`, {
            method: 'PUT',
            body: JSON.stringify({ estado: e.currentTarget.value })
          });
          showToast('Éxito', 'Estado del reclamo actualizado.', 'success');
        } catch (err) {
          showToast('Error', errorMessage(err) || 'No se pudo actualizar.', 'error');
          await loadList();
          renderTable();
        }
      });
    });
  }

  await loadList();

  container.innerHTML = `
    <div class="container-xl erp-module">
      ${erpHeader({
        eyebrow: 'Postventa',
        title: 'Garantía / RMA',
        subtitle: 'Reclamos por IMEI o número de serie'
      })}

      <div class="row g-3">
        <div class="col-lg-5">
          <div class="card">
            <div class="card-body">
              <h3 class="card-title">Consultar serie / IMEI</h3>
              <div class="input-group mb-3">
                <input type="text" id="rma-serie" class="form-control" placeholder="Escanee o escriba el IMEI…" spellcheck="false">
                <button type="button" class="btn btn-primary" id="btn-rma-lookup">Buscar</button>
              </div>
              <div id="rma-lookup-result" class="text-secondary small">Ingrese una serie vendida para validar garantía.</div>
              <hr>
              <form id="form-rma">
                <div class="mb-2">
                  <label class="form-label">Motivo del reclamo</label>
                  <textarea id="rma-motivo" class="form-control" rows="3" required placeholder="Describe el fallo reportado por el cliente"></textarea>
                </div>
                <div class="mb-3">
                  <label class="form-label">Observaciones</label>
                  <textarea id="rma-obs" class="form-control" rows="2"></textarea>
                </div>
                <button type="submit" class="btn btn-primary w-100" id="btn-rma-crear" disabled>
                  Registrar reclamo RMA
                </button>
              </form>
            </div>
          </div>
        </div>
        <div class="col-lg-7">
          <div class="card">
            <div class="table-responsive">
              <table class="table table-vcenter card-table mb-0">
                <thead>
                  <tr>
                    <th>No.</th>
                    <th>Serie</th>
                    <th>Producto</th>
                    <th>Cliente</th>
                    <th>Garantía</th>
                    <th>Estado</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody id="rma-table-body"></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  renderTable();

  requireElement('btn-rma-lookup', HTMLButtonElement).addEventListener('click', async () => {
    const serie = requireElement('rma-serie', HTMLInputElement).value.trim();
    const box = requireElement('rma-lookup-result', HTMLDivElement);
    const btnCrear = requireElement('btn-rma-crear', HTMLButtonElement);
    if (!serie) {
      showToast('Aviso', 'Indique un IMEI o serie.', 'warning');
      return;
    }
    try {
      lookup = await apiFetch<RmaLookup>(`/rma/lookup?serie=${encodeURIComponent(serie)}`);
      if (!lookup) throw new Error("No se encontró la serie.");
      box.innerHTML = `
        <div class="alert ${lookup.dentroDeGarantia ? 'alert-success' : 'alert-warning'} mb-0">
          <div><strong>${lookup.producto?.nombre || 'Producto'}</strong> — estado serie: ${lookup.estadoSerie}</div>
          <div>Cliente: ${lookup.cliente?.nombre || '—'}</div>
          <div>Venta: ${fmtDate(lookup.fechaVenta)} · Garantía ${lookup.diasGarantia} días (vence ${fmtDate(lookup.fechaVenceGarantia)})</div>
          <div class="mt-1">${lookup.dentroDeGarantia ? 'Dentro de garantía' : 'Fuera de garantía (puede registrarse igual)'}</div>
        </div>
      `;
      btnCrear.disabled = false;
    } catch (err) {
      lookup = null;
      btnCrear.disabled = true;
      box.innerHTML = `<div class="text-danger">${errorMessage(err) || 'No encontrada'}</div>`;
    }
  });

  requireElement('form-rma', HTMLFormElement).addEventListener('submit', async (e) => {
    e.preventDefault();
    const serie = requireElement('rma-serie', HTMLInputElement).value.trim();
    const motivo = requireElement('rma-motivo', HTMLTextAreaElement).value.trim();
    const observaciones = requireElement('rma-obs', HTMLTextAreaElement).value.trim();
    if (!serie || !motivo) {
      showToast('Aviso', 'Serie y motivo son obligatorios.', 'warning');
      return;
    }
    try {
      await apiFetch('/rma', {
        method: 'POST',
        body: JSON.stringify({
          serie,
          motivo,
          observaciones,
          sedeId: usuario.sedeId,
          diasGarantia: lookup?.diasGarantia
        })
      });
      showToast('Éxito', 'Reclamo RMA registrado.', 'success');
      requireElement('rma-motivo', HTMLTextAreaElement).value = '';
      requireElement('rma-obs', HTMLTextAreaElement).value = '';
      await loadList();
      renderTable();
    } catch (err) {
      showToast('Error', errorMessage(err) || 'No se pudo crear el reclamo.', 'error');
    }
  });
  watchDataChanges(container, ["rma","ventas","series"], async () => {
    await loadList(); renderTable();
  });

}
