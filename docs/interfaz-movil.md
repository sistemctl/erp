# Interfaz móvil del ERP

La interfaz utiliza la identidad azul y Plus Jakarta Sans del ERP. El acceso a los módulos y a sus acciones sigue dependiendo de los permisos existentes. No requiere cambios de API, esquema de datos ni servicios externos.

## Presentación adaptable

- Menos de 768 px: resúmenes por registro, filtros secundarios en un modal y secciones numerosas mediante un selector. Una acción principal en la cabecera; operaciones secundarias en Acciones o en el menú existente.
- Entre 768 y 991 px: registros en dos columnas y tablero de taller en dos columnas, con navegación inferior. Formularios y filtros conservan la distribución de tableta.
- Desde 992 px: tabla y controles originales de escritorio. Cambiar de tamaño restaura los mismos nodos y manejadores; no genera otra consulta ni duplica formularios.
- Dashboard: resultado principal de ancho completo; indicadores secundarios en dos columnas desde 390 px y una columna por debajo.
- Login: una columna hasta 991 px, formulario centrado de ancho máximo de 480 px e ilustración desde 992 px. En vistas bajas se puede desplazar hasta el botón de acceso. La auditoría comprueba también el recorte dentro del panel, además del ancho del documento.

`mobile.css`, cargado después de `custom.css`, concentra la navegación móvil y los patrones compartidos. Los controles tienen objetivos de 44 px; campos de 16 px, títulos de módulo de 20 px y etiquetas de navegación de 12 px. Las separaciones usan 8, 12 y 16 px. Tema oscuro, contraste de campos y foco utilizan los tokens existentes.

## Registros, formularios y filtros

`mountMobileUI` aplica una política tipada para los 20 módulos del registro de navegación. Conserva los datos del DOM y las acciones originales: el nombre, el dato principal y el estado quedan visibles; Detalles expande la información secundaria. Las tablas analíticas conservan comparación por columnas y desplazamiento dentro de su contenedor. Las plantillas de factura, cotización y recibo están excluidas para preservar impresión y PDF.

Los filtros conservan sus controles reales y su asociación al formulario original. Su contador indica cambios respecto a los valores de apertura. Limpiar filtros vuelve a esos valores, conservando fechas y sede predeterminadas; no amplía permisos ni reinicia la búsqueda. Ver resultados invoca la acción de filtrado existente.

Los formularios extensos usan el espacio completo del teléfono, con desplazamiento del cuerpo y acciones accesibles. Los errores de validación se presentan junto al campo. Mientras se procesa una escritura, el formulario indica `aria-busy`, bloquea sus botones de envío y rechaza otro submit; al fallar conserva el borrador y permite reintentar. La captura del origen del envío contempla que Safari no enfoque el botón al tocarlo.

Las consultas distinguen carga y error de una lista vacía. Reintentar usa la actualización del módulo sin recargar la página. Configuración preserva sus campos durante el reintento. El seguimiento público incluye Volver a consultar. Las notificaciones móviles aparecen debajo de la cabecera, fuera de la navegación y del cobro inferior.

## Ciclo de vida y compatibilidad

El router cierra modales antes de desmontar la vista y destruye observadores, eventos y adaptaciones al salir. El buscador de Más filtra únicamente módulos ya permitidos. El estado activo y el retorno del foco se conservan. `visualViewport` adapta el espacio visible y oculta la barra inferior al detectar teclado; cambiar orientación no se considera por sí solo una apertura de teclado.

La barra inferior incluye todos los módulos permitidos por el rol en una fila desplazable. Se recorre deslizando o usando las flechas; Más permanece fijo como acceso al listado agrupado y su buscador. Los accesos conservan icono, etiqueta y un mínimo táctil de 44 px. Al navegar o cambiar de tamaño, el módulo activo se revela desplazando únicamente la barra. El controlador de navegación pertenece a la sesión y limpia sus eventos y observador al salir.

Los recursos HTML, CSS y módulos usan la revisión `3.0.114`. Se ejecutan desde los artefactos de `dist`, mediante los comandos existentes del backend.

## Comprobaciones

La auditoría reproducible está en `audits/2026-10-17/verify.mobile-ui.cjs`. Crea una base PostgreSQL temporal propia, inicia el ERP compilado en el puerto de auditoría 3004 y elimina la base al finalizar. Los navegadores acceden a datos de prueba y todas sus escrituras se interceptan: no se guardan clientes, ventas, archivos ni operaciones desde las comprobaciones de interfaz.

El navegador comprueba Chromium y WebKit, seis tamaños, dos temas, roles, filtros, conservación de borradores, envíos repetidos, consultas fallidas, modales y carrito. Capturas y resultados quedan junto al script. Las regresiones financieras existentes se ejecutan separadamente en su propia base aislada.

La emulación y WebKit no sustituyen la comprobación del teclado, la barra del navegador y las zonas seguras en un teléfono físico. Esa validación se deja indicada como pendiente hasta disponer del dispositivo.
