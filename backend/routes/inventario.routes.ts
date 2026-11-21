import express = require('express');
const router = express.Router();
import inventarioController = require('../controllers/inventario.controller');
import authMiddleware = require('../middleware/auth.middleware');
import rolesMiddleware = require('../middleware/roles.middleware');
import { getInversionInventario } from '../controllers/inversion-inventario.controller';

router.get('/stock', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'cajero']), inventarioController.getStockSede);
router.get('/movimientos', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'contador']), inventarioController.getMovimientos);
router.get('/inversion', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede']), getInversionInventario);
router.post('/traslado', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede']), inventarioController.trasladarMercancia);

export = router;
