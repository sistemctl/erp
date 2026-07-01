const express = require('express');
const router = express.Router();
const geminiController = require('../controllers/gemini.controller');
const authMiddleware = require('../middleware/auth.middleware');
const rolesMiddleware = require('../middleware/roles.middleware');

router.get(
  '/status',
  authMiddleware,
  rolesMiddleware(['admin', 'superadmin', 'gerente_sede']),
  geminiController.getStatus
);

router.post(
  '/generate',
  authMiddleware,
  rolesMiddleware(['admin', 'superadmin', 'gerente_sede']),
  geminiController.generate
);

router.post(
  '/chat',
  authMiddleware,
  rolesMiddleware(['admin', 'superadmin', 'gerente_sede']),
  geminiController.chat
);

module.exports = router;
