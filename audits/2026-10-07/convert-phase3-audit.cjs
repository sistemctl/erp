const {convert,base} = require('./ts-conversion-tools.cjs');
convert('modules/auditlog', s => {
  s = `interface AuditLogDTO { createdAt: string; accion: string; modulo: string; registroId: string | null; ip: string | null; usuario?: { nombre: string; email: string } | null; sede?: { nombre: string } | null; valorAnterior?: Record<string, unknown> | null; valorNuevo?: Record<string, unknown> | null; }\n` + base(s);
  s = s.replace('let currentLogs = [];','let currentLogs: AuditLogDTO[] = [];').replace('await apiFetch(`/audit-log?${queryParams.toString()}`)', '(await apiFetch<AuditLogDTO[]>(`/audit-log?${queryParams.toString()}`)) ?? []').replace('showAuditDetail(log)', 'showAuditDetail(log: AuditLogDTO)');
  s = s.replace('showAuditDetail(currentLogs[index]);', 'const log = currentLogs[Number(index)];\n        if (log) showAuditDetail(log);');
  for (const id of ['filter-usuario','filter-desde','filter-hasta']) s=s.replace(`document.getElementById('${id}')?.value`, `document.querySelector<HTMLInputElement>('#${id}')?.value`);
  for (const id of ['filter-modulo','filter-accion']) s=s.replace(`document.getElementById('${id}')?.value`, `document.querySelector<HTMLSelectElement>('#${id}')?.value`);
  for (const id of ['audit-det-modulo','audit-det-accion','audit-det-usuario','audit-det-id']) s=s.replaceAll(`document.getElementById('${id}')`, `requireElement('${id}', HTMLElement)`);
  return s.replace('JSON.stringify(vAnterior[key], null, 2)', "(JSON.stringify(vAnterior[key], null, 2) ?? '-')").replace('JSON.stringify(vNuevo[key], null, 2)', "(JSON.stringify(vNuevo[key], null, 2) ?? '-')");
});
