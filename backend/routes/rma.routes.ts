import express = require('express');
const router = express.Router();
import rmaController = require('../controllers/rma.controller');
import authMiddleware = require('../middleware/auth.middleware');
import rolesMiddleware = require('../middleware/roles.middleware');

const roles = ['admin', 'superadmin', 'gerente_sede', 'cajero', 'tecnico'] as const;

router.get('/lookup', authMiddleware, rolesMiddleware(roles), rmaController.lookupSerie);
router.get('/', authMiddleware, rolesMiddleware(roles), rmaController.listar);
router.post('/', authMiddleware, rolesMiddleware(roles), rmaController.crear);
router.put('/:id/estado', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'tecnico']), rmaController.actualizarEstado);

export = router;
