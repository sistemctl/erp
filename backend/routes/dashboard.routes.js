const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const authMiddleware = require('../middleware/auth.middleware');

router.get('/kpis', authMiddleware, dashboardController.getKPIs);
router.get('/graficas/ventas', authMiddleware, dashboardController.getGraficaVentas);
router.get('/gastos-por-categoria', authMiddleware, dashboardController.getGastosPorCategoria);
router.get('/gasto-resumen', authMiddleware, dashboardController.getGastoResumen);

module.exports = router;
