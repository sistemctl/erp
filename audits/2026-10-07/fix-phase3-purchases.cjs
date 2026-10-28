const fs=require('node:fs');const ts=require('../../backend/node_modules/typescript'); const p='frontend/assets/js/modules/compras.ts';let s=fs.readFileSync(p,'utf8');
s=s.replace('monto: number | null,', 'monto: number | null = null,').replaceAll('pagos: PagoCompraColumns[] | undefined','pagos: (PagoCompraColumns & {usuario?: {nombre: string} | null})[] | undefined');
s=s.replaceAll('const map = {','const map: Record<string,string> = {').replaceAll('const labels = {','const labels: Record<string,string> = {');
s=s.replace(/parseFloat\(([^\n;]*? \|\| 0)\)/g,'Number($1)').replace(/parseInt\(([^\n;]*? \|\| (?:0|1)), 10\)/g,'parseInt(String($1), 10)');
for(const name of ['openRecibirMercancia','openDevolverMercancia','openVerCompra','openAbonarCuenta']) s=s.replaceAll(name+'(btn.dataset.id)',name+"(btn.dataset.id || '')");
s=s.replace('vence - hoy','vence.getTime() - hoy.getTime()').replaceAll('item.cantidadPedida - item.cantidadRecibida','item.cantidadPedida - Number(item.cantidadRecibida)').replace('item.cantidadRecibida > 0','Number(item.cantidadRecibida) > 0');
s=s.replace('item.cantidadPedida * item.precioUnitario','item.cantidadPedida * Number(item.precioUnitario)').replace('Math.round(oc.saldoPendiente)','Math.round(Number(oc.saldoPendiente))');
s=s.replace("formOC.querySelector('button[type=\"submit\"]')", "formOC.querySelector<HTMLButtonElement>('button[type=\"submit\"]')");
s=s.replaceAll('(eventField(e) instanceof HTMLInputElement && eventField(e).checked)', 'sw.checked');
s=s.replace(/modalForm.querySelector\(`(\.container-series[^`]+)`\)/g,"requireSelector(`$1`, HTMLElement, modalForm)").replace(/modalForm.querySelector\(`(\.input-(?:recibir|devolver)-series[^`]+)`\)/g,"requireSelector(`$1`, HTMLTextAreaElement, modalForm)").replace(/modalForm.querySelector\(`(\.switch-[^`]+)`\)/g,"requireSelector(`$1`, HTMLInputElement, modalForm)");
s=s.replaceAll('productoId: pid,', "productoId: pid || '',");
s=s.replace(/const items: RecepcionCompra\[\] = \[\];(\s*let validationError = null;\s*let totalDevuelto)/,'const items: DevolucionCompra[] = [];$1');
// DOM setters stringify numbers; transport/calculation fields retain their numeric types.
const sf=ts.createSourceFile(p,s,ts.ScriptTarget.Latest,true);const edits=[];
function visit(n){if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.EqualsToken&&ts.isPropertyAccessExpression(n.left)&&['value','textContent'].includes(n.left.name.text)){const val=n.right.getText(sf);if(!val.startsWith('String(')&&val!=='null')edits.push({start:n.right.getStart(sf),end:n.right.end,text:`String(${val})`});} ts.forEachChild(n,visit);} visit(sf);
for(const e of edits.sort((a,b)=>b.start-a.start))s=s.slice(0,e.start)+e.text+s.slice(e.end);
fs.writeFileSync(p,s);
