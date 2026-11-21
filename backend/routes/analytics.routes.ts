import express = require('express');
const router = express.Router();
import analyticsController = require('../controllers/analytics.controller');
import authMiddleware = require('../middleware/auth.middleware');
import rolesMiddleware = require('../middleware/roles.middleware');

const rolesReportes = ['admin', 'superadmin', 'gerente_sede', 'contador'] as const;

router.get('/finanzas/cartera', authMiddleware, rolesMiddleware([...rolesReportes, 'cajero']), analyticsController.getCarteraResumen);
router.get('/finanzas/cuentas-por-pagar', authMiddleware, rolesMiddleware(rolesReportes), analyticsController.getCuentasPorPagar);
router.get('/finanzas/flujo-caja', authMiddleware, rolesMiddleware(rolesReportes), analyticsController.getFlujoCaja);
router.get('/ventas/por-metodo-pago', authMiddleware, rolesMiddleware(rolesReportes), analyticsController.getVentasPorMetodoPago);
router.get('/ventas/top-productos', authMiddleware, rolesMiddleware(rolesReportes), analyticsController.getTopProductos);
router.get('/inventario/valorizado', authMiddleware, rolesMiddleware(rolesReportes), analyticsController.getInventarioValorizado);
router.get('/export/csv', authMiddleware, rolesMiddleware(rolesReportes), analyticsController.exportCsv);

export = router;
