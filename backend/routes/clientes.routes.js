const express = require('express');
const router = express.Router();
const clientesController = require('../controllers/clientes.controller');
const authMiddleware = require('../middleware/auth.middleware');
const rolesMiddleware = require('../middleware/roles.middleware');

router.get('/', authMiddleware, clientesController.getClientes);
router.get('/:id', authMiddleware, clientesController.getClienteById);
router.post('/', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'cajero']), clientesController.createCliente);
router.put('/:id', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'cajero']), clientesController.updateCliente);
router.delete('/:id', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede']), clientesController.deleteCliente);

module.exports = router;
