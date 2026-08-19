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
  Factura,
  CuentaPorCobrar,
  ConfiguracionSistema,
  sequelize
} = require('../models');
const { Op } = require('sequelize');
const { resolveQuerySede, resolveActionSede } = require('../utils/sede');
const { findCajaAbierta } = require('../utils/caja-abierta');
const { calcularFechaVencimientoCredito, getDiasPlazoCredito } = require('../utils/credito');

const includeDetalle = [
  { model: Cliente, as: 'cliente', attributes: ['id', 'nombre', 'telefono', 'documento', 'email'] },
  { model: Usuario, as: 'tecnico', attributes: ['id', 'nombre'] },
  { model: Sede, as: 'sede', attributes: ['id', 'nombre', 'direccion'] },
  {
    model: MaterialInstalacion,
    as: 'materiales',
    include: [{ model: Producto, as: 'producto', attributes: ['id', 'nombre', 'codigoBarras', 'tieneNumeroSerie', 'esServicio', 'unidadMedida'] }]
  },
  {
    model: Factura,
    as: 'factura',
    attributes: ['id', 'numeroFactura', 'subtotal', 'total', 'estado'],
    include: [{
      model: CuentaPorCobrar,
      as: 'cuentaPorCobrar',
      attributes: ['id', 'totalOriginal', 'totalAbonado', 'saldoPendiente', 'estado'],
      required: false
    }],
    required: false
  }
];

function recalcTotales(orden, materiales) {
  const costoMateriales = materiales.reduce(
    (sum, m) => sum + parseFloat(m.costoUnitario) * parseInt(m.cantidad, 10),
    0
  );
  const ventaMateriales = materiales.reduce(
    (sum, m) => sum + parseFloat(m.precioUnitario) * parseInt(m.cantidad, 10),
    0
  );
  const valorServicio = parseFloat(orden.valorServicio) || 0;
  const precioCerrado = orden.precioCerrado === true || orden.precioCerrado === 'true' || orden.precioCerrado === 1;
  return {
    costoMateriales,
    totalCobrado: precioCerrado ? valorServicio : valorServicio + ventaMateriales
  };
}

exports.getOrdenes = async (req, res, next) => {
  try {
    const { estado, tecnico, sede, buscar, desde, hasta } = req.query;
    const where = {};
    const querySedeId = resolveQuerySede(sede, req.usuario);

    if (estado) where.estado = estado;
    if (tecnico) where.tecnicoId = tecnico;
    if (querySedeId) where.sedeId = querySedeId;

    if (desde || hasta) {
      where.createdAt = {};
      if (desde) where.createdAt[Op.gte] = new Date(desde);
      if (hasta) {
        const fin = new Date(hasta);
        fin.setHours(23, 59, 59, 999);
        where.createdAt[Op.lte] = fin;
      }
    }

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
      estado,
      precioCerrado
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
    const cerrado = precioCerrado === true || precioCerrado === 'true' || precioCerrado === 1;

    const orden = await OrdenInstalacion.create({
      numeroOrden,
      clienteId,
      sedeId,
      tecnicoId: tecnicoId || null,
      sitio: sitio || null,
      direccion: direccion || null,
      descripcion: descripcion || null,
      valorServicio: svc,
      precioCerrado: cerrado,
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
      estado,
      precioCerrado
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
    if (precioCerrado !== undefined) {
      patch.precioCerrado = precioCerrado === true || precioCerrado === 'true' || precioCerrado === 1;
    }

    await orden.update(patch, { transaction });
    const totales = recalcTotales(
      {
        valorServicio: patch.valorServicio !== undefined ? patch.valorServicio : orden.valorServicio,
        precioCerrado: patch.precioCerrado !== undefined ? patch.precioCerrado : orden.precioCerrado
      },
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
      transaction,
      lock: transaction.LOCK.UPDATE
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
      include: [{ model: Producto, as: 'producto', attributes: ['id', 'nombre', 'codigoBarras', 'tieneNumeroSerie', 'unidadMedida'] }]
    });
    return res.status(201).json(full);
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

/** Ajusta la cantidad de un material (delta de stock) sin borrar la línea. */
exports.updateMaterial = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { id, mid } = req.params;
    const newQty = parseInt(req.body.cantidad, 10);

    if (!newQty || newQty <= 0) {
      await transaction.rollback();
      return res.status(400).json({ error: 'La cantidad debe ser un entero mayor a 0.' });
    }

    const orden = await OrdenInstalacion.findByPk(id, { transaction });
    if (!orden) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Orden no encontrada.' });
    }
    if (['entregada', 'cancelada'].includes(orden.estado)) {
      await transaction.rollback();
      return res.status(400).json({ error: 'No se pueden ajustar materiales de esta orden.' });
    }

    const material = await MaterialInstalacion.findOne({
      where: { id: mid, ordenId: id },
      include: [{ model: Producto, as: 'producto' }],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!material) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Material no encontrado.' });
    }

    if (material.producto?.tieneNumeroSerie) {
      await transaction.rollback();
      return res.status(400).json({
        error: 'Los productos con serial no se pueden ajustar. Revierta la línea y vuelva a agregarlos.'
      });
    }

    const oldQty = parseInt(material.cantidad, 10);
    if (oldQty === newQty) {
      await transaction.rollback();
      return res.json(material);
    }

    const delta = newQty - oldQty;
    const stock = await StockSede.findOne({
      where: { productoId: material.productoId, sedeId: orden.sedeId },
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (delta > 0) {
      if (!stock || stock.cantidad < delta) {
        await transaction.rollback();
        return res.status(400).json({
          error: `Stock insuficiente de ${material.producto?.nombre || 'producto'} en esta sede.`
        });
      }
      await stock.update({ cantidad: stock.cantidad - delta }, { transaction });
      await MovimientoInventario.create({
        productoId: material.productoId,
        sedeId: orden.sedeId,
        tipo: 'salida',
        cantidad: -delta,
        motivo: `Ajuste material instalación #${orden.numeroOrden} (${oldQty} → ${newQty})`,
        referenciaId: orden.id,
        usuarioId: req.usuario.userId
      }, { transaction });
    } else {
      const volver = Math.abs(delta);
      if (stock) {
        await stock.update({ cantidad: stock.cantidad + volver }, { transaction });
      }
      await MovimientoInventario.create({
        productoId: material.productoId,
        sedeId: orden.sedeId,
        tipo: 'entrada',
        cantidad: volver,
        motivo: `Ajuste material instalación #${orden.numeroOrden} (${oldQty} → ${newQty})`,
        referenciaId: orden.id,
        usuarioId: req.usuario.userId
      }, { transaction });
    }

    await material.update({ cantidad: newQty }, { transaction });

    const materiales = await MaterialInstalacion.findAll({ where: { ordenId: id }, transaction });
    const totales = recalcTotales(orden, materiales);
    await orden.update(totales, { transaction });

    await transaction.commit();

    if (req.logAudit) {
      await req.logAudit({
        accion: 'UPDATE',
        modulo: 'Instalaciones',
        registroId: id,
        valorNuevo: {
          materialId: mid,
          producto: material.producto?.nombre,
          cantidadAnterior: oldQty,
          cantidadNueva: newQty
        }
      });
    }

    const full = await MaterialInstalacion.findByPk(mid, {
      include: [{ model: Producto, as: 'producto', attributes: ['id', 'nombre', 'codigoBarras', 'tieneNumeroSerie', 'unidadMedida'] }]
    });
    return res.json({ material: full, ...totales });
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

exports.reabrirOrden = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const orden = await OrdenInstalacion.findByPk(req.params.id, { transaction });
    if (!orden) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Orden de instalación no encontrada.' });
    }
    if (orden.estado === 'cancelada') {
      await transaction.rollback();
      return res.status(400).json({ error: 'Una orden cancelada no se puede reabrir.' });
    }
    if (orden.estado !== 'entregada') {
      await transaction.rollback();
      return res.status(400).json({ error: 'Solo se pueden reabrir instalaciones entregadas.' });
    }

    const factura = await Factura.findOne({
      where: { ordenInstalacionId: orden.id },
      include: [{ model: CuentaPorCobrar, as: 'cuentaPorCobrar', required: false }],
      transaction
    });
    const totalAbonado = parseFloat(factura?.cuentaPorCobrar?.totalAbonado) || 0;
    const totalBloqueado = Boolean(factura && (factura.estado === 'pagada' || totalAbonado > 0));
    const patch = { estado: 'en_proceso' };

    // Cuando ya hubo recaudo, los materiales se pueden corregir sin cambiar lo cobrado.
    if (totalBloqueado) {
      patch.precioCerrado = true;
      patch.valorServicio = parseFloat(factura.total) || 0;
      patch.totalCobrado = parseFloat(factura.total) || 0;
    }

    await orden.update(patch, { transaction });
    await transaction.commit();

    if (req.logAudit) {
      await req.logAudit({
        accion: 'UPDATE',
        modulo: 'Instalaciones',
        registroId: orden.id,
        valorNuevo: {
          estado: 'en_proceso',
          reabierta: true,
          totalBloqueado,
          factura: factura?.numeroFactura || null
        }
      });
    }

    const full = await OrdenInstalacion.findByPk(orden.id, { include: includeDetalle });
    const message = totalBloqueado
      ? `Orden reabierta. El total queda fijo en ${factura.total} porque la factura ${factura.numeroFactura} ya tiene recaudo.`
      : factura
        ? `Orden reabierta. La factura ${factura.numeroFactura} y la cartera se actualizarán al volver a entregarla.`
        : 'Orden reabierta. Ya puede completar sus datos y materiales.';
    return res.json({ message, totalBloqueado, orden: full });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

exports.cerrarOrden = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { modoCobro, pagos, metodoPago } = req.body || {};

    const orden = await OrdenInstalacion.findByPk(id, {
      include: [{ model: MaterialInstalacion, as: 'materiales' }],
      transaction
    });
    if (!orden) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Orden no encontrada.' });
    }
    if (orden.estado === 'cancelada') {
      await transaction.rollback();
      return res.status(400).json({ error: 'La orden está cancelada.' });
    }
    if (orden.estado === 'entregada') {
      await transaction.rollback();
      const full = await OrdenInstalacion.findByPk(orden.id, { include: includeDetalle });
      return res.json(full);
    }

    const totales = recalcTotales(orden, orden.materiales || []);
    const totalNum = parseFloat(totales.totalCobrado) || 0;
    let modo = null;

    const yaFacturado = await Factura.findOne({
      where: { ordenInstalacionId: id },
      include: [{ model: CuentaPorCobrar, as: 'cuentaPorCobrar', required: false }],
      transaction
    });

    if (totalNum > 0 && !yaFacturado) {
      modo = modoCobro === 'fiado' ? 'fiado' : modoCobro === 'contado' ? 'contado' : null;
      if (!modo) {
        await transaction.rollback();
        return res.status(400).json({
          error: 'Indique cómo cobra: contado (Cobré en sitio) o fiado (Queda debiendo).'
        });
      }

      const diasPlazo = await getDiasPlazoCredito(ConfiguracionSistema);
      const fechaVencimiento = calcularFechaVencimientoCredito(diasPlazo);
      const countFacturas = await Factura.count({ transaction });
      const numeroFactura = `FE-${String(countFacturas + 1).padStart(6, '0')}`;
      // Cobro de instalación: el total pactado es el valor final (sin desglose de IVA).
      const subtotal = totalNum;
      const iva = 0;

      if (modo === 'contado') {
          const { caja } = await findCajaAbierta({
            sedeId: orden.sedeId,
            usuarioId: req.usuario.userId,
            transaction
          });

          if (!caja) {
            await transaction.rollback();
            return res.status(400).json({
              error: 'No hay caja abierta en esta sede. Abre caja o usa Queda debiendo.'
            });
          }

          if (pagos) {
            const efectivoRec = parseFloat(pagos.efectivo || 0);
            const nequiRec = parseFloat(pagos.nequi || 0);
            const daviplataRec = parseFloat(pagos.daviplata || 0);
            const tarjetaRec = parseFloat(pagos.tarjeta || 0);
            const transferenciaRec = parseFloat(pagos.transferencia || 0);
            const totalPagado = efectivoRec + nequiRec + daviplataRec + tarjetaRec + transferenciaRec;

            if (totalPagado < totalNum - 0.01) {
              await transaction.rollback();
              return res.status(400).json({ error: 'El pago ingresado no cubre el total a cobrar.' });
            }

            let efectivoParaCaja = efectivoRec;
            if (totalPagado > totalNum) {
              const vuelto = totalPagado - totalNum;
              efectivoParaCaja = Math.max(0, efectivoRec - vuelto);
            }

            await caja.update({
              totalVentasEfectivo: parseFloat(caja.totalVentasEfectivo) + efectivoParaCaja,
              totalVentasNequi: parseFloat(caja.totalVentasNequi) + nequiRec,
              totalVentasDaviplata: parseFloat(caja.totalVentasDaviplata) + daviplataRec,
              totalVentasTarjeta: parseFloat(caja.totalVentasTarjeta) + tarjetaRec,
              totalVentasTransferencia: parseFloat(caja.totalVentasTransferencia) + transferenciaRec
            }, { transaction });
          } else {
            const metodo = metodoPago || 'efectivo';
            if (!['efectivo', 'nequi', 'daviplata', 'tarjeta', 'transferencia'].includes(metodo)) {
              await transaction.rollback();
              return res.status(400).json({ error: 'Método de pago inválido.' });
            }
            const campo = {
              efectivo: 'totalVentasEfectivo',
              nequi: 'totalVentasNequi',
              daviplata: 'totalVentasDaviplata',
              tarjeta: 'totalVentasTarjeta',
              transferencia: 'totalVentasTransferencia'
            }[metodo];
            await caja.update({
              [campo]: parseFloat(caja[campo]) + totalNum
            }, { transaction });
          }

          await Factura.create({
            numeroFactura,
            ordenInstalacionId: id,
            clienteId: orden.clienteId,
            sedeId: orden.sedeId,
            subtotal,
            iva,
            total: totalNum,
            estado: 'pagada',
            fechaVencimiento
          }, { transaction });
      } else {
          const factura = await Factura.create({
            numeroFactura,
            ordenInstalacionId: id,
            clienteId: orden.clienteId,
            sedeId: orden.sedeId,
            subtotal,
            iva,
            total: totalNum,
            estado: 'pendiente',
            fechaVencimiento
          }, { transaction });

          await CuentaPorCobrar.create({
            facturaId: factura.id,
            clienteId: orden.clienteId,
            totalOriginal: totalNum,
            totalAbonado: 0,
            saldoPendiente: totalNum,
            fechaVencimiento,
            estado: 'al_dia'
          }, { transaction });
      }
    }

    if (yaFacturado) {
      const cuenta = yaFacturado.cuentaPorCobrar;
      const totalAbonado = parseFloat(cuenta?.totalAbonado) || 0;
      const tieneRecaudo = yaFacturado.estado === 'pagada' || totalAbonado > 0;
      const totalAnterior = parseFloat(yaFacturado.total) || 0;

      if (tieneRecaudo && Math.abs(totalAnterior - totalNum) > 0.01) {
        await transaction.rollback();
        return res.status(400).json({
          error: `El total no puede cambiar porque la factura ${yaFacturado.numeroFactura} ya tiene recaudo.`
        });
      }

      if (!tieneRecaudo) {
        const facturaCero = totalNum <= 0;
        await yaFacturado.update({
          subtotal: totalNum,
          iva: 0,
          total: totalNum,
          estado: facturaCero ? 'anulada' : yaFacturado.estado
        }, { transaction });

        if (cuenta) {
          await cuenta.update({
            totalOriginal: totalNum,
            saldoPendiente: totalNum,
            estado: facturaCero ? 'pagada' : cuenta.estado
          }, { transaction });
        }
      }
    }

    await orden.update({ ...totales, estado: 'entregada' }, { transaction });
    await transaction.commit();

    if (req.logAudit) {
      await req.logAudit({
        accion: 'UPDATE',
        modulo: 'Instalaciones',
        registroId: orden.id,
        valorNuevo: { estado: 'entregada', modoCobro: modo || 'sin_cobro', totalCobrado: totalNum }
      });
    }

    const full = await OrdenInstalacion.findByPk(orden.id, { include: includeDetalle });
    return res.json(full);
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};
