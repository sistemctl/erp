import type { Handler } from '../types/controller';
import { requireUser } from '../utils/request-user';
import { transactionFinished } from '../utils/transaction-state';
import type { Attributes, WhereOptions } from 'sequelize';
import type CompraModel = require('../models/OrdenCompra');
import type PagoModel = require('../models/PagoCompra');
interface CompraItem { productoId: string; cantidadPedida?: number | string; precioUnitario?: number | string; cantidadRecibida?: number | string; cantidadDevolver?: number | string; series?: string[]; }
interface Body { proveedorId?: string; sedeId?: string; fechaEsperada?: string; observaciones?: string; items?: CompraItem[]; monto?: number | string; fuenteFondos?: Attributes<PagoModel>['fuenteFondos']; pagadoPor?: string; referencia?: string; }
import { assertSedeAccess } from '../utils/sede';
import models = require('../models');
const {
  OrdenCompra,
  ItemOrdenCompra,
  Proveedor,
  Usuario,
  Sede,
  Producto,
  StockSede,
  MovimientoInventario,
  Caja,
  EgresoCaja,
  CategoriaEgreso,
  PagoCompra,
  NumeroSerie,
  sequelize
} = models;
import { Op } from 'sequelize';
import { resolveQuerySede, resolveActionSede } from '../utils/sede';
import { findCajaAbierta } from '../utils/caja-abierta';

const FUENTES_VALIDAS = ['caja_efectivo', 'efectivo_externo', 'transferencia_empresa', 'otro'];

// --- GET ALL COMPRAS ---
export const getCompras: Handler<Body> = async (req, res, next) => {
  try {
    const { proveedor, sede, estado, estadoPago } = req.query;
    const where: WhereOptions<Attributes<CompraModel>> = {};

    const querySedeId = resolveQuerySede(sede, requireUser(req));
    if (querySedeId) {
      where.sedeId = querySedeId;
    }

    if (proveedor) where.proveedorId = proveedor;
    if (estado) where.estado = estado as Attributes<CompraModel>['estado'];
    if (estadoPago) where.estadoPago = estadoPago as Attributes<CompraModel>['estadoPago'];

    const compras = await OrdenCompra.findAll({
      where,
      include: [
        { model: Proveedor, as: 'proveedor', attributes: ['nombre', 'nit'] },
        { model: Usuario, as: 'usuario', attributes: ['nombre'] },
        { model: Sede, as: 'sede', attributes: ['nombre'] },
        {
          model: ItemOrdenCompra,
          as: 'items',
          include: [{ model: Producto, as: 'producto', attributes: ['nombre', 'codigoBarras', 'tieneNumeroSerie'] }]
        },
        {
          model: PagoCompra,
          as: 'pagos',
          separate: true,
          order: [['createdAt', 'DESC']],
          include: [{ model: Usuario, as: 'usuario', attributes: ['nombre'] }]
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    return res.json(compras);
  } catch (error) {
    next(error);
  }
};

// --- CREATE ORDEN COMPRA ---
export const createCompra: Handler<Body> = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  req.auditTransaction = transaction;
  try {
    const { proveedorId, fechaEsperada, observaciones, items, sedeId: bodySedeId } = req.body;
    const sedeId = await resolveActionSede(bodySedeId, requireUser(req), Sede, transaction);
    const usuarioId = requireUser(req).userId;

    if (!proveedorId || !items || items.length === 0) {
      return res.status(400).json({ error: 'Faltan parámetros obligatorios para registrar la compra.' });
    }

    if (!sedeId) {
      return res.status(400).json({ error: 'Debe seleccionar la sede destino para la orden de compra.' });
    }

    // Calcular total
    let total = 0;
    for (const item of items) {
      if (!item.productoId || !item.cantidadPedida || parseFloat(String(item.precioUnitario)) <= 0) {
        throw new Error('Artículos incompletos o precio unitario inválido.');
      }
      const producto = await Producto.findByPk(item.productoId, { transaction });
      if (!producto || producto.esCombo) {
        throw new Error(producto?.esCombo
          ? `El combo ${producto.nombre} no se puede comprar directamente; compre sus componentes.`
          : 'Uno de los productos de la compra no existe.');
      }
      total += parseInt(String(item.cantidadPedida)) * parseFloat(String(item.precioUnitario));
    }

    const fechaVencimientoPago = new Date();
    fechaVencimientoPago.setDate(fechaVencimientoPago.getDate() + 30); // 30 días de plazo por defecto

    // Crear orden
    const orden = await OrdenCompra.create({
      proveedorId,
      usuarioId,
      sedeId,
      total,
      estado: 'pendiente',
      estadoPago: 'pendiente',
      fechaVencimientoPago,
      saldoPendiente: total,
      fechaEsperada: fechaEsperada ? new Date(fechaEsperada) : null,
      observaciones
    }, { transaction });

    // Crear items
    for (const item of items) {
      await ItemOrdenCompra.create({
        ordenCompraId: orden.id,
        productoId: item.productoId,
        cantidadPedida: parseInt(String(item.cantidadPedida)),
        cantidadRecibida: 0,
        precioUnitario: parseFloat(String(item.precioUnitario))
      }, { transaction });
    }

    await transaction.commit();

    if (req.logAudit) {
      await req.logAudit({
        accion: 'CREATE',
        modulo: 'Compras',
        registroId: orden.id,
        valorNuevo: orden.toJSON()
      });
    }

    return res.status(201).json(orden);
  } catch (error) {
    if (!transactionFinished(transaction)) await transaction.rollback();
    next(error);
  } finally {
    if (!transactionFinished(transaction)) await transaction.rollback();
  }
};

// --- RECEPCIÓN DE MERCANCÍA (AFECTA STOCK) ---
export const recibirCompra: Handler<Body> = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  req.auditTransaction = transaction;
  try {
    const { id } = req.params;
    const { items } = req.body; // array of { productoId, cantidadRecibida }

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Debe especificar los ítems y cantidades recibidas.' });
    }

    const orden = await OrdenCompra.findByPk(id, {
      include: [{ model: ItemOrdenCompra, as: 'items' }],
      transaction, lock: { level: transaction.LOCK.UPDATE, of: OrdenCompra }
    });
    if (orden) assertSedeAccess(requireUser(req), orden.sedeId);

    if (!orden) {
      return res.status(404).json({ error: 'Orden de compra no encontrada.' });
    }

    if (orden.estado === 'recibida') {
      return res.status(400).json({ error: 'Esta orden de compra ya fue totalmente recibida.' });
    }

    if (!orden.items) throw new Error('La orden no conserva sus artículos.');
    let todasCompletas = true;

    for (const recItem of items) {
      const dbItem = orden.items.find(i => i.productoId === recItem.productoId);
      if (!dbItem) continue;

      const nuevaCantidadRecibida = parseInt(String(dbItem.cantidadRecibida)) + parseInt(String(recItem.cantidadRecibida));
      if (nuevaCantidadRecibida > dbItem.cantidadPedida) {
        throw new Error(`La cantidad recibida total supera la cantidad pedida para el producto ID: ${recItem.productoId}.`);
      }

      const producto = await Producto.findByPk(recItem.productoId, { transaction });
      if (producto && recItem.series && Array.isArray(recItem.series) && recItem.series.length > 0) {
        const cant = parseInt(String(recItem.cantidadRecibida));
        if (recItem.series.length !== cant) {
          throw new Error(`Debe especificar exactamente ${cant} seriales para el producto ${producto.nombre}.`);
        }

        // Verificar si alguno ya existe
        const existentes = await NumeroSerie.findAll({
          where: { serie: recItem.series },
          transaction
        });
        if (existentes.length > 0) {
          const listEx = existentes.map(e => e.serie).join(', ');
          throw new Error(`Los siguientes seriales ya están registrados en el sistema: ${listEx}`);
        }

        // Crear las series en la base de datos
        const registrosSeries = recItem.series.map(s => ({
          serie: s,
          productoId: recItem.productoId,
          sedeId: orden.sedeId,
          estado: 'en_stock' as const
        }));
        await NumeroSerie.bulkCreate(registrosSeries, { transaction });
      }

      await dbItem.update({ cantidadRecibida: nuevaCantidadRecibida }, { transaction });

      // Actualizar Stock en la Sede
      const stock = await StockSede.findOne({
        where: { productoId: recItem.productoId, sedeId: orden.sedeId },
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      if (stock) {
        await stock.update({ cantidad: stock.cantidad + parseInt(String(recItem.cantidadRecibida)) }, { transaction });
      } else {
        await StockSede.create({
          productoId: recItem.productoId,
          sedeId: orden.sedeId,
          cantidad: parseInt(String(recItem.cantidadRecibida))
        }, { transaction });
      }

      // Registrar Movimiento Inventario
      await MovimientoInventario.create({
        productoId: recItem.productoId,
        sedeId: orden.sedeId,
        tipo: 'entrada',
        cantidad: parseInt(String(recItem.cantidadRecibida)),
        motivo: `Recepción de Orden de Compra ID: ${orden.id}`,
        referenciaId: orden.id,
        usuarioId: requireUser(req).userId
      }, { transaction });

      if (nuevaCantidadRecibida < dbItem.cantidadPedida) {
        todasCompletas = false;
      }
    }

    // Comprobar si faltó algún ítem por recibir en la orden
    for (const dbItem of orden.items) {
      const match = items.find(i => i.productoId === dbItem.productoId);
      const totalRec = match ? (parseInt(String(dbItem.cantidadRecibida)) + parseInt(String(match.cantidadRecibida))) : parseInt(String(dbItem.cantidadRecibida));
      if (totalRec < dbItem.cantidadPedida) {
        todasCompletas = false;
      }
    }

    await orden.update({
      estado: todasCompletas ? 'recibida' : 'parcial'
    }, { transaction });

    await transaction.commit();

    if (req.logAudit) {
      await req.logAudit({
        accion: 'UPDATE',
        modulo: 'Compras',
        registroId: id,
        valorNuevo: { estado: orden.estado, recibidos: items }
      });
    }

    return res.json({ message: 'Mercancía recibida e inventario actualizado con éxito.', estado: orden.estado });
  } catch (error) {
    if (!transactionFinished(transaction)) await transaction.rollback();
    next(error);
  } finally {
    if (!transactionFinished(transaction)) await transaction.rollback();
  }
};

// --- REGISTRAR ABONO / PAGO A CUENTAS POR PAGAR ---
export const registrarPagoCompra: Handler<Body> = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  req.auditTransaction = transaction;
  try {
    const { id } = req.params;
    const { monto, fuenteFondos, pagadoPor, referencia } = req.body;

    if (!monto || parseFloat(String(monto)) <= 0) {
      return res.status(400).json({ error: 'Monto de pago inválido.' });
    }

    const fuente = fuenteFondos || 'caja_efectivo';
    if (!FUENTES_VALIDAS.includes(fuente)) {
      return res.status(400).json({ error: 'Origen del dinero no válido.' });
    }

    const orden = await OrdenCompra.findByPk(id, { transaction, lock: { level: transaction.LOCK.UPDATE, of: OrdenCompra } });
    if (orden) assertSedeAccess(requireUser(req), orden.sedeId);
    if (!orden) {
      return res.status(404).json({ error: 'Orden de compra no encontrada.' });
    }

    const saldoActual = parseFloat(String(orden.saldoPendiente));
    if (saldoActual <= 0) {
      return res.status(400).json({ error: 'Esta cuenta por pagar ya se encuentra totalmente cancelada.' });
    }

    const abonoNum = parseFloat(String(monto));
    if (abonoNum > saldoActual) {
      return res.status(400).json({ error: `El monto supera el saldo pendiente (${saldoActual}).` });
    }

    const nuevoSaldo = saldoActual - abonoNum;
    const nuevoEstadoPago = nuevoSaldo === 0 ? 'pagado' : 'abono_parcial';

    await orden.update({
      saldoPendiente: nuevoSaldo,
      estadoPago: nuevoEstadoPago
    }, { transaction });

    const pagoCompra = await PagoCompra.create({
      ordenCompraId: orden.id,
      usuarioId: requireUser(req).userId,
      monto: abonoNum,
      fuenteFondos: fuente,
      pagadoPor: pagadoPor?.trim() || null,
      referencia: referencia?.trim() || null
    }, { transaction });

    let egresoCreado = false;

    if (fuente === 'caja_efectivo') {
      const { caja } = await findCajaAbierta({
        sedeId: orden.sedeId,
        usuarioId: requireUser(req).userId,
        transaction
      });

      if (!caja) {
        await transaction.rollback();
        return res.status(400).json({
          error: 'No hay caja abierta en esta sede. Elija otro origen del dinero o abra la caja.'
        });
      }

      let categoria = await CategoriaEgreso.findOne({
        where: { nombre: { [Op.iLike]: '%proveedor%' }, activa: true },
        transaction
      });
      if (!categoria) {
        categoria = await CategoriaEgreso.findOne({ where: { activa: true }, transaction });
      }
      if (!categoria) {
        await transaction.rollback();
        return res.status(400).json({ error: 'No hay categorías de egreso configuradas en el sistema.' });
      }

      const proveedorNombre = await Proveedor.findByPk(orden.proveedorId, {
        attributes: ['nombre'],
        transaction
      });

      const egreso = await EgresoCaja.create({
        cajaId: caja.id,
        monto: abonoNum,
        categoriaId: categoria.id,
        motivo: `Pago a proveedor ${proveedorNombre?.nombre || ''} — OC ${orden.id.slice(0, 8).toUpperCase()}`,
        usuarioId: requireUser(req).userId,
        pagoCompraId: pagoCompra.id
      }, { transaction });

      await caja.update({
        totalEgresos: parseFloat(String(caja.totalEgresos)) + abonoNum
      }, { transaction });

      egresoCreado = true;
    }

    await transaction.commit();

    if (req.logAudit) {
      await req.logAudit({
        accion: 'UPDATE',
        modulo: 'Compras',
        registroId: id,
        valorNuevo: {
          pagoId: pagoCompra.id,
          abono: abonoNum,
          fuenteFondos: fuente,
          saldoPendiente: nuevoSaldo,
          estadoPago: nuevoEstadoPago,
          egresoCaja: egresoCreado
        }
      });
    }

    const mensajes = {
      caja_efectivo: egresoCreado
        ? 'Pago registrado y descontado de la caja abierta.'
        : 'Pago registrado.',
      efectivo_externo: 'Pago registrado con dinero externo (sin afectar la caja).',
      transferencia_empresa: 'Pago registrado por transferencia de la empresa (sin afectar la caja).',
      otro: 'Pago registrado (sin afectar la caja).'
    };

    return res.json({
      message: mensajes[fuente],
      pago: pagoCompra,
      saldoPendiente: nuevoSaldo,
      estadoPago: nuevoEstadoPago
    });
  } catch (error) {
    if (!transactionFinished(transaction)) await transaction.rollback();
    next(error);
  } finally {
    if (!transactionFinished(transaction)) await transaction.rollback();
  }
};

export const devolverMercancia: Handler<Body> = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  req.auditTransaction = transaction;
  try {
    const { id } = req.params;
    const { items } = req.body; // array of { productoId, cantidadDevolver, series }

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Debe especificar los ítems y cantidades a devolver.' });
    }

    const orden = await OrdenCompra.findByPk(id, {
      include: [{ model: ItemOrdenCompra, as: 'items' }],
      transaction, lock: { level: transaction.LOCK.UPDATE, of: OrdenCompra }
    });
    if (orden) assertSedeAccess(requireUser(req), orden.sedeId);

    if (!orden) {
      return res.status(404).json({ error: 'Orden de compra no encontrada.' });
    }

    if (orden.estado === 'pendiente') {
      return res.status(400).json({ error: 'No se puede devolver mercancía de una orden que está pendiente de recibir.' });
    }

    if (!orden.items) throw new Error('La orden no conserva sus artículos.');
    for (const devItem of items) {
      const dbItem = orden.items.find(i => i.productoId === devItem.productoId);
      if (!dbItem) continue;

      const cantidadDev = parseInt(String(devItem.cantidadDevolver || 0));
      if (cantidadDev <= 0) continue;

      if (cantidadDev > Number(dbItem.cantidadRecibida)) {
        throw new Error(`La cantidad a devolver supera la cantidad recibida para el producto ID: ${devItem.productoId}.`);
      }

      // Si es serializado, verificar y eliminar las series
      const producto = await Producto.findByPk(devItem.productoId, { transaction });
      if (producto && producto.tieneNumeroSerie) {
        if (!devItem.series || !Array.isArray(devItem.series) || devItem.series.length !== cantidadDev) {
          throw new Error(`Debe especificar exactamente ${cantidadDev} seriales a devolver para el producto ${producto.nombre}.`);
        }

        // Buscar las series en stock
        const seriesRegs = await NumeroSerie.findAll({
          where: {
            serie: devItem.series,
            productoId: devItem.productoId,
            sedeId: orden.sedeId,
            estado: 'en_stock'
          },
          transaction
        });

        if (seriesRegs.length !== cantidadDev) {
          throw new Error(`Alguno de los seriales ingresados para ${producto.nombre} no existe en stock o ya fue vendido.`);
        }

        // Eliminar las series
        for (const s of seriesRegs) {
          await s.destroy({ transaction });
        }
      }

      const nuevaCantidadRecibida = parseInt(String(dbItem.cantidadRecibida)) - cantidadDev;
      await dbItem.update({ cantidadRecibida: nuevaCantidadRecibida }, { transaction });

      // Actualizar Stock en la Sede
      const stock = await StockSede.findOne({
        where: { productoId: devItem.productoId, sedeId: orden.sedeId },
        transaction
      });

      if (stock) {
        await stock.update({ cantidad: Math.max(0, stock.cantidad - cantidadDev) }, { transaction });
      }

      // Registrar Movimiento Inventario
      await MovimientoInventario.create({
        productoId: devItem.productoId,
        sedeId: orden.sedeId,
        tipo: 'salida',
        cantidad: -cantidadDev,
        motivo: `Devolución a proveedor de Orden de Compra ID: ${orden.id}`,
        referenciaId: orden.id,
        usuarioId: requireUser(req).userId
      }, { transaction });
    }

    // Recalcular estado de la orden
    let algunRecibido = false;
    let todosRecibidosCompletamente = true;

    // Volver a consultar los items actualizados
    const itemsActualizados = await ItemOrdenCompra.findAll({
      where: { ordenCompraId: id },
      transaction
    });

    for (const item of itemsActualizados) {
      if (Number(item.cantidadRecibida) > 0) {
        algunRecibido = true;
      }
      if (Number(item.cantidadRecibida) < item.cantidadPedida) {
        todosRecibidosCompletamente = false;
      }
    }

    let nuevoEstado: Attributes<CompraModel>['estado'] = 'pendiente';
    if (todosRecibidosCompletamente) {
      nuevoEstado = 'recibida';
    } else if (algunRecibido) {
      nuevoEstado = 'parcial';
    }

    await orden.update({ estado: nuevoEstado }, { transaction });

    await transaction.commit();

    if (req.logAudit) {
      await req.logAudit({
        accion: 'UPDATE',
        modulo: 'Compras',
        registroId: id,
        valorNuevo: { estado: orden.estado, devoluciones: items }
      });
    }

    return res.json({ message: 'Mercancía devuelta e inventario actualizado con éxito.', estado: orden.estado });
  } catch (error) {
    if (!transactionFinished(transaction)) await transaction.rollback();
    next(error);
  } finally {
    if (!transactionFinished(transaction)) await transaction.rollback();
  }
};
