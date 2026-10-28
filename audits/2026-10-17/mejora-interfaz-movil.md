# Mejora integral de la interfaz móvil

Fecha: 17 de octubre de 2026. Recursos: **3.0.110**.

Implementación realizada en los grupos A–E del plan. La comprobación del teclado y las zonas seguras en un teléfono físico queda pendiente; Chromium y WebKit se verificaron en el equipo.

## Cambios entregados

| Grupo | Resultado |
|---|---|
| A · Base visual | Cabecera compacta, controles táctiles, buscador local de módulos en Más, temas y estilos móviles centralizados. Clientes adopta registros resumidos y acciones con etiquetas. |
| B · Operación diaria | POS con carrito y cobro sobre la navegación; Caja con selector de sección en teléfono; inventario con nombre, código, stock y estado legibles. |
| C · Contactos y taller | Resúmenes en clientes, proveedores, instalaciones, RMA, series y Trade-In; taller vertical en teléfono y dos columnas en tableta. Los controles existentes de materiales y repuestos mantienen sus valores y acciones. |
| D · Gestión y finanzas | Listados adaptables de ventas, facturación, cartera, compras, cotizaciones y nómina; filtros en modal y formularios extensos que aprovechan el teléfono. |
| E · Supervisión | Resultado principal del dashboard de ancho completo; indicadores secundarios adaptables; comparación analítica con primera columna fija; configuración por secciones y seguimiento público con reintento. |

Los mismos nodos conservan eventos, identificadores y valores: la vista móvil no duplica formularios, registros ni peticiones. En escritorio se restablece la presentación original. Las acciones financieras, contratos JSON y validaciones de servidor no se cambiaron.

Los fallos de consulta se distinguen de las listas vacías y permiten reintentar sin recargar. Los errores de validación aparecen junto al campo. Los envíos indican procesamiento, bloquean el segundo submit y conservan el borrador al fallar. La captura del envío cubre el comportamiento de Safari cuando no enfoca el botón. El router espera también los diálogos que están terminando de cerrarse antes de desmontarlos.

Las plantillas de factura, cotización y recibo están excluidas de la transformación de tablas para preservar impresión y PDF. Los eventos, observadores y modales externos de una vista se limpian al abandonarla.

## Verificación

- Compilación estricta del frontend y backend: correcta.
- Pruebas existentes: **44 correctas**, cero fallos; una integración omitida por diseño en el comando unitario.
- Regresiones financieras en PostgreSQL aislado: **43 correctas**, cero fallos. Incluyen pagos combinados, crédito, cambio, descuentos, seriales, reintentos, caja, servicios, inventario y PDF.
- Auditoría visual: **480 vistas**, correspondientes a 20 módulos × seis anchos × dos temas × Chromium/WebKit.
- Interacciones: búsqueda, detalle, filtros, cambio de tamaño, conservación de borradores, fallos simulados, bloqueo de segundo envío, retorno de foco y permisos de seis roles.
- Siete formularios de creación, en 320, 390 y 1440 px, en ambos navegadores: **42 vistas de formulario**.
- POS en teléfono vertical y horizontal; teclado simulado y limpieza de estado; login y seguimiento sin sesión.
- Resultado consolidado: **526 escenarios correctos**, cero pendientes de corrección automática y cero errores JavaScript.

La matriz general encontró un desbordamiento transitorio de pestañas de Caja al primer cambio de tamaño en WebKit. Se corrigió mediante adaptación síncrona y una distribución CSS segura antes de la adaptación. La ejecución final dirigida repitió Caja, Configuración, formularios e interacciones: **94 escenarios correctos**, cero errores. El informe consolidado conserva el último resultado de cada escenario, con los dos informes de origen para trazabilidad; no oculta la ejecución anterior.

Todas las comprobaciones de interfaz usaron registros de una base temporal propia. Las escrituras de los navegadores se interceptaron y devolvieron fallos controlados, sin guardar operaciones. Las bases temporales fueron eliminadas. No se enviaron notificaciones ni se modificaron los datos reales del ERP.

## Evidencia y reproducción

- [Resultados consolidados](mobile-ui-results.json).
- [Comprobación dirigida final](mobile-ui-focused.json).
- [Clientes móvil](chromium-clientes-390-light.png), [inventario móvil](chromium-inventario-390-light.png) y [taller móvil](chromium-reparaciones-390-light.png).
- [Formulario de producto](chromium-form-inventario-320.png) y [carrito del POS](chromium-pos-carrito-320.png).
- [Patrones y funcionamiento](../../docs/interfaz-movil.md).

Desde la raíz del proyecto:

```powershell
npm run build --prefix backend
node audits/2026-10-17/verify.mobile-ui.cjs
node audits/2026-10-06/verify.integration.cjs --caja-facturas
```

La auditoría requiere PostgreSQL local, los navegadores de Playwright y el puerto de prueba 3004 libre. No necesita detener el ERP del puerto 3000. Para ver la entrega, recargar el ERP; si el servicio está detenido, iniciarlo con `npm start` desde `backend`.

## Pendiente de comprobación física

Se verificó la lógica de teclado mediante simulación de `visualViewport`, y WebKit cubre compatibilidad con Safari. Esto no sustituye probar el teclado real, las barras del navegador, la orientación y las zonas seguras en un teléfono Android/iPhone. No se presenta esa comprobación como realizada.
