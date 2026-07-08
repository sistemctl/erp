# ERP TechStore (Servitec Gamers)

Sistema ERP monolítico para tiendas de tecnología: ventas, inventario, reparaciones, facturación, cartera, nómina, trade-in, notificaciones y reportes.

| Capa | Tecnología |
|------|------------|
| Backend | Node.js 20+, Express 5, Sequelize |
| Base de datos | PostgreSQL 16 |
| Frontend | JavaScript vanilla (ES modules), Tabler UI, Bootstrap 5 |
| Infra opcional | Docker Compose, Nginx, systemd |

El backend sirve la API REST (`/api/*`), archivos subidos (`/uploads`) y el frontend estático desde un solo proceso.

---

## Tabla de contenidos

1. [Requisitos](#requisitos)
2. [Estructura del repositorio](#estructura-del-repositorio)
3. [Variables de entorno](#variables-de-entorno)
4. [Instalación con Docker](#instalación-con-docker)
5. [Instalación en servidor Linux](#instalación-en-servidor-linux)
6. [Datos de prueba (seeder)](#datos-de-prueba-seeder)
7. [Mantenimiento](#mantenimiento)
8. [Solución de problemas](#solución-de-problemas)
9. [Documentación adicional](#documentación-adicional)

---

## Requisitos

### Instalación con Docker

| Herramienta | Versión mínima |
|-------------|----------------|
| [Docker Engine](https://docs.docker.com/engine/install/) | 24+ |
| [Docker Compose](https://docs.docker.com/compose/install/) | v2+ |
| Git | cualquier versión reciente |

### Instalación nativa en Linux

| Herramienta | Versión mínima |
|-------------|----------------|
| Ubuntu / Debian (recomendado) | 22.04 LTS o superior |
| Node.js | 20 LTS |
| npm | incluido con Node.js |
| PostgreSQL | 14+ (recomendado 16) |
| Nginx + Certbot | para HTTPS en producción |
| Git | cualquier versión reciente |

---

## Estructura del repositorio

```
erpnext/
├── backend/              # API Express + modelos Sequelize
│   ├── server.js         # Punto de entrada
│   ├── .env.example      # Variables para instalación nativa
│   └── seeders/          # Datos de prueba
├── frontend/             # SPA estática (sin build)
├── Dockerfile            # Imagen del ERP
├── docker-compose.erp.yml
├── .env.docker.example   # Variables para Docker Compose
└── docker/homelab/       # Stack opcional Pi-hole + Nginx (proxy/DNS local)
```

---

## Variables de entorno

Copie la plantilla según el método de instalación:

| Método | Archivo plantilla | Destino |
|--------|-------------------|---------|
| Docker | [`.env.docker.example`](.env.docker.example) | `.env` (raíz del repo) |
| Linux / desarrollo | [`backend/.env.example`](backend/.env.example) | `backend/.env` |

### Variables obligatorias

| Variable | Descripción |
|----------|-------------|
| `DB_HOST` | Host PostgreSQL (`postgres` en Docker, `localhost` en Linux) |
| `DB_PORT` | Puerto PostgreSQL (por defecto `5432`) |
| `DB_NAME` | Nombre de la base (`erp_techstore`) |
| `DB_USER` | Usuario de PostgreSQL |
| `DB_PASS` | Contraseña de PostgreSQL |
| `JWT_SECRET` | Clave secreta JWT (mínimo 32 caracteres aleatorios) |

### Variables recomendadas en producción

| Variable | Descripción |
|----------|-------------|
| `NODE_ENV` | `production` en servidores reales |
| `PORT` | Puerto HTTP interno (por defecto `3000`) |
| `PUBLIC_BASE_URL` | URL pública con HTTPS, ej. `https://erp.midominio.com` |
| `CORS_ORIGINS` | Dominios permitidos separados por coma |

### Variables opcionales

| Variable | Descripción |
|----------|-------------|
| `JWT_EXPIRES_IN` | Expiración del token (por defecto `8h`) |
| `GEMINI_API_KEY` | API de Google Gemini |
| `GEMINI_MODEL` | Modelo Gemini (por defecto `gemini-2.5-flash`) |
| `SMTP_*` | Correo saliente (también configurable en la UI) |
| `TWILIO_*` | SMS/WhatsApp (también configurable en la UI) |

> **Nota:** En `NODE_ENV=production`, las IPs de red local **no** se aceptan automáticamente por CORS. Defina `CORS_ORIGINS` con sus dominios HTTPS.

---

## Instalación con Docker

Levanta **PostgreSQL + ERP** en contenedores. No requiere instalar Node.js ni PostgreSQL en el host.

### 1. Clonar el repositorio

```bash
git clone https://github.com/TU_USUARIO/erpnext.git
cd erpnext
```

### 2. Configurar variables

```bash
cp .env.docker.example .env
```

Edite `.env` y cambie al menos:

```env
DB_PASS=una_contraseña_segura
JWT_SECRET=clave_aleatoria_de_al_menos_32_caracteres
```

Opcionalmente ajuste `ERP_HOST_PORT` si el puerto 3000 del host está ocupado.

### 3. Construir y arrancar

```bash
docker compose -f docker-compose.erp.yml up -d --build
```

La primera vez puede tardar varios minutos (descarga de imágenes, `npm ci` y sincronización de la base de datos).

### 4. Verificar que funciona

```bash
# Estado de los contenedores
docker compose -f docker-compose.erp.yml ps

# Logs del ERP
docker compose -f docker-compose.erp.yml logs -f erp

# Health check
curl http://localhost:3000/api/health
```

Respuesta esperada:

```json
{"ok":true,"puerto":3000,"urlPublica":"http://localhost:3000"}
```

### 5. Acceder a la aplicación

Abra en el navegador:

```
http://localhost:3000
```

(o el puerto definido en `ERP_HOST_PORT`).

### 6. Cargar datos de prueba (opcional)

```bash
docker compose -f docker-compose.erp.yml exec erp node seeders/seeder.js
```

Credenciales de prueba tras el seeder:

| Rol | Email | Contraseña |
|-----|-------|------------|
| Admin | `admin@techstore.com` | `admin123` |

### Comandos Docker útiles

```bash
# Detener
docker compose -f docker-compose.erp.yml down

# Detener y eliminar volúmenes (borra la base de datos)
docker compose -f docker-compose.erp.yml down -v

# Reiniciar solo el ERP
docker compose -f docker-compose.erp.yml restart erp

# Actualizar tras git pull
git pull
docker compose -f docker-compose.erp.yml up -d --build

# Backup de PostgreSQL
docker compose -f docker-compose.erp.yml exec postgres \
  pg_dump -U erp_user erp_techstore > backup_$(date +%F).sql
```

### HTTPS con Nginx delante de Docker (opcional)

Si expone el ERP con un dominio público, configure un proxy inverso en el host apuntando al puerto `ERP_HOST_PORT` y defina en `.env`:

```env
PUBLIC_BASE_URL=https://erp.midominio.com
CORS_ORIGINS=https://erp.midominio.com
```

Luego reinicie el contenedor ERP:

```bash
docker compose -f docker-compose.erp.yml restart erp
```

---

## Instalación en servidor Linux

Guía para **Ubuntu 22.04/24.04** o Debian equivalente. El ERP corre como servicio systemd detrás de Nginx con HTTPS.

### 1. Actualizar el sistema e instalar dependencias

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git nginx certbot python3-certbot-nginx
```

### 2. Instalar Node.js 20 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version   # debe mostrar v20.x
npm --version
```

### 3. Instalar PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

### 4. Crear base de datos y usuario

```bash
sudo -u postgres psql <<'SQL'
CREATE USER erp_user WITH PASSWORD 'cambiar_contraseña_segura';
CREATE DATABASE erp_techstore OWNER erp_user;
GRANT ALL PRIVILEGES ON DATABASE erp_techstore TO erp_user;
SQL
```

### 5. Clonar el proyecto

```bash
sudo mkdir -p /opt/erpnext
sudo chown $USER:$USER /opt/erpnext
git clone https://github.com/TU_USUARIO/erpnext.git /opt/erpnext
cd /opt/erpnext
```

### 6. Configurar variables de entorno

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

Ejemplo mínimo para producción:

```env
NODE_ENV=production
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=erp_techstore
DB_USER=erp_user
DB_PASS=cambiar_contraseña_segura
JWT_SECRET=clave_aleatoria_de_al_menos_32_caracteres
JWT_EXPIRES_IN=8h
PUBLIC_BASE_URL=https://erp.midominio.com
CORS_ORIGINS=https://erp.midominio.com
```

### 7. Instalar dependencias y probar arranque

```bash
cd /opt/erpnext/backend
npm ci --omit=dev
mkdir -p uploads/reparaciones
node server.js
```

En otra terminal:

```bash
curl http://127.0.0.1:3000/api/health
```

Si responde `{"ok":true,...}`, detenga el proceso con `Ctrl+C` y continúe.

### 8. Crear servicio systemd

```bash
sudo tee /etc/systemd/system/erpnext.service > /dev/null <<'EOF'
[Unit]
Description=ERP TechStore (Servitec Gamers)
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/erpnext/backend
EnvironmentFile=/opt/erpnext/backend/.env
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

Ajuste permisos para el usuario del servicio:

```bash
sudo chown -R www-data:www-data /opt/erpnext/backend/uploads
sudo chown -R www-data:www-data /opt/erpnext/frontend
sudo systemctl daemon-reload
sudo systemctl enable erpnext
sudo systemctl start erpnext
sudo systemctl status erpnext
```

### 9. Configurar Nginx como proxy inverso

Reemplace `erp.midominio.com` por su dominio real:

```bash
sudo tee /etc/nginx/sites-available/erpnext > /dev/null <<'EOF'
server {
    listen 80;
    server_name erp.midominio.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        client_max_body_size 25M;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/erpnext /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 10. Habilitar HTTPS con Let's Encrypt

```bash
sudo certbot --nginx -d erp.midominio.com
```

Certbot renovará el certificado automáticamente.

### 11. Cargar datos de prueba (opcional)

```bash
cd /opt/erpnext/backend
node seeders/seeder.js
```

### Comandos de mantenimiento en Linux

```bash
# Ver logs del servicio
sudo journalctl -u erpnext -f

# Reiniciar tras cambios en .env o código
sudo systemctl restart erpnext

# Actualizar aplicación
cd /opt/erpnext
git pull
cd backend && npm ci --omit=dev
sudo systemctl restart erpnext

# Backup PostgreSQL
pg_dump -U erp_user -h localhost erp_techstore > ~/backup_erp_$(date +%F).sql
```

---

## Datos de prueba (seeder)

El seeder **borra datos existentes** y carga sedes, usuarios, productos y configuración inicial.

```bash
# Instalación nativa
cd backend && node seeders/seeder.js

# Docker
docker compose -f docker-compose.erp.yml exec erp node seeders/seeder.js
```

---

## Mantenimiento

| Tarea | Docker | Linux |
|-------|--------|-------|
| Ver logs | `docker compose -f docker-compose.erp.yml logs -f erp` | `journalctl -u erpnext -f` |
| Reiniciar | `docker compose -f docker-compose.erp.yml restart erp` | `sudo systemctl restart erpnext` |
| Backup BD | `pg_dump` vía contenedor `postgres` | `pg_dump` local |
| Subidas | Volumen `erp_uploads` | `backend/uploads/` |

---

## Solución de problemas

### El ERP no arranca — error de conexión a PostgreSQL

- Verifique `DB_HOST`, `DB_USER`, `DB_PASS` y que PostgreSQL esté activo.
- Docker: espere a que el healthcheck de `postgres` esté en `healthy` antes de que `erp` inicie.
- Linux: `sudo systemctl status postgresql`

### Puerto 3000 ya en uso

- Cambie `ERP_HOST_PORT` en `.env` (Docker) o `PORT` en `backend/.env` (Linux).
- En Linux con systemd, reinicie el servicio tras el cambio.

### Error CORS en el navegador

- En producción defina `CORS_ORIGINS` con la URL exacta (protocolo + dominio).
- Ejemplo: `CORS_ORIGINS=https://erp.midominio.com`

### `502 Bad Gateway` detrás de Nginx

- Confirme que el ERP responde: `curl http://127.0.0.1:3000/api/health`
- Verifique que `proxy_pass` apunta al puerto correcto.
- Revise logs: `journalctl -u erpnext` o logs de Nginx en `/var/log/nginx/error.log`

### Health check falla en Docker

- La primera sincronización de Sequelize puede tardar. Espere hasta 90 s.
- Revise logs: `docker compose -f docker-compose.erp.yml logs erp`

### Subidas de archivos no persisten (Docker)

- Los archivos se guardan en el volumen `erp_uploads`. No use `docker compose down -v` si desea conservarlos.

---

## Documentación adicional

| Documento | Contenido |
|-----------|-----------|
| [`INSTRUCCIONES_IA_DESARROLLADOR.md`](INSTRUCCIONES_IA_DESARROLLADOR.md) | Guía técnica detallada para desarrollo |
| [`Plan_ERP_TechStore.md`](Plan_ERP_TechStore.md) | Plan funcional y arquitectura |
| [`docker/homelab/README.md`](docker/homelab/README.md) | Stack opcional Pi-hole + Nginx para DNS/HTTPS en red local (no sustituye el Docker del ERP) |

---

## Licencia

ISC (según `backend/package.json`).
