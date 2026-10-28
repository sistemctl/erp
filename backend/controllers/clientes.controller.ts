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
