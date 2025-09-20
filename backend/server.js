import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import db from './db.js';
import { authMiddleware, signToken } from './auth.js';
import { getActiveBanners, getBannerById, performRolls } from './gacha.js';
import { startCrons } from './cron.js';

const ADVENTURE_COOLDOWN_MS = 60 * 1000;
const MAX_ADVENTURE_SCORE = 2000;
const RARITY_MULTIPLIERS = {
  none: 1,
  common: 1.12,
  rare: 1.3,
  ultra: 1.55
};

function getBestRelic(userId) {
  const row = db.prepare(`
    SELECT name, rarity
    FROM items
    WHERE user_id = ?
    ORDER BY CASE rarity WHEN 'ultra' THEN 3 WHEN 'rare' THEN 2 WHEN 'common' THEN 1 ELSE 0 END DESC,
             datetime(obtained_at) DESC
    LIMIT 1
  `).get(userId);
  if (!row) return { name: null, rarity: 'none' };
  return row;
}

function computeCooldownSeconds(lastIso) {
  if (!lastIso) return 0;
  const parsed = Date.parse(lastIso);
  if (Number.isNaN(parsed)) return 0;
  const diff = Date.now() - parsed;
  if (diff >= ADVENTURE_COOLDOWN_MS) return 0;
  return Math.ceil((ADVENTURE_COOLDOWN_MS - diff) / 1000);
}

dotenv.config();
const PORT = parseInt(process.env.PORT || '4000', 10);

const app = express();
app.use(cors());
app.use(express.json());

// Health
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Auth
app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const hash = bcrypt.hashSync(password, 10);
  try {
    const info = db.prepare('INSERT INTO users (username, password_hash, gems) VALUES (?,?,?)').run(username, hash, 1000);
    const user = { id: info.lastInsertRowid, username };
    const token = signToken(user);
    res.json({ token, user: { id: user.id, username, gems: 1000 } });
  } catch (e) {
    if (String(e).includes('UNIQUE')) return res.status(409).json({ error: 'username already exists' });
    console.error(e);
    return res.status(500).json({ error: 'server error' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!row) return res.status(401).json({ error: 'invalid credentials' });
  const ok = bcrypt.compareSync(password, row.password_hash);
  if (!ok) return res.status(401).json({ error: 'invalid credentials' });
  const token = signToken({ id: row.id, username: row.username });
  res.json({ token, user: { id: row.id, username: row.username, gems: row.gems } });
});

app.get('/api/me', authMiddleware, (req, res) => {
  const row = db.prepare(`
    SELECT id, username, gems, pity_rare, pity_ultra, last_adventure_at, best_adventure_score
    FROM users WHERE id = ?
  `).get(req.user.id);
  res.json(row);
});

// Banners
app.get('/api/banners', (req, res) => {
  res.json(getActiveBanners());
});

// Inventory
app.get('/api/inventory', authMiddleware, (req, res) => {
  const items = db.prepare('SELECT * FROM items WHERE user_id = ? ORDER BY obtained_at DESC').all(req.user.id);
  res.json(items);
});

// Roll
app.post('/api/roll', authMiddleware, (req, res) => {
  const { bannerId, times } = req.body;
  try {
    const result = performRolls({ userId: req.user.id, bannerId, times: Math.max(1, Math.min(90, times || 1)) });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

app.post('/api/game/adventure', authMiddleware, (req, res) => {
  const rawScore = Number(req.body?.score ?? 0);
  if (!Number.isFinite(rawScore)) {
    return res.status(400).json({ error: 'Score must be a number.' });
  }
  const score = Math.max(0, Math.min(MAX_ADVENTURE_SCORE, Math.floor(rawScore)));
  const user = db.prepare('SELECT gems, last_adventure_at, best_adventure_score FROM users WHERE id = ?').get(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  const secondsLeft = computeCooldownSeconds(user.last_adventure_at);
  if (secondsLeft > 0) {
    return res.status(429).json({ error: `Dive engines cooling down. Try again in ${secondsLeft}s.` });
  }

  const relic = getBestRelic(req.user.id);
  const rarity = relic.rarity || 'none';
  const multiplier = RARITY_MULTIPLIERS[rarity] || 1;

  const baseReward = Math.round(score * 0.15);
  let reward = Math.round(baseReward * multiplier);
  if (score < 10) reward = 0;
  if (score >= 10 && reward < 5) reward = 5;
  reward = Math.min(reward, 120);

  const now = new Date();
  const isoNow = now.toISOString();
  const nextAvailableAt = new Date(now.getTime() + ADVENTURE_COOLDOWN_MS).toISOString();
  const bestScore = Math.max(user.best_adventure_score || 0, score);

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE users
      SET gems = gems + ?, last_adventure_at = ?, best_adventure_score = ?
      WHERE id = ?
    `).run(reward, isoNow, bestScore, req.user.id);
  });
  tx();

  const updated = db.prepare('SELECT gems FROM users WHERE id = ?').get(req.user.id);

  res.json({
    ok: true,
    reward,
    newBalance: updated.gems,
    bestScore,
    multiplier,
    rarityUsed: rarity,
    featuredName: relic.name,
    appliedScore: score,
    lastAdventureAt: isoNow,
    nextAvailableAt,
    cooldownSeconds: Math.ceil(ADVENTURE_COOLDOWN_MS / 1000)
  });
});

// Daily claim (guarded by last_daily_claim date)
app.post('/api/claim/daily', authMiddleware, (req, res) => {
  const today = new Date().toISOString().slice(0,10);
  const row = db.prepare('SELECT last_daily_claim FROM users WHERE id = ?').get(req.user.id);
  if (row?.last_daily_claim === today) return res.status(400).json({ error: 'already claimed today' });
  db.prepare('UPDATE users SET gems = gems + 100, last_daily_claim = ? WHERE id = ?').run(today, req.user.id);
  const updated = db.prepare('SELECT gems FROM users WHERE id = ?').get(req.user.id);
  res.json({ ok: true, gems: updated.gems, awarded: 100 });
});

// Start server + crons
app.listen(PORT, () => {
  console.log(`Gacha backend running on http://localhost:${PORT}`);
  startCrons();
});
