import express = require('express');
const router = express.Router();
import proveedoresController = require('../controllers/proveedores.controller');
import authMiddleware = require('../middleware/auth.middleware');
import rolesMiddleware = require('../middleware/roles.middleware');

router.get('/', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'contador']), proveedoresController.getProveedores);
router.get('/:id', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'contador']), proveedoresController.getProveedorById);
router.post('/', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'contador']), proveedoresController.createProveedor);
router.put('/:id', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'contador']), proveedoresController.updateProveedor);
router.delete('/:id', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'contador']), proveedoresController.deleteProveedor);

export = router;
