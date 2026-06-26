module.exports = (rolesPermitidos) => {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({ error: 'No autenticado.' });
    }

    if (req.usuario.rol === 'superadmin') {
      return next();
    }

    if (!rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({ error: 'Acceso denegado. Permisos insuficientes.' });
    }

    next();
  };
};
