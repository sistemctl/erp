import models = require('../models');
import type { Handler } from '../types/controller';
import { requireUser } from '../utils/request-user';
import type { Attributes, IncludeOptions, WhereAttributeHash } from 'sequelize';
import type AuditModel = require('../models/AuditLog');
type Body = Record<string, never>;
const { AuditLog, Usuario, Sede } = models;
import { Op } from 'sequelize';
import { filtroFechaBogota } from '../utils/rango-bogota';
import { contiene } from '../utils/like';

export const getAuditLogs: Handler<Body> = async (req, res, next) => {
  try {
    const { usuario, accion, modulo, desde, hasta } = req.query;
    const where: WhereAttributeHash<Attributes<AuditModel>> = {};

    if (accion) {
      where.accion = accion as Attributes<AuditModel>['accion'];
    }

    if (modulo) {
      where.modulo = modulo;
    }

    // Filtro por fecha (desde - hasta)
    const rangoFechas = filtroFechaBogota(desde, hasta);
    if (rangoFechas) where.createdAt = rangoFechas;

    // Búsqueda de usuario (por ID o nombre del usuario asociado)
    const userInclude: IncludeOptions = {
      model: Usuario,
      as: 'usuario',
      attributes: ['id', 'nombre', 'email']
    };

    if (usuario) {
      // Si se pasa usuario como parámetro de búsqueda, intentamos buscar por ID o por nombre usando iLike
      if (usuario.match(/^[0-9a-fA-F-]{36}$/)) {
        where.usuarioId = usuario;
      } else {
        userInclude.where = {
          [Op.or]: [
            { nombre: { [Op.iLike]: contiene(usuario) } },
            { email: { [Op.iLike]: contiene(usuario) } }
          ]
        };
      }
    }

    const logs = await AuditLog.findAll({
      where,
      include: [
        userInclude,
        {
          model: Sede,
          as: 'sede',
          attributes: ['id', 'nombre']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: 200 // Limitar a los 200 más recientes para rendimiento
    });

    return res.json(logs);
  } catch (error) {
    next(error);
  }
};
