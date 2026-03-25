/**
 * Nubra REST API Client
 * Handles auth (OTP flow -> MPIN -> session token) + all market data calls
 */
import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_FILE = path.join(__dirname, '../data/session.json');

export class NubraClient {
  constructor(config) {
    this.baseUrl  = config.baseUrl || 'https://api.nubra.io';
    this.phone    = config.phone;
    this.mpin     = config.mpin;
    this.deviceId = config.deviceId || 'PIBOT01';
    this.sessionToken  = null;
    this.sessionExpiry = null;

    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' }
    });

    this.http.interceptors.response.use(
      r => r,
      async err => {
        if ((err.response?.status === 440 || err.response?.status === 401) && !err.config._retry) {
          err.config._retry = true;
          console.log('[NubraClient] Session expired, re-authenticating...');
          this.sessionToken = null;
          await fs.remove(SESSION_FILE).catch(() => {});
          await this.authenticate();
          err.config.headers['Authorization'] = `Bearer ${this.sessionToken}`;
          return this.http.request(err.config);
        }
        return Promise.reject(err);
      }
    );
  }

  async loadSession() {
    try {
      if (await fs.pathExists(SESSION_FILE)) {
        const s = await fs.readJson(SESSION_FILE);
        if (s.token && s.expiry > Date.now() + 300000) {
          this.sessionToken  = s.token;
          this.sessionExpiry = s.expiry;
          console.log('[NubraClient] Loaded cached session token');
          return true;
        }
      }
    } catch (_) {}
    return false;
  }

  async saveSession(token) {
    this.sessionToken  = token;
    this.sessionExpiry = Date.now() + 8 * 60 * 60 * 1000;
    await fs.ensureDir(path.dirname(SESSION_FILE));
    await fs.writeJson(SESSION_FILE, { token, expiry: this.sessionExpiry });
  }

  async authenticate(otpCallback = null) {
    if (await this.loadSession()) return this.sessionToken;
    console.log('[NubraClient] Starting Nubra auth flow...');

    const step1 = await this.http.post('/sendphoneotp', { phone: this.phone, skip_totp: false });
    let tempToken = step1.data.temp_token;

    const step2 = await this.http.post('/sendphoneotp',
      { phone: this.phone, skip_totp: true },
      { headers: { 'x-temp-token': tempToken, 'x-device-id': this.deviceId } }
    );
    tempToken = step2.data.temp_token;

    let otp;
    if (otpCallback) {
      otp = await otpCallback();
    } else {
      const otpFile = path.join(__dirname, '../data/pending_otp.txt');
      console.log(`[NubraClient] OTP sent to ${this.phone}. Write the OTP to: ${otpFile}`);
      const maxWait = 120000;
      const pollInterval = 3000;
      let waited = 0;
      while (waited < maxWait) {
        if (await fs.pathExists(otpFile)) {
          otp = (await fs.readFile(otpFile, 'utf-8')).trim();
          await fs.remove(otpFile);
          break;
        }
        await new Promise(r => setTimeout(r, pollInterval));
        waited += pollInterval;
      }
      if (!otp) throw new Error('OTP timeout — write OTP to data/pending_otp.txt within 2 minutes');
    }

    const step3 = await this.http.post('/verifyphoneotp',
      { phone: this.phone, otp },
      { headers: { 'x-temp-token': tempToken, 'x-device-id': this.deviceId } }
    );
    const authToken = step3.data.auth_token;

    const step4 = await this.http.post('/verifypin',
      { pin: this.mpin },
      { headers: { Authorization: `Bearer ${authToken}`, 'x-device-id': this.deviceId } }
    );
    const sessionToken = step4.data.session_token;
    await this.saveSession(sessionToken);
    console.log('[NubraClient] Auth successful ✓');
    return sessionToken;
  }

  authHeaders() {
    if (!this.sessionToken) throw new Error('Not authenticated. Call authenticate() first.');
    return { Authorization: `Bearer ${this.sessionToken}`, 'x-device-id': this.deviceId };
  }

  async getCandles(symbol, interval = '1d', startDate, endDate, type = 'STOCK', exchange = 'NSE') {
    const payload = {
      query: [{
        exchange, type, values: [symbol],
        fields: ['open', 'high', 'low', 'close', 'cumulative_volume'],
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        interval, intraDay: false, realTime: false
      }]
    };
    const res = await this.http.post('/charts/timeseries', payload, {
      headers: { ...this.authHeaders(), 'Content-Type': 'text/plain' }
    });
    return this._parseCandles(res.data, symbol);
  }

  _parseCandles(data, symbol) {
    try {
      const valuesArr = data.result?.[0]?.values;
      if (!valuesArr) return [];
      const symbolData = valuesArr.find(v => v[symbol])?.[symbol];
      if (!symbolData) return [];

      const tsMap = {};
      (symbolData.close || []).forEach(p => { tsMap[p.ts] = { ts: p.ts, close: p.v / 100 }; });
      (symbolData.open  || []).forEach(p => { if (tsMap[p.ts]) tsMap[p.ts].open   = p.v / 100; });
      (symbolData.high  || []).forEach(p => { if (tsMap[p.ts]) tsMap[p.ts].high   = p.v / 100; });
      (symbolData.low   || []).forEach(p => { if (tsMap[p.ts]) tsMap[p.ts].low    = p.v / 100; });
      (symbolData.cumulative_volume || []).forEach(p => { if (tsMap[p.ts]) tsMap[p.ts].volume = p.v; });

      return Object.values(tsMap).sort((a, b) => a.ts - b.ts);
    } catch (e) {
      console.error('[NubraClient] Parse error:', e.message);
      return [];
    }
  }

  async getCurrentPrice(symbol, exchange = 'NSE') {
    const res = await this.http.get(`/optionchains/${symbol}/price`, {
      params: exchange !== 'NSE' ? { exchange } : {},
      headers: this.authHeaders()
    });
    return { symbol, price: res.data.price / 100, prevClose: res.data.prev_close / 100, change: res.data.change };
  }

  async getPortfolioHoldings() {
    const res = await this.http.get('/portfolio/holdings', { headers: this.authHeaders() });
    return res.data;
  }

  async getPositions() {
    const res = await this.http.get('/portfolio/positions', { headers: this.authHeaders() });
    return res.data;
  }

  async getFunds() {
    const res = await this.http.get('/portfolio/user_funds_and_margin', { headers: this.authHeaders() });
    return res.data;
  }
}
