# Pendientes — auditoría y mejoras (noviembre 2026)

Estado al 14-nov-2026. Rama `3.0`. **Ningún cambio tiene commit todavía** (~65 archivos).

---

## 1. Guardar y publicar (prioridad alta)

### 1.1 Commits (uno por bloque)
- [ ] **Fase 1, crítico:**
  - XSS (`escapeHtml` compartido en `frontend/assets/js/utils/html.ts`).
  - El stock ya no se pisa al editar un producto (409 si cambió).
  - Seriales que no duplican stock.
  - Devoluciones a crédito.
  - Facturas de taller ya emitidas no se reescriben.
  - Instalaciones solo se entregan cerrándolas.
  - Protección del seeder.
  - PDF del reporte Z con token.
- [ ] **Fase 2, contabilidad y stock:**
  - Devolución a proveedor reduce la deuda.
  - Costo del producto se actualiza al recibir.
  - Repuestos vuelven al stock al cancelar una reparación.
  - Bloqueos de fila en stock.
  - Índice único `StockSedes`.
  - Errores de usuario como 4xx.
  - Límite de intentos del PIN de admin.
  - RMA.
  - Validaciones al eliminar productos.
  - Fechas de reportes en hora de Bogotá.
  - Margen de rentabilidad sin IVA.
  - Ajustes del POS.
  - Ficha de cliente con la deuda real.
- [ ] **Fase 3, datos y configuración:**
  - Sedes con documentos no se borran.
  - Migración de columnas faltantes.
  - `migrate-odoo --inventory-only` seguro.
  - Clientes y proveedores con documentos no se borran.
  - Job de cartera.
  - Docker sin root (`docker-entrypoint.sh`).
  - CORS mismo origen.
  - `TRUST_PROXY`.
  - Importación CSV.
  - XSS en el resto de módulos.
- [ ] **Fase 4:**
  - Abonos en centavos.
  - Fotos huérfanas.
  - Tabla de recepción de compras.
  - Números de documento únicos.
  - Limpieza de 1.351 restricciones UNIQUE duplicadas.
- [ ] **Costo por metro:** las compras por rollo conservan el total real del rollo.
- [ ] **Correcciones posteriores:**
  - Caja y cartera ("Cannot access 'escapeHtml' before initialization").
  - Mensaje de producto componente de combo.
  - Nombre del producto en la confirmación de eliminar.
- [ ] **Formato de números colombiano** en todos los campos (`utils/numero-input.ts`).
- [ ] **Mejoras de uso:**
  - Filtro "Por completar".
  - Aviso en el POS por precio de $1 o menos.
  - Modo una sola sede (`utils/una-sede.ts`).
  - POS e Inventario compactos (`utils/categoria-nombre.ts`).
  - Menú por rol ("Uso diario" y "Más módulos").

### 1.2 Desplegar a producción (`erp.semejal.com`)
- [ ] **Respaldar la base de producción antes de desplegar.** Al arrancar, las migraciones nuevas:
  - `columnas-modelo-2026-11`: añade las columnas que falten y convierte los ENUM de método de pago a texto.
  - `stock-sede-unico-2026-11`: fusiona filas de stock duplicadas y crea un índice único.
  - `indices-unicos-2026-11`: borra las restricciones UNIQUE duplicadas (`_key1`, `_key2`…) y crea índices únicos en los números de documento.
- [ ] **Construir y probar la imagen Docker en el servidor.** Cambiaron el usuario del contenedor a `node` y el `ENTRYPOINT`. Aquí no se pudo probar.
- [ ] **Revisar el log del primer arranque:**
  - Si dice "tiene números repetidos… no se creó el índice único", corregir esos números y reiniciar.
  - **Antes de desplegar**, confirmar que `JWT_SECRET` en el `.env` del servidor tiene 32 caracteres o más y no es el valor de ejemplo: desde el 15-nov el servidor **no arranca** en producción si no. Si hay que cambiarlo, generar uno con `openssl rand -hex 32` (todos los usuarios tendrán que volver a iniciar sesión).
  - `TRUST_PROXY` vacío está bien detrás de un proxy en red privada (Nginx local, Docker).

---

## 2. Datos del catálogo (Inventario → filtro "Por completar")

Al 14-nov: **94 de 97 productos** con algún problema.

> **Importante:** corregirlo en **producción** (`erp.semejal.com`), desde Inventario. La base local es una copia: lo que se corrija aquí no llega al servidor. La importación CSV no sirve, porque solo crea productos y salta los que ya existen.

- [ ] **73 productos sin costo.** Hasta corregirlo:
  - La rentabilidad muestra 100 % de margen.
  - El reporte de inversión vale $0.
  - El PIN por vender bajo costo nunca se pide.
- [ ] **50 productos con precio de $1 o menos** (precios provisionales).
- [ ] **23 códigos de barras con texto o espacios**, por ejemplo "Display port Hdmi". El escáner no los encuentra. **No borrarlos sin más:** en varios productos ese texto es la variante (dos "Cargador Lenovo Neoteck" se distinguen solo por "7.9 x 5.5mm" y "7.9 6.0mm"). Pasar el texto al nombre o la descripción y luego generar un código interno con el botón del formulario.
- [ ] **91 productos sin stock mínimo.** Sin él no hay alertas de stock bajo.
- [ ] **2 reparaciones activas sin técnico asignado:** OR-000002 (diagnóstico) y OR-000003 (listo), las dos HP 245g. En la base local no hay ningún usuario con rol técnico (solo Antony Rangel como cajero y superadmin): crear el usuario técnico o asignárselas al superadmin.

---

## 3. Por confirmar en el navegador

- [ ] **Eliminar un producto:** la confirmación debe mostrar el nombre correcto. Si muestra otro, reportar si fue en PC o celular y si había filtro o búsqueda activa (fallo no reproducido).
- [ ] **Devolver una venta a crédito:** primero baja la deuda; el excedente se devuelve en caja.
- [ ] **Recibir una compra de un producto con IMEI:** debe exigir los seriales.
- [ ] **Comprar un cable por rollo:** por ejemplo $100.000 por 300 m; el total de la orden debe ser exactamente $100.000.
- [ ] **Cobrar en el POS escribiendo montos con el formato nuevo:** 50.000.
- [ ] **Devolver mercancía al proveedor:** debe bajar el saldo por pagar.

---

## 4. Mejoras opcionales (hechas el 15-nov, sin commit)

- [x] **Costo histórico en ventas:** nueva columna `ItemsVenta.costoUnitario`, que se añade sola al arrancar con la migración `columnas-modelo-2026-11`. Cada venta guarda el costo del producto en ese momento y la rentabilidad lo usa. Las ventas anteriores y las de productos sin costo (se guarda NULL) siguen usando el costo actual.
- [x] **Baja de stock al eliminar un producto:** si tiene existencias, un admin o superadmin confirma un segundo aviso que muestra las unidades por sede. El stock queda en 0, se registra una salida en el kardex y el detalle queda en la auditoría. Los gerentes reciben el mensaje de antes. Con seriales/IMEI en stock sigue bloqueado.
- [x] **`JWT_SECRET` corto o de ejemplo:** en producción el servidor sale con error en vez de solo advertir.
- Versión del frontend subida a `3.0.118`.

---

## Notas para retomar

- **Servicio local:**
  ```
  cd backend
  npm run build
  node dist/server.js
  ```
  Se sirve en `http://localhost:3000`.
- **Pruebas:** `cd backend && npm test`. El 14-nov dieron 69 correctas, 0 fallidas y 1 omitida (la de integración, que necesita base de datos).
- **Pruebas nuevas:** `backend/tests/auditoria-fase1.test.js`, `auditoria-fase2.test.js` y `auditoria-fase3.test.js`.
- **Versión de los archivos del frontend:** `3.0.117`, en `frontend/assets/js/utils/module-registry.ts` y `frontend/index.html`. Súbela cada vez que cambie el frontend para que los navegadores no usen la versión anterior.
- **Plan original de la auditoría:** `C:\Users\CESAR ALVAREZ\.claude\plans\mira-has-una-auditoria-parallel-meerkat.md`.
