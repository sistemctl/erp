#!/bin/sh
# Arranca el ERP como usuario sin privilegios (node).
# Si el contenedor inicia como root, primero corrige el dueño del volumen de uploads
# (volúmenes creados por versiones anteriores pertenecen a root) y luego baja privilegios.
set -e

if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/backend/uploads/reparaciones
  chown -R node:node /app/backend/uploads
  touch /app/backend/.env
  chown node:node /app/backend/.env
  exec su-exec node "$@"
fi

exec "$@"
