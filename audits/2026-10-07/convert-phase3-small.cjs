const {convert, base} = require('./ts-conversion-tools.cjs');
convert('utils/nomina-periodo', s => {
  s = `export interface NominaConfig { nominaFrecuenciaDefault?: string; nominaDiaCorteQuincena?: number | string; nominaDiaPago1?: number | string; nominaDiaPago2?: number | string; }\n` + s;
  return s.replace('clampDia(d,', 'clampDia(d: number | string | undefined,').replace('parseInt(d, 10)', 'parseInt(String(d), 10)').replaceAll('config = {}', 'config: NominaConfig = {}').replace('formatearEtiquetaPeriodo(periodo,', 'formatearEtiquetaPeriodo(periodo: string,');
});
convert('modules/rma', s => {
  s = `interface RmaDTO { id: string; numero: string; serie: string; producto?: { nombre: string }; cliente?: { nombre: string }; dentroDeGarantia: boolean; estado: string; createdAt: string; }\ninterface RmaLookup { producto?: { nombre: string }; cliente?: { nombre: string }; estadoSerie: string; fechaVenta: string | null; fechaVenceGarantia: string | null; diasGarantia: number; dentroDeGarantia: boolean; }\n` + base(s);
  s = s.replace('fmtDate(v)', 'fmtDate(v: string | null | undefined)').replace('let reclamos = [];', 'let reclamos: RmaDTO[] = [];').replace('let lookup = null;', 'let lookup: RmaLookup | null = null;').replace("await apiFetch('/rma')", "(await apiFetch<RmaDTO[]>('/rma')) ?? []");
  s = s.replace('const id = e.target.dataset.id;', 'if (!(e.currentTarget instanceof HTMLSelectElement)) return;\n        const id = e.currentTarget.dataset.id;\n        if (!id) return;').replaceAll('e.target.value', 'e.currentTarget.value');
  s = s.replace('await apiFetch(`/rma/lookup?serie=${encodeURIComponent(serie)}`)', 'await apiFetch<RmaLookup>(`/rma/lookup?serie=${encodeURIComponent(serie)}`)').replace('box.innerHTML = `', 'if (!lookup) throw new Error("No se encontró la serie.");\n      box.innerHTML = `');
  return s;
});
convert('modules/seguimiento-reparacion', s => {
  s = `import { errorMessage } from '../utils/errors.js';\ninterface SeguimientoDTO { error?: string; logoUrl?: string | null; empresa: string; numeroOrden: string; estado: string; estadoLabel: string; equipo?: { tipo: string; marca: string; modelo: string; imeiMasked?: string }; totalCobrado: number | string; totalEstimado: number | string; clienteNombre?: string; sedeNombre?: string; fechaIngreso: string; fechaEstimadaEntrega: string | null; problemaReportado: string; diagnostico?: string; diasGarantia?: number; actualizadoEn: string; }\n` + s;
  return s.replace('const ESTADO_ORDER =', 'const ESTADO_ORDER: Record<string, number> =').replace('escapeHtml(value)', 'escapeHtml(value: unknown)').replace('formatDate(value)', 'formatDate(value: string | null | undefined)').replace('formatMoney(value)', 'formatMoney(value: number | string)').replace('renderTimeline(estado)', 'renderTimeline(estado: string)').replace('initSeguimientoReparacion(container,', 'initSeguimientoReparacion(container: HTMLElement,').replace('const data = await res.json().catch(() => ({}));', 'const data: SeguimientoDTO = await res.json().catch(() => { throw new Error("La respuesta de seguimiento no es válida."); });').replace('err.message', 'errorMessage(err)');
});
