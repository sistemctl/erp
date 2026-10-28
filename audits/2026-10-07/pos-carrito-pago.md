# Carrito y pago del POS

Referencia: capturas de Treinta aportadas por el usuario. Se conserva el estilo y los colores configurados del ERP.

- Carrito lateral con cantidades, precio editable mediante el formulario de autorización existente, retiro individual y vaciado.
- Total y botón para continuar siempre visibles.
- Pago dentro del mismo panel: cliente, crédito, observaciones y medios de pago con selección visual. Es posible combinar métodos.
- Regresar conserva cliente y pagos cuando no cambia el carrito ni la configuración de medios de pago.
- Total, importe que falta o cambio a devolver y botón de crear venta permanecen en el pie del panel.
- En móvil, barra inferior para abrir el carrito; cierre para volver al catálogo.
- Se mantienen IMEI obligatorio, rechazo de seriales duplicados, límites de descuentos/PIN, validación de caja e inventario y clave de reintento de ventas.

## Verificación

Chromium a 320, 390, 902, 1024 y 1440 px: carrito y pago sin desborde horizontal y botón de venta dentro del área visible. Se probaron cantidades, precio, conservación de pagos al regresar, cambio, venta simulada con fallo y reintento, vaciado, IMEI y crédito. Sin movimientos financieros reales.

Pruebas de regresión del frontend y acciones rápidas aprobadas. Backend: 35 pruebas aprobadas, 1 prueba de integración omitida.

Script: `node audits/2026-10-07/verify.pos-panel.cjs`.
