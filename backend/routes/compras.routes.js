const express = require('express');
const router = express.Router();
const comprasController = require('../controllers/compras.controller');
const authMiddleware = require('../middleware/auth.middleware');
const rolesMiddleware = require('../middleware/roles.middleware');

router.get('/', authMiddleware, rolesMiddleware(['admin', 'gerente_sede', 'contador']), comprasController.getCompras);
router.post('/', authMiddleware, rolesMiddleware(['admin', 'contador']), comprasController.createCompra);
router.post('/:id/recibir', authMiddleware, rolesMiddleware(['admin', 'gerente_sede']), comprasController.recibirCompra);
router.put('/:id/pago', authMiddleware, rolesMiddleware(['admin', 'contador']), comprasController.registrarPagoCompra);

module.exports = router;
