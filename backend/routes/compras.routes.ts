import express = require('express');
const router = express.Router();
import comprasController = require('../controllers/compras.controller');
import authMiddleware = require('../middleware/auth.middleware');
import rolesMiddleware = require('../middleware/roles.middleware');

router.get('/', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'contador']), comprasController.getCompras);
router.post('/', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'contador']), comprasController.createCompra);
router.post('/:id/recibir', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede']), comprasController.recibirCompra);
router.post('/:id/devolver', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede']), comprasController.devolverMercancia);
router.put('/:id/pago', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'contador']), comprasController.registrarPagoCompra);

export = router;
