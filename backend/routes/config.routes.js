const express = require('express');
const router = express.Router();
const configController = require('../controllers/config.controller');
const authMiddleware = require('../middleware/auth.middleware');
const rolesMiddleware = require('../middleware/roles.middleware');

// Rutas accesibles por usuarios autenticados
router.get('/sedes', authMiddleware, configController.getSedes);
router.get('/sistema', authMiddleware, configController.getSistemaConfig);

// Rutas restringidas a administradores
router.post('/sedes', authMiddleware, rolesMiddleware(['admin']), configController.createSede);
router.put('/sedes/:id', authMiddleware, rolesMiddleware(['admin']), configController.updateSede);
router.delete('/sedes/:id', authMiddleware, rolesMiddleware(['admin']), configController.deleteSede);

router.get('/usuarios', authMiddleware, rolesMiddleware(['admin']), configController.getUsuarios);
router.post('/usuarios', authMiddleware, rolesMiddleware(['admin']), configController.createUsuario);
router.put('/usuarios/:id', authMiddleware, rolesMiddleware(['admin']), configController.updateUsuario);
router.delete('/usuarios/:id', authMiddleware, rolesMiddleware(['admin']), configController.deleteUsuario);

router.put('/sistema', authMiddleware, rolesMiddleware(['admin']), configController.updateSistemaConfig);

router.get('/backup', authMiddleware, rolesMiddleware(['admin']), configController.exportarBackup);
router.post('/restore', authMiddleware, rolesMiddleware(['admin']), configController.importarBackup);

module.exports = router;
