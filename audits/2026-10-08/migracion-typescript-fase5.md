# Fase 5 — consolidación preparada, despliegue pendiente

Fecha: 8 de octubre de 2026. Estado: **no cerrada**. No se desplegó en el servidor externo ni se ejecutó el contenedor localmente.

## Implementado

- Backend y frontend con `strict`, sin `allowJs` ni `checkJs: false`. No quedan fuentes JavaScript de aplicación.
- El constructor rechaza la incorporación de `.js` de aplicación. Excluye dependencias, artefactos, datos, scratch y pruebas. Las siete pruebas heredadas se copian explícitamente a `dist/tests`; las dos pruebas TypeScript se compilan con el código. El modo desarrollo también actualiza las pruebas heredadas.
- Docker conserva las etapas build/runtime de Node 20. Build exige tipos y tests; runtime instala solo dependencias de producción, recibe `dist`, excluye tests y mantiene uploads fuera de los artefactos.
- CI exige instalación limpia, tipos, compilación, tests y PostgreSQL temporal. Se añadió el arranque de la imagen final con base temporal, sin volúmenes de producción; verifica recursos estáticos, imágenes desde uploads y los flujos existentes de ventas, seriales, devolución, reportes y PDF.
- Compose permite identificar la imagen con `ERP_IMAGE`, conserva los servicios, redes y volúmenes existentes. `dist` continúa fuera de Git.
- Procedimiento de conservación de imagen anterior, aceptación y reversión en `docs/despliegue-typescript.md`. No se ejecutó contra el servidor real.

## Verificado en este equipo

- `npm test`: 44 pruebas correctas, cero fallos, una integración omitida deliberadamente en este comando.
- Integración PostgreSQL temporal: la prueba omitida pasa al ejecutarse con base aislada; también pasan Dashboard, Analítica, CSV, Nómina/PDF y jobs con canales de comunicación desactivados. Base temporal eliminada.
- Regresión financiera aislada: 43 correctas, cero fallos; pagos, crédito, descuentos, concurrencia, reintentos, caja, facturación, inventario, servicios y respaldos.
- Instalación limpia con `npm ci`, tipos, compilación y tests: correcta, sin `.env`, uploads ni dependencias previas.
- Sintaxis del verificador y `git diff --check`: correctos.
- Las 80 vistas responsive ya verificadas en el cierre de fase 4 no se repitieron: esta entrega no cambia la interfaz.

## Pendiente para cerrar la fase

`docker version` encuentra el cliente 29.6.2, pero no conecta a `dockerDesktopLinuxEngine`: el motor Docker no está disponible. Por eso la construcción y el arranque de la imagen, y el nuevo paso de CI sobre esa imagen, **no están verificados aún**.

Falta ejecutar CI en un host con Docker, conservar y comprobar una imagen anterior en el host real, y desplegar/aceptar la entrega en Dokploy. No se activó alteración del esquema, no se modificaron volúmenes reales, no se enviaron notificaciones y no se realizó commit ni push de esta entrega.
