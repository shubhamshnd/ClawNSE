/**
 * Scheduler — cron-based scan triggers
 * Market hours: Mon-Fri, IST (UTC+5:30)
 */
import cron from 'node-cron';
import { isWeekend } from 'date-fns';

export class Scheduler {
  constructor() {
    this._tasks = {};
  }

  schedule(name, cronExpr, handler) {
    if (this._tasks[name]) this._tasks[name].stop();
    const task = cron.schedule(cronExpr, async () => {
      // Skip weekends (Indian market closed)
      if (isWeekend(new Date())) return;
      console.log(`[Scheduler] Running task: ${name}`);
      try { await handler(); }
      catch (e) { console.error(`[Scheduler] Task ${name} failed:`, e.message); }
    }, { timezone: 'Asia/Kolkata' });

    this._tasks[name] = task;
    console.log(`[Scheduler] Scheduled "${name}" → ${cronExpr}`);
    return task;
  }

  scheduleAll(scheduleConfig, handlers) {
    for (const [name, cron] of Object.entries(scheduleConfig)) {
      if (handlers[name]) this.schedule(name, cron, handlers[name]);
    }
  }

  stop(name) {
    if (this._tasks[name]) { this._tasks[name].stop(); delete this._tasks[name]; }
  }

  stopAll() {
    Object.values(this._tasks).forEach(t => t.stop());
    this._tasks = {};
  }

  list() {
    return Object.keys(this._tasks);
  }

  getNextRun(name) {
    // node-cron doesn't expose next run time directly
    // Return next business day estimate
    return 'See cron expression for next run time';
  }
}
