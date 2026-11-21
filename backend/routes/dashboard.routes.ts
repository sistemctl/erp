import express = require('express');
const router = express.Router();
import dashboardController = require('../controllers/dashboard.controller');
import authMiddleware = require('../middleware/auth.middleware');

router.get('/kpis', authMiddleware, dashboardController.getKPIs);
router.get('/detalle/:tipo', authMiddleware, dashboardController.getDetalle);
router.get('/actividad', authMiddleware, dashboardController.getActividad);
router.get('/graficas/ventas', authMiddleware, dashboardController.getGraficaVentas);
router.get('/gastos-por-categoria', authMiddleware, dashboardController.getGastosPorCategoria);
router.get('/gasto-resumen', authMiddleware, dashboardController.getGastoResumen);

export = router;
