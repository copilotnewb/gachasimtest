# Full-Stack Gacha Game (Backend-driven)

This is a complete demo gacha game where **all logic runs on the backend** (RNG, pity, database writes, cron jobs). The frontend is a thin React client that just calls the API.

## What you get
- **Backend**: Node.js + Express + SQLite (better-sqlite3), JWT auth, roll logic with pity, banner rotation, and cron jobs.
- **Frontend**: React + Vite single-page app.
- **Database**: SQLite file (`backend/data.sqlite`) initialized/seeds with sample banners.
- **Cron**: Daily gem grant to all users and periodic banner activation/deactivation.

## Run it locally
1. **Backend**
   ```bash
   cd backend
   cp .env.example .env
   npm install
   npm run seed
   npm run dev
   ```
   Backend: http://localhost:4000

2. **Frontend**
   Open a second terminal:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   Frontend: http://localhost:5173

## Notes
- Default starting gems: 1000 (on register). Cron also grants 300 gems daily to all users.
- Edit `backend/banners.json` and re-run `npm run seed` to change banners/pools/odds.
- All sensitive logic is in the backend (`backend/gacha.js`). The client never computes results locally.
