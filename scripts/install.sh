#!/bin/bash
# TradePi Install Script — Linux (Raspberry Pi / Ubuntu / Debian)
# For Windows, use: scripts\install.ps1
set -e

# Must be run from project root
if [ ! -f "package.json" ]; then
  echo "ERROR: Run this script from the project root: bash scripts/install.sh"
  exit 1
fi

echo "🤖 TradePi Installer (Linux)"
echo "============================="

# Check we're on Linux
if [[ "$OSTYPE" != "linux"* ]]; then
  echo "ERROR: This script is for Linux only."
  echo "On Windows, run: powershell -ExecutionPolicy Bypass -File scripts\\install.ps1"
  exit 1
fi

# Check Node.js
if ! command -v node &>/dev/null || [[ $(node -v | cut -d. -f1 | tr -d v) -lt 18 ]]; then
  echo "📦 Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

echo "✅ Node.js: $(node -v)"

# Install backend deps
echo "📦 Installing backend dependencies..."
npm install --production

# Install web deps & build
echo "📦 Installing & building web dashboard..."
cd web && npm install && npm run build && cd ..

# Copy env template
if [ ! -f .env ]; then
  cp .env.example .env
  echo "⚠️  .env created from template — EDIT IT with your credentials"
fi

# Ensure data folder
mkdir -p data logs

# Create systemd service
echo "🔧 Setting up systemd service..."
sudo tee /etc/systemd/system/tradepi.service > /dev/null << SERVICE
[Unit]
Description=TradePi Agentic Trading Bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)
ExecStart=$(which node) index.js
Restart=on-failure
RestartSec=10
EnvironmentFile=$(pwd)/.env
StandardOutput=append:$(pwd)/logs/tradepi.log
StandardError=append:$(pwd)/logs/tradepi-error.log

[Install]
WantedBy=multi-user.target
SERVICE

sudo systemctl daemon-reload
sudo systemctl enable tradepi
echo ""
echo "✅ Installation complete!"
echo ""
echo "Next steps:"
echo "  1. Edit .env with your credentials: nano .env"
echo "  2. Copy your equity_l.csv to: $(pwd)/data/equity_l.csv"
echo "  3. Start the bot: sudo systemctl start tradepi"
echo "  4. Check logs: sudo journalctl -u tradepi -f"
echo "  5. Open dashboard: http://$(hostname -I | awk '{print $1}'):3000"
