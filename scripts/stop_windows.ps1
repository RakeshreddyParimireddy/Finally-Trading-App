# Stop FinAlly (Windows PowerShell). Idempotent. The data volume (finally-data) is kept.
$ErrorActionPreference = 'Continue'  # native exit codes are checked via $LASTEXITCODE
$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir

docker compose down
if ($LASTEXITCODE -ne 0) {
    Write-Error 'docker compose down failed.'
    exit $LASTEXITCODE
}
Write-Host "FinAlly stopped. Data volume 'finally-data' was kept."
