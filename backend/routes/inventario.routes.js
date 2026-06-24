const express = require('express');
const router = express.Router();
const inventarioController = require('../controllers/inventario.controller');
const authMiddleware = require('../middleware/auth.middleware');
const rolesMiddleware = require('../middleware/roles.middleware');

router.get('/stock', authMiddleware, rolesMiddleware(['admin', 'gerente_sede', 'cajero']), inventarioController.getStockSede);
router.get('/movimientos', authMiddleware, rolesMiddleware(['admin', 'gerente_sede', 'contador']), inventarioController.getMovimientos);
router.post('/traslado', authMiddleware, rolesMiddleware(['admin', 'gerente_sede']), inventarioController.trasladarMercancia);

module.exports = router;
