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
import crypto = require('crypto');
import { startScheduler } from './jobs/scheduler';
import { migrateAuditSchema } from './migrations/audit-2026-10';
import { migrateCajaFacturasSchema } from './migrations/caja-facturas-2026-10';
import express = require('express');
import cors = require('cors');
import helmet from 'helmet';
import path = require('path');
import runtimePaths = require('./utils/runtime-paths');
const { FRONTEND_ROOT, UPLOADS_ROOT, ENV_PATH } = runtimePaths;
import models = require('./models');
const { sequelize, ConfiguracionSistema, OrdenReparacion } = models;
import auditLogMiddleware = require('./middleware/auditLog.middleware');
import errorHandler = require('./middleware/errorHandler');
import { resolveStartupPort, buildAppUrl } from './utils/server-config';
import { isAllowedCorsOrigin, getPublicOrigin } from './utils/public-url';
import { bootstrapConsumidorFinal } from './utils/consumidor-final';

require('dotenv').config({ path: ENV_PATH });

const app = express();

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    if (isAllowedCorsOrigin(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Origen no permitido por CORS: ${origin}`));
  },
  credentials: true
};

// CORS solo en /api — los módulos ES envían Origin y fallaban con 500 en assets estáticos
app.use('/api', cors(corsOptions));

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
    await sequelize.sync(allowAlter ? { alter: true } : {});
    await migrateAuditSchema(sequelize);
    await migrateCajaFacturasSchema(sequelize);
    console.log(allowAlter
      ? 'Base de datos sincronizada (con alter).'
      : 'Base de datos sincronizada (producción, sin alter).');

    try {
      await sequelize.query(`
        ALTER TABLE "OrdenesReparacion"
        ADD COLUMN IF NOT EXISTS "tokenPublico" UUID;
      `);
      await sequelize.query(`
        UPDATE "OrdenesReparacion"
        SET "tokenPublico" = gen_random_uuid()
        WHERE "tokenPublico" IS NULL;
      `).catch(async () => {
        
        
        const rows = await OrdenReparacion.findAll({ attributes: ['id', 'tokenPublico'] });
        for (const row of rows) {
          if (!row.tokenPublico) {
            await OrdenReparacion.update(
              { tokenPublico: crypto.randomUUID() },
              { where: { id: row.id } }
            );
          }
        }
      });
      await sequelize.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS ordenes_reparacion_token_publico_idx
        ON "OrdenesReparacion" ("tokenPublico");
      `).catch(() => {});
    } catch (tokenErr) {
      console.warn('No se pudo asegurar tokenPublico:', (tokenErr instanceof Error ? tokenErr.message : String(tokenErr)));
    }

    try {
      await sequelize.query(`
        ALTER TABLE "Productos"
        ADD COLUMN IF NOT EXISTS "unidadMedida" VARCHAR(8) NOT NULL DEFAULT 'und';
      `);
    } catch (uomErr) {
      console.warn('No se pudo asegurar unidadMedida en Productos:', (uomErr instanceof Error ? uomErr.message : String(uomErr)));
    }

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
