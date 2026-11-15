import models = require('../models');
import type { Handler } from '../types/controller';
import { requireUser } from '../utils/request-user';
import type { Attributes, CreationAttributes, WhereOptions } from 'sequelize';
import type SerieModel = require('../models/NumeroSerie');
import { transactionFinished } from '../utils/transaction-state';
type Body = Partial<CreationAttributes<SerieModel>> & { series?: string[] };
const { NumeroSerie, Producto, Sede, Cliente, Venta, OrdenReparacion, StockSede, sequelize } = models;
import { assertSedeAccess, resolveQuerySede } from '../utils/sede';

export const getSeries: Handler<Body> = async (req, res, next) => {
  try {
    const { producto } = req.query;
    const where: WhereOptions<Attributes<SerieModel>> = {};
    const sedeId = resolveQuerySede(req.query.sedeId || req.query.sede, requireUser(req));
    if (sedeId) where.sedeId = sedeId;
    if (producto) {
      where.productoId = producto;
    }

    const series = await NumeroSerie.findAll({
      where,
      include: [
        { model: Producto, as: 'producto', attributes: ['nombre', 'codigoBarras'] },
        { model: Sede, as: 'sede', attributes: ['nombre'] },
        { model: Cliente, as: 'cliente', attributes: ['nombre', 'telefono'] }
      ],
      order: [['serie', 'ASC']]
    });

    return res.json(series);
  } catch (error) {
    next(error);
  }
};

/**
 * Ajusta StockSede tras registrar seriales nuevos.
 * Si en la sede ya había unidades contadas sin serial (p. ej. recibidas en una compra
 * sin IMEI), los seriales nuevos se asignan a esas unidades y el stock NO sube.
 * Solo sube por la diferencia entre seriales en stock y unidades contadas.
 */
async function sincronizarStockConSeries(
  productoId: string,
  sedeId: string,
  serialesRegistrados: number,
  usuarioId: string,
  transaction: import('sequelize').Transaction
) {
  const stock = await StockSede.findOne({
    where: { productoId, sedeId },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  const enStock = await NumeroSerie.count({
    where: { productoId, sedeId, estado: 'en_stock' },
    transaction
  });
  const cantidadActual = stock ? Number(stock.cantidad) || 0 : 0;
  const entradas = Math.max(0, enStock - cantidadActual);
  const asignados = serialesRegistrados - entradas;

  if (entradas > 0) {
    if (stock) {
      await stock.update({ cantidad: cantidadActual + entradas }, { transaction });
    } else {
      await StockSede.create({ productoId, sedeId, cantidad: entradas }, { transaction });
    }
    const { MovimientoInventario } = models;
    await MovimientoInventario.create({
      productoId,
      sedeId,
      tipo: 'entrada',
      cantidad: entradas,
      motivo: serialesRegistrados === 1
        ? 'Ingreso de Serie/IMEI'
        : `Ingreso de ${entradas} Series/IMEIs`,
      usuarioId
    }, { transaction });
  }
  return { entradas, asignados };
}

export const createSerie: Handler<Body> = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  req.auditTransaction = transaction;
  try {
    const { serie, productoId, sedeId } = req.body;

    if (!serie || !productoId || !sedeId) {
      return res.status(400).json({ error: 'Faltan parámetros obligatorios.' });
    }
    assertSedeAccess(requireUser(req), sedeId);

    const producto = await Producto.findByPk(productoId, { transaction });
    if (!producto || producto.esCombo) {
      await transaction.rollback();
      return res.status(400).json({ error: producto?.esCombo
        ? 'Los combos no tienen seriales propios; los seriales pertenecen a sus componentes.'
        : 'Producto no encontrado.' });
    }

    // Verificar unicidad
    const existe = await NumeroSerie.findOne({ where: { serie }, transaction });
    if (existe) {
      return res.status(400).json({ error: 'Este número de serie/IMEI ya está registrado.' });
    }

    const numeroSerie = await NumeroSerie.create({
      serie,
      productoId,
      sedeId,
      estado: 'en_stock'
    }, { transaction });

    // Sincronizar StockSede (sin duplicar unidades ya contadas sin serial)
    await sincronizarStockConSeries(String(productoId), String(sedeId), 1, requireUser(req).userId, transaction);

    await transaction.commit();

    if (req.logAudit) {
      await req.logAudit({
        accion: 'CREATE',
        modulo: 'Series',
        registroId: numeroSerie.id,
        valorNuevo: numeroSerie.toJSON()
      });
    }

    return res.status(201).json(numeroSerie);
  } catch (error) {
    if (!transactionFinished(transaction)) await transaction.rollback();
    next(error);
  } finally {
    if (!transactionFinished(transaction)) await transaction.rollback();
  }
};

export const getHistorialImei: Handler<Body> = async (req, res, next) => {
  try {
    const { imei } = req.params;

    const serieInfo = await NumeroSerie.findOne({
      where: { serie: imei },
      include: [
        { model: Producto, as: 'producto', attributes: ['nombre', 'codigoBarras'] },
        { model: Sede, as: 'sede', attributes: ['nombre'] },
        { model: Cliente, as: 'cliente', attributes: ['nombre', 'telefono', 'email'] }
      ]
    });

    if (!serieInfo) {
      return res.status(404).json({ error: 'Número de serie/IMEI no encontrado en el sistema.' });
    }
    assertSedeAccess(requireUser(req), serieInfo.sedeId);

    // Obtener órdenes de reparación vinculadas
    const reparaciones = await OrdenReparacion.findAll({
      where: { imei },
      attributes: ['id', 'numeroOrden', 'createdAt', 'estado', 'totalCobrado', 'diagnostico'],
      order: [['createdAt', 'DESC']]
    });

    return res.json({
      info: serieInfo,
      reparaciones
    });
  } catch (error) {
    next(error);
  }
};

export const createSeriesBulk: Handler<Body> = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  req.auditTransaction = transaction;
  try {
    const { series, productoId, sedeId } = req.body;

    if (!series || !Array.isArray(series) || series.length === 0 || !productoId || !sedeId) {
      return res.status(400).json({ error: 'Faltan parámetros obligatorios o formato inválido.' });
    }
    assertSedeAccess(requireUser(req), sedeId);

    const producto = await Producto.findByPk(productoId, { transaction });
    if (!producto || producto.esCombo) {
      await transaction.rollback();
      return res.status(400).json({ error: producto?.esCombo
        ? 'Los combos no tienen seriales propios; los seriales pertenecen a sus componentes.'
        : 'Producto no encontrado.' });
    }

    // Limpiar seriales (remover duplicados y espacios en blanco)
    const serialesLimpios = [...new Set(series.map(s => s.trim()).filter(s => s.length > 0))];

    if (serialesLimpios.length === 0) {
      return res.status(400).json({ error: 'No se ingresaron números de serie válidos.' });
    }

    // Verificar si alguno ya existe en la base de datos
    const existentes = await NumeroSerie.findAll({
      where: {
        serie: serialesLimpios
      },
      transaction
    });

    if (existentes.length > 0) {
      const listaExistentes = existentes.map(e => e.serie).join(', ');
      return res.status(400).json({ error: `Los siguientes números de serie ya están registrados: ${listaExistentes}` });
    }

    // Crear los registros en lote
    const nuevosRegistros = serialesLimpios.map(s => ({
      serie: s,
      productoId,
      sedeId,
      estado: 'en_stock' as const
    }));

    const creados = await NumeroSerie.bulkCreate(nuevosRegistros, { transaction });

    // Sincronizar StockSede (sin duplicar unidades ya contadas sin serial)
    const { entradas, asignados } = await sincronizarStockConSeries(
      String(productoId), String(sedeId), creados.length, requireUser(req).userId, transaction
    );

    await transaction.commit();

    if (req.logAudit) {
      await req.logAudit({
        accion: 'CREATE',
        modulo: 'Series',
        valorNuevo: { cantidad: creados.length, series: serialesLimpios }
      });
    }

    return res.status(201).json({
      message: asignados > 0
        ? `${creados.length} números de serie registrados: ${asignados} asignados a unidades ya existentes y ${entradas} como ingreso nuevo de stock.`
        : `${creados.length} números de serie registrados exitosamente.`,
      cantidad: creados.length,
      entradasStock: entradas,
      asignadosAStockExistente: asignados
    });
  } catch (error) {
    if (!transactionFinished(transaction)) await transaction.rollback();
    next(error);
  } finally {
    if (!transactionFinished(transaction)) await transaction.rollback();
  }
};

export const deleteSerie: Handler<Body> = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  req.auditTransaction = transaction;
  try {
    const { id } = req.params;

    const serieReg = await NumeroSerie.findByPk(id, { transaction });
    if (!serieReg) {
      return res.status(404).json({ error: 'Número de serie/IMEI no encontrado.' });
    }

    const { productoId, sedeId, estado, serie } = serieReg;
    assertSedeAccess(requireUser(req), sedeId);
    if (!['en_stock', 'reacondicionado'].includes(estado)) {
      return res.status(409).json({ error: 'No se puede borrar un serial vendido, instalado o en reparación.' });
    }

    // Solo descontar stock si el serial estaba en stock
    if (estado === 'en_stock') {
      const stock = await StockSede.findOne({
        where: { productoId, sedeId },
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      if (stock) {
        const nuevaCantidad = Math.max(0, stock.cantidad - 1);
        await stock.update({ cantidad: nuevaCantidad }, { transaction });
      }

      // Registrar Movimiento Inventario de salida
      const { MovimientoInventario } = models;
      await MovimientoInventario.create({
        productoId,
        sedeId,
        tipo: 'salida',
        cantidad: -1,
        motivo: `Eliminación/Anulación de Serie/IMEI: ${serie}`,
        usuarioId: requireUser(req).userId
      }, { transaction });
    }

    const valorAnterior = serieReg.toJSON();
    await serieReg.destroy({ transaction });

    await transaction.commit();

    if (req.logAudit) {
      await req.logAudit({
        accion: 'DELETE',
        modulo: 'Series',
        registroId: id,
        valorAnterior
      });
    }

    return res.json({ message: 'Número de serie/IMEI eliminado exitosamente.' });
  } catch (error) {
    if (!transactionFinished(transaction)) await transaction.rollback();
    next(error);
  } finally {
    if (!transactionFinished(transaction)) await transaction.rollback();
  }
};
