function itemAplicaIva(item) {
  if (item.tieneIVA === false) return false;
  if (item.producto?.tieneIVA === false) return false;
  return true;
}

function calcCotIvaItems(items, ivaPct = 19) {
  const rate = parseFloat(ivaPct) / 100;
  let base = 0;
  let iva = 0;
  let total = 0;

  for (const item of items || []) {
    const subtotal = parseFloat(item.subtotal)
      || (parseFloat(item.cantidad) * parseFloat(item.precioUnitario))
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

function etiquetaIvaCot(iva, ivaPct = 19) {
  return iva > 0 ? `IVA (${ivaPct}%)` : 'IVA (Exento)';
}

module.exports = { calcCotIvaItems, etiquetaIvaCot, itemAplicaIva };
