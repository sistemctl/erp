# ERP TechStore — imagen de producción para Dokploy (backend + frontend estático).
# Puerto interno: 3000 (el compose publica 8080:3000).
# PUBLIC_BASE_URL y CORS_ORIGINS se definen en Environment de Dokploy, no en el build.
FROM node:20-alpine AS build

WORKDIR /app

# Dependencias (capa cacheable)
COPY backend/package.json backend/package-lock.json ./backend/
WORKDIR /app/backend
RUN npm ci

# Código de la aplicación
WORKDIR /app
COPY backend ./backend
COPY frontend ./frontend
COPY shared ./shared

WORKDIR /app/backend
RUN npm run typecheck && npm test && node scripts/version-frontend-assets.cjs

FROM node:20-alpine AS runtime
# su-exec: baja de root al usuario node tras ajustar permisos del volumen (docker-entrypoint.sh)
RUN apk add --no-cache su-exec
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/backend/dist ./dist
RUN rm -rf dist/tests
COPY --from=build /app/frontend/dist /app/frontend/dist
RUN mkdir -p uploads/reparaciones && touch .env && chown -R node:node uploads .env
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh && chmod +x /usr/local/bin/docker-entrypoint.sh

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health',(r)=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

# El proceso Node corre como "node" (no root); ver docker-entrypoint.sh
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
