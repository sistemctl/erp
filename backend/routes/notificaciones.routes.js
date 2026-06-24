const express = require('express');
const router = express.Router();
const notificacionesController = require('../controllers/notificaciones.controller');
const authMiddleware = require('../middleware/auth.middleware');
const rolesMiddleware = require('../middleware/roles.middleware');

router.get('/', authMiddleware, rolesMiddleware(['admin', 'gerente_sede', 'contador']), notificacionesController.getNotificaciones);

module.exports = router;
