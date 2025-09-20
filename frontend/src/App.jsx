import React, { useEffect, useState } from 'react'
import { api } from './api.js'

function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const t = api.token()
    if (!t) { setLoading(false); return }
    api.auth.me().then(setUser).catch(()=>api.clear()).finally(()=>setLoading(false))
  }, [])
  return { user, setUser, loading }
}

function Nav({ user, onLogout }) {
  return (
    <div className="nav">
      <div className="row">
        <div className="brand">✨ Gacha</div>
        <span className="tag">Demo</span>
      </div>
      <div className="row">
        {user ? <>
          <span className="tag">User: <b>{user.username}</b></span>
          <span className="tag">Gems: <b>{user.gems}</b></span>
          <button className="btn secondary" onClick={onLogout}>Log out</button>
        </> : null}
      </div>
    </div>
  )
}

function AuthCard({ onLoggedIn }) {
  const [mode, setMode] = useState('login')
  const [u, setU] = useState('')
  const [p, setP] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function go() {
    setBusy(true); setErr('')
    try {
      const res = mode === 'login' ? await api.auth.login(u,p) : await api.auth.register(u,p)
      api.setToken(res.token)
      const me = await api.auth.me()
      onLoggedIn(me)
    } catch (e) {
      setErr(e.message)
    } finally { setBusy(false) }
  }

  return (
    <div className="card" style={{maxWidth:420, margin:'50px auto'}}>
      <div className="stack">
        <h2>{mode === 'login' ? 'Welcome back' : 'Create account'}</h2>
        <input className="input" placeholder="Username" value={u} onChange={e=>setU(e.target.value)} />
        <input className="input" placeholder="Password" type="password" value={p} onChange={e=>setP(e.target.value)} />
        <button className="btn" disabled={!u||!p||busy} onClick={go}>
          {busy ? 'Please wait…' : (mode==='login'?'Log in':'Sign up')}
        </button>
        <div className="muted">
          {mode==='login' ? <>No account? <a href="#" onClick={()=>setMode('register')}>Sign up</a></> : <>Have an account? <a href="#" onClick={()=>setMode('login')}>Log in</a></>}
        </div>
        {err ? <div className="toast" style={{color:'var(--bad)'}}>{err}</div> : null}
      </div>
    </div>
  )
}

function BannerCard({ b, onRoll, busy }) {
  return (
    <div className="card banner">
      <div className="row">
        <h3>{b.name}</h3>
        <div className="spacer" />
        <span className="tag">{new Date(b.start_at).toLocaleDateString()} → {new Date(b.end_at).toLocaleDateString()}</span>
      </div>
      <div className="muted" style={{marginBottom:10}}>Rates: Common {(b.rates.common*100).toFixed(0)}% • Rare {(b.rates.rare*100).toFixed(0)}% • Ultra {(b.rates.ultra*100).toFixed(0)}%</div>
      <div className="row">
        <button className="btn" disabled={busy} onClick={()=>onRoll(b.id, 1)}>Roll (160)</button>
        <button className="btn secondary" disabled={busy} onClick={()=>onRoll(b.id, 10)}>Roll x10 (1440)</button>
      </div>
    </div>
  )
}

function Inventory({ items }) {
  return (
    <div className="card">
      <h3>Your Inventory</h3>
      {items.length === 0 ? <div className="muted">No items yet. Try your luck!</div> : (
        <ul className="list">
          {items.map(it => (
            <li key={it.id}>
              <span className={'rarity-' + it.rarity}>{it.name}</span>
              <span className="muted">{new Date(it.obtained_at).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Main({ user, setUser, onLogout }) {
  const [banners, setBanners] = useState([])
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function loadAll() {
    const [bs, inv, me] = await Promise.all([api.banners(), api.inventory(), api.auth.me()])
    setBanners(bs); setItems(inv); setUser(me);
  }
  useEffect(() => { loadAll().catch(console.error) }, [])

  async function roll(bannerId, times) {
    setBusy(true); setMsg('')
    try {
      const r = await api.roll(bannerId, times)
      await loadAll()
      const rares = r.results.filter(x=>x.rarity!=='common').length
      setMsg(`Spent ${r.totalCost} gems. You rolled ${r.results.length} times and got ${rares} ★★+ items.`)
    } catch (e) {
      setMsg(e.message)
    } finally { setBusy(false) }
  }

  async function claimDaily() {
    setBusy(true); setMsg('')
    try {
      const r = await api.claimDaily()
      const me = await api.auth.me()
      setUser(me)
      setMsg(`Daily claimed: +${r.awarded} gems. New balance: ${r.gems}`)
    } catch (e) {
      setMsg(e.message)
    } finally { setBusy(false) }
  }

  return (
    <div className="wrap">
      <Nav user={user} onLogout={onLogout} />
      <div className="grid" style={{alignItems:'start'}}>
        <div className="stack">
          <div className="card">
            <div className="row">
              <h3>Summon Banners</h3>
              <div className="spacer" />
              <button className="btn secondary" disabled={busy} onClick={claimDaily}>Claim daily (+100)</button>
            </div>
            <div className="stack">
              {banners.map(b => <BannerCard key={b.id} b={b} onRoll={roll} busy={busy} />)}
            </div>
          </div>
          <Inventory items={items} />
        </div>
        <div className="card">
          <h3>About</h3>
          <p className="muted">All game logic runs on the backend: RNG, pity, banner rotation, and database writes. The frontend is a thin client.</p>
          <ul>
            <li><b>Pity:</b> Rare at 10, Ultra at 90</li>
            <li><b>Cost:</b> 160 gems per roll (10x = 1440)</li>
            <li><b>Daily:</b> +100 (manual) and +300 (cron to all users at midnight)</li>
          </ul>
          {msg ? <div className="toast">{msg}</div> : null}
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const { user, setUser, loading } = useAuth()
  if (loading) return <div className="wrap"><div className="card">Loading…</div></div>
  const logout = () => { localStorage.removeItem('token'); window.location.reload() }
  return user ? <Main user={user} setUser={setUser} onLogout={logout} /> : <div className="wrap"><Nav /><AuthCard onLoggedIn={setUser} /></div>
}
