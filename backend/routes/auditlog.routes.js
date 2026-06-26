const express = require('express');
const router = express.Router();
const auditlogController = require('../controllers/auditlog.controller');
const authMiddleware = require('../middleware/auth.middleware');
const rolesMiddleware = require('../middleware/roles.middleware');

router.get('/', authMiddleware, rolesMiddleware(['admin', 'superadmin']), auditlogController.getAuditLogs);

module.exports = router;
