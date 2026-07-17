const express = require('express');
const router = express.Router();
const publicController = require('../controllers/public.controller');
const { publicLimiter } = require('../middleware/rateLimit.middleware');

router.use(publicLimiter);
router.get('/reparaciones/:token', publicController.getReparacionPublica);

module.exports = router;
