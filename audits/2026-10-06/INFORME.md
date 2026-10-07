# Auditoría de ERP TechStore — 6 de octubre de 2026

**Estado posterior:** las correcciones y sus pruebas se documentan en [CORRECCIONES.md](./CORRECCIONES.md). Este informe y las reproducciones conservan el estado encontrado antes de corregirlo.

Se encontraron errores de lógica y seguridad que afectan cobros, devoluciones, inventario, respaldos y permisos. Esta revisión incluye el código actual y los cambios locales de combos que estaban presentes al comenzar.

## Alcance y evidencia

- Revisión de servidor, rutas, autenticación, modelos, configuración, compras, caja, cartera, ventas, reparaciones, instalaciones y flujos del frontend.
- Comprobación de sintaxis de 171 archivos JavaScript: sin errores de sintaxis.
- `npm --prefix backend test`: una prueba de integración disponible, omitida al desactivar `RUN_DB_TESTS`. No hubo pruebas de integración aprobadas en esa ejecución.
- `node audits/2026-10-06/reproduce.cjs`: 15 reproducciones confirmadas. Se ejecutan controladores y módulos reales con persistencia simulada; la comprobación de clientes utiliza Chromium en una página vacía con tráfico bloqueado.
- `npm audit --omit=dev --json`: 9 paquetes señalados: 1 crítico, 4 altos y 4 moderados. Es el resultado del registro de npm; la posibilidad de explotar cada aviso depende del uso del paquete.

Los resultados completos están en [reproduction-results.json](./reproduction-results.json) y [dependency-audit.json](./dependency-audit.json). El script de reproducción está en [reproduce.cjs](./reproduce.cjs).

Las reproducciones aisladas prueban las ramas de lógica descritas. No equivalen a pruebas de extremo a extremo con PostgreSQL, ni permiten afirmar que estos errores ya hayan ocurrido en los datos reales. No se modificaron archivos de la aplicación ni registros del negocio durante esta auditoría.

## Hallazgos y prioridad

Alta: afecta dinero, inventario, recuperación de datos, disponibilidad o permisos. Media: interrumpe un flujo o provoca inconsistencias acotadas.

| ID | Prioridad | Problema | Evidencia |
|---|---|---|---|
| A01 | Alta | Ventas completadas sin pago y con totales inconsistentes | Reproducido |
| A02 | Alta | IVA fijo en artículos aunque esté desactivado | Reproducido |
| A03 | Alta | Descuentos que evitan la autorización del administrador | Reproducido |
| A04 | Alta | Transacciones abiertas al responder errores de validación | Reproducido en 6 operaciones |
| A05 | Alta | Devolución de más unidades que las vendidas | Reproducido |
| A06 | Alta | Una reparación entregada puede volver a sumar el cobro | Reproducido |
| A07 | Alta | Acceso a registros de otras sedes por identificador | Reproducido en reparaciones; otras rutas revisadas |
| A08 | Alta | Traslados de productos que dejan los seriales en el origen | Reproducido |
| A09 | Alta | Anulación de combos que no devuelve sus componentes | Reproducido |
| A10 | Alta | Copias de seguridad incompatibles con su restauración | Exportación y validación del modelo reproducidas |
| A11 | Alta | Desactivar usuarios o cambiar sus permisos no invalida sus sesiones | Middleware reproducido |
| A12 | Media | Un PIN incorrecto cierra la sesión del cajero | Reproducido |
| A13 | Alta | JavaScript inyectado en datos de clientes se ejecuta | Reproducido en Chromium |
| A14 | Alta | Ventas simultáneas pueden perder acumulados de caja | Intercalado de lecturas simulado |
| A15 | Alta | Una devolución puede reintegrar el IMEI de otra venta | Reproducido |
| A16 | Alta | Actualización de producción sin migración del campo de combos | Confirmado en código; depende del esquema existente |
| A17 | Media | Cotización aprobada sin quedar vinculada a su venta | Confirmado en código |
| A18 | Media | Consecutivos que pueden repetirse | Confirmado en código |
| A19 | Variable | Dependencias con avisos de seguridad | Consulta al registro de npm |

### A01. Venta sin pago y sin comprobar los totales

Ubicación: [ventas.controller.js:367](../../backend/controllers/ventas.controller.js#L367), creación de venta en la línea 373 y factura en la línea 534.

El servidor toma `subtotal`, `descuentoTotal`, `iva` y `total` del cuerpo de la petición. No comprueba que cuadren con los artículos ni que una venta de contado esté totalmente pagada. La validación del navegador puede evitarse haciendo una petición directa a la API.

Reproducción: artículo con subtotal de $10.000, `total: 1`, `pagos: []`, `esCredito: false`. La respuesta fue 201, la venta quedó `completada` y la factura `pagada`, sin recibir dinero. Los modelos permiten los valores utilizados en esta reproducción.

Corrección: calcular los importes en el servidor a partir de artículos y reglas de precios; validar montos finitos, no negativos y cobertura del pago antes de impactar caja o inventario.

### A02. IVA inconsistente entre factura y artículos

Ubicación: [ventas.controller.js:401](../../backend/controllers/ventas.controller.js#L401), cálculo de devolución en la línea 40. Configuración utilizada por el frontend: [pos.js:124](../../frontend/assets/js/modules/pos.js#L124).

Cada artículo guarda un IVA de `precioModificado * 0.19` aunque `cobrarIvaPos` sea falso o la tasa configurada sea distinta. La cabecera de factura usa el IVA enviado por el frontend, por lo que el detalle puede contradecirla. Las devoluciones suman el IVA del artículo.

Reproducción: factura de $10.000 con IVA desactivado; IVA de factura $0, IVA del artículo $1.900. El cálculo de devolución produce $11.900 por una compra de $10.000.

Corrección: aplicar una sola regla de IVA en el servidor y guardar el valor efectivamente cobrado en cada línea.

### A03. El porcentaje de descuento puede falsearse

Ubicación: [ventas.controller.js:324](../../backend/controllers/ventas.controller.js#L324).

La autorización depende del `descuentoPct` enviado por el cliente y de que el precio no esté por debajo del costo. No se calcula el descuento real frente al precio del catálogo.

Reproducción: precio de catálogo $10.000, costo $1.000, precio enviado $2.000 y `descuentoPct: 0`. Se aceptó un descuento real del 80 %, con límite configurado del 15 %, sin PIN.

Corrección: calcular el descuento efectivo desde el precio autorizado y solicitar el PIN según ese cálculo.

### A04. Las validaciones dejan transacciones abiertas

Ubicaciones representativas: [compras.controller.js:68](../../backend/controllers/compras.controller.js#L68), [series.controller.js:28](../../backend/controllers/series.controller.js#L28), [inventario.controller.js:102](../../backend/controllers/inventario.controller.js#L102), [reparaciones.controller.js:283](../../backend/controllers/reparaciones.controller.js#L283), [cartera.controller.js:102](../../backend/controllers/cartera.controller.js#L102).

Se abre una transacción antes de validar la petición y varias ramas hacen `return res.status(...).json(...)` sin `commit` ni `rollback`. El retorno normal no entra en el `catch`.

Se reprodujo en creación de compra, pago de compra, creación de serial, traslado, cambio de estado de reparación y abono de cartera. Todas respondieron 400/404 con la transacción todavía abierta. Con Sequelize real, estas conexiones permanecen reservadas; suficientes solicitudes de este tipo pueden agotar el pool y detener las operaciones.

Corrección: validar antes de abrir la transacción cuando sea posible y garantizar su cierre en todas las ramas, utilizando transacciones gestionadas o una salida centralizada.

### A05. Se admite devolver dos veces la misma línea

Ubicación: [ventas.controller.js:839](../../backend/controllers/ventas.controller.js#L839), aplicación de devoluciones en la línea 904.

La solicitud se valida línea por línea contra el saldo original. No se rechazan identificadores repetidos ni se acumula la cantidad solicitada antes de validar.

Reproducción: venta de una unidad; solicitud con dos filas del mismo `itemVentaId`, cada una con cantidad 1. Se aceptó, `cantidadDevuelta` quedó en 2 y se repusieron dos unidades al inventario. El importe de devolución también se calcula dos veces.

Corrección: agrupar o rechazar filas repetidas, validar el total solicitado y bloquear la venta y sus líneas durante la devolución para proteger también peticiones simultáneas.

### A06. Repetir la entrega duplica el ingreso registrado

Ubicación: [reparaciones.controller.js:298](../../backend/controllers/reparaciones.controller.js#L298), comprobación de factura existente alrededor de la línea 388.

Cada petición con `estado: 'entregado'` incrementa caja. La comprobación de factura existente ocurre después del incremento y solo evita crear otra factura. No se rechaza la transición de `entregado` a `entregado`.

Reproducción: reparación ya entregada y facturada por $10.000. Repetir la entrega cambió caja de $10.000 a $20.000.

Corrección: validar las transiciones de estado y hacer que la entrega y el cobro sean idempotentes dentro de una transacción con bloqueo de la orden.

### A07. El filtro de sede no se aplica a varios accesos por ID

Ubicación principal: [reparaciones.controller.js:76](../../backend/controllers/reparaciones.controller.js#L76). También se observa en edición de reparaciones, detalles y modificaciones de instalaciones, detalles de facturas y recepción/devolución de compras.

Los listados restringen la sede, pero varias operaciones usan `findByPk(id)` sin comprobar que el registro pertenezca a la sede del usuario. El middleware de roles comprueba el tipo de usuario; no verifica la sede del registro.

Reproducción: técnico de sede A solicitando una reparación de sede B. El controlador devolvió 200 con el registro de B. La ruta permite el rol técnico. En edición de reparación tampoco existe la comprobación equivalente.

Corrección: comprobar la sede del registro en cada lectura y modificación, con excepciones explícitas para los roles globales. Revisar también el uso directo de `bodySedeId` en abonos de cartera.

### A08. Los traslados no trasladan los IMEI

Ubicación: [inventario.controller.js:101](../../backend/controllers/inventario.controller.js#L101); petición del frontend en [inventario.js:2469](../../frontend/assets/js/modules/inventario.js#L2469).

El traslado actualiza cantidades de `StockSede` y movimientos, pero no selecciona seriales ni cambia su `sedeId`. El frontend tampoco envía los seriales trasladados.

Reproducción: traslado de un producto serializado de A a B; stock A pasó a 0, stock B a 1 y hubo cero actualizaciones de seriales. La venta exige encontrar el IMEI en la sede donde se vende, por lo que B puede tener cantidad disponible y no poder vender el equipo.

Corrección: exigir los seriales de los equipos trasladados y actualizar cantidades y seriales de forma atómica.

### A09. La anulación de factura no contempla los componentes de combos

Ubicación: [facturas.controller.js:171](../../backend/controllers/facturas.controller.js#L171).

Al vender un combo se descuenta el stock de sus componentes y se guarda `ItemVentaComponente`. La anulación solo recorre `ItemVenta` y suma stock al producto combo. No consulta los componentes vendidos ni recupera sus seriales. Este mismo bucle tampoco excluye productos de servicio.

Reproducción: anulación de una venta de combo; se incrementó el stock del combo en una unidad y no se reintegró ningún componente.

Corrección: usar los componentes originales guardados en la venta para restituir cantidades y seriales; excluir servicios del ajuste de inventario.

### A10. La copia exportada no puede restaurarse íntegramente

Ubicación: [config.controller.js:189](../../backend/controllers/config.controller.js#L189), listas de exportación en la línea 686 y restauración en la línea 718. Campo obligatorio: [Usuario.js:23](../../backend/models/Usuario.js#L23).

La exportación elimina `Usuario.password`, pero la restauración elimina primero los usuarios y después intenta insertarlos desde el archivo. `password` es obligatorio. Se confirmó que el usuario exportado falla la validación del modelo con `password cannot be null`; una tabla sincronizada con el modelo también exige ese campo. La transacción debería revertir el intento fallido, pero el respaldo no sirve para reconstruir usuarios.

Además, las listas omiten `ComboComponente`, `ItemVentaComponente`, `DevolucionVenta` e `ItemDevolucion`. La exportación incluye `ReclamoGarantia`, pero la restauración no lo incluye. Esto impide recuperar íntegramente los datos y relaciones actuales.

Corrección: definir un formato de respaldo recuperable para usuarios y secretos, incluir todos los modelos y dependencias, validar el archivo antes de borrar registros y comprobar restauraciones en una base separada.

### A11. Las sesiones conservan permisos antiguos

Ubicación: [auth.middleware.js:24](../../backend/middleware/auth.middleware.js#L24), modificaciones de usuarios en [config.controller.js:424](../../backend/controllers/config.controller.js#L424).

El middleware verifica la firma y expiración del JWT y acepta el rol y sede que contiene. No verifica que el usuario siga activo, exista o conserve esos permisos. Cambiar contraseña, desactivar o reducir el rol no invalida sus tokens ya emitidos. La duración predeterminada es de 8 horas.

Reproducción: token firmado de un usuario marcado como desactivado en el modelo simulado; la petición fue autorizada con rol `superadmin` sin consultar al usuario.

Corrección: verificar el estado actual del usuario y usar una versión de sesión o revocación persistente cuando cambien contraseña, rol, sede o actividad.

### A12. El PIN incorrecto se interpreta como sesión expirada

Ubicación: [api.js:35](../../frontend/assets/js/api.js#L35), respuestas de autorización en [ventas.controller.js:358](../../backend/controllers/ventas.controller.js#L358) y `caja.controller.js`.

El cliente elimina el token ante cualquier 401 distinto del login. Ventas y caja también devuelven 401 cuando falta el PIN o el PIN del administrador es incorrecto, aunque la sesión del cajero sea válida.

Reproducción: respuesta 401 con `PIN de Administrador incorrecto.`; se eliminaron los datos de sesión y se redirigió a `#/login`.

Corrección: distinguir la autenticación de sesión de la autorización de la operación mediante códigos de error y estados HTTP adecuados.

### A13. Inyección de JavaScript en el módulo de clientes

Ubicación: [clientes.js:135](../../frontend/assets/js/modules/clientes.js#L135), nombre en la línea 138 y ficha en la línea 281. Persistencia: [clientes.controller.js:60](../../backend/controllers/clientes.controller.js#L60).

Nombre, documento, teléfono, correo y dirección se interpolan directamente en `innerHTML`. El backend acepta texto en estos campos. Un usuario con permiso de crear o editar clientes puede guardar contenido que ejecute JavaScript cuando otro usuario abra el módulo. El token de sesión está en `localStorage`, accesible a ese código.

Reproducción en Chromium con el módulo real: un nombre que contenía una imagen con un manejador `onerror` ejecutó JavaScript y activó una variable de evidencia. Todo ocurrió en una página aislada con tráfico externo bloqueado.

Corrección: construir texto con `textContent` o escapar los datos antes de insertarlos en HTML. Revisar otros módulos que usan el mismo patrón; la reproducción de esta auditoría cubre clientes.

### A14. Dos ventas pueden sobrescribir los totales de caja

Ubicación: [caja-abierta.js:27](../../backend/utils/caja-abierta.js#L27), [ventas.controller.js:517](../../backend/controllers/ventas.controller.js#L517), y acumulados en cartera y reparaciones.

La caja se lee sin bloqueo y después se reemplazan sus totales con `saldoLeido + monto`. Dos transacciones que lean el mismo saldo pueden escribir resultados que omitan una de las ventas. Una transacción por sí sola no protege este patrón; bloquear el stock de un producto tampoco serializa ventas de productos distintos ni de servicios.

Reproducción del intercalado con persistencia simulada: dos ventas de $10.000 leyeron saldo 0; ambas confirmaron y el último valor escrito fue $10.000, cuando debían ser $20.000. No se ejecutó una carrera real contra PostgreSQL.

Corrección: incrementar columnas de forma atómica o bloquear y recargar la caja dentro de la transacción; proteger también el cierre de caja y los abonos concurrentes.

### A15. Devoluciones de equipos sin vínculo con su serial original

Ubicación: [ventas.controller.js:955](../../backend/controllers/ventas.controller.js#L955), anulación similar en [facturas.controller.js:212](../../backend/controllers/facturas.controller.js#L212). `ItemVenta` no conserva un identificador del serial vendido para productos individuales.

Para devolver un equipo se busca cualquier serie vendida del mismo producto y cliente, ordenada por actualización más reciente. La búsqueda no identifica la venta original. Con varias compras del mismo equipo por un cliente, o con Consumidor Final, puede seleccionarse otro IMEI.

Reproducción: dos seriales del mismo producto y cliente, vendidos en fechas distintas. Devolver la venta antigua dejó su serial como `vendido` y puso `en_stock` el serial de la venta más reciente.

Corrección: guardar el vínculo de cada serial con la línea de venta y exigir el serial específico al devolver.

### A16. Producción no migra el nuevo campo `esCombo`

Ubicación: [Producto.js:51](../../backend/models/Producto.js#L51), [server.js:117](../../backend/server.js#L117), configuración de entorno en [docker-compose.yml](../../docker-compose.yml).

Los cambios locales añaden `Producto.esCombo`. En producción se utiliza `sequelize.sync()` sin `alter`; eso no incorpora columnas a tablas existentes. Los ajustes explícitos de arranque solo cubren `tokenPublico` y `unidadMedida`. El Compose tampoco transmite `DB_SYNC_ALTER`.

En un despliegue con una base previa sin `esCombo`, las consultas actuales de productos incluyen una columna inexistente y pueden fallar. Es una condición de despliegue confirmada por el código, no un error observado en la base actual, cuyo esquema no se inspeccionó.

Corrección: añadir una migración explícita y repetible del esquema antes de desplegar el código de combos.

### A17. La cotización pierde la asociación con la venta

Ubicación: [pos.js:1310](../../frontend/assets/js/modules/pos.js#L1310), respuesta de venta en [ventas.controller.js:575](../../backend/controllers/ventas.controller.js#L575).

Después de vender una cotización, el frontend envía `ventaId: res.id`. La respuesta normal de ventas contiene `ventaId`, no `id`. `JSON.stringify` omite ese valor indefinido y el controlador de cotizaciones aprueba el documento con `ventaId: null`.

Corrección: usar `res.ventaId` y exigir un vínculo válido para aprobar una cotización mediante una venta.

### A18. Los consecutivos se calculan con cantidad de registros

Ubicación: [ventas.controller.js:363](../../backend/controllers/ventas.controller.js#L363), factura en la línea 527, devolución en la línea 890 y cotizaciones en `cotizaciones.controller.js`.

`count() + 1` permite que dos operaciones concurrentes obtengan el mismo número. Los modelos de ventas y facturas tampoco exigen unicidad del consecutivo. Borrar o restaurar registros con huecos también puede hacer que se reutilice uno existente.

Corrección: utilizar secuencias o un contador transaccional y restricciones de unicidad para los números de documentos.

### A19. Dependencias señaladas por npm

Resultado completo: [dependency-audit.json](./dependency-audit.json). Versiones tomadas de `backend/package-lock.json`.

| Paquete | Versión | Severidad del registro |
|---|---|---|
| proxy-addr | 2.0.7 | Crítica |
| axios | 1.18.1 | Alta |
| ip-address | 10.2.0 | Alta |
| multer | 2.2.0 | Alta |
| nodemailer | 6.10.1 | Alta |
| moment | 2.30.1 | Moderada |
| qs | 6.15.2 | Moderada |
| sequelize | 6.37.8 | Moderada, por dependencia de uuid |
| uuid dentro de sequelize | 8.3.2 | Moderada |

El [aviso de proxy-addr](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) requiere una configuración específica de subredes de confianza IPv6. El servidor actual usa `trust proxy: 1`; esta auditoría no encontró esa configuración concreta y no demuestra que el aviso crítico sea explotable en este proyecto. El [aviso de Nodemailer sobre análisis de direcciones](https://github.com/advisories/GHSA-rcmh-qjqh-p98v) afecta las versiones indicadas por npm.

Corrección: revisar actualizaciones compatibles y las rutas que utilizan cada dependencia. La sugerencia automática para Sequelize propone una versión antigua y Nodemailer requiere un cambio de versión mayor; las propuestas del registro necesitan revisión de compatibilidad.

## Orden de corrección propuesto

1. A13, A01, A03, A07 y A11: ejecución de código, cobros y permisos.
2. A04 y A10: continuidad de operación y recuperación de datos.
3. A05, A06, A14 y A02: devoluciones, duplicación de ingresos y acumulados de caja.
4. A08, A09, A15 y A16: trazabilidad de equipos, combos y despliegue.
5. A12, A17, A18 y actualización revisada de dependencias.

Tras corregirlos, verificar con PostgreSQL aislado: ventas y caja simultáneas, repetición de entrega, devolución parcial y total, seriales por venta, anulación de combos, bloqueo entre sedes y restauración de una copia completa. La prueba existente cubre un flujo de combos y necesita una caja abierta; todavía no cubre el conjunto de fallos encontrado.
