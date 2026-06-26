const express = require('express');
const router = express.Router();
const productosController = require('../controllers/productos.controller');
const authMiddleware = require('../middleware/auth.middleware');
const rolesMiddleware = require('../middleware/roles.middleware');
const multer = require('multer');

// Subida a memoria para CSV
const upload = multer({ storage: multer.memoryStorage() });

// Consultas permitidas a todos los roles autenticados
router.get('/', authMiddleware, productosController.getProductos);
router.get('/categorias', authMiddleware, productosController.getCategorias);
router.get('/barcode/:codigo', authMiddleware, productosController.getProductoByBarcode);

// Rutas de administración de catálogo
router.post('/categorias', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede']), productosController.createCategoria);
router.delete('/categorias/:id', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede']), productosController.deleteCategoria);
router.post('/', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede']), productosController.createProducto);
router.put('/:id', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede']), productosController.updateProducto);
router.delete('/:id', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede']), productosController.deleteProducto);

// Importar catálogo por CSV
router.post('/importar-csv', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede']), upload.single('archivo'), productosController.importarCSV);

module.exports = router;
