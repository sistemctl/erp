const { Usuario, Sede } = require('../models');
const jwt = require('jsonwebtoken');
require('dotenv').config();

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Por favor, ingrese correo y contraseña.' });
    }

    const usuario = await Usuario.findOne({
      where: { email, activo: true },
      include: [{ model: Sede, as: 'sede', attributes: ['nombre'] }]
    });

    if (!usuario || !(await usuario.compararPassword(password))) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    // Crear JWT token
    const token = jwt.sign(
      {
        userId: usuario.id,
        nombre: usuario.nombre,
        rol: usuario.rol,
        sedeId: usuario.sedeId
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    // Registrar en auditoría
    if (req.logAudit) {
      await req.logAudit({
        accion: 'LOGIN',
        modulo: 'Auth',
        registroId: usuario.id,
        valorNuevo: { email: usuario.email, rol: usuario.rol }
      });
    }

    return res.json({
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
        sedeId: usuario.sedeId,
        sedeNombre: usuario.sede ? usuario.sede.nombre : 'Global'
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.logout = async (req, res, next) => {
  try {
    const { denyToken } = require('../utils/token-denylist');
    const token = req.token;
    if (token) {
      let expiresAt = Date.now() + 8 * 60 * 60 * 1000;
      try {
        const decoded = require('jsonwebtoken').decode(token);
        if (decoded?.exp) expiresAt = decoded.exp * 1000;
      } catch (_) { /* ignore */ }
      denyToken(token, expiresAt);
    }
    return res.json({ message: 'Sesión cerrada exitosamente.' });
  } catch (error) {
    next(error);
  }
};

exports.me = async (req, res, next) => {
  try {
    const usuario = await Usuario.findByPk(req.usuario.userId, {
      attributes: ['id', 'nombre', 'email', 'rol', 'sedeId', 'activo'],
      include: [{ model: Sede, as: 'sede', attributes: ['nombre'] }]
    });

    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    return res.json({
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
        sedeId: usuario.sedeId,
        sedeNombre: usuario.sede ? usuario.sede.nombre : 'Global'
      }
    });
  } catch (error) {
    next(error);
  }
};
