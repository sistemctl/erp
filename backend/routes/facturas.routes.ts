import express = require('express');
const router = express.Router();
import facturasController = require('../controllers/facturas.controller');
import authMiddleware = require('../middleware/auth.middleware');
import rolesMiddleware = require('../middleware/roles.middleware');

router.get('/', authMiddleware, facturasController.getFacturas);
router.get('/:id', authMiddleware, facturasController.getFacturaById);
router.post('/:id/nota-credito', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede']), facturasController.anularFactura);
router.post('/:id/enviar-email', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'cajero', 'contador']), facturasController.enviarFacturaEmail);
router.get('/:id/pdf', authMiddleware, facturasController.getFacturaPdf);

export = router;
