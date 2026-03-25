/**
 * MCP Plugin Manager
 * Install/remove plugins from GitHub repos like extensions
 * Each plugin is a folder in mcp_plugins/ with a plugin.json manifest
 */
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import simpleGit from 'simple-git';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGINS_DIR  = __dirname;
const REGISTRY_URL = 'https://raw.githubusercontent.com/your-org/tradebot-plugins/main/registry.json';

export class MCPManager {
  constructor() {
    this._plugins = {};
    this._pluginsDir = PLUGINS_DIR;
    this._loadInstalled();
  }

  // ─── Plugin Discovery ─────────────────────────────────────────────────────

  async getAvailable() {
    // Try to fetch from remote registry; fall back to built-in list
    const builtin = this._builtinRegistry();
    try {
      const { default: axios } = await import('axios');
      const res = await axios.get(REGISTRY_URL, { timeout: 5000 });
      return { ...builtin, ...res.data };
    } catch (_) {
      return builtin;
    }
  }

  _builtinRegistry() {
    return {
      'tradingview-alerts': {
        name: 'TradingView Alert Relay',
        description: 'Receive TradingView webhook alerts and process them as signals',
        repo: 'https://github.com/your-org/mcp-tradingview',
        version: '1.0.0', type: 'webhook'
      },
      'news-sentiment': {
        name: 'News Sentiment Analyzer',
        description: 'Fetch NSE/BSE news headlines and score sentiment using Gemini',
        repo: 'https://github.com/your-org/mcp-news-sentiment',
        version: '1.0.0', type: 'data'
      },
      'screener-sync': {
        name: 'Screener.in Sync',
        description: 'Pull fundamental data from Screener.in for hybrid analysis',
        repo: 'https://github.com/your-org/mcp-screener',
        version: '1.0.0', type: 'data'
      },
      'fii-dii-tracker': {
        name: 'FII/DII Activity Tracker',
        description: 'Track FII/DII buying/selling from NSE data and correlate with signals',
        repo: 'https://github.com/your-org/mcp-fiidii',
        version: '1.0.0', type: 'data'
      },
      'options-analyzer': {
        name: 'Options Flow Analyzer',
        description: 'Analyze options OI, PCR, and unusual activity for conviction signals',
        repo: 'https://github.com/your-org/mcp-options',
        version: '1.0.0', type: 'analysis'
      },
      'alert-logger': {
        name: 'Alert & Trade Logger',
        description: 'Log all signals and trades to Google Sheets or local CSV',
        repo: 'https://github.com/your-org/mcp-logger',
        version: '1.0.0', type: 'utility'
      }
    };
  }

  // ─── Plugin Lifecycle ─────────────────────────────────────────────────────

  async install(pluginId, repoUrl) {
    const pluginDir = path.join(this._pluginsDir, pluginId);

    if (await fs.pathExists(pluginDir)) {
      throw new Error(`Plugin ${pluginId} already installed. Use update() to upgrade.`);
    }

    try {
      console.log(`[MCP] Installing ${pluginId} from ${repoUrl}...`);
      const git = simpleGit();
      await git.clone(repoUrl, pluginDir, ['--depth=1']);

      const manifest = await this._readManifest(pluginDir);
      this._plugins[pluginId] = { ...manifest, status: 'installed', installedAt: Date.now() };
      await this._saveRegistry();

      // Run install hook if exists
      if (manifest.installHook) {
        const hookPath = path.join(pluginDir, manifest.installHook);
        if (await fs.pathExists(hookPath)) {
          const { default: hook } = await import(hookPath);
          await hook.install();
        }
      }

      console.log(`[MCP] ${pluginId} installed successfully ✓`);
      return manifest;
    } catch (e) {
      await fs.remove(pluginDir).catch(() => {});
      throw new Error(`Install failed: ${e.message}`);
    }
  }

  async installFromPath(pluginId, localPath) {
    const pluginDir = path.join(this._pluginsDir, pluginId);
    await fs.copy(localPath, pluginDir);
    const manifest = await this._readManifest(pluginDir);
    this._plugins[pluginId] = { ...manifest, status: 'installed', installedAt: Date.now() };
    await this._saveRegistry();
    return manifest;
  }

  async update(pluginId) {
    const pluginDir = path.join(this._pluginsDir, pluginId);
    if (!await fs.pathExists(pluginDir)) throw new Error(`Plugin ${pluginId} not installed`);
    const git = simpleGit(pluginDir);
    await git.pull();
    console.log(`[MCP] ${pluginId} updated ✓`);
  }

  async uninstall(pluginId) {
    const pluginDir = path.join(this._pluginsDir, pluginId);
    if (await fs.pathExists(pluginDir)) await fs.remove(pluginDir);
    delete this._plugins[pluginId];
    await this._saveRegistry();
    console.log(`[MCP] ${pluginId} uninstalled`);
  }

  // ─── Plugin Execution ─────────────────────────────────────────────────────

  async runPlugin(pluginId, method, args = {}) {
    const pluginDir = path.join(this._pluginsDir, pluginId);
    if (!await fs.pathExists(pluginDir)) throw new Error(`Plugin ${pluginId} not installed`);

    const manifest = await this._readManifest(pluginDir);
    const entryPath = path.join(pluginDir, manifest.main || 'index.js');

    const plugin = await import(entryPath + `?${Date.now()}`);
    if (!plugin[method]) throw new Error(`Plugin ${pluginId} has no method: ${method}`);

    return plugin[method](args);
  }

  async runAllDataPlugins(context) {
    const results = {};
    for (const [id, info] of Object.entries(this._plugins)) {
      if (info.type === 'data' && info.status === 'enabled') {
        try {
          results[id] = await this.runPlugin(id, 'fetchData', context);
        } catch (e) {
          results[id] = { error: e.message };
        }
      }
    }
    return results;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  getInstalled() { return this._plugins; }

  async enablePlugin(id)  { if (this._plugins[id]) { this._plugins[id].status = 'enabled';   await this._saveRegistry(); } }
  async disablePlugin(id) { if (this._plugins[id]) { this._plugins[id].status = 'disabled';  await this._saveRegistry(); } }

  async _readManifest(dir) {
    const p = path.join(dir, 'plugin.json');
    if (await fs.pathExists(p)) return fs.readJson(p);
    return { name: path.basename(dir), version: 'unknown' };
  }

  _registryFile() { return path.join(this._pluginsDir, '_registry.json'); }

  _loadInstalled() {
    try {
      const f = this._registryFile();
      if (fs.existsSync(f)) this._plugins = JSON.parse(fs.readFileSync(f, 'utf-8'));
    } catch (_) {}
  }

  async _saveRegistry() {
    await fs.writeJson(this._registryFile(), this._plugins, { spaces: 2 });
  }
}
