# TypeScript — cierre de fase 4

Fecha: 8 de octubre de 2026. Migración del backend por dominios completada.

## Alcance

142 archivos de aplicación TypeScript, incluidos el servidor, 25 controladores, 25 rutas, 40 modelos más su registro, cinco middleware, 31 utilidades, configuración, tres servicios, tres tareas programadas, dos migraciones, cuatro scripts administrativos y el seeder. No quedan fuentes JavaScript de aplicación en esos directorios.

Todos estos archivos se comprueban con `strict: true` y `noEmitOnError: true`. Se conservan Express, Sequelize 6, PostgreSQL, CommonJS, las rutas HTTP y los archivos JSON existentes. Las importaciones del navegador continúan utilizando `.js`. Los modelos distinguen fechas de PostgreSQL, decimales `string | number`, atributos de creación y asociaciones opcionales. Los tipos describen contratos; permanecen las validaciones de negocio y Sequelize.

El compilador emite el backend en `backend/dist` y el frontend en `frontend/dist`. `.env`, uploads y recursos persistentes mantienen sus rutas existentes. Los scripts administrativos se ejecutan con `node dist/scripts/<nombre>.js` tras compilar; el seeder conserva `node dist/seeders/seeder.js`. No se ejecutó el seeder ni la importación Odoo ni el envío SMTP sobre los datos del ERP.

## Verificación

| Comprobación | Resultado |
| --- | --- |
| Compilación y tipos estrictos | Aprobados para frontend y backend |
| Instalación limpia temporal | `npm ci`, tipos, compilación y pruebas aprobados sin `.env`, uploads, dist ni dependencias previas |
| Pruebas existentes | 44 aprobadas; una integración omitida en la suite unitaria y ejecutada por separado |
| Integración financiera aislada | 43 aprobadas: pagos mixtos, crédito, cambio, descuentos/PIN, IMEI, concurrencia, reintentos, abonos, caja, devoluciones, anulaciones, repuestos, materiales y PDF |
| Integración de combos | Aprobada en servidor compilado y PostgreSQL temporal; stock, seriales, snapshot y devolución |
| Dashboard | KPI, gastos, actividad, 14 tipos de detalle y gráficos en cuatro períodos aprobados |
| Reportes analíticos | Cartera, proveedores, flujo, métodos de pago, productos, inventario y ambos CSV aprobados |
| Nómina | Liquidación quincenal y generación de desprendible PDF aprobadas |
| Tareas programadas | Vencimiento de cuenta/factura comprobado; recordatorios/stock/canales desactivados no enviaron mensajes |
| Servidor local | Reiniciado desde `dist/server.js`; scheduler iniciado y cinco endpoints de lectura respondieron HTTP 200 |
| Navegación Chromium | Login/logout, permisos, carga de 20 módulos, seguimiento público, guardas DOM y limpieza de lector aprobados con escrituras simuladas |
| Móvil y escritorio | 80 vistas a 320, 390, 902 y 1440 px, sin errores JavaScript ni desbordes; escrituras bloqueadas |

Las integraciones escribieron exclusivamente en bases temporales propias y las eliminaron al finalizar. La comprobación del ERP existente fue de lectura. Las verificaciones financieras se conservan en `../2026-10-06/caja-facturas-results.json`; los grupos adicionales se registran en `phase4-isolated-results.json`. Las comprobaciones de recursos PDF verificaron logos persistentes y documentos válidos.

## Fronteras y compatibilidad

- El registro de respaldos adapta modelos heterogéneos con una aserción localizada después de comprobar la estructura del modelo. El descifrado devuelve `unknown`; cada fila se valida con Sequelize y se comprueban sus referencias antes de restaurar. No se usó `any` explícito, `@ts-ignore` ni `@ts-nocheck` en código de aplicación.
- `utils/sequelize-aggregate.ts` documenta dos opciones soportadas en ejecución por Sequelize 6 que faltan en sus declaraciones: `include` para agregados y expresiones `Literal` en `GROUP BY`. Las consultas y totales se verificaron en PostgreSQL real aislado.
- El respaldo conserva la interfaz interna de Sequelize para citar nombres de tablas, con una extensión de tipo localizada en `quoteBackupTable`. Mantiene su bloqueo transaccional, orden por dependencias y revocación de sesiones.
- Se conservaron las definiciones SQL y asociaciones de los modelos y las sentencias de migración aditivas existentes. Las pruebas comprobaron idempotencia sobre tablas existentes. Las conversiones explícitas de decimales y fechas preservan las coerciones que Sequelize realizaba anteriormente.
- Se retiraron opciones no soportadas por PDFKit que no tenían efecto (`bold`, `color`, `fw` en opciones de texto y alineación inicial de imagen). Los contenidos, importes y recursos persistentes siguen disponibles.

## Pendiente de fase 5

`allowJs` permanece en el backend para copiar y ejecutar siete pruebas heredadas JavaScript; no existen archivos JavaScript de aplicación. Hay dos suites TypeScript y tres archivos de tipos internos. Las herramientas `build.cjs` y `dev.cjs` siguen siendo CommonJS de arranque deliberadamente. La fase 5 debe separar esas pruebas de la compilación de aplicación y retirar `allowJs`, además de cerrar Docker/CI y el despliegue.

No se afirma haber verificado un contenedor en esta fase: Docker Engine no estuvo disponible en la comprobación anterior. Tampoco se publicaron cambios en GitHub ni se desplegó el servidor externo. El envío real de SMTP/Twilio/Gemini y una importación desde Odoo requieren entornos y credenciales de prueba; se verificaron sus tipos y las rutas desactivadas, no se enviaron mensajes ni se importaron datos reales.
