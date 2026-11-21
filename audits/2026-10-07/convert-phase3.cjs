// Transformaciones mecánicas acotadas; los contratos y guardas se revisan por módulo.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../frontend/assets/js');
function convert(name, transform) {
  const source = path.join(root, name + '.js');
  fs.writeFileSync(path.join(root, name + '.ts'), transform(fs.readFileSync(source, 'utf8')));
  fs.unlinkSync(source);
}
for (const [name, dto, entity] of [['clientes', 'ClienteDTO', 'clientes'], ['proveedores', 'ProveedorDTO', 'proveedores']]) {
  convert('modules/' + name, s => {
    s = `import type { ${dto} } from '../../../../shared/contracts';\nimport { requireElement } from '../utils/dom.js';\nimport { errorMessage } from '../utils/errors.js';\n` + s;
    s = s.replaceAll('getUsuario', 'requireUsuario').replace(`init${name === 'clientes' ? 'Clientes' : 'Proveedores'}(container)`, `init${name === 'clientes' ? 'Clientes' : 'Proveedores'}(container: HTMLElement)`);
    s = s.replace(`let ${entity} = [];`, `let ${entity}: ${dto}[] = [];`).replace(`await apiFetch('/${entity}')`, `(await apiFetch<${dto}[]>('/${entity}')) ?? []`);
    s = s.replace('Table(data)', `Table(data: readonly ${dto}[])`).replaceAll('openEditForm(id)', 'openEditForm(id: string | undefined)').replaceAll('deleteProveedor(id)', 'deleteProveedor(id: string | undefined)').replaceAll('openFicha(id)', 'openFicha(id: string | undefined)');
    // Infer mandatory DOM kinds from the actual static markup, rather than asserting field types.
    const kinds = new Map();
    for (const match of s.matchAll(/<(input|form|div|h5|tbody|button)\b[^>]*\bid="([^"]+)"/g)) kinds.set(match[2], ({input:'HTMLInputElement',form:'HTMLFormElement',div:'HTMLDivElement',h5:'HTMLHeadingElement',tbody:'HTMLTableSectionElement',button:'HTMLButtonElement'})[match[1]]);
    s = s.replace(/document.getElementById\('([^']+)'\)(?!\?)/g, (full,id) => kinds.has(id) ? `requireElement('${id}', ${kinds.get(id)})` : full);
    // Action buttons are created in table rows. Narrow each result before accessing dataset.
    s = s.replace(/\.forEach\(btn => \{/g, '.forEach(btn => {\n      if (!(btn instanceof HTMLButtonElement)) return;');
    s = s.replace(/\(e\) => \{\s*const val = e.target.value/g, `(e) => {\n    if (!(e.currentTarget instanceof HTMLInputElement)) return;\n    const val = e.currentTarget.value`);
    s = s.replaceAll('err.message', 'errorMessage(err)');
    if (name === 'proveedores') s = s.replace('async function deleteProveedor(id: string | undefined) {', 'async function deleteProveedor(id: string | undefined) {\n    if (!id) return;');
    if (name === 'clientes') {
      s = s.replace('const escapeHtml = (value)', 'const escapeHtml = (value: unknown)').replace("}[char]));", "} as Record<string, string>)[char] ?? char);");
      s = s.replace('async function openFicha(id: string | undefined) {', 'async function openFicha(id: string | undefined) {\n    if (!id) return;');
      s = s.replace('const c = await apiFetch(`/clientes/${id}`);', 'const c = await apiFetch<ClienteDTO>(`/clientes/${id}`);\n      if (!c) throw new Error("No se encontró el cliente.");');
      s = s.replace('await apiFetch(`/ventas?cliente=${id}`).catch(() => [])', '(await apiFetch<CompraCliente[]>(`/ventas?cliente=${id}`).catch(() => [])) ?? []');
      s = s.replace('await apiFetch(`/reparaciones?cliente=${id}`).catch(() => [])', '(await apiFetch<ReparacionCliente[]>(`/reparaciones?cliente=${id}`).catch(() => [])) ?? []');
      s = s.replace('await apiFetch(`/facturas?cliente=${id}`).catch(() => [])', '(await apiFetch<FacturaCliente[]>(`/facturas?cliente=${id}`).catch(() => [])) ?? []');
      s = s.replaceAll('formatter.format(com.total)', 'formatter.format(Number(com.total))').replaceAll('formatter.format(rep.totalCobrado)', 'formatter.format(Number(rep.totalCobrado))');
      s = `interface CompraCliente { numeroVenta: string; createdAt: string; total: string; pagos: { metodo: string }[]; }\ninterface ReparacionCliente { numeroOrden: string; createdAt: string; estado: string; tipoEquipo: string; marca: string; modelo: string; totalCobrado: string; }\ninterface FacturaCliente { estado: string; total: string; }\n` + s;
    }
    return s;
  });
}
convert('utils/unidad-medida', s => s.replaceAll('(value)', '(value: unknown)').replace('(cantidad, unidadMedida)', '(cantidad: number | string, unidadMedida: unknown)'));
convert('utils/cotizacion-iva', s => {
  s = 'export interface ItemIva { tieneIVA?: boolean; producto?: { tieneIVA?: boolean }; subtotal?: number | string; cantidad: number | string; precioUnitario: number | string; }\n' + s;
  return s.replace('itemAplicaIva(item)', 'itemAplicaIva(item: ItemIva)').replace('calcCotIvaItems(items, ivaPct = 19)', 'calcCotIvaItems(items: readonly ItemIva[] | null | undefined, ivaPct: number | string = 19)').replace('etiquetaIvaCot(iva, ivaPct = 19)', 'etiquetaIvaCot(iva: number, ivaPct: number | string = 19)').replace(/parseFloat\((ivaPct|item\.\w+)\)/g,'parseFloat(String($1))').replace('if (itemAplicaIva(item: ItemIva))', 'if (itemAplicaIva(item))');
});
convert('utils/numero-a-letras', s => s.replace('const ESPECIALES =', 'const ESPECIALES: Record<number, string> =').replace(/function (centenas|decenasYUnidades|convertirEntero)\(n\)/g, 'function $1(n: number): string').replace('seccion(n, divisor, singular, plural)', 'seccion(n: number, divisor: number, singular: string, plural: string): string').replace('numeroALetras(valor)', 'numeroALetras(valor: number | string)').replace('parseFloat(valor)', 'parseFloat(String(valor))'));
