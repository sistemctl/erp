const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const reparacionesController = require('../controllers/reparaciones.controller');
const authMiddleware = require('../middleware/auth.middleware');
const rolesMiddleware = require('../middleware/roles.middleware');

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif'
};

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, '../uploads/reparaciones');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const ext = EXT_BY_MIME[file.mimetype] || '.jpg';
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error('Solo se permiten imágenes JPEG, PNG, WebP o GIF.'));
    }
    cb(null, true);
  }
});

router.get('/rentabilidad/reporte', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'contador']), reparacionesController.getRentabilidadReport);

router.get('/', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'tecnico', 'cajero']), reparacionesController.getOrdenes);
router.post('/', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'cajero']), reparacionesController.createOrden);
router.get('/:id', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'tecnico', 'cajero']), reparacionesController.getOrdenById);
router.put('/:id', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'tecnico']), reparacionesController.updateOrden);
router.put('/:id/estado', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'tecnico']), reparacionesController.updateEstado);
router.post('/:id/repuestos', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'tecnico']), reparacionesController.addRepuestos);
router.post('/:id/fotos', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'tecnico']), upload.array('fotos', 10), reparacionesController.uploadFotos);

router.get('/:id/orden-pdf', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'tecnico', 'cajero']), reparacionesController.getOrdenPdf);
router.get('/:id/etiqueta-qr', authMiddleware, rolesMiddleware(['admin', 'superadmin', 'gerente_sede', 'tecnico', 'cajero']), reparacionesController.getEtiquetaQr);

module.exports = router;
