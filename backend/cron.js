import cron from 'node-cron';
import db from './db.js';
import dotenv from 'dotenv';
dotenv.config();

const DAILY_GEMS = parseInt(process.env.DAILY_GEMS || '300', 10);

export function startCrons() {
  // Daily gems to all users at 00:00
  cron.schedule('0 0 * * *', () => {
    const now = new Date().toISOString();
    const stmt = db.prepare('UPDATE users SET gems = gems + ?');
    const info = stmt.run(DAILY_GEMS);
    console.log(`[CRON] Granted ${DAILY_GEMS} gems to all users at ${now} (rows=${info.changes})`);
  });

  // Every 30 minutes: auto-activate/deactivate banners based on dates
  cron.schedule('*/30 * * * *', () => {
    const now = new Date().toISOString();
    const activate = db.prepare('UPDATE banners SET is_active = 1 WHERE start_at <= ? AND end_at >= ?');
    const deactivate = db.prepare('UPDATE banners SET is_active = 0 WHERE end_at < ? OR start_at > ?');
    const a = activate.run(now, now);
    const d = deactivate.run(now, now);
    if (a.changes || d.changes) {
      console.log(`[CRON] Banner status updated at ${now} (+${a.changes}/-${d.changes})`);
    }
  });
}
