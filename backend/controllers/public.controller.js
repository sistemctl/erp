const { Op } = require('sequelize');
const {
  OrdenReparacion,
  Cliente,
  Sede,
  ConfiguracionSistema
} = require('../models');
const { normalizeLogoUrl } = require('../utils/branding-url');

const ESTADO_LABELS = {
  recibido: 'Recibido',
  diagnostico: 'En diagnóstico',
  en_reparacion: 'En reparación',
  listo: 'Listo para entrega',
  entregado: 'Entregado',
  cancelado: 'Cancelado'
};

function maskImei(imei) {
  const value = String(imei || '').trim();
  if (!value) return null;
  if (value.length <= 4) return '****';
  return `${'*'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

/** Seguimiento público de orden de reparación (sin autenticación). */
exports.getReparacionPublica = async (req, res, next) => {
  try {
    const numeroOrden = String(req.params.numeroOrden || '').trim();
    if (!numeroOrden) {
      return res.status(400).json({ error: 'Número de orden requerido.' });
    }

    const orden = await OrdenReparacion.findOne({
      where: { numeroOrden: { [Op.iLike]: numeroOrden } },
      attributes: [
        'numeroOrden',
        'tipoEquipo',
        'marca',
        'modelo',
        'imei',
        'problemaReportado',
        'diagnostico',
        'estado',
        'fechaEstimadaEntrega',
        'diasGarantia',
        'costoManoObra',
        'costoRepuestos',
        'totalCobrado',
        'createdAt',
        'updatedAt'
      ],
      include: [
        { model: Cliente, as: 'cliente', attributes: ['nombre'] },
        { model: Sede, as: 'sede', attributes: ['nombre'] }
      ]
    });

    if (!orden) {
      return res.status(404).json({ error: 'No encontramos una reparación con ese número.' });
    }

    const config = await ConfiguracionSistema.findOne({
      attributes: ['empresa', 'logoUrl']
    });

    const manoObra = Number(orden.costoManoObra) || 0;
    const repuestos = Number(orden.costoRepuestos) || 0;
    const totalEstimado = manoObra + repuestos;
    const mostrarTotal = ['listo', 'entregado'].includes(orden.estado);

    return res.json({
      empresa: config?.empresa || 'Servicio técnico',
      logoUrl: normalizeLogoUrl(config?.logoUrl) || null,
      numeroOrden: orden.numeroOrden,
      estado: orden.estado,
      estadoLabel: ESTADO_LABELS[orden.estado] || orden.estado,
      equipo: {
        tipo: orden.tipoEquipo,
        marca: orden.marca,
        modelo: orden.modelo,
        imeiMasked: maskImei(orden.imei)
      },
      clienteNombre: orden.cliente?.nombre || null,
      sedeNombre: orden.sede?.nombre || null,
      problemaReportado: orden.problemaReportado,
      diagnostico: orden.diagnostico || null,
      fechaIngreso: orden.createdAt,
      fechaEstimadaEntrega: orden.fechaEstimadaEntrega,
      actualizadoEn: orden.updatedAt,
      diasGarantia: orden.estado === 'entregado' ? (orden.diasGarantia || 0) : null,
      totalEstimado: mostrarTotal ? totalEstimado : null,
      totalCobrado: orden.estado === 'entregado' ? Number(orden.totalCobrado) || totalEstimado : null
    });
  } catch (error) {
    next(error);
  }
};
