/**
 * Telegram Bot
 * - Sends scheduled scan reports
 * - Accepts commands: /scan, /status, /strategy, /ask, /portfolio
 */
import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// MarkdownV2 requires escaping these characters outside of code blocks
const MV2_ESCAPE = /([_*\[\]()~`>#+\-=|{}.!\\])/g;

/**
 * Escape text for MarkdownV2.
 * Preserves *bold*, _italic_, `code`, and ```code blocks```.
 */
function escapeMarkdownV2(text) {
  // Split into segments: code blocks, inline code, bold, italic, and plain text
  const parts = [];
  let remaining = text;

  while (remaining.length > 0) {
    // Match code blocks first
    const codeBlock = remaining.match(/^```[\s\S]*?```/);
    if (codeBlock) {
      parts.push(codeBlock[0]); // keep as-is
      remaining = remaining.slice(codeBlock[0].length);
      continue;
    }

    // Match inline code
    const inlineCode = remaining.match(/^`[^`]+`/);
    if (inlineCode) {
      parts.push(inlineCode[0]); // keep as-is
      remaining = remaining.slice(inlineCode[0].length);
      continue;
    }

    // Match bold *text*
    const bold = remaining.match(/^\*[^*]+\*/);
    if (bold) {
      const inner = bold[0].slice(1, -1).replace(MV2_ESCAPE, '\\$1');
      parts.push(`*${inner}*`);
      remaining = remaining.slice(bold[0].length);
      continue;
    }

    // Match italic _text_
    const italic = remaining.match(/^_[^_]+_/);
    if (italic) {
      const inner = italic[0].slice(1, -1).replace(MV2_ESCAPE, '\\$1');
      parts.push(`_${inner}_`);
      remaining = remaining.slice(italic[0].length);
      continue;
    }

    // Plain character — escape it
    parts.push(remaining[0].replace(MV2_ESCAPE, '\\$1'));
    remaining = remaining.slice(1);
  }

  return parts.join('');
}

export class TelegramNotifier {
  constructor(token, chatId) {
    this.chatId = chatId;
    this.bot    = new TelegramBot(token, { polling: true });
    this._commandHandlers = {};
    this._setupDefaultCommands();
  }

  // ─── Sending ──────────────────────────────────────────────────────────────

  async send(text, options = {}) {
    const opts = { disable_web_page_preview: true, ...options };

    // If parse_mode explicitly set to undefined, send plain
    if (options.parse_mode === undefined && 'parse_mode' in options) {
      return this._sendWithRetry(text, opts);
    }

    // Try MarkdownV2 with escaping
    const escaped = escapeMarkdownV2(text);
    const mv2Opts = { ...opts, parse_mode: 'MarkdownV2' };
    try {
      return await this._sendWithRetry(escaped, mv2Opts);
    } catch (e) {
      if (e.message?.includes("can't parse entities")) {
        // MarkdownV2 failed — send as plain text
        console.warn('[Telegram] MarkdownV2 failed, sending as plain text');
        return this._sendWithRetry(text, { ...opts, parse_mode: undefined });
      }
      throw e;
    }
  }

  async _sendWithRetry(text, opts) {
    try {
      return await this.bot.sendMessage(this.chatId, text, opts);
    } catch (e) {
      if (e.message?.includes('message is too long')) {
        const chunks = this._splitMessage(text, 4000);
        for (const chunk of chunks) {
          await this.bot.sendMessage(this.chatId, chunk, opts);
          await new Promise(r => setTimeout(r, 500));
        }
      } else {
        throw e;
      }
    }
  }

  async sendPhoto(imageBuffer, caption = '') {
    return this.bot.sendPhoto(this.chatId, imageBuffer, { caption });
  }

  async sendDocument(fileBuffer, filename, caption = '') {
    return this.bot.sendDocument(this.chatId, fileBuffer, { caption }, { filename });
  }

  // ─── Commands ─────────────────────────────────────────────────────────────

  onCommand(command, handler) {
    this._commandHandlers[command.replace('/', '')] = handler;
    this.bot.onText(new RegExp(`^\/${command}\\b`), (msg) => {
      const args = msg.text.replace(`/${command}`, '').trim();
      handler(msg, args).catch(e => {
        this.send(`Error: ${e.message}`, { parse_mode: undefined });
      });
    });
  }

  _setupDefaultCommands() {
    this.bot.on('message', async (msg) => {
      if (String(msg.chat.id) !== String(this.chatId)) return;
    });

    this.bot.setMyCommands([
      { command: 'scan',      description: 'Run stock scan with a strategy' },
      { command: 'stop',      description: 'Stop running scan (keeps results so far)' },
      { command: 'analyze',   description: 'Run all strategies on cached data' },
      { command: 'status',    description: 'Bot status & next run time' },
      { command: 'portfolio', description: 'Show portfolio & positions' },
      { command: 'ask',       description: 'Ask AI analyst a question' },
      { command: 'strategy',  description: 'List available strategies' },
      { command: 'otp',       description: 'Submit OTP for Nubra login' },
    ]).catch(() => {});
  }

  // ─── OTP Handler ──────────────────────────────────────────────────────────

  registerOtpHandler() {
    this.onCommand('otp', async (msg, args) => {
      const otp = args.trim();
      if (!otp) { await this.send('Usage: /otp 123456', { parse_mode: undefined }); return; }
      const otpFile = path.join(__dirname, '../data/pending_otp.txt');
      await fs.ensureDir(path.dirname(otpFile));
      await fs.writeFile(otpFile, otp);
      await this.send('OTP received. Completing authentication...', { parse_mode: undefined });
    });
  }

  _splitMessage(text, maxLen = 4000) {
    const chunks = [];
    let current  = '';
    for (const line of text.split('\n')) {
      if (current.length + line.length + 1 > maxLen) {
        chunks.push(current);
        current = '';
      }
      current += line + '\n';
    }
    if (current) chunks.push(current);
    return chunks;
  }

  startPolling() {
    console.log('[Telegram] Bot polling started');
  }

  async sendStartupMessage() {
    await this.send(
      '*ClawNSE Bot Started*\n\n' +
      `Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n\n` +
      'Commands:\n' +
      '/scan - Run stock scan\n' +
      '/stop - Stop running scan\n' +
      '/analyze - Multi-strategy analysis\n' +
      '/status - Bot health\n' +
      '/portfolio - Holdings & positions\n' +
      '/ask - Chat with AI analyst\n' +
      '/strategy - List strategies'
    );
  }
}
