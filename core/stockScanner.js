/**
 * Stock Scanner
 * Reads equity_l.csv, fetches candles, applies strategies, detects crossovers
 */
import { parse } from 'csv-parse/sync';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { StrategyEngine } from '../strategies/strategyEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class StockScanner {
  constructor(nubraClient, config = {}) {
    this.nubra    = nubraClient;
    this.config   = config;
    this.strategy = new StrategyEngine(config);
    this.csvPath  = config.csvPath || path.join(__dirname, '../data/equity_l.csv');
  }

  async loadStockList() {
    if (!await fs.pathExists(this.csvPath)) {
      console.warn('[Scanner] equity_l.csv not found at', this.csvPath);
      return [];
    }
    const content = await fs.readFile(this.csvPath, 'utf-8');
    const records = parse(content, { columns: true, skip_empty_lines: true, trim: true });
    // NSE equity_l.csv has column "SYMBOL"
    return records
      .map(r => (r.SYMBOL || r.symbol || r.Symbol || '').trim().toUpperCase())
      .filter(Boolean);
  }

  /**
   * Full scan: iterate all stocks, fetch candles, run strategies
   * @param {string} strategyName  e.g. "EMA_CROSSOVER"
   * @param {object} params        strategy params override
   * @returns {ScanResult[]}
   */
  async scan(strategyName = 'EMA_CROSSOVER', params = {}) {
    const symbols = await this.loadStockList();
    console.log(`[Scanner] Scanning ${symbols.length} stocks with strategy: ${strategyName}`);

    const results = [];
    const now     = new Date();
    const from    = new Date(now - 90 * 24 * 60 * 60 * 1000); // 90 days history

    // Rate limit: 60 req/min max, batch with delay
    const BATCH_SIZE = 10;
    const BATCH_DELAY = 12000; // 12s between batches of 10 = ~50 req/min

    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
      const batch = symbols.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(sym => this._scanSymbol(sym, strategyName, params, from, now))
      );

      for (const r of batchResults) {
        if (r.status === 'fulfilled' && r.value) results.push(r.value);
      }

      if (i + BATCH_SIZE < symbols.length) {
        process.stdout.write(`\r[Scanner] Progress: ${Math.min(i + BATCH_SIZE, symbols.length)}/${symbols.length}`);
        await new Promise(r => setTimeout(r, BATCH_DELAY));
      }
    }

    console.log(`\n[Scanner] Scan complete. Signals found: ${results.filter(r => r.signal !== 'NONE').length}`);
    return results;
  }

  async _scanSymbol(symbol, strategyName, params, from, now) {
    try {
      const candles = await this.nubra.getCandles(symbol, '1d', from, now);
      if (!candles || candles.length < 30) return null;

      const closes  = candles.map(c => c.close);
      const highs   = candles.map(c => c.high);
      const lows    = candles.map(c => c.low);
      const volumes = candles.map(c => c.volume || 0);

      const result = this.strategy.run(strategyName, {
        symbol, closes, highs, lows, volumes, candles, params
      });

      return result;
    } catch (e) {
      // Silently skip unavailable/invalid symbols
      return null;
    }
  }

  /**
   * Single-symbol deep scan for the web dashboard
   */
  async scanSingle(symbol, strategyName = 'EMA_CROSSOVER', params = {}) {
    const now  = new Date();
    const from = new Date(now - 180 * 24 * 60 * 60 * 1000);
    const candles = await this.nubra.getCandles(symbol, '1d', from, now);
    if (!candles || candles.length < 10) throw new Error(`Insufficient data for ${symbol}`);

    const closes  = candles.map(c => c.close);
    const highs   = candles.map(c => c.high);
    const lows    = candles.map(c => c.low);
    const volumes = candles.map(c => c.volume || 0);

    return this.strategy.runAll({ symbol, closes, highs, lows, volumes, candles, params });
  }
}
