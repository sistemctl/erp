const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { loginLimiter } = require('../middleware/rateLimit.middleware');

router.post('/login', loginLimiter, authController.login);
router.post('/logout', authMiddleware, authController.logout);
router.get('/me', authMiddleware, authController.me);

module.exports = router;
