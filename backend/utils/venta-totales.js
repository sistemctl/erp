const { httpError } = require('./http-error');
const money = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function amount(value, label) {
  const parsed = Number(value);
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '' || !Number.isFinite(parsed) || parsed < 0) {
    throw httpError(400, `${label} debe ser un monto válido y no negativo.`);
  }
  return money(parsed);
}

function calculateSale(items, products, config = {}) {
  const rate = amount(config.ivaDefecto ?? 19, 'IVA') / 100;
  let subtotal = 0, descuentoTotal = 0, iva = 0;
  const lines = items.map((item) => {
    const product = products.get(String(item.productoId));
    const cantidad = Number(item.cantidad);
    if (!['number', 'string'].includes(typeof item.cantidad) || !Number.isSafeInteger(cantidad) || cantidad <= 0) throw httpError(400, 'La cantidad debe ser un entero mayor que cero.');
    if (product.tieneNumeroSerie && !product.esCombo && !product.esServicio && cantidad !== 1) {
      throw httpError(400, 'Agregue cada equipo serializado como una línea individual con su IMEI.');
    }
    const precioBase = amount(product.precioVenta, 'Precio de catálogo');
    const precioModificado = amount(item.precioModificado ?? precioBase, 'Precio de venta');
    const descuentoPct = precioBase > 0 ? money(Math.max(0, (1 - precioModificado / precioBase) * 100)) : 0;
    const baseLinea = money(precioBase * cantidad);
    const subtotalLinea = money(precioModificado * cantidad);
    const ivaLinea = config.cobrarIvaPos !== false && product.tieneIVA !== false ? money(subtotalLinea * rate) : 0;
    subtotal = money(subtotal + baseLinea);
    descuentoTotal = money(descuentoTotal + baseLinea - subtotalLinea);
    iva = money(iva + ivaLinea);
    return { ...item, cantidad, precioBase, precioModificado, descuentoPct, subtotal: subtotalLinea,
      // Se conserva el contrato histórico: ItemVenta.iva es el IVA por unidad.
      iva: ivaLinea / cantidad };
  });
  return { items: lines, subtotal, descuentoTotal, iva, total: money(subtotal - descuentoTotal + iva) };
}

function normalizePayments(pagos, total, credit) {
  if (!Array.isArray(pagos)) throw httpError(400, 'El desglose de pagos debe ser una lista.');
  const rows = pagos.map((pago) => ({ ...pago, monto: amount(pago.monto, 'Pago') })).filter((pago) => pago.monto > 0);
  let paid = money(rows.reduce((sum, pago) => sum + pago.monto, 0));
  if (!credit && paid < total) throw httpError(400, 'El pago no cubre el total de la venta.');
  const change = money(Math.max(0, paid - total));
  if (change > 0) {
    const cash = money(rows.filter((pago) => pago.metodo === 'efectivo').reduce((sum, pago) => sum + pago.monto, 0));
    if (change > cash) throw httpError(400, 'El exceso de pago solo puede devolverse del efectivo recibido.');
    let remaining = change;
    for (const row of rows) {
      if (row.metodo === 'efectivo') {
        const deduction = Math.min(row.monto, remaining);
        row.monto = money(row.monto - deduction);
        remaining = money(remaining - deduction);
      }
    }
    paid = money(paid - change);
  }
  return { pagos: rows.filter((row) => row.monto > 0), paid, change };
}
module.exports = { amount, money, calculateSale, normalizePayments };
