const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analytics.controller');
const authMiddleware = require('../middleware/auth.middleware');
const rolesMiddleware = require('../middleware/roles.middleware');

const rolesReportes = ['admin', 'superadmin', 'gerente_sede', 'contador'];

router.get('/finanzas/cartera', authMiddleware, rolesMiddleware(rolesReportes), analyticsController.getCarteraResumen);
router.get('/finanzas/cuentas-por-pagar', authMiddleware, rolesMiddleware(rolesReportes), analyticsController.getCuentasPorPagar);
router.get('/finanzas/flujo-caja', authMiddleware, rolesMiddleware(rolesReportes), analyticsController.getFlujoCaja);
router.get('/ventas/por-metodo-pago', authMiddleware, rolesMiddleware(rolesReportes), analyticsController.getVentasPorMetodoPago);
router.get('/ventas/top-productos', authMiddleware, rolesMiddleware(rolesReportes), analyticsController.getTopProductos);
router.get('/inventario/valorizado', authMiddleware, rolesMiddleware(rolesReportes), analyticsController.getInventarioValorizado);
router.get('/export/csv', authMiddleware, rolesMiddleware(rolesReportes), analyticsController.exportCsv);

module.exports = router;
