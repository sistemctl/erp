# Auditoría de móvil y escritorio — 7 de octubre de 2026

Se revisaron 20 módulos en Chromium con anchos de 320, 390, 902 y 1440 píxeles. Se comprobó el ancho de la página, la posición de los controles del encabezado, los elementos que sobresalen de sus paneles y los errores de JavaScript. Se capturaron pantallas antes y después de los cambios.

## Errores corregidos

| Hallazgo | Causa | Corrección |
| --- | --- | --- |
| Barra del logo parcial y espacio vacío en móvil y tablet | La regla del menú lateral mantenía su ancho de escritorio debajo de 992 px. | La barra ocupa todo el ancho; logo y botón de navegación tienen dimensiones adecuadas para móvil. |
| Controles de tema y usuario sobre el título y los filtros | El contenedor del encabezado permitía saltar de línea; una regla posterior volvía a mostrar los datos completos del usuario en móvil. | Se mantiene una fila con título flexible y controles compactos. Los detalles del usuario siguen disponibles en su menú. |
| Menú móvil abierto después de elegir otro módulo | La navegación no cerraba el componente de Bootstrap. | Se cierra al seleccionar un enlace en móvil o tablet. El botón también tiene nombre accesible y estado expandido. |
| Gráfico del Dashboard sobresalía al redimensionar | El canvas podía conservar temporalmente un ancho superior al contenedor. | Su ancho máximo se limita a la tarjeta. |
| Botones de cambio de tema pequeños para tocar | Medían 32 px. | Se ampliaron a 40 px en móvil y tablet. |

## Validación

- **80 vistas**: 20 módulos × 4 anchos; ninguna página desborda el ancho de la ventana, ningún control de usuario o tema baja fuera del encabezado y no hubo errores de JavaScript durante la navegación.
- **21 vistas de formularios**: Clientes, Proveedores, Reparaciones, Instalaciones, Inventario, Series y Nómina en 390, 902 y 1440 px. Se revisaron campos, encabezados y pies de las ventanas.
- Se comprobó que el menú móvil abre y cierra al navegar, que el menú de usuario cabe en pantalla y que el cambio de tema funciona.
- Compras y Reparaciones contienen tablas o tableros que se desplazan horizontalmente **dentro de su panel**. Este comportamiento permite consultar sus columnas y no desborda la página.

Módulos revisados: Dashboard, POS, Ventas, Cotizaciones, Clientes, Trade-In, Reparaciones, RMA, Instalaciones, Inventario, Series, Caja, Facturación, Cartera, Compras, Proveedores, Nómina, Rentabilidad, Reportes y Configuración.

## Evidencia

- [Resultados de las 80 vistas](responsive-after.json)
- [Resultados de formularios e interacciones](responsive-interactions.json)
- [Encabezado móvil corregido](responsive-after-header-390.png)
- [Dashboard a 902 px](responsive-after-dashboard-902.png)
- [Formulario de producto en móvil](responsive-form-inventario-390.png)

Scripts reproducibles: `verify.responsive.cjs` y `verify.responsive-interactions.cjs`. Los cambios están en `frontend/assets/css/custom.css`, `frontend/assets/js/app.js` y las versiones de los recursos en `frontend/index.html`.

La revisión utilizó emulación de tamaños en Chromium y la sesión de un administrador. Se bloquearon las escrituras de la auditoría: no se registraron ventas, cierres, productos ni cambios en datos reales. Las verificaciones no incluyen dispositivos físicos, Safari ni todos los estados de cada formulario.
