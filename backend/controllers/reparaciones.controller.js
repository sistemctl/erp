const { nextDocumentNumber } = require('../utils/document-number');
const { assertSedeAccess } = require('../utils/sede');
const {
  OrdenReparacion,
  FotoReparacion,
  RepuestoOrden,
  RentabilidadReparacion,
  Cliente,
  Usuario,
  Sede,
  Producto,
  StockSede,
  MovimientoInventario,
  Factura,
  CuentaPorCobrar,
  Caja,
  ConfiguracionSistema,
  sequelize
} = require('../models');
const { Op } = require('sequelize');
const PDFDocument = require('pdfkit');
const qr = require('qrcode');
const { buildPublicAppUrl } = require('../utils/public-url');
const fs = require('fs');
const path = require('path');
const twilioService = require('../services/twilio.service');
const emailService = require('../services/email.service');
const { resolveQuerySede, resolveActionSede } = require('../utils/sede');
const { calcularFechaVencimientoCredito, getDiasPlazoCredito } = require('../utils/credito');
const { findCajaAbierta } = require('../utils/caja-abierta');
const { pagosServicio } = require('../utils/caja-cobros');
const { httpError } = require('../utils/http-error');

async function assertRepuestosEditables(orden, transaction) {
  if (['entregado', 'cancelado'].includes(orden.estado)) {
    throw httpError(409, 'No se pueden modificar repuestos de una reparación entregada o cancelada.');
  }
  const factura = await Factura.findOne({ where: { ordenReparacionId: orden.id, estado: { [Op.ne]: 'anulada' } }, transaction });
  if (factura) throw httpError(409, 'La reparación ya está facturada. No se pueden modificar sus repuestos.');
}

// --- CRUD ÓRDENES ---

exports.getOrdenes = async (req, res, next) => {
  try {
    const { estado, tecnico, sede, buscar, desde, hasta } = req.query;
    const where = {};
    const querySedeId = resolveQuerySede(sede, req.usuario);

    if (estado) where.estado = estado;
    if (tecnico) where.tecnicoId = tecnico;
    if (querySedeId) where.sedeId = querySedeId;
    if (req.query.cliente) where.clienteId = req.query.cliente;
    
    if (buscar) {
      where[Op.or] = [
        { numeroOrden: { [Op.iLike]: `%${buscar}%` } },
        { imei: { [Op.iLike]: `%${buscar}%` } },
        { '$cliente.nombre$': { [Op.iLike]: `%${buscar}%` } }
      ];
    }

    if (desde || hasta) {
      where.createdAt = {};
      if (desde) where.createdAt[Op.gte] = new Date(desde + 'T00:00:00');
      if (hasta) where.createdAt[Op.lte] = new Date(hasta + 'T23:59:59');
    }

    const ordenes = await OrdenReparacion.findAll({
      where,
      include: [
        { model: Cliente, as: 'cliente', attributes: ['nombre', 'telefono', 'documento'] },
        { model: Usuario, as: 'tecnico', attributes: ['nombre'] },
        { model: Sede, as: 'sede', attributes: ['nombre'] }
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
    const { id } = req.params;
    const orden = await OrdenReparacion.findByPk(id, {
      include: [
        { model: Cliente, as: 'cliente' },
        { model: Usuario, as: 'tecnico', attributes: ['nombre'] },
        { model: Sede, as: 'sede', attributes: ['nombre', 'direccion', 'telefono'] },
        { model: FotoReparacion, as: 'fotos' },
        { model: RepuestoOrden, as: 'repuestos', include: [{ model: Producto, as: 'producto', attributes: ['nombre', 'codigoBarras'] }] },
        { model: RentabilidadReparacion, as: 'rentabilidad' }
      ]
    });
    if (orden) assertSedeAccess(req.usuario, orden.sedeId);

    if (!orden) {
      return res.status(404).json({ error: 'Orden de reparación no encontrada.' });
    }

    return res.json(orden);
  } catch (error) {
    next(error);
  }
};

exports.createOrden = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  req.auditTransaction = transaction;
  try {
    const {
      clienteId,
      tecnicoId,
      tipoEquipo,
      marca,
      modelo,
      imei,
      problemaReportado,
      costoManoObra,
      diasGarantia,
      fechaEstimadaEntrega,
      observaciones,
      modalidad,
      direccionServicio,
      sedeId: bodySedeId
    } = req.body;

    const sedeId = await resolveActionSede(bodySedeId, req.usuario, Sede, transaction);
    if (!sedeId) {
      return res.status(400).json({ error: 'Debe seleccionar la sede de ingreso para la orden de reparación.' });
    }

    if (!clienteId || !tipoEquipo || !marca || !modelo || !problemaReportado) {
      return res.status(400).json({ error: 'Faltan campos obligatorios para registrar la orden.' });
    }

    const modalidadFinal = modalidad === 'domicilio' ? 'domicilio' : 'taller';
    if (modalidadFinal === 'domicilio' && !(direccionServicio || '').trim()) {
      await transaction.rollback();
      return res.status(400).json({ error: 'La dirección es obligatoria para servicio a domicilio.' });
    }

    // Secuencia de ordenes
    const numeroOrden = await nextDocumentNumber(sequelize, 'OR', transaction);

    const manoObraNum = parseFloat(costoManoObra || 0);

    const orden = await OrdenReparacion.create({
      numeroOrden,
      tokenPublico: require('crypto').randomUUID(),
      clienteId,
      tecnicoId: tecnicoId || null,
      sedeId,
      modalidad: modalidadFinal,
      direccionServicio: modalidadFinal === 'domicilio' ? (direccionServicio || '').trim() : null,
      tipoEquipo,
      marca,
      modelo,
      imei,
      problemaReportado,
      diagnostico: '',
      costoManoObra: manoObraNum,
      costoRepuestos: 0,
      totalCobrado: manoObraNum, // Inicialmente solo mano de obra
      estado: 'recibido',
      diasGarantia: parseInt(diasGarantia || 0),
      fechaEstimadaEntrega: fechaEstimadaEntrega || null,
      observaciones,
      notificacionEnviada: false
    }, { transaction });

    // Inicializar tabla de rentabilidad
    await RentabilidadReparacion.create({
      ordenId: orden.id,
      costoReal: 0,
      totalCobrado: manoObraNum,
      margen: manoObraNum // Margen inicial es total mano de obra ya que no hay costo repuesto
    }, { transaction });

    await transaction.commit();

    if (req.logAudit) {
      await req.logAudit({
        accion: 'CREATE',
        modulo: 'Reparaciones',
        registroId: orden.id,
        valorNuevo: orden.toJSON()
      });
    }

    // Disparar envío de notificación de forma asíncrona
    twilioService.enviarNotificacionReparacion(orden.id, 'recibido');
    emailService.enviarNotificacionReparacion(orden.id, 'recibido').catch((err) => {
      console.error('[Email] Error en notificación recibido:', err.message);
    });

    return res.status(201).json(orden);
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    next(error);
  } finally {
    if (!transaction.finished) await transaction.rollback();
  }
};

exports.updateOrden = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  req.auditTransaction = transaction;
  try {
    const { id } = req.params;
    const orden = await OrdenReparacion.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (orden) assertSedeAccess(req.usuario, orden.sedeId);

    if (!orden) {
      return res.status(404).json({ error: 'Orden de reparación no encontrada.' });
    }

    const {
      tecnicoId,
      diagnostico,
      costoManoObra,
      diasGarantia,
      fechaEstimadaEntrega,
      observaciones,
      totalCobrado,
      modalidad,
      direccionServicio
    } = req.body;

    const valorAnterior = orden.toJSON();

    const manoObraNum = costoManoObra !== undefined ? parseFloat(costoManoObra) : parseFloat(orden.costoManoObra);
    const repuestosNum = parseFloat(orden.costoRepuestos);
    // Si no se pasa totalCobrado, recalculamos sumando manoObra y costoRepuestos
    const finalTotalCobrado = totalCobrado !== undefined ? parseFloat(totalCobrado) : (manoObraNum + repuestosNum);

    let modalidadFinal = orden.modalidad || 'taller';
    let direccionFinal = orden.direccionServicio;
    if (modalidad !== undefined) {
      modalidadFinal = modalidad === 'domicilio' ? 'domicilio' : 'taller';
    }
    if (direccionServicio !== undefined) {
      direccionFinal = direccionServicio || null;
    }
    if (modalidadFinal === 'domicilio' && !(direccionFinal || '').trim()) {
      await transaction.rollback();
      return res.status(400).json({ error: 'La dirección es obligatoria para servicio a domicilio.' });
    }
    if (modalidadFinal === 'taller') {
      direccionFinal = null;
    }

    await orden.update({
      tecnicoId: tecnicoId !== undefined ? (tecnicoId || null) : orden.tecnicoId,
      diagnostico: diagnostico !== undefined ? diagnostico : orden.diagnostico,
      costoManoObra: manoObraNum,
      totalCobrado: finalTotalCobrado,
      diasGarantia: diasGarantia !== undefined ? parseInt(diasGarantia) : orden.diasGarantia,
      fechaEstimadaEntrega: fechaEstimadaEntrega !== undefined ? fechaEstimadaEntrega : orden.fechaEstimadaEntrega,
      observaciones: observaciones !== undefined ? observaciones : orden.observaciones,
      modalidad: modalidadFinal,
      direccionServicio: direccionFinal
    }, { transaction });

    // Actualizar rentabilidad
    const rentabilidad = await RentabilidadReparacion.findOne({ where: { ordenId: id }, transaction });
    if (rentabilidad) {
      const costoRealNum = parseFloat(rentabilidad.costoReal);
      await rentabilidad.update({
        totalCobrado: finalTotalCobrado,
        margen: finalTotalCobrado - costoRealNum
      }, { transaction });
    }

    await transaction.commit();

    if (req.logAudit) {
      await req.logAudit({
        accion: 'UPDATE',
        modulo: 'Reparaciones',
        registroId: id,
        valorAnterior,
        valorNuevo: orden.toJSON()
      });
    }

    return res.json(orden);
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    next(error);
  } finally {
    if (!transaction.finished) await transaction.rollback();
  }
};

// --- CAMBIO DE ESTADO ---

exports.updateEstado = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  req.auditTransaction = transaction;
  try {
    const { id } = req.params;
    const { estado, metodoPago, pagos, esCredito } = req.body;

    if (!['recibido', 'diagnostico', 'en_reparacion', 'listo', 'entregado', 'cancelado'].includes(estado)) {
      return res.status(400).json({ error: 'Estado de reparación inválido.' });
    }

    const orden = await OrdenReparacion.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (orden) assertSedeAccess(req.usuario, orden.sedeId);
    if (!orden) {
      return res.status(404).json({ error: 'Orden de reparación no encontrada.' });
    }

    if (orden.estado === estado) {
      await transaction.commit();
      return res.json({ message: 'La orden ya tiene este estado.', estado });
    }
    if (['entregado', 'cancelado'].includes(orden.estado)) {
      return res.status(409).json({ error: 'Una reparación entregada o cancelada no puede volver a cobrarse.' });
    }

    if (estado === 'entregado') {
      const facturaExistente = await Factura.findOne({ where: { ordenReparacionId: id }, transaction });
      if (facturaExistente) return res.status(409).json({ error: 'Esta reparación ya fue facturada. Revise su factura antes de cobrar nuevamente.' });
      const { caja } = await findCajaAbierta({
        sedeId: orden.sedeId,
        usuarioId: req.usuario.userId,
        transaction
      });

      if (!caja) {
        throw new Error('Debe abrir caja en la sede de la orden antes de entregar y cobrar la reparación.');
      }

      const totalNum = parseFloat(orden.totalCobrado || 0);
      const pagosCaja = pagosServicio(totalNum, pagos, metodoPago || 'efectivo', esCredito === true);
      let totalPagado = totalNum;
      let saldoPendiente = 0;

      // Si se envía un desglose de pagos mixtos
      if (pagos) {
        const efectivoRec = parseFloat(pagos.efectivo || 0);
        const nequiRec = parseFloat(pagos.nequi || 0);
        const daviplataRec = parseFloat(pagos.daviplata || 0);
        const tarjetaRec = parseFloat(pagos.tarjeta || 0);
        const transferenciaRec = parseFloat(pagos.transferencia || 0);

        totalPagado = efectivoRec + nequiRec + daviplataRec + tarjetaRec + transferenciaRec;

        if (![efectivoRec, nequiRec, daviplataRec, tarjetaRec, transferenciaRec].every((monto) => (
          Number.isFinite(monto) && monto >= 0
        ))) {
          throw new Error('Los montos de pago deben ser valores positivos o cero.');
        }

        saldoPendiente = Math.max(0, totalNum - totalPagado);
        if (saldoPendiente > 0) {
          if (!esCredito) {
            throw new Error('El pago no cubre el total. Active la opción de crédito para registrar el saldo pendiente.');
          }

          const cliente = await Cliente.findByPk(orden.clienteId, { transaction });
          const esConsumidorFinal = !cliente ||
            cliente.nombre === 'Consumidor Final' ||
            ['222222222', '222222222-0', '222222222222'].includes(cliente.documento);

          if (esConsumidorFinal) {
            throw new Error('Debe asignar un cliente registrado para entregar una reparación a crédito.');
          }
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
        // Fallback a pago único tradicional
        const metodo = metodoPago || 'efectivo';
        if (!['efectivo', 'nequi', 'daviplata', 'tarjeta', 'transferencia'].includes(metodo)) {
          throw new Error('Método de pago inválido.');
        }

        if (metodo === 'efectivo') {
          await caja.update({ totalVentasEfectivo: parseFloat(caja.totalVentasEfectivo) + totalNum }, { transaction });
        } else if (metodo === 'nequi') {
          await caja.update({ totalVentasNequi: parseFloat(caja.totalVentasNequi) + totalNum }, { transaction });
        } else if (metodo === 'daviplata') {
          await caja.update({ totalVentasDaviplata: parseFloat(caja.totalVentasDaviplata) + totalNum }, { transaction });
        } else if (metodo === 'tarjeta') {
          await caja.update({ totalVentasTarjeta: parseFloat(caja.totalVentasTarjeta) + totalNum }, { transaction });
        } else if (metodo === 'transferencia') {
          await caja.update({ totalVentasTransferencia: parseFloat(caja.totalVentasTransferencia) + totalNum }, { transaction });
        }
      }

      // Crear factura si no existe
      const yaFacturado = await Factura.findOne({ where: { ordenReparacionId: id }, transaction });
      if (!yaFacturado) {
        const numeroFactura = await nextDocumentNumber(sequelize, 'FE', transaction);
        const diasPlazo = await getDiasPlazoCredito(ConfiguracionSistema, transaction);
        const fechaVencimiento = calcularFechaVencimientoCredito(diasPlazo);
        const config = await ConfiguracionSistema.findOne({ transaction });
        const cobrarIvaTaller = config?.cobrarIvaTaller === true;
        const tasaIva = Math.max(0, parseFloat(config?.ivaDefecto ?? 19)) / 100;
        const iva = cobrarIvaTaller && tasaIva > 0
          ? totalNum - (totalNum / (1 + tasaIva))
          : 0;
        const subtotal = totalNum - iva;
        
        const factura = await Factura.create({
          numeroFactura,
          cajaId: caja.id,
          pagosCaja,
          ordenReparacionId: id,
          clienteId: orden.clienteId,
          sedeId: orden.sedeId,
          subtotal,
          iva,
          total: totalNum,
          estado: saldoPendiente > 0 ? 'abono_parcial' : 'pagada',
          fechaVencimiento
        }, { transaction });

        if (saldoPendiente > 0) {
          await CuentaPorCobrar.create({
            facturaId: factura.id,
            clienteId: orden.clienteId,
            totalOriginal: totalNum,
            totalAbonado: totalPagado,
            saldoPendiente,
            fechaVencimiento,
            estado: 'al_dia'
          }, { transaction });
        }
      }
    }

    const valorAnterior = orden.toJSON();
    await orden.update({
      estado,
      notificacionEnviada: false // Preparar el hook de Twilio (Fase 10)
    }, { transaction });

    await transaction.commit();

    if (req.logAudit) {
      await req.logAudit({
        accion: 'UPDATE',
        modulo: 'Reparaciones',
        registroId: id,
        valorAnterior,
        valorNuevo: { estado }
      });
    }

    // Disparar envío de notificación en base al nuevo estado
    twilioService.enviarNotificacionReparacion(orden.id, estado);
    emailService.enviarNotificacionReparacion(orden.id, estado).catch((err) => {
      console.error('[Email] Error en notificación de reparación:', err.message);
    });

    return res.json({ message: 'Estado actualizado correctamente.', estado: orden.estado });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    next(error);
  } finally {
    if (!transaction.finished) await transaction.rollback();
  }
};

// --- ASIGNACIÓN DE REPUESTOS ---

exports.addRepuestos = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  req.auditTransaction = transaction;
  try {
    const { id } = req.params; // ID de OrdenReparacion
    const { productoId, cantidad } = req.body;

    if (!productoId || !cantidad || parseInt(cantidad) <= 0) {
      return res.status(400).json({ error: 'Parámetros de repuesto incompletos o cantidad inválida.' });
    }

    const orden = await OrdenReparacion.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (orden) assertSedeAccess(req.usuario, orden.sedeId);
    if (!orden) {
      return res.status(404).json({ error: 'Orden de reparación no encontrada.' });
    }

    await assertRepuestosEditables(orden, transaction);
    const sedeId = orden.sedeId;

    const producto = await Producto.findByPk(productoId, { transaction });
    if (!producto) {
      return res.status(404).json({ error: 'Producto repuesto no encontrado.' });
    }

    // 1. Validar y descontar stock en la sede actual
    const stock = await StockSede.findOne({
      where: { productoId, sedeId },
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!stock || stock.cantidad < parseInt(cantidad)) {
      return res.status(400).json({ error: 'Stock insuficiente del repuesto en esta sede.' });
    }

    await stock.update({ cantidad: stock.cantidad - parseInt(cantidad) }, { transaction });

    // 2. Registrar movimiento de inventario
    await MovimientoInventario.create({
      productoId,
      sedeId,
      tipo: 'salida',
      cantidad: -parseInt(cantidad),
      motivo: `Repuesto asignado a Orden #${orden.numeroOrden}`,
      referenciaId: orden.id,
      usuarioId: req.usuario.userId
    }, { transaction });

    const costoUnitario = parseFloat(producto.precioCosto);

    // 3. Crear registro de Repuesto en la orden
    const repuestoOrden = await RepuestoOrden.create({
      ordenId: id,
      productoId,
      cantidad: parseInt(cantidad),
      costoUnitario
    }, { transaction });

    // 4. Actualizar total costo repuestos en la orden y el total cobrado
    const nuevoCostoRepuestos = parseFloat(orden.costoRepuestos) + (costoUnitario * parseInt(cantidad));
    const nuevoTotalCobrado = parseFloat(orden.totalCobrado) + (costoUnitario * parseInt(cantidad)); // Sumamos al cobro el costo de repuestos

    await orden.update({
      costoRepuestos: nuevoCostoRepuestos,
      totalCobrado: nuevoTotalCobrado
    }, { transaction });

    // 5. Actualizar rentabilidad
    const rentabilidad = await RentabilidadReparacion.findOne({ where: { ordenId: id }, transaction });
    if (rentabilidad) {
      const nuevoCostoReal = parseFloat(rentabilidad.costoReal) + (costoUnitario * parseInt(cantidad));
      await rentabilidad.update({
        costoReal: nuevoCostoReal,
        totalCobrado: nuevoTotalCobrado,
        margen: nuevoTotalCobrado - nuevoCostoReal
      }, { transaction });
    }

    await transaction.commit();

    if (req.logAudit) {
      await req.logAudit({
        accion: 'UPDATE',
        modulo: 'Reparaciones',
        registroId: id,
        valorNuevo: { repuesto: producto.nombre, cantidad: parseInt(cantidad) }
      });
    }

    return res.status(201).json(repuestoOrden);
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    next(error);
  } finally {
    if (!transaction.finished) await transaction.rollback();
  }
};

exports.updateRepuesto = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  req.auditTransaction = transaction;
  try {
    const { id, repuestoId } = req.params;
    const raw = req.body.costoUnitario;
    const round = value => Math.round(value * 100) / 100;
    const maxImporte = 9999999999999.99;
    if (!['number', 'string'].includes(typeof raw) || String(raw).trim() === '' ||
      !Number.isFinite(Number(raw)) || Number(raw) < 0 || Number(raw) > maxImporte) {
      throw httpError(400, 'Ingrese un costo unitario válido, mayor o igual a cero.');
    }
    const costoUnitario = round(Number(raw));
    const orden = await OrdenReparacion.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!orden) throw httpError(404, 'Orden de reparación no encontrada.');
    assertSedeAccess(req.usuario, orden.sedeId);
    await assertRepuestosEditables(orden, transaction);
    const repuesto = await RepuestoOrden.findOne({ where: { id: repuestoId, ordenId: id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!repuesto) throw httpError(404, 'El repuesto no está asignado a esta reparación.');
    const cantidad = Number(repuesto.cantidad);
    const costoAnterior = Number(repuesto.costoUnitario);
    const diferencia = round(costoUnitario * cantidad) - round(costoAnterior * cantidad);
    const costoRepuestos = round(Number(orden.costoRepuestos) + diferencia);
    const totalCobrado = round(Number(orden.totalCobrado) + diferencia);
    const validImporte = value => Number.isFinite(value) && value >= 0 && value <= maxImporte;
    if (!Number.isSafeInteger(cantidad) || cantidad <= 0 || !validImporte(costoAnterior) ||
      !validImporte(costoUnitario * cantidad) || !validImporte(costoRepuestos) || !validImporte(totalCobrado)) {
      throw httpError(409, 'Los importes del repuesto no concilian con la reparación.');
    }
    const rentabilidad = await RentabilidadReparacion.findOne({ where: { ordenId: id }, transaction, lock: transaction.LOCK.UPDATE });
    if (rentabilidad) {
      const costoReal = round(Number(rentabilidad.costoReal) + diferencia);
      if (!validImporte(costoReal)) throw httpError(409, 'El costo registrado no concilia con el repuesto.');
      await rentabilidad.update({ costoReal, totalCobrado, margen: round(totalCobrado - costoReal) }, { transaction });
    }
    const valorAnterior = { repuestoId, costoUnitario: costoAnterior, costoRepuestos: orden.costoRepuestos, totalCobrado: orden.totalCobrado };
    await repuesto.update({ costoUnitario }, { transaction });
    await orden.update({ costoRepuestos, totalCobrado }, { transaction });
    await transaction.commit();
    if (req.logAudit) await req.logAudit({ accion: 'UPDATE', modulo: 'Reparaciones', registroId: id, valorAnterior,
      valorNuevo: { repuestoId, costoUnitario, costoRepuestos, totalCobrado } });
    return res.json({ message: 'Costo del repuesto actualizado.', costoUnitario, costoRepuestos, totalCobrado });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    next(error);
  } finally {
    if (!transaction.finished) await transaction.rollback();
  }
};

exports.removeRepuesto = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  req.auditTransaction = transaction;
  try {
    const { id, repuestoId } = req.params;
    const orden = await OrdenReparacion.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!orden) throw httpError(404, 'Orden de reparación no encontrada.');
    assertSedeAccess(req.usuario, orden.sedeId);
    await assertRepuestosEditables(orden, transaction);
    const repuesto = await RepuestoOrden.findOne({ where: { id: repuestoId, ordenId: id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!repuesto) throw httpError(404, 'El repuesto no está asignado a esta reparación.');
    const stock = await StockSede.findOne({ where: { productoId: repuesto.productoId, sedeId: orden.sedeId }, transaction, lock: transaction.LOCK.UPDATE });
    if (!stock) throw httpError(409, 'No se encontró el registro de inventario de este repuesto en la sede.');
    const cantidad = Number(repuesto.cantidad);
    const round = value => Math.round(value * 100) / 100;
    const costo = round(Number(repuesto.costoUnitario) * cantidad);
    const costoRepuestos = round(Number(orden.costoRepuestos) - costo);
    const totalCobrado = round(Number(orden.totalCobrado) - costo);
    if (!Number.isSafeInteger(cantidad) || cantidad <= 0 || !Number.isFinite(costo) || costo < 0 ||
      !Number.isFinite(costoRepuestos) || !Number.isFinite(totalCobrado) || costoRepuestos < 0 || totalCobrado < 0) {
      throw httpError(409, 'Los importes del repuesto no concilian con la reparación. Revise sus totales antes de retirarlo.');
    }
    const rentabilidad = await RentabilidadReparacion.findOne({ where: { ordenId: id }, transaction, lock: transaction.LOCK.UPDATE });
    if (rentabilidad) {
      const costoReal = round(Number(rentabilidad.costoReal) - costo);
      if (!Number.isFinite(costoReal) || costoReal < 0) throw httpError(409, 'El costo registrado no concilia con el repuesto.');
      await rentabilidad.update({ costoReal, totalCobrado, margen: round(totalCobrado - costoReal) }, { transaction });
    }
    const valorAnterior = repuesto.toJSON();
    await stock.update({ cantidad: Number(stock.cantidad) + cantidad }, { transaction });
    await MovimientoInventario.create({ productoId: repuesto.productoId, sedeId: orden.sedeId, tipo: 'entrada', cantidad,
      motivo: `Repuesto retirado de Orden #${orden.numeroOrden}`, referenciaId: orden.id, usuarioId: req.usuario.userId }, { transaction });
    await repuesto.destroy({ transaction });
    await orden.update({ costoRepuestos, totalCobrado }, { transaction });
    await transaction.commit();
    if (req.logAudit) await req.logAudit({ accion: 'UPDATE', modulo: 'Reparaciones', registroId: id, valorAnterior,
      valorNuevo: { repuestoRetiradoId: repuestoId, productoId: repuesto.productoId, cantidadDevuelta: cantidad, costoRepuestos, totalCobrado } });
    return res.json({ message: 'Repuesto retirado y devuelto al inventario.', costoRepuestos, totalCobrado });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    next(error);
  } finally {
    if (!transaction.finished) await transaction.rollback();
  }
};

// --- SUBIR FOTOGRAFÍAS ---

exports.uploadFotos = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { momento } = req.body; // 'recepcion' o 'entrega'

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Por favor, suba al menos una fotografía.' });
    }

    if (!['recepcion', 'entrega'].includes(momento)) {
      return res.status(400).json({ error: 'Momento de fotografía inválido.' });
    }

    const orden = await OrdenReparacion.findByPk(id);
    if (orden) assertSedeAccess(req.usuario, orden.sedeId);
    if (!orden) {
      return res.status(404).json({ error: 'Orden de reparación no encontrada.' });
    }

    const fotos = [];
    for (const file of req.files) {
      // Guardar url estática relativa
      const url = `/uploads/reparaciones/${file.filename}`;
      const foto = await FotoReparacion.create({
        ordenId: id,
        url,
        momento
      });
      fotos.push(foto);
    }

    return res.status(201).json(fotos);
  } catch (error) {
    next(error);
  }
};

// --- GENERACIÓN DE ORDEN PDF (PDFKIT) ---

exports.getOrdenPdf = async (req, res, next) => {
  try {
    const { id } = req.params;
    const orden = await OrdenReparacion.findByPk(id, {
      include: [
        { model: Cliente, as: 'cliente' },
        { model: Sede, as: 'sede' },
        { model: Usuario, as: 'tecnico', attributes: ['nombre'] }
      ]
    });
    if (orden) assertSedeAccess(req.usuario, orden.sedeId);

    if (!orden) {
      return res.status(404).json({ error: 'Orden de reparación no encontrada.' });
    }

    const config = await ConfiguracionSistema.findOne();
    const empresa = config?.empresa || 'TechStore Colombia S.A.S.';
    const nit = config?.nit || 'N/A';

    const doc = new PDFDocument({ margin: 50 });
    
    // Set headers for download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=orden_${orden.numeroOrden}.pdf`);
    doc.pipe(res);

    // Header de la Empresa
    doc.fontSize(20).text(empresa.toUpperCase(), { align: 'center', fw: 'bold' });
    doc.fontSize(10).text(`NIT: ${nit} | Sede: ${orden.sede.nombre}`, { align: 'center' });
    doc.text(`Dirección: ${orden.sede.direccion} | Tel: ${orden.sede.telefono}`, { align: 'center' });
    doc.moveDown(2);

    // Número de Orden
    doc.fontSize(16).text(`ORDEN DE INGRESO A TALLER: #${orden.numeroOrden}`, { align: 'center', color: '#2563eb' });
    doc.fontSize(10).text(`Fecha de Ingreso: ${new Date(orden.createdAt).toLocaleString()}`, { align: 'center' });
    doc.moveDown(1.5);

    // Ficha de Cliente
    doc.fontSize(12).text('INFORMACIÓN DEL CLIENTE', { underline: true });
    doc.fontSize(10).text(`Nombre: ${orden.cliente.nombre}`);
    doc.text(`Documento / NIT: ${orden.cliente.documento || 'No registrado'}`);
    doc.text(`Teléfono: ${orden.cliente.telefono || 'No registrado'}`);
    doc.text(`Correo Electrónico: ${orden.cliente.email || 'No registrado'}`);
    doc.moveDown(1.5);

    // Detalles del Dispositivo
    doc.fontSize(12).text('DETALLES DEL DISPOSITIVO', { underline: true });
    doc.fontSize(10).text(`Dispositivo: ${orden.tipoEquipo}`);
    doc.text(`Marca / Modelo: ${orden.marca} ${orden.modelo}`);
    doc.text(`IMEI / Número de Serie: ${orden.imei || 'N/A'}`);
    doc.text(`Técnico Asignado: ${orden.tecnico ? orden.tecnico.nombre : 'Por asignar'}`);
    doc.moveDown(1.5);

    // Diagnóstico
    doc.fontSize(12).text('REPORTE TÉCNICO Y DIAGNÓSTICO', { underline: true });
    doc.fontSize(10).text(`Falla reportada por el cliente: ${orden.problemaReportado}`);
    doc.text(`Diagnóstico preliminar: ${orden.diagnostico || 'Pendiente por revisar'}`);
    doc.text(`Fecha Estimada de Entrega: ${orden.fechaEstimadaEntrega ? new Date(orden.fechaEstimadaEntrega).toLocaleDateString() : 'Por confirmar'}`);
    doc.moveDown(1.5);

    // Costos
    const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });
    doc.fontSize(12).text('PRESUPUESTO ESTIMADO', { underline: true });
    doc.fontSize(10).text(`Mano de Obra estimada: ${formatter.format(orden.costoManoObra)}`);
    doc.text(`Repuestos estimados: ${formatter.format(orden.costoRepuestos)}`);
    doc.fontSize(11).text(`TOTAL ESTIMADO A COBRAR: ${formatter.format(orden.totalCobrado)}`, { bold: true });
    doc.moveDown(2);

    // Cláusulas de garantía
    doc.fontSize(8).text('TÉRMINOS Y CONDICIONES DE GARANTÍA:', { underline: true });
    doc.text('1. El diagnóstico inicial se realiza en un plazo de 24 a 48 horas hábiles.');
    doc.text(`2. Los repuestos instalados cuentan con una garantía de ${orden.diasGarantia || 30} días a partir de la entrega.`);
    doc.text(`3. ${empresa} no se hace responsable por pérdida de datos. Respalde su información.`);
    doc.text('4. Pasados 30 días del aviso de retiro, el equipo entrará en proceso de abandono.');
    doc.moveDown(3);

    // Firmas
    doc.fontSize(10);
    doc.text('_______________________                  _______________________', { align: 'center' });
    doc.text(`Firma Recibido (${empresa})                  Firma Cliente conforme`, { align: 'center' });

    doc.end();
  } catch (error) {
    next(error);
  }
};

// --- GENERACIÓN DE ETIQUETA QR ---

exports.getEtiquetaQr = async (req, res, next) => {
  try {
    const { id } = req.params;
    const orden = await OrdenReparacion.findByPk(id);
    if (orden) assertSedeAccess(req.usuario, orden.sedeId);

    if (!orden) {
      return res.status(404).json({ error: 'Orden de reparación no encontrada.' });
    }

    // Token opaco: no enumerable (OR-000001 ya no va en el QR público)
    const publicToken = orden.tokenPublico || orden.id;
    const scanUrl = `${buildPublicAppUrl(req)}/r/${encodeURIComponent(publicToken)}`;
    
    // Generar imagen de código QR y hacer stream como PNG
    res.setHeader('Content-Type', 'image/png');
    await qr.toFileStream(res, scanUrl, {
      width: 150,
      margin: 1
    });
  } catch (error) {
    next(error);
  }
};

// --- ANALÍTICA DE RENTABILIDAD ---

exports.getRentabilidadReport = async (req, res, next) => {
  try {
    const { tecnico, desde, hasta } = req.query;
    const where = {
      // Solo órdenes ya cobradas (el cobro ocurre al entregar)
      estado: 'entregado'
    };
    const scopedSedeId = resolveQuerySede(req.query.sede || req.query.sedeId, req.usuario);
    if (scopedSedeId) where.sedeId = scopedSedeId;

    if (tecnico) {
      where.tecnicoId = tecnico;
    }

    // Filtrar por fechas
    if (desde && hasta) {
      where.createdAt = { [Op.between]: [new Date(desde), new Date(hasta)] };
    }

    const rentabilidades = await RentabilidadReparacion.findAll({
      include: [
        {
          model: OrdenReparacion,
          as: 'orden',
          where,
          attributes: ['numeroOrden', 'tipoEquipo', 'marca', 'modelo', 'costoManoObra', 'costoRepuestos', 'createdAt', 'estado'],
          include: [{ model: Usuario, as: 'tecnico', attributes: ['nombre'] }]
        }
      ],
      order: [[{ model: OrdenReparacion, as: 'orden' }, 'createdAt', 'DESC']]
    });

    return res.json(rentabilidades);
  } catch (error) {
    next(error);
  }
};
