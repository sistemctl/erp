const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const reparacionesController = require('../controllers/reparaciones.controller');
const authMiddleware = require('../middleware/auth.middleware');
const rolesMiddleware = require('../middleware/roles.middleware');

// Configuración de Multer para almacenar fotos de reparación localmente
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, '../uploads/reparaciones');
    if (!fs.existsSync(dir)){
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// Reporte de rentabilidad (debe ir antes de /:id para no ser interpretado como parámetro)
router.get('/rentabilidad/reporte', authMiddleware, rolesMiddleware(['admin', 'gerente_sede', 'contador']), reparacionesController.getRentabilidadReport);

// Endpoints principales
router.get('/', authMiddleware, rolesMiddleware(['admin', 'gerente_sede', 'tecnico', 'cajero']), reparacionesController.getOrdenes);
router.post('/', authMiddleware, rolesMiddleware(['admin', 'gerente_sede', 'cajero']), reparacionesController.createOrden);
router.get('/:id', authMiddleware, rolesMiddleware(['admin', 'gerente_sede', 'tecnico', 'cajero']), reparacionesController.getOrdenById);
router.put('/:id', authMiddleware, rolesMiddleware(['admin', 'gerente_sede', 'tecnico']), reparacionesController.updateOrden);
router.put('/:id/estado', authMiddleware, rolesMiddleware(['admin', 'gerente_sede', 'tecnico']), reparacionesController.updateEstado);
router.post('/:id/repuestos', authMiddleware, rolesMiddleware(['admin', 'gerente_sede', 'tecnico']), reparacionesController.addRepuestos);
router.post('/:id/fotos', authMiddleware, rolesMiddleware(['admin', 'gerente_sede', 'tecnico']), upload.array('fotos', 10), reparacionesController.uploadFotos);

// Comprobantes
router.get('/:id/orden-pdf', authMiddleware, rolesMiddleware(['admin', 'gerente_sede', 'tecnico', 'cajero']), reparacionesController.getOrdenPdf);
router.get('/:id/etiqueta-qr', authMiddleware, rolesMiddleware(['admin', 'gerente_sede', 'tecnico', 'cajero']), reparacionesController.getEtiquetaQr);

module.exports = router;
