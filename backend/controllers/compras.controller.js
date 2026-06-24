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
  sequelize
} = require('../models');
const { Op } = require('sequelize');

// --- GET ALL COMPRAS ---
exports.getCompras = async (req, res, next) => {
  try {
    const { proveedor, sede, estado, estadoPago } = req.query;
    const where = {};

    const querySedeId = sede || (req.usuario.rol !== 'admin' ? req.usuario.sedeId : null);
    if (querySedeId) {
      where.sedeId = querySedeId;
    }

    if (proveedor) where.proveedorId = proveedor;
    if (estado) where.estado = estado;
    if (estadoPago) where.estadoPago = estadoPago;

    const compras = await OrdenCompra.findAll({
      where,
      include: [
        { model: Proveedor, as: 'proveedor', attributes: ['nombre', 'nit'] },
        { model: Usuario, as: 'usuario', attributes: ['nombre'] },
        { model: Sede, as: 'sede', attributes: ['nombre'] },
        {
          model: ItemOrdenCompra,
          as: 'items',
          include: [{ model: Producto, as: 'producto', attributes: ['nombre', 'codigoBarras'] }]
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
exports.createCompra = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { proveedorId, fechaEsperada, observaciones, items } = req.body;
    const sedeId = req.usuario.sedeId;
    const usuarioId = req.usuario.userId;

    if (!proveedorId || !items || items.length === 0) {
      return res.status(400).json({ error: 'Faltan parámetros obligatorios para registrar la compra.' });
    }

    // Calcular total
    let total = 0;
    for (const item of items) {
      if (!item.productoId || !item.cantidadPedida || parseFloat(item.precioUnitario) <= 0) {
        throw new Error('Artículos incompletos o precio unitario inválido.');
      }
      total += parseInt(item.cantidadPedida) * parseFloat(item.precioUnitario);
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
      fechaEsperada: fechaEsperada || null,
      observaciones
    }, { transaction });

    // Crear items
    for (const item of items) {
      await ItemOrdenCompra.create({
        ordenCompraId: orden.id,
        productoId: item.productoId,
        cantidadPedida: parseInt(item.cantidadPedida),
        cantidadRecibida: 0,
        precioUnitario: parseFloat(item.precioUnitario)
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
    await transaction.rollback();
    next(error);
  }
};

// --- RECEPCIÓN DE MERCANCÍA (AFECTA STOCK) ---
exports.recibirCompra = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { items } = req.body; // array of { productoId, cantidadRecibida }

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Debe especificar los ítems y cantidades recibidas.' });
    }

    const orden = await OrdenCompra.findByPk(id, {
      include: [{ model: ItemOrdenCompra, as: 'items' }],
      transaction
    });

    if (!orden) {
      return res.status(404).json({ error: 'Orden de compra no encontrada.' });
    }

    if (orden.estado === 'recibida') {
      return res.status(400).json({ error: 'Esta orden de compra ya fue totalmente recibida.' });
    }

    let todasCompletas = true;

    for (const recItem of items) {
      const dbItem = orden.items.find(i => i.productoId === recItem.productoId);
      if (!dbItem) continue;

      const nuevaCantidadRecibida = parseInt(dbItem.cantidadRecibida) + parseInt(recItem.cantidadRecibida);
      if (nuevaCantidadRecibida > dbItem.cantidadPedida) {
        throw new Error(`La cantidad recibida total supera la cantidad pedida para el producto ID: ${recItem.productoId}.`);
      }

      await dbItem.update({ cantidadRecibida: nuevaCantidadRecibida }, { transaction });

      // Actualizar Stock en la Sede
      const stock = await StockSede.findOne({
        where: { productoId: recItem.productoId, sedeId: orden.sedeId },
        transaction
      });

      if (stock) {
        await stock.update({ cantidad: stock.cantidad + parseInt(recItem.cantidadRecibida) }, { transaction });
      } else {
        await StockSede.create({
          productoId: recItem.productoId,
          sedeId: orden.sedeId,
          cantidad: parseInt(recItem.cantidadRecibida)
        }, { transaction });
      }

      // Registrar Movimiento Inventario
      await MovimientoInventario.create({
        productoId: recItem.productoId,
        sedeId: orden.sedeId,
        tipo: 'entrada',
        cantidad: parseInt(recItem.cantidadRecibida),
        motivo: `Recepción de Orden de Compra ID: ${orden.id}`,
        referenciaId: orden.id,
        usuarioId: req.usuario.userId
      }, { transaction });

      if (nuevaCantidadRecibida < dbItem.cantidadPedida) {
        todasCompletas = false;
      }
    }

    // Comprobar si faltó algún ítem por recibir en la orden
    for (const dbItem of orden.items) {
      const match = items.find(i => i.productoId === dbItem.productoId);
      const totalRec = match ? (parseInt(dbItem.cantidadRecibida) + parseInt(match.cantidadRecibida)) : parseInt(dbItem.cantidadRecibida);
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
    await transaction.rollback();
    next(error);
  }
};

// --- REGISTRAR ABONO / PAGO A CUENTAS POR PAGAR ---
exports.registrarPagoCompra = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { monto } = req.body;

    if (!monto || parseFloat(monto) <= 0) {
      return res.status(400).json({ error: 'Monto de pago inválido.' });
    }

    const orden = await OrdenCompra.findByPk(id, { transaction });
    if (!orden) {
      return res.status(404).json({ error: 'Orden de compra no encontrada.' });
    }

    const saldoActual = parseFloat(orden.saldoPendiente);
    if (saldoActual <= 0) {
      return res.status(400).json({ error: 'Esta cuenta por pagar ya se encuentra totalmente cancelada.' });
    }

    const abonoNum = parseFloat(monto);
    const nuevoSaldo = Math.max(0, saldoActual - abonoNum);

    let nuevoEstadoPago = 'abono_parcial';
    if (nuevoSaldo === 0) {
      nuevoEstadoPago = 'pagado';
    }

    await orden.update({
      saldoPendiente: nuevoSaldo,
      estadoPago: nuevoEstadoPago
    }, { transaction });

    // Intentar registrar el Egreso de Caja automáticamente si hay caja abierta en la sede de la compra
    const caja = await Caja.findOne({
      where: { sedeId: orden.sedeId, estado: 'abierta' },
      transaction
    });

    if (caja) {
      // Buscar categoría de egreso correspondiente o crear/usar 'Pago a proveedor'
      const categoria = await CategoriaEgreso.findOne({
        where: { nombre: { [Op.iLike]: '%proveedor%' } },
        transaction
      });

      const egreso = await EgresoCaja.create({
        cajaId: caja.id,
        monto: abonoNum,
        categoriaId: categoria ? categoria.id : null,
        motivo: `Pago / Abono a Proveedor por Orden de Compra ID: ${orden.id}`,
        usuarioId: req.usuario.userId
      }, { transaction });

      // Actualizar saldos de caja
      await caja.update({
        totalEgresos: parseFloat(caja.totalEgresos) + abonoNum
      }, { transaction });
    }

    await transaction.commit();

    if (req.logAudit) {
      await req.logAudit({
        accion: 'PAGO_COMPRA',
        modulo: 'Compras',
        registroId: id,
        valorNuevo: { abono: abonoNum, saldoPendiente: nuevoSaldo, estadoPago: nuevoEstadoPago }
      });
    }

    return res.json({ message: 'Pago registrado con éxito y egreso cargado a caja.', saldoPendiente: nuevoSaldo, estadoPago: nuevoEstadoPago });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};
