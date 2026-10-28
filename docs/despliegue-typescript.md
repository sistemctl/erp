# Despliegue de TypeScript y reversión

El despliegue existente usa Dokploy, rama `3.0`, `docker-compose.yml`, servicio `erp`, puerto interno 3000. No se cambia PostgreSQL, el volumen externo `startsystem_pgdata`, el volumen `erp_uploads` ni el nombre del proyecto Compose. Mantener ese nombre evita crear otro volumen de uploads.

## Verificación previa

La integración de GitHub exige instalación con lockfile, tipos estrictos, compilación y tests. Después construye `erp:verify` y ejecuta el servidor de esa imagen contra una base temporal propia; verifica ventas, seriales, devolución, reportes, PDF, archivos estáticos e imágenes desde un directorio de uploads temporal. Nunca monta volúmenes de producción. Los tests JavaScript heredados se ejecutan en la etapa de construcción y no se incluyen en la imagen final. El runtime contiene solo dependencias de producción y artefactos compilados.

No desplegar una entrega si ese job falla. Esta comprobación está preparada pero aún no ejecutada: el equipo local no tiene un motor Docker disponible. El último informe de interfaz verificó 80 vistas; esta entrega no cambia el diseño.

## Conservar la imagen anterior

Antes de desplegar, ejecutar en el host de Dokploy (shell Bash), con el contenedor actual funcionando:

```sh
previous_image=$(docker inspect --format '{{.Image}}' startsystem-app)
docker image tag "$previous_image" erp-techstore:rollback-before-typescript-phase5
docker image inspect erp-techstore:rollback-before-typescript-phase5 --format '{{.Id}}'
```

Conservar esa etiqueta y el ID registrado hasta aceptar la nueva entrega; no ejecutar limpieza de imágenes que la elimine. Guardar también la configuración Environment y Compose anterior por los mecanismos del servidor, sin subir secretos a Git. Esta migración no necesita activar `DB_SYNC_ALTER`.

## Desplegar y aceptar

Configurar `ERP_IMAGE=erp-techstore:typescript-phase5` en Environment; Dokploy construye la imagen y ejecuta `node dist/server.js`. Usar el mismo proyecto y los mismos volúmenes. Comprobar salud, login, imágenes existentes, generación de PDF y POS en escritorio y móvil antes de dar por terminada la entrega. No crear ventas de prueba en la base real: usar la instancia aislada para pagos combinados, crédito, cambio, descuentos, seriales y reintentos.

## Volver a la imagen conservada

En caso de fallo, en el directorio del mismo proyecto Compose y con su Environment cargado:

```sh
ERP_IMAGE=erp-techstore:rollback-before-typescript-phase5 docker compose up -d --no-build --no-deps erp
docker inspect startsystem-app --format '{{.State.Health.Status}}'
```

En Dokploy, conservar esa selección de imagen y desactivar la reconstrucción para la reversión. No usar `down -v`; la reversión cambia únicamente la imagen de `erp`, conserva PostgreSQL y uploads. Confirmar después `/api/health`, login y lectura de una imagen existente. Si el problema era configuración, recuperar también Environment anterior. La conservación de una imagen anterior debe comprobarse en el host real; aquí solo se preparó el procedimiento.
