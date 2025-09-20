import db from './db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const bannersPath = path.join(__dirname, 'banners.json');
const banners = JSON.parse(fs.readFileSync(bannersPath, 'utf8'));

const insert = db.prepare(`INSERT OR REPLACE INTO banners
  (id, name, start_at, end_at, rates_json, pool_json, is_active)
  VALUES (@id, @name, @start_at, @end_at, @rates_json, @pool_json, @is_active)`);

const now = new Date();
for (const b of banners) {
  insert.run({
    id: b.id,
    name: b.name,
    start_at: b.start_at,
    end_at: b.end_at,
    rates_json: JSON.stringify(b.rates),
    pool_json: JSON.stringify(b.pool),
    is_active: b.is_active ? 1 : 0
  });
}

console.log('Seeded banners:', banners.map(b => b.name).join(', '));
