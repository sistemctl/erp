# Migración gradual a TypeScript

## Cierre de la fase 3 — frontend completo

Al 8 de octubre de 2026 están convertidos los 23 módulos fuente, las 23 utilidades y API/autenticación/entrada: 49 archivos de aplicación, más 15 archivos de tipos y declaraciones. No quedan fuentes JavaScript de aplicación en `frontend/assets/js`. El frontend compila en modo estricto sin `allowJs`; las importaciones del navegador siguen usando `.js` y se sirven desde `frontend/dist`.

Los contratos de cada dominio distinguen importes decimales serializados de totales calculados. POS incluye carrito, pagos, descuentos, crédito, seriales y reintentos. Inventario, compras y servicios incluyen combos, movimientos, recepción/devolución y materiales. Los accesos al DOM comprueban los elementos obligatorios; los controles opcionales por rol y los eventos al salir de un módulo conservan sus guardas.

Se verificaron 44 pruebas unitarias, integración de combos y 43 regresiones financieras en PostgreSQL temporal, 80 vistas, 21 formularios, 55 vistas por roles, navegación y actualización en 20 módulos. También pasó una instalación limpia sin datos ni dependencias anteriores. Consulta [el informe de cierre](../audits/2026-10-07/migracion-typescript-fase3.md) para el alcance y las limitaciones.

La **fase 4 está completa**: 142 archivos de aplicación del backend en TypeScript, con comprobación estricta. Consulta [el informe de cierre del backend](../audits/2026-10-08/migracion-typescript-fase4.md). En la **fase 5** ya se retiró `allowJs`, se separaron las siete pruebas heredadas y se preparó CI para verificar el contenedor con PostgreSQL temporal, imágenes, uploads y PDF. Falta ejecutar esa verificación con Docker y desplegar. No se cambió el esquema de base de datos ni el framework.

## Entrega 1: compilación y ejecución

El ERP se ejecuta desde `backend/dist/server.js` y sirve `frontend/dist`. Se conservan Express, Sequelize, PostgreSQL, las URL y los formatos JSON. Los fuentes no se sobrescriben.

TypeScript está fijado en 5.9.3. El frontend emite módulos ES y el backend CommonJS mediante Node16 y el paquete CommonJS existente. Ambas configuraciones usan `strict: true` y no habilitan `allowJs`. El constructor rechaza archivos `.js` de aplicación; los siete `.test.js` heredados se copian explícitamente a `dist/tests` después de compilar los tests TypeScript. Los scripts `.cjs` son herramientas de compilación anteriores al arranque. `skipLibCheck` omite únicamente la comprobación interna de declaraciones de dependencias.

**Estado al 8 de octubre de 2026:** fases 1, 2, 3 y 4 completas. Fase 5 implementada parcialmente; quedan la ejecución del contenedor y el despliegue. Véase [informe de fase 5](../audits/2026-10-08/migracion-typescript-fase5.md). Las entregas anteriores documentadas abajo son el historial de la transición.

Archivos migrados:

- `frontend/assets/js/utils/date.ts`: fechas locales del navegador; conserva la importación pública `date.js`.
- `backend/utils/caja-fecha.ts`: fecha operativa de Bogotá y validaciones de caja pendiente, con exportación CommonJS compatible.
- `backend/utils/runtime-paths.ts`: ubicaciones compartidas de configuración, uploads, frontend y logos de PDF.

Los scripts `build.cjs` y `dev.cjs` son herramientas de arranque deliberadamente CommonJS: deben funcionar antes de compilar TypeScript. Los nuevos archivos de aplicación se escribirán en TypeScript.

## Comandos

Desde `backend`, con Node 20 o superior:

```sh
npm ci
npm run typecheck
npm test
npm run dev
```

`npm test` compila primero y ejecuta las pruebas desde `dist/tests`. `npm run dev` compila, observa los fuentes de ambas partes, copia cambios en recursos estáticos y reinicia el servidor cuando cambian sus archivos compilados. `npm start` compila y arranca. Las auditorías del navegador necesitan que el servidor esté disponible y usan los artefactos compilados.

Para una instalación nativa de producción:

```sh
npm ci
npm run typecheck
npm test
npm prune --omit=dev
npm run start:compiled
```

No ejecutar `npm start` después de quitar dependencias de desarrollo: su paso previo necesita TypeScript. En Docker se compila en una etapa separada y se ejecuta directamente `node dist/server.js`, con dependencias de producción.

Los comandos administrativos se ejecutan desde `backend` sobre `dist/scripts` y `dist/seeders`. Requieren compilar antes. Los scripts de auditoría que generan informes también necesitan la carpeta de informes correspondiente.

## Datos y recursos persistentes

`backend/.env` y `backend/uploads` siguen en sus ubicaciones actuales; no se copian a `dist` ni se borran al compilar. Los PDF resuelven `/uploads/...` contra esa carpeta y `/assets/...` contra el frontend compilado. El HTML, CSS y otros recursos se copian a `frontend/dist`, excluyendo configuración, archivos ocultos y fuentes TypeScript. Los volúmenes del Compose permanecen intactos.

`dist` está excluido de Git y del contexto Docker. La compilación completa limpia únicamente las dos carpetas de salida y debe terminar antes de arrancar el servidor de producción. Para actualizaciones, construir una nueva imagen y conservar la anterior para revertir; no compilar sobre el directorio servido de un proceso de producción.

## Verificación

La suite comprueba importes, permisos, caja pendiente, inventario/repuestos y actualización entre módulos. Se añadieron pruebas para las rutas persistentes, fechas emitidas para navegador, recursos estáticos y generación de PDF con un recurso temporal de uploads. Ese recurso se elimina al terminar.

La prueba de integración con PostgreSQL continúa separada y requiere `RUN_DB_TESTS=1`, `DB_NAME` terminado en `_test` y `TEST_BASE_URL` apuntando al servidor de esa base aislada. Se necesita preparar allí los usuarios, sedes y datos exigidos por la prueba. Sin esas condiciones no se ejecuta; la suite ordinaria no sustituye esa verificación.

Desde la raíz, `node audits/2026-10-07/verify.typescript-isolated.cjs` prepara una base temporal nueva con fixtures mínimos, arranca el servidor compilado en el puerto 3002, ejecuta la integración y elimina únicamente esa base al terminar. Necesita permiso para crear bases PostgreSQL y el puerto libre; no copia datos existentes. El workflow de GitHub usa un servicio PostgreSQL 16 para esta verificación.

El workflow de GitHub ejecuta instalación limpia, tipos, pruebas, integración aislada y construcción Docker en Node 20. La comprobación de Docker local requiere que Docker Engine esté iniciado. La existencia del workflow no confirma un despliegue ni una ejecución remota exitosa.

## Entregas siguientes

1. Contratos compartidos según las respuestas reales: decimales de Sequelize como texto cuando corresponda, totales numéricos, fechas, usuarios, sedes, productos, caja, ventas y errores. Tipar API, autenticación, eventos, acciones rápidas, Window, bibliotecas externas y contexto de Express. Mantener validación en tiempo de ejecución.
2. Frontend: utilidades/auth/navegación; clientes/proveedores/inventario; POS/caja/cartera; servicio técnico/compras/facturación; configuración/reportes/resto. Cada grupo debe funcionar por separado y conservar imports `.js` del navegador y comprobaciones del DOM.
3. Backend: utilidades/configuración/middleware; modelos y asociaciones por dominio; consultas; operaciones transaccionales; reportes/PDF/tareas/migraciones. Conservar exportaciones compatibles y esquema SQL.
4. Consolidación: retirar `allowJs` cuando se convierta el código de aplicación, verificar contenedor con uploads/PDF y base aislada, y validar móvil/escritorio antes de cada despliegue.

La migración completa permanece pendiente. Cada grupo se entregará con compilación, tipos estrictos y regresiones relevantes; no se considerará terminado por cambiar extensiones ni se usará `any` generalizado para ocultar errores.

## Entrega 2: contratos y comunicación

Los contratos de transporte viven en `shared/contracts.d.ts` y se importan con `import type` desde ambas partes. No generan módulos JavaScript ni cambian las rutas de salida. Docker incluye esta carpeta en su etapa de compilación. Cubren roles, usuario de sesión y contexto autenticado, sedes, productos, stock, movimientos, caja, ventas, pagos y errores. Los contratos distinguen los decimales serializados por Sequelize como texto de los importes calculados como números. Las asociaciones reducidas reflejan los atributos seleccionados por cada endpoint.

Se convirtieron `api.ts`, `auth.ts`, `utils/live-data.ts`, `utils/quick-actions.ts` y `backend/middleware/roles.middleware.ts`. El navegador sigue importando sus nombres `.js`. `apiFetch<T>` devuelve `T | null` (204); por defecto devuelve `unknown`. `apiGet` vincula las lecturas conocidas a sus contratos; las escrituras declaran su respuesta por separado, evitando confundir un producto creado con el listado de productos. No se tiparon todos los endpoints ni se convirtieron los modelos Sequelize en esta entrega.

Las cabeceras aceptan las formas estándar de Fetch (`Headers`, pares y objetos), con combinación independiente de mayúsculas/minúsculas. Se conserva `no-store`, la emisión de eventos después de escrituras exitosas, el estado y código de errores, y la distinción entre un 401 de login y un 401 que revoca sesión. Los datos JSON de transporte cruzan una única aserción de contrato en el cliente; no se consideran validados automáticamente. El login sí comprueba token e identidad antes de guardar la sesión, y un usuario almacenado corrupto devuelve `null` para que la navegación existente muestre login.

Los eventos entre pestañas verifican la forma de su mensaje antes de despacharlo. Las suscripciones y acciones rápidas tienen propietarios DOM y funciones de limpieza tipadas. `types/browser.d.ts` declara las extensiones reales de Window, eventos y la superficie utilizada de Bootstrap, Chart y JsBarcode; son interfaces mínimas que se ampliarán al convertir sus consumidores. `backend/types/express.d.ts` describe usuario, token, auditoría y transacción agregados por middleware. El middleware de permisos ya consume ese contexto con comprobación estricta.

`types/contract-checks.ts` contiene comprobaciones que fallan al compilar si desaparece la distinción de importes, los contratos de eventos o el resultado tipado de las lecturas. Las pruebas de autenticación se escribieron en TypeScript y ejecutan el JavaScript emitido. Los contratos base aún no cubren todos los campos de asociaciones, detalles de venta o formularios: se extenderán junto con sus consumidores en la siguiente fase.

El siguiente grupo es navegación y carga de módulos, utilidades restantes y después clientes/proveedores/inventario, conforme al orden del plan. El JavaScript pendiente continúa funcionando con `allowJs`.

## Entrega 3, primer grupo: navegación y utilidades de presentación (histórico)

Se convirtió `app.ts` con menú por roles, login, shell, navegación y acceso al DOM tipados. La navegación mantiene su cola de cargas: agrupa cambios rápidos de ruta y monta los módulos secuencialmente, ya que los módulos existentes consultan elementos del documento. Los elementos obligatorios se obtienen con `utils/dom.ts`, que comprueba existencia y clase del elemento; los elementos opcionales se comprueban antes de utilizarlos.

`utils/module-registry.ts` registra los 20 módulos internos y el seguimiento público. Los nombres y firmas de las funciones de entrada/limpieza se verifican contra los exports del archivo correspondiente mediante tipos de importación. Al cargar, el namespace entra como `unknown` y se comprueba que las funciones esperadas existan. Las aserciones de firma se localizan en esa frontera dinámica, y no se extienden al resto del router. Las rutas, alias de auditoría y permisos existentes permanecen intactos.

También se convirtieron `module-shell.ts`, `action-buttons.ts`, `toast.ts`, `barcode.ts` y `branding.ts`. Se conserva su API `.js` pública y el HTML de presentación. El branding distingue entradas desconocidas y recupera cachés inválidas. El lector mantiene un callback tipado y su limpieza al abandonar el módulo. La versión de assets pasa a 3.0.106, compartida por el registro de módulos y la referencia de `index.html`.

Las utilidades de tema/configuración, importes/documentos, nómina y recibos aún no se convirtieron; se agruparán con sus dominios para evitar conversiones masivas. Este es el primer grupo de la etapa frontend, no la etapa frontend completa. El próximo grupo es clientes, proveedores y consultas de inventario.

La auditoría `node audits/2026-10-07/verify.navigation-typescript.cjs` usa respuestas simuladas y comprueba login fallido/correcto, mostrar contraseña, permisos de cajero, carga de todas las entradas, seguimiento sin login, guardas DOM, lector y logout. Las pruebas unitarias del registro rechazan entradas y limpiezas que no sean funciones y ejecutan un ciclo de montaje/limpieza válido.
