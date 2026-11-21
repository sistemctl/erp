import express = require('express');
const router = express.Router();
import carteraController = require('../controllers/cartera.controller');
import authMiddleware = require('../middleware/auth.middleware');
import rolesMiddleware = require('../middleware/roles.middleware');

router.get('/', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'contador', 'cajero']), carteraController.getCartera);
router.post('/:id/abono', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'cajero']), carteraController.registrarAbonoCartera);
router.post('/:id/recordatorio', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'contador']), carteraController.enviarRecordatorio);

export = router;
