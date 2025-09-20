# Gacha Backend (Node.js + Express + SQLite)

## Quick Start
```bash
cd backend
cp .env.example .env   # edit JWT_SECRET if desired
npm install
npm run seed           # seed banners (and create DB)
npm run dev
```

### Endpoints
- `POST /api/auth/register` { username, password }
- `POST /api/auth/login` { username, password }
- `GET /api/me` (Bearer token)
- `GET /api/banners`
- `GET /api/inventory` (Bearer token)
- `POST /api/roll` (Bearer token) { bannerId, times }  // cost 160 gems per roll; 10x costs 9 rolls
- `POST /api/claim/daily` (Bearer token)               // +100 gems; CRON also grants DAILY_GEMS to all users
- `GET /api/adventure/history` (Bearer token)          // recent expedition runs + cooldown/config info
- `POST /api/adventure` (Bearer token) { party }       // send up to 3 items on an expedition mini-game

### Mechanics
- Pity: Rare guaranteed at 10, Ultra at 90.
- Rates per banner; pools defined in DB (seeded from `banners.json`).
- All roll logic runs in the backend (`gacha.js`).
- SQLite DB stored in `backend/data.sqlite`.
- Cron jobs in `cron.js`:
  - Midnight: add `DAILY_GEMS` (default 300) to all users.
  - Every 30m: auto-activate/deactivate banners by dates.
- Expedition mini-game rewards +20 to +60 gems based on success chance, which scales with the rarity of the selected items.
