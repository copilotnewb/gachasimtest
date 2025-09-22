import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import db from './db.js';
import { authMiddleware, signToken } from './auth.js';
import { getActiveBanners, getBannerById, performRolls } from './gacha.js';
import { startCrons } from './cron.js';

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
  const row = db.prepare('SELECT id, username, gems, pity_rare, pity_ultra FROM users WHERE id = ?').get(req.user.id);
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

// Daily claim (guarded by last_daily_claim date)
app.post('/api/claim/daily', authMiddleware, (req, res) => {
  const today = new Date().toISOString().slice(0,10);
  const row = db.prepare('SELECT last_daily_claim FROM users WHERE id = ?').get(req.user.id);
  if (row?.last_daily_claim === today) return res.status(400).json({ error: 'already claimed today' });
  db.prepare('UPDATE users SET gems = gems + 10000, last_daily_claim = ? WHERE id = ?').run(today, req.user.id);
  const updated = db.prepare('SELECT gems FROM users WHERE id = ?').get(req.user.id);
  res.json({ ok: true, gems: updated.gems, awarded: 100 });
});

// Start server + crons
app.listen(PORT, () => {
  console.log(`Gacha backend running on http://localhost:${PORT}`);
  startCrons();
});
