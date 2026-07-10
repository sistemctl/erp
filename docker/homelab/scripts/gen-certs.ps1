#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$certsDir = Join-Path $root 'certs'
$envFile = Join-Path $root '.env'
$envExample = Join-Path $root '.env.example'

if (-not (Test-Path $envFile)) {
  Copy-Item $envExample $envFile
  Write-Host 'Creado .env desde .env.example - edite HOST_IP y PIHOLE_WEBPASSWORD.'
}

function Read-DotEnv($path) {
  $vars = @{}
  Get-Content $path | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
    $k, $v = $_ -split '=', 2
    $vars[$k.Trim()] = $v.Trim()
  }
  return $vars
}

$env = Read-DotEnv $envFile
$domainErp = $env['DOMAIN_ERP']
if (-not $domainErp) { $domainErp = 'erp.servitec.local' }
$domainErpAlt = $env['DOMAIN_ERP_ALT']
$domainPihole = $env['DOMAIN_PIHOLE']
if (-not $domainPihole) { $domainPihole = 'servitec.pi-hole.local' }

$certDomains = @($domainErp)
if ($domainErpAlt) { $certDomains += $domainErpAlt }
$certDomains += $domainPihole

New-Item -ItemType Directory -Force -Path $certsDir | Out-Null

if (-not (Get-Command mkcert -ErrorAction SilentlyContinue)) {
  Write-Host 'mkcert no encontrado; generando certificado autofirmado...'
  $keyPath = Join-Path $certsDir 'servitec-key.pem'
  $certPath = Join-Path $certsDir 'servitec.pem'
  $sanDns = ($certDomains | ForEach-Object { "DNS:$_" }) -join ','
  $san = "subjectAltName=$sanDns"
  $openssl = Get-Command openssl -ErrorAction SilentlyContinue
  if ($openssl) {
    & openssl req -x509 -nodes -days 825 -newkey rsa:2048 -keyout $keyPath -out $certPath -subj "/CN=$domainErp" -addext $san
  } else {
    docker run --rm -v "${certsDir}:/certs" alpine/openssl req -x509 -nodes -days 825 -newkey rsa:2048 -keyout /certs/servitec-key.pem -out /certs/servitec.pem -subj "/CN=$domainErp" -addext $san
  }
  Write-Host "Certificado autofirmado en $certsDir"
  exit 0
}

Push-Location $certsDir
try {
  mkcert -install
  mkcert -cert-file servitec.pem -key-file servitec-key.pem @certDomains
  Write-Host "Certificados listos en $certsDir"
  $caPath = Join-Path $env:LOCALAPPDATA 'mkcert\rootCA.pem'
  Write-Host "CA raiz para otros PCs: $caPath"
} finally {
  Pop-Location
}
