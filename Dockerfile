# ERP TechStore — imagen de producción para Dokploy (backend + frontend estático).
# Puerto interno: 3000 (el compose publica 8080:3000).
# PUBLIC_BASE_URL y CORS_ORIGINS se definen en Environment de Dokploy, no en el build.
FROM node:20-alpine

WORKDIR /app

# Dependencias (capa cacheable)
COPY backend/package.json backend/package-lock.json ./backend/
WORKDIR /app/backend
RUN npm ci --omit=dev

# Código de la aplicación
WORKDIR /app
COPY backend ./backend
COPY frontend ./frontend

WORKDIR /app/backend
RUN mkdir -p uploads/reparaciones

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health',(r)=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
