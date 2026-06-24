const { Proveedor } = require('../models');

exports.getProveedores = async (req, res, next) => {
  try {
    const proveedores = await Proveedor.findAll({ order: [['nombre', 'ASC']] });
    return res.json(proveedores);
  } catch (error) {
    next(error);
  }
};

exports.getProveedorById = async (req, res, next) => {
  try {
    const proveedor = await Proveedor.findByPk(req.params.id);
    if (!proveedor) {
      return res.status(404).json({ error: 'Proveedor no encontrado.' });
    }
    return res.json(proveedor);
  } catch (error) {
    next(error);
  }
};

exports.createProveedor = async (req, res, next) => {
  try {
    const { nombre, nit, contacto, telefono, email, direccion, banco, cuentaBancaria } = req.body;

    if (!nombre || !nit) {
      return res.status(400).json({ error: 'El nombre y NIT del proveedor son obligatorios.' });
    }

    const proveedor = await Proveedor.create({
      nombre,
      nit,
      contacto,
      telefono,
      email,
      direccion,
      banco,
      cuentaBancaria
    });

    if (req.logAudit) {
      await req.logAudit({
        accion: 'CREATE',
        modulo: 'Proveedores',
        registroId: proveedor.id,
        valorNuevo: proveedor.toJSON()
      });
    }

    return res.status(201).json(proveedor);
  } catch (error) {
    next(error);
  }
};

exports.updateProveedor = async (req, res, next) => {
  try {
    const proveedor = await Proveedor.findByPk(req.params.id);
    if (!proveedor) {
      return res.status(404).json({ error: 'Proveedor no encontrado.' });
    }

    const valorAnterior = proveedor.toJSON();
    await proveedor.update(req.body);

    if (req.logAudit) {
      await req.logAudit({
        accion: 'UPDATE',
        modulo: 'Proveedores',
        registroId: proveedor.id,
        valorAnterior,
        valorNuevo: proveedor.toJSON()
      });
    }

    return res.json(proveedor);
  } catch (error) {
    next(error);
  }
};

exports.deleteProveedor = async (req, res, next) => {
  try {
    const proveedor = await Proveedor.findByPk(req.params.id);
    if (!proveedor) {
      return res.status(404).json({ error: 'Proveedor no encontrado.' });
    }

    const valorAnterior = proveedor.toJSON();
    await proveedor.destroy();

    if (req.logAudit) {
      await req.logAudit({
        accion: 'DELETE',
        modulo: 'Proveedores',
        registroId: req.params.id,
        valorAnterior
      });
    }

    return res.json({ message: 'Proveedor eliminado con éxito.' });
  } catch (error) {
    next(error);
  }
};
