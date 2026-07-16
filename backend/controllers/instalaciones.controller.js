const {
  OrdenInstalacion,
  MaterialInstalacion,
  Cliente,
  Usuario,
  Sede,
  Producto,
  StockSede,
  MovimientoInventario,
  NumeroSerie,
  sequelize
} = require('../models');
const { Op } = require('sequelize');
const { resolveQuerySede, resolveActionSede } = require('../utils/sede');

const includeDetalle = [
  { model: Cliente, as: 'cliente', attributes: ['id', 'nombre', 'telefono', 'documento', 'email'] },
  { model: Usuario, as: 'tecnico', attributes: ['id', 'nombre'] },
  { model: Sede, as: 'sede', attributes: ['id', 'nombre', 'direccion'] },
  {
    model: MaterialInstalacion,
    as: 'materiales',
    include: [{ model: Producto, as: 'producto', attributes: ['id', 'nombre', 'codigoBarras', 'tieneNumeroSerie', 'esServicio'] }]
  }
];

function recalcTotales(orden, materiales) {
  const costoMateriales = materiales.reduce(
    (sum, m) => sum + parseFloat(m.costoUnitario) * parseInt(m.cantidad, 10),
    0
  );
  const valorServicio = parseFloat(orden.valorServicio) || 0;
  return {
    costoMateriales,
    totalCobrado: valorServicio + costoMateriales
  };
}

exports.getOrdenes = async (req, res, next) => {
  try {
    const { estado, tecnico, sede, buscar } = req.query;
    const where = {};
    const querySedeId = resolveQuerySede(sede, req.usuario);

    if (estado) where.estado = estado;
    if (tecnico) where.tecnicoId = tecnico;
    if (querySedeId) where.sedeId = querySedeId;

    if (buscar) {
      where[Op.or] = [
        { numeroOrden: { [Op.iLike]: `%${buscar}%` } },
        { sitio: { [Op.iLike]: `%${buscar}%` } },
        { '$cliente.nombre$': { [Op.iLike]: `%${buscar}%` } }
      ];
    }

    const ordenes = await OrdenInstalacion.findAll({
      where,
      include: [
        { model: Cliente, as: 'cliente', attributes: ['nombre', 'telefono', 'documento'] },
        { model: Usuario, as: 'tecnico', attributes: ['nombre'] },
        { model: Sede, as: 'sede', attributes: ['nombre'] },
        { model: MaterialInstalacion, as: 'materiales', attributes: ['id', 'cantidad'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    return res.json(ordenes);
  } catch (error) {
    next(error);
  }
};

exports.getOrdenById = async (req, res, next) => {
  try {
    const orden = await OrdenInstalacion.findByPk(req.params.id, { include: includeDetalle });
    if (!orden) {
      return res.status(404).json({ error: 'Orden de instalación no encontrada.' });
    }
    return res.json(orden);
  } catch (error) {
    next(error);
  }
};

exports.createOrden = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const {
      clienteId,
      sedeId: bodySedeId,
      tecnicoId,
      sitio,
      direccion,
      descripcion,
      valorServicio,
      fechaProgramada,
      observaciones,
      estado
    } = req.body;

    if (!clienteId) {
      await transaction.rollback();
      return res.status(400).json({ error: 'El cliente es obligatorio.' });
    }

    const sedeId = await resolveActionSede(bodySedeId, req.usuario, Sede, transaction);
    if (!sedeId) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Debe indicar una sede.' });
    }

    const count = await OrdenInstalacion.count({ transaction });
    const numeroOrden = `IN-${String(count + 1).padStart(6, '0')}`;
    const svc = parseFloat(valorServicio) || 0;

    const orden = await OrdenInstalacion.create({
      numeroOrden,
      clienteId,
      sedeId,
      tecnicoId: tecnicoId || null,
      sitio: sitio || null,
      direccion: direccion || null,
      descripcion: descripcion || null,
      valorServicio: svc,
      costoMateriales: 0,
      totalCobrado: svc,
      estado: estado || 'borrador',
      fechaProgramada: fechaProgramada || null,
      observaciones: observaciones || null
    }, { transaction });

    await transaction.commit();

    if (req.logAudit) {
      await req.logAudit({
        accion: 'CREATE',
        modulo: 'Instalaciones',
        registroId: orden.id,
        valorNuevo: orden.toJSON()
      });
    }

    const full = await OrdenInstalacion.findByPk(orden.id, { include: includeDetalle });
    return res.status(201).json(full);
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

exports.updateOrden = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const orden = await OrdenInstalacion.findByPk(req.params.id, {
      include: [{ model: MaterialInstalacion, as: 'materiales' }],
      transaction
    });
    if (!orden) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Orden de instalación no encontrada.' });
    }
    if (orden.estado === 'entregada' || orden.estado === 'cancelada') {
      await transaction.rollback();
      return res.status(400).json({ error: 'No se puede editar una orden entregada o cancelada.' });
    }

    const {
      tecnicoId,
      sitio,
      direccion,
      descripcion,
      valorServicio,
      fechaProgramada,
      observaciones,
      estado
    } = req.body;

    const patch = {};
    if (tecnicoId !== undefined) patch.tecnicoId = tecnicoId || null;
    if (sitio !== undefined) patch.sitio = sitio;
    if (direccion !== undefined) patch.direccion = direccion;
    if (descripcion !== undefined) patch.descripcion = descripcion;
    if (fechaProgramada !== undefined) patch.fechaProgramada = fechaProgramada || null;
    if (observaciones !== undefined) patch.observaciones = observaciones;
    if (estado !== undefined) {
      if (!['borrador', 'en_proceso', 'entregada', 'cancelada'].includes(estado)) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Estado inválido.' });
      }
      patch.estado = estado;
    }
    if (valorServicio !== undefined) {
      patch.valorServicio = parseFloat(valorServicio) || 0;
    }

    await orden.update(patch, { transaction });
    const totales = recalcTotales(
      { valorServicio: patch.valorServicio !== undefined ? patch.valorServicio : orden.valorServicio },
      orden.materiales
    );
    await orden.update(totales, { transaction });

    await transaction.commit();

    const full = await OrdenInstalacion.findByPk(req.params.id, { include: includeDetalle });
    return res.json(full);
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

exports.addMaterial = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { productoId, cantidad, series } = req.body;
    const qty = parseInt(cantidad, 10);

    if (!productoId || !qty || qty <= 0) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Producto y cantidad válida son obligatorios.' });
    }

    const orden = await OrdenInstalacion.findByPk(id, { transaction });
    if (!orden) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Orden de instalación no encontrada.' });
    }
    if (['entregada', 'cancelada'].includes(orden.estado)) {
      await transaction.rollback();
      return res.status(400).json({ error: 'No se pueden agregar materiales a esta orden.' });
    }

    const producto = await Producto.findByPk(productoId, { transaction });
    if (!producto || !producto.activo) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Producto no encontrado o inactivo.' });
    }
    if (producto.esServicio) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Los productos de tipo servicio no se agregan como material. Use valorServicio en la orden.' });
    }

    let seriesList = Array.isArray(series) ? series.map((s) => String(s).trim()).filter(Boolean) : [];

    if (producto.tieneNumeroSerie) {
      if (seriesList.length !== qty) {
        await transaction.rollback();
        return res.status(400).json({
          error: `El producto ${producto.nombre} requiere ${qty} número(s) de serie.`
        });
      }
      const unique = new Set(seriesList);
      if (unique.size !== seriesList.length) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Hay series duplicadas en la solicitud.' });
      }
    } else {
      seriesList = null;
    }

    const stock = await StockSede.findOne({
      where: { productoId, sedeId: orden.sedeId },
      transaction
    });
    if (!stock || stock.cantidad < qty) {
      await transaction.rollback();
      return res.status(400).json({ error: `Stock insuficiente de ${producto.nombre} en esta sede.` });
    }

    if (producto.tieneNumeroSerie) {
      for (const serieStr of seriesList) {
        const serieReg = await NumeroSerie.findOne({
          where: {
            serie: serieStr,
            productoId,
            sedeId: orden.sedeId,
            estado: 'en_stock'
          },
          transaction
        });
        if (!serieReg) {
          await transaction.rollback();
          return res.status(400).json({
            error: `Serie/IMEI ${serieStr} no está en stock para ${producto.nombre}.`
          });
        }
        await serieReg.update({
          estado: 'instalado',
          clienteId: orden.clienteId,
          fechaVenta: new Date()
        }, { transaction });
      }
    }

    await stock.update({ cantidad: stock.cantidad - qty }, { transaction });

    await MovimientoInventario.create({
      productoId,
      sedeId: orden.sedeId,
      tipo: 'salida',
      cantidad: -qty,
      motivo: `Material instalación #${orden.numeroOrden}`,
      referenciaId: orden.id,
      usuarioId: req.usuario.userId
    }, { transaction });

    const material = await MaterialInstalacion.create({
      ordenId: id,
      productoId,
      cantidad: qty,
      costoUnitario: parseFloat(producto.precioCosto) || 0,
      precioUnitario: parseFloat(producto.precioVenta) || 0,
      series: seriesList
    }, { transaction });

    const materiales = await MaterialInstalacion.findAll({ where: { ordenId: id }, transaction });
    const totales = recalcTotales(orden, materiales);
    const nextEstado = orden.estado === 'borrador' ? 'en_proceso' : orden.estado;
    await orden.update({ ...totales, estado: nextEstado }, { transaction });

    await transaction.commit();

    if (req.logAudit) {
      await req.logAudit({
        accion: 'UPDATE',
        modulo: 'Instalaciones',
        registroId: id,
        valorNuevo: { material: producto.nombre, cantidad: qty, series: seriesList }
      });
    }

    const full = await MaterialInstalacion.findByPk(material.id, {
      include: [{ model: Producto, as: 'producto', attributes: ['id', 'nombre', 'codigoBarras', 'tieneNumeroSerie'] }]
    });
    return res.status(201).json(full);
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

exports.removeMaterial = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { id, mid } = req.params;
    const orden = await OrdenInstalacion.findByPk(id, { transaction });
    if (!orden) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Orden no encontrada.' });
    }
    if (['entregada', 'cancelada'].includes(orden.estado)) {
      await transaction.rollback();
      return res.status(400).json({ error: 'No se pueden quitar materiales de esta orden.' });
    }

    const material = await MaterialInstalacion.findOne({
      where: { id: mid, ordenId: id },
      include: [{ model: Producto, as: 'producto' }],
      transaction
    });
    if (!material) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Material no encontrado.' });
    }

    const qty = parseInt(material.cantidad, 10);
    const stock = await StockSede.findOne({
      where: { productoId: material.productoId, sedeId: orden.sedeId },
      transaction
    });
    if (stock) {
      await stock.update({ cantidad: stock.cantidad + qty }, { transaction });
    }

    await MovimientoInventario.create({
      productoId: material.productoId,
      sedeId: orden.sedeId,
      tipo: 'entrada',
      cantidad: qty,
      motivo: `Reverso material instalación #${orden.numeroOrden}`,
      referenciaId: orden.id,
      usuarioId: req.usuario.userId
    }, { transaction });

    if (material.producto?.tieneNumeroSerie && Array.isArray(material.series)) {
      for (const serieStr of material.series) {
        const serieReg = await NumeroSerie.findOne({
          where: { serie: serieStr, productoId: material.productoId },
          transaction
        });
        if (serieReg && serieReg.estado === 'instalado') {
          await serieReg.update({
            estado: 'en_stock',
            clienteId: null,
            fechaVenta: null,
            sedeId: orden.sedeId
          }, { transaction });
        }
      }
    }

    await material.destroy({ transaction });

    const materiales = await MaterialInstalacion.findAll({ where: { ordenId: id }, transaction });
    const totales = recalcTotales(orden, materiales);
    await orden.update(totales, { transaction });

    await transaction.commit();
    return res.json({ message: 'Material revertido al inventario.', ...totales });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

exports.cerrarOrden = async (req, res, next) => {
  try {
    const orden = await OrdenInstalacion.findByPk(req.params.id, {
      include: [{ model: MaterialInstalacion, as: 'materiales' }]
    });
    if (!orden) {
      return res.status(404).json({ error: 'Orden no encontrada.' });
    }
    if (orden.estado === 'cancelada') {
      return res.status(400).json({ error: 'La orden está cancelada.' });
    }
    if (orden.estado === 'entregada') {
      return res.json(orden);
    }

    const totales = recalcTotales(orden, orden.materiales || []);
    await orden.update({ ...totales, estado: 'entregada' });

    if (req.logAudit) {
      await req.logAudit({
        accion: 'UPDATE',
        modulo: 'Instalaciones',
        registroId: orden.id,
        valorNuevo: { estado: 'entregada' }
      });
    }

    const full = await OrdenInstalacion.findByPk(orden.id, { include: includeDetalle });
    return res.json(full);
  } catch (error) {
    next(error);
  }
};
