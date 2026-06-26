const express = require('express');
const router = express.Router();
const empleadosController = require('../controllers/empleados.controller');
const authMiddleware = require('../middleware/auth.middleware');
const rolesMiddleware = require('../middleware/roles.middleware');

router.get('/', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'contador']), empleadosController.getEmpleados);
router.get('/:id', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'contador']), empleadosController.getEmpleadoById);
router.post('/', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'contador']), empleadosController.createEmpleado);
router.put('/:id', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'contador']), empleadosController.updateEmpleado);
router.delete('/:id', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'contador']), empleadosController.deleteEmpleado);

module.exports = router;
