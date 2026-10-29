# Corrección de productos por metros — 3.0.114

Trabajo realizado en `sistemctl/erp`, rama `3.0`. Esta entrega prepara la publicación de la corrección completa en GitHub; la activación del backend en producción se mantiene pendiente.

## Resultado

Una unidad de inventario de un producto `m` representa un metro. El formulario del producto identifica costo y venta por metro. Compras ofrece una calculadora con costo total de un rollo, longitud y número de rollos: convierte una vez y envía únicamente metros y costo/m al carrito y al backend.

Se conservan centavos en compras, instalaciones y abonos. El costo por metro se redondea a dos posiciones con mitad hacia arriba; cuando dividir el rollo no produce un número exacto de centavos, la vista previa informa el total calculado y advierte su diferencia respecto al costo introducido. La API rechaza mezclar el rollo con valores ya convertidos.

CSV conserva campos vacíos y comillas, admite conversión explícita de costo de rollo con longitud conocida y no modifica productos con códigos ya existentes. El stock de una importación se asigna a la sede elegida, sin duplicarlo en las otras sedes. `stock` siempre expresa metros, también cuando el costo procede de un rollo. Los precios de venta permanecen por metro.

Instalaciones descuenta metros y mantiene los costos/precios unitarios en esa unidad. Inversión multiplica metros disponibles por costo/m y muestra la unidad junto al costo. Se rechazan cantidades fraccionarias bajo el esquema entero actual, sin truncarlas. La edición de stock conserva `35.000` como 35, sin eliminar el punto para producir 35000.

## Datos ficticios comprobados

| Producto | Compra | Costo registrado | Consumo en instalación | Existencias | Inversión |
|---|---:|---:|---:|---:|---:|
| Cable A | 100 m por $80.000 | $800/m | 65 m | 35 m | $28.000 |
| Cable B | 305 m por $183.000 | $600/m | 105 m | 200 m | $120.000 |

Total restante: **$148.000**, frente a una compra de $263.000 y materiales consumidos por $115.000.

## Comprobaciones

- Compilación estricta de frontend y backend correcta.
- **50 pruebas unitarias correctas**, incluidas seis nuevas de conversión, redondeo, idempotencia, validación, CSV y paridad de cálculo entre navegador y servidor. Una prueba opcional de integración de combos permanece omitida en la suite unitaria habitual.
- **23 comprobaciones de metros correctas**: API real contra PostgreSQL temporal, recepción de compras, materiales de instalación, inversión, formato canónico, rechazo de doble conversión, abonos con centavos, protección de datos antiguos y formularios en Chromium y WebKit, a 390 y 1440 px.
- **18 regresiones financieras correctas**, en otra base temporal independiente.
- Las bases temporales se eliminaron al terminar. Las escrituras del navegador se interceptaron y no alcanzaron ningún servidor real.

La auditoría incluye una importación por rollo de 305 m con stock de 200 m: guarda exactamente 200, no 200 × 305. Comprueba asimismo que recibir no vuelve a dividir el costo y que un segundo intento de recepción no duplica stock. Una compra canónica de costo 800,45/m conserva ese precio; $100 / 3 m produce 33,33/m y total 99,99, coherente con la vista previa.

## Protección y activación

No se ejecutó una conversión masiva, migración de datos ni corrección de registros reales. El cambio de unidad de un producto con existencias o historial se rechaza para evitar reinterpretar cantidades antiguas sin longitud confirmada. No se modificó el esquema de cantidades ni se infirió la longitud desde nombres de productos.

El costo particular de una nueva orden se guarda por metro; no sobrescribe automáticamente el costo registrado de un SKU antiguo. Revisar un precio antiguo de rollo exige conocer su longitud y hacerlo mediante una actuación manual separada.

El backend está compilado y probado, pero **su reinicio de activación queda pendiente**. El proceso conectado a datos reales continúa con el backend cargado anteriormente: su arranque actual ejecuta migraciones e inicializa datos, por lo que no se reinició dentro de la restricción de no modificar producción. Los recursos frontend compilados están en revisión `3.0.114`.

## Evidencia reproducible

- `node audits/2026-10-29/verify.metros.cjs`: informe `metros-results.json` y capturas `chromium-rollo-*.png`, `webkit-rollo-*.png`, `chromium-inversion-metros.png` y `webkit-inversion-metros.png`.
- `node --test backend/dist/tests/*.test.js`: pruebas unitarias.
- `node audits/2026-10-06/verify.integration.cjs`: regresiones financieras.
- `docs/productos-por-metros.md`: comportamiento, redondeo, API y CSV.

Las capturas y resultados generados permanecen locales, excluidos del repositorio público. La prueba física del teclado y las zonas seguras de un teléfono no se sustituye por la emulación.
