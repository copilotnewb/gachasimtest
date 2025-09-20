import db from './db.js';

const ADVENTURE_RULES = {
  cooldownMs: 1000 * 60 * 15,
  baseChance: 0.22,
  scoreMultiplier: 0.08,
  partyBonus: 0.02,
  maxChance: 0.95,
  rarityScores: { common: 1, rare: 3, ultra: 6 },
  rewardSuccess: 60,
  rewardFailure: 20
};

function clampChance(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(ADVENTURE_RULES.maxChance, Math.max(0, value));
}

function formatCooldown(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 && minutes < 5) parts.push(`${seconds}s`);
  return parts.join(' ') || 'a moment';
}

function uniquePartyIds(partyIds = []) {
  if (!Array.isArray(partyIds)) return [];
  const seen = new Set();
  const result = [];
  for (const id of partyIds) {
    if (typeof id !== 'string') continue;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    if (result.length >= 3) break;
  }
  return result;
}

export function calculateAdventureChance(items) {
  const totalScore = items.reduce((sum, item) => sum + (ADVENTURE_RULES.rarityScores[item.rarity] || 0), 0);
  const partyBonus = Math.min(items.length, 3) * ADVENTURE_RULES.partyBonus;
  const chance = ADVENTURE_RULES.baseChance + totalScore * ADVENTURE_RULES.scoreMultiplier + partyBonus;
  return clampChance(chance);
}

function getCooldownRemainingMs(userId) {
  const row = db.prepare('SELECT created_at FROM adventures WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(userId);
  if (!row?.created_at) return 0;
  const last = Date.parse(row.created_at);
  if (!Number.isFinite(last)) return 0;
  const remaining = last + ADVENTURE_RULES.cooldownMs - Date.now();
  return remaining > 0 ? remaining : 0;
}

function safeParseParty(json) {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(it => it && typeof it === 'object')
      .map(it => ({ id: String(it.id || ''), name: String(it.name || ''), rarity: String(it.rarity || 'common') }))
      .filter(it => it.id);
  } catch (_) {
    return [];
  }
}

export function getAdventureHistory(userId, limit = 8) {
  const stmt = db.prepare(`
    SELECT id, success, reward, chance, summary, party_json, created_at
    FROM adventures
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);
  const rows = stmt.all(userId, limit);
  return rows.map(row => ({
    id: row.id,
    success: !!row.success,
    reward: row.reward,
    chance: row.chance,
    summary: row.summary,
    party: safeParseParty(row.party_json),
    created_at: row.created_at
  }));
}

export function getAdventureConfig() {
  return {
    baseChance: ADVENTURE_RULES.baseChance,
    scoreMultiplier: ADVENTURE_RULES.scoreMultiplier,
    partyBonus: ADVENTURE_RULES.partyBonus,
    maxChance: ADVENTURE_RULES.maxChance,
    rarityScores: ADVENTURE_RULES.rarityScores,
    rewardSuccess: ADVENTURE_RULES.rewardSuccess,
    rewardFailure: ADVENTURE_RULES.rewardFailure,
    cooldownSeconds: Math.floor(ADVENTURE_RULES.cooldownMs / 1000)
  };
}

export function getAdventureCooldownSeconds(userId) {
  const remaining = getCooldownRemainingMs(userId);
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

export function performAdventure({ userId, partyIds = [] }) {
  const cooldownMs = getCooldownRemainingMs(userId);
  if (cooldownMs > 0) {
    const err = new Error(`Your expedition party is resting. Try again in ${formatCooldown(cooldownMs)}.`);
    err.code = 'COOLDOWN';
    err.cooldownMs = cooldownMs;
    throw err;
  }

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) {
    throw new Error('User not found');
  }

  const uniqueIds = uniquePartyIds(partyIds);
  if (uniqueIds.length === 0) {
    throw new Error('Select at least one item for the expedition');
  }

  const items = (() => {
    if (!uniqueIds.length) return [];
    const placeholders = uniqueIds.map(() => '?').join(',');
    const rows = db
      .prepare(`SELECT id, name, rarity FROM items WHERE user_id = ? AND id IN (${placeholders})`)
      .all(userId, ...uniqueIds);
    const map = new Map(rows.map(row => [row.id, row]));
    const ordered = uniqueIds.map(id => map.get(id)).filter(Boolean);
    if (ordered.length !== uniqueIds.length) {
      throw new Error('One or more selected items were not found in your inventory');
    }
    return ordered;
  })();

  const chance = calculateAdventureChance(items);
  const success = Math.random() < chance;
  const reward = success ? ADVENTURE_RULES.rewardSuccess : ADVENTURE_RULES.rewardFailure;
  const summary = items.length
    ? items.map(it => `${it.name} [${it.rarity.toUpperCase()}]`).join(', ')
    : 'Braved the ruins alone';
  const partyJson = JSON.stringify(items);
  const nowIso = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare('UPDATE users SET gems = gems + ? WHERE id = ?').run(reward, userId);
    const info = db
      .prepare('INSERT INTO adventures (user_id, success, reward, chance, summary, party_json, created_at) VALUES (?,?,?,?,?,?,?)')
      .run(userId, success ? 1 : 0, reward, chance, summary, partyJson, nowIso);
    const updated = db.prepare('SELECT gems FROM users WHERE id = ?').get(userId);
    return { gems: updated.gems, adventureId: info.lastInsertRowid };
  });

  const { gems, adventureId } = tx();
  const message = success
    ? `Success! Your team recovered ${reward} gems from the ruins.`
    : `The team got turned around but still brought back ${reward} consolation gems.`;
  const entry = {
    id: adventureId,
    success,
    reward,
    chance,
    summary,
    party: items,
    created_at: nowIso
  };
  const nextAvailableAt = new Date(Date.now() + ADVENTURE_RULES.cooldownMs).toISOString();

  return {
    success,
    reward,
    chance,
    gems,
    summary,
    message,
    entry,
    party: items,
    nextAvailableAt,
    cooldownSeconds: Math.floor(ADVENTURE_RULES.cooldownMs / 1000)
  };
}

export { ADVENTURE_RULES };
