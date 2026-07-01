const { Sede, Usuario, ConfiguracionSistema } = require('../models');
const {
  clampPort,
  buildAppUrl,
  updateEnvPort,
  DEFAULT_PORT,
  MIN_PORT,
  MAX_PORT
} = require('../utils/server-config');
const { normalizeLogoUrl } = require('../utils/branding-url');
const { getPublicOrigin } = require('../utils/public-url');

function attachServidorMeta(configJson, req) {
  const data = configJson?.toJSON ? configJson.toJSON() : { ...configJson };
  if (data.logoUrl) data.logoUrl = normalizeLogoUrl(data.logoUrl);
  const puertoActivo = parseInt(req.app.get('puertoActivo'), 10) || clampPort(process.env.PORT) || DEFAULT_PORT;
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

exports.getSedes = async (req, res, next) => {
  try {
    const sedes = await Sede.findAll({ order: [['nombre', 'ASC']] });
    return res.json(sedes);
  } catch (error) {
    next(error);
  }
};

exports.createSede = async (req, res, next) => {
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

exports.updateSede = async (req, res, next) => {
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

exports.deleteSede = async (req, res, next) => {
  try {
    const { id } = req.params;
    const sede = await Sede.findByPk(id);

    if (!sede) {
      return res.status(404).json({ error: 'Sede no encontrada.' });
    }

    const valorAnterior = sede.toJSON();
    await Sede.destroy({ where: { id } });

    if (req.logAudit) {
      await req.logAudit({
        accion: 'DELETE',
        modulo: 'Sedes',
        registroId: id,
        valorAnterior
      });
    }

    return res.json({ message: 'Sede eliminada exitosamente.' });
  } catch (error) {
    next(error);
  }
};

// --- USUARIOS ---

exports.getUsuarios = async (req, res, next) => {
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

exports.getUsuariosOperativos = async (req, res, next) => {
  try {
    const { rol } = req.query;
    const where = { activo: true };
    if (rol) where.rol = rol;

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

exports.createUsuario = async (req, res, next) => {
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

exports.updateUsuario = async (req, res, next) => {
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

    const updateData = { nombre, email, rol, sedeId: sedeId || null, activo };
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

exports.deleteUsuario = async (req, res, next) => {
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
exports.getBranding = async (req, res, next) => {
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

exports.getSistemaConfig = async (req, res, next) => {
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
    return res.json(attachServidorMeta(config, req));
  } catch (error) {
    next(error);
  }
};

exports.updateSistemaConfig = async (req, res, next) => {
  try {
    let config = await ConfiguracionSistema.findOne();
    let valorAnterior = {};
    const payload = { ...req.body };
    let requiereReinicio = false;
    let puertoNuevo = null;

    if (payload.logoUrl !== undefined) {
      payload.logoUrl = normalizeLogoUrl(payload.logoUrl);
    }

    if (payload.puertoServidor !== undefined && payload.puertoServidor !== null && payload.puertoServidor !== '') {
      const puerto = clampPort(payload.puertoServidor);
      if (!puerto) {
        return res.status(400).json({
          error: `Puerto inválido. Use un número entre ${MIN_PORT} y ${MAX_PORT}.`
        });
      }
      payload.puertoServidor = puerto;
      const puertoActivo = parseInt(req.app.get('puertoActivo'), 10) || clampPort(process.env.PORT) || DEFAULT_PORT;
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
    if (requiereReinicio) {
      response.requiereReinicio = true;
      response.mensajeReinicio = `Reinicie el servidor para aplicar el puerto ${puertoNuevo}. Luego abra ${buildAppUrl(puertoNuevo)}`;
    }

    return res.json(response);
  } catch (error) {
    next(error);
  }
};

exports.exportarBackup = async (req, res, next) => {
  try {
    const models = require('../models');
    const backupData = {};
    
    const orderedModels = [
      'Sede', 'Usuario', 'Empleado', 'Categoria', 'Producto', 'StockSede', 
      'Cliente', 'NumeroSerie', 'Venta', 'ItemVenta', 'PagoVenta', 'Factura', 
      'CuentaPorCobrar', 'Abono', 'Cotizacion', 'ItemCotizacion', 'OrdenReparacion', 
      'FotoReparacion', 'RepuestoOrden', 'RentabilidadReparacion', 'TradeIn', 
      'CategoriaEgreso', 'Caja', 'EgresoCaja', 'Nomina', 'Proveedor', 
      'OrdenCompra', 'ItemOrdenCompra', 'PagoCompra', 'MovimientoInventario', 'Notificacion', 
      'AuditLog', 'ConfiguracionSistema'
    ];

    for (const modelName of orderedModels) {
      if (models[modelName]) {
        backupData[modelName] = await models[modelName].findAll({ raw: true });
      }
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=backup_erp_${new Date().toISOString().split('T')[0]}.json`);
    return res.json(backupData);
  } catch (error) {
    next(error);
  }
};

exports.importarBackup = async (req, res, next) => {
  const { sequelize } = require('../models');
  const transaction = await sequelize.transaction();
  try {
    const backupData = req.body;
    
    const orderedModels = [
      'Sede', 'Usuario', 'Empleado', 'Categoria', 'Producto', 'StockSede', 
      'Cliente', 'NumeroSerie', 'Venta', 'ItemVenta', 'PagoVenta', 'Factura', 
      'CuentaPorCobrar', 'Abono', 'Cotizacion', 'ItemCotizacion', 'OrdenReparacion', 
      'FotoReparacion', 'RepuestoOrden', 'RentabilidadReparacion', 'TradeIn', 
      'CategoriaEgreso', 'Caja', 'EgresoCaja', 'Nomina', 'Proveedor', 
      'OrdenCompra', 'ItemOrdenCompra', 'PagoCompra', 'MovimientoInventario', 'Notificacion', 
      'AuditLog', 'ConfiguracionSistema'
    ];

    // Eliminar datos en orden inverso para evitar restricciones
    for (let i = orderedModels.length - 1; i >= 0; i--) {
      const modelName = orderedModels[i];
      if (sequelize.models[modelName]) {
        await sequelize.models[modelName].destroy({ where: {}, force: true, transaction });
      }
    }

    // Insertar datos en orden directo
    for (const modelName of orderedModels) {
      if (sequelize.models[modelName] && backupData[modelName] && backupData[modelName].length > 0) {
        await sequelize.models[modelName].bulkCreate(backupData[modelName], { transaction });
      }
    }

    await transaction.commit();

    if (req.logAudit) {
      await req.logAudit({
        accion: 'UPDATE',
        modulo: 'Sistema',
        registroId: 'backup_restore',
        valorNuevo: { info: 'Restauración completa de base de datos realizada.' }
      });
    }

    return res.json({ message: 'Base de datos restaurada correctamente.' });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

