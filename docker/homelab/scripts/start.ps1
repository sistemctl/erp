#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path '.env')) {
  Copy-Item '.env.example' '.env'
  Write-Host 'Edite .env (HOST_IP, PIHOLE_WEBPASSWORD) y vuelva a ejecutar.'
  exit 0
}

$pem = Join-Path $root 'certs\servitec.pem'
if (-not (Test-Path $pem)) {
  Write-Host 'Generando certificados...'
  & (Join-Path $PSScriptRoot 'gen-certs.ps1')
}

& (Join-Path $PSScriptRoot 'setup-local-dns.ps1')

Write-Host 'Levantando contenedores...'
docker compose up -d

Write-Host ''
Write-Host 'Listo:'
Write-Host '  https://erp.servitec.local       -> ERP host:8080'
Write-Host '  https://servitec.pi-hole.local  -> panel Pi-hole'
Write-Host ''
Write-Host 'backend/.env:'
Write-Host '  PUBLIC_BASE_URL=https://erp.servitec.local'
Write-Host '  CORS_ORIGINS=https://erp.servitec.local'
