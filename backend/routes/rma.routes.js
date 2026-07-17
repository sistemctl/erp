const express = require('express');
const router = express.Router();
const rmaController = require('../controllers/rma.controller');
const authMiddleware = require('../middleware/auth.middleware');
const rolesMiddleware = require('../middleware/roles.middleware');

const roles = ['admin', 'superadmin', 'gerente_sede', 'cajero', 'tecnico'];

router.get('/lookup', authMiddleware, rolesMiddleware(roles), rmaController.lookupSerie);
router.get('/', authMiddleware, rolesMiddleware(roles), rmaController.listar);
router.post('/', authMiddleware, rolesMiddleware(roles), rmaController.crear);
router.put('/:id/estado', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'tecnico']), rmaController.actualizarEstado);

module.exports = router;
