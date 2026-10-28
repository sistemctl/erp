import express = require('express');
const router = express.Router();
import geminiController = require('../controllers/gemini.controller');
import authMiddleware = require('../middleware/auth.middleware');
import rolesMiddleware = require('../middleware/roles.middleware');

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

export = router;
