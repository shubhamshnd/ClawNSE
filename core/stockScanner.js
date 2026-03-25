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
const CACHE_DIR = path.join(__dirname, '../data/cache');

export class StockScanner {
  constructor(nubraClient, config = {}) {
    this.nubra    = nubraClient;
    this.config   = config;
    this.strategy = new StrategyEngine(config);
    this.csvPath  = config.csvPath || path.join(__dirname, '../data/equity_l.csv');
    this._lastResults = null;
    this._lastScanTime = null;
    this._aborted = false;
    this._scanning = false;
  }

  /** Abort the current scan — keeps results collected so far */
  abort() {
    if (this._scanning) {
      this._aborted = true;
      console.log('[Scanner] Abort requested — finishing current batch...');
    }
  }

  isScanning() { return this._scanning; }

  /** Get cached results (in-memory or from disk) */
  getLastResults() {
    if (this._lastResults) return this._lastResults;
    try {
      const today = new Date().toISOString().slice(0, 10);
      const file = path.join(CACHE_DIR, `scan_${today}.json`);
      if (fs.pathExistsSync(file)) {
        this._lastResults = fs.readJsonSync(file);
        this._lastScanTime = fs.statSync(file).mtime;
        return this._lastResults;
      }
    } catch (_) {}
    return null;
  }

  getLastScanTime() { return this._lastScanTime; }

  /** Run a strategy on already-cached candle data without re-fetching */
  async reanalyze(strategyName = 'EMA_CROSSOVER', params = {}) {
    const cached = this.getLastResults();
    if (!cached || !cached.length) return null;

    // cached results have candles attached — re-run strategy on them
    const results = [];
    for (const item of cached) {
      if (!item._candles || item._candles.length < 30) continue;
      const closes  = item._candles.map(c => c.close);
      const highs   = item._candles.map(c => c.high);
      const lows    = item._candles.map(c => c.low);
      const volumes = item._candles.map(c => c.volume || 0);
      try {
        const result = this.strategy.run(strategyName, {
          symbol: item.symbol, closes, highs, lows, volumes, candles: item._candles, params
        });
        if (result) results.push(result);
      } catch (_) {}
    }
    return results;
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
  /**
   * @param {string} strategyName
   * @param {object} params
   * @param {function} onProgress - called with (scanned, total, signals) every 50 stocks
   */
  async scan(strategyName = 'EMA_CROSSOVER', params = {}, onProgress = null) {
    const symbols = await this.loadStockList();
    console.log(`[Scanner] Scanning ${symbols.length} stocks with strategy: ${strategyName}`);

    this._scanning = true;
    this._aborted = false;
    const results = [];
    let failures  = 0;
    let scanned   = 0;
    const now     = new Date();
    const from    = new Date(now - 90 * 24 * 60 * 60 * 1000); // 90 days history

    // 10 concurrent requests per batch, ~50 req/min to stay under rate limit
    const BATCH_SIZE = 10;
    const BATCH_DELAY = 12000;
    const PROGRESS_INTERVAL = 50;
    let lastProgressAt = 0;

    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
      if (this._aborted) {
        console.log(`\n[Scanner] Aborted at ${scanned}/${symbols.length}`);
        break;
      }

      const batch = symbols.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(sym => this._scanSymbol(sym, strategyName, params, from, now))
      );

      for (const r of batchResults) {
        if (r.status === 'fulfilled' && r.value) results.push(r.value);
        else failures++;
      }

      scanned = Math.min(i + BATCH_SIZE, symbols.length);

      if (i === 0 && results.length === 0 && failures === batch.length) {
        console.error(`[Scanner] WARNING: First batch ALL failed. Check API auth/connectivity.`);
      }

      // Progress callback every 50 stocks
      if (onProgress && scanned - lastProgressAt >= PROGRESS_INTERVAL) {
        const signalCount = results.filter(r => r.signal !== 'NONE').length;
        await onProgress(scanned, symbols.length, signalCount);
        lastProgressAt = scanned;
      }

      process.stdout.write(`\r[Scanner] Progress: ${scanned}/${symbols.length}`);
      if (i + BATCH_SIZE < symbols.length) {
        await new Promise(r => setTimeout(r, BATCH_DELAY));
      }
    }

    this._scanning = false;
    const stopped = this._aborted ? ' (stopped early)' : '';
    this._aborted = false;
    console.log(`\n[Scanner] Scan complete${stopped}. Success: ${results.length}, Failed: ${failures}, Signals: ${results.filter(r => r.signal !== 'NONE').length}`);

    // Cache results to disk
    this._lastResults = results;
    this._lastScanTime = new Date();
    try {
      await fs.ensureDir(CACHE_DIR);
      const today = new Date().toISOString().slice(0, 10);
      await fs.writeJson(path.join(CACHE_DIR, `scan_${today}.json`), results);
      console.log(`[Scanner] Results cached to data/cache/scan_${today}.json`);
    } catch (e) {
      console.warn('[Scanner] Failed to cache results:', e.message);
    }

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

      // Attach candles for reanalyze cache
      if (result) result._candles = candles;
      return result;
    } catch (e) {
      const status = e.response?.status;
      const msg = e.response?.data?.message || e.message;
      if (status === 401 || status === 440) {
        console.error(`[Scanner] ${symbol}: Auth error (${status}) - session may be expired`);
      } else if (status === 429) {
        console.warn(`[Scanner] ${symbol}: Rate limited (429) - slowing down`);
      } else {
        console.warn(`[Scanner] ${symbol}: Failed (${status || 'network'}) - ${msg}`);
      }
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
