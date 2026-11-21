import type { Transaction } from 'sequelize';
import type ItemVenta = require('../models/ItemVenta');
import type Venta = require('../models/Venta');
import type Devolucion = require('../models/DevolucionVenta');
import { httpError } from './http-error';
interface DevolverCombo { item: ItemVenta; cantidad: number; yaDev: number; venta: Venta; devolucion: Pick<Devolucion, 'id'>; numero: string; usuarioId: string; transaction: Transaction; }
import models = require('../models');
const { Producto, StockSede, MovimientoInventario, NumeroSerie, ItemVentaComponente } = models;
import { Op } from 'sequelize';

export async function devolverComponentesCombo({ item, cantidad, yaDev, venta, devolucion, numero, usuarioId, transaction }: DevolverCombo) {
  const unidades = new Set(Array.from({ length: cantidad }, (_, index) => yaDev + index + 1));
  const snapshots = (item.componentesVendidos || []).filter(
    (row) => !row.devuelto && unidades.has(Number.parseInt(String(row.unidadCombo), 10))
  );
  if (snapshots.length === 0 || unidades.size !== new Set(snapshots.map((row) => row.unidadCombo)).size) {
    const error = httpError(400, `No se encontró el detalle original completo del combo ${item.producto?.nombre || ''}.`);
    throw error;
  }

  const porProducto = new Map<string, { cantidad: number; seriales: string[] }>();
  for (const row of snapshots) {
    const key = String(row.productoId);
    if (!porProducto.has(key)) porProducto.set(key, { cantidad: 0, seriales: [] });
    const group = porProducto.get(key);
    if (!group) throw new Error("Grupo de devolución ausente.");
    group.cantidad += Number.parseInt(String(row.cantidad), 10);
    if (row.numeroSerieId) group.seriales.push(row.numeroSerieId);
  }

  for (const [productoId, detalle] of [...porProducto.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const producto = await Producto.findByPk(productoId, { transaction });
    const [stock] = await StockSede.findOrCreate({
      where: { productoId, sedeId: venta.sedeId },
      defaults: { productoId, sedeId: venta.sedeId, cantidad: 0 },
      transaction
    });
    await stock.reload({ transaction, lock: transaction.LOCK.UPDATE });
    await stock.update({ cantidad: Number.parseInt(String(stock.cantidad), 10) + detalle.cantidad }, { transaction });

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
        const error = httpError(400, `El serial registrado de ${producto?.nombre || 'un componente'} no puede devolverse porque ya no figura como vendido.`);
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

