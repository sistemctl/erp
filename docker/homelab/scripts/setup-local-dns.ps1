#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root '.env'
$envExample = Join-Path $root '.env.example'
$dnsmasqDir = Join-Path $root 'pihole\etc-dnsmasq.d'
$outFile = Join-Path $dnsmasqDir '99-servitec-local.conf'

if (-not (Test-Path $envFile)) {
  Copy-Item $envExample $envFile
  Write-Host 'Creado .env - configure HOST_IP antes de continuar.'
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
$hostIp = $env['HOST_IP']
if (-not $hostIp) {
  throw 'HOST_IP no definido en .env'
}

$domainErp = if ($env['DOMAIN_ERP']) { $env['DOMAIN_ERP'] } else { 'erp.servitec.local' }
$domainErpAlt = $env['DOMAIN_ERP_ALT']
$domainPihole = if ($env['DOMAIN_PIHOLE']) { $env['DOMAIN_PIHOLE'] } else { 'servitec.pi-hole.local' }

New-Item -ItemType Directory -Force -Path $dnsmasqDir | Out-Null

$lines = @(
  '# Generado por setup-local-dns.ps1'
  "address=/$domainErp/$hostIp"
)
if ($domainErpAlt) { $lines += "address=/$domainErpAlt/$hostIp" }
$lines += "address=/$domainPihole/$hostIp"
Set-Content -Path $outFile -Value $lines -Encoding ASCII

Write-Host "DNS local escrito en $outFile"
Write-Host 'Reinicie Pi-hole: docker compose restart pihole'
