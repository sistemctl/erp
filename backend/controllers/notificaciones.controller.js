const { Notificacion, Cliente, OrdenReparacion, Factura } = require('../models');

exports.getNotificaciones = async (req, res, next) => {
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
