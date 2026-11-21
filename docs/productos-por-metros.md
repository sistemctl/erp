# Productos vendidos por metros

`unidadMedida = "m"` significa que cada unidad de inventario es un metro. `Producto.precioCosto`, `Producto.precioVenta`, el precio unitario de una compra y los costos/precios de materiales de instalación son por metro. El reporte de inversión multiplica los metros restantes por el costo registrado del producto, sin aplicar otro factor de rollo.

## Compras

Al elegir un producto en metros, el formulario permite ingresar directamente el costo por metro o calcularlo desde el costo total de un rollo, sus metros y la cantidad de rollos. La vista previa calcula automáticamente los metros y el costo por metro; el carrito guarda exclusivamente esos valores canónicos. Cambiar de producto limpia los datos del rollo: no se deduce su longitud del nombre, del código ni de existencias antiguas.

El costo por metro se redondea a dos decimales con redondeo de mitad hacia arriba. Cuando no hay división exacta, la vista previa advierte que el total calculado puede diferir del costo total introducido. Por ejemplo, $100 / 3 m produce $33,33/m y una línea de $99,99. Esto conserva la precisión de dos decimales de las columnas existentes; no se almacenan fracciones ocultas de centavo. Los abonos conservan esos centavos.

La API de compras conserva el formato existente `cantidadPedida` y `precioUnitario`, que siempre representan unidades de inventario y precio por unidad. También acepta una entrada explícita:

```json
{
  "productoId": "ID_DEL_CABLE",
  "presentacion": "rollo",
  "costoTotalRollo": "80000.00",
  "metrosPorRollo": 100,
  "cantidadRollos": 1
}
```

Se normaliza una vez a 100 m y $800/m. No puede combinarse con `cantidadPedida` o `precioUnitario` ya convertidos. Los formularios envían `presentacion: "unidad"` y los valores canónicos; al guardar, consultar o recibir no se vuelven a dividir. Recibir solo incorpora la cantidad de metros pedida. Cada producto ocupa una línea por orden; si tiene otro costo, se debe revisar esa línea en lugar de mezclarlo silenciosamente con el costo anterior.

El costo particular de una compra no sobrescribe automáticamente el costo de valoración de un producto antiguo. Esa política se conserva: el costo registrado del producto se mantiene explícitamente por metro, y cualquier corrección de datos históricos exige revisar su longitud real. Tampoco se calcula el precio de venta a partir del costo del rollo.

## Importación CSV

Los precios ordinarios del CSV ya son por unidad de inventario. Para metros:

```csv
nombre,codigoBarras,precioVenta,precioCosto,categoriaNombre,unidadMedida,stock
Cable A,CABLE-A,1200,800,Cables,m,35
Cable B,CABLE-B,1000,600,Cables,m,200
```

Para convertir un costo de rollo de forma explícita, deje `precioCosto` vacío y añada `presentacionCosto=rollo`, `costoTotalRollo` y `metrosPorRollo`. `precioVenta` permanece por metro y `stock` siempre expresa metros, incluso en ese modo. Los importes se ingresan sin separadores de miles.

La importación conserva las columnas vacías y las comillas escapadas. Los códigos existentes se omiten; sus valores no se recalculan. El stock inicial se carga únicamente en la sede elegida y queda en cero en las otras sedes: no se replica una misma cantidad en todas ellas.

## Protección de datos existentes

No hay migración ni conversión automática de productos, compras o materiales antiguos. Se rechaza cambiar la unidad de un producto con existencias o historial, porque reinterpretaría cantidades antiguas sin conocer la longitud real. Debe crearse un producto correcto o preparar una revisión manual explícita por separado.

Se mantiene el esquema actual de cantidades enteras: los productos en `m` utilizan metros completos. Las fracciones se rechazan; no se truncan, ni se eliminan sus separadores convirtiendo, por ejemplo, 35.5 en 355. Ampliar el inventario a fracciones de metro requiere una modificación de esquema independiente.

## Verificación

- `npm run build --prefix backend`.
- `node --test backend/dist/tests/*.test.js`.
- `node audits/2026-10-29/verify.metros.cjs`.
- `node audits/2026-10-06/verify.integration.cjs`.

Las pruebas usan bases PostgreSQL temporales con nombres propios verificados y las eliminan al finalizar. El navegador intercepta todas las escrituras. La paridad entre la calculadora del navegador y el normalizador del backend se comprueba automáticamente sobre los mismos casos de conversión y redondeo.

La activación de las nuevas validaciones del backend requiere reiniciar el proceso. No se reinició el servicio conectado a datos reales durante esta entrega: su arranque actual ejecuta migraciones e inicialización de datos, fuera de la restricción de no modificar producción.
