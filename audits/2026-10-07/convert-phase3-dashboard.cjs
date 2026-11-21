const {convert,base}=require('./ts-conversion-tools.cjs');
convert('modules/dashboard',s=>{
s=base(s);
s=`import { apiRequired } from '../utils/api-required.js';
import type { SessionUser, SedeDTO } from '../../../../shared/contracts.js';
import type { ConfigSistema } from '../types/config.js';
import type { KpisDashboard, GraficaDashboard, GraficaFila, GastoDashboard, ActividadDashboard, DetalleDashboard, DetalleFila, PagoDashboard, RankingDashboard } from '../types/dashboard.js';
`+s;
s=s.replace('let sedes = []','let sedes: SedeDTO[] = []').replace('let config = {','let config: Pick<ConfigSistema, \'empresa\'> = {');
s=s.replace("apiFetch('/auth/me')","apiRequired<{usuario: SessionUser}>('/auth/me')").replace("apiFetch('/config/sedes')","apiRequired<SedeDTO[]>('/config/sedes')").replace("apiFetch('/config/sistema')","apiRequired<ConfigSistema>('/config/sistema')");
for(const [endpoint,type] of [['kpis','KpisDashboard'],['graficas/ventas','GraficaDashboard'],['gastos-por-categoria','GastoDashboard'],['actividad','ActividadDashboard'],['detalle/','DetalleDashboard']]) s=s.replace('apiFetch(`/dashboard/'+endpoint,'apiRequired<'+type+'>(`/dashboard/'+endpoint);
s=s.replace('persistDashboardFilters(periodo, sedeId)','persistDashboardFilters(periodo: string, sedeId: string)').replace('buildDashboardQuery(periodo, sedeId)','buildDashboardQuery(periodo: string, sedeId: string)').replace('showDashboardError(message)','showDashboardError(message: string)');
s=s.replaceAll('PERIODO_LABELS_EARLY = {','PERIODO_LABELS_EARLY: Record<string,string> = {').replace('PERIODO_LABELS = {','PERIODO_LABELS: Record<string,string> = {').replace('ORIGEN_COLORS = {','ORIGEN_COLORS: Record<string,string> = {');
s=s.replace('let chartVentasInstance = null','let chartVentasInstance: InstanceType<typeof Chart> | null = null').replace('let dashWindowModal = null','let dashWindowModal: InstanceType<typeof bootstrap.Modal> | null = null').replace('let lastKpis = null','let lastKpis: KpisDashboard | null = null');
s=s.replace('kpiCard({ window: win, title, iconClass, value, label, valueClass = \'\', tone = \'\' })',"kpiCard({ window: win, title, iconClass, value, label, valueClass = '', tone = '' }: {window: string; title: string; iconClass: string; value: number | string; label: string; valueClass?: string; tone?: string})");
for(const [orig,repl] of [['formatWindowMonto(row)','formatWindowMonto(row: DetalleFila)'],['openDashWindow(tipo)','openDashWindow(tipo: string)'],['bindDashWindows(root = document)','bindDashWindows(root: Document | Element = document)'],['formatBitacoraHora(iso)','formatBitacoraHora(iso: string | null | undefined)'],['renderBitacora(data)','renderBitacora(data: ActividadDashboard)'],['renderKPIs(kpis)','renderKPIs(kpis: KpisDashboard)'],['renderBalance(kpis, periodo)','renderBalance(kpis: KpisDashboard, periodo: string)'],['aggregateProveedores(pagos)','aggregateProveedores(pagos: PagoDashboard[])'],['renderAnalisisRank(listEl, emptyEl, rows, totalBase)','renderAnalisisRank(listEl: HTMLElement | null, emptyEl: HTMLElement | null, rows: RankingDashboard[], totalBase: number)'],['renderAnalisisGasto(kpis, gastosData, periodo)','renderAnalisisGasto(kpis: KpisDashboard, gastosData: GastoDashboard, periodo: string)'],["renderChart(graficaData, bucket = 'day')","renderChart(graficaData: GraficaFila[], bucket = 'day')"]]) { const re=new RegExp('(function )'+orig.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')); s=s.replace(re,'$1'+repl); }
s=s.replaceAll('e.message','errorMessage(e)').replace('renderChart(graficaData, graficaRes.bucket)',"renderChart(graficaData, Array.isArray(graficaRes) ? 'day' : graficaRes.bucket)");
s=s.replace('navEntry && (navEntry.type',"navEntry instanceof PerformanceNavigationTiming && (navEntry.type");
s=s.replaceAll("document.getElementById('filter-sede')?.", "document.querySelector<HTMLSelectElement>('#filter-sede')?.").replaceAll("document.getElementById('filter-periodo')?.", "document.querySelector<HTMLSelectElement>('#filter-periodo')?.");
s=s.replaceAll('dashWindowModal.hide()', 'dashWindowModal?.hide()').replace('document.getElementById(data.scrollTarget)', "document.getElementById(data.scrollTarget || '')");
s=s.replace("querySelectorAll('[data-dash-window]')","querySelectorAll<HTMLElement>('[data-dash-window]')");
s=s.replace('const map = new Map()','const map = new Map<string, RankingDashboard & {count: number}>()');
s=s.replace(/parseFloat\((kpis\.[^\n;]+?|p\.monto|c\.total)\)/g,'Number($1)').replace('const setText = (id, text)','const setText = (id: string, text: string)');
s=s.replace("const ctx = requireElement('chart-ventas', HTMLCanvasElement).getContext('2d');", "const ctx = requireElement('chart-ventas', HTMLCanvasElement); ");
s=s.replace('label: function(context)', 'label: function(context: {dataset: {label: string}; parsed: {y: number}})').replace('callback: function(value)', 'callback: function(value: number)');
return s;
});
