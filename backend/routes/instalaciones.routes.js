const express = require('express');
const router = express.Router();
const instalacionesController = require('../controllers/instalaciones.controller');
const authMiddleware = require('../middleware/auth.middleware');
const rolesMiddleware = require('../middleware/roles.middleware');

const canView = ['admin', 'superadmin', 'gerente_sede', 'tecnico', 'cajero'];
const canWrite = ['admin', 'superadmin', 'gerente_sede', 'tecnico'];

router.get('/', authMiddleware, rolesMiddleware(canView), instalacionesController.getOrdenes);
router.post('/', authMiddleware, rolesMiddleware(canWrite), instalacionesController.createOrden);
router.get('/:id', authMiddleware, rolesMiddleware(canView), instalacionesController.getOrdenById);
router.put('/:id', authMiddleware, rolesMiddleware(canWrite), instalacionesController.updateOrden);
router.post('/:id/materiales', authMiddleware, rolesMiddleware(canWrite), instalacionesController.addMaterial);
router.delete('/:id/materiales/:mid', authMiddleware, rolesMiddleware(canWrite), instalacionesController.removeMaterial);
router.post('/:id/cerrar', authMiddleware, rolesMiddleware(canWrite), instalacionesController.cerrarOrden);

module.exports = router;
