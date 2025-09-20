import React, { useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api.js'

const ROLL_ANIMATION_DURATION = 4200
const ROLL_CARD_WIDTH = 120
const ROLL_CARD_GAP = 16
const ROLL_FILLER_FALLBACK_NAMES = [
  'Lucky Trinket',
  'Mystic Token',
  'Spark Capsule',
  'Aether Relic',
  'Aurora Charm',
  'Nebula Prism',
  'Fortune Sigil'
]
const ROLL_FILLER_RARITIES = ['common', 'common', 'common', 'rare', 'rare', 'ultra']
const RARITY_STARS = { common: '★', rare: '★★', ultra: '★★★' }
const RARITY_PRIORITY = { common: 1, rare: 2, ultra: 3 }

function createFillerItems(banner, count, offset = 0) {
  const pool = banner?.pool || {}
  const filler = []
  for (let i = 0; i < count; i++) {
    const rarity = ROLL_FILLER_RARITIES[Math.floor(Math.random() * ROLL_FILLER_RARITIES.length)]
    const names = Array.isArray(pool[rarity]) ? pool[rarity] : []
    const fallback = ROLL_FILLER_FALLBACK_NAMES[(offset + i) % ROLL_FILLER_FALLBACK_NAMES.length]
    const variation = ((offset + i) % 3) + 1
    const fallbackName = `${fallback} #${variation}`
    const name = names.length ? names[Math.floor(Math.random() * names.length)] : fallbackName
    filler.push({
      key: `filler-${offset + i}`,
      name,
      rarity,
      isResult: false
    })
  }
  return filler
}

function RollAnimationOverlay({ data, onClose }) {
  const windowRef = useRef(null)
  const [distance, setDistance] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [revealResults, setRevealResults] = useState(false)

  const { sequence, focusIndex } = useMemo(() => {
    if (!data) return { sequence: [], focusIndex: 0 }
    const results = Array.isArray(data.results) ? data.results : []
    const fillerBeforeCount = Math.max(18, results.length * 6)
    const fillerAfterCount = Math.max(10, Math.ceil(results.length * 2.5))
    const fillerBefore = createFillerItems(data.banner, fillerBeforeCount, 0)
    const fillerAfter = createFillerItems(data.banner, fillerAfterCount, fillerBeforeCount)
    let highlightIdx = results.length ? 0 : -1
    if (results.length) {
      highlightIdx = results.reduce((bestIdx, item, idx) => {
        if (bestIdx === -1) return idx
        const currentScore = RARITY_PRIORITY[item.rarity] || 0
        const bestScore = RARITY_PRIORITY[results[bestIdx].rarity] || 0
        if (currentScore > bestScore) return idx
        if (currentScore === bestScore && idx > bestIdx) return idx
        return bestIdx
      }, -1)
      if (highlightIdx < 0) highlightIdx = results.length - 1
    }
    const sequenceResults = results.map((item, idx) => ({
      ...item,
      key: `result-${item.id || idx}-${idx}`,
      isResult: true
    }))
    const sequence = [...fillerBefore, ...sequenceResults, ...fillerAfter]
    const focusIndex = fillerBefore.length + (sequenceResults.length ? highlightIdx : 0)
    return { sequence, focusIndex }
  }, [data])

  useEffect(() => {
    if (!data || !sequence.length) {
      setDistance(0)
      setPlaying(false)
      return
    }
    setPlaying(false)
    setRevealResults(false)
    let frame = 0
    let cancelled = false

    const updateDistance = () => {
      const windowEl = windowRef.current
      if (!windowEl) return
      const windowWidth = windowEl.clientWidth
      const trackWidth =
        sequence.length * ROLL_CARD_WIDTH + Math.max(0, sequence.length - 1) * ROLL_CARD_GAP
      const target =
        focusIndex * (ROLL_CARD_WIDTH + ROLL_CARD_GAP) - (windowWidth - ROLL_CARD_WIDTH) / 2
      const maxOffset = Math.max(0, trackWidth - windowWidth)
      const nextDistance = Math.max(0, Math.min(target, maxOffset))
      setDistance(nextDistance)
    }

    updateDistance()
    frame = requestAnimationFrame(() => {
      if (!cancelled) setPlaying(true)
    })

    window.addEventListener('resize', updateDistance)
    const revealTimer = setTimeout(() => {
      if (!cancelled) setRevealResults(true)
    }, ROLL_ANIMATION_DURATION)
    const timer = setTimeout(() => {
      if (!cancelled) onClose?.()
    }, ROLL_ANIMATION_DURATION + 800)

    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', updateDistance)
      clearTimeout(revealTimer)
      clearTimeout(timer)
    }
  }, [data, focusIndex, onClose, sequence])

  if (!data || !sequence.length) return null

  return (
    <div className="roll-overlay">
      <div className="roll-overlay-inner">
        <div className="roll-header">
          <h2>Rolling…</h2>
          {data.banner?.name ? <div className="muted">Banner: {data.banner.name}</div> : null}
        </div>
        <div className="roll-window" ref={windowRef}>
          <div className="roll-marker" aria-hidden="true" />
          <div
            className={`roll-track ${playing ? 'is-running' : ''}`}
            style={{
              '--roll-distance': `${distance}px`,
              '--roll-duration': `${ROLL_ANIMATION_DURATION}ms`
            }}
          >
            {sequence.map(item => (
              <div
                key={item.key}
                className={`roll-card ${item.isResult ? 'is-result' : ''}`}
              >
                <div className={`roll-card-name ${item.isResult && !revealResults ? '' : `rarity-${item.rarity}`}`}>
                  {item.isResult && !revealResults ? '???' : item.name}
                </div>
                <div className="roll-card-rarity">
                  {item.isResult && !revealResults ? '???' : (RARITY_STARS[item.rarity] || '')}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="roll-summary">
          <div className="roll-summary-title">Results</div>
          {revealResults ? (
            <div className="roll-summary-list">
              {data.results.map((res, idx) => (
                <span
                  key={res.id || `${res.name}-${idx}`}
                  className={`roll-summary-chip roll-summary-chip-${res.rarity}`}
                >
                  {res.name}
                </span>
              ))}
            </div>
          ) : (
            <div className="muted">Results will reveal after the spin.</div>
          )}
        </div>
      </div>
    </div>
  )
}

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
  const rarePity = user?.pity_rare ?? 0
  const ultraPity = user?.pity_ultra ?? 0
  const rareRemaining = Math.max(0, 10 - rarePity)
  const ultraRemaining = Math.max(0, 90 - ultraPity)
  const rareTitle = rareRemaining === 0
    ? 'Next rare is guaranteed on this pull'
    : `${rareRemaining} ${rareRemaining === 1 ? 'pull' : 'pulls'} until guaranteed rare`
  const ultraTitle = ultraRemaining === 0
    ? 'Next ultra is guaranteed on this pull'
    : `${ultraRemaining} ${ultraRemaining === 1 ? 'pull' : 'pulls'} until guaranteed ultra`
  return (
    <div className="nav">
      <div className="row">
        <div className="brand">✨ Gacha</div>
        <span className="tag">Demo</span>
      </div>
      <div className="row nav-user">
        {user ? <>
          <span className="tag">User: <b>{user.username}</b></span>
          <span className="tag">Gems: <b>{user.gems.toLocaleString()}</b></span>
          <span className="tag" title={rareTitle}>Rare pity: <b>{rarePity}</b>/10</span>
          <span className="tag" title={ultraTitle}>Ultra pity: <b>{ultraPity}</b>/90</span>
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

function CollectionTracker({ banners, items }) {
  const ownedNames = useMemo(() => new Set(items.map(it => it.name)), [items])
  const rarityOrder = ['ultra', 'rare', 'common']
  const rarityLabels = {
    common: 'Common ★',
    rare: 'Rare ★★',
    ultra: 'Ultra ★★★'
  }

  if (banners.length === 0) {
    return (
      <div className="card">
        <h3>Collection Tracker</h3>
        <div className="muted">No active banners to track right now.</div>
      </div>
    )
  }

  return (
    <div className="card">
      <h3>Collection Tracker</h3>
      <div className="stack">
        {banners.map(b => {
          const groups = rarityOrder
            .filter(r => Array.isArray(b.pool?.[r]) && b.pool[r].length)
            .map(r => [r, b.pool[r]])
          const total = groups.reduce((sum, [, names]) => sum + names.length, 0)
          const ownedCount = groups.reduce((sum, [, names]) => (
            sum + names.filter(name => ownedNames.has(name)).length
          ), 0)
          return (
            <div key={b.id} className="collection-banner">
              <div className="row">
                <strong>{b.name}</strong>
                <span className="muted">{ownedCount}/{total} owned</span>
              </div>
              <div className="collection-groups">
                {groups.map(([rarity, names]) => (
                  <div key={rarity}>
                    <div className="collection-group-title">{rarityLabels[rarity] || rarity}</div>
                    <ul className="collection-list">
                      {names.map(name => {
                        const hasItem = ownedNames.has(name)
                        return (
                          <li key={name} className={`collection-item ${hasItem ? 'is-owned' : 'is-missing'}`}>
                            <span className={'rarity-' + rarity}>{name}</span>
                            <span className={'tag ' + (hasItem ? 'tag-owned' : 'tag-missing')}>
                              {hasItem ? 'Owned' : 'Missing'}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AdventureCard({
  items,
  partyIds,
  onToggle,
  onClear,
  onSend,
  busy,
  history,
  chance,
  cooldown,
  config
}) {
  const itemMap = useMemo(() => new Map(items.map(it => [it.id, it])), [items])
  const selectedItems = useMemo(() => partyIds.map(id => itemMap.get(id)).filter(Boolean), [partyIds, itemMap])
  const sortedItems = useMemo(() => {
    const sorted = [...items]
    sorted.sort((a, b) => {
      const rarityDiff = (RARITY_PRIORITY[b.rarity] || 0) - (RARITY_PRIORITY[a.rarity] || 0)
      if (rarityDiff !== 0) return rarityDiff
      const timeB = Date.parse(b.obtained_at)
      const timeA = Date.parse(a.obtained_at)
      return (timeB || 0) - (timeA || 0)
    })
    return sorted
  }, [items])

  const chancePercent = typeof chance === 'number' ? Math.round(chance * 100) : null
  const ready = cooldown <= 0
  const successReward = config?.rewardSuccess ?? 0
  const failureReward = config?.rewardFailure ?? 0

  const cooldownLabel = useMemo(() => {
    if (cooldown <= 0) return null
    const minutes = Math.floor(cooldown / 60)
    const seconds = cooldown % 60
    const parts = []
    if (minutes > 0) parts.push(`${minutes}m`)
    if (seconds > 0 && minutes < 5) parts.push(`${seconds}s`)
    return parts.join(' ') || 'soon'
  }, [cooldown])

  return (
    <div className="card adventure-card">
      <div className="row">
        <h3>Starfall Expedition</h3>
        <span className="tag">Mini-game</span>
      </div>
      <p className="muted">Send up to three relics from your gacha haul to scout the ruins. Higher rarity allies raise your success odds and earn bonus gems.</p>
      <div className="adventure-party">
        <div className="row adventure-party-header">
          <strong>Selected team</strong>
          <div className="spacer" />
          <button className="btn secondary adventure-clear" type="button" onClick={onClear} disabled={partyIds.length === 0 || busy}>Clear</button>
        </div>
        <div className="adventure-slots">
          {[0,1,2].map(idx => {
            const item = selectedItems[idx]
            return (
              <div key={idx} className={`adventure-slot ${item ? 'is-filled' : 'is-empty'}`}>
                {item ? (
                  <>
                    <div className={`adventure-slot-name rarity-${item.rarity}`}>{item.name}</div>
                    <div className="muted">{item.rarity.toUpperCase()}</div>
                  </>
                ) : (
                  <div className="muted">Empty slot</div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      <div className="adventure-actions">
        <div>
          <div className="muted adventure-label">Chance</div>
          <div className="adventure-chance">{chancePercent != null ? `${chancePercent}%` : '—'}</div>
        </div>
        <div>
          <div className="muted adventure-label">Rewards</div>
          <div className="adventure-rewards">Success +{successReward} • Miss +{failureReward}</div>
        </div>
        <div className="spacer" />
        <button
          className="btn"
          type="button"
          disabled={busy || !ready || selectedItems.length === 0}
          onClick={onSend}
        >
          {ready ? 'Launch Expedition' : 'Party Resting'}
        </button>
      </div>
      {cooldown > 0 ? <div className="toast adventure-cooldown">Crew resting: {cooldownLabel}</div> : null}
      <div className="adventure-available">
        <div className="row adventure-available-header">
          <strong>Available companions</strong>
          <span className="muted">Tap up to 3</span>
        </div>
        <div className="adventure-companions">
          {sortedItems.length === 0 ? (
            <div className="muted">Roll the gacha to recruit gear for expeditions.</div>
          ) : sortedItems.map(it => {
            const selected = partyIds.includes(it.id)
            return (
              <button
                key={it.id}
                type="button"
                className={`adventure-chip ${selected ? 'is-selected' : ''}`}
                onClick={() => onToggle(it.id)}
                disabled={busy && !selected}
              >
                <span className={`rarity-${it.rarity}`}>{it.name}</span>
                <span className="adventure-chip-tag">{it.rarity}</span>
              </button>
            )
          })}
        </div>
      </div>
      <div className="adventure-history">
        <strong>Recent expeditions</strong>
        {history.length === 0 ? (
          <div className="muted">No expeditions yet. Strong pulls dramatically raise your odds.</div>
        ) : (
          <ul className="list adventure-history-list">
            {history.map(entry => (
              <li key={entry.id}>
                <div className="adventure-history-entry">
                  <div className={`adventure-history-result ${entry.success ? 'is-success' : 'is-fail'}`}>
                    {entry.success ? 'Success' : 'Failed'}
                  </div>
                  <div className="adventure-history-detail">
                    {Math.round(entry.chance * 100)}% chance • +{entry.reward} gems
                  </div>
                  <div className="adventure-history-party">
                    {entry.party.map(p => (
                      <span key={p.id} className={`rarity-${p.rarity}`}>{p.name}</span>
                    ))}
                  </div>
                </div>
                <span className="muted adventure-history-time">{new Date(entry.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Main({ user, setUser, onLogout }) {
  const [banners, setBanners] = useState([])
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [rollShowcase, setRollShowcase] = useState(null)
  const [adventureParty, setAdventureParty] = useState([])
  const [adventureHistory, setAdventureHistory] = useState([])
  const [adventureConfig, setAdventureConfig] = useState(null)
  const [adventureCooldown, setAdventureCooldown] = useState(0)
  const [adventureBusy, setAdventureBusy] = useState(false)

  const adventurePartyItems = useMemo(() => {
    const map = new Map(items.map(it => [it.id, it]))
    return adventureParty.map(id => map.get(id)).filter(Boolean)
  }, [items, adventureParty])

  const predictedAdventureChance = useMemo(() => {
    if (!adventureConfig) return null
    const rarityScores = adventureConfig.rarityScores || {}
    const totalScore = adventurePartyItems.reduce((sum, item) => sum + (rarityScores[item.rarity] || 0), 0)
    const partyBonus = Math.min(adventurePartyItems.length, 3) * (adventureConfig.partyBonus || 0)
    const rawChance = (adventureConfig.baseChance || 0) + totalScore * (adventureConfig.scoreMultiplier || 0) + partyBonus
    const maxChance = typeof adventureConfig.maxChance === 'number' ? adventureConfig.maxChance : rawChance
    return Math.min(maxChance, Math.max(0, rawChance))
  }, [adventurePartyItems, adventureConfig])

  useEffect(() => {
    if (adventureCooldown <= 0) return
    const id = setInterval(() => {
      setAdventureCooldown(prev => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(id)
  }, [adventureCooldown])

  async function loadAll() {
    const [bs, inv, me] = await Promise.all([api.banners(), api.inventory(), api.auth.me()])
    setBanners(bs); setItems(inv); setUser(me);
  }

  async function loadAdventureInfo() {
    try {
      const info = await api.adventure.history()
      setAdventureHistory(Array.isArray(info.history) ? info.history : [])
      setAdventureConfig(info.config || null)
      setAdventureCooldown(info.cooldownSeconds || 0)
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    loadAll().catch(console.error)
    loadAdventureInfo().catch(console.error)
  }, [])

  async function roll(bannerId, times) {
    setBusy(true); setMsg('')
    try {
      const banner = banners.find(b => b.id === bannerId) || null
      const r = await api.roll(bannerId, times)
      setRollShowcase({ banner, results: r.results })
      await loadAll()
      await loadAdventureInfo()
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

  function toggleAdventureItem(id) {
    setAdventureParty(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length >= 3) return [...prev.slice(1), id]
      return [...prev, id]
    })
  }

  function clearAdventureParty() {
    setAdventureParty([])
  }

  async function sendAdventure() {
    if (adventurePartyItems.length === 0) return
    setAdventureBusy(true); setMsg('')
    try {
      const result = await api.adventure.play(adventureParty)
      setMsg(result.message)
      setUser(prev => prev ? { ...prev, gems: result.gems } : prev)
      if (result.nextAvailableAt) {
        const diff = Math.ceil((Date.parse(result.nextAvailableAt) - Date.now()) / 1000)
        if (Number.isFinite(diff) && diff > 0) setAdventureCooldown(diff)
      } else if (result.cooldownSeconds) {
        setAdventureCooldown(result.cooldownSeconds)
      }
      if (result.entry) {
        setAdventureHistory(prev => [result.entry, ...prev].slice(0, 10))
      }
      await loadAdventureInfo()
    } catch (e) {
      setMsg(e.message)
      const remaining = e?.data?.cooldownSeconds
      if (typeof remaining === 'number') setAdventureCooldown(remaining)
    } finally {
      setAdventureBusy(false)
    }
  }

  return (
    <>
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
          <div className="stack">
            <AdventureCard
              items={items}
              partyIds={adventureParty}
              onToggle={toggleAdventureItem}
              onClear={clearAdventureParty}
              onSend={sendAdventure}
              busy={adventureBusy}
              history={adventureHistory}
              chance={predictedAdventureChance}
              cooldown={adventureCooldown}
              config={adventureConfig}
            />
            <CollectionTracker banners={banners} items={items} />
            <div className="card">
              <h3>About</h3>
              <p className="muted">All game logic runs on the backend: RNG, pity, banner rotation, and database writes. The frontend is a thin client.</p>
              <ul>
                <li><b>Pity:</b> Rare at 10, Ultra at 90</li>
                <li><b>Cost:</b> 160 gems per roll (10x = 1440)</li>
                <li><b>Daily:</b> +100 (manual) and +300 (cron to all users at midnight)</li>
                <li><b>Expeditions:</b> Send 1-3 items to earn +20 to +60 gems; higher rarity dramatically boosts success chance.</li>
              </ul>
              {msg ? <div className="toast">{msg}</div> : null}
            </div>
          </div>
        </div>
      </div>
      {rollShowcase ? <RollAnimationOverlay data={rollShowcase} onClose={() => setRollShowcase(null)} /> : null}
    </>
  )
}

export default function App() {
  const { user, setUser, loading } = useAuth()
  if (loading) return <div className="wrap"><div className="card">Loading…</div></div>
  const logout = () => { localStorage.removeItem('token'); window.location.reload() }
  return user ? <Main user={user} setUser={setUser} onLogout={logout} /> : <div className="wrap"><Nav /><AuthCard onLoggedIn={setUser} /></div>
}
