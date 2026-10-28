import express = require('express');
const router = express.Router();
import instalacionesController = require('../controllers/instalaciones.controller');
import authMiddleware = require('../middleware/auth.middleware');
import rolesMiddleware = require('../middleware/roles.middleware');

/** Lectura: operación de campo + contador (reportes). Cajero no aplica. */
const canView = ['admin', 'superadmin', 'gerente_sede', 'tecnico', 'contador'] as const;
const canWrite = ['admin', 'superadmin', 'gerente_sede', 'tecnico'] as const;
const canReopen = ['admin', 'superadmin', 'gerente_sede'] as const;

router.get('/', authMiddleware, rolesMiddleware(canView), instalacionesController.getOrdenes);
router.post('/', authMiddleware, rolesMiddleware(canWrite), instalacionesController.createOrden);
router.get('/:id', authMiddleware, rolesMiddleware(canView), instalacionesController.getOrdenById);
router.put('/:id', authMiddleware, rolesMiddleware(canWrite), instalacionesController.updateOrden);
router.post('/:id/materiales', authMiddleware, rolesMiddleware(canWrite), instalacionesController.addMaterial);
router.put('/:id/materiales/:mid', authMiddleware, rolesMiddleware(canWrite), instalacionesController.updateMaterial);
router.delete('/:id/materiales/:mid', authMiddleware, rolesMiddleware(canWrite), instalacionesController.removeMaterial);
router.post('/:id/reabrir', authMiddleware, rolesMiddleware(canReopen), instalacionesController.reabrirOrden);
router.post('/:id/cerrar', authMiddleware, rolesMiddleware(canWrite), instalacionesController.cerrarOrden);

export = router;
