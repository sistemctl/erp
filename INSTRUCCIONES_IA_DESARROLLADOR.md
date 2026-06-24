# 🤖 INSTRUCCIONES PARA IA DESARROLLADORA — ERP TechStore Colombia

> **IMPORTANTE:** Este archivo es una guía de implementación técnica dirigida a una IA que va a escribir el código del proyecto. Léelo completo antes de empezar. Ejecuta UNA FASE a la vez. No pases a la siguiente fase hasta que la anterior esté completa y funcional.
>
> **Referencia completa del plan:** `c:\erpnext\Plan_ERP_TechStore.md`
> **Versión:** 2.0 — Incluye Tabler Bootstrap 5 y correcciones del análisis crítico

---

## 📌 CONTEXTO DEL PROYECTO

Estás construyendo un **sistema ERP completo** para una tienda de tecnología en Colombia. La tienda vende y repara computadores, iPhones, PlayStation, consolas y accesorios. Tiene ~15 empleados y 3 o más sedes.

- **Moneda:** COP (pesos colombianos)
- **Impuesto:** IVA 19% (configurable)
- **Sin integración DIAN** (facturación interna solamente)
- **Carpeta raíz:** `c:\erpnext\`
- **Backend en:** `c:\erpnext\backend\`
- **Frontend en:** `c:\erpnext\frontend\`
- **Acceso:** `http://localhost:3000` (backend sirve el frontend)

---

## 🛠️ STACK TECNOLÓGICO — NO CAMBIAR

### Backend
| Librería | Uso |
|----------|-----|
| Node.js (v18+) | Runtime |
| Express.js | Framework REST API |
| PostgreSQL | Base de datos (OBLIGATORIO, no SQLite) |
| Sequelize + sequelize-cli | ORM + migraciones |
| pg + pg-hstore | Driver PostgreSQL + serialización hstore |
| jsonwebtoken | JWT para auth |
| bcryptjs | Hash de contraseñas |
| dotenv | Variables de entorno |
| Multer | Subida de fotos |
| PDFKit | Generación de PDFs |
| node-cron | Tareas programadas |
| Twilio | SMS y WhatsApp |
| qrcode | Generar códigos QR |
| cors, helmet | Seguridad |
| uuid | IDs únicos |

### Frontend
- **Tabler (Bootstrap 5)** — Design system base: layout, componentes, dark/light mode nativo
- **Tabler Icons** — 6,000+ íconos SVG (NO usar Lucide Icons)
- **Google Fonts — Inter** — Tipografía
- **Chart.js (CDN)** — Gráficas del dashboard
- **Vanilla JavaScript ES6+** — Toda la lógica del frontend (NO usar React, Vue ni Angular)
- **Fetch API** — Comunicación con el backend REST

---

## 📁 ESTRUCTURA DE CARPETAS A CREAR

```
c:\erpnext\
├── backend\
│   ├── server.js                  ← Express + sirve frontend estático
│   ├── .env
│   ├── package.json
│   ├── config\
│   │   ├── database.js
│   │   └── config.js
│   ├── models\
│   │   ├── index.js
│   │   ├── Usuario.js
│   │   ├── Sede.js
│   │   ├── Producto.js
│   │   ├── Categoria.js
│   │   ├── StockSede.js
│   │   ├── NumeroSerie.js
│   │   ├── Cliente.js
│   │   ├── Venta.js
│   │   ├── ItemVenta.js
│   │   ├── PagoVenta.js
│   │   ├── Cotizacion.js
│   │   ├── ItemCotizacion.js
│   │   ├── OrdenReparacion.js
│   │   ├── FotoReparacion.js
│   │   ├── RepuestoOrden.js
│   │   ├── RentabilidadReparacion.js
│   │   ├── EgresoCaja.js
│   │   ├── CategoriaEgreso.js
│   │   ├── TradeIn.js
│   │   ├── Empleado.js
│   │   ├── Nomina.js
│   │   ├── Proveedor.js
│   │   ├── OrdenCompra.js
│   │   ├── ItemOrdenCompra.js
│   │   ├── MovimientoInventario.js
│   │   ├── Caja.js
│   │   ├── Factura.js
│   │   ├── Abono.js
│   │   ├── CuentaPorCobrar.js
│   │   ├── Notificacion.js
│   │   ├── ConfiguracionSistema.js
│   │   └── AuditLog.js
│   ├── routes\
│   │   ├── auth.routes.js
│   │   ├── dashboard.routes.js
│   │   ├── productos.routes.js
│   │   ├── inventario.routes.js
│   │   ├── series.routes.js
│   │   ├── ventas.routes.js
│   │   ├── reparaciones.routes.js
│   │   ├── facturacion.routes.js
│   │   ├── clientes.routes.js
│   │   ├── nomina.routes.js
│   │   ├── empleados.routes.js
│   │   ├── compras.routes.js
│   │   ├── proveedores.routes.js
│   │   ├── caja.routes.js
│   │   ├── config.routes.js
│   │   ├── cotizaciones.routes.js
│   │   ├── tradein.routes.js
│   │   ├── cartera.routes.js
│   │   ├── notificaciones.routes.js
│   │   ├── analytics.routes.js
│   │   └── auditlog.routes.js
│   ├── controllers\      (un .js por cada route)
│   ├── middleware\
│   │   ├── auth.middleware.js
│   │   ├── roles.middleware.js
│   │   ├── auditLog.middleware.js
│   │   └── errorHandler.js
│   ├── uploads\reparaciones\
│   ├── migrations\
│   └── seeders\
│
└── frontend\
    ├── index.html
    ├── assets\
    │   ├── css\
    │   │   ├── tabler.min.css        ← Design system Tabler
    │   │   ├── tabler-icons.min.css  ← Íconos Tabler
    │   │   └── custom.css            ← Overrides y estilos específicos del ERP
    │   ├── js\
    │   │   ├── tabler.min.js         ← JS de Tabler (Bootstrap 5)
    │   │   ├── app.js
    │   │   ├── api.js
    │   │   ├── auth.js
    │   │   ├── modules\
    │   │   │   ├── dashboard.js
    │   │   │   ├── pos.js
    │   │   │   ├── reparaciones.js
    │   │   │   ├── rentabilidad.js    ← Análisis rentabilidad reparaciones
    │   │   │   ├── inventario.js
    │   │   │   ├── series.js          ← Gestión series/IMEI/lotes
    │   │   │   ├── facturacion.js
    │   │   │   ├── ventas.js
    │   │   │   ├── clientes.js
    │   │   │   ├── nomina.js
    │   │   │   ├── compras.js
    │   │   │   ├── caja.js
    │   │   │   ├── cotizaciones.js
    │   │   │   ├── tradein.js
    │   │   │   ├── cartera.js
    │   │   │   ├── auditlog.js
    │   │   │   └── config.js
    │   │   └── utils\
    │   │       ├── barcode.js
    │   │       ├── formatters.js
    │   │       └── ui.js
    │   └── images\
    └── lib\
```

---

## 🗄️ ESTRATEGIA DE MIGRACIONES

> **En desarrollo:** Usar `sequelize.sync({ alter: true })` en `server.js` para crear/actualizar tablas automáticamente. Esto evita crear 30 archivos de migración manual.
>
> **En producción:** Cuando el sistema esté estable, generar migraciones definitivas con `npx sequelize-cli migration:generate` y usar `db:migrate`.

---

## 🌐 ESTRATEGIA CORS Y SERVIR FRONTEND

> **El backend sirve el frontend.** En `server.js` agregar:
> ```javascript
> app.use(express.static(path.join(__dirname, '..', 'frontend')));
> ```
> Esto sirve `frontend/index.html` desde `http://localhost:3000/` directamente.
> No se necesita Live Server. No hay problemas de CORS.
>
> CORS se configura como fallback para posibles clientes externos:
> ```javascript
> app.use(cors({ origin: ['http://localhost:3000'], credentials: true }));
> ```

---

## 🗄️ MODELOS DE BASE DE DATOS (campos exactos)

> Todos los modelos usan `timestamps: true`. Los IDs son UUID v4.
> Los campos de dinero son `DECIMAL(15, 2)` para soportar COP.
> **`DetalleNomina` NO es un modelo separado** — los campos de detalle van dentro de `Nomina`.
> **`CierreCaja` NO es un modelo separado** — los campos de cierre van dentro de `Caja`.

```javascript
// Sede
{ id: UUID, nombre: STRING, direccion: STRING, telefono: STRING, activa: BOOLEAN }

// Usuario
{ id: UUID, nombre: STRING, email: STRING(unique), password: STRING(bcrypt),
  rol: ENUM('admin','gerente_sede','cajero','tecnico','contador'),
  sedeId: FK(Sede), activo: BOOLEAN }

// Categoria
{ id: UUID, nombre: STRING, descripcion: STRING }

// Producto
{ id: UUID, nombre: STRING, codigoBarras: STRING(unique), descripcion: TEXT,
  precioVenta: DECIMAL, precioCosto: DECIMAL, tieneIVA: BOOLEAN,
  stockMinimo: INTEGER, tieneNumeroSerie: BOOLEAN, esReacondicionado: BOOLEAN,
  categoriaId: FK(Categoria), activo: BOOLEAN }

// StockSede (tabla pivote producto-sede)
{ id: UUID, productoId: FK(Producto), sedeId: FK(Sede), cantidad: INTEGER }

// NumeroSerie
{ id: UUID, serie: STRING(unique), productoId: FK(Producto), sedeId: FK(Sede),
  estado: ENUM('en_stock','vendido','en_reparacion','reacondicionado'),
  clienteId: FK(Cliente, nullable), fechaVenta: DATE(nullable) }

// Cliente
{ id: UUID, nombre: STRING, telefono: STRING, email: STRING,
  documento: STRING, direccion: STRING, sedeId: FK(Sede) }

// Venta
{ id: UUID, numeroVenta: STRING, clienteId: FK(Cliente, nullable),
  usuarioId: FK(Usuario), sedeId: FK(Sede),
  subtotal: DECIMAL, descuentoTotal: DECIMAL, iva: DECIMAL, total: DECIMAL,
  esCredito: BOOLEAN, saldoPendiente: DECIMAL,
  estado: ENUM('completada','credito','anulada'), observaciones: TEXT }

// ItemVenta
{ id: UUID, ventaId: FK(Venta), productoId: FK(Producto),
  cantidad: INTEGER, precioBase: DECIMAL, precioModificado: DECIMAL,
  descuentoPct: DECIMAL(5,2), iva: DECIMAL, subtotal: DECIMAL,
  autorizadoPorAdmin: BOOLEAN }

// PagoVenta (pagos mixtos por venta)
{ id: UUID, ventaId: FK(Venta),
  metodo: ENUM('efectivo','tarjeta','nequi','daviplata','transferencia'),
  monto: DECIMAL }

// Cotizacion
{ id: UUID, numeroCotizacion: STRING, clienteId: FK(Cliente),
  usuarioId: FK(Usuario), sedeId: FK(Sede), total: DECIMAL,
  estado: ENUM('borrador','enviada','aprobada','rechazada','expirada'),
  fechaVencimiento: DATE, notas: TEXT }

// ItemCotizacion
{ id: UUID, cotizacionId: FK(Cotizacion), descripcion: STRING,
  cantidad: INTEGER, precioUnitario: DECIMAL, subtotal: DECIMAL }

// OrdenReparacion
{ id: UUID, numeroOrden: STRING, clienteId: FK(Cliente),
  tecnicoId: FK(Usuario), sedeId: FK(Sede),
  tipoEquipo: STRING, marca: STRING, modelo: STRING, imei: STRING,
  problemaReportado: TEXT, diagnostico: TEXT,
  costoManoObra: DECIMAL, costoRepuestos: DECIMAL, totalCobrado: DECIMAL,
  estado: ENUM('recibido','diagnostico','en_reparacion','listo','entregado','cancelado'),
  diasGarantia: INTEGER, fechaEstimadaEntrega: DATE,
  observaciones: TEXT, notificacionEnviada: BOOLEAN }

// FotoReparacion
{ id: UUID, ordenId: FK(OrdenReparacion), url: STRING,
  momento: ENUM('recepcion','entrega') }

// RepuestoOrden (al guardar, descontar del stock automáticamente)
{ id: UUID, ordenId: FK(OrdenReparacion), productoId: FK(Producto),
  cantidad: INTEGER, costoUnitario: DECIMAL }

// RentabilidadReparacion (campos definidos por diseño — no están en el doc original)
{ id: UUID, ordenId: FK(OrdenReparacion),
  costoReal: DECIMAL, totalCobrado: DECIMAL, margen: DECIMAL }

// TradeIn
{ id: UUID, clienteId: FK(Cliente), sedeId: FK(Sede), usuarioId: FK(Usuario),
  tipoEquipo: STRING, marca: STRING, modelo: STRING, imei: STRING,
  estadoFisico: ENUM('excelente','bueno','regular','malo'),
  valoracion: DECIMAL, ventaId: FK(Venta, nullable),
  productoInventarioId: FK(Producto, nullable) }

// CategoriaEgreso
{ id: UUID, nombre: STRING, descripcion: STRING, activa: BOOLEAN }

// EgresoCaja
{ id: UUID, cajaId: FK(Caja), usuarioId: FK(Usuario),
  categoriaId: FK(CategoriaEgreso), monto: DECIMAL, motivo: TEXT,
  requirioPin: BOOLEAN, autorizadoPor: FK(Usuario, nullable) }

// Caja (incluye campos de apertura Y cierre — no hay modelo CierreCaja separado)
{ id: UUID, sedeId: FK(Sede), usuarioAperturaId: FK(Usuario),
  montoApertura: DECIMAL, fecha: DATEONLY,
  estado: ENUM('abierta','cerrada'),
  usuarioCierreId: FK(Usuario, nullable), horaCierre: DATE,
  totalVentasEfectivo: DECIMAL, totalVentasNequi: DECIMAL,
  totalVentasDaviplata: DECIMAL, totalVentasTarjeta: DECIMAL,
  totalVentasTransferencia: DECIMAL,
  totalEgresos: DECIMAL, diferencia: DECIMAL, observaciones: TEXT }

// Factura
{ id: UUID, numeroFactura: STRING, ventaId: FK(Venta, nullable),
  ordenReparacionId: FK(OrdenReparacion, nullable),
  clienteId: FK(Cliente), sedeId: FK(Sede),
  subtotal: DECIMAL, iva: DECIMAL, total: DECIMAL,
  estado: ENUM('pagada','pendiente','vencida','abono_parcial'),
  fechaVencimiento: DATE }

// CuentaPorCobrar
{ id: UUID, facturaId: FK(Factura), clienteId: FK(Cliente),
  totalOriginal: DECIMAL, totalAbonado: DECIMAL, saldoPendiente: DECIMAL,
  fechaVencimiento: DATE, estado: ENUM('al_dia','vencida','pagada') }

// Abono
{ id: UUID, cuentaPorCobrarId: FK(CuentaPorCobrar), usuarioId: FK(Usuario),
  monto: DECIMAL,
  metodo: ENUM('efectivo','tarjeta','nequi','daviplata','transferencia'),
  observaciones: STRING }

// Empleado
{ id: UUID, usuarioId: FK(Usuario, nullable), nombre: STRING, documento: STRING,
  telefono: STRING, email: STRING, cargo: STRING, sedeId: FK(Sede),
  tipoContrato: ENUM('indefinido','fijo','prestacion_servicios'),
  salarioBase: DECIMAL, auxilioTransporte: BOOLEAN, fechaIngreso: DATE,
  activo: BOOLEAN, cuentaBancaria: STRING, banco: STRING }

// Nomina (incluye todos los campos de detalle — no hay modelo DetalleNomina separado)
{ id: UUID, empleadoId: FK(Empleado), periodo: STRING,
  tipoPeriodo: ENUM('quincenal','mensual'),
  salarioBase: DECIMAL, auxilioTransporte: DECIMAL,
  horasExtra: DECIMAL, recargosNocturnos: DECIMAL, dominicales: DECIMAL, bonos: DECIMAL,
  deduccionEPS: DECIMAL, deduccionPension: DECIMAL, deduccionPrestamos: DECIMAL,
  totalDevengado: DECIMAL, totalDeducciones: DECIMAL, neto: DECIMAL,
  estado: ENUM('borrador','aprobada','pagada') }

// Proveedor
{ id: UUID, nombre: STRING, nit: STRING, contacto: STRING,
  telefono: STRING, email: STRING, banco: STRING, cuentaBancaria: STRING, activo: BOOLEAN }

// OrdenCompra
{ id: UUID, proveedorId: FK(Proveedor), usuarioId: FK(Usuario),
  sedeId: FK(Sede), total: DECIMAL,
  estado: ENUM('pendiente','recibida','parcial','cancelada'),
  fechaEsperada: DATE, observaciones: TEXT }

// ItemOrdenCompra (al recibir, sumar al stock automáticamente)
{ id: UUID, ordenCompraId: FK(OrdenCompra), productoId: FK(Producto),
  cantidadPedida: INTEGER, cantidadRecibida: INTEGER, precioUnitario: DECIMAL }

// MovimientoInventario
{ id: UUID, productoId: FK(Producto), sedeId: FK(Sede),
  tipo: ENUM('entrada','salida','traslado_entrada','traslado_salida','ajuste'),
  cantidad: INTEGER, motivo: STRING, referenciaId: UUID, usuarioId: FK(Usuario) }

// Notificacion
{ id: UUID, ordenReparacionId: FK(OrdenReparacion), clienteId: FK(Cliente),
  canal: ENUM('sms','whatsapp'), mensaje: TEXT,
  estado: ENUM('enviado','fallido','pendiente'), errorDetalle: STRING }

// AuditLog
{ id: UUID, usuarioId: FK(Usuario),
  accion: ENUM('CREATE','UPDATE','DELETE','LOGIN','PRICE_OVERRIDE','EGRESO_CAJA'),
  modulo: STRING, registroId: STRING,
  valorAnterior: JSONB, valorNuevo: JSONB,
  sedeId: FK(Sede, nullable), ip: STRING }

// ConfiguracionSistema (solo un registro global)
{ id: UUID, empresa: STRING, logoUrl: STRING, nit: STRING,
  direccion: STRING, telefono: STRING,
  descuentoMaximoPct: DECIMAL(5,2),
  egresoMaximoSinPin: DECIMAL(15,2),
  notificacionesActivas: BOOLEAN,
  smsActivo: BOOLEAN, whatsappActivo: BOOLEAN,
  twilioAccountSid: STRING, twilioAuthToken: STRING, twilioFromNumber: STRING,
  ivaDefecto: DECIMAL(5,2) }
```

---

## 🔐 AUTENTICACIÓN Y ROLES

### JWT Payload
```javascript
{ userId: UUID, nombre: STRING, rol: STRING, sedeId: UUID }
```

### Middleware de Auth
```javascript
// middleware/auth.middleware.js
const jwt = require('jsonwebtoken');
module.exports = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    req.usuario = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
};
```

### Middleware de Roles
```javascript
// middleware/roles.middleware.js
module.exports = (rolesPermitidos) => (req, res, next) => {
  if (!rolesPermitidos.includes(req.usuario.rol))
    return res.status(403).json({ error: 'Sin permisos' });
  next();
};
// Uso: router.get('/ruta', authMiddleware, roles(['admin', 'cajero']), controller)
```

### Tabla de permisos por módulo
| Módulo | admin | gerente | cajero | tecnico | contador |
|--------|-------|---------|--------|---------|----------|
| POS / Ventas | ✅ | ✅ | ✅ | ❌ | ❌ |
| Reparaciones | ✅ | ✅ | ❌ | ✅ | ❌ |
| Inventario | ✅ | ✅ | 👁️ ver | ❌ | ❌ |
| Facturación | ✅ | ✅ | ✅ | ❌ | ✅ |
| Nómina | ✅ | ❌ | ❌ | ❌ | ✅ |
| Compras | ✅ | ✅ | ❌ | ❌ | ✅ |
| Caja | ✅ | ✅ | ✅ | ❌ | ✅ |
| Analítica | ✅ | ✅ | ❌ | ❌ | ✅ |
| Configuración | ✅ | ❌ | ❌ | ❌ | ❌ |
| Audit Log | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## 💲 REGLA: PRICE OVERRIDE (precio por transacción)

1. El precio base del producto en el catálogo **NUNCA cambia**.
2. `ItemVenta` guarda `precioBase`, `precioModificado` y `descuentoPct`.
3. Si `descuentoPct > config.descuentoMaximoPct` → rechazar y pedir PIN del Admin.
4. Si `precioModificado < producto.precioCosto` → alerta roja en pantalla: *"Estás vendiendo a pérdida"*.
5. Precio bajo costo → requiere PIN Admin → guardar `autorizadoPorAdmin: true`.
6. Registrar en AuditLog: acción `PRICE_OVERRIDE`, valor anterior y nuevo.

## 💵 REGLA: EGRESO DE CAJA

1. El cajero ingresa: monto, categoría (de CategoriaEgreso), motivo (OBLIGATORIO).
2. Si `monto > config.egresoMaximoSinPin` → requerir PIN del Admin.
3. Al guardar: descontar del saldo de la Caja abierta de esa sede.
4. Registrar en AuditLog: acción `EGRESO_CAJA`.

## 📲 REGLA: NOTIFICACIONES

1. Solo enviar si `config.notificacionesActivas === true`.
2. Al cambiar estado de OrdenReparacion → buscar plantilla del evento → reemplazar variables → enviar.
3. Variables disponibles: `{nombre}`, `{equipo}`, `{orden}`, `{sede}`.
4. Guardar en modelo `Notificacion` con estado `enviado` o `fallido`.

---

## 🎨 DISEÑO VISUAL — TABLER BOOTSTRAP 5

- **Design system:** Tabler (Bootstrap 5) — dark/light mode nativo
- **Tema por defecto:** Modo Claro ☀️
- **Toggle dark mode:** en topbar, nativo de Tabler
- **Paleta Claro:** fondo `#F8FAFC`, sidebar `#FFFFFF`, acento `#2563EB`, texto `#1E293B`
- **Paleta Oscuro:** fondo `#0F172A`, sidebar `#1E293B`, acento `#3B82F6`, texto `#F1F5F9`
- **Fuente:** Inter (Google Fonts)
- **Íconos:** Tabler Icons (6,000+ SVG)
- **Layout:** sidebar fijo 240px + topbar + área principal (layout nativo de Tabler)
- **Cards:** componentes Tabler stat cards, border-radius 12px
- **El diseño DEBE ser premium y profesional** — usar componentes Tabler nativos

---

## ⚙️ ARCHIVO .env DEL BACKEND

```env
NODE_ENV=development
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=erp_techstore
DB_USER=postgres
DB_PASS=tu_contraseña_aqui
JWT_SECRET=clave_muy_larga_y_segura_minimo_32_caracteres
JWT_EXPIRES_IN=8h
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
UPLOAD_DIR=uploads/reparaciones
```

---

## 🚀 LAS 12 FASES — INSTRUCCIONES EXACTAS PARA EL DESARROLLADOR

---

### FASE 0 — Verificación e Instalación de Prerrequisitos
**Objetivo:** Asegurar que todas las herramientas están instaladas antes de empezar.

> Esta fase se ejecuta primero y siempre. Si una herramienta ya está instalada, omitir el paso. Si no está, instalarla.

**Pasos:**
1. Verificar Node.js v18+: `node --version` → si falla, descargar desde https://nodejs.org/en/download
2. Verificar npm: `npm --version` → si falla, reinstalar Node.js
3. Verificar PostgreSQL: `psql --version` → si falla, descargar desde https://www.postgresql.org/download/windows/
4. Crear BD si no existe: `psql -U postgres -c "\l" | findstr erp_techstore` → si no aparece: `psql -U postgres -c "CREATE DATABASE erp_techstore;"`
5. Verificar nodemon: `nodemon --version` → si falla: `npm install -g nodemon`
6. Verificar sequelize-cli: `npx sequelize-cli --version` → si falla: `npm install -g sequelize-cli`
7. Verificar Git: `git --version` → si falla, descargar desde https://git-scm.com/download/win
8. Generar archivo `.env` — preguntar al usuario la contraseña de PostgreSQL y el JWT secret

**Verificar antes de pasar a Fase 1:**
- `node --version` → v18+
- `psql --version` → cualquier versión
- BD `erp_techstore` existe
- `nodemon --version` → cualquier versión

---

### FASE 1 — Backend Base + Auth (2 días)
**Objetivo:** Servidor funcionando, BD con todas las tablas, login JWT.

**Pasos:**
1. `npm init -y` en `c:\erpnext\backend\`
2. Instalar: `express sequelize pg pg-hstore bcryptjs jsonwebtoken dotenv multer pdfkit node-cron twilio qrcode cors helmet uuid`
3. Dev: `nodemon sequelize-cli`
4. Crear `.env` con las variables de arriba
5. Crear `config/database.js` → configuración Sequelize+PostgreSQL
6. Crear **TODOS** los modelos del listado anterior
7. Usar `sequelize.sync({ alter: true })` en `server.js` para crear las tablas automáticamente en desarrollo
8. Crear `middleware/auth.middleware.js` y `middleware/roles.middleware.js`
9. Crear `middleware/auditLog.middleware.js` — intercepta CREATE/UPDATE/DELETE y guarda en AuditLog
10. Crear `routes/auth.routes.js`:
    - `POST /api/auth/login` → email+password → JWT
    - `POST /api/auth/logout` → invalida sesión en frontend
    - `GET /api/auth/me` → datos del usuario actual
11. Crear `routes/config.routes.js` → CRUD sedes, usuarios, ConfiguracionSistema
12. Crear seeders con datos de prueba:
    - 3 sedes, 5 usuarios (uno por rol), 10 categorías, 20 productos, 5 categorías de egreso
13. Crear `server.js`:
    - Registrar todas las rutas en `/api/*`
    - Servir frontend estático: `app.use(express.static(path.join(__dirname, '..', 'frontend')))`
    - `sequelize.sync({ alter: true })` antes de `app.listen()`

**Verificar antes de pasar a Fase 2:**
- `npm run dev` arranca sin errores
- `http://localhost:3000/` sirve archivos del frontend
- `POST /api/auth/login` retorna JWT válido
- `GET /api/auth/me` con Bearer token retorna usuario

---

### FASE 2 — Frontend Base + Dashboard con Tabler (1.5 días)
**Objetivo:** Interfaz Tabler con login y dashboard con KPIs reales.

**Pasos:**
1. Crear `frontend/index.html` con:
   - Tabler CSS y Tabler Icons en el `<head>` (CDN o archivos locales)
   - Google Fonts Inter en el `<head>`
   - Chart.js CDN en el `<head>`
   - `<div id="app">` como contenedor principal
   - `<script src="assets/js/tabler.min.js">`
   - `<script type="module" src="assets/js/app.js">`
2. Crear `assets/css/custom.css`:
   - Variables CSS para colores del ERP (acento `#2563EB` / modo oscuro `#3B82F6`)
   - Override de sidebar a 240px fijo
   - Componentes específicos: badge de estado, semáforo de stock, Kanban board
3. Crear `assets/js/api.js`:
   - `apiFetch(endpoint, options)` que agrega JWT automáticamente
   - Maneja error 401 → redirige a login
4. Crear `assets/js/auth.js`:
   - `login(email, password)` → POST login → guarda JWT en localStorage
   - `logout()` → borra localStorage → redirige a login
5. Crear `assets/js/app.js`:
   - Router SPA basado en `window.location.hash`
   - Renderiza sidebar Tabler con íconos (solo módulos que el rol puede ver)
   - Renderiza topbar (usuario actual, sede, toggle dark mode nativo Tabler, logout)
6. Crear `assets/js/modules/dashboard.js`:
   - Llama a `GET /api/dashboard/kpis` y `GET /api/dashboard/graficas/ventas`
   - Muestra 8 tarjetas KPI usando Tabler stat cards
   - Gráfica de línea con ventas últimos 7 días (Chart.js)
7. Crear `routes/dashboard.routes.js` en backend:
   - `GET /api/dashboard/kpis?sede=&periodo=`
   - `GET /api/dashboard/graficas/ventas`

**Verificar antes de pasar a Fase 3:**
- Abrir `http://localhost:3000/` → login funcional
- Dashboard muestra KPIs con datos reales
- Toggle dark mode de Tabler funciona

---

### FASE 3 — Inventario + POS + Caja (2.5 días)
**Objetivo:** Poder vender productos y controlar la caja.

**Backend:**
- `routes/productos.routes.js` → CRUD + `GET /api/productos/barcode/:codigo` + `POST /api/productos/importar-csv` (carga masiva)
- `routes/inventario.routes.js` → stock por sede, traslados, movimientos
- `routes/series.routes.js`:
  - `GET /api/series?producto=`
  - `POST /api/series`
  - `GET /api/series/:imei/historial`
- `routes/ventas.routes.js` → crear venta, pagos mixtos, abonos, price override
  - `GET /api/ventas/descuentos` → reporte de descuentos aplicados
- `routes/caja.routes.js` → apertura, cierre, egresos con motivo y categoría
  - `POST /api/caja/egreso`
  - `GET /api/caja/egresos?sede=&fecha=`

**Frontend:**
- `modules/inventario.js` → tabla de productos con semáforo stock, crear/editar/trasladar, botón importar CSV
- `modules/series.js` → tabla de series/IMEI por producto, historial por IMEI
- `modules/pos.js`:
  - Panel de búsqueda de productos (por nombre o código de barras)
  - Carrito con items editables (price override)
  - Modal de cobro con métodos de pago mixtos (efectivo, tarjeta, Nequi, Daviplata, transferencia)
  - Botón "Egreso de Caja" → modal con monto, categoría, motivo
  - Botón "Abrir/Cerrar Caja"
- `utils/barcode.js` → detecta input de lector USB HID

**Verificar:**
- Venta completa desde POS hasta ticket generado
- Series/IMEI se registran al vender producto con `tieneNumeroSerie: true`
- Importar CSV funciona

---

### FASE 4 — Órdenes de Reparación (2 días)
**Objetivo:** Gestión del taller completa.

> **IMPORTANTE:** Twilio NO se integra en esta fase. El cambio de estado solo marca `notificacionEnviada: false`. La integración real con Twilio se hace en la Fase 10.

**Backend:**
- `routes/reparaciones.routes.js`:
  - CRUD órdenes
  - `PUT /api/reparaciones/:id/estado` → cambia estado, marca `notificacionEnviada: false` *(Twilio en Fase 10)*
  - `POST /api/reparaciones/:id/fotos` → Multer
  - `GET /api/reparaciones/:id/orden-pdf` → PDFKit
  - `GET /api/reparaciones/:id/etiqueta-qr` → qrcode npm
  - `POST /api/reparaciones/:id/repuestos` → descuenta del stock automáticamente
  - Cálculo de `RentabilidadReparacion` al guardar repuestos o cambiar costos

**Frontend:**
- `modules/reparaciones.js`:
  - Vista Kanban por estado (6 columnas: recibido → diagnóstico → en_reparacion → listo → entregado → cancelado)
  - Formulario nueva orden (cliente, equipo, IMEI, técnico, costo, fecha estimada, fotos)
  - Modal detalle (cambiar estado, agregar repuestos, ver fotos, imprimir PDF, imprimir etiqueta QR)
- `modules/rentabilidad.js` → tabla análisis costo vs cobrado por reparación, filtros por técnico y tipo equipo

**Verificar:** Crear orden, mover estados, imprimir PDF y etiqueta QR, rentabilidad calculada.

---

### FASE 5 — Facturación + Ventas + CRM (2 días)
**Objetivo:** Módulo financiero, gestión de clientes, comisiones.

**Backend:**
- `routes/facturacion.routes.js`:
  - CRUD facturas + exportar PDF
  - `POST /api/facturas/:id/nota-credito` → anula factura, devuelve stock al inventario, ajusta saldo del cliente
- `routes/ventas.routes.js` → historial, abonos
  - `GET /api/ventas/comisiones?desde=&hasta=&usuario=`
- `routes/clientes.routes.js` → CRUD clientes, historial unificado entre sedes

**Frontend:**
- `modules/facturacion.js` → tabla facturas con badges, exportar PDF, botón nota de crédito
- `modules/ventas.js` → historial con filtros, descuentos aplicados, comisiones generadas
- `modules/clientes.js` → ficha de cliente con historial de compras y reparaciones

---

### FASE 6 — Nómina Colombia (2 días)
**Backend:** CRUD empleados + cálculo nómina + PDF desprendible

**Fórmulas exactas:**
```
Devengado = salarioBase + auxilioTransporte + horasExtra + recargosNocturnos + dominicales + bonos
Deducción EPS = salarioBase × 4%
Deducción Pensión = salarioBase × 4%
Neto = Devengado - deduccionEPS - deduccionPension - deduccionPrestamos

Aportes empresa (informativos):
  ARL variable según riesgo
  SENA = salarioBase × 2%
  ICBF = salarioBase × 3%
  Caja Compensación = salarioBase × 4%

Prestaciones anuales (mostrar como proyección):
  Prima = salarioBase × diasTrabajados / 360
  Cesantías = salarioBase × diasTrabajados / 360
  Intereses cesantías = cesantias × 12%
  Vacaciones = salarioBase × diasTrabajados / 720
```

**Frontend:** `modules/nomina.js` con lista empleados, calcular, ver PDF desprendible

---

### FASE 7 — Compras + Proveedores (1 día)
**Backend:** CRUD proveedores, órdenes de compra, recepción mercancía → suma stock
**Frontend:** `modules/compras.js` con lista órdenes y recepción

---

### FASE 8 — Dashboard & Analítica Unificada (2.5 días)
**Backend:** Todos los endpoints de `/api/analytics/*` + exportación PDF y Excel

**Endpoints requeridos (18 total):**
```
GET /api/analytics/kpis?sede=&periodo=
GET /api/analytics/ventas/resumen?desde=&hasta=&sede=
GET /api/analytics/ventas/por-usuario
GET /api/analytics/ventas/por-producto
GET /api/analytics/ventas/por-metodo-pago
GET /api/analytics/inventario/stock?sede=
GET /api/analytics/inventario/movimientos
GET /api/analytics/inventario/valorizado
GET /api/analytics/finanzas/flujo-caja?desde=&hasta=
GET /api/analytics/finanzas/ingresos-egresos
GET /api/analytics/finanzas/cuentas-por-cobrar
GET /api/analytics/reparaciones/por-tecnico
GET /api/analytics/reparaciones/rentabilidad
GET /api/analytics/reparaciones/tiempos
GET /api/analytics/nomina/costos
GET /api/analytics/clientes/top
GET /api/analytics/export/pdf?reporte=
GET /api/analytics/export/excel?reporte=
```

**Frontend:** `modules/dashboard.js` ampliado con:
- 8 tarjetas KPI
- Gráfica de línea de ventas
- Tabla de vendedores con comisiones y técnicos
- Reporte de stock con semáforo
- Gráfica de área ingresos vs egresos mensual
- Reporte ventas por método de pago
- Costos de nómina
- Top clientes
- Filtros globales (fecha, sede, usuario, categoría, método de pago)
- Botones exportar PDF/Excel en cada sección

---

### FASE 9 — Cotizaciones + Trade-In + Cartera (2 días)
**Backend:**
- CRUD cotizaciones + `POST /api/cotizaciones/:id/aprobar` → genera venta o reparación
- Trade-In: registrar equipo recibido, vincularlo a venta, entrarlo al inventario como "Reacondicionado"
- Cartera: cuentas por cobrar, antigüedad, registrar abonos

**Frontend:**
- `modules/cotizaciones.js` → crear, enviar, aprobar, PDF
- `modules/tradein.js` → registrar equipo, valorar, aplicar a venta
- `modules/cartera.js` → tabla con semáforo antigüedad: 0-30🟢 / 30-60🟡 / 60-90🟠 / +90🔴

---

### FASE 10 — Notificaciones + Etiquetas QR (1.5 días)
**Backend:**
- Integrar Twilio en el cambio de estado de reparaciones (conectar el hook preparado en Fase 4)
- Sistema de plantillas configurables con variables
- Log de notificaciones enviadas
- Solo enviar si `config.notificacionesActivas === true`

**Frontend:**
- En `modules/config.js`: toggle de notificaciones por evento, editor de plantillas, campo API key
- En `modules/reparaciones.js`: botón "Imprimir etiqueta QR" funcional

---

### FASE 11 — Configuración + Audit Log + Pulido Final (2 días)
**Frontend:**
- `modules/config.js` completo: empresa, sedes, usuarios, roles, límites, categorías egreso, comisiones, notificaciones, tema
- `modules/auditlog.js`: tabla con filtros, exportar PDF/Excel
- **Respaldo y restauración de datos** (exportar/importar dump de BD)

**Pulido:**
- Revisar consistencia visual en todos los módulos con Tabler
- Validaciones de formularios en español
- Mensajes de error claros
- Pruebas integrales con datos reales
- Verificar que AuditLog registra todas las acciones clave

---

## ✅ REGLAS PARA LA IA DESARROLLADORA

1. **UNA FASE A LA VEZ.** Verificar y confirmar antes de pasar a la siguiente.
2. **Todos los textos en español** — errores, labels, botones, mensajes.
3. **Dinero siempre en COP** — formato: `$ 1.250.000`.
4. **No hardcodear configuraciones** — todo viene de `ConfiguracionSistema`.
5. **Cada endpoint de backend debe:**
   - Usar `authMiddleware` + `roles([...])`
   - Tener try/catch con mensajes claros
   - Registrar en AuditLog las operaciones de escritura
6. **La lógica de negocio va en el backend** — el frontend solo presenta.
7. **El diseño debe ser PREMIUM usando Tabler** — no un formulario genérico.
8. **Al terminar cada fase, confirmar al usuario antes de continuar.**
9. **En desarrollo usar `sequelize.sync({ alter: true })`** — no migraciones manuales.
10. **El backend sirve el frontend** con `express.static()` — no usar Live Server.

---

## 🔗 CÓMO EJECUTAR

```powershell
# FASE 0 — Verificar prerrequisitos
node --version          # debe ser v18+
psql --version          # debe responder
nodemon --version       # debe responder

# Crear la BD (si no existe)
psql -U postgres -c "CREATE DATABASE erp_techstore;"

# Backend + Frontend (todo desde un solo comando)
cd c:\erpnext\backend
npm install
npm run dev          # http://localhost:3000 (sirve backend + frontend)
```

---

*Documento de instrucciones para IA desarrolladora — Versión 2.0*
*Design system: Tabler Bootstrap 5*
*Plan completo de referencia: `c:\erpnext\Plan_ERP_TechStore.md`*
*Estimado total: ~20 días de desarrollo*
