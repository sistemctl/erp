# Auditoría de actualización de módulos

## Hallazgos

- Los selectores de Instalaciones, Compras, Cotizaciones y Reparaciones conservaban el catálogo obtenido al entrar al módulo. Un cambio posterior no actualizaba esa copia. La navegación a un módulo ya consultaba el servidor, por lo que no se atribuye todo caso de producto ausente a caché.
- Las listas permanecían con sus datos iniciales cuando otra pestaña guardaba un cambio. No había una comunicación de cambios entre pestañas.
- Inventario mantenía una caché de stock por sede; los cambios externos no la invalidaban.
- Series cargaba sus opciones de productos una sola vez.
- La importación CSV usaba fetch directamente, por lo que necesitaba comunicar explícitamente sus cambios.
- Facturación requería reutilizar la consulta filtrada al actualizar, para conservar el resultado de los filtros.
- Instalaciones cargaba cinco fuentes independientes de forma secuencial.
- Los cambios rápidos de ruta podían ejecutar dos montajes simultáneos sobre el mismo contenedor. La auditoría reprodujo un error de inicialización de modales al navegar antes de terminar la primera carga.

## Cambios

- Las peticiones de apiFetch usan cache no-store. Las escrituras exitosas comunican el dominio actualizado sin compartir tokens, registros o datos personales.
- BroadcastChannel comunica cambios entre pestañas del mismo navegador y origen. Los módulos consultan los datos con sus permisos habituales.
- Se agrupan eventos próximos, se evita superponer actualizaciones y se retiran suscripciones al navegar. También se consultan datos al recuperar foco o visibilidad; no hay sondeo periódico.
- Se actualizan las listas de 19 módulos: POS, Inventario, Instalaciones, Compras, Cotizaciones, Reparaciones, Clientes, Proveedores, Facturación, Cartera, Ventas, Series, Trade-in, RMA, Dashboard, Reportes, Nómina, Caja y Rentabilidad.
- Los selectores de productos de Instalaciones, Compras, Cotizaciones y Reparaciones consultan el catálogo al abrirse. Los selectores de clientes y técnicos de Instalaciones y de clientes de Cotizaciones actualizan sus opciones conservando la selección.
- La actualización de listas se pospone mientras hay un modal abierto. Los catálogos de Instalaciones, Compras y Cotizaciones pueden actualizarse durante la edición sin reiniciar el formulario ni el carrito.
- El POS actualiza resultados y clientes sin reiniciar el carrito. Una pantalla de caja pendiente vuelve a consultar al recibir cambios de caja o recuperar foco.
- Inventario vuelve a consultar stock en cambios externos. Series actualiza sus opciones de productos. La importación CSV comunica cambios.
- Instalaciones consulta sus fuentes independientes en paralelo y conserva los datos anteriores si una consulta falla.
- El router serializa los montajes y agrupa cambios de ruta pendientes, mostrando finalmente la última ruta elegida. El montaje inicial del POS ahora espera su carga completa.

## Alcance y comportamiento deliberado

- Configuración se revisó; sus formularios no se recargan automáticamente para evitar perder cambios sin guardar. Sus datos se vuelven a consultar al navegar; los registros de auditoría conservan sus controles de consulta.
- La pantalla pública de seguimiento sigue consultando directamente el estado de la reparación al abrirse.
- Instalaciones conserva el filtro de productos físicos activos. Compras excluye combos y Reparaciones aplica su filtro de repuestos sin serie. Estos filtros pueden explicar productos que no aparecen, aunque el catálogo esté actualizado.
- BroadcastChannel comunica pestañas del mismo navegador y origen. Los cambios desde otros navegadores o equipos se obtienen al recuperar foco, reabrir el selector o navegar. No se añadió una conexión de tiempo real entre equipos.
- La nueva versión del frontend necesita una recarga inicial para sustituir los módulos JavaScript ya cargados; después no requiere recargar toda la página para los flujos corregidos.

## Verificación

- Navegación y recuperación de foco en los 19 módulos actualizados, más Configuración.
- Producto creado en una segunda pestaña de prueba aparece en un selector abierto de Instalaciones sin recarga y conserva la búsqueda.
- Conservación del filtro de Clientes y del borrador de observaciones de Instalaciones.
- Pruebas automatizadas: peticiones sin caché, notificación solo de escrituras exitosas, agrupación de cambios, limpieza al navegar y espera durante modales o pestañas ocultas.
- Las pruebas del navegador bloquean escrituras reales y simulan el producto y la orden de instalación; no crean productos ni órdenes en la base real.

Resultados: live-data-results.json y live-catalog-results.json. Scripts: verify.live-data.cjs y pruebas de backend/tests/live-data.test.js.
