import express = require('express');
const router = express.Router();
import notificacionesController = require('../controllers/notificaciones.controller');
import authMiddleware = require('../middleware/auth.middleware');
import rolesMiddleware = require('../middleware/roles.middleware');

router.get('/', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'contador']), notificacionesController.getNotificaciones);

export = router;
