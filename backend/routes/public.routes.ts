import express = require('express');
const router = express.Router();
import publicController = require('../controllers/public.controller');
import { publicLimiter } from '../middleware/rateLimit.middleware';

router.use(publicLimiter);
router.get('/reparaciones/:token', publicController.getReparacionPublica);

export = router;
