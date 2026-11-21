const {convert}=require('./ts-conversion-tools.cjs'); const dom=require('./ts-dom-conversion.cjs');
convert('modules/reparaciones',s=>{
s=dom(s);
s=`import { apiRequired } from '../utils/api-required.js';
import type { ClienteDTO, ProductoDTO, SedeDTO } from '../../../../shared/contracts.js';
import type { ConfigSistema } from '../types/config.js';
import type { ReparacionServicio, TecnicoServicio, CampoGuardado } from '../types/service.js';
`+s;
for(const [n,t] of [['ordenes','ReparacionServicio'],['tecnicos','TecnicoServicio'],['clientes','ClienteDTO'],['productos','ProductoDTO'],['sedes','SedeDTO']]) s=s.replace('let '+n+' = []','let '+n+': '+t+'[] = []');
for(const [url,t] of [['/reparaciones','ReparacionServicio[]'],['/config/usuarios-operativos?rol=tecnico','TecnicoServicio[]'],['/clientes','ClienteDTO[]'],['/productos','ProductoDTO[]'],['/config/sedes','SedeDTO[]'],['/config/sistema','ConfigSistema']]) s=s.replaceAll(`apiFetch('${url}')`,`apiRequired<${t}>('${url}')`);
s=s.replace("const cli = await apiFetch('/clientes',", "const cli = await apiRequired<ClienteDTO>('/clientes',").replace("const ordenNueva = await apiFetch('/reparaciones',", "const ordenNueva = await apiRequired<ReparacionServicio>('/reparaciones',").replace('const orden = await apiFetch(', 'const orden = await apiRequired<ReparacionServicio>(').replaceAll('const result = await apiFetch(', 'const result = await apiRequired<{message: string}>(');
s=s.replace('renderKanbanColumn(title, statusKey, colorClass,','renderKanbanColumn(title: string, statusKey: string, colorClass: string,').replace('updateBoardStats(counts)','updateBoardStats(counts: Record<ReparacionServicio[\'estado\'], number>)').replace('openDetalle(id)','openDetalle(id: string)').replace('openEntregarReparacionModal(orderId)','openEntregarReparacionModal(orderId: string)');
// Previous replacements only signatures.
s=s.replaceAll('openDetalle(id: string);','openDetalle(id);').replaceAll('openEntregarReparacionModal(orderId: string);','openEntregarReparacionModal(orderId);').replace('updateBoardStats(counts: Record<ReparacionServicio[\'estado\'], number>);','updateBoardStats(counts);');
s=s.replace('e.dataTransfer.setData','e.dataTransfer?.setData').replace("e.dataTransfer.getData('text/plain')","e.dataTransfer?.getData('text/plain') || ''").replace('badge.textContent = count','badge.textContent = String(count)');
s=s.replace('ordenes[idx].estado = newStatus',"if (newStatus && ['recibido','diagnostico','en_reparacion','listo','entregado','cancelado'].includes(newStatus)) ordenes[idx].estado = newStatus as ReparacionServicio['estado']");
s=s.replace(/const captureFields = \(\) =>[^;]+;/,`const captureFields = (): CampoGuardado[] => [...requireElement('form-update-detalle', HTMLFormElement).elements]
        .filter((input): input is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement => input instanceof HTMLInputElement || input instanceof HTMLSelectElement || input instanceof HTMLTextAreaElement)
        .filter(input => input.id).map(input => ({id: input.id, value: input.value, checked: input instanceof HTMLInputElement ? input.checked : undefined}));`);
s=s.replace('async fields =>','async (fields: CampoGuardado[]) =>').replace('if (input) { input.value = field.value; if (input.type === \'checkbox\') input.checked = field.checked; }',"if (input instanceof HTMLInputElement || input instanceof HTMLSelectElement || input instanceof HTMLTextAreaElement) { input.value = field.value; if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = !!field.checked; }");
s=s.replace('async button =>','async (button: HTMLButtonElement) =>').replace('async (button, closePicker) =>','async (button: HTMLButtonElement, closePicker?: () => void) =>').replace("button.closest('td').querySelector('.repuesto-costo')", "requireSelector('.repuesto-costo', HTMLInputElement, button.closest('td') || button)").replaceAll('encodeURIComponent(button.dataset.repuestoId)', "encodeURIComponent(button.dataset.repuestoId || '')");
s=s.replaceAll("querySelectorAll<HTMLElement>('.btn-guardar-costo-repuesto')","querySelectorAll<HTMLButtonElement>('.btn-guardar-costo-repuesto')").replaceAll("querySelectorAll<HTMLElement>('.btn-retirar-repuesto')","querySelectorAll<HTMLButtonElement>('.btn-retirar-repuesto')");
s=s.replace('const esc = (value)','const esc = (value: unknown)').replace('const normal = (value)','const normal = (value: unknown)').replace('const catName = (p)','const catName = (p: ProductoDTO)').replace('const catId = (p)','const catId = (p: ProductoDTO)').replace('const shortCat = (name)','const shortCat = (name: string)').replace('let selected = null','let selected: ProductoDTO | null = null');
s=s.replace(/picker.querySelector\('#(rep-modal-[^']+)'\)/g,(m,id)=>`requireElement('${id}', ${id.endsWith('search')?'HTMLInputElement':'HTMLDivElement'}, picker)`);
s=s.replaceAll("document.querySelectorAll<HTMLElement>('.modal-backdrop')","document.querySelectorAll<HTMLElement>('.modal-backdrop')");
s=s.replace("parseFloat(o.totalCobrado || 0)","Number(o.totalCobrado || 0)").replace('includes(o.cliente.documento)','includes(o.cliente.documento || \'\')');
return s;
});
