# Inversión en inventario

La pestaña Inversión está después de Movimientos. Muestra la mercancía actual al costo registrado: existencias positivas × `Producto.precioCosto`. Incluye productos inactivos, marcándolos; excluye servicios y combos virtuales para no contar sus componentes dos veces. Los productos con costo cero aportan $0 y se señalan como información incompleta.

Superadmin y admin pueden elegir una sede o Todas las sedes. Cada gerente solo consulta su sede. Cajeros, técnicos y contadores no tienen acceso a este reporte. La selección inicial coincide con la del catálogo; después la pestaña conserva su elección y página. Los contadores de productos son distintos por producto, aunque exista mercancía en varias sedes. Las cantidades mantienen su unidad (`und` o `m`); no se suman metros y unidades como si fueran equivalentes.

## API

`GET /api/inventario/inversion?sedeId=<uuid>&page=1`, autenticado mediante el mecanismo existente. Omitir sedeId significa todas las sedes para roles globales y la sede propia para un gerente. Una sede explícita ajena o vacía es rechazada para el gerente; nunca habilita un consolidado global. Página positiva; límite fijo de 50; una página fuera del rango se ajusta a la última disponible.

`InversionInventarioDTO` contiene `alcance`, `consultadoEn`, `resumen`, `sedes`, `items` y `pagination`. Los importes son cadenas decimales de dos posiciones. Una sola sentencia PostgreSQL calcula resumen, desglose, página y conteos con la misma instantánea MVCC y aritmética numeric. El navegador formatea el texto con BigInt, sin convertir el total a Number. La respuesta no se almacena en caché.

La pestaña carga al abrirse. Los cambios de productos, compras, ventas, inventario, seriales, servicio técnico y Trade-In actualizan el reporte visible o lo marcan para recarga al volver. Las respuestas atrasadas no reemplazan una sede más reciente ni actualizan una vista desmontada. Las escrituras de la propia vista también notifican cambios. No se modifican tablas ni procesos de venta, compra o traslado.

## Comprobación reproducible

1. `npm run build --prefix backend`.
2. `node --test backend/dist/tests/*.test.js`.
3. `node audits/2026-10-28/verify.inversion.cjs`.

La auditoría crea una base PostgreSQL con nombre propio validado, carga únicamente fixtures, inicia un servidor aislado en el puerto 3005 y elimina esa base al terminar. El navegador bloquea todas las escrituras. Las operaciones de costo, entrada, salida, traslado, recepción de compra y venta se prueban exclusivamente en la base temporal. Capturas y resultados se guardan en el directorio de la auditoría.

Esta cifra no es un historial de compras, utilidad ni valoración por costo promedio. Cambiar el costo registrado cambia el valor calculado de las existencias actuales. La comprobación en un teléfono físico del teclado y las zonas seguras sigue siendo independiente de la emulación del navegador.
