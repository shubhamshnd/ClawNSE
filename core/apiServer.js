/**
 * Express API Server + Socket.IO for the Web Dashboard
 * Provides REST endpoints for the React config UI
 */
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApiServer(services) {
  const { nubra, scanner, gemini, telegram, scheduler, mcpManager, strategyEngine } = services;

  const app    = express();
  const server = createServer(app);
  const io     = new Server(server, { cors: { origin: '*' } });

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors());
  app.use(express.json());

  // Serve React frontend build
  const webBuild = path.join(__dirname, '../web/dist');
  app.use(express.static(webBuild));

  // ─── Auth ─────────────────────────────────────────────────────────────────

  app.post('/api/auth/otp', async (req, res) => {
    try {
      const { otp } = req.body;
      const fs = await import('fs-extra');
      const otpFile = path.join(__dirname, '../data/pending_otp.txt');
      await fs.default.ensureDir(path.dirname(otpFile));
      await fs.default.writeFile(otpFile, otp.trim());
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── Scan ────────────────────────────────────────────────────────────────

  app.post('/api/scan/run', async (req, res) => {
    try {
      const { strategy = 'EMA_CROSSOVER', params = {} } = req.body;
      // Emit progress via socket
      io.emit('scan:start', { strategy });
      const results = await scanner.scan(strategy, params);
      const analysis = await gemini.analyzeScanResults(results, strategy);
      io.emit('scan:complete', { results, analysis });
      res.json({ results, analysis, count: results.filter(r => r?.signal !== 'NONE').length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/scan/symbol/:symbol', async (req, res) => {
    try {
      const { symbol } = req.params;
      const { strategy = 'EMA_CROSSOVER' } = req.query;
      const result = await scanner.scanSingle(symbol, strategy);
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── Strategies ──────────────────────────────────────────────────────────

  app.get('/api/strategies', (req, res) => {
    res.json({ strategies: strategyEngine.listStrategies() });
  });

  app.get('/api/strategies/custom', (req, res) => {
    res.json(strategyEngine.getAllCustomStrategies());
  });

  app.post('/api/strategies/custom', async (req, res) => {
    try {
      const { name, definition } = req.body;
      strategyEngine.registerCustomStrategy(name, definition);
      res.json({ ok: true, name });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.post('/api/strategies/build', async (req, res) => {
    try {
      const { description } = req.body;
      const definition = await gemini.buildStrategy(description);
      res.json({ definition });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/strategies/custom/:name', (req, res) => {
    strategyEngine.deleteCustomStrategy(req.params.name);
    res.json({ ok: true });
  });

  // ─── Plugins (MCP) ───────────────────────────────────────────────────────

  app.get('/api/plugins', async (req, res) => {
    const installed = mcpManager.getInstalled();
    const available = await mcpManager.getAvailable();
    res.json({ installed, available });
  });

  app.post('/api/plugins/install', async (req, res) => {
    try {
      const { pluginId, repoUrl } = req.body;
      const manifest = await mcpManager.install(pluginId, repoUrl);
      res.json({ ok: true, manifest });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/plugins/:id', async (req, res) => {
    try {
      await mcpManager.uninstall(req.params.id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.patch('/api/plugins/:id/toggle', async (req, res) => {
    try {
      const { enabled } = req.body;
      if (enabled) await mcpManager.enablePlugin(req.params.id);
      else await mcpManager.disablePlugin(req.params.id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── Portfolio ───────────────────────────────────────────────────────────

  app.get('/api/portfolio/holdings', async (req, res) => {
    try { res.json(await nubra.getPortfolioHoldings()); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/portfolio/positions', async (req, res) => {
    try { res.json(await nubra.getPositions()); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/portfolio/funds', async (req, res) => {
    try { res.json(await nubra.getFunds()); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── Config ───────────────────────────────────────────────────────────────

  app.get('/api/config', (req, res) => {
    res.json({
      strategies:  strategyEngine.listStrategies(),
      scheduledJobs: scheduler.list(),
      activeStrategy: process.env.DEFAULT_STRATEGY || 'EMA_CROSSOVER'
    });
  });

  // ─── AI Chat ──────────────────────────────────────────────────────────────

  app.post('/api/ai/chat', async (req, res) => {
    try {
      const { message, context = {} } = req.body;
      const response = await gemini.chat(message, context);
      res.json({ response });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/ai/explain', async (req, res) => {
    try {
      const { signal } = req.body;
      const response = await gemini.explainSignal(signal);
      res.json({ response });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── Socket.IO Live Updates ───────────────────────────────────────────────

  io.on('connection', (socket) => {
    console.log('[API] Dashboard connected');
    socket.on('disconnect', () => console.log('[API] Dashboard disconnected'));
    socket.on('request:scan', async ({ strategy, params }) => {
      const results = await scanner.scan(strategy || 'EMA_CROSSOVER', params || {});
      socket.emit('scan:results', results);
    });
  });

  // SPA fallback
  app.get('*', (req, res) => {
    res.sendFile(path.join(webBuild, 'index.html'));
  });

  return { app, server, io };
}
