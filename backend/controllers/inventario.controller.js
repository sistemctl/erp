const { Producto, Sede, StockSede, MovimientoInventario, sequelize } = require('../models');

exports.getStockSede = async (req, res, next) => {
  try {
    const { sedeId } = req.query;
    const querySedeId = sedeId || req.usuario.sedeId;

    if (!querySedeId) {
      return res.status(400).json({ error: 'Por favor, especifique una sede.' });
    }

    const stock = await StockSede.findAll({
      where: { sedeId: querySedeId },
      include: [
        {
          model: Producto,
          as: 'producto',
          where: { activo: true },
          attributes: ['nombre', 'codigoBarras', 'precioVenta', 'precioCosto', 'stockMinimo', 'tieneNumeroSerie']
        }
      ],
      order: [[{ model: Producto, as: 'producto' }, 'nombre', 'ASC']]
    });

    return res.json(stock);
  } catch (error) {
    next(error);
  }
};

exports.getMovimientos = async (req, res, next) => {
  try {
    const { sedeId } = req.query;
    const where = {};
    if (sedeId) {
      where.sedeId = sedeId;
    }

    const movimientos = await MovimientoInventario.findAll({
      where,
      include: [
        { model: Producto, as: 'producto', attributes: ['nombre', 'codigoBarras'] },
        { model: Sede, as: 'sede', attributes: ['nombre'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    return res.json(movimientos);
  } catch (error) {
    next(error);
  }
};

exports.trasladarMercancia = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { productoId, sedeOrigenId, sedeDestinoId, cantidad, motivo } = req.body;

    if (!productoId || !sedeOrigenId || !sedeDestinoId || !cantidad || cantidad <= 0) {
      return res.status(400).json({ error: 'Datos de traslado incompletos o cantidad inválida.' });
    }

    if (sedeOrigenId === sedeDestinoId) {
      return res.status(400).json({ error: 'La sede origen y destino deben ser distintas.' });
    }

    // 1. Obtener y verificar stock en origen
    const stockOrigen = await StockSede.findOne({
      where: { productoId, sedeId: sedeOrigenId },
      transaction
    });

    if (!stockOrigen || stockOrigen.cantidad < cantidad) {
      return res.status(400).json({ error: 'Stock insuficiente en la sede origen para realizar el traslado.' });
    }

    // 2. Obtener o crear stock en destino
    let stockDestino = await StockSede.findOne({
      where: { productoId, sedeId: sedeDestinoId },
      transaction
    });

    if (!stockDestino) {
      stockDestino = await StockSede.create({
        productoId,
        sedeId: sedeDestinoId,
        cantidad: 0
      }, { transaction });
    }

    // 3. Modificar cantidades
    await stockOrigen.update({ cantidad: stockOrigen.cantidad - cantidad }, { transaction });
    await stockDestino.update({ cantidad: stockDestino.cantidad + cantidad }, { transaction });

    // 4. Registrar movimientos de inventario
    const trasladoRef = sequelize.Sequelize.UUIDV4(); // UUID común para enlazar ambos movimientos

    // Salida en origen
    await MovimientoInventario.create({
      productoId,
      sedeId: sedeOrigenId,
      tipo: 'traslado_salida',
      cantidad: -cantidad,
      motivo: motivo || 'Traslado entre sedes',
      referenciaId: null,
      usuarioId: req.usuario.userId
    }, { transaction });

    // Entrada en destino
    await MovimientoInventario.create({
      productoId,
      sedeId: sedeDestinoId,
      tipo: 'traslado_entrada',
      cantidad,
      motivo: motivo || 'Traslado entre sedes',
      referenciaId: null,
      usuarioId: req.usuario.userId
    }, { transaction });

    await transaction.commit();

    if (req.logAudit) {
      await req.logAudit({
        accion: 'UPDATE',
        modulo: 'Inventario',
        registroId: productoId,
        valorAnterior: { sedeOrigen: sedeOrigenId, stockPrevio: stockOrigen.cantidad + cantidad },
        valorNuevo: { sedeDestino: sedeDestinoId, trasladoCantidad: cantidad }
      });
    }

    return res.json({ message: 'Traslado realizado exitosamente.' });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};
