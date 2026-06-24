const express = require('express');
const router = express.Router();
const carteraController = require('../controllers/cartera.controller');
const authMiddleware = require('../middleware/auth.middleware');
const rolesMiddleware = require('../middleware/roles.middleware');

router.get('/', authMiddleware, rolesMiddleware(['admin', 'gerente_sede', 'contador', 'cajero']), carteraController.getCartera);
router.post('/:id/abono', authMiddleware, rolesMiddleware(['admin', 'gerente_sede', 'cajero']), carteraController.registrarAbonoCartera);

module.exports = router;
