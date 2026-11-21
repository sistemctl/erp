import { apiFetch } from '../api.js';
import type { StockInventario } from '../types/inventory.js';
import { escapeHtml } from './html.js';
import { errorMessage } from './errors.js';
import { showToast, showConfirm } from './toast.js';
import { printBarcodeLabels } from './barcode-label.js';

/**
 * Herramientas de catálogo en bloque (Inventario):
 * - Edición rápida: costo, venta, stock mínimo y código en una tabla, sin abrir producto por producto.
 * - Códigos internos: asigna códigos escaneables a los productos cuyo "código" es una descripción
 *   y permite imprimir sus etiquetas.
 */

/** Misma regla que el servidor (productos.controller codigoNoEscaneable). */
export function codigoNoEscaneable(codigo: unknown): boolean {
  const texto = String(codigo ?? '').trim();
  return !texto || /\s/.test(texto) || /[a-z]/.test(texto);
}

function crearModal(id: string, html: string): { el: HTMLDivElement; modal: ReturnType<typeof bootstrap.Modal.getOrCreateInstance> } {
  document.getElementById(id)?.remove();
  const el = document.createElement('div');
  el.className = 'modal fade';
  el.id = id;
  el.tabIndex = -1;
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = html;
  document.body.append(el);
  el.addEventListener('hidden.bs.modal', () => el.remove());
  return { el, modal: bootstrap.Modal.getOrCreateInstance(el) };
}

type Campo = 'codigoBarras' | 'precioCosto' | 'precioVenta' | 'stockMinimo';

// ---------------------------------------------------------------------------
// Edición rápida
// ---------------------------------------------------------------------------

export function abrirEdicionRapida({ productos, alGuardar }: { productos: readonly StockInventario[]; alGuardar: () => unknown }): void {
  const filas = productos.filter(item => item.producto);
  if (!filas.length) {
    showToast('Sin productos', 'No hay productos en la vista actual. Ajuste los filtros.', 'warning');
    return;
  }

  const fila = (item: StockInventario) => {
    const p = item.producto;
    const ud = p.unidadMedida === 'm' ? 'm' : 'und';
    const combo = !!p.esCombo;
    const servicio = !!p.esServicio;
    const bloqueo = combo ? 'disabled title="Combo: su costo se calcula con los componentes. Edítelo en la ficha."' : '';
    const input = (campo: Campo, valor: unknown, attrs: string, extra = '') =>
      `<input class="form-control form-control-sm" data-campo="${campo}" data-orig="${escapeHtml(valor ?? '')}" value="${escapeHtml(valor ?? '')}" ${attrs} ${extra}>`;
    return `<tr data-id="${escapeHtml(p.id)}" data-ud="${ud}" data-fisico="${!combo && !servicio}">
      <td class="cr-producto">
        <div class="fw-semibold text-truncate" title="${escapeHtml(p.nombre)}">${escapeHtml(p.nombre)}</div>
        <div class="small text-secondary">${escapeHtml(p.categoria?.nombre || '')}${combo ? ' · Combo' : servicio ? ' · Servicio' : ''} · por ${ud}</div>
      </td>
      <td>${input('codigoBarras', p.codigoBarras, 'type="text" autocomplete="off" spellcheck="false" data-numfmt="off" aria-label="Código"', bloqueo)}</td>
      <td>${input('precioCosto', Number(p.precioCosto) || 0, 'type="number" step="0.01" min="0" aria-label="Costo"', bloqueo)}</td>
      <td>${input('precioVenta', Number(p.precioVenta) || 0, 'type="number" step="0.01" min="0" aria-label="Venta"', bloqueo)}</td>
      <td>${input('stockMinimo', Number(p.stockMinimo) || 0, 'type="number" step="1" min="0" aria-label="Stock mínimo"', combo || servicio ? 'disabled title="No aplica a combos ni servicios"' : '')}</td>
      <td class="cr-estado small" aria-live="polite"></td>
    </tr>`;
  };

  const { el, modal } = crearModal('modal-edicion-rapida', `
    <div class="modal-dialog modal-xl modal-dialog-scrollable modal-fullscreen-lg-down">
      <div class="modal-content">
        <div class="modal-header">
          <div>
            <h2 class="modal-title h3">Edición rápida · ${filas.length} producto${filas.length === 1 ? '' : 's'}</h2>
            <div class="small text-secondary">Escriba y pase con Tab; Enter baja a la fila siguiente. Solo se guardan las filas modificadas. Costo y venta van por unidad o por metro según el producto.</div>
          </div>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
        </div>
        <div class="modal-body p-0">
          <div class="table-responsive">
            <table class="table table-vcenter card-table mb-0 cr-tabla" data-mobile-kind="analysis">
              <thead class="sticky-top"><tr>
                <th>Producto</th><th style="min-width:150px">Código</th><th style="min-width:120px">Costo</th>
                <th style="min-width:120px">Venta</th><th style="min-width:90px">Stock mín.</th><th style="min-width:110px">Estado</th>
              </tr></thead>
              <tbody>${filas.map(fila).join('')}</tbody>
            </table>
          </div>
        </div>
        <div class="modal-footer">
          <span class="me-auto text-secondary" data-cr-contador>Sin cambios</span>
          <button type="button" class="btn btn-link link-secondary" data-bs-dismiss="modal">Cerrar</button>
          <button type="button" class="btn btn-primary" data-cr-guardar disabled><i class="ti ti-device-floppy me-1"></i>Guardar cambios</button>
        </div>
      </div>
    </div>`);

  const tbody = el.querySelector('tbody')!;
  const contador = el.querySelector<HTMLElement>('[data-cr-contador]')!;
  const guardar = el.querySelector<HTMLButtonElement>('[data-cr-guardar]')!;
  let guardando = false;
  let cerrarSinPreguntar = false;

  const inputs = (tr: Element) => Array.from(tr.querySelectorAll<HTMLInputElement>('input[data-campo]'));
  const valor = (input: HTMLInputElement) => input.dataset.campo === 'codigoBarras' ? input.value.trim() : String(Number(input.value || 0));
  const original = (input: HTMLInputElement) => input.dataset.campo === 'codigoBarras' ? String(input.dataset.orig ?? '').trim() : String(Number(input.dataset.orig || 0));
  const cambiados = (tr: Element) => inputs(tr).filter(input => !input.disabled && valor(input) !== original(input));
  const filasSucias = () => Array.from(tbody.rows).filter(tr => cambiados(tr).length > 0);

  // Avisos por fila: los mismos criterios que "Por completar".
  const revisarFila = (tr: HTMLTableRowElement) => {
    const get = (campo: Campo) => tr.querySelector<HTMLInputElement>(`input[data-campo="${campo}"]`)!;
    const costo = Number(get('precioCosto').value || 0);
    const venta = Number(get('precioVenta').value || 0);
    const fisico = tr.dataset.fisico === 'true';
    get('precioCosto').classList.toggle('is-invalid', fisico && costo > 0 && venta > 0 && costo > venta);
    get('precioCosto').title = fisico && costo > venta && venta > 0
      ? (tr.dataset.ud === 'm' ? 'El costo por metro supera la venta: ¿es el costo del rollo completo?' : 'El costo supera el precio de venta')
      : '';
    get('precioVenta').classList.toggle('cr-alerta', venta <= 1);
    get('precioVenta').title = venta <= 1 ? 'Precio provisional de $1 o menos' : '';
    get('codigoBarras').classList.toggle('cr-alerta', codigoNoEscaneable(get('codigoBarras').value));
    get('codigoBarras').title = codigoNoEscaneable(get('codigoBarras').value) ? 'Código no escaneable: use Más → Códigos escaneables' : '';
    get('precioCosto').classList.toggle('cr-alerta', fisico && costo <= 0);
    for (const input of inputs(tr)) input.classList.toggle('cr-cambiado', !input.disabled && valor(input) !== original(input));
  };

  const actualizarContador = () => {
    const n = filasSucias().length;
    contador.textContent = n ? `${n} producto${n === 1 ? '' : 's'} con cambios sin guardar` : 'Sin cambios';
    guardar.disabled = !n || guardando;
  };

  for (const tr of Array.from(tbody.rows)) revisarFila(tr);

  tbody.addEventListener('input', (e) => {
    const tr = (e.target as Element).closest('tr');
    if (!tr) return;
    const estado = tr.querySelector<HTMLElement>('.cr-estado');
    if (estado) { estado.textContent = ''; estado.className = 'cr-estado small'; }
    revisarFila(tr);
    actualizarContador();
  });

  // Enter: misma columna en la fila siguiente (como una hoja de cálculo).
  tbody.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !(e.target instanceof HTMLInputElement)) return;
    e.preventDefault();
    const campo = e.target.dataset.campo;
    let tr = e.target.closest('tr')?.nextElementSibling;
    while (tr) {
      const siguiente = tr.querySelector<HTMLInputElement>(`input[data-campo="${campo}"]:not(:disabled)`);
      if (siguiente) { siguiente.focus(); siguiente.select(); return; }
      tr = tr.nextElementSibling;
    }
  });

  guardar.addEventListener('click', async () => {
    const sucias = filasSucias();
    if (!sucias.length) return;
    // Validación previa: ningún número negativo ni código vacío.
    for (const tr of sucias) {
      for (const input of cambiados(tr)) {
        const bad = input.dataset.campo === 'codigoBarras' ? !input.value.trim() : !(Number(input.value) >= 0);
        if (bad) {
          input.focus();
          showToast('Revise el valor', input.dataset.campo === 'codigoBarras' ? 'El código no puede quedar vacío.' : 'Los valores no pueden ser negativos.', 'warning');
          return;
        }
      }
    }
    guardando = true;
    guardar.disabled = true;
    let ok = 0, fallos = 0;
    for (const tr of sucias) {
      const estado = tr.querySelector<HTMLElement>('.cr-estado')!;
      estado.className = 'cr-estado small text-secondary';
      estado.textContent = 'Guardando…';
      const body: Partial<Record<Campo, string | number>> = {};
      for (const input of cambiados(tr)) {
        const campo = input.dataset.campo as Campo;
        body[campo] = campo === 'codigoBarras' ? input.value.trim() : campo === 'stockMinimo' ? Math.trunc(Number(input.value)) : Number(input.value);
      }
      try {
        await apiFetch(`/productos/${tr.dataset.id}`, { method: 'PUT', body: JSON.stringify(body), silent: true });
        for (const input of inputs(tr)) input.dataset.orig = input.value;
        revisarFila(tr as HTMLTableRowElement);
        estado.className = 'cr-estado small text-success';
        estado.innerHTML = '<i class="ti ti-check"></i> Guardado';
        ok++;
      } catch (err) {
        estado.className = 'cr-estado small text-danger';
        estado.textContent = errorMessage(err);
        fallos++;
      }
    }
    guardando = false;
    actualizarContador();
    await alGuardar();
    if (fallos) {
      showToast('Guardado con errores', `${ok} producto(s) guardado(s); ${fallos} con error. Revise la columna Estado.`, 'warning');
    } else {
      showToast('Catálogo actualizado', `${ok} producto(s) guardado(s).`, 'success');
    }
  });

  // No perder cambios al cerrar sin guardar.
  el.addEventListener('hide.bs.modal', (e) => {
    if (cerrarSinPreguntar || guardando || !filasSucias().length) return;
    e.preventDefault();
    void showConfirm('Cambios sin guardar', `Hay ${filasSucias().length} producto(s) con cambios sin guardar. ¿Cerrar y descartarlos?`).then(si => {
      if (si) { cerrarSinPreguntar = true; modal.hide(); }
    });
  });

  modal.show();
  el.addEventListener('shown.bs.modal', () => tbody.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus(), { once: true });
}

// ---------------------------------------------------------------------------
// Códigos internos en bloque
// ---------------------------------------------------------------------------

interface CodigoAsignado { id: string; nombre: string; codigoAnterior: string; codigoBarras: string; precioVenta: string | number }

export function abrirCodigosInternos({ productos, alGuardar }: { productos: readonly StockInventario[]; alGuardar: () => unknown }): void {
  const candidatos = productos.filter(item => item.producto && codigoNoEscaneable(item.producto.codigoBarras));
  if (!candidatos.length) {
    showToast('Todo en orden', 'Todos los productos de la vista tienen un código escaneable.', 'success');
    return;
  }

  const { el, modal } = crearModal('modal-codigos-internos', `
    <div class="modal-dialog modal-lg modal-dialog-scrollable modal-fullscreen-md-down">
      <div class="modal-content">
        <div class="modal-header">
          <div>
            <h2 class="modal-title h3">Códigos escaneables</h2>
            <div class="small text-secondary">${candidatos.length} producto(s) tienen como código un texto que el lector no puede leer. Se les asigna un código interno (29…) y el texto actual se guarda al inicio de su descripción.</div>
          </div>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
        </div>
        <div class="modal-body p-0" data-ci-cuerpo>
          <div class="table-responsive">
            <table class="table table-vcenter card-table mb-0" data-mobile-kind="analysis">
              <thead><tr>
                <th class="w-1"><input class="form-check-input" type="checkbox" data-ci-todos checked aria-label="Seleccionar todos"></th>
                <th>Producto</th><th>Código actual</th>
              </tr></thead>
              <tbody>${candidatos.map(item => `<tr>
                <td><input class="form-check-input" type="checkbox" value="${escapeHtml(item.producto.id)}" checked aria-label="Incluir ${escapeHtml(item.producto.nombre)}"></td>
                <td class="fw-semibold">${escapeHtml(item.producto.nombre)}</td>
                <td><code>${escapeHtml(item.producto.codigoBarras || '(vacío)')}</code></td>
              </tr>`).join('')}</tbody>
            </table>
          </div>
        </div>
        <div class="modal-footer">
          <span class="me-auto text-secondary" data-ci-contador></span>
          <button type="button" class="btn btn-link link-secondary" data-bs-dismiss="modal">Cerrar</button>
          <button type="button" class="btn btn-primary" data-ci-generar><i class="ti ti-barcode me-1"></i>Asignar códigos</button>
        </div>
      </div>
    </div>`);

  const cuerpo = el.querySelector<HTMLElement>('[data-ci-cuerpo]')!;
  const contador = el.querySelector<HTMLElement>('[data-ci-contador]')!;
  const generar = el.querySelector<HTMLButtonElement>('[data-ci-generar]')!;
  const checks = () => Array.from(cuerpo.querySelectorAll<HTMLInputElement>('tbody input[type="checkbox"]'));
  const seleccionados = () => checks().filter(c => c.checked).map(c => c.value);
  const sync = () => {
    const n = seleccionados().length;
    contador.textContent = `${n} seleccionado(s)`;
    generar.disabled = !n;
  };
  cuerpo.querySelector<HTMLInputElement>('[data-ci-todos]')?.addEventListener('change', (e) => {
    for (const c of checks()) c.checked = (e.target as HTMLInputElement).checked;
    sync();
  });
  cuerpo.addEventListener('change', sync);
  sync();

  generar.addEventListener('click', async () => {
    const ids = seleccionados();
    if (!ids.length) return;
    generar.disabled = true;
    generar.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span>Asignando…';
    try {
      const res = await apiFetch<{ asignados: CodigoAsignado[]; omitidos: number }>('/productos/codigos-internos', {
        method: 'POST', body: JSON.stringify({ productoIds: ids })
      });
      const asignados = res?.asignados ?? [];
      await alGuardar();
      cuerpo.innerHTML = `
        <div class="p-3 border-bottom">
          <strong>${asignados.length} código(s) asignado(s).</strong>
          ${res?.omitidos ? `<span class="text-secondary"> ${res.omitidos} omitido(s): ya tenían un código válido o no están activos.</span>` : ''}
        </div>
        <div class="table-responsive">
          <table class="table table-vcenter card-table mb-0" data-mobile-kind="analysis">
            <thead><tr><th>Producto</th><th>Antes</th><th>Código nuevo</th></tr></thead>
            <tbody>${asignados.map(a => `<tr>
              <td class="fw-semibold">${escapeHtml(a.nombre)}</td>
              <td class="text-secondary small">${escapeHtml(a.codigoAnterior || '(vacío)')}</td>
              <td><code>${escapeHtml(a.codigoBarras)}</code></td>
            </tr>`).join('')}</tbody>
          </table>
        </div>`;
      contador.textContent = 'Pegue las etiquetas en los productos para venderlos escaneando.';
      generar.innerHTML = '<i class="ti ti-printer me-1"></i>Imprimir etiquetas';
      generar.disabled = !asignados.length;
      // El mismo botón pasa a imprimir las etiquetas de lo asignado (con precio).
      generar.replaceWith(generar.cloneNode(true));
      el.querySelector<HTMLButtonElement>('[data-ci-generar]')?.addEventListener('click', () => {
        printBarcodeLabels(asignados.map(a => ({ nombre: a.nombre, codigoBarras: a.codigoBarras, precioVenta: String(a.precioVenta) })), { includePrice: true, copies: 1 });
      });
      showToast('Códigos asignados', `${asignados.length} producto(s) ya se pueden escanear.`, 'success');
    } catch (err) {
      generar.disabled = false;
      generar.innerHTML = '<i class="ti ti-barcode me-1"></i>Asignar códigos';
      showToast('No se pudieron asignar', errorMessage(err), 'error');
    }
  });

  modal.show();
}

