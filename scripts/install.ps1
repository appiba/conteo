param(
  [string]$Python = "python"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path ".venv")) {
  & $Python -m venv .venv
}

& ".\.venv\Scripts\python.exe" -m pip install --upgrade pip
& ".\.venv\Scripts\python.exe" -m pip install -r requirements.txt

Write-Host ""
Write-Host "Listo. Ejecuta:"
Write-Host ".\.venv\Scripts\python.exe main.py"
