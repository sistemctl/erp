const {convert,base} = require('./ts-conversion-tools.cjs');
convert('modules/nomina', s => {
  s = `import type { EmpleadoDTO, NominaDTO } from '../types/payroll.js';\nimport type { SedeDTO } from '../../../../shared/contracts';\nimport type { NominaConfig } from '../utils/nomina-periodo.js';\n` + base(s);
  s=s.replace('let empleados = [];', 'let empleados: EmpleadoDTO[] = [];').replace('let nominas = [];', 'let nominas: NominaDTO[] = [];').replace('let sedes = [];', 'let sedes: SedeDTO[] = [];').replace('let configNomina = {};', 'let configNomina: NominaConfig = {};');
  for(const[url,type]of[['empleados','EmpleadoDTO'],['nomina','NominaDTO']]) s=s.replace(`await apiFetch('/${url}')`, `(await apiFetch<${type}[]>('/${url}')) ?? []`);
  s=s.replace("await apiFetch('/config/sedes').catch(() => [])", "(await apiFetch<SedeDTO[]>('/config/sedes').catch(() => [])) ?? []").replace("await apiFetch('/config/sistema').catch(() => ({}))", "(await apiFetch<NominaConfig>('/config/sistema').catch(() => ({}))) ?? {}");
  for(const fn of ['openEditEmpleado','desvincularEmpleado','openDetalleLiquidacion','downloadDesprendible','deleteNomina']) s=s.replace(`${fn}(id) {`, `${fn}(id: string | undefined) {\n    if (!id) return;`);
  s=s.replace(/\.forEach\(btn => \{/g, '.forEach(btn => {\n      if (!(btn instanceof HTMLButtonElement)) return;').replace(/formatter.format\(([en]\.\w+)\)/g, 'formatter.format(Number($1))').replaceAll('e.message', 'errorMessage(e)');
  s=s.replace('await apiFetch(`/nomina`).then(nList => nList.find', 'await apiFetch<NominaDTO[]>(`/nomina`).then(nList => (nList ?? []).find').replace('if (btnEst) {','if (btnEst instanceof HTMLButtonElement) {');
  for(const id of ['calc-periodo-etiqueta','calc-periodo-regla','calc-periodo-estado']) s=s.replaceAll(`document.getElementById('${id}')`, `requireElement('${id}', HTMLElement)`);
  return s;
});
