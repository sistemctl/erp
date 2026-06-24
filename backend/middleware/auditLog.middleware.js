const { AuditLog } = require('../models');

module.exports = (req, res, next) => {
  // Adjuntar la función logAudit a req para uso manual en controladores
  req.logAudit = async ({ accion, modulo, registroId, valorAnterior, valorNuevo }) => {
    try {
      await AuditLog.create({
        usuarioId: req.usuario ? req.usuario.userId : null,
        accion,
        modulo,
        registroId: registroId ? String(registroId) : null,
        valorAnterior: valorAnterior || null,
        valorNuevo: valorNuevo || null,
        sedeId: req.usuario ? req.usuario.sedeId : null,
        ip: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress
      });
    } catch (err) {
      console.error('Error al registrar log de auditoría:', err);
    }
  };

  next();
};
