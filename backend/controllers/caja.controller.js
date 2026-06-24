const { Caja, EgresoCaja, CategoriaEgreso, Usuario, ConfiguracionSistema, Sede, sequelize } = require('../models');
const { Op } = require('sequelize');

function getLocalDateStr(date = new Date()) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// --- APERTURA DE CAJA ---

exports.aperturaCaja = async (req, res, next) => {
  try {
    const { montoApertura } = req.body;
    const sedeId = req.usuario.sedeId;

    if (!sedeId) {
      return res.status(400).json({ error: 'El usuario debe pertenecer a una sede para abrir caja.' });
    }

    if (montoApertura === undefined || parseFloat(montoApertura) < 0) {
      return res.status(400).json({ error: 'Monto de apertura inválido.' });
    }

    // Verificar si ya hay una caja abierta en esta sede
    const cajaAbierta = await Caja.findOne({
      where: {
        sedeId,
        estado: 'abierta'
      }
    });

    if (cajaAbierta) {
      return res.status(400).json({ error: 'Ya existe una caja abierta para esta sede.' });
    }

    const hoyStr = getLocalDateStr();

    const caja = await Caja.create({
      sedeId,
      usuarioAperturaId: req.usuario.userId,
      montoApertura: parseFloat(montoApertura),
      fecha: hoyStr,
      estado: 'abierta',
      totalVentasEfectivo: 0,
      totalVentasNequi: 0,
      totalVentasDaviplata: 0,
      totalVentasTarjeta: 0,
      totalVentasTransferencia: 0,
      totalEgresos: 0,
      diferencia: 0
    });

    if (req.logAudit) {
      await req.logAudit({
        accion: 'CREATE',
        modulo: 'Caja',
        registroId: caja.id,
        valorNuevo: caja.toJSON()
      });
    }

    return res.status(201).json(caja);
  } catch (error) {
    next(error);
  }
};

// --- EGRESO DE CAJA ---

exports.egresoCaja = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { monto, categoriaId, motivo, pinAdmin } = req.body;
    const sedeId = req.usuario.sedeId;

    if (!monto || parseFloat(monto) <= 0 || !categoriaId || !motivo) {
      return res.status(400).json({ error: 'Parámetros de egreso incompletos o monto inválido.' });
    }

    // 1. Obtener la caja abierta
    const caja = await Caja.findOne({
      where: { sedeId, estado: 'abierta' },
      transaction
    });

    if (!caja) {
      return res.status(400).json({ error: 'No hay ninguna caja abierta en esta sede para registrar egresos.' });
    }

    // 2. Obtener configuración del sistema
    const config = await ConfiguracionSistema.findOne({ transaction });
    const limiteSinPin = config ? parseFloat(config.egresoMaximoSinPin) : 50000.00;

    let requirioPin = false;
    let autorizadoPorId = null;

    if (parseFloat(monto) > limiteSinPin) {
      if (!pinAdmin) {
        return res.status(401).json({ error: 'Este monto supera el límite permitido. Requiere PIN del Administrador.' });
      }

      // Buscar administrador que coincida con la contraseña/PIN
      const administradores = await Usuario.findAll({ where: { rol: 'admin', activo: true }, transaction });
      let pinValido = false;

      for (const admin of administradores) {
        if (await admin.compararPassword(pinAdmin)) {
          pinValido = true;
          autorizadoPorId = admin.id;
          break;
        }
      }

      if (!pinValido) {
        return res.status(401).json({ error: 'PIN de Administrador inválido.' });
      }
      requirioPin = true;
    }

    // 3. Crear el egreso
    const egreso = await EgresoCaja.create({
      cajaId: caja.id,
      usuarioId: req.usuario.userId,
      categoriaId,
      monto: parseFloat(monto),
      motivo,
      requirioPin,
      autorizadoPor: autorizadoPorId
    }, { transaction });

    // 4. Actualizar totalEgresos en la Caja
    await caja.update({
      totalEgresos: parseFloat(caja.totalEgresos) + parseFloat(monto)
    }, { transaction });

    await transaction.commit();

    if (req.logAudit) {
      await req.logAudit({
        accion: 'EGRESO_CAJA',
        modulo: 'Caja',
        registroId: egreso.id,
        valorNuevo: egreso.toJSON()
      });
    }

    return res.status(201).json(egreso);
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

// --- CIERRE DE CAJA ---

exports.cierreCaja = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const {
      totalVentasEfectivo,
      totalVentasNequi,
      totalVentasDaviplata,
      totalVentasTarjeta,
      totalVentasTransferencia,
      observaciones
    } = req.body;
    const sedeId = req.usuario.sedeId;

    const caja = await Caja.findOne({
      where: { sedeId, estado: 'abierta' },
      transaction
    });

    if (!caja) {
      return res.status(400).json({ error: 'No hay ninguna caja abierta en esta sede para cerrar.' });
    }

    // Calcular montos reales del sistema
    const efectivoTeorico = parseFloat(caja.montoApertura) + parseFloat(caja.totalVentasEfectivo) - parseFloat(caja.totalEgresos);
    const efectivoReal = parseFloat(totalVentasEfectivo || 0);

    const diferencia = efectivoReal - efectivoTeorico;

    await caja.update({
      estado: 'cerrada',
      usuarioCierreId: req.usuario.userId,
      horaCierre: new Date(),
      totalVentasEfectivo: parseFloat(totalVentasEfectivo || 0),
      totalVentasNequi: parseFloat(totalVentasNequi || 0),
      totalVentasDaviplata: parseFloat(totalVentasDaviplata || 0),
      totalVentasTarjeta: parseFloat(totalVentasTarjeta || 0),
      totalVentasTransferencia: parseFloat(totalVentasTransferencia || 0),
      diferencia,
      observaciones: observaciones || ''
    }, { transaction });

    await transaction.commit();

    if (req.logAudit) {
      await req.logAudit({
        accion: 'UPDATE',
        modulo: 'Caja',
        registroId: caja.id,
        valorNuevo: caja.toJSON()
      });
    }

    return res.json({
      message: 'Caja cerrada exitosamente.',
      caja
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

// --- LEER REPORTES Y EGRESOS ---

exports.getReporteCaja = async (req, res, next) => {
  try {
    const { fecha, sede } = req.query;
    const querySedeId = sede || req.usuario.sedeId;
    const queryFecha = fecha || getLocalDateStr();

    const caja = await Caja.findOne({
      where: {
        sedeId: querySedeId,
        fecha: queryFecha
      },
      order: [['createdAt', 'DESC']],
      include: [
        { model: EgresoCaja, as: 'egresos', include: [{ model: CategoriaEgreso, as: 'categoria', attributes: ['nombre'] }] }
      ]
    });

    if (!caja) {
      return res.status(404).json({ error: 'No se encontró registro de caja para la fecha e institución especificada.' });
    }

    return res.json(caja);
  } catch (error) {
    next(error);
  }
};

exports.getEgresos = async (req, res, next) => {
  try {
    const { sede, fecha } = req.query;
    const querySedeId = sede || req.usuario.sedeId;
    const queryFecha = fecha || getLocalDateStr();

    const egresos = await EgresoCaja.findAll({
      include: [
        {
          model: Caja,
          as: 'caja',
          where: {
            sedeId: querySedeId,
            fecha: queryFecha
          },
          attributes: []
        },
        { model: CategoriaEgreso, as: 'categoria', attributes: ['nombre'] },
        { model: Usuario, as: 'usuario', attributes: ['nombre'] }
      ]
    });

    return res.json(egresos);
  } catch (error) {
    next(error);
  }
};

exports.getCategoriasEgreso = async (req, res, next) => {
  try {
    const categorias = await CategoriaEgreso.findAll({ where: { activa: true } });
    return res.json(categorias);
  } catch (error) {
    next(error);
  }
};

exports.getHistorialCajas = async (req, res, next) => {
  try {
    const { sede, desde, hasta } = req.query;
    const where = {};
    
    const querySedeId = sede || (req.usuario.rol !== 'admin' ? req.usuario.sedeId : null);
    if (querySedeId) {
      where.sedeId = querySedeId;
    }
    
    if (desde && hasta) {
      where.fecha = { [Op.between]: [desde, hasta] };
    }

    const cajas = await Caja.findAll({
      where,
      include: [
        { model: Sede, as: 'sede', attributes: ['nombre'] },
        { model: Usuario, as: 'usuarioApertura', attributes: ['nombre'] },
        { model: Usuario, as: 'usuarioCierre', attributes: ['nombre'] }
      ],
      order: [['fecha', 'DESC'], ['createdAt', 'DESC']]
    });

    return res.json(cajas);
  } catch (error) {
    next(error);
  }
};
