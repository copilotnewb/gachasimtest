import db from './db.js';
import { v4 as uuidv4 } from 'uuid';

// Helper to get active banner(s)
export function getActiveBanners() {
  const stmt = db.prepare('SELECT * FROM banners WHERE is_active = 1 ORDER BY start_at ASC');
  const rows = stmt.all();
  return rows.map(row => ({
    id: row.id, name: row.name,
    start_at: row.start_at, end_at: row.end_at,
    rates: JSON.parse(row.rates_json),
    pool: JSON.parse(row.pool_json),
  }));
}

export function getBannerById(id) {
  const row = db.prepare('SELECT * FROM banners WHERE id = ?').get(id);
  if (!row) return null;
  return { id: row.id, name: row.name, start_at: row.start_at, end_at: row.end_at,
    rates: JSON.parse(row.rates_json), pool: JSON.parse(row.pool_json), is_active: row.is_active };
}

function randomPick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// Perform gacha rolls (all logic server-side)
export function performRolls({ userId, bannerId, times = 1, costPerRoll = 160 }) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) throw new Error('User not found');
  const banner = getBannerById(bannerId);
  if (!banner || !banner.is_active) throw new Error('Banner not active');

  const totalCost = costPerRoll * times - (times === 10 ? costPerRoll * 1 : 0); // 10x: pay 9
  if (user.gems < totalCost) {
    throw new Error('Not enough gems');
  }

  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    // deduct gems
    db.prepare('UPDATE users SET gems = gems - ? WHERE id = ?').run(totalCost, userId);
    let pityRare = user.pity_rare;
    let pityUltra = user.pity_ultra;

    const results = [];
    for (let i = 0; i < times; i++) {
      // pity logic
      let rarity = null;
      pityRare += 1;
      pityUltra += 1;

      if (pityUltra >= 90) {
        rarity = 'ultra';
      } else if (pityRare >= 10) {
        rarity = 'rare';
      } else {
        // normal RNG
        const r = Math.random();
        const rates = banner.rates; // { common, rare, ultra }
        if (r < rates.ultra) rarity = 'ultra';
        else if (r < rates.ultra + rates.rare) rarity = 'rare';
        else rarity = 'common';
      }

      // Reset pity counters
      if (rarity === 'ultra') {
        pityUltra = 0;
        pityRare = 0;
      } else if (rarity === 'rare') {
        pityRare = 0;
      }

      const pool = banner.pool[rarity];
      const name = randomPick(pool);

      const itemId = uuidv4();
      db.prepare('INSERT INTO items (id, user_id, name, rarity, banner_id, obtained_at) VALUES (?,?,?,?,?,?)')
        .run(itemId, userId, name, rarity, bannerId, now);
      db.prepare('INSERT INTO rolls (user_id, banner_id, result_name, rarity, created_at) VALUES (?,?,?,?,?)')
        .run(userId, bannerId, name, rarity, now);

      results.push({ id: itemId, name, rarity });
    }
    // update pity in users
    db.prepare('UPDATE users SET pity_rare = ?, pity_ultra = ? WHERE id = ?').run(pityRare, pityUltra, userId);
    return results;
  });

  const results = tx();
  const updated = db.prepare('SELECT gems, pity_rare, pity_ultra FROM users WHERE id = ?').get(userId);
  return { results, remainingGems: updated.gems, pity: { rare: updated.pity_rare, ultra: updated.pity_ultra }, totalCost };
}
