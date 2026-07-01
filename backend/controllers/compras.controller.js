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
} = require('../models');
const { Op } = require('sequelize');
const { resolveQuerySede, resolveActionSede } = require('../utils/sede');

const FUENTES_VALIDAS = ['caja_efectivo', 'efectivo_externo', 'transferencia_empresa', 'otro'];

// --- GET ALL COMPRAS ---
exports.getCompras = async (req, res, next) => {
  try {
    const { proveedor, sede, estado, estadoPago } = req.query;
    const where = {};

    const querySedeId = resolveQuerySede(sede, req.usuario);
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
exports.createCompra = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { proveedorId, fechaEsperada, observaciones, items, sedeId: bodySedeId } = req.body;
    const sedeId = await resolveActionSede(bodySedeId, req.usuario, Sede, transaction);
    const usuarioId = req.usuario.userId;

    if (!proveedorId || !items || items.length === 0) {
      return res.status(400).json({ error: 'Faltan parámetros obligatorios para registrar la compra.' });
    }

    if (!sedeId) {
      return res.status(400).json({ error: 'Debe seleccionar la sede destino para la orden de compra.' });
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

      const producto = await Producto.findByPk(recItem.productoId, { transaction });
      if (producto && recItem.series && Array.isArray(recItem.series) && recItem.series.length > 0) {
        const cant = parseInt(recItem.cantidadRecibida);
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
          estado: 'en_stock'
        }));
        await NumeroSerie.bulkCreate(registrosSeries, { transaction });
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
    const { monto, fuenteFondos, pagadoPor, referencia } = req.body;

    if (!monto || parseFloat(monto) <= 0) {
      return res.status(400).json({ error: 'Monto de pago inválido.' });
    }

    const fuente = fuenteFondos || 'caja_efectivo';
    if (!FUENTES_VALIDAS.includes(fuente)) {
      return res.status(400).json({ error: 'Origen del dinero no válido.' });
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
      usuarioId: req.usuario.userId,
      monto: abonoNum,
      fuenteFondos: fuente,
      pagadoPor: pagadoPor?.trim() || null,
      referencia: referencia?.trim() || null
    }, { transaction });

    let egresoCreado = false;

    if (fuente === 'caja_efectivo') {
      const caja = await Caja.findOne({
        where: { sedeId: orden.sedeId, estado: 'abierta' },
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
        usuarioId: req.usuario.userId,
        pagoCompraId: pagoCompra.id
      }, { transaction });

      await caja.update({
        totalEgresos: parseFloat(caja.totalEgresos) + abonoNum
      }, { transaction });

      egresoCreado = true;
    }

    await transaction.commit();

    if (req.logAudit) {
      await req.logAudit({
        accion: 'PAGO_COMPRA',
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
    await transaction.rollback();
    next(error);
  }
};

exports.devolverMercancia = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { items } = req.body; // array of { productoId, cantidadDevolver, series }

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Debe especificar los ítems y cantidades a devolver.' });
    }

    const orden = await OrdenCompra.findByPk(id, {
      include: [{ model: ItemOrdenCompra, as: 'items' }],
      transaction
    });

    if (!orden) {
      return res.status(404).json({ error: 'Orden de compra no encontrada.' });
    }

    if (orden.estado === 'pendiente') {
      return res.status(400).json({ error: 'No se puede devolver mercancía de una orden que está pendiente de recibir.' });
    }

    for (const devItem of items) {
      const dbItem = orden.items.find(i => i.productoId === devItem.productoId);
      if (!dbItem) continue;

      const cantidadDev = parseInt(devItem.cantidadDevolver || 0);
      if (cantidadDev <= 0) continue;

      if (cantidadDev > dbItem.cantidadRecibida) {
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

      const nuevaCantidadRecibida = parseInt(dbItem.cantidadRecibida) - cantidadDev;
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
        usuarioId: req.usuario.userId
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
      if (item.cantidadRecibida > 0) {
        algunRecibido = true;
      }
      if (item.cantidadRecibida < item.cantidadPedida) {
        todosRecibidosCompletamente = false;
      }
    }

    let nuevoEstado = 'pendiente';
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
    await transaction.rollback();
    next(error);
  }
};

