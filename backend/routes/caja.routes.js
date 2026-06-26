const express = require('express');
const router = express.Router();
const cajaController = require('../controllers/caja.controller');
const authMiddleware = require('../middleware/auth.middleware');
const rolesMiddleware = require('../middleware/roles.middleware');

router.post('/apertura', authMiddleware, rolesMiddleware(['admin', 'gerente_sede', 'cajero']), cajaController.aperturaCaja);
router.post('/cierre', authMiddleware, rolesMiddleware(['admin', 'gerente_sede', 'cajero']), cajaController.cierreCaja);
router.post('/liberar', authMiddleware, rolesMiddleware(['admin']), cajaController.liberarCaja);
router.post('/egreso', authMiddleware, rolesMiddleware(['admin', 'gerente_sede', 'cajero']), cajaController.egresoCaja);
router.get('/reporte', authMiddleware, rolesMiddleware(['admin', 'gerente_sede', 'contador', 'cajero']), cajaController.getReporteCaja);
router.get('/historial', authMiddleware, rolesMiddleware(['admin', 'gerente_sede', 'contador']), cajaController.getHistorialCajas);
router.get('/egresos', authMiddleware, rolesMiddleware(['admin', 'gerente_sede', 'cajero', 'contador']), cajaController.getEgresos);
router.get('/categorias-egreso', authMiddleware, rolesMiddleware(['admin', 'gerente_sede', 'cajero', 'contador']), cajaController.getCategoriasEgreso);

module.exports = router;
