/**
 * Gemini-Powered Agentic Layer
 * Multi-agent system: MarketAnalyst, RiskAdvisor, StrategyCoach, NewsCorrelator
 * Agents communicate via a shared context bus
 */
import { GoogleGenerativeAI } from '@google/generative-ai';

const AGENT_PERSONAS = {
  MarketAnalyst: `You are a senior Indian equity market analyst with 15+ years of experience on NSE/BSE.
You analyze technical signals, crossover patterns, and momentum indicators.
You provide concise, actionable insights. Always mention the specific indicator values.
You NEVER give financial advice — only technical analysis observations.
Keep responses under 200 words unless asked for detail.`,

  RiskAdvisor: `You are a risk management expert for Indian retail traders.
You analyze potential risks in technical setups and suggest stop-loss levels.
You consider volatility, sector exposure, and market conditions.
You flag when signals look unreliable or when there is conflicting data.
Be conservative and protective in your assessment.`,

  StrategyCoach: `You are a technical trading strategy coach.
You help traders understand WHY a strategy triggered, what it means historically,
and what follow-through to watch for. You explain in simple terms.
You reference Indian market context (NSE, F&O expiry, sector rotations).`,

  NewsCorrelator: `You are a financial news analyst for Indian markets.
Given technical signals, you speculate on fundamental/news factors that might correlate.
You are clear that you are speculating and recommend the user verify current news.
Focus on sector themes, FII/DII flows, RBI policy, and earnings calendars.`
};

export class GeminiAgent {
  constructor(apiKey, model = 'gemini-2.0-flash') {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = model;
    this._contextBus = {};   // shared state between agents
    this._conversationHistory = {};
  }

  // ─── Core Agent Call ──────────────────────────────────────────────────────

  async callAgent(agentName, userMessage, contextData = {}) {
    const persona  = AGENT_PERSONAS[agentName];
    if (!persona) throw new Error(`Unknown agent: ${agentName}`);

    const systemContext = `${persona}

Current context:
${JSON.stringify(contextData, null, 2)}

Shared agent context:
${JSON.stringify(this._contextBus, null, 2)}`;

    const model = this.genAI.getGenerativeModel({ model: this.model });

    const history = this._conversationHistory[agentName] || [];
    // Inject system context as first user/model turn so it works with all models
    const fullHistory = [
      { role: 'user', parts: [{ text: `[System Instructions]\n${systemContext}\n\nAcknowledge and follow these instructions.` }] },
      { role: 'model', parts: [{ text: 'Understood. I will follow these instructions.' }] },
      ...history.map(h => ({ role: h.role, parts: [{ text: h.content }] }))
    ];
    const chat = model.startChat({ history: fullHistory });

    const result = await chat.sendMessage(userMessage);
    const response = result.response.text();

    // Save to conversation history (last 10 turns per agent)
    history.push({ role: 'user', content: userMessage });
    history.push({ role: 'model', content: response });
    this._conversationHistory[agentName] = history.slice(-20);

    // Update shared bus
    this._contextBus[agentName] = { lastResponse: response, lastCall: Date.now() };

    return response;
  }

  // ─── Multi-Agent Pipeline ─────────────────────────────────────────────────

  /**
   * Full agentic analysis pipeline for a list of scan results
   * 1. MarketAnalyst reads all signals
   * 2. RiskAdvisor flags concerns
   * 3. StrategyCoach picks top picks and explains
   * Final output is a formatted Telegram message
   */
  async analyzeScanResults(scanResults, strategyName) {
    const signals = scanResults.filter(r => r && r.signal !== 'NONE');
    const highConf = signals.filter(r => r.confidence >= 70).slice(0, 15);
    const nearCross = signals.filter(r => ['NEAR_GOLDEN','NEAR_DEATH'].includes(r.signal));

    if (!highConf.length && !nearCross.length) {
      return this.callAgent('MarketAnalyst',
        `Today's ${strategyName} scan found no significant signals across all stocks. Market appears neutral. Provide a brief 2-3 sentence market observation.`,
        { totalScanned: scanResults.length, signalsFound: signals.length, strategy: strategyName }
      );
    }

    const contextData = {
      strategy: strategyName,
      totalScanned: scanResults.length,
      totalSignals: signals.length,
      highConfidenceSignals: highConf.map(r => ({
        symbol: r.symbol, signal: r.signal, confidence: r.confidence,
        price: r.price, notes: r.notes
      })),
      nearCrossover: nearCross.map(r => ({
        symbol: r.symbol, signal: r.signal, gapPct: r.gapPct, price: r.price
      }))
    };

    // Agent 1: MarketAnalyst
    const analystReport = await this.callAgent('MarketAnalyst',
      `Analyze these ${strategyName} scan results. Highlight the top 5 most interesting signals with reasoning.`,
      contextData
    );
    this._contextBus.analystReport = analystReport;

    // Agent 2: RiskAdvisor
    const riskReport = await this.callAgent('RiskAdvisor',
      `Based on these signals, flag the top 3 risks or false signals to watch. What should traders be cautious about?`,
      { ...contextData, analystView: analystReport }
    );

    // Agent 3: StrategyCoach (only for crossovers)
    let coachReport = '';
    if (nearCross.length > 0) {
      coachReport = await this.callAgent('StrategyCoach',
        `There are ${nearCross.length} stocks near EMA crossovers. Explain what to watch for in these setups and how to confirm the crossover.`,
        { nearCrossover: nearCross.slice(0, 5), analystView: analystReport }
      );
    }

    return this._formatTelegramMessage(analystReport, riskReport, coachReport, highConf, nearCross, strategyName);
  }

  /**
   * Interactive chat — user asks a question about a stock/signal
   */
  async chat(message, scanContext = {}) {
    return this.callAgent('MarketAnalyst', message, scanContext);
  }

  /**
   * Explain a single signal in detail
   */
  async explainSignal(scanResult) {
    return this.callAgent('StrategyCoach',
      `Explain this trading signal in simple terms: ${JSON.stringify(scanResult)}. 
       What does it mean? What should a trader look for next? What could go wrong?`,
      scanResult
    );
  }

  /**
   * Build or refine a custom strategy using natural language
   */
  async buildStrategy(naturalLanguageDescription) {
    const model = this.genAI.getGenerativeModel({ model: this.model });
    const prompt = `You are a trading strategy builder for Indian stock markets (NSE). Convert this natural language description into a JSON strategy definition.

Description: "${naturalLanguageDescription}"

Return ONLY valid JSON in this exact format:
{
  "name": "STRATEGY_NAME",
  "description": "Human readable description",
  "signal": "SIGNAL_NAME",
  "confidence": 75,
  "logic": "AND",
  "conditions": [
    {
      "indicator": "rsi|emaShort|emaLong|macd|bb|atr|price",
      "field": "null_for_rsi_and_price|MACD|signal|histogram|upper|middle|lower|bandwidth",
      "operator": ">|<|>=|<=|==",
      "value": 30
    }
  ]
}

Available indicators: rsi, emaShort, emaLong, macd (fields: MACD, signal, histogram), bb (fields: upper, middle, lower, bandwidth), atr, price
Only return the JSON, no explanation.`;

    const result = await model.generateContent(prompt);
    const text   = result.response.text().trim();
    const clean  = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  }

  // ─── Formatting ───────────────────────────────────────────────────────────

  _formatTelegramMessage(analyst, risk, coach, highConf, nearCross, strategy) {
    const emoji = { GOLDEN_CROSS: '🟢', DEATH_CROSS: '🔴', NEAR_GOLDEN: '🟡', NEAR_DEATH: '🟠',
      BULL_TREND: '📈', BEAR_TREND: '📉', MACD_BULL: '💚', MACD_BEAR: '❤️',
      OVERSOLD: '🔵', OVERBOUGHT: '🟣', STRONG_BUY: '🚀', STRONG_SELL: '⛔',
      BB_SQUEEZE: '💥', ST_BUY: '✅', ST_SELL: '❌', NONE: '⚫' };

    let msg = `📊 *Market Scan — ${strategy}*\n`;
    msg += `_${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}_\n\n`;

    if (nearCross.length) {
      msg += `⚡ *Near Crossovers (${nearCross.length})*\n`;
      nearCross.slice(0, 8).forEach(r => {
        msg += `${emoji[r.signal] || '⚡'} \`${r.symbol}\` — ${r.signal} (gap: ${r.gapPct?.toFixed(2)}%)\n`;
      });
      msg += '\n';
    }

    if (highConf.length) {
      msg += `🎯 *High Confidence Signals (${highConf.length})*\n`;
      highConf.slice(0, 10).forEach(r => {
        msg += `${emoji[r.signal] || '📍'} \`${r.symbol}\` — ${r.signal} [${r.confidence}%]\n`;
        if (r.notes) msg += `   _${r.notes}_\n`;
      });
      msg += '\n';
    }

    msg += `🤖 *AI Analysis*\n${analyst}\n\n`;
    if (risk) msg += `⚠️ *Risk Flags*\n${risk}\n\n`;
    if (coach) msg += `📚 *Strategy Coach*\n${coach}\n`;

    return msg;
  }

  clearHistory(agentName = null) {
    if (agentName) delete this._conversationHistory[agentName];
    else this._conversationHistory = {};
  }
}
