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

export class TelegramNotifier {
  constructor(token, chatId) {
    this.chatId = chatId;
    this.bot    = new TelegramBot(token, { polling: true });
    this._commandHandlers = {};
    this._setupDefaultCommands();
  }

  // ─── Sending ──────────────────────────────────────────────────────────────

  async send(text, options = {}) {
    try {
      return await this.bot.sendMessage(this.chatId, text, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        ...options
      });
    } catch (e) {
      // If message is too long, split it
      if (e.message?.includes('message is too long')) {
        const chunks = this._splitMessage(text, 4000);
        for (const chunk of chunks) {
          await this.bot.sendMessage(this.chatId, chunk, { parse_mode: 'Markdown', ...options });
          await new Promise(r => setTimeout(r, 500));
        }
      } else {
        console.error('[Telegram] Send error:', e.message);
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
    this.bot.onText(new RegExp(`^\/${command}\\b`), (msg, match) => {
      const args = msg.text.replace(`/${command}`, '').trim();
      handler(msg, args).catch(e => {
        this.send(`❌ Error: ${e.message}`);
      });
    });
  }

  _setupDefaultCommands() {
    this.bot.on('message', async (msg) => {
      // Only respond to messages from authorized chat
      if (String(msg.chat.id) !== String(this.chatId)) return;
    });

    this.bot.setMyCommands([
      { command: 'scan',      description: 'Run immediate stock scan' },
      { command: 'status',    description: 'Bot status & next run time' },
      { command: 'portfolio', description: 'Show portfolio & positions' },
      { command: 'ask',       description: 'Ask AI analyst a question' },
      { command: 'strategy',  description: 'List/switch strategies' },
      { command: 'otp',       description: 'Submit OTP for Nubra login' },
    ]).catch(() => {});
  }

  // ─── OTP Handler ──────────────────────────────────────────────────────────

  registerOtpHandler() {
    this.onCommand('otp', async (msg, args) => {
      const otp = args.trim();
      if (!otp) { await this.send('Usage: /otp 123456'); return; }
      const otpFile = path.join(__dirname, '../data/pending_otp.txt');
      await fs.ensureDir(path.dirname(otpFile));
      await fs.writeFile(otpFile, otp);
      await this.send('✅ OTP received. Completing authentication...');
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
    await this.send(`🤖 *TradePi Bot Started*\n\n` +
      `Running on Raspberry Pi 5\n` +
      `Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n\n` +
      `Commands: /scan /status /portfolio /ask /strategy\n` +
      `_Use /otp [code] if authentication is needed_`);
  }
}
