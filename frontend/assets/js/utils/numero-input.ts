/**
 * Formato colombiano en los campos numéricos de toda la aplicación (100000 → 100.000).
 *
 * Los <input type="number"> no admiten separadores de miles, así que se convierten en
 * campos de texto que MUESTRAN el número formateado, pero cuya propiedad `.value` sigue
 * devolviendo el número plano ("100000", "333.33"). El resto del código (cálculos,
 * validaciones, peticiones al servidor) no cambia.
 *
 * - Miles con punto y decimales con coma: 1.234.567,89
 * - Se formatea mientras se escribe, conservando la posición del cursor.
 * - Un punto escrito a mano en un campo con decimales se toma como coma decimal.
 * - min / max se validan con setCustomValidity (los de type=number dejan de aplicar).
 * - Se excluyen campos que no son cantidades (puertos) o marcados con data-numfmt="off".
 */

const EXCLUIR = /puerto|port\b|smtp-port|anio|year/i;
const nativo = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!;
const mejorados = new WeakSet<HTMLInputElement>();

interface Config { decimales: number; min: number | null; max: number | null; }
const configs = new WeakMap<HTMLInputElement, Config>();

function decimalesDeStep(step: string | null): number {
  if (!step || step === 'any') return 2;
  const n = Number(step);
  if (!Number.isFinite(n) || n <= 0) return 2;
  if (Number.isInteger(n)) return 0;
  return Math.min(8, (step.split('.')[1] || '').length || 2);
}

/** Convierte lo que se ve ("1.234,5", "800.45", "100.000") al número plano ("1234.5", "800.45", "100000"). */
export function aNumeroPlano(texto: string, decimales = 2): string {
  let t = String(texto ?? '').trim().replace(/\s|\$/g, '');
  if (!t) return '';
  const negativo = t.startsWith('-');
  t = t.replace(/[^\d.,]/g, '');
  if (!t) return '';
  let entero = t;
  let fraccion = '';
  if (t.includes(',')) {
    // Coma = decimal; los puntos son miles.
    const i = t.lastIndexOf(',');
    entero = t.slice(0, i).replace(/[.,]/g, '');
    fraccion = t.slice(i + 1).replace(/[.,]/g, '');
  } else if (t.includes('.')) {
    // Solo puntos: si todos los grupos tras el primero tienen 3 dígitos son miles
    // ("100.000", "1.234.567"); si no, el último punto es decimal ("800.45", "1.5").
    const partes = t.split('.');
    const esMiles = partes.length > 1 && partes.slice(1).every(p => p.length === 3) && (decimales === 0 || partes.length > 2 || partes[0] !== '0');
    if (esMiles) entero = partes.join('');
    else { fraccion = partes.pop() || ''; entero = partes.join(''); }
  }
  entero = entero.replace(/^0+(?=\d)/, '') || (fraccion ? '0' : '');
  if (decimales === 0) fraccion = '';
  else fraccion = fraccion.slice(0, decimales);
  const plano = fraccion ? `${entero || '0'}.${fraccion}` : entero;
  return plano && negativo ? `-${plano}` : plano;
}

/** Número plano → texto colombiano. Quita ceros decimales sobrantes (20000.00 → 20.000).
 *  Los valores que asigna el código vienen en formato JS ("1234.567" = mil doscientos…),
 *  así que un número o texto con solo dígitos y un punto se toma tal cual. */
export function aTextoColombiano(valor: unknown, decimales = 2): string {
  const crudo = typeof valor === 'number' ? (Number.isFinite(valor) ? String(valor) : '') : String(valor ?? '').trim();
  const plano = /^-?\d+(\.\d+)?$/.test(crudo) ? crudo : aNumeroPlano(crudo, 8);
  if (plano === '' || plano === '-') return '';
  const negativo = plano.startsWith('-');
  const [ent, frac = ''] = plano.replace('-', '').split('.');
  const enteroFmt = (ent || '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const fracFmt = decimales > 0 ? frac.slice(0, decimales).replace(/0+$/, '') : '';
  return `${negativo ? '-' : ''}${enteroFmt}${fracFmt ? `,${fracFmt}` : ''}`;
}

/** Formato mientras se escribe: agrupa la parte entera y respeta una coma final ("20.000,"). */
function formatearEscritura(texto: string, decimales: number): string {
  let t = texto.replace(/[^\d.,-]/g, '');
  const negativo = t.startsWith('-');
  t = t.replace(/-/g, '');
  const iComa = t.indexOf(',');
  let entero = iComa >= 0 ? t.slice(0, iComa) : t;
  let fraccion = iComa >= 0 ? t.slice(iComa + 1).replace(/[.,]/g, '') : null;
  entero = entero.replace(/\./g, '').replace(/^0+(?=\d)/, '');
  if (decimales === 0) fraccion = null;
  else if (fraccion !== null) fraccion = fraccion.slice(0, decimales);
  const enteroFmt = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negativo ? '-' : ''}${enteroFmt}${fraccion !== null ? `,${fraccion}` : ''}`;
}

function validar(input: HTMLInputElement) {
  const cfg = configs.get(input);
  if (!cfg) return;
  const plano = input.value;
  let mensaje = '';
  if (plano !== '') {
    const n = Number(plano);
    if (!Number.isFinite(n)) mensaje = 'Ingrese un número válido.';
    else if (cfg.min !== null && n < cfg.min) mensaje = `El valor debe ser mayor o igual a ${aTextoColombiano(cfg.min, cfg.decimales)}.`;
    else if (cfg.max !== null && n > cfg.max) mensaje = `El valor debe ser menor o igual a ${aTextoColombiano(cfg.max, cfg.decimales)}.`;
  }
  input.setCustomValidity(mensaje);
}

export function mejorarCampoNumerico(input: HTMLInputElement): void {
  if (mejorados.has(input) || input.type !== 'number') return;
  if (input.dataset.numfmt === 'off' || EXCLUIR.test(`${input.id} ${input.name}`)) return;

  const decimales = decimalesDeStep(input.getAttribute('step'));
  const min = input.hasAttribute('min') && input.getAttribute('min') !== '' ? Number(input.getAttribute('min')) : null;
  const max = input.hasAttribute('max') && input.getAttribute('max') !== '' ? Number(input.getAttribute('max')) : null;
  configs.set(input, { decimales, min: Number.isFinite(min) ? min : null, max: Number.isFinite(max) ? max : null });

  const actual = nativo.get!.call(input) as string;
  input.type = 'text';
  input.inputMode = decimales > 0 ? 'decimal' : 'numeric';
  input.autocomplete = 'off';
  input.classList.add('erp-num-input');
  mejorados.add(input);

  Object.defineProperty(input, 'value', {
    configurable: true,
    get() { return aNumeroPlano(nativo.get!.call(this) as string, decimales); },
    set(v: unknown) { nativo.set!.call(this, aTextoColombiano(v, decimales)); validar(this as HTMLInputElement); }
  });
  input.value = actual;

  // Formato en vivo (fase de captura: antes de los manejadores de la pantalla).
  input.addEventListener('beforeinput', (e) => {
    const ev = e as InputEvent;
    if (ev.inputType === 'insertText' && ev.data === '.' && decimales > 0) {
      // Un punto escrito a mano es coma decimal (los miles los pone el formato).
      const texto = nativo.get!.call(input) as string;
      if (!texto.includes(',')) {
        e.preventDefault();
        const ini = input.selectionStart ?? texto.length;
        const fin = input.selectionEnd ?? texto.length;
        nativo.set!.call(input, `${texto.slice(0, ini)},${texto.slice(fin)}`);
        input.setSelectionRange(ini + 1, ini + 1);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      } else e.preventDefault();
    } else if (ev.inputType === 'insertText' && ev.data && /[^\d,.-]/.test(ev.data)) {
      e.preventDefault();
    }
  }, true);

  input.addEventListener('input', (e) => {
    const ev = e as InputEvent;
    const texto = nativo.get!.call(input) as string;
    const cursor = input.selectionStart ?? texto.length;
    const pegado = ev.inputType === 'insertFromPaste' || ev.inputType === 'insertFromDrop';
    const nuevo = pegado
      ? aTextoColombiano(aNumeroPlano(texto, decimales), decimales)
      : formatearEscritura(texto, decimales);
    if (nuevo !== texto) {
      // Conservar el cursor contando los dígitos (y la coma) que había a su izquierda.
      const significativos = texto.slice(0, cursor).replace(/[^\d,-]/g, '').length;
      nativo.set!.call(input, nuevo);
      let pos = 0;
      let vistos = 0;
      while (pos < nuevo.length && vistos < significativos) {
        if (/[\d,-]/.test(nuevo[pos])) vistos += 1;
        pos += 1;
      }
      if (document.activeElement === input) input.setSelectionRange(pos, pos);
    }
    validar(input);
  }, true);

  input.addEventListener('blur', () => {
    // Al salir, formato limpio: "20.000," → "20.000"; "1.234,50" → "1.234,5".
    const limpio = aTextoColombiano(input.value, decimales);
    if (limpio !== nativo.get!.call(input)) nativo.set!.call(input, limpio);
    validar(input);
  });

  input.form?.addEventListener('reset', () => {
    // reset() restaura el atributo value original (sin formato): se reformatea después.
    setTimeout(() => { nativo.set!.call(input, aTextoColombiano(nativo.get!.call(input), decimales)); validar(input); }, 0);
  });
  validar(input);
}

function mejorarDentro(raiz: ParentNode) {
  if (raiz instanceof HTMLInputElement) { mejorarCampoNumerico(raiz); return; }
  raiz.querySelectorAll?.<HTMLInputElement>('input[type="number"]').forEach(mejorarCampoNumerico);
}

/** Se llama una vez al iniciar la aplicación: formatea los campos actuales y los que se agreguen. */
export function instalarFormatoNumerico(raiz: HTMLElement = document.body): void {
  mejorarDentro(raiz);
  new MutationObserver((cambios) => {
    for (const cambio of cambios) {
      cambio.addedNodes.forEach((nodo) => { if (nodo instanceof Element) mejorarDentro(nodo); });
      if (cambio.type === 'attributes' && cambio.target instanceof HTMLInputElement) mejorarCampoNumerico(cambio.target);
    }
  }).observe(raiz, { childList: true, subtree: true, attributes: true, attributeFilter: ['type'] });
}
