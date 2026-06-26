const express = require('express');
const router = express.Router();
const cotizacionesController = require('../controllers/cotizaciones.controller');
const authMiddleware = require('../middleware/auth.middleware');
const rolesMiddleware = require('../middleware/roles.middleware');

router.get('/', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'cajero', 'contador']), cotizacionesController.getCotizaciones);
router.get('/:id', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'cajero', 'contador']), cotizacionesController.getCotizacionById);
router.post('/', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'cajero']), cotizacionesController.crearCotizacion);
router.post('/:id/aprobar', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'cajero']), cotizacionesController.aprobarCotizacion);
router.get('/:id/pdf', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'cajero', 'contador']), cotizacionesController.generarCotizacionPDF);

module.exports = router;
