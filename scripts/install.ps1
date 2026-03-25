# TradePi Install Script - Windows
# Usage: powershell -ExecutionPolicy Bypass -File scripts\install.ps1
# For Linux/Raspberry Pi, use: bash scripts/install.sh

$ErrorActionPreference = "Stop"

# Must be run from project root
if (-not (Test-Path "package.json")) {
    Write-Host "ERROR: Run this script from the project root:" -ForegroundColor Red
    Write-Host "  cd clawnse" -ForegroundColor Yellow
    Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\install.ps1" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "TradePi Installer (Windows)" -ForegroundColor Cyan
Write-Host "============================" -ForegroundColor Cyan
Write-Host ""

# ── Check Node.js ──────────────────────────────────────────────
$nodeOk = $false
try {
    $nodeVersion = (node -v) 2>$null
    $major = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
    if ($major -ge 18) {
        $nodeOk = $true
        Write-Host "[OK] Node.js: $nodeVersion" -ForegroundColor Green
    }
} catch {}

if (-not $nodeOk) {
    Write-Host "[!] Node.js 18+ is required but not found." -ForegroundColor Red
    Write-Host ""
    Write-Host "Install it from: https://nodejs.org/ (LTS recommended)" -ForegroundColor Yellow
    Write-Host "Or with winget:  winget install OpenJS.NodeJS.LTS" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "After installing, restart your terminal and run this script again." -ForegroundColor Yellow
    exit 1
}

# ── Install backend dependencies ───────────────────────────────
Write-Host ""
Write-Host "Installing backend dependencies..." -ForegroundColor Cyan
npm install --production
if ($LASTEXITCODE -ne 0) { Write-Host "npm install failed" -ForegroundColor Red; exit 1 }
Write-Host "[OK] Backend dependencies installed" -ForegroundColor Green

# ── Install web dependencies & build ───────────────────────────
Write-Host ""
Write-Host "Installing & building web dashboard..." -ForegroundColor Cyan
Push-Location web
try {
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed in web/" }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed in web/" }
} finally {
    Pop-Location
}
Write-Host "[OK] Web dashboard built" -ForegroundColor Green

# ── Copy .env template ─────────────────────────────────────────
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host ""
    Write-Host "[!] .env created from template - EDIT IT with your credentials" -ForegroundColor Yellow
}

# ── Ensure data & logs folders ─────────────────────────────────
if (-not (Test-Path "data"))  { New-Item -ItemType Directory -Path "data"  | Out-Null }
if (-not (Test-Path "logs"))  { New-Item -ItemType Directory -Path "logs"  | Out-Null }

# ── Done ───────────────────────────────────────────────────────
Write-Host ""
Write-Host "Installation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Edit .env with your credentials:  notepad .env"
Write-Host "  2. Copy your equity_l.csv to:         data\equity_l.csv"
Write-Host "  3. Start the bot:                     npm start"
Write-Host "  4. Or in dev mode (auto-restart):     npm run dev"
Write-Host "  5. Open dashboard:                    http://localhost:3000"
Write-Host ""
