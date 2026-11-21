import type { Transaction } from 'sequelize';
import { httpError } from './http-error';
interface Componente { productoId: string; cantidad: number; }
import models = require('../models');
import { Op } from 'sequelize';
const {
  Producto,
  ComboComponente,
  StockSede,
  NumeroSerie
} = models;

export function normalizeComponentes(componentes: unknown): Componente[] {
  if (!Array.isArray(componentes)) return [];
  return componentes.map((value: unknown) => {
    const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    return {
    productoId: String(row?.productoId || '').trim(),
    cantidad: Number.parseInt(String(row?.cantidad), 10)
  }; });
}

export async function validateComboComponents({ comboId, componentes, transaction }: { comboId?: string; componentes: unknown; transaction?: Transaction }) {
  const normalized = normalizeComponentes(componentes);
  if (normalized.length < 2) {
    const error = httpError(400, 'Un combo debe tener al menos dos componentes.');
    throw error;
  }

  const ids = normalized.map((row) => row.productoId);
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    const error = httpError(400, 'Los componentes del combo no pueden estar vacíos ni repetidos.');
    throw error;
  }
  if (comboId && ids.includes(String(comboId))) {
    const error = httpError(400, 'Un combo no puede incluirse a sí mismo.');
    throw error;
  }
  if (normalized.some((row) => !Number.isInteger(row.cantidad) || row.cantidad <= 0)) {
    const error = httpError(400, 'La cantidad de cada componente debe ser un entero mayor que cero.');
    throw error;
  }

  const productos = await Producto.findAll({
    where: { id: { [Op.in]: ids }, activo: true },
    transaction
  });
  if (productos.length !== ids.length) {
    const error = httpError(400, 'Todos los componentes deben existir y estar activos.');
    throw error;
  }

  const byId = new Map(productos.map((producto) => [String(producto.id), producto]));
  for (const row of normalized) {
    const producto = byId.get(row.productoId);
    if (!producto) throw httpError(400, 'Componente no encontrado.');
    if (producto.esCombo || producto.esServicio) {
      const error = httpError(400, `El componente ${producto.nombre} debe ser un producto físico y no puede ser otro combo.`);
        throw error;
    }
  }

  const precioCosto = normalized.reduce((total, row) => {
    const producto = byId.get(row.productoId);
    if (!producto) throw httpError(400, 'Componente no encontrado.');
    return total + (Number.parseFloat(String(producto.precioCosto)) || 0) * row.cantidad;
  }, 0);

  return { normalized, productos: byId, precioCosto };
}

export async function replaceComboComponents(comboId: string, componentes: readonly Componente[], transaction?: Transaction) {
  await ComboComponente.destroy({ where: { comboId }, transaction });
  await ComboComponente.bulkCreate(
    componentes.map((row) => ({ comboId, productoId: row.productoId, cantidad: row.cantidad })),
    { transaction }
  );
}

export async function recalculateParentComboCosts(productoId: string, transaction?: Transaction) {
  const parents = await ComboComponente.findAll({
    where: { productoId },
    attributes: ['comboId'],
    transaction
  });
  for (const comboId of new Set(parents.map((row) => String(row.comboId)))) {
    const rows = await ComboComponente.findAll({
      where: { comboId },
      include: [{ model: Producto, as: 'producto', attributes: ['precioCosto'] }],
      transaction
    });
    const costo = rows.reduce(
      (total, row) => total + (Number.parseFloat(String(row.producto?.precioCosto)) || 0) * Number.parseInt(String(row.cantidad), 10),
      0
    );
    await Producto.update({ precioCosto: costo }, { where: { id: comboId }, transaction });
  }
}

export async function getComboAvailability(comboId: string, sedeId: string, { transaction, lock = false }: { transaction?: Transaction; lock?: boolean } = {}) {
  const componentes = await ComboComponente.findAll({
    where: { comboId },
    include: [{ model: Producto, as: 'producto', where: { activo: true } }],
    order: [['productoId', 'ASC']],
    transaction,
    ...(lock && transaction ? { lock: transaction.LOCK.UPDATE } : {})
  });
  if (componentes.length < 2) return { cantidad: 0, componentes: [] };

  let cantidad = Number.MAX_SAFE_INTEGER;
  const detalle = [];
  for (const componente of componentes) {
    if (!componente.producto) throw httpError(400, 'Componente no encontrado.');
    const stock = await StockSede.findOne({
      where: { productoId: componente.productoId, sedeId },
      transaction,
      ...(lock && transaction ? { lock: transaction.LOCK.UPDATE } : {})
    });
    let disponible = Number.parseInt(String(stock?.cantidad), 10) || 0;
    if (componente.producto.tieneNumeroSerie) {
      const seriales = await NumeroSerie.count({
        where: { productoId: componente.productoId, sedeId, estado: 'en_stock' },
        transaction
      });
      disponible = Math.min(disponible, seriales);
    }
    const armables = Math.floor(disponible / componente.cantidad);
    cantidad = Math.min(cantidad, armables);
    detalle.push({
      productoId: componente.productoId,
      nombre: componente.producto.nombre,
      cantidad: componente.cantidad,
      disponible,
      tieneNumeroSerie: !!componente.producto.tieneNumeroSerie,
      precioCosto: componente.producto.precioCosto
    });
  }

  return { cantidad: Math.max(0, cantidad), componentes: detalle };
}

