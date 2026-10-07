const { Op } = require('sequelize');
const {
  Producto,
  ComboComponente,
  StockSede,
  NumeroSerie
} = require('../models');

function normalizeComponentes(componentes) {
  if (!Array.isArray(componentes)) return [];
  return componentes.map((row) => ({
    productoId: String(row?.productoId || '').trim(),
    cantidad: Number.parseInt(row?.cantidad, 10)
  }));
}

async function validateComboComponents({ comboId, componentes, transaction }) {
  const normalized = normalizeComponentes(componentes);
  if (normalized.length < 2) {
    const error = new Error('Un combo debe tener al menos dos componentes.');
    error.status = 400;
    throw error;
  }

  const ids = normalized.map((row) => row.productoId);
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    const error = new Error('Los componentes del combo no pueden estar vacíos ni repetidos.');
    error.status = 400;
    throw error;
  }
  if (comboId && ids.includes(String(comboId))) {
    const error = new Error('Un combo no puede incluirse a sí mismo.');
    error.status = 400;
    throw error;
  }
  if (normalized.some((row) => !Number.isInteger(row.cantidad) || row.cantidad <= 0)) {
    const error = new Error('La cantidad de cada componente debe ser un entero mayor que cero.');
    error.status = 400;
    throw error;
  }

  const productos = await Producto.findAll({
    where: { id: { [Op.in]: ids }, activo: true },
    transaction
  });
  if (productos.length !== ids.length) {
    const error = new Error('Todos los componentes deben existir y estar activos.');
    error.status = 400;
    throw error;
  }

  const byId = new Map(productos.map((producto) => [String(producto.id), producto]));
  for (const row of normalized) {
    const producto = byId.get(row.productoId);
    if (producto.esCombo || producto.esServicio) {
      const error = new Error(`El componente ${producto.nombre} debe ser un producto físico y no puede ser otro combo.`);
      error.status = 400;
      throw error;
    }
  }

  const precioCosto = normalized.reduce((total, row) => {
    const producto = byId.get(row.productoId);
    return total + (Number.parseFloat(producto.precioCosto) || 0) * row.cantidad;
  }, 0);

  return { normalized, productos: byId, precioCosto };
}

async function replaceComboComponents(comboId, componentes, transaction) {
  await ComboComponente.destroy({ where: { comboId }, transaction });
  await ComboComponente.bulkCreate(
    componentes.map((row) => ({ comboId, productoId: row.productoId, cantidad: row.cantidad })),
    { transaction }
  );
}

async function recalculateParentComboCosts(productoId, transaction) {
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
      (total, row) => total + (Number.parseFloat(row.producto?.precioCosto) || 0) * Number.parseInt(row.cantidad, 10),
      0
    );
    await Producto.update({ precioCosto: costo }, { where: { id: comboId }, transaction });
  }
}

async function getComboAvailability(comboId, sedeId, { transaction, lock = false } = {}) {
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
    const stock = await StockSede.findOne({
      where: { productoId: componente.productoId, sedeId },
      transaction,
      ...(lock && transaction ? { lock: transaction.LOCK.UPDATE } : {})
    });
    let disponible = Number.parseInt(stock?.cantidad, 10) || 0;
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

module.exports = {
  normalizeComponentes,
  validateComboComponents,
  replaceComboComponents,
  recalculateParentComboCosts,
  getComboAvailability
};
