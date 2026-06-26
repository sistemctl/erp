const express = require('express');
const router = express.Router();
const configController = require('../controllers/config.controller');
const authMiddleware = require('../middleware/auth.middleware');
const rolesMiddleware = require('../middleware/roles.middleware');

// Rutas accesibles por usuarios autenticados
router.get('/sedes', authMiddleware, configController.getSedes);
router.get('/sistema', authMiddleware, configController.getSistemaConfig);

// Rutas restringidas a administradores
router.post('/sedes', authMiddleware, rolesMiddleware(['superadmin']), configController.createSede);
router.put('/sedes/:id', authMiddleware, rolesMiddleware(['superadmin']), configController.updateSede);
router.delete('/sedes/:id', authMiddleware, rolesMiddleware(['superadmin']), configController.deleteSede);

router.get('/usuarios', authMiddleware, rolesMiddleware(['superadmin']), configController.getUsuarios);
router.post('/usuarios', authMiddleware, rolesMiddleware(['superadmin']), configController.createUsuario);
router.put('/usuarios/:id', authMiddleware, rolesMiddleware(['superadmin']), configController.updateUsuario);
router.delete('/usuarios/:id', authMiddleware, rolesMiddleware(['superadmin']), configController.deleteUsuario);

router.put('/sistema', authMiddleware, rolesMiddleware(['superadmin']), configController.updateSistemaConfig);

router.get('/backup', authMiddleware, rolesMiddleware(['superadmin']), configController.exportarBackup);
router.post('/restore', authMiddleware, rolesMiddleware(['superadmin']), configController.importarBackup);

module.exports = router;
