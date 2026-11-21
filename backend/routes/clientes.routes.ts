import express = require('express');
const router = express.Router();
import clientesController = require('../controllers/clientes.controller');
import authMiddleware = require('../middleware/auth.middleware');
import rolesMiddleware = require('../middleware/roles.middleware');

router.get('/', authMiddleware, clientesController.getClientes);
router.get('/:id', authMiddleware, clientesController.getClienteById);
router.post('/', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'cajero']), clientesController.createCliente);
router.put('/:id', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'cajero']), clientesController.updateCliente);
router.delete('/:id', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede']), clientesController.deleteCliente);

export = router;
