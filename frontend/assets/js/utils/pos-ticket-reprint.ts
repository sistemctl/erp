import type { FacturaDocumento, EmpresaDocumento } from '../types/documents.js';
import { apiFetch } from '../api.js';
import { renderPosReceipt, renderReceiptBarcodes } from './pos-receipt.js';
import { showToast } from './toast.js';
import { errorMessage } from './errors.js';
import { escapeHtml } from './html.js';

/**
 * Reimprime el ticket POS térmico (80mm) de una factura de venta ya registrada.
 * Abre la ventana antes de pedir los datos para que el navegador no la bloquee.
 */
export async function reprintPosTicket(facturaId: string | undefined, empresaConfig?: EmpresaDocumento) {
  if (!facturaId) return;
  const popup = window.open('', '_blank', 'width=380,height=680');
  if (!popup) {
    showToast('Aviso', 'Permite ventanas emergentes para imprimir el ticket.', 'warning');
    return;
  }
  popup.document.write('<p style="font-family:sans-serif;padding:16px">Cargando ticket…</p>');

  try {
    const [f, config] = await Promise.all([
      apiFetch<FacturaDocumento>(`/facturas/${facturaId}`),
      empresaConfig ? Promise.resolve(empresaConfig) : apiFetch<EmpresaDocumento>('/config/sistema').catch(() => ({}))
    ]);
    if (!f) throw new Error('No se encontró la factura.');
    if (!f.venta) throw new Error('Esta factura no proviene de una venta POS; use Imprimir o PDF.');

    const venta = f.venta;
    const iva = Number(f.iva) || 0;
    const html = renderPosReceipt({
      empresaConfig: config ?? {},
      sedeNombre: f.sede?.nombre || '',
      sedeDireccion: f.sede?.direccion || '',
      cajeroNombre: venta.usuario?.nombre || '',
      clienteNombre: f.cliente?.nombre || 'Consumidor Final',
      clienteDocumento: f.cliente?.documento || '222222222',
      clienteDireccion: f.cliente?.direccion || '',
      numeroFactura: f.numeroFactura,
      fecha: venta.createdAt || f.createdAt,
      items: (venta.items || []).map((i) => ({
        cantidad: i.cantidad,
        nombre: i.producto?.nombre || 'Producto',
        subtotal: Number(i.subtotal) || 0,
        precioUnitario: i.precioModificado,
        precioBase: i.precioBase,
        descuentoPct: i.descuentoPct,
        imei: i.numeroSerie?.serie || null
      })),
      subtotal: Number(f.subtotal) || 0,
      descuentoTotal: Number(venta.descuentoTotal) || 0,
      iva,
      total: Number(f.total) || 0,
      cobrarIva: iva > 0,
      pagos: venta.pagos || [],
      esCredito: Boolean(venta.esCredito),
      esCopia: true
    });
    // Los códigos de barras se dibujan aquí (JsBarcode vive en esta ventana) y se copian como SVG.
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    renderReceiptBarcodes(tmp);

    popup.document.open();
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(f.numeroFactura)}</title>
      <link rel="stylesheet" href="/assets/css/custom.css">
      <style>
        body { margin: 0; padding: 12px; background: #fff; }
        .pos-receipt { margin: 0 auto; }
        .reprint-bar { text-align: center; margin-top: 12px; }
        @media print { .reprint-bar { display: none !important; } }
      </style>
    </head><body>
      ${tmp.innerHTML}
      <p class="reprint-bar">
        <button type="button" onclick="window.print()" style="padding:8px 16px;font-weight:600;cursor:pointer">Imprimir</button>
      </p>
    </body></html>`);
    popup.document.close();
    const imprimir = () => { popup.focus(); popup.print(); };
    if (popup.document.readyState === 'complete') setTimeout(imprimir, 150);
    else popup.addEventListener('load', () => setTimeout(imprimir, 150), { once: true });
  } catch (err) {
    popup.close();
    showToast('Error', errorMessage(err), 'error');
  }
}
