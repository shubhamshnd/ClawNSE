/**
 * ClawNSE — Agentic Trading Bot for Raspberry Pi 5
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
  const strategyArg = args.trim().toUpperCase();

  // If no strategy specified, list them
  if (!strategyArg) {
    const strats = strategyEngine.listStrategies();
    let txt = 'Pick a strategy:\n\n';
    strats.forEach((s, i) => { txt += `${i+1}. ${s}\n`; });
    txt += '\nUsage: /scan STRATEGY\nExample: /scan EMA_CROSSOVER';
    await telegram.send(txt, { parse_mode: undefined });
    return;
  }

  await telegram.send(`Starting ${strategyArg} scan...`, { parse_mode: undefined });

  const onProgress = async (scanned, total, signals) => {
    await telegram.send(`${scanned}/${total} scanned | ${signals} signals so far`, { parse_mode: undefined });
  };

  try {
    const results = await scanner.scan(strategyArg, {}, onProgress);
    const signalCount = results.filter(r => r.signal !== 'NONE').length;
    await telegram.send(`Scan complete: ${results.length} stocks | ${signalCount} signals found\n\nAnalyzing with AI...`, { parse_mode: undefined });

    const analysis = await gemini.analyzeScanResults(results, strategyArg);
    await telegram.send(analysis);
  } catch (e) {
    console.error('[Scan] Error:', e.message);
    await telegram.send(`Scan failed: ${e.message}`);
  }
});

telegram.onCommand('status', async (msg) => {
  const jobs = scheduler.list();
  const strats = strategyEngine.listStrategies();
  const plugins = Object.keys(mcpManager.getInstalled());
  await telegram.send(
    `🟢 *ClawNSE Status*\n\n` +
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

telegram.onCommand('analyze', async (msg, args) => {
  const cached = scanner.getLastResults();
  if (!cached) {
    await telegram.send('No cached scan data. Run /scan first.', { parse_mode: undefined });
    return;
  }

  const scanTime = scanner.getLastScanTime();
  const age = scanTime ? `${Math.round((Date.now() - scanTime.getTime()) / 60000)} min ago` : 'unknown';
  await telegram.send(`Running all strategies on cached data (${cached.length} stocks, scanned ${age})...`, { parse_mode: undefined });

  const allStrategies = strategyEngine.listStrategies().filter(s => !s.startsWith('CUSTOM:'));
  const allResults = {};

  for (const strat of allStrategies) {
    const reanalyzed = await scanner.reanalyze(strat);
    if (reanalyzed) {
      const signals = reanalyzed.filter(r => r.signal !== 'NONE' && r.confidence >= 70);
      allResults[strat] = signals;
    }
  }

  // Build summary
  let summary = `Multi-Strategy Analysis (${cached.length} stocks)\n\n`;
  for (const [strat, signals] of Object.entries(allResults)) {
    summary += `${strat}: ${signals.length} high-confidence signals\n`;
  }

  // Find stocks that appear in 3+ strategies
  const stockCounts = {};
  for (const [strat, signals] of Object.entries(allResults)) {
    for (const s of signals) {
      if (!stockCounts[s.symbol]) stockCounts[s.symbol] = [];
      stockCounts[s.symbol].push({ strategy: strat, signal: s.signal, confidence: s.confidence });
    }
  }

  const topPicks = Object.entries(stockCounts)
    .filter(([, strats]) => strats.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 15);

  if (topPicks.length) {
    summary += '\n--- TOP PICKS (2+ strategies agree) ---\n\n';
    for (const [symbol, strats] of topPicks) {
      summary += `${symbol} (${strats.length} strategies)\n`;
      for (const s of strats) {
        summary += `  ${s.strategy}: ${s.signal} [${s.confidence}%]\n`;
      }
      summary += '\n';
    }
  } else {
    summary += '\nNo stocks found with 2+ confirming strategies.\n';
  }

  await telegram.send(summary, { parse_mode: undefined });

  // Send top picks to AI for final analysis
  if (topPicks.length) {
    await telegram.send('Asking AI for final analysis...', { parse_mode: undefined });
    const aiAnalysis = await gemini.callAgent('MarketAnalyst',
      `Here are today's top stock picks where multiple technical strategies agree. Rank them and give a brief 1-line take on each:\n\n${JSON.stringify(topPicks.map(([sym, s]) => ({ symbol: sym, strategies: s })), null, 2)}`,
      { type: 'multi_strategy_confluence' }
    );
    await telegram.send(aiAnalysis);
  }
});

telegram.onCommand('strategy', async (msg, args) => {
  const strats = strategyEngine.listStrategies();
  let txt = 'Available Strategies:\n\n';
  strats.forEach((s, i) => { txt += `${i+1}. ${s}\n`; });
  txt += '\nRun with: /scan STRATEGY_NAME';
  await telegram.send(txt, { parse_mode: undefined });
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
  console.log(`\n🚀 ClawNSE running on http://0.0.0.0:${PORT}`);
  console.log(`📱 Web dashboard: http://[Pi-IP]:${PORT}`);
});

// ─── Startup ─────────────────────────────────────────────────────────────

async function startup() {
  try {
    console.log('🤖 ClawNSE starting...');
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
