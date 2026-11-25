# Start FinAlly (Windows PowerShell). Idempotent: safe to run repeatedly.
# Usage: .\scripts\start_windows.ps1 [-Build] [-NoOpen]
[CmdletBinding()]
param(
    [switch]$Build,
    [switch]$NoOpen
)

$ErrorActionPreference = 'Continue'  # native exit codes are checked via $LASTEXITCODE
$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir

$Url = 'http://localhost:8000'

docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Error 'Docker does not appear to be running. Start Docker Desktop and try again.'
    exit 1
}

if (-not (Test-Path (Join-Path $RootDir '.env'))) {
    Write-Host 'Note: no .env file found. Copy .env.example to .env and set OPENROUTER_API_KEY for AI chat.'
}

docker image inspect finally:latest *> $null
$imageMissing = ($LASTEXITCODE -ne 0)

if ($Build -or $imageMissing) {
    docker compose up -d --build
} else {
    docker compose up -d
}
if ($LASTEXITCODE -ne 0) {
    Write-Error 'docker compose up failed.'
    exit $LASTEXITCODE
}

# Wait for the app to report healthy (up to ~60s) before opening the browser
Write-Host -NoNewline 'Waiting for FinAlly to start'
$healthy = $false
for ($i = 0; $i -lt 60; $i++) {
    try {
        $resp = Invoke-WebRequest -Uri "$Url/api/health" -UseBasicParsing -TimeoutSec 2
        if ($resp.StatusCode -eq 200) { $healthy = $true; break }
    } catch { }
    Write-Host -NoNewline '.'
    Start-Sleep -Seconds 1
}
Write-Host ''
if (-not $healthy) {
    Write-Error 'FinAlly did not become healthy in time. Check logs with: docker compose logs finally'
    exit 1
}

Write-Host "FinAlly is running at $Url"

if (-not $NoOpen) {
    Start-Process $Url
}
