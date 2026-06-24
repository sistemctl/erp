const express = require('express');
const router = express.Router();
const nominaController = require('../controllers/nomina.controller');
const authMiddleware = require('../middleware/auth.middleware');
const rolesMiddleware = require('../middleware/roles.middleware');

router.get('/', authMiddleware, rolesMiddleware(['admin', 'contador']), nominaController.getNominas);
router.post('/calcular', authMiddleware, rolesMiddleware(['admin', 'contador']), nominaController.calcularNomina);
router.put('/:id/estado', authMiddleware, rolesMiddleware(['admin', 'contador']), nominaController.updateEstadoNomina);
router.delete('/:id', authMiddleware, rolesMiddleware(['admin', 'contador']), nominaController.deleteNomina);
router.get('/:id/desprendible-pdf', authMiddleware, rolesMiddleware(['admin', 'contador']), nominaController.getDesprendiblePdf);

module.exports = router;
