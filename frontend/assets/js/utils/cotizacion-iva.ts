export interface ItemIva { tieneIVA?: boolean; producto?: { tieneIVA?: boolean } | null; subtotal?: number | string; cantidad: number | string; precioUnitario: number | string; }
/**
 * IVA por ítem según producto.tieneIVA (precios con IVA incluido).
 */
function itemAplicaIva(item: ItemIva) {
  if (item.tieneIVA === false) return false;
  if (item.producto?.tieneIVA === false) return false;
  return true;
}

export function calcCotIvaItems(items: readonly ItemIva[] | null | undefined, ivaPct: number | string = 19) {
  const rate = parseFloat(String(ivaPct)) / 100;
  let base = 0;
  let iva = 0;
  let total = 0;

  for (const item of items || []) {
    const subtotal = parseFloat(String(item.subtotal))
      || (parseFloat(String(item.cantidad)) * parseFloat(String(item.precioUnitario)))
      || 0;
    total += subtotal;

    if (itemAplicaIva(item)) {
      const itemBase = Math.round(subtotal / (1 + rate));
      base += itemBase;
      iva += subtotal - itemBase;
    } else {
      base += subtotal;
    }
  }

  return { base, iva, total, ivaPct };
}

export function etiquetaIvaCot(iva: number, ivaPct: number | string = 19) {
  return iva > 0 ? `IVA (${ivaPct}%)` : 'IVA (Exento)';
}
