# Pi-hole + Nginx (homelab local)

> **Importante:** Este stack es **complementario**. Sirve para DNS local (Pi-hole) y proxy HTTPS (Nginx) en una red LAN.
> **No instala ni ejecuta el ERP en Docker.**
>
> Para levantar el ERP completo (aplicación + PostgreSQL) use la guía principal del repositorio:
> [`README.md`](../../README.md) → sección **Instalación con Docker** (`docker-compose.erp.yml`).

Contenedores para DNS local y proxy HTTPS sin puerto en la URL.

| Servicio | Puerto en el host | Función |
|---|---|---|
| **Pi-hole** | 53 | DNS de la red |
| **Nginx** | 80, 443 | HTTPS y proxy |
| **ERP** (fuera de Docker) | 8080 | Servitec Gamers en el host — ver [README principal](../../README.md) |

## Relación con el Docker del ERP

| Stack | Archivo | Qué levanta |
|-------|---------|-------------|
| **ERP (recomendado)** | `docker-compose.erp.yml` en la raíz | PostgreSQL + aplicación Node.js |
| **Homelab (este directorio)** | `docker-compose.yml` | Solo Pi-hole + Nginx proxy |

Puede usar ambos: primero el ERP con `docker-compose.erp.yml` y, si desea dominios `.local` con HTTPS en su red, configure este homelab apuntando Nginx al puerto donde escucha el ERP.

## URLs

- `https://servitec.erp.local` → ERP (`host.docker.internal:8080`)
- `https://servitec.pi-hole.local` → panel Pi-hole

## Requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows)
- [mkcert](https://github.com/FiloSottile/mkcert) — certificados HTTPS locales
- ERP corriendo en el host en el puerto **8080**

## Inicio rápido

```powershell
cd docker\homelab
copy .env.example .env
# Edite .env: HOST_IP (IP LAN de su PC) y PIHOLE_WEBPASSWORD

.\scripts\start.ps1
```

O paso a paso:

```powershell
.\scripts\gen-certs.ps1
.\scripts\setup-local-dns.ps1
docker compose up -d
```

## Router / red

En el router, configure el **DNS primario** de la LAN con `HOST_IP` (la PC donde corre Docker).

En otros PCs, instale la CA de mkcert (`%LOCALAPPDATA%\mkcert\rootCA.pem`) como autoridad raíz de confianza.

## ERP — backend/.env

```env
PUBLIC_BASE_URL=https://servitec.erp.local
CORS_ORIGINS=https://servitec.erp.local
```

Reinicie el backend después de cambiar `.env`.

## Comandos útiles

```powershell
docker compose ps
docker compose logs -f nginx
docker compose logs -f pihole
docker compose restart
docker compose down
```

## Cambiar dominios

1. Edite `DOMAIN_ERP` / `DOMAIN_PIHOLE` en `.env`
2. Edite `server_name` en `nginx/servitec.conf`
3. Vuelva a ejecutar `.\scripts\gen-certs.ps1` y `.\scripts\setup-local-dns.ps1`
4. `docker compose restart`

## Notas

- El puerto **443** lo usa solo Nginx; Pi-hole web va por detrás en el puerto 80 interno del contenedor.
- Si el ERP usa otro puerto, cambie `proxy_pass` en `nginx/servitec.conf`.
- Si `502` al ERP: confirme que `npm run start` está activo en `backend` y que Docker puede alcanzar `host.docker.internal`.
