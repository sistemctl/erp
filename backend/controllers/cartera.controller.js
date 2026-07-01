const { CuentaPorCobrar, Abono, Factura, Venta, Cliente, Sede, Usuario, Caja, sequelize } = require('../models');
const { Op } = require('sequelize');
const { resolveQuerySede } = require('../utils/sede');

// --- GET ALL CUENTAS POR COBRAR (CARTERA) ---
exports.getCartera = async (req, res, next) => {
  try {
    const { sede, cliente, estado, morosidad } = req.query;
    const where = {};

    const querySedeId = resolveQuerySede(sede, req.usuario);
    
    const includeFacturaWhere = {};
    if (querySedeId) {
      includeFacturaWhere.sedeId = querySedeId;
    }

    if (cliente) {
      where.clienteId = cliente;
    }

    if (estado) {
      where.estado = estado;
    }

    const cartera = await CuentaPorCobrar.findAll({
      where,
      include: [
        { model: Cliente, as: 'cliente', attributes: ['nombre', 'documento', 'telefono'] },
        { 
          model: Factura, 
          as: 'factura', 
          where: includeFacturaWhere,
          include: [{ model: Sede, as: 'sede', attributes: ['nombre'] }]
        }
      ],
      order: [['fechaVencimiento', 'ASC']]
    });

    const hoy = new Date();

    // Calcular antigüedad en mora en tiempo real
    const itemsProcesados = cartera.map(cpc => {
      const plain = cpc.get({ plain: true });
      const fechaVence = new Date(plain.fechaVencimiento);
      const diffTime = hoy - fechaVence;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      let diasVencido = 0;
      let semaforo = 'green';
      let clasificacion = '0-30';

      if (diffDays > 0 && plain.estado !== 'pagada' && parseFloat(plain.saldoPendiente) > 0) {
        diasVencido = diffDays;
        if (diasVencido > 90) {
          semaforo = 'red';
          clasificacion = '+90';
        } else if (diasVencido > 60) {
          semaforo = 'orange';
          clasificacion = '60-90';
        } else if (diasVencido > 30) {
          semaforo = 'yellow';
          clasificacion = '30-60';
        }
      }

      plain.diasVencido = diasVencido;
      plain.semaforo = semaforo;
      plain.clasificacion = clasificacion;
      
      return plain;
    });

    // Filtrar por morosidad/clasificación si se solicita
    let result = itemsProcesados;
    if (morosidad) {
      result = itemsProcesados.filter(item => item.clasificacion === morosidad);
    }

    return res.json(result);
  } catch (error) {
    next(error);
  }
};

// --- REGISTRAR ABONO A CUENTA POR COBRAR ---
exports.registrarAbonoCartera = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { monto, metodo, observaciones, sedeId: bodySedeId } = req.body;

    const cpc = await CuentaPorCobrar.findByPk(id, {
      include: [
        { model: Factura, as: 'factura' }
      ],
      transaction
    });

    if (!cpc) {
      return res.status(404).json({ error: 'Cuenta por cobrar no encontrada.' });
    }

    const sedeId = bodySedeId || req.usuario.sedeId || cpc.factura?.sedeId;
    if (!sedeId) {
      return res.status(400).json({ error: 'Debe especificar la sede para registrar el abono de cartera.' });
    }

    const usuarioId = req.usuario.userId;

    if (!monto || parseFloat(monto) <= 0 || !metodo) {
      return res.status(400).json({ error: 'Monto y método de pago requeridos.' });
    }

    // 1. Validar caja abierta para la sede del cajero
    const caja = await Caja.findOne({
      where: { sedeId, estado: 'abierta' },
      transaction
    });

    if (!caja) {
      return res.status(400).json({ error: 'Debe abrir caja antes de registrar abonos de cartera.' });
    }

    // 2. Buscar la cuenta por cobrar (ya cargada arriba)

    if (!cpc) {
      return res.status(404).json({ error: 'Cuenta por cobrar no encontrada.' });
    }

    if (parseFloat(cpc.saldoPendiente) <= 0) {
      return res.status(400).json({ error: 'Esta cuenta ya se encuentra totalmente cancelada.' });
    }

    const montoAbono = parseFloat(monto);
    if (montoAbono > parseFloat(cpc.saldoPendiente)) {
      return res.status(400).json({ error: `El monto del abono supera el saldo pendiente de: ${cpc.saldoPendiente} COP.` });
    }

    const valorAnterior = cpc.toJSON();

    // 3. Crear registro de Abono
    const abono = await Abono.create({
      cuentaPorCobrarId: cpc.id,
      usuarioId,
      monto: montoAbono,
      metodo,
      observaciones: observaciones || ''
    }, { transaction });

    // 4. Actualizar saldos en la Cuenta Por Cobrar
    const nuevoTotalAbonado = parseFloat(cpc.totalAbonado) + montoAbono;
    const nuevoSaldoPendiente = parseFloat(cpc.saldoPendiente) - montoAbono;
    const nuevoEstado = nuevoSaldoPendiente <= 0 ? 'pagada' : cpc.estado;

    await cpc.update({
      totalAbonado: nuevoTotalAbonado,
      saldoPendiente: nuevoSaldoPendiente,
      estado: nuevoEstado
    }, { transaction });

    // 5. Actualizar la Factura y la Venta si aplica
    const factura = await Factura.findByPk(cpc.facturaId, { transaction });
    if (factura) {
      const nuevoEstadoFactura = nuevoSaldoPendiente <= 0 ? 'pagada' : 'abono_parcial';
      await factura.update({ estado: nuevoEstadoFactura }, { transaction });

      if (factura.ventaId) {
        const venta = await Venta.findByPk(factura.ventaId, { transaction });
        if (venta) {
          const nuevoEstadoVenta = nuevoSaldoPendiente <= 0 ? 'completada' : 'credito';
          await venta.update({
            saldoPendiente: nuevoSaldoPendiente,
            estado: nuevoEstadoVenta
          }, { transaction });
        }
      }
    }

    // 6. Impactar el saldo en la Caja del Día
    if (metodo === 'efectivo') {
      await caja.update({ totalVentasEfectivo: parseFloat(caja.totalVentasEfectivo) + montoAbono }, { transaction });
    } else if (metodo === 'nequi') {
      await caja.update({ totalVentasNequi: parseFloat(caja.totalVentasNequi) + montoAbono }, { transaction });
    } else if (metodo === 'daviplata') {
      await caja.update({ totalVentasDaviplata: parseFloat(caja.totalVentasDaviplata) + montoAbono }, { transaction });
    } else if (metodo === 'tarjeta') {
      await caja.update({ totalVentasTarjeta: parseFloat(caja.totalVentasTarjeta) + montoAbono }, { transaction });
    } else if (metodo === 'transferencia') {
      await caja.update({ totalVentasTransferencia: parseFloat(caja.totalVentasTransferencia) + montoAbono }, { transaction });
    }

    await transaction.commit();

    if (req.logAudit) {
      await req.logAudit({
        accion: 'CARTERA_ABONO',
        modulo: 'Cartera',
        registroId: abono.id,
        valorAnterior,
        valorNuevo: cpc.toJSON()
      });
    }

    return res.status(201).json({ message: 'Abono registrado correctamente.', abono, cuentaPorCobrar: cpc });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};
