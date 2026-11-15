/**
 * Modo "una sola sede": si la empresa tiene una única sede activa, los selectores,
 * etiquetas y columnas de sede no aportan nada y solo ocupan espacio.
 *
 * - Selectores de sede (<select id="…sede…">) con una sola opción real: se fija esa
 *   sede como valor (los formularios siguen enviándola) y se oculta el campo.
 * - Columnas "Sede" de las tablas y la etiqueta de sede del POS: se ocultan.
 * Con dos o más sedes no cambia nada.
 */
import { apiFetch } from '../api.js';
import { isAuthenticated } from '../auth.js';

let estado: 'desconocido' | 'consultando' | 'una' | 'varias' = 'desconocido';
let observer: MutationObserver | null = null;

const CONTENEDORES = '.col, [class*="col-"], .mb-3, .mb-2, .form-group, .erp-field, .pos-session-bar__admin';
const normalizar = (t: string) => t.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function ocultar(el: Element) { el.classList.add('una-sede-oculto'); }

function procesarSelect(select: HTMLSelectElement) {
  if (!/sede/i.test(`${select.id} ${select.name}`)) return;
  // "Sede Global / N/A" (usuarios sin sede fija) es una elección real: no se oculta.
  if (Array.from(select.options).some((o) => o.value === '' && /global/.test(normalizar(o.textContent || '')))) return;
  const reales = Array.from(select.options).filter((o) => o.value !== '');
  if (reales.length !== 1) return;
  if (select.value !== reales[0].value) {
    select.value = reales[0].value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const contenedor = select.closest(CONTENEDORES);
  if (contenedor && contenedor.querySelectorAll('input:not([type=hidden]),select,textarea').length === 1) {
    ocultar(contenedor);
    return;
  }
  ocultar(select);
  if (select.id) document.querySelectorAll(`label[for="${CSS.escape(select.id)}"]`).forEach(ocultar);
  const previo = select.previousElementSibling;
  if (previo && /^(label|span)$/i.test(previo.tagName) && normalizar(previo.textContent || '').startsWith('sede')) ocultar(previo);
}

function procesarTabla(tabla: HTMLTableElement) {
  const cabecera = tabla.tHead?.rows[tabla.tHead.rows.length - 1];
  if (!cabecera) return;
  const indice = Array.from(cabecera.cells).findIndex((c) => normalizar(c.textContent || '') === 'sede');
  if (indice < 0) return;
  ocultar(cabecera.cells[indice]);
  for (const cuerpo of Array.from(tabla.tBodies)) {
    for (const fila of Array.from(cuerpo.rows)) {
      // Solo filas con la misma estructura (no mensajes "sin resultados" con colspan).
      if (fila.cells.length === cabecera.cells.length) ocultar(fila.cells[indice]);
    }
  }
}

function procesar(raiz: Element | Document) {
  if (raiz instanceof HTMLSelectElement) procesarSelect(raiz);
  else if (raiz instanceof HTMLOptionElement && raiz.parentElement instanceof HTMLSelectElement) procesarSelect(raiz.parentElement);
  raiz.querySelectorAll?.<HTMLSelectElement>('select').forEach(procesarSelect);
  const tabla = raiz instanceof Element ? raiz.closest('table') : null;
  if (tabla) procesarTabla(tabla);
  raiz.querySelectorAll?.<HTMLTableElement>('table').forEach(procesarTabla);
}

function activar() {
  document.body.classList.add('una-sede');
  procesar(document);
  observer = new MutationObserver((cambios) => {
    for (const cambio of cambios) {
      cambio.addedNodes.forEach((nodo) => { if (nodo instanceof Element) procesar(nodo); });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

/** Consulta las sedes una vez (tras iniciar sesión) y activa el modo si solo hay una. */
export async function detectarModoUnaSede(): Promise<void> {
  if (estado !== 'desconocido' || !isAuthenticated()) return;
  estado = 'consultando';
  try {
    const sedes = (await apiFetch<{ activa?: boolean }[]>('/config/sedes', { silent: true })) ?? [];
    const activas = sedes.filter((s) => s.activa !== false).length;
    estado = activas === 1 ? 'una' : 'varias';
    if (estado === 'una') activar();
  } catch {
    estado = 'desconocido'; // se reintenta en la siguiente navegación
  }
}
