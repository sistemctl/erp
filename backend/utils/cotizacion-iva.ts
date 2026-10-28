interface CotItem { tieneIVA?: boolean | null; producto?: { tieneIVA?: boolean | null } | null; subtotal?: string | number | null; cantidad?: string | number | null; precioUnitario?: string | number | null; }
export function itemAplicaIva(item: CotItem) {
  if (item.tieneIVA === false) return false;
  if (item.producto?.tieneIVA === false) return false;
  return true;
}

export function calcCotIvaItems(items: readonly CotItem[] | null | undefined, ivaPct: number | string = 19) {
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

