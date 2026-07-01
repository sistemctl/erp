const express = require('express');
const router = express.Router();
const tradeinController = require('../controllers/tradein.controller');
const authMiddleware = require('../middleware/auth.middleware');
const rolesMiddleware = require('../middleware/roles.middleware');

router.get('/', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'cajero', 'contador']), tradeinController.getTradeIns);
router.post('/', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'cajero']), tradeinController.registrarTradeIn);

module.exports = router;
