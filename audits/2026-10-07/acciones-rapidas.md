# Acciones rápidas — 7 de octubre de 2026

Disponible en la cabecera para administrador, superadministrador, gerente de sede y cajero. En móvil se muestra el botón con el icono de rayo.

- **Nueva venta:** abre el punto de venta y enfoca el buscador. Si ya está abierto, conserva el carrito.
- **Registrar gasto:** abre el formulario de egreso de caja con las validaciones existentes de saldo, categoría, motivo y PIN. Si la caja está cerrada o tiene cierre pendiente, informa qué debe resolverse primero.
- **Recibir abono:** busca cuentas pendientes por nombre, documento o factura. Permite buscar sin tildes; al seleccionar una cuenta abre el formulario de recaudo con su cliente, factura, saldo máximo y sede.

Las acciones se ejecutan después de cargar el módulo y el parámetro de apertura se consume una sola vez. Los técnicos y contadores no ven accesos a operaciones que su rol no puede realizar. El cajero puede acceder a Cartera y a su resumen; los demás reportes financieros mantienen sus permisos.

## Validación

- Chromium: navegación entre módulos, acción repetida en el mismo módulo, carrito conservado, búsqueda por nombre/documento/factura, límite del abono, cancelación y envío de formularios.
- Gastos y abonos enviados a respuestas simuladas, sin registrar movimientos financieros reales.
- Caja cerrada y cierre pendiente: el acceso rápido no abre el formulario de gastos.
- Cabecera y menú comprobados a 320, 390, 902 y 1440 px; selector de abonos a 320, 390 y 1440 px.
- Sin errores de JavaScript en los flujos comprobados.
- `npm test`: 35 pruebas aprobadas y 1 de integración omitida.
- Auditoría anterior de caja pendiente y arqueo: aprobada.
- Servidor local reiniciado para cargar el ajuste de permisos del resumen de cartera.

Prueba reproducible: `node audits/2026-10-07/verify.acciones-rapidas.cjs`.
