const express = require('express');
const router = express.Router();
const proveedoresController = require('../controllers/proveedores.controller');
const authMiddleware = require('../middleware/auth.middleware');
const rolesMiddleware = require('../middleware/roles.middleware');

router.get('/', authMiddleware, rolesMiddleware(['admin', 'gerente_sede', 'contador']), proveedoresController.getProveedores);
router.get('/:id', authMiddleware, rolesMiddleware(['admin', 'gerente_sede', 'contador']), proveedoresController.getProveedorById);
router.post('/', authMiddleware, rolesMiddleware(['admin', 'contador']), proveedoresController.createProveedor);
router.put('/:id', authMiddleware, rolesMiddleware(['admin', 'contador']), proveedoresController.updateProveedor);
router.delete('/:id', authMiddleware, rolesMiddleware(['admin', 'contador']), proveedoresController.deleteProveedor);

module.exports = router;
