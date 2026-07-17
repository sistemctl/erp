const jwt = require('jsonwebtoken');
const { isDenied } = require('../utils/token-denylist');
require('dotenv').config();

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No autenticado. Token no proporcionado.' });
  }

  if (isDenied(token)) {
    return res.status(401).json({ error: 'Sesión cerrada. Inicie sesión de nuevo.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = decoded; // { userId, nombre, rol, sedeId }
    req.token = token;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Sesión expirada o token inválido.' });
  }
};
