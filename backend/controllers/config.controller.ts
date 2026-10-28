import type { Handler } from '../types/controller';
import { requireUser } from '../utils/request-user';
import { transactionFinished } from '../utils/transaction-state';
import { Op, Transaction as SequelizeTransaction, type Attributes, type CreationAttributes, type Transaction, type WhereOptions, type QueryInterface, type TableName } from 'sequelize';
import type { Request } from 'express';
import type ConfiguracionModel = require('../models/ConfiguracionSistema');
import type SedeModel = require('../models/Sede');
import type UsuarioModel = require('../models/Usuario');
import type { HttpError } from '../utils/http-error';
import { sanitizeTemaInterfaz } from '../utils/tema-interfaz';
import { encryptBackup, decryptBackup, orderedBackupModels, validateBackup, getBackupModels, type BackupData } from '../utils/backup';
import { initializeDocumentSequences } from '../utils/document-number';
type Body = CreationAttributes<SedeModel> & CreationAttributes<UsuarioModel> & CreationAttributes<ConfiguracionModel> & { emailDestino?: string; backup?: unknown };
type ConfigJson = Attributes<ConfiguracionModel>;
type ConfigMeta = ConfigJson & { servidor: { puertoActivo: number; puertoConfigurado: number; urlActiva: string; urlLocal: string; urlPublica: string | null; urlConfigurada: string; requiereReinicio: boolean; tunelActivo: boolean }; facturasTallerActualizadas?: number; requiereReinicio?: boolean; mensajeReinicio?: string };
// Interfaz interna de Sequelize 6 utilizada por el respaldo existente para citar tablas.
function quoteBackupTable(queryInterface: QueryInterface, table: TableName) {
  const generator = (queryInterface as QueryInterface & { queryGenerator: { quoteTable(table: TableName): string } }).queryGenerator;
  return generator.quoteTable(table);
}

import models = require('../models');
const {
  sequelize,
  Sequelize,
  Sede,
  Usuario,
  ConfiguracionSistema,
  StockSede,
  MovimientoInventario,
  NumeroSerie,
  Cliente,
  Venta,
  ItemVenta,
  PagoVenta,
  Cotizacion,
  ItemCotizacion,
  OrdenReparacion,
  FotoReparacion,
  RepuestoOrden,
  RentabilidadReparacion,
  OrdenInstalacion,
  MaterialInstalacion,
  TradeIn,
  Caja,
  EgresoCaja,
  Factura,
  CuentaPorCobrar,
  Abono,
  Empleado,
  Nomina,
  OrdenCompra,
  ItemOrdenCompra,
  PagoCompra,
  AuditLog,
  Notificacion
} = models;
import {
  clampPort,
  buildAppUrl,
  updateEnvPort,
  DEFAULT_PORT,
  MIN_PORT,
  MAX_PORT
} from '../utils/server-config';
import { normalizeLogoUrl } from '../utils/branding-url';
import { getPublicOrigin } from '../utils/public-url';
import emailService = require('../services/email.service');

async function forceDeleteSede(sede: SedeModel, transaction: Transaction) {
  const sedeId = sede.id;

  await StockSede.destroy({ where: { sedeId }, transaction });
  await MovimientoInventario.destroy({ where: { sedeId }, transaction });
  await NumeroSerie.destroy({ where: { sedeId }, transaction });
  await AuditLog.update({ sedeId: null }, { where: { sedeId }, transaction });
  await Usuario.update({ sedeId: null }, { where: { sedeId }, transaction });

  const otraSede = await Sede.findOne({
    where: {
      id: { [Op.ne]: sedeId },
      activa: true
    },
    order: [['nombre', 'ASC']],
    transaction
  }) || await Sede.findOne({
    where: { id: { [Op.ne]: sedeId } },
    order: [['nombre', 'ASC']],
    transaction
  });

  const clientes = await Cliente.count({ where: { sedeId }, transaction });
  if (clientes > 0) {
    if (!otraSede) {
      const err: HttpError = new Error('No se puede eliminar la sede: hay clientes asociados y no existe otra sede para reasignarlos.');
      err.status = 400;
      throw err;
    }
    await Cliente.update({ sedeId: otraSede.id }, { where: { sedeId }, transaction });
  }

  const empleados = await Empleado.findAll({ where: { sedeId }, attributes: ['id'], transaction });
  const empleadoIds = empleados.map((e) => e.id);
  if (empleadoIds.length) {
    await Nomina.destroy({ where: { empleadoId: empleadoIds }, transaction });
    await Empleado.destroy({ where: { sedeId }, transaction });
  }

  const ordenesCompra = await OrdenCompra.findAll({ where: { sedeId }, attributes: ['id'], transaction });
  const ordenCompraIds = ordenesCompra.map((o) => o.id);
  if (ordenCompraIds.length) {
    const pagosCompra = await PagoCompra.findAll({
      where: { ordenCompraId: ordenCompraIds },
      attributes: ['id'],
      transaction
    });
    const pagoCompraIds = pagosCompra.map((p) => p.id);
    if (pagoCompraIds.length) {
      await EgresoCaja.destroy({ where: { pagoCompraId: pagoCompraIds }, transaction });
      await PagoCompra.destroy({ where: { id: pagoCompraIds }, transaction });
    }
    await ItemOrdenCompra.destroy({ where: { ordenCompraId: ordenCompraIds }, transaction });
    await OrdenCompra.destroy({ where: { sedeId }, transaction });
  }

  const cajas = await Caja.findAll({ where: { sedeId }, attributes: ['id'], transaction });
  const cajaIds = cajas.map((c) => c.id);
  if (cajaIds.length) {
    await EgresoCaja.destroy({ where: { cajaId: cajaIds }, transaction });
    await Caja.destroy({ where: { sedeId }, transaction });
  }

  const cotizaciones = await Cotizacion.findAll({ where: { sedeId }, attributes: ['id'], transaction });
  const cotizacionIds = cotizaciones.map((c) => c.id);
  if (cotizacionIds.length) {
    await ItemCotizacion.destroy({ where: { cotizacionId: cotizacionIds }, transaction });
    await Cotizacion.destroy({ where: { sedeId }, transaction });
  }

  const facturas = await Factura.findAll({ where: { sedeId }, attributes: ['id'], transaction });
  const facturaIds = facturas.map((f) => f.id);
  if (facturaIds.length) {
    await Notificacion.destroy({ where: { facturaId: facturaIds }, transaction });
    const cuentas = await CuentaPorCobrar.findAll({
      where: { facturaId: facturaIds },
      attributes: ['id'],
      transaction
    });
    const cuentaIds = cuentas.map((c) => c.id);
    if (cuentaIds.length) {
      await Abono.destroy({ where: { cuentaPorCobrarId: cuentaIds }, transaction });
      await CuentaPorCobrar.destroy({ where: { id: cuentaIds }, transaction });
    }
    await Factura.destroy({ where: { sedeId }, transaction });
  }

  await TradeIn.destroy({ where: { sedeId }, transaction });

  const ventas = await Venta.findAll({ where: { sedeId }, attributes: ['id'], transaction });
  const ventaIds = ventas.map((v) => v.id);
  if (ventaIds.length) {
    await ItemVenta.destroy({ where: { ventaId: ventaIds }, transaction });
    await PagoVenta.destroy({ where: { ventaId: ventaIds }, transaction });
    await Venta.destroy({ where: { sedeId }, transaction });
  }

  const ordenes = await OrdenReparacion.findAll({ where: { sedeId }, attributes: ['id'], transaction });
  const ordenIds = ordenes.map((o) => o.id);
  if (ordenIds.length) {
    await Notificacion.destroy({ where: { ordenReparacionId: ordenIds }, transaction });
    await FotoReparacion.destroy({ where: { ordenId: ordenIds }, transaction });
    await RepuestoOrden.destroy({ where: { ordenId: ordenIds }, transaction });
    await RentabilidadReparacion.destroy({ where: { ordenId: ordenIds }, transaction });
    await OrdenReparacion.destroy({ where: { sedeId }, transaction });
  }

  const instalaciones = await OrdenInstalacion.findAll({ where: { sedeId }, attributes: ['id'], transaction });
  const instIds = instalaciones.map((o) => o.id);
  if (instIds.length) {
    await MaterialInstalacion.destroy({ where: { ordenId: instIds }, transaction });
    await OrdenInstalacion.destroy({ where: { sedeId }, transaction });
  }

  await sede.destroy({ transaction });
}

function maskSecretFields<T extends Pick<ConfigJson, 'smtpPass' | 'twilioAuthToken'>>(data: T) {
  if (data.smtpPass) data.smtpPass = '••••••••';
  if (data.twilioAuthToken) data.twilioAuthToken = '••••••••';
  return data;
}

const OPS_CONFIG_KEYS = [
  'id', 'empresa', 'nit', 'direccion', 'telefono', 'logoUrl',
  'descuentoMaximoPct', 'egresoMaximoSinPin', 'ivaDefecto', 'cobrarIvaPos', 'cobrarIvaTaller', 'mediosPago',
  'cajaCompartidaSede', 'temaInterfaz', 'notificacionesActivas'
];

/** Respuesta mínima para roles operativos (sin SMTP/Twilio/servidor). */
function toOpsConfig(configJson: ConfiguracionModel | ConfigJson) {
  const data = 'toJSON' in configJson ? configJson.toJSON() : { ...configJson };
  const out: Record<string, unknown> = {};
  for (const key of OPS_CONFIG_KEYS) {
    if (data[key as keyof ConfigJson] !== undefined) out[key] = data[key as keyof ConfigJson];
  }
  if (out.logoUrl) out.logoUrl = normalizeLogoUrl(out.logoUrl);
  return out;
}


function attachServidorMeta(configJson: ConfiguracionModel | ConfigJson, req: Request): ConfigMeta {
  const data = 'toJSON' in configJson ? configJson.toJSON() : { ...configJson };
  if (data.logoUrl) data.logoUrl = normalizeLogoUrl(data.logoUrl);
  const puertoActivo = parseInt(String(req.app.get('puertoActivo')), 10) || clampPort(process.env.PORT) || DEFAULT_PORT;
  const puertoConfigurado = clampPort(data.puertoServidor) || DEFAULT_PORT;
  const urlLocal = buildAppUrl(puertoActivo);
  const urlPublica = getPublicOrigin(req);
  return {
    ...data,
    puertoServidor: puertoConfigurado,
    servidor: {
      puertoActivo,
      puertoConfigurado,
      urlActiva: urlPublica || urlLocal,
      urlLocal,
      urlPublica,
      urlConfigurada: buildAppUrl(puertoConfigurado),
      requiereReinicio: puertoActivo !== puertoConfigurado,
      tunelActivo: Boolean(urlPublica)
    }
  };
}

// --- SEDES ---

export const getSedes: Handler<Body> = async (req, res, next) => {
  try {
    const sedes = await Sede.findAll({ order: [['nombre', 'ASC']] });
    return res.json(sedes);
  } catch (error) {
    next(error);
  }
};

export const createSede: Handler<Body> = async (req, res, next) => {
  try {
    const sede = await Sede.create(req.body);

    if (req.logAudit) {
      await req.logAudit({
        accion: 'CREATE',
        modulo: 'Sedes',
        registroId: sede.id,
        valorNuevo: sede.toJSON()
      });
    }

    return res.status(201).json(sede);
  } catch (error) {
    next(error);
  }
};

export const updateSede: Handler<Body> = async (req, res, next) => {
  try {
    const { id } = req.params;
    const sede = await Sede.findByPk(id);

    if (!sede) {
      return res.status(404).json({ error: 'Sede no encontrada.' });
    }

    const valorAnterior = sede.toJSON();
    await sede.update(req.body);

    if (req.logAudit) {
      await req.logAudit({
        accion: 'UPDATE',
        modulo: 'Sedes',
        registroId: sede.id,
        valorAnterior,
        valorNuevo: sede.toJSON()
      });
    }

    return res.json(sede);
  } catch (error) {
    next(error);
  }
};

export const deleteSede: Handler<Body> = async (req, res, next) => {
  try {
    const { id } = req.params;
    const force = ['1', 'true', 'yes'].includes(String(req.query.force || '').toLowerCase());
    const sede = await Sede.findByPk(id);

    if (!sede) {
      return res.status(404).json({ error: 'Sede no encontrada.' });
    }

    const valorAnterior = sede.toJSON();

    if (force) {
      const transaction = await sequelize.transaction();
      req.auditTransaction = transaction;
      try {
        await forceDeleteSede(sede, transaction);
        await transaction.commit();
      } catch (error) {
        await transaction.rollback();
        throw error;
      }

      if (req.logAudit) {
        await req.logAudit({
          accion: 'DELETE',
          modulo: 'Sedes',
          registroId: id,
          valorAnterior
        });
      }

      return res.json({
        message: 'Sede eliminada definitivamente.',
        eliminada: true,
        desactivada: false
      });
    }

    // Sin force: solo desactivar (conserva historial)
    if (!sede.activa) {
      return res.json({
        message: 'La sede ya está desactivada.',
        eliminada: false,
        desactivada: true
      });
    }

    await sede.update({ activa: false });

    if (req.logAudit) {
      await req.logAudit({
        accion: 'UPDATE',
        modulo: 'Sedes',
        registroId: id,
        valorAnterior,
        valorNuevo: sede.toJSON()
      });
    }

    return res.json({
      message: 'Sede desactivada. Usa Eliminar si quieres borrarla definitivamente.',
      eliminada: false,
      desactivada: true
    });
  } catch (error) {
    next(error);
  }
};

// --- USUARIOS ---

export const getUsuarios: Handler<Body> = async (req, res, next) => {
  try {
    const usuarios = await Usuario.findAll({
      attributes: ['id', 'nombre', 'email', 'rol', 'sedeId', 'activo', 'createdAt'],
      include: [{ model: Sede, as: 'sede', attributes: ['nombre'] }],
      order: [['nombre', 'ASC']]
    });
    return res.json(usuarios);
  } catch (error) {
    next(error);
  }
};

export const getUsuariosOperativos: Handler<Body> = async (req, res, next) => {
  try {
    const { rol } = req.query;
    const where: WhereOptions<Attributes<UsuarioModel>> = { activo: true };
    if (rol) where.rol = rol as UsuarioModel['rol'];

    const usuarios = await Usuario.findAll({
      where,
      attributes: ['id', 'nombre', 'rol', 'sedeId', 'email'],
      order: [['nombre', 'ASC']]
    });
    return res.json(usuarios);
  } catch (error) {
    next(error);
  }
};

export const createUsuario: Handler<Body> = async (req, res, next) => {
  try {
    const { nombre, email, password, rol, sedeId, activo } = req.body;
    
    // Validar duplicado
    const existe = await Usuario.findOne({ where: { email } });
    if (existe) {
      return res.status(400).json({ error: 'El correo electrónico ya está registrado.' });
    }

    const usuario = await Usuario.create({
      nombre,
      email,
      password,
      rol,
      sedeId: sedeId || null,
      activo: activo !== undefined ? activo : true
    });

    if (req.logAudit) {
      await req.logAudit({
        accion: 'CREATE',
        modulo: 'Usuarios',
        registroId: usuario.id,
        valorNuevo: { nombre, email, rol, sedeId }
      });
    }

    return res.status(201).json({
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      sedeId: usuario.sedeId,
      activo: usuario.activo
    });
  } catch (error) {
    next(error);
  }
};

export const updateUsuario: Handler<Body> = async (req, res, next) => {
  try {
    const { id } = req.params;
    const usuario = await Usuario.findByPk(id);

    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    const valorAnterior = {
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      sedeId: usuario.sedeId,
      activo: usuario.activo
    };

    const { nombre, email, password, rol, sedeId, activo } = req.body;

    const updateData: Partial<Attributes<UsuarioModel>> = { nombre, email, rol, sedeId: sedeId || null, activo };
    if (password && password.trim() !== '') {
      updateData.password = password;
    }

    await usuario.update(updateData);

    if (req.logAudit) {
      await req.logAudit({
        accion: 'UPDATE',
        modulo: 'Usuarios',
        registroId: usuario.id,
        valorAnterior,
        valorNuevo: { nombre, email, rol, sedeId, activo }
      });
    }

    return res.json({
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      sedeId: usuario.sedeId,
      activo: usuario.activo
    });
  } catch (error) {
    next(error);
  }
};

export const deleteUsuario: Handler<Body> = async (req, res, next) => {
  try {
    const { id } = req.params;
    const usuario = await Usuario.findByPk(id);

    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    const valorAnterior = {
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol
    };

    await Usuario.destroy({ where: { id } });

    if (req.logAudit) {
      await req.logAudit({
        accion: 'DELETE',
        modulo: 'Usuarios',
        registroId: id,
        valorAnterior
      });
    }

    return res.json({ message: 'Usuario eliminado exitosamente.' });
  } catch (error) {
    next(error);
  }
};

/** Datos públicos de marca y apariencia para pantalla de login (sin autenticación). */
export const getBranding: Handler<Body> = async (req, res, next) => {
  try {
    const config = await ConfiguracionSistema.findOne({
      attributes: ['empresa', 'logoUrl', 'temaInterfaz']
    });
    return res.json({
      empresa: config?.empresa || 'ERP',
      logoUrl: normalizeLogoUrl(config?.logoUrl) || null,
      temaInterfaz: config?.temaInterfaz || null
    });
  } catch (error) {
    next(error);
  }
};

export const getSistemaConfig: Handler<Body> = async (req, res, next) => {
  try {
    let config = await ConfiguracionSistema.findOne();
    if (!config) {
      // Crear uno por defecto
      config = await ConfiguracionSistema.create({
        empresa: 'TechStore Colombia',
        nit: '900.123.456-7',
        direccion: 'Calle 100 #15-30, Bogotá',
        telefono: '+57 300 123 4567',
        descuentoMaximoPct: 15.00,
        egresoMaximoSinPin: 50000.00,
        notificacionesActivas: false,
        ivaDefecto: 19.00,
        cobrarIvaPos: true,
        cobrarIvaTaller: false,
        cajaCompartidaSede: true,
        nominaFrecuenciaDefault: 'quincenal',
        nominaDiaCorteQuincena: 15,
        nominaDiaPago1: 15,
        nominaDiaPago2: 30,
        puertoServidor: DEFAULT_PORT,
      });
    } else if (config.logoUrl) {
      const normalized = normalizeLogoUrl(config.logoUrl);
      if (normalized && normalized !== config.logoUrl) {
        await config.update({ logoUrl: normalized });
      }
    }

    const rol = requireUser(req).rol;
    const isAdmin = ['admin', 'superadmin'].includes(rol);
    if (!isAdmin) {
      return res.json(toOpsConfig(config));
    }
    return res.json(maskSecretFields(attachServidorMeta(config, req)));
  } catch (error) {
    next(error);
  }
};

export const updateSistemaConfig: Handler<Body> = async (req, res, next) => {
  try {

    let config = await ConfiguracionSistema.findOne();
    let valorAnterior = {};
    const payload = { ...req.body };
    let requiereReinicio = false;
    let puertoNuevo: number | null = null;

    if (payload.temaInterfaz !== undefined) {
      try {
        payload.temaInterfaz = sanitizeTemaInterfaz(payload.temaInterfaz);
      } catch (validationError) {
        return res.status((validationError && typeof validationError === 'object' && 'status' in validationError && typeof validationError.status === 'number' ? validationError.status : 400)).json({
          error: validationError instanceof Error ? validationError.message : 'temaInterfaz inválido.'
        });
      }
    }

    if (payload.logoUrl !== undefined) {
      payload.logoUrl = normalizeLogoUrl(payload.logoUrl);
    }

    if (!payload.smtpPass || payload.smtpPass === '••••••••') {
      delete payload.smtpPass;
    }
    if (!payload.twilioAuthToken || payload.twilioAuthToken === '••••••••') {
      delete payload.twilioAuthToken;
    }

    if (payload.puertoServidor !== undefined && payload.puertoServidor !== null && String(payload.puertoServidor) !== '') {
      const puerto = clampPort(payload.puertoServidor);
      if (!puerto) {
        return res.status(400).json({
          error: `Puerto inválido. Use un número entre ${MIN_PORT} y ${MAX_PORT}.`
        });
      }
      payload.puertoServidor = puerto;
      const puertoActivo = parseInt(String(req.app.get('puertoActivo')), 10) || clampPort(process.env.PORT) || DEFAULT_PORT;
      if (puerto !== puertoActivo) {
        updateEnvPort(puerto);
        requiereReinicio = true;
        puertoNuevo = puerto;
      }
    }

    if (!config) {
      config = await ConfiguracionSistema.create(payload);
    } else {
      valorAnterior = config.toJSON();
      await config.update(payload);
    }

    // Mantener las facturas de Taller alineadas con el interruptor, sin tocar
    // ventas ni instalaciones. El total cobrado se conserva en ambos casos.
    const cobrarIvaTaller = config.cobrarIvaTaller === true;
    const tasaIvaTaller = Math.max(0, parseFloat(String(config.ivaDefecto ?? 19))) / 100;
    const divisorIvaTaller = 1 + tasaIvaTaller;
    const [facturasTallerActualizadas] = await Factura.update({
      subtotal: cobrarIvaTaller && tasaIvaTaller > 0
        ? sequelize.literal(`ROUND("total" / ${divisorIvaTaller}, 2)`)
        : sequelize.col('total'),
      iva: cobrarIvaTaller && tasaIvaTaller > 0
        ? sequelize.literal(`ROUND("total" - ("total" / ${divisorIvaTaller}), 2)`)
        : 0
    }, {
      where: {
        ordenReparacionId: { [Op.ne]: null }
      }
    });

    if (req.logAudit) {
      await req.logAudit({
        accion: 'UPDATE',
        modulo: 'ConfiguracionSistema',
        registroId: config.id,
        valorAnterior,
        valorNuevo: config.toJSON()
      });
    }

    const response = attachServidorMeta(config, req);
    response.facturasTallerActualizadas = facturasTallerActualizadas;
    if (requiereReinicio) {
      response.requiereReinicio = true;
      response.mensajeReinicio = `Reinicie el servidor para aplicar el puerto ${puertoNuevo}. Luego abra ${buildAppUrl(puertoNuevo || DEFAULT_PORT)}`;
    }

    return res.json(maskSecretFields(response));
  } catch (error) {
    next(error);
  }
};

export const probarSmtp: Handler<Body> = async (req, res, next) => {
  try {
    const { emailDestino } = req.body;
    if (!emailDestino || !String(emailDestino).includes('@')) {
      return res.status(400).json({ error: 'Indique un correo destino válido.' });
    }

    const config = await ConfiguracionSistema.findOne();
    if (!config) {
      return res.status(400).json({ error: 'Configure el sistema antes de probar SMTP.' });
    }

    const merged = { ...config.toJSON(), ...req.body };
    delete merged.emailDestino;
    if (!merged.smtpPass || merged.smtpPass === '••••••••') {
      merged.smtpPass = config.smtpPass;
    }

    await emailService.enviarCorreoPrueba(merged, emailDestino.trim());
    return res.json({ message: `Correo de prueba enviado a ${emailDestino.trim()}.` });
  } catch (error) {
    next(error);
  }
};

export const exportarBackup: Handler<Body> = async (req, res, next) => {
  try {
    const backupModels = getBackupModels(models);

    const ordered = orderedBackupModels(models);
    const backup = await sequelize.transaction({ isolationLevel: SequelizeTransaction.ISOLATION_LEVELS.REPEATABLE_READ }, async (transaction) => {
      const data: BackupData = {};
      for (const name of ordered) data[name] = await backupModels[name].findAll({ raw: true, transaction });
      return encryptBackup(data, req.body?.password);
    });
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=backup_erp_' + new Date().toISOString().split('T')[0] + '.json');
    return res.json(backup);
  } catch (error) { next(error); }
};

export const importarBackup: Handler<Body> = async (req, res, next) => {
  try {
    const backupModels = getBackupModels(models);


    const ordered = orderedBackupModels(models);
    const data = await validateBackup(decryptBackup(req.body.backup, req.body.password), models, ordered);
    await sequelize.transaction(async (transaction) => {
      const tables = ordered.map((name) => quoteBackupTable(sequelize.getQueryInterface(), backupModels[name].getTableName())).join(', ');
      await sequelize.query('LOCK TABLE ' + tables + ' IN ACCESS EXCLUSIVE MODE', { transaction });
      const versions = new Map((await Usuario.findAll({ attributes: ['id', 'sessionVersion'], raw: true, transaction }))
        .map((row) => [row.id, Number(row.sessionVersion) || 0]));
      await sequelize.query('TRUNCATE TABLE ' + tables + ' RESTART IDENTITY', { transaction });
      for (const name of ordered) {
        const rows = data[name].map((row) => name === 'Usuario'
          ? { ...row, sessionVersion: Math.max(Number(row.sessionVersion) || 0, versions.get(row.id) || 0) + 1 }
          : row);
        if (rows.length) await backupModels[name].bulkCreate(rows, { validate: true, hooks: false, transaction });
      }
      await initializeDocumentSequences(sequelize, transaction);
    });
    if (req.logAudit) await req.logAudit({ accion: 'UPDATE', modulo: 'Sistema', registroId: 'backup_restore',
      valorNuevo: { info: 'Respaldo completo restaurado.' } });
    return res.json({ message: 'Base de datos restaurada. Inicie sesión nuevamente.' });
  } catch (error) { next(error); }
};
