import express = require('express');
const router = express.Router();
import auditlogController = require('../controllers/auditlog.controller');
import authMiddleware = require('../middleware/auth.middleware');
import rolesMiddleware = require('../middleware/roles.middleware');

router.get('/', authMiddleware, rolesMiddleware(['superadmin']), auditlogController.getAuditLogs);

export = router;
