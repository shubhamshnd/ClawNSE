/**
 * Strategy Engine — built-in + custom strategies
 * Strategies: EMA_CROSSOVER, MACD_CROSSOVER, RSI_OVERSOLD,
 *             BOLLINGER_BANDS, SUPERTREND, MULTI_CONFLUENCE
 */
import { EMA, MACD, RSI, BollingerBands, ATR } from 'technicalindicators';
import fs from 'fs';
import path from 'path';

export class StrategyEngine {
  constructor(defaults = {}) {
    this.defaults = {
      emaShort:  parseInt(defaults.EMA_SHORT)  || 9,
      emaLong:   parseInt(defaults.EMA_LONG)   || 21,
      rsiPeriod: parseInt(defaults.RSI_PERIOD) || 14,
      macdFast:  parseInt(defaults.MACD_FAST)  || 12,
      macdSlow:  parseInt(defaults.MACD_SLOW)  || 26,
      macdSig:   parseInt(defaults.MACD_SIGNAL)|| 9,
      bbPeriod:  parseInt(defaults.BB_PERIOD)  || 20,
      bbStd:     parseFloat(defaults.BB_STD)   || 2,
      proximityPct: parseFloat(defaults.CROSSOVER_PROXIMITY_PERCENT) || 1.5,
    };
    this._registry = {
      EMA_CROSSOVER:    this._emaCrossover.bind(this),
      MACD_CROSSOVER:   this._macdCrossover.bind(this),
      RSI_OVERSOLD:     this._rsiOversold.bind(this),
      BOLLINGER_BANDS:  this._bollingerBands.bind(this),
      SUPERTREND:       this._supertrend.bind(this),
      MULTI_CONFLUENCE: this._multiConfluence.bind(this),
    };
    this._customStrategies = {};
    this._loadCustomStrategies();
  }

  listStrategies() {
    return [
      ...Object.keys(this._registry),
      ...Object.keys(this._customStrategies).map(k => `CUSTOM:${k}`)
    ];
  }

  run(strategyName, ctx) {
    const p  = { ...this.defaults, ...(ctx.params || {}) };
    const fn = this._registry[strategyName];
    if (!fn) {
      const customName = strategyName.replace('CUSTOM:', '');
      const custom = this._customStrategies[customName];
      if (custom) return this._runCustomStrategy(custom, ctx, p);
      return this._noSignal(ctx.symbol, strategyName);
    }
    try { return fn(ctx, p); }
    catch (e) { return this._noSignal(ctx.symbol, strategyName, e.message); }
  }

  runAll(ctx) {
    const results = {};
    for (const name of Object.keys(this._registry)) results[name] = this.run(name, ctx);
    return results;
  }

  registerCustomStrategy(name, definition) {
    this._customStrategies[name] = definition;
    this._saveCustomStrategies();
    return true;
  }

  deleteCustomStrategy(name) {
    delete this._customStrategies[name];
    this._saveCustomStrategies();
  }

  getCustomStrategy(name) { return this._customStrategies[name] || null; }

  getAllCustomStrategies() { return this._customStrategies; }

  // ─── Built-in Strategies ───────────────────────────────────────────

  _emaCrossover({ symbol, closes }, p) {
    const short = EMA.calculate({ period: p.emaShort, values: closes });
    const long  = EMA.calculate({ period: p.emaLong,  values: closes });
    if (short.length < 2 || long.length < 2) return this._noSignal(symbol, 'EMA_CROSSOVER');

    const sNow  = short.at(-1), sPrev = short.at(-2);
    const lNow  = long.at(-1),  lPrev = long.at(-2);
    const price = closes.at(-1);
    const gap   = Math.abs(sNow - lNow);
    const gapPct = (gap / lNow) * 100;
    const approaching = gapPct <= p.proximityPct;

    const bullCross   = sPrev <= lPrev && sNow > lNow;
    const bearCross   = sPrev >= lPrev && sNow < lNow;
    const bullApproach = !bullCross && sNow < lNow && sNow > sPrev && approaching;
    const bearApproach = !bearCross && sNow > lNow && sNow < sPrev && approaching;

    let signal = 'NONE', confidence = 0, notes = '';
    if      (bullCross)     { signal = 'GOLDEN_CROSS'; confidence = 90; notes = `EMA${p.emaShort} crossed above EMA${p.emaLong}`; }
    else if (bearCross)     { signal = 'DEATH_CROSS';  confidence = 90; notes = `EMA${p.emaShort} crossed below EMA${p.emaLong}`; }
    else if (bullApproach)  { signal = 'NEAR_GOLDEN';  confidence = 65; notes = `Gap ${gapPct.toFixed(2)}% — bullish crossover approaching`; }
    else if (bearApproach)  { signal = 'NEAR_DEATH';   confidence = 65; notes = `Gap ${gapPct.toFixed(2)}% — bearish crossover approaching`; }
    else { signal = sNow > lNow ? 'BULL_TREND' : 'BEAR_TREND'; confidence = 40; notes = `Gap ${gapPct.toFixed(2)}%`; }

    return { symbol, strategy: 'EMA_CROSSOVER', signal, confidence, price,
      emaShort: sNow, emaLong: lNow, gapPct,
      indicators: { [`EMA${p.emaShort}`]: sNow, [`EMA${p.emaLong}`]: lNow },
      notes, timestamp: Date.now() };
  }

  _macdCrossover({ symbol, closes }, p) {
    const macdResult = MACD.calculate({
      values: closes, fastPeriod: p.macdFast, slowPeriod: p.macdSlow,
      signalPeriod: p.macdSig, SimpleMAOscillator: false, SimpleMASignal: false
    });
    if (macdResult.length < 2) return this._noSignal(symbol, 'MACD_CROSSOVER');

    const curr  = macdResult.at(-1), prev = macdResult.at(-2);
    const price = closes.at(-1);
    const bullCross = prev.MACD <= prev.signal && curr.MACD > curr.signal;
    const bearCross = prev.MACD >= prev.signal && curr.MACD < curr.signal;

    let signal = 'NONE', confidence = 0, notes = '';
    if      (bullCross)   { signal = 'MACD_BULL'; confidence = 80; notes = `MACD crossed signal. Histogram: ${curr.histogram?.toFixed(2)}`; }
    else if (bearCross)   { signal = 'MACD_BEAR'; confidence = 80; notes = `MACD crossed below signal`; }
    else if (curr.histogram > 0 && curr.histogram > prev.histogram) { signal = 'MACD_MOMENTUM'; confidence = 45; }
    else { signal = curr.MACD > curr.signal ? 'MACD_POSITIVE' : 'MACD_NEGATIVE'; confidence = 30; }

    return { symbol, strategy: 'MACD_CROSSOVER', signal, confidence, price,
      indicators: { macd: curr.MACD, signal: curr.signal, histogram: curr.histogram },
      notes, timestamp: Date.now() };
  }

  _rsiOversold({ symbol, closes }, p) {
    const rsiVals = RSI.calculate({ period: p.rsiPeriod, values: closes });
    if (rsiVals.length < 2) return this._noSignal(symbol, 'RSI_OVERSOLD');

    const rsi   = rsiVals.at(-1), prev = rsiVals.at(-2);
    const price = closes.at(-1);

    let signal = 'NONE', confidence = 0, notes = '';
    if      (rsi < 30)           { signal = 'OVERSOLD';    confidence = 75; notes = `RSI ${rsi.toFixed(1)} — oversold`; }
    else if (rsi > 70)           { signal = 'OVERBOUGHT';  confidence = 75; notes = `RSI ${rsi.toFixed(1)} — overbought`; }
    else if (prev < 30 && rsi >= 30) { signal = 'RSI_RECOVERY'; confidence = 85; notes = `RSI recovering: ${rsi.toFixed(1)}`; }
    else if (prev > 70 && rsi <= 70) { signal = 'RSI_PULLBACK'; confidence = 85; notes = `RSI pullback from overbought`; }
    else { signal = rsi > 50 ? 'RSI_BULLISH' : 'RSI_BEARISH'; confidence = 30; notes = `RSI ${rsi.toFixed(1)}`; }

    return { symbol, strategy: 'RSI_OVERSOLD', signal, confidence, price,
      indicators: { rsi }, notes, timestamp: Date.now() };
  }

  _bollingerBands({ symbol, closes }, p) {
    const bbVals = BollingerBands.calculate({ period: p.bbPeriod, values: closes, stdDev: p.bbStd });
    if (!bbVals.length) return this._noSignal(symbol, 'BOLLINGER_BANDS');

    const bb    = bbVals.at(-1);
    const price = closes.at(-1);
    const bw    = ((bb.upper - bb.lower) / bb.middle) * 100;

    let signal = 'NONE', confidence = 0, notes = '';
    if      (price <= bb.lower)  { signal = 'BB_OVERSOLD';   confidence = 80; notes = `Price at lower band (${bb.lower.toFixed(2)})`; }
    else if (price >= bb.upper)  { signal = 'BB_OVERBOUGHT'; confidence = 80; notes = `Price at upper band (${bb.upper.toFixed(2)})`; }
    else if (bw < 5)             { signal = 'BB_SQUEEZE';    confidence = 72; notes = `Bandwidth squeeze ${bw.toFixed(2)}% — breakout imminent`; }
    else { signal = price > bb.middle ? 'BB_BULLISH' : 'BB_BEARISH'; confidence = 30; }

    return { symbol, strategy: 'BOLLINGER_BANDS', signal, confidence, price,
      indicators: { upper: bb.upper, middle: bb.middle, lower: bb.lower, bandwidth: bw },
      notes, timestamp: Date.now() };
  }

  _supertrend({ symbol, closes, highs, lows }, p) {
    const period = p.supertrendPeriod || 7;
    const mult   = p.supertrendMult   || 3;
    const atrVals = ATR.calculate({ high: highs, low: lows, close: closes, period });
    if (atrVals.length < 2) return this._noSignal(symbol, 'SUPERTREND');

    const startIdx = closes.length - atrVals.length;
    let trend = 1, upperBand = 0, lowerBand = 0;
    const st = [];

    for (let i = 0; i < atrVals.length; i++) {
      const ci  = startIdx + i;
      const hl2 = (highs[ci] + lows[ci]) / 2;
      const ub  = hl2 + mult * atrVals[i];
      const lb  = hl2 - mult * atrVals[i];
      upperBand = i > 0 ? (ub < upperBand || closes[ci-1] > upperBand ? ub : upperBand) : ub;
      lowerBand = i > 0 ? (lb > lowerBand || closes[ci-1] < lowerBand ? lb : lowerBand) : lb;
      trend     = closes[ci] > upperBand ? 1 : closes[ci] < lowerBand ? -1 : trend;
      st.push({ trend, upper: upperBand, lower: lowerBand });
    }

    const curr = st.at(-1), prev2 = st.at(-2);
    const price = closes.at(-1);

    let signal = 'NONE', confidence = 0, notes = '';
    if      (curr.trend === 1 && prev2.trend === -1) { signal = 'ST_BUY';       confidence = 85; notes = 'Supertrend flipped bullish'; }
    else if (curr.trend === -1 && prev2.trend === 1) { signal = 'ST_SELL';      confidence = 85; notes = 'Supertrend flipped bearish'; }
    else { signal = curr.trend === 1 ? 'ST_UPTREND' : 'ST_DOWNTREND'; confidence = 35; }

    return { symbol, strategy: 'SUPERTREND', signal, confidence, price,
      indicators: { supertrendValue: curr.trend === 1 ? curr.lower : curr.upper, trend: curr.trend },
      notes, timestamp: Date.now() };
  }

  _multiConfluence(ctx, p) {
    const ema  = this._emaCrossover(ctx, p);
    const macd = this._macdCrossover(ctx, p);
    const rsi  = this._rsiOversold(ctx, p);
    const bb   = this._bollingerBands(ctx, p);

    const BULL = ['GOLDEN_CROSS','NEAR_GOLDEN','MACD_BULL','OVERSOLD','RSI_RECOVERY','BB_OVERSOLD','ST_BUY','BB_SQUEEZE'];
    const BEAR = ['DEATH_CROSS','NEAR_DEATH','MACD_BEAR','OVERBOUGHT','RSI_PULLBACK','BB_OVERBOUGHT','ST_SELL'];

    const bullC = [ema,macd,rsi,bb].filter(r => BULL.includes(r.signal)).length;
    const bearC = [ema,macd,rsi,bb].filter(r => BEAR.includes(r.signal)).length;

    let signal = 'NONE', confidence = 0, notes = '';
    if      (bullC >= 3) { signal = 'STRONG_BUY';  confidence = 92; notes = `${bullC}/4 bullish`; }
    else if (bullC === 2){ signal = 'BUY';          confidence = 68; notes = `${bullC}/4 bullish`; }
    else if (bearC >= 3) { signal = 'STRONG_SELL';  confidence = 92; notes = `${bearC}/4 bearish`; }
    else if (bearC === 2){ signal = 'SELL';          confidence = 68; notes = `${bearC}/4 bearish`; }
    else                 { notes = 'Mixed — no clear confluence'; }

    return { symbol: ctx.symbol, strategy: 'MULTI_CONFLUENCE', signal, confidence,
      price: ctx.closes.at(-1),
      subSignals: { ema: ema.signal, macd: macd.signal, rsi: rsi.signal, bb: bb.signal },
      notes, timestamp: Date.now() };
  }

  // ─── Custom Strategy Runner ────────────────────────────────────────

  _runCustomStrategy(definition, ctx, p) {
    try {
      const { name, conditions, logic = 'AND' } = definition;
      const indicators = this._computeAllIndicators(ctx, p);

      const results = conditions.map(c => {
        const val = this._resolveIndicator(indicators, c.indicator, c.field);
        if (val === null) return false;
        switch (c.operator) {
          case '>':  return val > c.value;
          case '<':  return val < c.value;
          case '>=': return val >= c.value;
          case '<=': return val <= c.value;
          case '==': return val === c.value;
          default:   return false;
        }
      });

      const triggered = logic === 'AND' ? results.every(Boolean) : results.some(Boolean);
      return {
        symbol: ctx.symbol, strategy: `CUSTOM:${name}`,
        signal: triggered ? (definition.signal || 'CUSTOM_SIGNAL') : 'NONE',
        confidence: triggered ? (definition.confidence || 70) : 0,
        price: ctx.closes.at(-1),
        notes: triggered ? `"${name}" triggered` : `"${name}" not triggered`,
        timestamp: Date.now()
      };
    } catch (e) {
      return this._noSignal(ctx.symbol, `CUSTOM:${definition.name}`, e.message);
    }
  }

  _computeAllIndicators(ctx, p) {
    const { closes, highs, lows } = ctx;
    return {
      emaShort: EMA.calculate({ period: p.emaShort, values: closes }),
      emaLong:  EMA.calculate({ period: p.emaLong,  values: closes }),
      rsi:      RSI.calculate({ period: p.rsiPeriod, values: closes }),
      macd:     MACD.calculate({ values: closes, fastPeriod: p.macdFast, slowPeriod: p.macdSlow, signalPeriod: p.macdSig, SimpleMAOscillator: false, SimpleMASignal: false }),
      bb:       BollingerBands.calculate({ period: p.bbPeriod, values: closes, stdDev: p.bbStd }),
      atr:      ATR.calculate({ high: highs, low: lows, close: closes, period: 14 }),
      price:    closes
    };
  }

  _resolveIndicator(inds, indicator, field) {
    const arr = inds[indicator];
    if (!arr || !arr.length) return null;
    const last = arr.at(-1);
    if (typeof last === 'number') return last;
    if (field && last[field] !== undefined) return last[field];
    return null;
  }

  _noSignal(symbol, strategy, error = '') {
    return { symbol, strategy, signal: 'NONE', confidence: 0, price: 0, notes: error || 'No signal', timestamp: Date.now() };
  }

  _customStrategiesFile() {
    return path.join(process.cwd(), 'data', 'custom_strategies.json');
  }

  _loadCustomStrategies() {
    try {
      const file = this._customStrategiesFile();
      if (fs.existsSync(file)) this._customStrategies = JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (_) {}
  }

  _saveCustomStrategies() {
    try {
      const file = this._customStrategiesFile();
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(this._customStrategies, null, 2));
    } catch (_) {}
  }
}
