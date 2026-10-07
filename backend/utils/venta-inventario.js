const { Producto, StockSede, MovimientoInventario, NumeroSerie, ItemVentaComponente } = require('../models');
const { Op } = require('sequelize');

async function devolverComponentesCombo({ item, cantidad, yaDev, venta, devolucion, numero, usuarioId, transaction }) {
  const unidades = new Set(Array.from({ length: cantidad }, (_, index) => yaDev + index + 1));
  const snapshots = (item.componentesVendidos || []).filter(
    (row) => !row.devuelto && unidades.has(Number.parseInt(row.unidadCombo, 10))
  );
  if (snapshots.length === 0 || unidades.size !== new Set(snapshots.map((row) => row.unidadCombo)).size) {
    const error = new Error(`No se encontró el detalle original completo del combo ${item.producto?.nombre || ''}.`);
    error.status = 400;
    throw error;
  }

  const porProducto = new Map();
  for (const row of snapshots) {
    const key = String(row.productoId);
    if (!porProducto.has(key)) porProducto.set(key, { cantidad: 0, seriales: [] });
    const group = porProducto.get(key);
    group.cantidad += Number.parseInt(row.cantidad, 10);
    if (row.numeroSerieId) group.seriales.push(row.numeroSerieId);
  }

  for (const [productoId, detalle] of [...porProducto.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const producto = await Producto.findByPk(productoId, { transaction });
    const [stock] = await StockSede.findOrCreate({
      where: { productoId, sedeId: venta.sedeId },
      defaults: { cantidad: 0 },
      transaction
    });
    await stock.reload({ transaction, lock: transaction.LOCK.UPDATE });
    await stock.update({ cantidad: Number.parseInt(stock.cantidad, 10) + detalle.cantidad }, { transaction });

    await MovimientoInventario.create({
      productoId,
      sedeId: venta.sedeId,
      tipo: 'entrada',
      cantidad: detalle.cantidad,
      motivo: `Devolución ${numero} · Combo ${item.producto?.nombre || 'vendido'} (venta ${venta.numeroVenta})`,
      referenciaId: devolucion.id,
      usuarioId
    }, { transaction });

    for (const numeroSerieId of detalle.seriales) {
      const serie = await NumeroSerie.findByPk(numeroSerieId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!serie || serie.estado !== 'vendido') {
        const error = new Error(`El serial registrado de ${producto?.nombre || 'un componente'} no puede devolverse porque ya no figura como vendido.`);
        error.status = 400;
        throw error;
      }
      await serie.update({ estado: 'en_stock', clienteId: null, fechaVenta: null }, { transaction });
    }
  }

  await ItemVentaComponente.update(
    { devuelto: true },
    { where: { id: { [Op.in]: snapshots.map((row) => row.id) } }, transaction }
  );
}

module.exports = { devolverComponentesCombo };
