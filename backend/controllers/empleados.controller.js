const { Empleado, Sede } = require('../models');

exports.getEmpleados = async (req, res, next) => {
  try {
    const where = {};
    if (req.usuario.rol !== 'admin') {
      where.sedeId = req.usuario.sedeId;
    }
    const empleados = await Empleado.findAll({
      where,
      include: [{ model: Sede, as: 'sede', attributes: ['nombre'] }],
      order: [['nombre', 'ASC']]
    });
    return res.json(empleados);
  } catch (error) {
    next(error);
  }
};

exports.getEmpleadoById = async (req, res, next) => {
  try {
    const empleado = await Empleado.findByPk(req.params.id, {
      include: [{ model: Sede, as: 'sede', attributes: ['nombre'] }]
    });
    if (!empleado) {
      return res.status(404).json({ error: 'Empleado no encontrado.' });
    }
    return res.json(empleado);
  } catch (error) {
    next(error);
  }
};

exports.createEmpleado = async (req, res, next) => {
  try {
    const { nombre, documento, telefono, email, cargo, sedeId, tipoContrato, salarioBase, auxilioTransporte, fechaIngreso, cuentaBancaria, banco } = req.body;

    if (!nombre || !documento || !sedeId || !tipoContrato || salarioBase === undefined || !fechaIngreso) {
      return res.status(400).json({ error: 'Faltan campos obligatorios para registrar el empleado.' });
    }

    const empleado = await Empleado.create({
      nombre,
      documento,
      telefono,
      email,
      cargo,
      sedeId,
      tipoContrato,
      salarioBase: parseFloat(salarioBase),
      auxilioTransporte: auxilioTransporte !== undefined ? !!auxilioTransporte : true,
      fechaIngreso,
      activo: true,
      cuentaBancaria,
      banco
    });

    if (req.logAudit) {
      await req.logAudit({
        accion: 'CREATE',
        modulo: 'Empleados',
        registroId: empleado.id,
        valorNuevo: empleado.toJSON()
      });
    }

    return res.status(201).json(empleado);
  } catch (error) {
    next(error);
  }
};

exports.updateEmpleado = async (req, res, next) => {
  try {
    const empleado = await Empleado.findByPk(req.params.id);
    if (!empleado) {
      return res.status(404).json({ error: 'Empleado no encontrado.' });
    }

    const valorAnterior = empleado.toJSON();
    await empleado.update(req.body);

    if (req.logAudit) {
      await req.logAudit({
        accion: 'UPDATE',
        modulo: 'Empleados',
        registroId: empleado.id,
        valorAnterior,
        valorNuevo: empleado.toJSON()
      });
    }

    return res.json(empleado);
  } catch (error) {
    next(error);
  }
};

exports.deleteEmpleado = async (req, res, next) => {
  try {
    const empleado = await Empleado.findByPk(req.params.id);
    if (!empleado) {
      return res.status(404).json({ error: 'Empleado no encontrado.' });
    }

    const valorAnterior = empleado.toJSON();
    await empleado.update({ activo: false }); // Soft delete / desvinculación

    if (req.logAudit) {
      await req.logAudit({
        accion: 'DELETE',
        modulo: 'Empleados',
        registroId: req.params.id,
        valorAnterior,
        valorNuevo: { activo: false }
      });
    }

    return res.json({ message: 'Empleado desvinculado / desactivado con éxito.' });
  } catch (error) {
    next(error);
  }
};
