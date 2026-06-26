const express = require('express');
const router = express.Router();
const facturasController = require('../controllers/facturas.controller');
const authMiddleware = require('../middleware/auth.middleware');
const rolesMiddleware = require('../middleware/roles.middleware');

router.get('/', authMiddleware, facturasController.getFacturas);
router.get('/:id', authMiddleware, facturasController.getFacturaById);
router.post('/:id/nota-credito', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede']), facturasController.anularFactura);
router.get('/:id/pdf', authMiddleware, facturasController.getFacturaPdf);

module.exports = router;
