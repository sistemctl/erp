const { Cliente } = require('../models');
const { Op } = require('sequelize');

exports.getClientes = async (req, res, next) => {
  try {
    const { q } = req.query;
    const where = {};
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

exports.getClienteById = async (req, res, next) => {
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

exports.createCliente = async (req, res, next) => {
  try {
    const { nombre, telefono, email, documento, direccion } = req.body;
    if (!nombre) {
      return res.status(400).json({ error: 'El nombre es obligatorio' });
    }
    
    const sedeId = req.usuario.sedeId;

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

exports.updateCliente = async (req, res, next) => {
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

exports.deleteCliente = async (req, res, next) => {
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
