const { Notificacion, Cliente, OrdenReparacion } = require('../models');

exports.getNotificaciones = async (req, res, next) => {
  try {
    const notificaciones = await Notificacion.findAll({
      include: [
        { model: Cliente, as: 'cliente', attributes: ['nombre', 'telefono'] },
        { model: OrdenReparacion, as: 'orden', attributes: ['numeroOrden', 'tipoEquipo', 'marca', 'modelo'] }
      ],
      order: [['createdAt', 'DESC']]
    });
    return res.json(notificaciones);
  } catch (error) {
    next(error);
  }
};
