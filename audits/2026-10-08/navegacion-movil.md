# Navegación móvil basada en la captura

Se adaptó el ERP de `C:/Proyectos/erpnext`, usando la captura del administrador de RestoManager como referencia. No se modificó la aplicación de localhost:3001.

- Cabecera móvil en una fila: marca, acciones rápidas, tema y usuario. Se eliminó la fila adicional del menú lateral en pantallas menores de 992 px.
- Navegación inferior fija con iconos y etiquetas. Prioriza Vender, Caja, Inventario e Inicio cuando el rol los permite; completa los accesos con módulos del mismo rol.
- “Más” abre un modal Bootstrap con todos los módulos permitidos, agrupados por sección. Incluye Escape, cierre, desplazamiento y retorno del foco. Resalta el módulo actual tanto en la barra como en el listado.
- Espacio inferior para el contenido y la zona segura del teléfono. Carrito y botón de cobro del POS encima de la barra.
- Diseño de escritorio, roles y operaciones existentes conservados. Caché de recursos actualizada a 3.0.109.

## Comprobaciones

Compilación estricta de frontend y backend correcta. Las 44 pruebas existentes pasan (una integración de base omitida en el comando unitario).

La auditoría `verify.mobile-menu.cjs` usa Chromium y un servidor estático temporal con API simulada. Comprueba cinco anchos (320, 390, 637, 902 y 1440), seis roles, permisos, navegación, foco y ausencia de errores JavaScript. Incluye dos escenarios del carrito en 320 y 390 px y modo oscuro. Resultados en `mobile-menu-results.json`; imágenes en `mobile-menu-637.png`, `mobile-menu-desktop.png` y `mobile-navigation-dark.png`.

No se crearon ventas ni se modificaron datos reales. El servidor del ERP en el puerto 3000 sigue detenido como pidió el usuario. Para ver los cambios, iniciar `npm start` desde `C:/Proyectos/erpnext/backend` y recargar la página.
