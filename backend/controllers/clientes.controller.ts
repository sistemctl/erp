import type { Attributes, CreationAttributes, WhereOptions, WhereAttributeHash } from 'sequelize';
import type ClienteModel = require('../models/Cliente');
import type { Handler } from '../types/controller';
import { requireUser } from '../utils/request-user';
type Body = Partial<CreationAttributes<ClienteModel>>;
import models = require('../models');
const { Cliente, Sede } = models;
import { Op } from 'sequelize';
import { resolveActionSede } from '../utils/sede';

export const getClientes: Handler<Body> = async (req, res, next) => {
  try {
    const { q } = req.query;
    const where: WhereAttributeHash<Attributes<ClienteModel>> & { [Op.or]?: WhereOptions<Attributes<ClienteModel>>[] } = {};
    if (q) {
      where[Op.or] = [
        { nombre: { [Op.iLike]: `%${q}%` } },
        { documento: { [Op.iLike]: `%${q}%` } },
        { telefono: { [Op.iLike]: `%${q}%` } }
      ];
    }
    const clientes = await Cliente.findAll({
      where,
      order: [['nombre', 'ASC']]
    });
    return res.json(clientes);
  } catch (error) {
    next(error);
  }
};

export const getClienteById: Handler<Body> = async (req, res, next) => {
  try {
    const cliente = await Cliente.findByPk(req.params.id);
    if (!cliente) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    return res.json(cliente);
  } catch (error) {
    next(error);
  }
};

export const createCliente: Handler<Body> = async (req, res, next) => {
  try {
    const { nombre, telefono, email, documento, direccion, sedeId: bodySedeId } = req.body;
    if (!nombre) {
      return res.status(400).json({ error: 'El nombre es obligatorio' });
    }

    const sedeId = await resolveActionSede(bodySedeId, requireUser(req), Sede);
    if (!sedeId) {
      return res.status(400).json({ error: 'Debe seleccionar una sede para el cliente.' });
    }

    const cliente = await Cliente.create({
      nombre,
      telefono,
      email,
      documento,
      direccion,
      sedeId
    });

    if (req.logAudit) {
      await req.logAudit({
        accion: 'CREATE',
        modulo: 'Clientes',
        registroId: cliente.id,
        valorNuevo: cliente.toJSON()
      });
    }

    return res.status(201).json(cliente);
  } catch (error) {
    next(error);
  }
};

export const updateCliente: Handler<Body> = async (req, res, next) => {
  try {
    const cliente = await Cliente.findByPk(req.params.id);
    if (!cliente) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    const valorAnterior = cliente.toJSON();
    await cliente.update(req.body);

    if (req.logAudit) {
      await req.logAudit({
        accion: 'UPDATE',
        modulo: 'Clientes',
        registroId: cliente.id,
        valorAnterior,
        valorNuevo: cliente.toJSON()
      });
    }

    return res.json(cliente);
  } catch (error) {
    next(error);
  }
};

export const deleteCliente: Handler<Body> = async (req, res, next) => {
  try {
    const cliente = await Cliente.findByPk(req.params.id);
    if (!cliente) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    // Un cliente con documentos no se borra: perderíamos el titular de ventas,
    // facturas, cartera, garantías e IMEI vendidos.
    const id = cliente.id;
    const { Venta, Factura, CuentaPorCobrar, Cotizacion, OrdenReparacion, OrdenInstalacion, ReclamoGarantia, TradeIn, NumeroSerie } = models;
    const conteos: [string, number][] = [
      ['ventas', await Venta.count({ where: { clienteId: id } })],
      ['facturas', await Factura.count({ where: { clienteId: id } })],
      ['cuentas por cobrar', await CuentaPorCobrar.count({ where: { clienteId: id } })],
      ['cotizaciones', await Cotizacion.count({ where: { clienteId: id } })],
      ['reparaciones', await OrdenReparacion.count({ where: { clienteId: id } })],
      ['instalaciones', await OrdenInstalacion.count({ where: { clienteId: id } })],
      ['garantías', await ReclamoGarantia.count({ where: { clienteId: id } })],
      ['trade-ins', await TradeIn.count({ where: { clienteId: id } })],
      ['equipos con IMEI', await NumeroSerie.count({ where: { clienteId: id } })]
    ];
    const usados = conteos.filter(([, n]) => n > 0);
    if (usados.length) {
      return res.status(409).json({
        error: `No se puede eliminar el cliente: tiene ${usados.map(([k, n]) => `${n} ${k}`).join(', ')}. Puede editar sus datos, pero el historial debe conservarse.`
      });
    }

    const valorAnterior = cliente.toJSON();
    await cliente.destroy();

    if (req.logAudit) {
      await req.logAudit({
        accion: 'DELETE',
        modulo: 'Clientes',
        registroId: req.params.id,
        valorAnterior
      });
    }

    return res.json({ message: 'Cliente eliminado' });
  } catch (error) {
    next(error);
  }
};
