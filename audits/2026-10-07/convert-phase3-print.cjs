const {convert} = require('./ts-conversion-tools.cjs');
const escape = s => s.replace(/(escapeHtml\s*=\s*\(|function escapeHtml\()(value|str)\)/g, '$1$2: unknown)').replace("}[char]));", "} as Record<string, string>)[char] ?? char);");
convert('utils/barcode-label', s => {
  s = `import type { ProductoDTO } from '../../../../shared/contracts';\ntype LabelProduct = Pick<ProductoDTO, 'nombre' | 'codigoBarras' | 'precioVenta'>;\ninterface LabelOptions { includePrice?: boolean; copies?: number | string; }\n` + escape(s);
  s = s.replace(/\((product|products), options = \{\}\)/g, (_,name) => `(${name}: ${name==='products'?'readonly LabelProduct[]':'LabelProduct'}, options: LabelOptions = {})`);
  s = s.replace('renderBarcodesInContainer(container)', 'renderBarcodesInContainer(container: HTMLElement | null)').replace("container.querySelectorAll('svg[data-barcode]')", "container.querySelectorAll<SVGSVGElement>('svg[data-barcode]')");
  return s.replace('parseInt(copies, 10)', 'parseInt(String(copies), 10)').replace('isInternalBarcode(codigo)', 'isInternalBarcode(codigo: unknown)');
});
convert('utils/pos-receipt', s => {
  s = `import type { PosReceiptData, DevolucionReceiptData } from '../types/documents.js';\n` + escape(s);
  s = s.replace('const METODO_LABELS =', 'const METODO_LABELS: Record<string, string> =').replace('fmtAmount(n)', 'fmtAmount(n: number | string)').replace('parseFloat(n)', 'parseFloat(String(n))').replace('fmtSiigoDate(d =', 'fmtSiigoDate(d: Date | string =').replace('fieldLine(label, value)', 'fieldLine(label: string, value: unknown)');
  s = s.replace('  esCredito = false\r\n}) {', '  esCredito = false\r\n}: PosReceiptData) {').replace("  motivo = ''\r\n}) {", "  motivo = ''\r\n}: DevolucionReceiptData) {");
  return s.replace('parseFloat(p.monto)', 'parseFloat(String(p.monto))').replace('parseFloat(subtotal)', 'parseFloat(String(subtotal))').replace('parseFloat(descuentoTotal || 0)', 'parseFloat(String(descuentoTotal || 0))');
});
convert('utils/cierre-ticket-print', s => {
  s = `import type { CierreTicketData } from '../types/documents.js';\n` + s;
  s = s.replace('fmtAmount(n)', 'fmtAmount(n: number | string)').replace('parseFloat(n)', 'parseFloat(String(n))').replace('fmtDateStr(d)', 'fmtDateStr(d: string | null | undefined)');
  s = s.replace('config = {} })', 'config = {} }: CierreTicketData)').replace('printCierreTicket(ticketData)', 'printCierreTicket(ticketData: CierreTicketData)');
  return s.replace(/parseFloat\((caja\.\w+ \|\| 0)\)/g, 'parseFloat(String($1))');
});
convert('utils/notificacion-email-preview', s => {
  s = `type PreviewType = 'factura' | 'recibido' | 'listo' | 'entregado';\ntype PreviewVars = typeof EMAIL_PREVIEW_SAMPLE;\nfunction isPreviewType(value: unknown): value is PreviewType { return typeof value === 'string' && ['factura','recibido','listo','entregado'].includes(value); }\n` + escape(s);
  s = s.replace('renderPlantilla(template, vars)', 'renderPlantilla(template: string | null | undefined, vars: Record<string, string | null | undefined>)');
  s = s.replace("function getField(id) {\r\n  return document.getElementById(id)?.value?.trim() ?? '';\r\n}", "function getField(id: string) {\n  const field = document.getElementById(id);\n  return field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement ? field.value.trim() : '';\n}");
  s = s.replace('getPreviewContent(type, vars)', 'getPreviewContent(type: PreviewType, vars: PreviewVars)').replace("let activePreviewType = 'factura';", "let activePreviewType: PreviewType = 'factura';");
  s = s.replace('activePreviewType = btn.dataset.emailPreviewType;', 'if (!(btn instanceof HTMLElement) || !isPreviewType(btn.dataset.emailPreviewType)) return;\n      activePreviewType = btn.dataset.emailPreviewType;');
  return s;
});
