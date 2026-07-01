const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { sequelize, ConfiguracionSistema } = require('./models');
const auditLogMiddleware = require('./middleware/auditLog.middleware');
const errorHandler = require('./middleware/errorHandler');
const { resolveStartupPort, buildAppUrl } = require('./utils/server-config');
const { isAllowedCorsOrigin, getPublicOrigin } = require('./utils/public-url');

require('dotenv').config();

const app = express();

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin(origin, callback) {
    if (isAllowedCorsOrigin(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Origen no permitido por CORS: ${origin}`));
  },
  credentials: true
}));

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
  }
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(auditLogMiddleware);

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    puerto: req.app.get('puertoActivo'),
    urlPublica: getPublicOrigin(req)
  });
});

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
app.use('/api/gemini', require('./routes/gemini.routes'));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.get('/*all', (req, res, next) => {
  if (req.url.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint no encontrado' });
  }
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

app.use(errorHandler);

const startServer = async () => {
  try {
    console.log('Conectando y sincronizando base de datos PostgreSQL...');
    await sequelize.sync({ alter: true });
    console.log('Base de datos sincronizada correctamente.');

    const PORT = await resolveStartupPort(ConfiguracionSistema);
    app.set('puertoActivo', PORT);

    app.listen(PORT, '0.0.0.0', () => {
      const local = buildAppUrl(PORT);
      console.log(`Servidor ERP corriendo en: ${local}`);
      if (process.env.PUBLIC_BASE_URL) {
        console.log(`URL pública configurada: ${process.env.PUBLIC_BASE_URL}`);
      } else {
        console.log('Túnel Cloudflare: cloudflared tunnel --url http://127.0.0.1:' + PORT);
      }
    });
  } catch (error) {
    console.error('Error al iniciar el servidor:', error);
    process.exit(1);
  }
};

startServer();
