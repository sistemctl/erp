import express = require('express');
const router = express.Router();
import authController = require('../controllers/auth.controller');
import authMiddleware = require('../middleware/auth.middleware');
import { loginLimiter } from '../middleware/rateLimit.middleware';

router.post('/login', loginLimiter, authController.login);
router.post('/logout', authMiddleware, authController.logout);
router.get('/me', authMiddleware, authController.me);

export = router;
