import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'data.sqlite');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Create tables if not exist
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    gems INTEGER NOT NULL DEFAULT 0,
    pity_rare INTEGER NOT NULL DEFAULT 0,
    pity_ultra INTEGER NOT NULL DEFAULT 0,
    last_daily_claim TEXT,
    last_adventure_at TEXT,
    best_adventure_score INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    rarity TEXT NOT NULL,
    banner_id TEXT NOT NULL,
    obtained_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS banners (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    start_at TEXT NOT NULL,
    end_at TEXT NOT NULL,
    rates_json TEXT NOT NULL,
    pool_json TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS rolls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    banner_id TEXT NOT NULL,
    result_name TEXT NOT NULL,
    rarity TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

const userColumns = db.prepare('PRAGMA table_info(users)').all();
const hasLastAdventure = userColumns.some(col => col.name === 'last_adventure_at');
if (!hasLastAdventure) {
  db.prepare('ALTER TABLE users ADD COLUMN last_adventure_at TEXT').run();
}
const hasBestScore = userColumns.some(col => col.name === 'best_adventure_score');
if (!hasBestScore) {
  db.prepare('ALTER TABLE users ADD COLUMN best_adventure_score INTEGER NOT NULL DEFAULT 0').run();
}

export default db;
