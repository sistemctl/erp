import type { Handler } from '../types/controller';
import { requireUser } from '../utils/request-user';
import { transactionFinished } from '../utils/transaction-state';
import type { Attributes, CreationAttributes, WhereOptions, WhereAttributeHash } from 'sequelize';
import type CotModel = require('../models/Cotizacion');
interface CotItem { descripcion: string; cantidad: number; precioUnitario: number | string; productoId?: string | null; }
type Body = { clienteId?: string; sedeId?: string; items?: CotItem[]; fechaVencimiento?: string; notas?: string; ventaId?: string; ordenReparacionId?: string };
import { nextDocumentNumber } from '../utils/document-number';
import { assertSedeAccess } from '../utils/sede';
import models = require('../models');
const { Cotizacion, ItemCotizacion, Cliente, Sede, Usuario, Producto, Venta, OrdenReparacion, ConfiguracionSistema, sequelize } = models;
import { Op } from 'sequelize';
import PDFDocument = require('pdfkit');
import { resolveQuerySede, resolveActionSede } from '../utils/sede';
import { generarCotizacionPDF as renderCotizacionPDF } from '../utils/cotizacion-pdf';

// --- GET ALL COTIZACIONES ---
export const getCotizaciones: Handler<Body> = async (req, res, next) => {
  try {
    const { sede, estado, cliente, desde, hasta, buscar } = req.query;
    const where: WhereAttributeHash<Attributes<CotModel>> & { [Op.or]?: WhereOptions<Attributes<CotModel>>[] } = {};

    const querySedeId = resolveQuerySede(sede, requireUser(req));
    if (querySedeId) {
      where.sedeId = querySedeId;
    }

    if (estado) {
      where.estado = estado as Attributes<CotModel>['estado'];
    }

    if (cliente) {
      where.clienteId = cliente;
    }

    if (desde && hasta) {
      where.createdAt = { [Op.between]: [new Date(desde), new Date(hasta)] };
    }

    if (buscar) {
      where[Op.or] = [
        { numeroCotizacion: { [Op.iLike]: `%${buscar}%` } },
        { '$cliente.nombre$': { [Op.iLike]: `%${buscar}%` } }
      ];
    }

    const cotizaciones = await Cotizacion.findAll({
      where,
      include: [
        { model: Cliente, as: 'cliente', attributes: ['nombre', 'documento', 'telefono'] },
        { model: Sede, as: 'sede', attributes: ['nombre'] },
        { model: Usuario, as: 'usuario', attributes: ['nombre'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    return res.json(cotizaciones);
  } catch (error) {
    next(error);
  }
};

// --- GET COTIZACION BY ID ---
export const getCotizacionById: Handler<Body> = async (req, res, next) => {
  try {
    const { id } = req.params;
    const cotizacion = await Cotizacion.findByPk(id, {
      include: [
        { model: Cliente, as: 'cliente' },
        { model: Sede, as: 'sede' },
        { model: Usuario, as: 'usuario', attributes: ['nombre'] },
        {
          model: ItemCotizacion,
          as: 'items',
          include: [{ model: Producto, as: 'producto', attributes: ['nombre', 'codigoBarras', 'precioVenta', 'tieneNumeroSerie', 'tieneIVA', 'unidadMedida'] }]
        }
      ]
    });
    if (cotizacion) assertSedeAccess(requireUser(req), cotizacion.sedeId);

    if (!cotizacion) {
      return res.status(404).json({ error: 'Cotización no encontrada.' });
    }

    return res.json(cotizacion);
  } catch (error) {
    next(error);
  }
};

// --- CREAR COTIZACION ---
export const crearCotizacion: Handler<Body> = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  req.auditTransaction = transaction;
  try {
    const { clienteId, items, fechaVencimiento, notas, sedeId: bodySedeId } = req.body;
    let sedeId = await resolveActionSede(bodySedeId, requireUser(req), Sede, transaction);

    if (!sedeId) {
      sedeId = await resolveActionSede(null, requireUser(req), Sede, transaction);
    }

    if (!sedeId) {
      return res.status(400).json({ error: 'Debe especificar una sede para la cotización.' });
    }

    const usuarioId = requireUser(req).userId;

    if (!clienteId || !items || items.length === 0 || !fechaVencimiento) {
      return res.status(400).json({ error: 'Datos de cotización incompletos.' });
    }

    const numeroCotizacion = await nextDocumentNumber(sequelize, 'COT', transaction);

    let total = 0;
    const itemsACrear: (CotItem & { subtotal: number })[] = [];

    for (const item of items) {
      const subtotal = parseFloat(String(item.cantidad)) * parseFloat(String(item.precioUnitario));
      total += subtotal;

      itemsACrear.push({
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precioUnitario: item.precioUnitario,
        subtotal,
        productoId: item.productoId || null
      });
    }

    const cotizacion = await Cotizacion.create({
      numeroCotizacion,
      clienteId,
      usuarioId,
      sedeId,
      total,
      estado: 'borrador',
      fechaVencimiento: new Date(fechaVencimiento),
      notas: notas || ''
    }, { transaction });

    for (const item of itemsACrear) {
      await ItemCotizacion.create({ ...item, cotizacionId: cotizacion.id }, { transaction });
    }

    await transaction.commit();

    if (req.logAudit) {
      await req.logAudit({
        accion: 'CREATE',
        modulo: 'Cotizacion',
        registroId: cotizacion.id,
        valorNuevo: cotizacion.toJSON()
      });
    }

    return res.status(201).json(cotizacion);
  } catch (error) {
    if (!transactionFinished(transaction)) await transaction.rollback();
    next(error);
  } finally {
    if (!transactionFinished(transaction)) await transaction.rollback();
  }
};

// --- APROBAR COTIZACION ---
export const aprobarCotizacion: Handler<Body> = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { ventaId, ordenReparacionId } = req.body;
    if (!ventaId && !ordenReparacionId) {
      return res.status(400).json({ error: 'Debe vincular una venta o reparación para aprobar la cotización.' });
    }

    const cotizacion = await Cotizacion.findByPk(id);
    if (cotizacion) assertSedeAccess(requireUser(req), cotizacion.sedeId);
    if (!cotizacion) {
      return res.status(404).json({ error: 'Cotización no encontrada.' });
    }

    if (cotizacion.estado === 'aprobada') {
      return res.status(400).json({ error: 'La cotización ya ha sido aprobada.' });
    }

    const valorAnterior = cotizacion.toJSON();

    if (ventaId) {
      const venta = await Venta.findByPk(ventaId);
      if (!venta || String(venta.sedeId) !== String(cotizacion.sedeId) || String(venta.clienteId) !== String(cotizacion.clienteId)) {
        return res.status(400).json({ error: 'La venta debe corresponder al cliente y sede de la cotización.' });
      }
    }
    if (ordenReparacionId) {
      const orden = await OrdenReparacion.findByPk(ordenReparacionId);
      if (!orden || String(orden.sedeId) !== String(cotizacion.sedeId) || String(orden.clienteId) !== String(cotizacion.clienteId)) {
        return res.status(400).json({ error: 'La reparación debe corresponder al cliente y sede de la cotización.' });
      }
    }

    await cotizacion.update({
      estado: 'aprobada',
      ventaId: ventaId || null,
      ordenReparacionId: ordenReparacionId || null
    });

    if (req.logAudit) {
      await req.logAudit({
        accion: 'UPDATE',
        modulo: 'Cotizacion',
        registroId: cotizacion.id,
        valorAnterior,
        valorNuevo: cotizacion.toJSON()
      });
    }

    return res.json({ message: 'Cotización aprobada correctamente.', cotizacion });
  } catch (error) {
    next(error);
  }
};

// --- GENERAR COTIZACION PDF ---
export const generarCotizacionPDF: Handler<Body> = async (req, res, next) => {
  try {
    const { id } = req.params;
    const cotizacion = await Cotizacion.findByPk(id, {
      include: [
        { model: Cliente, as: 'cliente' },
        { model: Sede, as: 'sede' },
        { model: Usuario, as: 'usuario', attributes: ['nombre'] },
        {
          model: ItemCotizacion,
          as: 'items',
          include: [{ model: Producto, as: 'producto', attributes: ['codigoBarras', 'nombre', 'tieneIVA', 'unidadMedida'] }]
        }
      ]
    });
    if (cotizacion) assertSedeAccess(requireUser(req), cotizacion.sedeId);

    if (!cotizacion) {
      return res.status(404).json({ error: 'Cotización no encontrada.' });
    }

    const config = await ConfiguracionSistema.findOne();
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=cotizacion_${cotizacion.numeroCotizacion}.pdf`);
    doc.pipe(res);

    await renderCotizacionPDF(doc, cotizacion, config || {});

    doc.end();
  } catch (error) {
    next(error);
  }
};
