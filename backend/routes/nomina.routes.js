const express = require('express');
const router = express.Router();
const nominaController = require('../controllers/nomina.controller');
const authMiddleware = require('../middleware/auth.middleware');
const rolesMiddleware = require('../middleware/roles.middleware');

router.get('/', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'contador']), nominaController.getNominas);
router.post('/calcular', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'contador']), nominaController.calcularNomina);
router.put('/:id/estado', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'contador']), nominaController.updateEstadoNomina);
router.delete('/:id', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'contador']), nominaController.deleteNomina);
router.get('/:id/desprendible-pdf', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'contador']), nominaController.getDesprendiblePdf);

module.exports = router;
