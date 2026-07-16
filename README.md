# ERP TechStore (Servitec Gamers)

Sistema ERP monolítico para tiendas de tecnología: ventas, inventario, reparaciones, instalaciones, facturación, cartera, nómina, trade-in, notificaciones y reportes.

| Capa | Tecnología |
|------|------------|
| Backend | Node.js 20+, Express 5, Sequelize |
| Base de datos | PostgreSQL 16 |
| Frontend | JavaScript vanilla (ES modules), Tabler UI, Bootstrap 5 |
| Infra opcional | Docker Compose, Dokploy, Cloudflare Tunnel, Nginx, systemd |

El backend sirve la API REST (`/api/*`), archivos subidos (`/uploads`) y el frontend estático desde un solo proceso.

**Producción:** despliegue con Dokploy/Docker en la rama `3.0` (configura tu dominio en Environment).

---

## Tabla de contenidos

1. [Requisitos](#requisitos)
2. [Estructura del repositorio](#estructura-del-repositorio)
3. [Variables de entorno](#variables-de-entorno)
4. [Instalación con Dokploy](#instalación-con-dokploy)
5. [Instalación en servidor Linux](#instalación-en-servidor-linux)
6. [Datos de prueba (seeder)](#datos-de-prueba-seeder)
7. [Migración desde Odoo](#migración-desde-odoo-odoo_db--erp_techstore)
8. [Mantenimiento](#mantenimiento)
9. [Solución de problemas](#solución-de-problemas)
10. [Documentación adicional](#documentación-adicional)

---

## Requisitos

### Instalación con Dokploy

| Herramienta | Versión mínima |
|-------------|----------------|
| [Dokploy](https://dokploy.com) en un VPS | reciente |
| Docker Engine + Compose (gestionado por Dokploy) | 24+ / v2+ |
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
erp/
├── backend/              # API Express + modelos Sequelize
│   ├── server.js         # Punto de entrada
│   ├── .env.example      # Variables para instalación nativa
│   └── seeders/          # Datos de prueba
├── frontend/             # SPA estática (sin build)
├── Dockerfile            # Imagen del ERP
├── docker-compose.yml    # Dokploy (postgres + erp)
└── .env.docker.example   # Variables para Environment de Dokploy
```

---

## Variables de entorno

Copia la plantilla según el método de instalación:

| Método | Archivo plantilla | Destino |
|--------|-------------------|---------|
| Dokploy | [`.env.docker.example`](.env.docker.example) | Environment del servicio Compose |
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
| `PUBLIC_BASE_URL` | URL pública con HTTPS, ej. `https://erp.tudominio.com` |
| `CORS_ORIGINS` | Orígenes permitidos separados por coma (dominio e IP). `PUBLIC_BASE_URL` se acepta automáticamente si falta en la lista. |

### Variables opcionales

| Variable | Descripción |
|----------|-------------|
| `JWT_EXPIRES_IN` | Expiración del token (por defecto `8h`) |
| `GEMINI_API_KEY` | API de Google Gemini |
| `GEMINI_MODEL` | Modelo Gemini (por defecto `gemini-2.5-flash`) |
| `SMTP_*` | Correo saliente (también configurable en la UI) |
| `TWILIO_*` | SMS/WhatsApp (también configurable en la UI) |

> **Nota CORS:** En producción, CORS aplica **solo** a rutas `/api/*`. Los assets estáticos (`/assets/js/*.js`) no pasan por CORS. Con `NODE_ENV=production`, las IPs públicas **no** se aceptan automáticamente: incluye dominio e IP en `CORS_ORIGINS` (ej. `https://erp.tudominio.com,http://IP:8080`).

---

## Instalación con Dokploy

Despliegue en un VPS con [Dokploy](https://dokploy.com) usando [`docker-compose.yml`](docker-compose.yml).

| Capa | Puerto |
|------|--------|
| Contenedor `erp` | **3000** (`PORT=3000`) |
| Host / IP del VPS | **8080** (mapeo `8080:3000`) |
| Dokploy Domains | **3000** (proxy → contenedor) |

PostgreSQL **no** publica el puerto 5432: solo está en la red `internal` del stack. Solo el contenedor `erp` puede conectarse.

### 1. Crear el servicio Compose

1. En Dokploy: **Project** → **Create Service** → **Compose**
2. Compose Type: **Docker Compose** (no Stack; hace falta `build`)
3. Provider: GitHub / Git → repo → rama
4. **Compose Path:** `./docker-compose.yml`
5. Guardar

### 2. Variables de entorno

En la pestaña **Environment**, pega el contenido de [`.env.docker.example`](.env.docker.example) y define al menos:

```env
DB_PASS=tu_contraseña_segura
JWT_SECRET=genera_una_clave_aleatoria_de_32_caracteres_o_mas
PUBLIC_BASE_URL=https://erp.tudominio.com
CORS_ORIGINS=https://erp.tudominio.com,http://IP_DEL_VPS:8080
```

Usa tu dominio en `PUBLIC_BASE_URL` y añade la IP `:8080` en `CORS_ORIGINS` si también entras por IP. Si cambia la IP del VPS, actualiza el segundo origen.

### 3. Dominio

1. Pestaña **Domains** → Add Domain
2. Servicio: **erp**
3. Puerto: **3000**
4. Host: `erp.tudominio.com` (o tu dominio)
5. Activa HTTPS / certificado Let's Encrypt
6. Apunta el DNS (A/CNAME) al servidor de Dokploy

**Alternativa con Cloudflare Tunnel** (sin Dokploy Domains): apunta el túnel a `http://127.0.0.1:8080` en el host (mapeo Docker) o a `http://host.docker.internal:8080` si `cloudflared` corre en Docker en Windows. Usa **HTTP**, no HTTPS, hacia el origen local.

### 4. Desplegar

Pulsa **Deploy** y espera a que construya la imagen y arranque `postgres` + `erp`.

Comprueba salud:

```
https://erp.tudominio.com/api/health
```

Debe responder algo como:

```json
{"ok":true,"puerto":3000,"urlPublica":"https://erp.tudominio.com"}
```

Acceso directo por IP (mapeo host `8080` → contenedor `3000`):

```
http://IP_DEL_VPS:8080
```

Volúmenes persistentes: `pgdata` (PostgreSQL) y `erp_uploads` (archivos). Puedes respaldarlos desde **Volume Backups** en Dokploy.

### 5. Seed opcional

```bash
docker compose exec erp node seeders/seeder.js
```

Credenciales iniciales del seeder (tras ejecutarlo):

| Rol | Email | Contraseña |
|-----|-------|------------|
| Superadmin | `admin@licoreria.com` | `admin123` |
| Admin | `admin@techstore.com` | `admin123` |

### Comandos útiles

```bash
# Logs
docker compose logs -f erp

# Reiniciar solo el ERP
docker compose restart erp

# Respaldo de PostgreSQL
docker compose exec postgres \
  pg_dump -U erp_user erp_techstore > backup_$(date +%F).sql
```

---

## Instalación en servidor Linux

Guía para **Ubuntu 22.04/24.04** o Debian equivalente. El ERP corre como servicio `systemd` detrás de Nginx con HTTPS.

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

### 4. Crear la base de datos y el usuario

```bash
sudo -u postgres psql <<'SQL'
CREATE USER erp_user WITH PASSWORD 'tu_contraseña_segura';
CREATE DATABASE erp_techstore OWNER erp_user;
GRANT ALL PRIVILEGES ON DATABASE erp_techstore TO erp_user;
SQL
```

### 5. Clonar el proyecto

```bash
sudo mkdir -p /opt/erp
sudo chown $USER:$USER /opt/erp
git clone https://github.com/sistemctl/erp.git /opt/erp
cd /opt/erp
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
DB_PASS=tu_contraseña_segura
JWT_SECRET=genera_una_clave_aleatoria_de_32_caracteres_o_mas
JWT_EXPIRES_IN=8h
PUBLIC_BASE_URL=https://erp.tudominio.com
CORS_ORIGINS=https://erp.tudominio.com,http://IP_DEL_VPS:8080
```

### 7. Instalar dependencias y probar el arranque

```bash
cd /opt/erp/backend
npm ci --omit=dev
mkdir -p uploads/reparaciones
node server.js
```

En otra terminal:

```bash
curl http://127.0.0.1:3000/api/health
```

Si responde `{"ok":true,...}`, detén el proceso con `Ctrl+C` y continúa.

### 8. Crear el servicio systemd

```bash
sudo tee /etc/systemd/system/erp.service > /dev/null <<'EOF'
[Unit]
Description=ERP TechStore (Servitec Gamers)
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/erp/backend
EnvironmentFile=/opt/erp/backend/.env
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

Asigna permisos al usuario del servicio:

```bash
sudo chown -R www-data:www-data /opt/erp/backend/uploads
sudo chown -R www-data:www-data /opt/erp/frontend
sudo systemctl daemon-reload
sudo systemctl enable erp
sudo systemctl start erp
sudo systemctl status erp
```

### 9. Configurar Nginx como proxy inverso

Reemplaza `erp.tudominio.com` si usas otro dominio:

```bash
sudo tee /etc/nginx/sites-available/erp > /dev/null <<'EOF'
server {
    listen 80;
    server_name erp.tudominio.com;

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

sudo ln -sf /etc/nginx/sites-available/erp /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 10. Habilitar HTTPS con Let's Encrypt

```bash
sudo certbot --nginx -d erp.tudominio.com
```

Certbot renovará el certificado automáticamente.

### 11. Cargar datos de prueba (opcional)

```bash
cd /opt/erp/backend
node seeders/seeder.js
```

### Comandos de mantenimiento en Linux

```bash
# Ver logs del servicio
sudo journalctl -u erp -f

# Reiniciar después de cambios en .env o código
sudo systemctl restart erp

# Actualizar la aplicación
cd /opt/erp
git pull
cd backend && npm ci --omit=dev
sudo systemctl restart erp

# Respaldo de PostgreSQL
pg_dump -U erp_user -h localhost erp_techstore > ~/backup_erp_$(date +%F).sql
```

---

## Datos de prueba (seeder)

El seeder **borra datos existentes** y carga sedes, usuarios, productos y configuración inicial.

```bash
# Instalación nativa
cd backend && node seeders/seeder.js

# Docker (Dokploy)
docker compose exec erp node seeders/seeder.js
```

| Rol | Email | Contraseña |
|-----|-------|------------|
| Superadmin | `admin@licoreria.com` | `admin123` |
| Admin | `admin@techstore.com` | `admin123` |
| Gerente sede | `gerente@techstore.com` | `gerente123` |
| Cajero | `cajero@techstore.com` | `cajero123` |
| Técnico | `tecnico@techstore.com` | `tecnico123` |
| Contador | `contador@techstore.com` | `contador123` |

---

## Migración desde Odoo (`odoo_db` → `erp_techstore`)

Importa el máximo de datos mapeables desde una base Odoo en PostgreSQL hacia este ERP.

**Conserva:** `Usuarios` y `ConfiguracionesSistema`.  
**Limpia:** sedes, productos, clientes, stock, ventas, facturas, compras y demás tablas de negocio.  
**Migra:** sedes (almacenes), categorías, productos, clientes, proveedores, stock, ventas, facturas y órdenes de compra (si existen en Odoo).

### 1. Backup obligatorio

```bash
pg_dump -U postgres erp_techstore > backup_erp_antes_odoo.sql
```

### 2. Variables en `backend/.env`

```env
ODOO_DB_HOST=localhost
ODOO_DB_PORT=5432
ODOO_DB_NAME=odoo_db
ODOO_DB_USER=postgres
ODOO_DB_PASS=tu_contraseña
```

(Las variables `DB_*` deben apuntar a `erp_techstore`.)

### 3. Simulación (no escribe)

```bash
cd backend
node scripts/migrate-odoo.js --dry-run
```

### 4. Migración real

```bash
node scripts/migrate-odoo.js --execute
```

Con Docker (si el contenedor alcanza ambas bases):

```bash
docker compose exec erp node scripts/migrate-odoo.js --dry-run
docker compose exec erp node scripts/migrate-odoo.js --execute
```

> Si Odoo y el ERP están en el mismo PostgreSQL del host, desde Docker usa `DB_HOST=host.docker.internal` (o la IP del host) y lo mismo en `ODOO_DB_HOST`.

---

## Mantenimiento

| Tarea | Docker (Dokploy) | Linux |
|-------|------------------|-------|
| Ver logs | `docker compose logs -f erp` | `journalctl -u erp -f` |
| Reiniciar | `docker compose restart erp` | `sudo systemctl restart erp` |
| Respaldo BD | `pg_dump` vía contenedor `postgres` | `pg_dump` local |
| Subidas | Volumen `erp_uploads` | `backend/uploads/` |

---

## Solución de problemas

### El ERP no arranca — error de conexión a PostgreSQL

- Revisa `DB_HOST`, `DB_USER`, `DB_PASS` y que PostgreSQL esté activo.
- Docker: espera a que el healthcheck de `postgres` esté en `healthy` antes de que `erp` inicie.
- Linux: `sudo systemctl status postgresql`

### Puerto 3000 ya en uso

- Docker/Dokploy: el contenedor usa 3000; el host publica **8080**. Si 8080 está ocupado, cambia el mapeo en `docker-compose.yml`.
- Linux: cambia `PORT` en `backend/.env` y reinicia el servicio.

### Error CORS en el navegador

- En producción define `CORS_ORIGINS` con cada origen exacto (protocolo + host + puerto si aplica).
- Ejemplo: `CORS_ORIGINS=https://erp.tudominio.com,http://IP_DEL_VPS:8080`
- Tras cambiar `.env`, **reinicia el backend** (`docker compose restart erp` o reiniciar Node).
- CORS solo aplica a `/api/*`; si `app.js` devuelve 500 con mensaje CORS, el servidor sigue con variables viejas o CORS global mal configurado.

### La página se queda en «Cargando sistema…»

- Abre DevTools → Network y revisa `/assets/js/app.js`.
- Si responde **500** con error CORS, reinicia el ERP con `PUBLIC_BASE_URL` y `CORS_ORIGINS` correctos.
- En Cloudflare, desactiva **Rocket Loader** o usa `data-cfasync="false"` en scripts (ya incluido en `index.html`).

### 404 en `/api/caja/reporte`

- **Normal** si no hay apertura de caja hoy: el backend responde `200` con `{ "estado": "sin_registro" }` (versiones recientes).
- Ve a **Caja** → **Hacer Apertura de Caja** antes de usar el POS.

### Login muestra «Sesión expirada» con credenciales incorrectas

- El frontend distingue 401 de login (credenciales inválidas) de 401 de sesión expirada. Si ves el mensaje antiguo, recarga con `Ctrl+Shift+R` para obtener el JS actualizado.

### `502 Bad Gateway` detrás de Nginx

- Confirma que el ERP responde: `curl http://127.0.0.1:3000/api/health`
- Verifica que `proxy_pass` apunta al puerto correcto.
- Revisa logs: `journalctl -u erp` o `/var/log/nginx/error.log`

### Health check falla en Docker

- La primera sincronización de Sequelize puede tardar. Espera hasta 90 segundos.
- Revisa logs: `docker compose logs erp`

### Subidas de archivos no persisten (Docker)

- Los archivos se guardan en el volumen `erp_uploads`. No uses `docker compose down -v` si quieres conservarlos.

---

## Documentación adicional

| Documento | Contenido |
|-----------|-----------|
| [`Plan_ERP_TechStore.md`](Plan_ERP_TechStore.md) | Plan funcional y arquitectura |

---

## Licencia

ISC (según `backend/package.json`).
