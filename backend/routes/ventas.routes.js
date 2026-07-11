const express = require('express');
const router = express.Router();
const ventasController = require('../controllers/ventas.controller');
const authMiddleware = require('../middleware/auth.middleware');
const rolesMiddleware = require('../middleware/roles.middleware');

router.get('/', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'contador', 'cajero']), ventasController.getVentas);
router.post('/', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'cajero']), ventasController.procesarVenta);
router.get('/descuentos', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'contador']), ventasController.getDescuentos);
router.get('/comisiones', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'contador']), ventasController.getComisiones);
router.get('/:id/devoluciones', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'contador', 'cajero']), ventasController.getDevolucionesVenta);
router.post('/:id/devolucion', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'cajero']), ventasController.crearDevolucionVenta);

module.exports = router;
