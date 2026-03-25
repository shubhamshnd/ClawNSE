# TradePi 🤖📈

**Agentic stock scanner & alert system for Raspberry Pi 5**

Built with Nubra REST API · Gemini AI Multi-Agent · Telegram Bot · Node.js · React Dashboard

---

## Features

- **EMA Crossover Scanner** — scans your NSE equity list for golden/death crosses and near-crossover setups
- **6 Built-in Strategies** — EMA Crossover, MACD, RSI, Bollinger Bands, Supertrend, Multi-Confluence
- **AI Strategy Builder** — describe a strategy in plain English, Gemini converts it to rules
- **4 Gemini AI Agents** — MarketAnalyst, RiskAdvisor, StrategyCoach, NewsCorrelator (communicate with each other)
- **Telegram Bot** — scheduled alerts + `/scan`, `/ask`, `/portfolio`, `/strategy`, `/otp` commands
- **MCP Plugin Marketplace** — install extensions from GitHub like VS Code extensions
- **Web Dashboard** — React UI served from Pi, accessible from any device on your network
- **Raspberry Pi 5 optimised** — systemd service, auto-restart, rate-limit-aware scanner

---

## Quick Start

### 1. Clone & Install
```bash
git clone https://github.com/YOUR_USERNAME/tradepi.git
cd tradepi
bash scripts/install.sh
```

### 2. Configure
Edit `.env`:
```
NUBRA_PHONE=9XXXXXXXXX
NUBRA_MPIN=1234
NUBRA_DEVICE_ID=PIBOT01
GEMINI_API_KEY=AIza...
TELEGRAM_BOT_TOKEN=12345:AABBxxx
TELEGRAM_CHAT_ID=-100123456
```

### 3. Add your stock list
```bash
cp /path/to/equity_l.csv data/equity_l.csv
```
Download `equity_l.csv` from NSE: https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv

### 4. First-time Login (Nubra OTP)
On first start, Nubra will send an OTP to your phone. Send it to the bot:
```
/otp 123456
```
Or write it to `data/pending_otp.txt`.

### 5. Start
```bash
sudo systemctl start tradepi
```
Dashboard: `http://[PI-IP]:3000`

---

## Architecture

```
index.js                    ← Entry point, wires everything
├── core/
│   ├── nubraClient.js      ← Nubra REST API (auth, candles, portfolio)
│   ├── stockScanner.js     ← CSV → scan loop → strategy engine
│   ├── telegramBot.js      ← Commands + scheduled alerts
│   ├── scheduler.js        ← Cron jobs (IST timezone)
│   └── apiServer.js        ← Express + Socket.IO for web UI
├── agents/
│   └── geminiAgent.js      ← Multi-agent AI (MarketAnalyst, RiskAdvisor, etc.)
├── strategies/
│   └── strategyEngine.js   ← All strategies + custom strategy runner
├── mcp_plugins/
│   └── mcpManager.js       ← Plugin install/update/remove from GitHub
└── web/                    ← React dashboard (Vite build)
    └── src/pages/
        ├── Dashboard.jsx
        ├── ScanPage.jsx
        ├── StrategyPage.jsx
        ├── PluginsPage.jsx
        ├── PortfolioPage.jsx
        ├── AiChatPage.jsx
        └── SettingsPage.jsx
```

---

## Telegram Commands

| Command | Description |
|---|---|
| `/scan [STRATEGY]` | Run scan with optional strategy name |
| `/status` | Bot health, jobs, plugins |
| `/portfolio` | Holdings, positions, funds |
| `/ask [question]` | Chat with AI Market Analyst |
| `/strategy` | List all available strategies |
| `/otp [code]` | Submit Nubra OTP for authentication |

---

## Strategies

| Strategy | Signal Detected |
|---|---|
| `EMA_CROSSOVER` | Golden cross, death cross, near-crossover (within 1.5% gap) |
| `MACD_CROSSOVER` | MACD/signal line cross + histogram momentum |
| `RSI_OVERSOLD` | Oversold/overbought zones + recovery signals |
| `BOLLINGER_BANDS` | Band touch + squeeze (breakout warning) |
| `SUPERTREND` | Trend flip (bullish/bearish) |
| `MULTI_CONFLUENCE` | 2+ or 3+ indicators aligned = BUY/STRONG_BUY |
| `CUSTOM:*` | Your own rules via Strategy Builder or AI |

---

## MCP Plugins (Marketplace)

Install from GitHub:
```bash
# Via Web UI → Plugins page
# Or API:
curl -X POST http://localhost:3000/api/plugins/install \
  -H 'Content-Type: application/json' \
  -d '{"pluginId":"my-plugin","repoUrl":"https://github.com/user/repo"}'
```

Each plugin needs a `plugin.json` manifest:
```json
{
  "name": "My Plugin",
  "version": "1.0.0",
  "type": "data",
  "main": "index.js",
  "description": "What this plugin does"
}
```

---

## Rate Limits (Nubra)
- Historical data: 60 req/min — scanner batches 10 stocks every 12 seconds
- Trades: 10 ops/sec (production)

---

## License
MIT
