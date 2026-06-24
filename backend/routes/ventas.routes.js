const express = require('express');
const router = express.Router();
const ventasController = require('../controllers/ventas.controller');
const authMiddleware = require('../middleware/auth.middleware');
const rolesMiddleware = require('../middleware/roles.middleware');

router.get('/', authMiddleware, rolesMiddleware(['admin', 'gerente_sede', 'contador', 'cajero']), ventasController.getVentas);
router.post('/', authMiddleware, rolesMiddleware(['admin', 'gerente_sede', 'cajero']), ventasController.procesarVenta);
router.get('/descuentos', authMiddleware, rolesMiddleware(['admin', 'gerente_sede', 'contador']), ventasController.getDescuentos);
router.get('/comisiones', authMiddleware, rolesMiddleware(['admin', 'gerente_sede', 'contador']), ventasController.getComisiones);

module.exports = router;
