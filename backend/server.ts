import authRoutes = require('./routes/auth.routes');
import publicRoutes = require('./routes/public.routes');
import configRoutes = require('./routes/config.routes');
import dashboardRoutes = require('./routes/dashboard.routes');
import productosRoutes = require('./routes/productos.routes');
import inventarioRoutes = require('./routes/inventario.routes');
import seriesRoutes = require('./routes/series.routes');
import cajaRoutes = require('./routes/caja.routes');
import ventasRoutes = require('./routes/ventas.routes');
import reparacionesRoutes = require('./routes/reparaciones.routes');
import rmaRoutes = require('./routes/rma.routes');
import instalacionesRoutes = require('./routes/instalaciones.routes');
import clientesRoutes = require('./routes/clientes.routes');
import facturasRoutes = require('./routes/facturas.routes');
import empleadosRoutes = require('./routes/empleados.routes');
import nominaRoutes = require('./routes/nomina.routes');
import proveedoresRoutes = require('./routes/proveedores.routes');
import comprasRoutes = require('./routes/compras.routes');
import cotizacionesRoutes = require('./routes/cotizaciones.routes');
import tradeinRoutes = require('./routes/tradein.routes');
import carteraRoutes = require('./routes/cartera.routes');
import notificacionesRoutes = require('./routes/notificaciones.routes');
import auditlogRoutes = require('./routes/auditlog.routes');
import geminiRoutes = require('./routes/gemini.routes');
import analyticsRoutes = require('./routes/analytics.routes');
import { startScheduler } from './jobs/scheduler';
import { migrateAuditSchema } from './migrations/audit-2026-10';
import { migrateCajaFacturasSchema } from './migrations/caja-facturas-2026-10';
import { migrateStockSedeUnico } from './migrations/stock-sede-unico-2026-11';
import { migrateColumnasModelo } from './migrations/columnas-modelo-2026-11';
import { migrateIndicesUnicos } from './migrations/indices-unicos-2026-11';
import { migrateColumnasLegado } from './migrations/columnas-legado-2026-11';
import express = require('express');
import cors = require('cors');
import helmet from 'helmet';
import path = require('path');
import runtimePaths = require('./utils/runtime-paths');
const { FRONTEND_ROOT, UPLOADS_ROOT, ENV_PATH } = runtimePaths;
import models = require('./models');
const { sequelize, ConfiguracionSistema } = models;
import auditLogMiddleware = require('./middleware/auditLog.middleware');
import errorHandler = require('./middleware/errorHandler');
import { resolveStartupPort, buildAppUrl } from './utils/server-config';
import { isAllowedCorsOrigin, getPublicOrigin } from './utils/public-url';
import { bootstrapConsumidorFinal } from './utils/consumidor-final';
import { difundirCambios, streamEventos } from './utils/eventos';
import authMiddleware = require('./middleware/auth.middleware');

require('dotenv').config({ path: ENV_PATH });

const app = express();

// Solo se confía en X-Forwarded-For si la conexión viene de un proxy en red privada
// (Nginx local, red de Docker). Un cliente que entra directo por el puerto publicado
// no puede falsificar su IP para saltarse el límite de intentos de login.
// TRUST_PROXY permite ajustarlo (p. ej. "1", "false" o una lista de IPs/subredes).
const trustProxyEnv = (process.env.TRUST_PROXY || '').trim();
app.set('trust proxy', trustProxyEnv === ''
  ? 'loopback, linklocal, uniquelocal'
  : trustProxyEnv === 'false' ? false
  : /^\d+$/.test(trustProxyEnv) ? Number(trustProxyEnv)
  : trustProxyEnv);

// En producción un JWT_SECRET corto (o ausente) impide arrancar: con un secreto débil
// cualquiera podría falsificar sesiones de administrador.
const jwtSecret = process.env.JWT_SECRET || '';
if (process.env.NODE_ENV === 'production' && (jwtSecret.length < 32 || jwtSecret.startsWith('genera_una_clave'))) {
  console.error('[Seguridad] JWT_SECRET falta, tiene menos de 32 caracteres o es el valor de ejemplo. El servidor NO arranca en producción con un secreto débil. Genere uno con `openssl rand -hex 32`, configúrelo en el archivo .env y reinicie.');
  process.exit(1);
}

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// CORS solo en /api — los módulos ES envían Origin y fallaban con 500 en assets estáticos.
// Las peticiones del mismo origen (la propia app servida desde este host) siempre se
// permiten, aunque CORS_ORIGINS/PUBLIC_BASE_URL no estén configurados.
app.use('/api', cors((req, callback) => {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.split(',')[0].trim();
  const origin = first(req.headers.origin);
  const host = first(req.headers['x-forwarded-host']) || first(req.headers.host);
  let mismoOrigen = false;
  try { mismoOrigen = !!origin && !!host && new URL(origin).host === host; } catch { mismoOrigen = false; }
  if (mismoOrigen || isAllowedCorsOrigin(origin)) {
    return callback(null, { origin: true, credentials: true });
  }
  const error = Object.assign(new Error(`Origen no permitido por CORS: ${origin}`), { status: 403 });
  return callback(error);
}));

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
  }
  next();
});

app.use('/api/config/restore', express.json({ limit: '50mb' }));
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

// Avisos en tiempo real: canal de eventos y difusión tras cada escritura exitosa.
app.get('/api/eventos', authMiddleware, streamEventos);
app.use('/api', difundirCambios);

app.use('/api/auth', authRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/config', configRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/productos', productosRoutes);
app.use('/api/inventario', inventarioRoutes);
app.use('/api/series', seriesRoutes);
app.use('/api/caja', cajaRoutes);
app.use('/api/ventas', ventasRoutes);
app.use('/api/reparaciones', reparacionesRoutes);
app.use('/api/rma', rmaRoutes);
app.use('/api/instalaciones', instalacionesRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/facturas', facturasRoutes);
app.use('/api/empleados', empleadosRoutes);
app.use('/api/nomina', nominaRoutes);
app.use('/api/proveedores', proveedoresRoutes);
app.use('/api/compras', comprasRoutes);
app.use('/api/cotizaciones', cotizacionesRoutes);
app.use('/api/trade-in', tradeinRoutes);
app.use('/api/cartera', carteraRoutes);
app.use('/api/notificaciones', notificacionesRoutes);
app.use('/api/audit-log', auditlogRoutes);
app.use('/api/gemini', geminiRoutes);
app.use('/api/analytics', analyticsRoutes);

// Uploads estáticos: nombres de archivo opacos (UUID/random); sin listado de directorio
app.use('/uploads', express.static(UPLOADS_ROOT, {
  index: false,
  fallthrough: true
}));

// SPA assets without a bundler: avoid stale JS/CSS (browsers + CDN) after deploy
app.use(express.static(FRONTEND_ROOT, {
  setHeaders(res, filePath) {
    if (/\.html?$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      return;
    }
    if (/\.(js|mjs|css)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
    }
  }
}));

app.get('/*all', (req, res, next) => {
  if (req.url.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint no encontrado' });
  }
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.sendFile(path.join(FRONTEND_ROOT, 'index.html'));
});

app.use(errorHandler);

const startServer = async () => {
  try {
    console.log('Conectando y sincronizando base de datos PostgreSQL...');
    // Alterar el esquema solo cuando se habilita explícitamente.
    const allowAlter = process.env.DB_SYNC_ALTER === 'true';
    if (allowAlter) {
      console.warn('[BD] DB_SYNC_ALTER=true: Sequelize puede duplicar restricciones UNIQUE en cada arranque. Las columnas nuevas ya se añaden con migraciones; desactívelo tras usarlo.');
    }
    await sequelize.sync(allowAlter ? { alter: true } : {});
    await migrateAuditSchema(sequelize);
    await migrateCajaFacturasSchema(sequelize);
    await migrateStockSedeUnico(sequelize);
    await migrateColumnasModelo(sequelize);
    await migrateIndicesUnicos(sequelize);
    await migrateColumnasLegado(sequelize);
    console.log(allowAlter
      ? 'Base de datos sincronizada (con alter).'
      : 'Base de datos sincronizada (producción, sin alter).');

    try {
      await bootstrapConsumidorFinal();
    } catch (bootErr) {
      console.warn('No se pudo preparar Consumidor Final al inicio:', (bootErr instanceof Error ? bootErr.message : String(bootErr)));
    }

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
      void startScheduler().catch(error => console.error('[Scheduler] Error al iniciar:', error));
    });
  } catch (error) {
    console.error('Error al iniciar el servidor:', error);
    process.exit(1);
  }
};

startServer();
