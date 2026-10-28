import express = require('express');
const router = express.Router();
import tradeinController = require('../controllers/tradein.controller');
import authMiddleware = require('../middleware/auth.middleware');
import rolesMiddleware = require('../middleware/roles.middleware');

router.get('/', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'cajero', 'contador']), tradeinController.getTradeIns);
router.post('/', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'cajero']), tradeinController.registrarTradeIn);

export = router;
