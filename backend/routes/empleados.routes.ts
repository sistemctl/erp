import express = require('express');
const router = express.Router();
import empleadosController = require('../controllers/empleados.controller');
import authMiddleware = require('../middleware/auth.middleware');
import rolesMiddleware = require('../middleware/roles.middleware');

router.get('/', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'contador']), empleadosController.getEmpleados);
router.get('/:id', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'contador']), empleadosController.getEmpleadoById);
router.post('/', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'contador']), empleadosController.createEmpleado);
router.put('/:id', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'contador']), empleadosController.updateEmpleado);
router.delete('/:id', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'contador']), empleadosController.deleteEmpleado);

export = router;
