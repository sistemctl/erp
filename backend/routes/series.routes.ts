import express = require('express');
const router = express.Router();
import seriesController = require('../controllers/series.controller');
import authMiddleware = require('../middleware/auth.middleware');
import rolesMiddleware = require('../middleware/roles.middleware');

router.get('/', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede']), seriesController.getSeries);
router.post('/', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede']), seriesController.createSerie);
router.post('/bulk', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede']), seriesController.createSeriesBulk);
router.get('/:imei/historial', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'cajero', 'tecnico']), seriesController.getHistorialImei);
router.delete('/:id', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede']), seriesController.deleteSerie);

export = router;
