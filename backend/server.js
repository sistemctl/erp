const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { sequelize } = require('./models');
const auditLogMiddleware = require('./middleware/auditLog.middleware');
const errorHandler = require('./middleware/errorHandler');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de Seguridad y Middlewares
app.use(helmet({
  contentSecurityPolicy: false, // Permitir CDNs externos (Tabler, Fonts, ChartJS)
  crossOriginEmbedderPolicy: false
}));
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Registrar el middleware de auditoría globalmente para que req.logAudit esté siempre disponible
app.use(auditLogMiddleware);

// Rutas de API
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/config', require('./routes/config.routes'));
app.use('/api/dashboard', require('./routes/dashboard.routes'));
app.use('/api/productos', require('./routes/productos.routes'));
app.use('/api/inventario', require('./routes/inventario.routes'));
app.use('/api/series', require('./routes/series.routes'));
app.use('/api/caja', require('./routes/caja.routes'));
app.use('/api/ventas', require('./routes/ventas.routes'));
app.use('/api/reparaciones', require('./routes/reparaciones.routes'));
app.use('/api/clientes', require('./routes/clientes.routes'));
app.use('/api/facturas', require('./routes/facturas.routes'));
app.use('/api/empleados', require('./routes/empleados.routes'));
app.use('/api/nomina', require('./routes/nomina.routes'));
app.use('/api/proveedores', require('./routes/proveedores.routes'));
app.use('/api/compras', require('./routes/compras.routes'));
app.use('/api/cotizaciones', require('./routes/cotizaciones.routes'));
app.use('/api/trade-in', require('./routes/tradein.routes'));
app.use('/api/cartera', require('./routes/cartera.routes'));
app.use('/api/notificaciones', require('./routes/notificaciones.routes'));
app.use('/api/audit-log', require('./routes/auditlog.routes'));

// Subida de archivos (Fotos Reparación)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Servir frontend estático
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Fallback para SPA en el frontend
app.get('/*all', (req, res, next) => {
  // Evitar interceptar peticiones de API que no existan
  if (req.url.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint no encontrado' });
  }
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// Manejador global de errores (Debe ser el último middleware)
app.use(errorHandler);

// Iniciar base de datos y servidor
const startServer = async () => {
  try {
    console.log('Conectando y sincronizando base de datos PostgreSQL...');
    await sequelize.sync({ alter: true });
    console.log('Base de datos sincronizada correctamente.');

    app.listen(PORT, () => {
      console.log(`Servidor ERP corriendo en: http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Error al iniciar el servidor:', error);
    process.exit(1);
  }
};

startServer();
