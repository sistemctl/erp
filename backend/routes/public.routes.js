const express = require('express');
const router = express.Router();
const publicController = require('../controllers/public.controller');

router.get('/reparaciones/:numeroOrden', publicController.getReparacionPublica);

module.exports = router;
