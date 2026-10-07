# Verificación ampliada: caja, facturas y PostgreSQL

Esta revisión responde a la solicitud de verificar caja, facturas y PostgreSQL y buscar más errores. Se interpretó “futuras” como “facturas”. **El 6 de octubre se confirmaron 11 fallos adicionales. Se corrigieron y activaron en la instancia local el 7 de octubre de 2026.** Detalles en [RESOLUCION-CAJA-FACTURAS.md](./RESOLUCION-CAJA-FACTURAS.md).

## Instancia en uso

Se comprobó la API local en `http://127.0.0.1:3000/api/health` y se hicieron consultas SQL en una transacción de solo lectura contra la base configurada del proyecto. Se confirmó PostgreSQL **18.3** y la presencia de los cuatro campos agregados por la migración de las correcciones anteriores.

| Comprobación de los registros actuales | Resultado |
|---|---|
| Cajas existentes / abiertas | 2 / 1 |
| Sedes con varias cajas abiertas | 0 |
| Facturas con `subtotal + iva` distinto del total | 0 de 13 |
| Números de factura duplicados | 0 |
| Factura y venta con totales distintos | 0 de 8 facturas vinculadas a ventas |
| Referencias de factura a venta o sede inexistente | 0 |
| Cajas con los acumulados negativos comprobados | 0 |
| Facturas anuladas con cartera pendiente cobrable | 0 |
| Artículos serializados activos sin vínculo al IMEI vendido | 0 |

Los resultados están en [live-database-verification.json](./live-database-verification.json). Estas comprobaciones no reconstruyen todo el historial financiero ni demuestran que todos los movimientos de caja sean correctos.

## Pruebas de flujos

Se ejecutaron los controladores reales por HTTP con Sequelize y PostgreSQL en una base nueva y temporal. Las pruebas de apertura, cierre, egresos, ventas, abonos y anulaciones utilizaron exclusivamente esa base, eliminada al finalizar. Las notificaciones externas estuvieron desactivadas.

Resultado inicial del 6 de octubre: **34 casos: 23 aprobados y 11 fallidos**. Incluyó 18 pruebas de las correcciones anteriores y 16 comprobaciones adicionales de caja/facturas. Los fallos descritos a continuación se reprodujeron; no fueron suposiciones basadas únicamente en leer el código.

Resultado tras las correcciones del 7 de octubre: **43 casos aprobados y 0 fallidos**, con nueve comprobaciones nuevas de regresión. La evidencia actual está en [caja-facturas-results.json](./caja-facturas-results.json).

## Errores confirmados en la revisión inicial (corregidos)

| Prueba | Prioridad | Problema y reproducción | Ubicación |
|---|---|---|---|
| CF02 | Alta | Dos peticiones simultáneas de apertura para la misma sede reciben 201 y crean dos cajas abiertas. La comprobación previa y la creación no son una operación atómica. | [caja.controller.js:17](../../backend/controllers/caja.controller.js#L17) |
| CF03 | Alta | Una caja con $10.000 recibidos por tarjeta se cierra enviando `totalVentasTarjeta: 0`; su acumulado queda en cero. El cierre reemplaza ingresos reales con los importes enviados por el navegador. También afecta otros medios electrónicos. | [caja.controller.js:227](../../backend/controllers/caja.controller.js#L227) |
| CF04 | Media | Se acepta un cierre con efectivo contado de -$100, devuelve 200 y cierra la caja. Falta validar que los importes declarados sean finitos y no negativos. | [caja.controller.js:216](../../backend/controllers/caja.controller.js#L216) |
| CF05 | Alta | Un cajero obtiene el detalle Z de una caja de otra sede, con HTTP 200. La función recibe el usuario pero no comprueba la sede; también alimenta el PDF Z. | [caja.controller.js:710](../../backend/controllers/caja.controller.js#L710) |
| CF10 | Alta | Se vende por tarjeta en una caja, se cierra, se abre otra y se registra una nueva venta de $10.000. Al anular la factura de la caja antigua, la caja nueva pierde los $10.000 de la nueva venta. La anulación busca la caja actualmente abierta, sin identificar la sesión original. | [facturas.controller.js:229](../../backend/controllers/facturas.controller.js#L229) |
| CF11 | Alta | Venta a crédito: pago inicial de $2.000 en efectivo y abono posterior de $8.000 por tarjeta. Al anular, se borran el abono y la cartera, pero los $8.000 permanecen en los acumulados de caja. | [facturas.controller.js:259](../../backend/controllers/facturas.controller.js#L259) |
| CF12 | Media | Se paga un abono de cartera de $10.000 dentro de la sesión. El reporte Z devuelve `abonos: []`, omitiendo el movimiento. | [caja.controller.js:769](../../backend/controllers/caja.controller.js#L769) |
| CF13 | Media | Una venta pagada por tarjeta aparece en el detalle Z como “Efectivo”. Se consulta `Venta.metodoPago`, que no contiene el desglose de `PagoVenta`. | [caja.controller.js:750](../../backend/controllers/caja.controller.js#L750) |
| CF14 | Alta | Se entrega y cobra una reparación por $10.000 con tarjeta. Al anular su factura, el ingreso permanece en caja. La rama de reparaciones cancela la orden y reintegra repuestos, pero no concilia el cobro. | [facturas.controller.js:266](../../backend/controllers/facturas.controller.js#L266) |
| CF15 | Alta | Se cobra una instalación por $10.000 con tarjeta y se anula su factura. La caja conserva los $10.000 y la orden sigue entregada. No se aplica una reversión equivalente a las otras clases de factura. | [facturas.controller.js:175](../../backend/controllers/facturas.controller.js#L175) |
| CF16 | Alta | Se factura una instalación a crédito y se anula. Su cuenta por cobrar permanece activa; un abono posterior se acepta con 201 y cambia la factura anulada a “pagada”. La anulación y la validación de abonos no protegen ese estado. | [facturas.controller.js:175](../../backend/controllers/facturas.controller.js#L175), [cartera.controller.js:102](../../backend/controllers/cartera.controller.js#L102) |

## Casos adicionales que sí funcionan

- Apertura, venta con efectivo y cambio, egreso y cierre con diferencia cero; venta rechazada cuando la caja está cerrada.
- Egreso superior al efectivo disponible rechazado y PIN incorrecto rechazado sin revocar la sesión.
- Factura POS pagada vinculada correctamente a su venta; generación de PDF y rechazo de consulta desde otra sede.
- Abono que liquida la cartera actualizando factura, venta y caja de la sede correcta; rechazo de un abono posterior sobre saldo cero.
- Anulación simple de una venta POS dentro de la misma sesión: restitución de stock, reversión del pago y rechazo de una segunda anulación.

## Evidencia y repetición

Resultados completos en [caja-facturas-results.json](./caja-facturas-results.json). Los escenarios están en [caja-facturas.checks.cjs](./caja-facturas.checks.cjs) y se ejecutan mediante el aislamiento de [verify.integration.cjs](./verify.integration.cjs).

```powershell
npm --prefix backend run test:audit:caja-facturas
```

La ejecución necesita permiso para crear una base temporal y termina con código 1 si existen casos fallidos. Las pruebas de cobros y anulaciones utilizan exclusivamente esa base temporal. Las correcciones actuales también incluyen una migración aditiva aplicada a la base local, sin reconstruir ni alterar automáticamente los cobros históricos.

## Orden de corrección aplicado

1. Evitar cobros de facturas anuladas y comprobar permisos de sede en los reportes Z.
2. Identificar la sesión de caja de cada cobro y conciliar abonos, reparaciones e instalaciones al anular, preservando el historial financiero.
3. Serializar aperturas y conservar los ingresos registrados al cerrar; almacenar el arqueo declarado por separado.
4. Reconstruir el detalle Z desde los pagos y abonos reales y validar los importes del cierre.
