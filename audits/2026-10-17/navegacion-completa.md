# Todos los módulos en la navegación móvil

La barra inferior incluye todos los módulos que permite el rol, conservando Vender, Caja, Inventario e Inicio como primeros accesos cuando están disponibles. Los demás continúan en la misma fila. Se recorre con el dedo o con las flechas, sin desplazar horizontalmente el documento. Más permanece fijo y conserva el listado agrupado y su buscador.

Los accesos tienen un ancho mínimo de 80 px, icono y etiqueta de 12 px. Los nombres completos permanecen en la etiqueta accesible. El módulo activo se revela al navegar y al cambiar de tamaño; el foco de teclado también revela su destino. Las flechas desaparecen cuando todos los accesos caben. La barra conserva su altura y el espacio reservado para el carrito y el cobro del POS. Escritorio mantiene su menú lateral.

El controlador pertenece a la sesión y elimina sus eventos y observador al salir. El ajuste del observador se programa en el siguiente cuadro para evitar avisos de ResizeObserver en WebKit. No cambian permisos, solicitudes, API ni base de datos. HTML, CSS y módulos utilizan la revisión `3.0.111`.

## Verificación

- Compilación estricta de frontend y backend mediante `npm run build --prefix backend`.
- Auditoría reproducible: `node audits/2026-10-17/verify.mobile-navigation.cjs`.
- Chromium y WebKit; anchos de 320, 390, 430, 624, 768, 902 y 1440 px; los seis roles y tres tamaños del carrito del POS.
- Comprueba coincidencia entre los módulos autorizados del menú lateral, la barra y Más; recorrido hasta ambos extremos; foco; selección desde Más; búsqueda; Escape; cambio a escritorio y retorno a móvil; controles táctiles; ausencia de desbordamiento; separación del carrito y cierre de sesión.
- Capturas en 390 y 624 px, en tema claro y oscuro. El servidor de auditoría es temporal, sus respuestas de API son simuladas y todas las escrituras están bloqueadas. No usa la base de datos ni modifica registros reales.

La compilación final superó 32 escenarios sin errores JavaScript: 28 en la ejecución principal y cuatro en la repetición focalizada de WebKit. Esta última incluye técnico a 320 px y POS a 320, 390 y 624 px. La auditoría se ajustó para considerar el ancho útil de WebKit (su barra de desplazamiento puede reservar espacio) y esperar el ajuste de la barra al terminar de cerrar Más. No se cambió la compilación entre esas dos ejecuciones.

`mobile-navigation-results.json` contiene los cuatro resultados de la repetición final (`--engine=webkit --remaining`). Ejecutar el script sin argumentos vuelve a comprobar los 32 escenarios. Capturas: `chromium-navegacion-390.png`, `chromium-navegacion-624.png` y sus variantes de WebKit y tema oscuro.

La interacción táctil física y las zonas seguras de un teléfono real siguen pendientes de comprobación en dispositivo.
