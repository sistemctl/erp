import jwt = require('jsonwebtoken');
import { isDenied } from '../utils/token-denylist';
import models = require('../models');
const { Usuario } = models;
import type { RequestHandler } from 'express';
import dotenv = require('dotenv');
dotenv.config();

const authMiddleware: RequestHandler = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No autenticado. Token no proporcionado.' });
  }

  if (isDenied(token)) {
    return res.status(401).json({ error: 'Sesión cerrada. Inicie sesión de nuevo.' });
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET no configurado.');
    const decoded = jwt.verify(token, secret);
    if (typeof decoded === 'string' || typeof decoded.userId !== 'string') {
      throw new jwt.JsonWebTokenError('Token sin usuario válido.');
    }
    const usuario = await Usuario.findByPk(decoded.userId, {
      attributes: ['id', 'nombre', 'rol', 'sedeId', 'activo', 'sessionVersion']
    });
    if (!usuario?.activo || Number(decoded.sessionVersion || 0) !== Number(usuario.sessionVersion || 0)) {
      return res.status(401).json({ error: 'La sesión fue revocada. Inicie sesión nuevamente.', code: 'SESSION_REVOKED' });
    }
    req.usuario = { userId: usuario.id, nombre: usuario.nombre, rol: usuario.rol, sedeId: usuario.sedeId };
    req.token = token;
    next();
  } catch (error) {
    if (!(error instanceof Error) || !['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(error.name)) return next(error);
    return res.status(401).json({ error: 'Sesión expirada o token inválido.' });
  }
};
export = authMiddleware;
