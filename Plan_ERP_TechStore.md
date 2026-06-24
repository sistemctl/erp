# ERP TechStore Colombia — Plan Full-Stack
> Documento generado como guía de implementación para el equipo de desarrollo.
> Contiene todos los módulos, funcionalidades, fases de desarrollo y detalles técnicos.
> **Versión:** 2.0 — Incluye Tabler Bootstrap 5 y correcciones del análisis crítico

---

## Contexto del Negocio

| Campo | Detalle |
|-------|---------|
| **País** | Colombia (moneda: COP, impuesto: IVA 19%) |
| **Tipo** | Tienda de tecnología — ventas + reparaciones |
| **Productos** | Computadores, iPhones, PlayStation, consolas, accesorios |
| **Servicios** | Reparaciones con garantía, diagnóstico, mano de obra |
| **Empleados** | ~15 (escalable) |
| **Sedes** | 3 o más |
| **Pagos** | Efectivo, tarjeta, Nequi/Daviplata, transferencia, crédito/abonos |
| **Facturación** | Interna (sin integración DIAN) |

---

## Stack Tecnológico

### 🖥️ Backend
| Tecnología | Uso |
|------------|-----|
| **Node.js** | Entorno de ejecución del servidor |
| **Express.js** | Framework REST API + sirve frontend estático |
| **PostgreSQL** | Base de datos relacional robusta, multi-sede, lista para producción |
| **Sequelize** | ORM para modelos, migraciones y conexión con PostgreSQL |
| **pg + pg-hstore** | Driver PostgreSQL + serialización hstore |
| **JWT (jsonwebtoken)** | Autenticación y sesiones por sede/rol |
| **bcryptjs** | Hash de contraseñas |
| **Multer** | Subida de fotos (órdenes de reparación) |
| **PDFKit** | Generación de PDF en servidor |
| **node-cron** | Tareas programadas (alertas, cierres automáticos) |
| **Twilio** | Envío de SMS y WhatsApp a clientes (activable/desactivable) |
| **qrcode** | Generación de códigos QR para etiquetas de reparación |
| **cors, helmet** | Seguridad HTTP |
| **uuid** | Generación de IDs únicos (UUID v4) |

### 🎨 Frontend
| Tecnología | Uso |
|------------|-----|
| **Tabler (Bootstrap 5)** | Design system base — layout, componentes, dark/light mode nativo |
| **Tabler Icons** | 6,000+ íconos SVG (reemplaza Lucide Icons) |
| **Google Fonts (Inter)** | Tipografía premium |
| **Chart.js** | Gráficas del dashboard y reportes |
| **Vanilla JavaScript (ES6+)** | Lógica y llamadas a la API (sin frameworks JS) |
| **Fetch API** | Comunicación con el backend REST |

---

## Arquitectura del Proyecto

```
c:\erpnext\
│
├── backend/                        # Servidor Node.js
│   ├── server.js                   # Express + sirve frontend estático
│   ├── config/
│   │   ├── database.js             # Configuración Sequelize + PostgreSQL
│   │   └── config.js               # Variables de entorno
│   ├── models/                     # Modelos de base de datos (30)
│   │   ├── index.js
│   │   ├── Usuario.js
│   │   ├── Sede.js
│   │   ├── Producto.js
│   │   ├── Categoria.js
│   │   ├── StockSede.js
│   │   ├── NumeroSerie.js          # Serie/IMEI/Lote por unidad
│   │   ├── Cliente.js
│   │   ├── Venta.js
│   │   ├── ItemVenta.js
│   │   ├── PagoVenta.js
│   │   ├── Cotizacion.js           # Presupuestos/cotizaciones
│   │   ├── ItemCotizacion.js
│   │   ├── OrdenReparacion.js
│   │   ├── FotoReparacion.js
│   │   ├── RepuestoOrden.js
│   │   ├── RentabilidadReparacion.js # Análisis costo vs cobrado
│   │   ├── EgresoCaja.js           # Retiros de caja con motivo
│   │   ├── CategoriaEgreso.js
│   │   ├── TradeIn.js              # Recepción de equipos usados como pago
│   │   ├── Empleado.js
│   │   ├── Nomina.js               # Incluye campos de DetalleNomina
│   │   ├── Proveedor.js
│   │   ├── OrdenCompra.js
│   │   ├── ItemOrdenCompra.js
│   │   ├── MovimientoInventario.js
│   │   ├── Caja.js                 # Incluye campos de apertura Y cierre
│   │   ├── Factura.js
│   │   ├── Abono.js
│   │   ├── CuentaPorCobrar.js      # Cartera / créditos pendientes
│   │   ├── Notificacion.js         # Log de SMS/WhatsApp enviados
│   │   ├── ConfiguracionSistema.js
│   │   └── AuditLog.js             # Registro de auditoría
│   ├── routes/                     # Rutas API REST (21 archivos)
│   │   ├── auth.routes.js          # POST /api/auth/login, logout, me
│   │   ├── dashboard.routes.js     # GET /api/dashboard/kpis, graficas
│   │   ├── productos.routes.js     # CRUD /api/productos + CSV import
│   │   ├── inventario.routes.js    # /api/inventario, traslados
│   │   ├── series.routes.js        # /api/series (IMEI, lotes, historial)
│   │   ├── ventas.routes.js        # CRUD /api/ventas + descuentos + comisiones
│   │   ├── reparaciones.routes.js  # CRUD /api/reparaciones
│   │   ├── facturacion.routes.js   # CRUD /api/facturas + notas crédito
│   │   ├── clientes.routes.js      # CRUD /api/clientes
│   │   ├── nomina.routes.js        # CRUD /api/nomina
│   │   ├── empleados.routes.js     # CRUD /api/empleados
│   │   ├── compras.routes.js       # CRUD /api/compras
│   │   ├── proveedores.routes.js   # CRUD /api/proveedores
│   │   ├── caja.routes.js          # /api/caja/apertura, cierre, egresos
│   │   ├── config.routes.js        # /api/config (empresa, sedes)
│   │   ├── cotizaciones.routes.js  # /api/cotizaciones
│   │   ├── tradein.routes.js       # /api/trade-in
│   │   ├── cartera.routes.js       # /api/cartera (cuentas por cobrar)
│   │   ├── notificaciones.routes.js# /api/notificaciones (SMS/WhatsApp)
│   │   ├── analytics.routes.js     # /api/analytics (18 endpoints)
│   │   └── auditlog.routes.js      # /api/audit-log
│   ├── controllers/                # Lógica de negocio (uno por módulo)
│   ├── middleware/
│   │   ├── auth.middleware.js      # Verificación JWT
│   │   ├── roles.middleware.js     # Control de roles
│   │   ├── auditLog.middleware.js  # Registra automáticamente cada acción
│   │   └── errorHandler.js        # Manejo de errores global
│   ├── uploads/reparaciones/       # Fotos de equipos en reparación
│   ├── migrations/                 # Migraciones de BD (para producción)
│   ├── seeders/                    # Datos iniciales de prueba
│   ├── package.json
│   └── .env                        # Variables de entorno
│
└── frontend/                       # Cliente Web SPA
    ├── index.html                  # Shell principal con Tabler
    ├── assets/
    │   ├── css/
    │   │   ├── tabler.min.css      # Design system Tabler
    │   │   ├── tabler-icons.min.css# Íconos Tabler
    │   │   └── custom.css          # Overrides y estilos específicos del ERP
    │   ├── js/
    │   │   ├── tabler.min.js       # JS de Tabler (Bootstrap 5)
    │   │   ├── app.js              # Router SPA + inicialización
    │   │   ├── api.js              # Cliente HTTP (Fetch + JWT)
    │   │   ├── auth.js             # Login / sesión
    │   │   ├── modules/
    │   │   │   ├── dashboard.js
    │   │   │   ├── pos.js
    │   │   │   ├── reparaciones.js
    │   │   │   ├── rentabilidad.js     # Análisis rentabilidad reparaciones
    │   │   │   ├── inventario.js
    │   │   │   ├── series.js           # Gestión series/IMEI/lotes
    │   │   │   ├── facturacion.js
    │   │   │   ├── ventas.js
    │   │   │   ├── clientes.js
    │   │   │   ├── nomina.js
    │   │   │   ├── compras.js
    │   │   │   ├── caja.js
    │   │   │   ├── cotizaciones.js
    │   │   │   ├── tradein.js
    │   │   │   ├── cartera.js
    │   │   │   ├── auditlog.js         # Visor de auditoría
    │   │   │   └── config.js
    │   │   └── utils/
    │   │       ├── barcode.js      # Lector código de barras (USB HID)
    │   │       ├── formatters.js   # COP, fechas, porcentajes
    │   │       └── ui.js           # Notificaciones, modales, loaders
    │   └── images/
    └── lib/                        # Chart.js local (opcional, o CDN)
```

---

## Decisiones de Diseño de Modelos

> **`DetalleNomina`:** El diagrama de relaciones muestra `Empleados → Nomina → DetalleNomina`, pero todos los campos de detalle van directamente en `Nomina`. No se crea un modelo separado.

> **`CierreCaja`:** La estructura original listaba `CierreCaja.js`, pero todos los campos de apertura y cierre van en un solo modelo `Caja`. No se crea un modelo separado.

> **`RentabilidadReparacion`:** Los campos `costoReal`, `totalCobrado` y `margen` son una decisión de diseño basada en la funcionalidad descrita ("análisis costo vs cobrado").

---

## Estrategia de Migraciones

> **En desarrollo:** Se usa `sequelize.sync({ alter: true })` en `server.js` para crear/actualizar tablas automáticamente al iniciar. No se crean archivos de migración manual.
>
> **En producción:** Cuando el sistema esté estable, se generan migraciones definitivas con `npx sequelize-cli migration:generate` y se usa `db:migrate`.

---

## Estrategia CORS y Servir Frontend

> **El backend sirve el frontend.** En `server.js`:
> ```javascript
> app.use(express.static(path.join(__dirname, '..', 'frontend')));
> ```
> Todo el sistema se accede desde `http://localhost:3000/`. No se necesita Live Server ni hay problemas de CORS.

---

## Módulos del Sistema

### 1. 🛒 POS — Punto de Venta
- Pantalla de cobro con búsqueda rápida de productos
- **Lector de código de barras** (USB HID — sin configuración extra)
- Carrito de compra en tiempo real con precios en COP
- **Múltiples métodos de pago en una sola venta** (ej: 50% efectivo + 50% Nequi)
- Registro de ventas a **crédito / abonos** con saldo pendiente
- Cálculo de IVA (19%) configurable por producto
- **Precio personalizado por transacción** (ver sección detallada abajo)
- **Egreso de caja** con motivo y categoría (ver sección detallada abajo)
- Descuentos por producto o por total de venta
- Generación e impresión de ticket/recibo
- Selector de sede activa al iniciar sesión

### 2. 🔧 Órdenes de Reparación
- Registro completo con:
  - Nombre, teléfono y correo del cliente
  - Tipo y modelo del equipo (PC, iPhone, PS2, PS5, Xbox, etc.)
  - **Número de serie / IMEI** (vinculado al módulo de series)
  - Descripción del problema reportado + diagnóstico técnico
  - **Fotos del equipo al recibir** (evidencia, subida por Multer)
  - Técnico asignado
  - Repuestos utilizados (descontados automáticamente del inventario)
  - Costo de mano de obra
  - **Estado**: Recibido → En diagnóstico → En reparación → Listo → Entregado
  - **Garantía** de la reparación (días configurables)
- Tablero Kanban por estado
- Generación de **orden de trabajo** imprimible para el cliente
- Historial de reparaciones por cliente y por IMEI/serie
- **Análisis de rentabilidad** por reparación (costo vs cobrado)

### 3. 📦 Inventario
- Catálogo con código de barras, precio de venta, costo, stock
- Categorías: Computadores, Teléfonos, Consolas, Repuestos, Accesorios
- **Stock por sede** + alertas de stock mínimo 🟢🟡🔴
- Entradas y salidas con historial completo
- **Traslados de mercancía entre sedes**
- **Seguimiento de número de serie/IMEI/lote** por unidad
- **Carga masiva de productos por CSV**
- Etiquetas de código de barras imprimibles

### 4. 🧾 Facturación
- Facturas de venta y de servicio (reparaciones)
- Datos del cliente (nombre, NIT/CC, dirección)
- Desglose de IVA (19%)
- Estados: Pagada, Pendiente, Vencida, Abono parcial
- **Ventas a crédito**: registro de abonos y saldo pendiente
- **Notas de crédito y devoluciones** → anula factura, devuelve stock al inventario, ajusta saldo del cliente
- **Exportación a PDF** (ticket pequeño o factura completa)
- Historial de facturas por cliente

### 5. 💰 Ventas y CRM
- Historial completo de ventas filtrable por fecha, sede, vendedor, producto
- Gestión de clientes unificada entre sedes
- Ventas a crédito con historial de abonos
- **Comisiones por vendedor** configurables (% sobre total de venta)
- Productos más/menos vendidos

### 6. 👥 Nómina (Colombia)
- Alta de empleados con datos personales, laborales y bancarios
- Tipos de contrato: indefinido, fijo, prestación de servicios
- **Cálculos según legislación colombiana:**
  - Salario base + auxilio de transporte
  - EPS — 4% empleado
  - Pensión (AFP) — 4% empleado
  - ARL (solo empresa)
  - SENA, ICBF, Caja de Compensación
  - Retención en la fuente (si aplica)
- Percepciones: horas extra, recargos nocturnos, dominicales, bonos
- Deducciones: préstamos de empresa, libranzas
- **Prestaciones sociales**: prima, cesantías, intereses, vacaciones
- Periodos: quincenal / mensual
- Generación de **desprendible de nómina PDF**

### 7. 🛍️ Compras y Proveedores
- Registro de proveedores (nombre, NIT, contacto, banco)
- Órdenes de compra
- Recepción de mercancía (actualiza inventario automáticamente)
- Registro de costos y facturas de proveedores
- Cuentas por pagar con estados y fechas de vencimiento

### 8. 💵 Control de Caja
- **Apertura de caja**: monto inicial en efectivo por sede
- Registro de ingresos (ventas) y **egresos con motivo** durante el día
- **Cierre de caja**: conteo por método de pago (efectivo, Nequi, Daviplata, tarjeta, transferencia), comparación con sistema
- Diferencias y observaciones del cajero
- Historial de cierres por fecha y sede

### 9. 📊 Dashboard & Analítica (módulo unificado)
- Panel principal con KPIs en tiempo real + acceso a todos los reportes desde el mismo lugar
- *(Ver detalle completo en la sección de Analítica más abajo)*

### 10. 🏷️ Cotizaciones y Presupuestos
- Crear cotización con productos y/o servicios de reparación
- Estados: Borrador → Enviada → Aprobada → Rechazada → Expirada
- Al aprobar → se convierte automáticamente en orden de venta o de reparación
- Exportación a PDF para entregar o enviar al cliente
- Historial de cotizaciones por cliente
- Fecha de vencimiento configurable

### 11. 🔄 Trade-In (Equipos Usados como Pago)
- El cliente entrega un equipo usado como parte del pago
- Registro del equipo recibido: modelo, estado, IMEI, valoración en COP
- El valor del trade-in se descuenta automáticamente de la nueva compra en el POS
- El equipo recibido entra al inventario como **"Producto Reacondicionado"** con precio diferenciado
- Historial de trade-ins por cliente
- Reporte de equipos reacondicionados en inventario

### 12. 💼 Cuentas por Cobrar (Cartera)
- Panel dedicado a todas las ventas a crédito pendientes
- Tabla con: cliente, monto total, abonos realizados, saldo pendiente, días vencido
- **Antigüedad de cartera**: 0-30 días 🟢 / 30-60 🟡 / 60-90 🟠 / +90 días 🔴
- Alertas automáticas cuando una factura se vence
- Registro de cada abono con fecha, monto y método de pago
- Reporte de cartera total en COP

### 13. 📲 Notificaciones SMS / WhatsApp
- Notificaciones automáticas al cliente cuando cambia el estado de su reparación
- Ejemplos de mensajes:
  - *"Hola Juan, tu iPhone 15 (orden #1042) ya está listo para recoger en Sede Centro 🎉"*
  - *"Tu equipo está en reparación. Te avisamos cuando esté listo."*
- **Activable/desactivable** desde Configuración (toggle on/off por tipo de evento)
- Plantillas de mensajes personalizables (variables: nombre, equipo, sede, orden)
- Eventos configurables: Recibido, En diagnóstico, Listo, Entregado
- Canal configurable: SMS, WhatsApp o ambos
- Log de notificaciones enviadas (quién, cuándo, qué mensaje, estado: enviado/fallido)

### 14. 🖨️ Etiquetas QR para Equipos
- Al crear una orden de reparación → se genera e imprime una etiqueta automáticamente
- La etiqueta incluye: #orden, cliente, tipo de equipo, QR code
- El técnico escanea el QR con el lector de barras para abrir la orden directamente
- Imprimible en impresora de etiquetas o en papel normal

### 15. ⚙️ Configuración del Sistema (desde la web)
- Datos de la empresa (nombre, logo, NIT, dirección, teléfono)
- Gestión de sedes: crear, editar, activar/desactivar
- Usuarios y roles (Admin, Cajero, Técnico, Gerente Sede, Contador)
- Configuración de impresora de tickets y etiquetas
- Parámetros de IVA y otros impuestos
- **Descuento máximo** permitido por el cajero
- **Monto máximo de egreso** sin autorización del Admin
- **Categorías de egreso** personalizables
- **Comisiones por vendedor** (% configurable)
- **Notificaciones SMS/WhatsApp**: activar/desactivar por evento, plantillas de mensajes
- **Proveedor de mensajería**: Twilio (clave API configurable)
- Modo claro ☀️ / oscuro 🌙 (nativo de Tabler, preferencia por usuario)
- Visor del Audit Log
- **Respaldo y restauración de datos** (exportar/importar dump de BD)

---

## ★ Egreso de Caja (Retiro de Dinero con Motivo)

### 💵 ¿Qué es?
Cuando se necesita sacar dinero físico de la caja, el cajero registra el retiro **indicando obligatoriamente el motivo** antes de que el dinero salga.

### 🖥️ Flujo en pantalla
```
[Botón "Egreso de Caja" en el panel del POS]
    ↓
[Formulario emergente]
  • Monto a retirar:   $10.000 COP
  • Categoría:         [Gastos operativos ▼]
  • Motivo detallado:  "Pago de domicilio de repuesto"
  • Autorizado por:    (cajero actual, o PIN del Admin si supera un límite)
    ↓
[Confirmar] → El sistema descuenta el monto del saldo de caja
    ↓
[Recibo de egreso generado e imprimible]
```

### 🏷️ Categorías de Egreso (configurables desde Configuración)
| Categoría | Ejemplos de uso |
|-----------|----------------|
| 💼 Gastos operativos | Domicilios, papelería, servicios |
| 🔧 Compra de repuestos urgente | Repuesto de emergencia no en OC |
| 🍽️ Alimentación del equipo | Refrigerios, almuerzos |
| 🏦 Pago a proveedor (efectivo) | Proveedor que solo acepta cash |
| 💰 Retiro del propietario | El dueño saca dinero |
| 📦 Otros gastos | Cualquier gasto con descripción obligatoria |

### ✅ Reglas configurables
| Regla | Comportamiento |
|-------|---------------|
| Monto máximo sin autorización | Configurable (ej: hasta $50.000 sin PIN) |
| Monto que requiere PIN del Admin | Por encima del límite configurado |
| Motivo obligatorio | Siempre — no se puede omitir |
| Categoría obligatoria | Siempre — debe seleccionarse una |

### 📋 Ejemplo en el cierre de caja
```
EGRESOS DEL DÍA — Sede Centro — 23/06/2026
─────────────────────────────────────────────
10:15am  Juan Pérez   Gastos operativos    $8.000   "Domicilio de cable HDMI"
02:30pm  María López  Alimentación         $25.000  "Almuerzos del equipo"
05:00pm  Juan Pérez   Pago a proveedor     $80.000  "Proveedor pantallas" [Admin autorizó]
─────────────────────────────────────────────
TOTAL EGRESOS:  $113.000 COP
```

---

## ★ Precio Personalizado por Transacción (Price Override)

### 💲 ¿Cómo funciona?
El precio base de cada producto **nunca cambia** en el catálogo. En el POS, el cajero puede modificar el precio de un ítem para esa transacción específica.

### Ejemplo práctico
```
Producto: Cable USB-C
Precio base:        $45.000 COP   ← sigue igual en el inventario
Precio modificado:  $40.000 COP   ← lo que se cobra en esta venta
Descuento aplicado: 11,1%
Costo del producto: $28.000 COP   ← sistema verifica que no baje de aquí
```

### ✅ Reglas configurables
| Regla | Valor |
|-------|-------|
| ¿Quién puede modificar el precio? | Cajero/Vendedor |
| Descuento máximo permitido | Configurable (ej: 20%) |
| ¿Alerta si baja del costo? | Sí — aviso en pantalla en rojo |
| ¿Se puede vender por debajo del costo? | Solo el Admin puede autorizar con PIN |

### 🔔 Alerta de precio bajo costo
> ⚠️ *"El precio ingresado ($25.000) está por debajo del costo ($28.000). Estás vendiendo a pérdida."*

### 📊 Impacto en Analítica
- Reporte de "descuentos aplicados" por vendedor y período
- Precio base, precio cobrado, descuento en % y en COP
- El descuento afecta el cálculo de margen de ganancia real
- El Audit Log registra quién cambió el precio, cuándo y por cuánto

---

## ★ Registro de Auditoría (Audit Log)

### 📋 ¿Qué registra?
Todo cambio significativo en el sistema queda registrado automáticamente mediante un middleware:

| Campo registrado | Ejemplo |
|-----------------|---------|
| Usuario | Juan Pérez (Cajero) |
| Acción | UPDATE |
| Módulo | Productos |
| Registro afectado | iPhone 15 Pro (ID: 482) |
| Valor anterior | $3.200.000 |
| Valor nuevo | $3.500.000 |
| Fecha y hora | 23/06/2026 10:34am |
| IP / Sede | Sede Centro |

### 🔍 Visor de Audit Log
- Accesible desde el módulo de Configuración (solo Admin)
- Filtros: por usuario, módulo, tipo de acción, rango de fechas
- Exportable a PDF o Excel

---

## ★ Seguimiento de Número de Serie / IMEI / Lote

- Cada unidad de producto tiene su número de serie/IMEI registrado
- Al vender un equipo: el sistema registra qué número de serie salió y a qué cliente
- Al registrar reparación: se vincula al IMEI/serie del equipo
- Si el cliente regresa en garantía: el sistema detecta automáticamente el IMEI
- Historial completo de un equipo: quién lo compró, si fue reparado, cuándo salió

---

## ★ Módulo de Analítica y Reportes (Detalle Completo)

### 📊 1. Panel de KPIs en Tiempo Real
| KPI | Descripción |
|-----|-------------|
| 💵 Ventas del día / semana / mes | Total facturado en COP |
| 📦 Productos vendidos | Unidades despachadas en el período |
| 🔧 Reparaciones activas | Cuántas están en proceso ahora mismo |
| ⏱️ Tiempo promedio de reparación | Por técnico y general |
| 💰 Dinero en caja (por sede) | Saldo actual de cada caja |
| 📉 Productos en stock bajo | Cuántos están por debajo del mínimo |
| 🧾 Facturas pendientes de pago | Total en COP de cartera |
| 👥 Clientes nuevos del mes | Registros nuevos |

### 👤 2. Reporte por Usuario / Vendedor / Técnico
**Para Vendedores:**
- Total de ventas en COP y en unidades
- Número de transacciones realizadas
- Ticket promedio por venta
- Comisiones generadas
- Productos más vendidos por cada vendedor
- Descuentos aplicados por vendedor

**Para Técnicos:**
- Número de reparaciones completadas
- Tiempo promedio por reparación
- Tasa de éxito (completadas vs. devueltas)
- Rentabilidad generada por técnico
- Repuestos más usados

### 📦 3. Reporte de Stock e Inventario
| Columna | Descripción |
|---------|-------------|
| Producto / SKU | Nombre y código |
| Stock actual | Unidades disponibles por sede |
| Stock mínimo | Umbral de alerta configurado |
| Estado | 🟢 OK / 🟡 Bajo / 🔴 Agotado |
| Valor en inventario | Costo × unidades (en COP) |
| Última entrada | Fecha y cantidad de la última compra |
| Última salida | Fecha y cantidad de la última venta/uso |
| Rotación | Veces que se ha vendido en el período |

**Gráficas:**
- Top 10 productos más vendidos (barras)
- Distribución de stock por categoría (torta)
- Histórico de movimientos últimos 6 meses (línea)

### 💹 4. Flujo de Dinero — Entradas y Salidas
**Dinero que ENTRA (Ingresos):**
- Ventas de productos (contado)
- Cobros de reparaciones
- Abonos recibidos de créditos
- Desglosado por sede y método de pago

**Dinero que SALE (Egresos):**
- Compras a proveedores
- Pago de nómina
- Repuestos usados en reparaciones
- **Egresos de caja desglosados por categoría** (gastos operativos, alimentación, etc.)

**Vista mensual comparativa:**
```
Mes        Ingresos       Egresos       Ganancia
---        --------       -------       --------
Enero      $45.200.000    $28.100.000   $17.100.000
Febrero    $52.800.000    $31.500.000   $21.300.000
Marzo      $38.900.000    $29.200.000   $ 9.700.000
```

**Gráfica de área** mostrando tendencia de ingresos vs egresos mes a mes.

### 🔧 5. Rentabilidad de Reparaciones
- Tabla: costo real (repuestos + mano de obra) vs. cobrado al cliente vs. margen
- Filtros: por técnico, tipo de equipo (iPhone, PC, consola), período
- Reparaciones con mayor y menor margen
- Gráfica de barras: rentabilidad promedio por tipo de equipo

### 📤 6. Exportación de Reportes
- **PDF** — con logo de la empresa, fecha y filtros aplicados
- **Excel / CSV** — para análisis externo en Google Sheets o Excel

### 🔍 7. Filtros Globales
- 📅 Rango de fechas (hoy, ayer, esta semana, mes, trimestre, personalizado)
- 🏪 Sede (todas o una específica)
- 👤 Usuario / empleado
- 🏷️ Categoría de producto
- 💳 Método de pago

---

## Base de Datos — Relaciones Principales

```
Sedes ──────────────── Usuarios (roles por sede)
  │
  ├── Inventario (stock por sede)
  │     └── Productos ── Categorías ── NumerosSerie/IMEI
  │
  ├── Ventas ── ItemsVenta (precio_base + precio_modificado)
  │     └── Facturas ── Pagos (mixtos por método)
  │
  ├── OrdenesReparacion
  │     ├── RepuestosUsados ── Productos
  │     ├── FotosEquipo
  │     ├── Historial de estados
  │     └── RentabilidadReparacion
  │
  ├── Caja (apertura/cierre por sede)
  │     └── EgresosCaja (monto + categoría + motivo)
  │
  └── Clientes

Empleados ── Nomina (campos de detalle incluidos)
Proveedores ── OrdenesCompra ── ItemsCompra ── Productos
AuditLog (registra todas las acciones del sistema)
```

---

## API REST — Endpoints Clave

```
# AUTH
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me

# DASHBOARD
GET    /api/dashboard/kpis?sede=&periodo=
GET    /api/dashboard/graficas/ventas

# PRODUCTOS
GET    /api/productos?sede=&categoria=&q=
POST   /api/productos
GET    /api/productos/barcode/:codigo
PUT    /api/productos/:id
DELETE /api/productos/:id
POST   /api/productos/importar-csv

# INVENTARIO
GET    /api/inventario/stock?sede=
POST   /api/inventario/traslado
GET    /api/inventario/movimientos

# SERIES / IMEI
GET    /api/series?producto=
POST   /api/series
GET    /api/series/:imei/historial

# VENTAS (incluye price override)
POST   /api/ventas       (body: precio_base, precio_modificado, descuento_aplicado por item)
GET    /api/ventas?desde=&hasta=&sede=
POST   /api/ventas/:id/abono
GET    /api/ventas/descuentos
GET    /api/ventas/comisiones?desde=&hasta=&usuario=

# REPARACIONES
GET    /api/reparaciones?estado=&tecnico=&sede=
POST   /api/reparaciones
PUT    /api/reparaciones/:id/estado
POST   /api/reparaciones/:id/fotos
GET    /api/reparaciones/:id/orden-pdf
GET    /api/reparaciones/:id/etiqueta-qr
POST   /api/reparaciones/:id/repuestos

# FACTURAS
GET    /api/facturas
POST   /api/facturas
GET    /api/facturas/:id/pdf
POST   /api/facturas/:id/nota-credito

# NÓMINA
GET    /api/empleados
POST   /api/nomina/calcular
GET    /api/nomina/:empleadoId/desprendible-pdf

# CAJA
POST   /api/caja/apertura
POST   /api/caja/cierre
GET    /api/caja/reporte?fecha=&sede=
POST   /api/caja/egreso
GET    /api/caja/egresos?sede=&fecha=

# ANALÍTICA Y REPORTES (18 endpoints)
GET    /api/analytics/kpis?sede=&periodo=
GET    /api/analytics/ventas/resumen?desde=&hasta=&sede=
GET    /api/analytics/ventas/por-usuario
GET    /api/analytics/ventas/por-producto
GET    /api/analytics/ventas/por-metodo-pago
GET    /api/analytics/inventario/stock?sede=
GET    /api/analytics/inventario/movimientos
GET    /api/analytics/inventario/valorizado
GET    /api/analytics/finanzas/flujo-caja?desde=&hasta=
GET    /api/analytics/finanzas/ingresos-egresos
GET    /api/analytics/finanzas/cuentas-por-cobrar
GET    /api/analytics/reparaciones/por-tecnico
GET    /api/analytics/reparaciones/rentabilidad
GET    /api/analytics/reparaciones/tiempos
GET    /api/analytics/nomina/costos
GET    /api/analytics/clientes/top
GET    /api/analytics/export/pdf?reporte=
GET    /api/analytics/export/excel?reporte=

# COTIZACIONES
GET    /api/cotizaciones
POST   /api/cotizaciones
POST   /api/cotizaciones/:id/aprobar

# TRADE-IN
GET    /api/trade-in
POST   /api/trade-in

# CARTERA
GET    /api/cartera
POST   /api/cartera/:id/abono

# NOTIFICACIONES
GET    /api/notificaciones

# AUDIT LOG
GET    /api/audit-log?usuario=&modulo=&desde=&hasta=
```

---

## Flujo de Autenticación

```
[Login] → POST /api/auth/login
        → JWT token (contiene: userId, rol, sedeId)
        → Guardado en localStorage del frontend
        → Cada request incluye: Authorization: Bearer <token>
        → Backend valida token + verifica permisos por rol
```

---

## Roles y Permisos

| Rol | Acceso |
|-----|--------|
| **Admin** | Todo el sistema, todas las sedes, Audit Log, configuración |
| **Gerente Sede** | Su sede: POS, caja, inventario, reparaciones, reportes |
| **Cajero/Vendedor** | POS, facturación, egreso de caja, consulta inventario |
| **Técnico** | Solo órdenes de reparación asignadas |
| **Contador** | Nómina, reportes financieros, compras |

---

## Diseño Visual — Tabler Bootstrap 5

- **Design system**: Tabler (Bootstrap 5) — dark/light mode nativo
- **Tema predeterminado**: ☀️ **Modo Claro**
- **Modo Oscuro**: 🌙 toggle nativo de Tabler en la barra superior (preferencia guardada por usuario)
- **Paleta Modo Claro**: Fondo `#F8FAFC`, sidebar `#FFFFFF`, azul `#2563EB`, texto `#1E293B`
- **Paleta Modo Oscuro**: Fondo `#0F172A`, sidebar `#1E293B`, azul `#3B82F6`, texto `#F1F5F9`
- **Tipografía**: Inter (Google Fonts)
- **Íconos**: Tabler Icons (6,000+ SVG)
- **Estilo**: Moderno y profesional — componentes nativos de Tabler (stat cards, badges, tablas, modales)
- **Layout**: Sidebar fijo 240px + topbar con toggle de tema + área de trabajo (layout nativo de Tabler)
- **Responsive**: Escritorio principal, soporte para tablets
- **El diseño DEBE ser PREMIUM** — usar componentes Tabler nativos, no formularios genéricos

---

## Plan de Desarrollo por Fases

### ⚙️ Fase 0 — Verificación e Instalación de Prerrequisitos
- [ ] Verificar Node.js v18+ (instalar si no está)
- [ ] Verificar npm (instalar si no está)
- [ ] Verificar PostgreSQL (instalar si no está)
- [ ] Crear BD `erp_techstore` (si no existe)
- [ ] Instalar nodemon y sequelize-cli globalmente
- [ ] Verificar Git (instalar si no está)
- [ ] Generar archivo `.env` con credenciales del usuario

### 🔵 Fase 1 — Backend Base + Auth (2 días)
- [ ] Inicializar proyecto Node.js + Express
- [ ] Instalar todas las dependencias (incluir pg-hstore)
- [ ] Configurar Sequelize + PostgreSQL, todos los modelos y relaciones
- [ ] Usar `sequelize.sync({ alter: true })` en desarrollo
- [ ] Sistema de autenticación JWT (login, logout, middleware)
- [ ] Middleware de Audit Log automático
- [ ] Rutas de configuración: sedes, empresa, usuarios
- [ ] Datos semilla (seed) de prueba
- [ ] Backend sirve frontend con `express.static()`

### 🔵 Fase 2 — Frontend Base + Dashboard con Tabler (1.5 días)
- [ ] Shell HTML con Tabler CSS/JS + Google Fonts Inter + Chart.js
- [ ] Custom CSS para overrides del ERP
- [ ] Sistema de routing SPA en JavaScript
- [ ] Cliente HTTP con JWT (api.js)
- [ ] Pantalla de login con Tabler
- [ ] Dashboard con KPIs (Tabler stat cards) conectado al backend
- [ ] Gráfica de ventas con Chart.js

### 🔵 Fase 3 — Inventario + POS + Series/IMEI (2.5 días)
- [ ] Backend: CRUD productos, stock multi-sede, traslados
- [ ] Backend: Series/IMEI (CRUD + historial)
- [ ] Backend: Carga masiva CSV
- [ ] Backend: Descuentos endpoint
- [ ] Frontend: Módulo inventario (listado, formularios, búsqueda, CSV import)
- [ ] Frontend: Módulo series/IMEI
- [ ] Frontend: Módulo POS con lector de barras
- [ ] Price Override con validación de costo y PIN de Admin
- [ ] Pagos mixtos y ventas a crédito
- [ ] Control de caja (apertura / cierre / egresos con motivo)
- [ ] Impresión de ticket

### 🔵 Fase 4 — Órdenes de Reparación (2 días)
- [ ] Backend: CRUD órdenes, subida de fotos (Multer), estados
- [ ] Backend: Cambio de estado SIN integrar Twilio (solo marca notificacionEnviada: false)
- [ ] Backend: Endpoint PDF orden de trabajo
- [ ] Backend: Endpoint etiqueta QR
- [ ] Backend: Cálculo de rentabilidad por reparación
- [ ] Frontend: Formulario ingreso de equipo + fotos + IMEI
- [ ] Frontend: Tablero Kanban de reparaciones por estado
- [ ] Frontend: Módulo rentabilidad de reparaciones
- [ ] Vista técnico + vista administrador

### 🔵 Fase 5 — Facturación + Ventas + CRM (2 días)
- [ ] Backend: Facturas, abonos
- [ ] Backend: Notas de crédito (anula factura, devuelve stock, ajusta saldo)
- [ ] Backend: Comisiones por vendedor
- [ ] Frontend: Módulo facturación + exportación PDF + nota de crédito
- [ ] Frontend: Módulo ventas (historial, reportes, comisiones)
- [ ] Frontend: Gestión de clientes con historial unificado

### 🔵 Fase 6 — Nómina Colombia (2 días)
- [ ] Backend: Modelo empleados, cálculo automático nómina colombiana
- [ ] Cálculos: EPS (4%), Pensión (4%), ARL, SENA, ICBF, Caja de Compensación
- [ ] Prestaciones: prima, cesantías, intereses cesantías, vacaciones
- [ ] Percepciones: horas extra, recargos, bonos
- [ ] Frontend: Módulo nómina + desprendible PDF

### 🔵 Fase 7 — Compras + Proveedores (1 día)
- [ ] Backend: CRUD proveedores, órdenes de compra, cuentas por pagar
- [ ] Frontend: Módulo compras + recepción de mercancía

### 🔵 Fase 8 — Dashboard & Analítica Unificada (2.5 días)
- [ ] Backend: 18 endpoints de analytics (ventas, inventario, finanzas, reparaciones, nómina, clientes)
- [ ] Backend: Motor de exportación PDF y Excel/CSV
- [ ] Frontend: Dashboard principal unificado con KPIs en tiempo real
- [ ] Frontend: Reporte por usuario/vendedor/técnico con comisiones (tabla + gráfica)
- [ ] Frontend: Reporte de stock con semáforo de alertas
- [ ] Frontend: Flujo de dinero mensual (ingresos vs egresos) con gráfica de área
- [ ] Frontend: Ventas por método de pago
- [ ] Frontend: Egresos de caja por categoría en analítica
- [ ] Frontend: Rentabilidad de reparaciones por técnico y tipo de equipo
- [ ] Frontend: Costos de nómina, top clientes
- [ ] Frontend: Filtros globales (fecha, sede, usuario, categoría, método de pago)
- [ ] Frontend: Botones de exportar a PDF y Excel en cada reporte

### 🔵 Fase 9 — Cotizaciones + Trade-In + Cartera (2 días)
- [ ] Backend: CRUD cotizaciones, conversión a orden de venta/reparación
- [ ] Frontend: Módulo cotizaciones + exportación PDF
- [ ] Backend: Flujo de Trade-In (recepción, valoración, descuento en POS)
- [ ] Frontend: Módulo Trade-In + categoría de productos reacondicionados
- [ ] Backend: Cuentas por cobrar, antigüedad de cartera, alertas de vencimiento
- [ ] Frontend: Panel de cartera con semáforo de antigüedad

### 🔵 Fase 10 — Notificaciones + Etiquetas QR (1.5 días)
- [ ] Backend: Integración real con Twilio (conectar hook de Fase 4)
- [ ] Backend: Sistema de plantillas de mensajes configurables
- [ ] Backend: Log de notificaciones enviadas
- [ ] Frontend: Módulo de notificaciones en Configuración (toggle on/off por evento)
- [ ] Frontend: Generación e impresión de etiquetas QR

### 🔵 Fase 11 — Configuración + Audit Log + Pulido Final (2 días)
- [ ] Módulo de configuración web completo (empresa, sedes, usuarios, roles, comisiones)
- [ ] Categorías de egreso configurables desde la web
- [ ] Descuento máximo y monto de egreso sin PIN configurables
- [ ] Configuración de proveedor de mensajería (API key, canal SMS/WhatsApp)
- [ ] Visor del Audit Log con filtros y exportación
- [ ] Toggle modo claro / oscuro nativo de Tabler
- [ ] Respaldo y restauración de datos
- [ ] Pruebas integrales con datos reales de prueba
- [ ] Correcciones y ajustes finos

**⏱️ Total estimado: ~20 días de desarrollo**

---

## Cómo Ejecutar el Sistema

```powershell
# FASE 0 — Verificar prerrequisitos
node --version          # debe ser v18+
psql --version          # debe responder
nodemon --version       # debe responder

# Crear base de datos (si no existe)
psql -U postgres -c "CREATE DATABASE erp_techstore;"

# Backend + Frontend (todo desde un solo comando)
cd c:\erpnext\backend
npm install
npm run dev             # http://localhost:3000 (sirve backend + frontend)
```

---

## Consideraciones Futuras

> **Despliegue multi-sede**: El backend con PostgreSQL puede desplegarse en un VPS (DigitalOcean, AWS, Railway, servidor propio) al que todas las sedes acceden por red/internet.

> **Facturación electrónica DIAN** (futura): Si en el futuro se requiere, se puede integrar con un proveedor tecnológico (Siigo, Alegra, etc.) sin rehacer el sistema.

> **App móvil**: El backend REST API es compatible con una app móvil (React Native / Flutter) en el futuro si se requiere consultar datos desde el celular.

> **Migraciones para producción**: Cuando el sistema esté estable, se generan migraciones definitivas con `npx sequelize-cli migration:generate` y se usa `db:migrate` para despliegues controlados.
