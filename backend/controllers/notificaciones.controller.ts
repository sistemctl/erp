import models = require('../models');
import type { Handler } from '../types/controller';
import { requireUser } from '../utils/request-user';
type Body = Record<string, never>;
const { Notificacion, Cliente, OrdenReparacion, Factura } = models;

export const getNotificaciones: Handler<Body> = async (req, res, next) => {
  try {
    const notificaciones = await Notificacion.findAll({
      include: [
        { model: Cliente, as: 'cliente', attributes: ['nombre', 'telefono', 'email'] },
        { model: OrdenReparacion, as: 'orden', attributes: ['numeroOrden', 'tipoEquipo', 'marca', 'modelo'] },
        { model: Factura, as: 'factura', attributes: ['numeroFactura'] }
      ],
      order: [['createdAt', 'DESC']]
    });
    return res.json(notificaciones);
  } catch (error) {
    next(error);
  }
};
