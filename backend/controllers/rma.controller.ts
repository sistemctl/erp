import type { Handler } from '../types/controller';
import { requireUser } from '../utils/request-user';
import { transactionFinished } from '../utils/transaction-state';
import type { Attributes, CreationAttributes, WhereAttributeHash, WhereOptions } from 'sequelize';
import type ReclamoModel = require('../models/ReclamoGarantia');
import type VentaModel = require('../models/Venta');
type Body = Partial<CreationAttributes<ReclamoModel>>;
import { nextDocumentNumber } from '../utils/document-number';
import { Op } from 'sequelize';
import models = require('../models');
const {
  ReclamoGarantia,
  NumeroSerie,
  Producto,
  Cliente,
  Sede,
  Venta,
  ItemVenta,
  OrdenReparacion,
  Usuario,
  sequelize
} = models;
import { resolveQuerySede, resolveActionSede } from '../utils/sede';

const DEFAULT_DIAS_GARANTIA = 90;

export const lookupSerie: Handler<Body> = async (req, res, next) => {
  try {
    const serie = String(req.query.serie || '').trim();
    if (!serie) {
      return res.status(400).json({ error: 'Indique el número de serie / IMEI.' });
    }

    const registro = await NumeroSerie.findOne({
      where: { serie: { [Op.iLike]: serie } },
      include: [
        { model: Producto, as: 'producto', attributes: ['id', 'nombre', 'codigoBarras'] },
        { model: Cliente, as: 'cliente', attributes: ['id', 'nombre', 'documento', 'telefono'] },
        { model: Sede, as: 'sede', attributes: ['id', 'nombre'] }
      ]
    });

    if (!registro) {
      return res.status(404).json({ error: 'Serie/IMEI no encontrada en el sistema.' });
    }

    let venta: VentaModel | null = null;
    if (registro.estado === 'vendido' && registro.fechaVenta) {
      const items = await ItemVenta.findAll({
        where: { productoId: registro.productoId },
        include: [{
          model: Venta,
          as: 'venta',
          where: {
            clienteId: registro.clienteId || { [Op.ne]: null },
            estado: { [Op.ne]: 'anulada' }
          },
          required: true
        }],
        order: [['createdAt', 'DESC']],
        limit: 5
      }).catch(() => []);

      const match = items.find((it) => {
        const v = it.venta;
        if (!v) return false;
        if (registro.clienteId && v.clienteId !== registro.clienteId) return false;
        return true;
      });
      venta = match?.venta || null;
    }

    const ordenRep = await OrdenReparacion.findOne({
      where: { imei: { [Op.iLike]: serie } },
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'numeroOrden', 'diasGarantia', 'estado', 'createdAt']
    });

    const diasGarantia = (ordenRep?.diasGarantia || 0) > 0
      ? ordenRep!.diasGarantia || DEFAULT_DIAS_GARANTIA
      : DEFAULT_DIAS_GARANTIA;
    const fechaVenta = registro.fechaVenta || venta?.createdAt || null;
    let fechaVence = null;
    let dentro = false;
    if (fechaVenta) {
      fechaVence = new Date(fechaVenta);
      fechaVence.setDate(fechaVence.getDate() + diasGarantia);
      dentro = new Date() <= fechaVence;
    }

    return res.json({
      serie: registro.serie,
      numeroSerieId: registro.id,
      estadoSerie: registro.estado,
      producto: registro.producto,
      cliente: registro.cliente,
      sede: registro.sede,
      ventaId: venta?.id || null,
      numeroVenta: venta?.numeroVenta || null,
      fechaVenta,
      diasGarantia,
      fechaVenceGarantia: fechaVence,
      dentroDeGarantia: dentro,
      ultimaReparacion: ordenRep || null
    });
  } catch (error) {
    next(error);
  }
};

export const listar: Handler<Body> = async (req, res, next) => {
  try {
    const { sede, estado, buscar } = req.query;
    const where: WhereAttributeHash<Attributes<ReclamoModel>> & { [Op.or]?: WhereOptions<Attributes<ReclamoModel>>[] } = {};
    const querySedeId = resolveQuerySede(sede, requireUser(req));
    if (querySedeId) where.sedeId = querySedeId;
    if (estado) where.estado = estado as Attributes<ReclamoModel>['estado'];
    if (buscar) {
      where[Op.or] = [
        { numero: { [Op.iLike]: `%${buscar}%` } },
        { serie: { [Op.iLike]: `%${buscar}%` } }
      ];
    }

    const rows = await ReclamoGarantia.findAll({
      where,
      include: [
        { model: Producto, as: 'producto', attributes: ['nombre', 'codigoBarras'] },
        { model: Cliente, as: 'cliente', attributes: ['nombre', 'documento'] },
        { model: Sede, as: 'sede', attributes: ['nombre'] },
        { model: Usuario, as: 'usuario', attributes: ['nombre'] }
      ],
      order: [['createdAt', 'DESC']],
      limit: 200
    });
    return res.json(rows);
  } catch (error) {
    next(error);
  }
};

export const crear: Handler<Body> = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  req.auditTransaction = transaction;
  try {
    const {
      serie,
      motivo,
      observaciones,
      sedeId: bodySedeId,
      diasGarantia: bodyDias
    } = req.body;

    if (!serie || !motivo) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Serie/IMEI y motivo son obligatorios.' });
    }

    const sedeId = await resolveActionSede(bodySedeId, requireUser(req), Sede, transaction);
    if (!sedeId) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Debe indicar la sede del reclamo.' });
    }

    const registro = await NumeroSerie.findOne({
      where: { serie: { [Op.iLike]: String(serie).trim() } },
      transaction
    });

    const ordenRep = await OrdenReparacion.findOne({
      where: { imei: { [Op.iLike]: String(serie).trim() } },
      order: [['createdAt', 'DESC']],
      transaction
    });

    const diasGarantia = parseInt(String(bodyDias || ordenRep?.diasGarantia || DEFAULT_DIAS_GARANTIA), 10);
    const fechaVenta = registro?.fechaVenta || null;
    let fechaVence = null;
    let dentro = false;
    if (fechaVenta) {
      fechaVence = new Date(fechaVenta);
      fechaVence.setDate(fechaVence.getDate() + diasGarantia);
      dentro = new Date() <= fechaVence;
    }

    const numero = await nextDocumentNumber(sequelize, 'RMA', transaction);

    const reclamo = await ReclamoGarantia.create({
      numero,
      serie: String(serie).trim(),
      numeroSerieId: registro?.id || null,
      productoId: registro?.productoId || null,
      clienteId: registro?.clienteId || null,
      sedeId,
      ventaId: null,
      usuarioId: requireUser(req).userId,
      motivo: String(motivo).trim(),
      estado: 'abierto',
      diasGarantia,
      fechaVenta,
      fechaVenceGarantia: fechaVence,
      dentroDeGarantia: dentro,
      observaciones: observaciones || null,
      ordenReparacionId: ordenRep?.id || null
    }, { transaction });

    await transaction.commit();

    if (req.logAudit) {
      await req.logAudit({
        accion: 'CREATE',
        modulo: 'RMA',
        registroId: reclamo.id,
        valorNuevo: reclamo.toJSON()
      });
    }

    return res.status(201).json(reclamo);
  } catch (error) {
    if (!transactionFinished(transaction)) await transaction.rollback();
    next(error);
  } finally {
    if (!transactionFinished(transaction)) await transaction.rollback();
  }
};

export const actualizarEstado: Handler<Body> = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { estado, observaciones } = req.body;
    const allowed = ['abierto', 'en_revision', 'aprobado', 'rechazado', 'cerrado'];
    if (!allowed.includes(estado || '')) {
      return res.status(400).json({ error: 'Estado de reclamo inválido.' });
    }

    const reclamo = await ReclamoGarantia.findByPk(id);
    if (!reclamo) {
      return res.status(404).json({ error: 'Reclamo no encontrado.' });
    }

    if (!['admin', 'superadmin'].includes(requireUser(req).rol) && reclamo.sedeId !== requireUser(req).sedeId) {
      return res.status(403).json({ error: 'No puede modificar reclamos de otra sede.' });
    }

    const prev = reclamo.toJSON();
    await reclamo.update({
      estado,
      observaciones: observaciones !== undefined ? observaciones : reclamo.observaciones
    });

    if (req.logAudit) {
      await req.logAudit({
        accion: 'UPDATE',
        modulo: 'RMA',
        registroId: reclamo.id,
        valorAnterior: prev,
        valorNuevo: reclamo.toJSON()
      });
    }

    return res.json(reclamo);
  } catch (error) {
    next(error);
  }
};
