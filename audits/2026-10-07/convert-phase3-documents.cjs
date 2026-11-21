const {convert} = require('./ts-conversion-tools.cjs');
convert('utils/cotizacion-document', s => {
  s = `import type { CotizacionDocumento, EmpresaDocumento } from '../types/documents.js';\n` + s;
  return s.replace('fmtCotDate(d)', 'fmtCotDate(d: string | null | undefined)').replace('renderCotizacionDocumento(c, config = {})', 'renderCotizacionDocumento(c: CotizacionDocumento, config: EmpresaDocumento = {})').replace('cotFormatter.format(item.precioUnitario)', 'cotFormatter.format(Number(item.precioUnitario))').replace('cotFormatter.format(item.subtotal)', 'cotFormatter.format(Number(item.subtotal))').replace('host.innerHTML = \'\';', "host?.replaceChildren();");
});
convert('utils/factura-document', s => {
  s = `import type { FacturaDocumento, EmpresaDocumento } from '../types/documents.js';\ninterface FacturaItem { codigo: string; descripcion: string; cantidad: number; precioUnitario: number | string; subtotal: number | string; }\n` + s;
  s = s.replace('fmtFacDate(d)', 'fmtFacDate(d: string | null | undefined)').replace('fmtFacMoney(n)', 'fmtFacMoney(n: number | string)').replace('parseFloat(n)', 'parseFloat(String(n))').replace('getFacItems(f)', 'getFacItems(f: FacturaDocumento): FacturaItem[]').replace('const items = getFacItems(f: FacturaDocumento): FacturaItem[];', 'const items = getFacItems(f);');
  s = s.replace('const items = [{', 'const items: FacturaItem[] = [{').replace('rep.costoUnitario * rep.cantidad', 'Number(rep.costoUnitario) * rep.cantidad').replace('parseInt(mat.cantidad, 10)', 'parseInt(String(mat.cantidad), 10)');
  return s.replace('getCondicionPago(estado)', 'getCondicionPago(estado: string)').replace('numeroALetrasCOP(valor)', 'numeroALetrasCOP(valor: number | string)').replace('renderFacturaDocumento(f, config = {})', 'renderFacturaDocumento(f: FacturaDocumento, config: EmpresaDocumento = {})').replace("host.innerHTML = '';", 'host?.replaceChildren();');
});
