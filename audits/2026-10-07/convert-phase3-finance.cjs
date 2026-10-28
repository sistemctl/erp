const {convert,base} = require('./ts-conversion-tools.cjs');
convert('modules/reportes', s => {
  s = `import type { SedeDTO } from '../../../../shared/contracts';\nimport type { CuentaDTO, CuentaPagarDTO, CarteraResumen, CuentasPagarResumen, FlujoCaja, MetodoVentaResumen, ProductoVentaResumen, InventarioValorizado } from '../types/finance.js';\ninterface ReportFilters { sede: string; desde: string; hasta: string; }\ntype CsvColumn<T> = { label: string } & ({ key: keyof T; value?: never } | { key?: never; value: (row: T) => unknown });\n` + base(s);
  s = s.replace('buildQuery(params)', 'buildQuery(params: Partial<ReportFilters>)').replace('downloadCsv(filename, rows, columns)', 'downloadCsv<T>(filename: string, rows: readonly T[], columns: readonly CsvColumn<T>[])').replace('const escape = (val)', 'const escape = (val: unknown)').replace("let sedes = [];", 'let sedes: SedeDTO[] = [];').replace("await apiFetch('/config/sedes').catch(() => [])", "(await apiFetch<SedeDTO[]>('/config/sedes').catch(() => [])) ?? []");
  s = s.replace('let chartFlujo = null;', 'let chartFlujo: InstanceType<typeof Chart> | null = null;').replace('let lastCartera = [];', 'let lastCartera: CuentaDTO[] = [];').replace('let lastCpp = [];', 'let lastCpp: CuentaPagarDTO[] = [];');
  s = s.replace("document.getElementById('rep-sede')?.value", "document.querySelector<HTMLSelectElement>('#rep-sede')?.value").replace("const id = e.target.getAttribute", "if (!(e.currentTarget instanceof Element)) return;\n      const id = e.currentTarget.getAttribute");
  for (const [name,type,url] of [['loadCartera','CarteraResumen','/analytics/finanzas/cartera'],['loadCpp','CuentasPagarResumen','/analytics/finanzas/cuentas-por-pagar'],['loadFlujo','FlujoCaja','/analytics/finanzas/flujo-caja'],['loadInventario','InventarioValorizado','/analytics/inventario/valorizado']]) {
    s=s.replace(`${name}(q) {`, `${name}(q: ReportFilters) {`).replace(`await apiFetch(\`${url}`, `await apiFetch<${type}>(\`${url}`);
  }
  s = s.replace('loadVentas(q) {','loadVentas(q: ReportFilters) {').replace('apiFetch(`/analytics/ventas/por-metodo-pago', 'apiFetch<MetodoVentaResumen[]>(`/analytics/ventas/por-metodo-pago').replace('apiFetch(`/analytics/ventas/top-productos', 'apiFetch<ProductoVentaResumen[]>(`/analytics/ventas/top-productos');
  // All object-report responses are mandatory; 204 must not leave half-rendered reports.
  s = s.replace(/(const data = await apiFetch<[^>]+>\([^;]+;)/g, '$1\n    if (!data) throw new Error("El reporte no contiene datos.");');
  s = s.replace('formatter.format(r.saldoPendiente)', 'formatter.format(Number(r.saldoPendiente))').replace('if (!canvas ||', 'if (!(canvas instanceof HTMLCanvasElement) ||').replace('metodos.length ? metodos : []', '(metodos ?? [])').replace('top.length ? top : []', '(top ?? [])');
  return s;
});
convert('modules/cartera', s => {
  s = `import type { CuentaDTO, CarteraResumen, MedioPago } from '../types/finance.js';\n` + base(s);
  s = s.replace('let activeAbonoSedeId = null;', 'let activeAbonoSedeId: string | null = null;').replace('let activeCpcId = null;', 'let activeCpcId: string | null = null;').replace('let lastCarteraData = [];', 'let lastCarteraData: CuentaDTO[] = [];').replace('let cuentasAbono = [];','let cuentasAbono: CuentaDTO[] = [];');
  s = s.replace("apiFetch('/config/sistema')", "apiFetch<{ mediosPago?: MedioPago[] }>('/config/sistema')").replace('config.mediosPago', 'config?.mediosPago').replace('abrirAbono = item =>', 'abrirAbono = (item: CuentaDTO) =>').replace('normalizar = value =>', 'normalizar = (value: unknown) =>').replace('escapeHtml = (value)', 'escapeHtml = (value: unknown)').replace('formatDate = (value)', 'formatDate = (value: string | null | undefined)').replace('openDetalle = (item)', 'openDetalle = (item: CuentaDTO)');
  s = s.replaceAll('formatter.format(item.saldoPendiente)', 'formatter.format(Number(item.saldoPendiente))').replaceAll('formatter.format(item.totalOriginal)', 'formatter.format(Number(item.totalOriginal))').replaceAll('formatter.format(item.totalAbonado)', 'formatter.format(Number(item.totalAbonado))');
  s = s.replace('const button = event.target.closest', 'if (!(event.target instanceof Element)) return;\n    const button = event.target.closest<HTMLButtonElement>');
  s = s.replace('const data = await apiFetch(`/cartera', 'const data = (await apiFetch<CuentaDTO[]>(`/cartera').replace("`}`);\n      if (!container", "`}`)) ?? [];\n      if (!container").replace('(`/cartera${query}`);', '(`/cartera${query}`)) ?? [];');
  s = s.replace('const cliente = item.cliente || {};', 'const cliente = item.cliente;').replace('const factura = item.factura || {};','const factura = item.factura;').replace(/\b(cliente|factura)\.(nombre|documento|telefono|email|numeroFactura|sede)\b/g, '$1?.$2');
  s = s.replace('await apiFetch(`/analytics/finanzas/cartera${q}`)', 'await apiFetch<CarteraResumen>(`/analytics/finanzas/cartera${q}`)').replace("requireElement('cartera-kpi-total'", "if (!res) return;\n      requireElement('cartera-kpi-total'").replace('const escape = (v)', 'const escape = (v: unknown)');
  s = s.replace(/\.forEach\(btn => \{/g, '.forEach(btn => {\n        if (!(btn instanceof HTMLButtonElement)) return;').replaceAll('e.message','errorMessage(e)').replace("= hashParams.get('estado');", "= hashParams.get('estado') ?? '';");
  s = s.replace('const payload = {\n      monto:', 'const payload: { monto: number; metodo: string; observaciones: string; sedeId?: string } = {\n      monto:');
  return s;
});
