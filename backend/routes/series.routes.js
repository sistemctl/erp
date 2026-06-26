const express = require('express');
const router = express.Router();
const seriesController = require('../controllers/series.controller');
const authMiddleware = require('../middleware/auth.middleware');
const rolesMiddleware = require('../middleware/roles.middleware');

router.get('/', authMiddleware, rolesMiddleware(['admin', 'gerente_sede']), seriesController.getSeries);
router.post('/', authMiddleware, rolesMiddleware(['admin', 'gerente_sede']), seriesController.createSerie);
router.post('/bulk', authMiddleware, rolesMiddleware(['admin', 'gerente_sede']), seriesController.createSeriesBulk);
router.get('/:imei/historial', authMiddleware, rolesMiddleware(['admin', 'gerente_sede', 'cajero', 'tecnico']), seriesController.getHistorialImei);
router.delete('/:id', authMiddleware, rolesMiddleware(['admin', 'gerente_sede']), seriesController.deleteSerie);

module.exports = router;
