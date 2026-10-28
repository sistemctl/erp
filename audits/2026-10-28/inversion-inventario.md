# Inversión en inventario — entrega verificada

Se agregó Inversión después de Movimientos. Muestra el inventario al costo registrado por sede o consolidado, productos distintos con existencias, productos sin costo, desglose por sede y detalle paginado de 50 registros. Incluye productos inactivos con mercancía y excluye servicios y combos virtuales. La selección de sede y la página se conservan al alternar pestañas.

El endpoint autenticado `GET /api/inventario/inversion` permite únicamente superadmin, admin y gerente de sede; el gerente está limitado a su sede en el servidor. Las sumas se realizan con PostgreSQL numeric en una sola instantánea. Los importes viajan como texto decimal y se muestran con BigInt para conservar centavos incluso por encima del entero seguro de JavaScript.

## Comprobaciones completadas

- Compilación estricta de frontend y backend, sin errores.
- **49 comprobaciones nuevas correctas**, registradas en `inversion-results.json`.
- Exactitud decimal, costos cero, inactivos, combos con componentes, servicios, seriales, cantidades en metros, existencias cero y negativas, importes grandes, conteos distintos y paginación estable.
- Consolidado igual a la suma de sedes, sede vacía, validación de parámetros, seis roles, manipulación de sede y gerente sin sede.
- Consultas concurrentes con cambios de costo: resumen y detalle conservan la misma instantánea.
- Cambio de costo, entrada/salida de stock, traslado real por API y **recepción de compra seguida de venta reales por API**, exclusivamente en una base temporal aislada.
- Chromium y WebKit, temas claro y oscuro; 320, 390, 430, 624, 768, 902, 1130 y 1440 px. Sin desbordamiento horizontal ni errores JavaScript.
- Carga diferida, vacío, error y reintento, paginación, actualización entre módulos, escrituras de la propia vista, pestaña oculta, cambios rápidos de sede y salida del módulo con petición pendiente.
- **44 pruebas existentes correctas**, con una prueba de integración de combos omitida por su condición de ejecución habitual. La auditoría específica de inversión sí se ejecutó contra PostgreSQL real aislado.

La base temporal se eliminó al finalizar. No se crearon operaciones de prueba en el ERP real. No se modificó el esquema ni los procesos comerciales. Se reinició únicamente el servicio local iniciado en este chat y se verificaron salud HTTP 200, endpoint protegido con 401 sin sesión y recursos `3.0.113`.

## Capturas

- `chromium-inversion-320-light.png`: teléfono pequeño y tres pestañas accesibles.
- `chromium-inversion-1130-light.png`: resumen y desglose en escritorio.
- `webkit-inversion-624-dark.png`: presentación oscura en WebKit.
- El mismo directorio contiene las capturas de los demás tamaños y temas. Todas muestran datos ficticios de auditoría; el importe de las capturas no corresponde al negocio real.

Reproducción: `npm run build --prefix backend`, seguido de `node audits/2026-10-28/verify.inversion.cjs`. Documentación del comportamiento y contrato en `docs/inversion-inventario.md`.

La revisión física del teclado y las zonas seguras en un teléfono real sigue pendiente; la auditoría automatizada verifica la presentación mediante Chromium y WebKit.
