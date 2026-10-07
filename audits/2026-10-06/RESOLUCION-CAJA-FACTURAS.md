# Resolución de caja y facturas — 7 de octubre de 2026

Los 11 fallos de la revisión inicial están corregidos. El backend local se reinició con el código actualizado y la migración aditiva aplicada.

## Cambios

| Casos | Corrección |
|---|---|
| CF02 | La apertura bloquea la sede dentro de la transacción antes de consultar y crear la caja. Conserva la configuración de caja compartida o individual. |
| CF03–CF04 | El cierre conserva todos los ingresos registrados y valida importes finitos y no negativos. Guarda el arqueo declarado y los ingresos al cierre por separado. |
| CF05 | El detalle Z y su PDF verifican acceso a la sede de la caja. |
| CF10–CF11 | La factura conserva la caja y el desglose neto del cobro inicial; cada abono conserva su propia caja. La anulación concilia cada sesión original, incluidos medios personalizados, sin descontar financiación diferida ni trade-in. |
| CF12–CF13 | El Z consulta los pagos reales, abonos y servicios vinculados a la sesión. Muestra medios mixtos y los reversos. El PDF también incluye abonos, servicios y reversos. |
| CF14–CF15 | Reparaciones e instalaciones guardan sus cobros y los revierten al anular. Las órdenes se cancelan y se reintegran sus repuestos/materiales; en instalaciones se reintegran los seriales originales. |
| CF16 | La cartera anulada queda sin saldo cobrable y fuera del listado activo. El abono bloquea la factura y la cuenta antes de cobrar, impidiendo reactivar una factura anulada incluso con peticiones concurrentes. |

Los abonos y cuentas anulados se conservan con una fecha de anulación. Se ajustó CF11 para verificar que el historial se conserva y el dinero se revierte, en vez de exigir que los registros se eliminen. La bitácora financiera muestra tanto los cobros originales como sus reversos, y aplica los filtros de fecha a ambos.

Los acumulados de la sesión original se concilian al anular, aunque esté cerrada. El arqueo, la diferencia y la copia de ingresos al momento del cierre se conservan; las anulaciones posteriores aparecen como reversos con su fecha.

## Verificación

- **43 pruebas HTTP/PostgreSQL aprobadas, 0 fallidas**: las 18 regresiones anteriores, los 16 casos originales de caja/facturas y nueve comprobaciones adicionales. Incluye concurrencia entre abono y anulación, cambios entre sesiones, medios personalizados, financiación diferida, arqueo, permisos del PDF, inventario serializado y migración idempotente.
- **11 pruebas unitarias aprobadas**. El test de combos se omite en el comando unitario y se ejecuta expresamente en la integración temporal.
- Sintaxis comprobada en los controladores modificados, utilidades, migración, scripts, servidor y módulo de caja del frontend.
- Migración local: ocho columnas verificadas y conteos de cajas, facturas, abonos y cartera conservados.
- Tras reiniciar el backend, cinco endpoints locales de lectura respondieron HTTP 200, incluidos cartera, movimientos, detalle Z y detalle de factura con los campos nuevos.

Evidencia: [integración](./caja-facturas-results.json), [migración local](./caja-facturas-migracion-live.json) y [comprobación HTTP local](./caja-facturas-smoke-live.json).

```powershell
npm.cmd --prefix backend test
npm.cmd --prefix backend run test:audit:caja-facturas
```

La integración crea y elimina una base independiente; no registra ventas ni anulaciones en los datos del negocio. La comprobación HTTP local utiliza un token temporal de 60 segundos para solicitudes de lectura; no se imprime ni se guarda.

## Datos históricos

La migración no inventa vínculos o desgloses ausentes. Para cobros POS y abonos históricos, se recupera la sesión por sede y fecha sólo si existe una candidata inequívoca. Los importes inconsistentes, las sesiones ambiguas y las facturas antiguas de servicios sin desglose suficiente se bloquean con HTTP 409 antes de modificar el dinero o el inventario; requieren conciliación con evidencia del negocio. El Z advierte de los registros históricos sin información suficiente.

La migración se ejecuta automáticamente al iniciar el servidor. También se puede aplicar desde `backend` con `node scripts/migrate-caja-facturas.js`. En esta activación local se usó `DB_SYNC_ALTER=false` para aplicar las migraciones explícitas sin una alteración general de Sequelize.
