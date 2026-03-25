/**
 * TradePi — Agentic Trading Bot for Raspberry Pi 5
 * Entry point: initializes all services, scheduler, web server, telegram bot
 */
import 'dotenv/config';
import { NubraClient }    from './core/nubraClient.js';
import { StockScanner }   from './core/stockScanner.js';
import { TelegramNotifier } from './core/telegramBot.js';
import { Scheduler }      from './core/scheduler.js';
import { GeminiAgent }    from './agents/geminiAgent.js';
import { MCPManager }     from './mcp_plugins/mcpManager.js';
import { StrategyEngine } from './strategies/strategyEngine.js';
import { createApiServer } from './core/apiServer.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Init Services ────────────────────────────────────────────────────────

const nubra = new NubraClient({
  baseUrl:  process.env.NUBRA_BASE_URL || 'https://api.nubra.io',
  phone:    process.env.NUBRA_PHONE,
  mpin:     process.env.NUBRA_MPIN,
  deviceId: process.env.NUBRA_DEVICE_ID || 'PIBOT01',
});

const strategyEngine = new StrategyEngine(process.env);

const scanner = new StockScanner(nubra, {
  ...process.env,
  csvPath: path.join(__dirname, 'data/equity_l.csv'),
});

const gemini = new GeminiAgent(
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_MODEL || 'gemini-1.5-flash'
);

const telegram = new TelegramNotifier(
  process.env.TELEGRAM_BOT_TOKEN,
  process.env.TELEGRAM_CHAT_ID
);

const mcpManager = new MCPManager();
const scheduler  = new Scheduler();

// ─── Register Telegram Commands ───────────────────────────────────────────

telegram.registerOtpHandler();

telegram.onCommand('scan', async (msg, args) => {
  const strategy = args.trim().toUpperCase() || (process.env.DEFAULT_STRATEGY || 'EMA_CROSSOVER');
  await telegram.send(`🔍 Running *${strategy}* scan across all stocks...`);
  try {
    const results = await scanner.scan(strategy);
    const analysis = await gemini.analyzeScanResults(results, strategy);
    await telegram.send(analysis);
  } catch (e) {
    await telegram.send(`❌ Scan failed: ${e.message}`);
  }
});

telegram.onCommand('status', async (msg) => {
  const jobs = scheduler.list();
  const strats = strategyEngine.listStrategies();
  const plugins = Object.keys(mcpManager.getInstalled());
  await telegram.send(
    `🟢 *TradePi Status*\n\n` +
    `*Scheduled Jobs:* ${jobs.length > 0 ? jobs.join(', ') : 'None'}\n` +
    `*Strategies:* ${strats.length}\n` +
    `*Plugins:* ${plugins.length > 0 ? plugins.join(', ') : 'None'}\n` +
    `*Active Strategy:* ${process.env.DEFAULT_STRATEGY || 'EMA_CROSSOVER'}\n` +
    `*Time:* ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`
  );
});

telegram.onCommand('portfolio', async (msg) => {
  try {
    await telegram.send('📊 Fetching portfolio...');
    const [holdings, positions, funds] = await Promise.all([
      nubra.getPortfolioHoldings(),
      nubra.getPositions(),
      nubra.getFunds()
    ]);
    const h = holdings?.portfolio;
    const f = funds?.port_funds_and_margin;
    let msg2 = `💼 *Portfolio Summary*\n\n`;
    if (h) {
      msg2 += `*Invested:* ₹${(h.holding_stats?.invested_amount/100 || 0).toLocaleString()}\n`;
      msg2 += `*Current:* ₹${(h.holding_stats?.current_value/100 || 0).toLocaleString()}\n`;
      msg2 += `*P&L:* ₹${(h.holding_stats?.total_pnl/100 || 0).toLocaleString()} (${h.holding_stats?.total_pnl_chg?.toFixed(2)}%)\n\n`;
    }
    if (f) {
      msg2 += `*Available Balance:* ₹${(f.net_withdrawal_amount/100 || 0).toLocaleString()}\n`;
    }
    await telegram.send(msg2);
  } catch (e) {
    await telegram.send(`❌ Portfolio fetch failed: ${e.message}`);
  }
});

telegram.onCommand('ask', async (msg, args) => {
  if (!args) { await telegram.send('Usage: /ask What does a golden cross mean for RELIANCE?'); return; }
  await telegram.send('🤔 Thinking...');
  const response = await gemini.chat(args);
  await telegram.send(`🤖 *AI Analyst:*\n\n${response}`);
});

telegram.onCommand('strategy', async (msg, args) => {
  const strats = strategyEngine.listStrategies();
  let txt = `📋 *Available Strategies*\n\n`;
  strats.forEach((s, i) => { txt += `${i+1}. \`${s}\`\n`; });
  txt += `\n_Use /scan [STRATEGY_NAME] to run_`;
  await telegram.send(txt);
});

// ─── Scheduled Scans ─────────────────────────────────────────────────────

const defaultStrategy = process.env.DEFAULT_STRATEGY || 'EMA_CROSSOVER';

async function runScheduledScan(label) {
  try {
    await telegram.send(`⏰ *Scheduled Scan — ${label}*\nStarting ${defaultStrategy} scan...`);
    const results  = await scanner.scan(defaultStrategy);
    const analysis = await gemini.analyzeScanResults(results, defaultStrategy);
    await telegram.send(analysis);
  } catch (e) {
    await telegram.send(`❌ Scheduled scan (${label}) failed: ${e.message}`);
  }
}

scheduler.schedule('market-open',  process.env.SCAN_CRON_MARKET_OPEN  || '0 9 * * 1-5',   () => runScheduledScan('Market Open'));
scheduler.schedule('mid-session',  process.env.SCAN_CRON_MID_SESSION  || '30 11 * * 1-5', () => runScheduledScan('Mid Session'));
scheduler.schedule('afternoon',    process.env.SCAN_CRON_AFTERNOON    || '0 14 * * 1-5',  () => runScheduledScan('Afternoon'));
scheduler.schedule('eod',          process.env.SCAN_CRON_EOD          || '20 15 * * 1-5', () => runScheduledScan('End of Day'));

// ─── Start API Server ─────────────────────────────────────────────────────

const { server } = createApiServer({
  nubra, scanner, gemini, telegram, scheduler, mcpManager, strategyEngine
});

const PORT = parseInt(process.env.PORT) || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 TradePi running on http://0.0.0.0:${PORT}`);
  console.log(`📱 Web dashboard: http://[Pi-IP]:${PORT}`);
});

// ─── Startup ─────────────────────────────────────────────────────────────

async function startup() {
  try {
    console.log('🤖 TradePi starting...');
    await fs.ensureDir(path.join(__dirname, 'data'));
    await fs.ensureDir(path.join(__dirname, 'logs'));

    // Attempt auth (will prompt for OTP via Telegram if needed)
    await nubra.authenticate();
    await telegram.sendStartupMessage();
    console.log('✅ All systems online');
  } catch (e) {
    console.error('Startup error:', e.message);
    // Bot still works for OTP submission
    console.log('⚠️  Send /otp [code] via Telegram to complete authentication');
  }
}

startup();
