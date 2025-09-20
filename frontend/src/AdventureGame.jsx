import React, { useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api.js'

const GAME_DURATION = 28
const MAX_DEPTH = 18
const BASE_SPEED = 7.4
const BASE_SPAWN_INTERVAL = 0.7
const ADVENTURE_COOLDOWN_SECONDS = 60

const RARITY_CONFIG = {
  none: {
    label: 'No relic equipped',
    multiplier: 1,
    speedBoost: 0,
    description: 'Roll the gacha to discover relics that empower your dive.'
  },
  common: {
    label: 'Common relic resonance',
    multiplier: 1.12,
    speedBoost: 0.04,
    description: 'A basic relic slightly stabilises your glide and payout.'
  },
  rare: {
    label: 'Rare relic surge',
    multiplier: 1.3,
    speedBoost: 0.08,
    description: 'Rare relics accelerate shard spawns and gem yield.'
  },
  ultra: {
    label: 'Ultra relic overdrive',
    multiplier: 1.55,
    speedBoost: 0.14,
    description: 'Ultra relics supercharge everything – the true chase rewards.'
  }
}

const rarityLabels = {
  none: 'No relic',
  common: 'Common relic',
  rare: 'Rare relic',
  ultra: 'Ultra relic'
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

function laneToT(lane) {
  return (lane + 1) / 2
}

function projectLane(width, height, lane, depth) {
  const d = Math.min(1, Math.max(0, depth / MAX_DEPTH))
  const left = lerp(width * 0.22, width * 0.48, d)
  const right = lerp(width * 0.78, width * 0.52, d)
  const center = lerp(left, right, laneToT(lane))
  const y = lerp(height * 0.9, height * 0.32, d)
  const size = lerp(width * 0.12, width * 0.032, d)
  return { x: center, y, size, d }
}

function computeCooldown(lastIso) {
  if (!lastIso) return 0
  const parsed = Date.parse(lastIso)
  if (Number.isNaN(parsed)) return 0
  const remaining = ADVENTURE_COOLDOWN_SECONDS * 1000 - (Date.now() - parsed)
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0
}

function drawIdleScene(ctx, size, lane = 0) {
  const { width, height } = size
  if (!width || !height) return
  ctx.clearRect(0, 0, width, height)
  const bg = ctx.createLinearGradient(0, 0, 0, height)
  bg.addColorStop(0, '#070814')
  bg.addColorStop(1, '#121528')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, width, height)

  ctx.save()
  ctx.beginPath()
  ctx.moveTo(width * 0.2, height)
  ctx.lineTo(width * 0.45, height * 0.28)
  ctx.lineTo(width * 0.55, height * 0.28)
  ctx.lineTo(width * 0.8, height)
  ctx.closePath()
  const laneGradient = ctx.createLinearGradient(width * 0.2, height, width * 0.8, height)
  laneGradient.addColorStop(0, 'rgba(106,160,255,0.18)')
  laneGradient.addColorStop(0.5, 'rgba(158,106,255,0.25)')
  laneGradient.addColorStop(1, 'rgba(106,160,255,0.18)')
  ctx.fillStyle = laneGradient
  ctx.fill()
  ctx.restore()

  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 2
  for (let z = 0; z < MAX_DEPTH; z += 2.4) {
    const pos = projectLane(width, height, -1, z)
    const posRight = projectLane(width, height, 1, z)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
    ctx.lineTo(posRight.x, posRight.y)
    ctx.stroke()
  }

  const player = projectLane(width, height, lane, 1)
  ctx.save()
  ctx.translate(player.x, player.y)
  ctx.beginPath()
  ctx.moveTo(0, -player.size * 0.9)
  ctx.lineTo(player.size * 0.55, player.size * 0.7)
  ctx.lineTo(-player.size * 0.55, player.size * 0.7)
  ctx.closePath()
  ctx.fillStyle = 'rgba(110,170,255,0.92)'
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(-player.size * 0.34, player.size * 0.7)
  ctx.lineTo(0, player.size * 1.1)
  ctx.lineTo(player.size * 0.34, player.size * 0.7)
  ctx.fillStyle = 'rgba(255,180,120,0.75)'
  ctx.fill()
  ctx.restore()
}

export function AdventureGame({ user, bestRelic, onAdventureResult }) {
  const canvasRef = useRef(null)
  const animationRef = useRef(null)
  const sizeRef = useRef({ width: 420, height: 240 })
  const playerLaneRef = useRef(0)
  const scoreRef = useRef(0)
  const [score, setScore] = useState(0)
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION)
  const [phase, setPhase] = useState('idle')
  const [status, setStatus] = useState('Collect shards to convert into gems.')
  const [submitting, setSubmitting] = useState(false)
  const [cooldownLeft, setCooldownLeft] = useState(() => computeCooldown(user?.last_adventure_at))
  const [playerLane, setPlayerLane] = useState(0)

  const rarityKey = bestRelic?.rarity || 'none'
  const rarityInfo = useMemo(() => RARITY_CONFIG[rarityKey] || RARITY_CONFIG.none, [rarityKey])

  useEffect(() => {
    setCooldownLeft(computeCooldown(user?.last_adventure_at))
  }, [user?.last_adventure_at])

  useEffect(() => {
    if (cooldownLeft <= 0) return
    const timer = setInterval(() => {
      setCooldownLeft(prev => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldownLeft])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    function handleResize() {
      const parent = canvas.parentElement
      const width = Math.max(300, Math.min(460, parent ? parent.clientWidth : 420))
      const height = 240
      const dpr = window.devicePixelRatio || 1
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      canvas.style.width = width + 'px'
      canvas.style.height = height + 'px'
      sizeRef.current = { width, height }
      drawIdleScene(ctx, sizeRef.current, playerLaneRef.current)
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (phase !== 'playing') {
      drawIdleScene(ctx, sizeRef.current, playerLaneRef.current)
      return
    }

    const { width, height } = sizeRef.current
    let running = true
    let last = performance.now()
    let spawnTimer = 0
    let stripeOffset = 0
    const stars = Array.from({ length: 40 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      speed: 18 + Math.random() * 22,
      size: 1 + Math.random() * 2
    }))
    const objects = []
    scoreRef.current = 0
    setScore(0)
    setTimeLeft(GAME_DURATION)
    playerLaneRef.current = 0
    setPlayerLane(0)
    setStatus('Dive started! Use ←/→ or the on-screen controls.')

    const lanes = [-1, 0, 1]
    const speedScalar = BASE_SPEED * (1 + rarityInfo.speedBoost)
    const spawnInterval = Math.max(0.42, BASE_SPAWN_INTERVAL / (1 + rarityInfo.speedBoost * 1.2))

    function movePlayer(dir) {
      const next = Math.max(-1, Math.min(1, playerLaneRef.current + dir))
      playerLaneRef.current = next
      setPlayerLane(next)
    }

    function onKeyDown(e) {
      if (!running) return
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault()
        movePlayer(-1)
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault()
        movePlayer(1)
      }
    }

    window.addEventListener('keydown', onKeyDown)

    function spawnObject() {
      const lane = lanes[Math.floor(Math.random() * lanes.length)]
      const type = Math.random() < 0.8 ? 'shard' : 'rift'
      objects.push({ lane, z: MAX_DEPTH, type, hit: false })
    }

    const startTime = performance.now()

    function drawScene(now) {
      const delta = (now - last) / 1000
      last = now
      const speed = speedScalar + delta * 0.2
      spawnTimer += delta
      stripeOffset = (stripeOffset + delta * speed * 0.8) % MAX_DEPTH

      while (spawnTimer > spawnInterval) {
        spawnObject()
        spawnTimer -= spawnInterval
      }

      for (const star of stars) {
        star.y += delta * (speed * 6 + star.speed)
        if (star.y > height) {
          star.y = -8
          star.x = Math.random() * width
          star.size = 1 + Math.random() * 2
        }
      }

      for (const obj of objects) {
        obj.z -= delta * (speed * 1.4)
        if (obj.z < 1.2 && !obj.hit) {
          if (Math.abs(obj.lane - playerLaneRef.current) < 0.1) {
            obj.hit = true
            if (obj.type === 'shard') {
              const gain = 12 + Math.round(Math.random() * 6)
              scoreRef.current += gain
              setStatus(`Shard captured! +${gain} energy`)
            } else {
              const penalty = 20
              scoreRef.current = Math.max(0, scoreRef.current - penalty)
              setStatus('Void rift grazed you! -20 energy')
            }
          }
        }
      }

      const bg = ctx.createLinearGradient(0, 0, 0, height)
      bg.addColorStop(0, '#050715')
      bg.addColorStop(1, '#14182a')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, width, height)

      ctx.fillStyle = 'rgba(255,255,255,0.75)'
      for (const star of stars) {
        ctx.globalAlpha = 0.25 + star.size * 0.12
        ctx.fillRect(star.x, star.y, star.size, star.size)
      }
      ctx.globalAlpha = 1

      ctx.save()
      ctx.beginPath()
      ctx.moveTo(width * 0.2, height)
      ctx.lineTo(width * 0.45, height * 0.25)
      ctx.lineTo(width * 0.55, height * 0.25)
      ctx.lineTo(width * 0.8, height)
      ctx.closePath()
      const laneGradient = ctx.createLinearGradient(width * 0.2, height, width * 0.8, height)
      laneGradient.addColorStop(0, 'rgba(90,120,200,0.22)')
      laneGradient.addColorStop(0.5, 'rgba(130,160,255,0.32)')
      laneGradient.addColorStop(1, 'rgba(140,110,255,0.28)')
      ctx.fillStyle = laneGradient
      ctx.fill()
      ctx.restore()

      ctx.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx.lineWidth = 2
      for (let z = stripeOffset; z < MAX_DEPTH; z += 2.4) {
        const left = projectLane(width, height, -1, z)
        const right = projectLane(width, height, 1, z)
        ctx.beginPath()
        ctx.moveTo(left.x, left.y)
        ctx.lineTo(right.x, right.y)
        ctx.stroke()
      }

      objects.sort((a, b) => b.z - a.z)
      for (const obj of objects) {
        if (obj.z < -1) continue
        const pos = projectLane(width, height, obj.lane, Math.max(obj.z, 0.01))
        if (obj.type === 'shard') {
          const gradient = ctx.createRadialGradient(pos.x, pos.y, pos.size * 0.2, pos.x, pos.y, pos.size)
          gradient.addColorStop(0, 'rgba(120,200,255,0.95)')
          gradient.addColorStop(1, 'rgba(120,200,255,0)')
          ctx.fillStyle = gradient
          ctx.beginPath()
          ctx.arc(pos.x, pos.y, pos.size, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = 'rgba(200,255,255,0.9)'
          ctx.beginPath()
          ctx.arc(pos.x, pos.y, pos.size * 0.35, 0, Math.PI * 2)
          ctx.fill()
        } else {
          const gradient = ctx.createRadialGradient(pos.x, pos.y, pos.size * 0.15, pos.x, pos.y, pos.size)
          gradient.addColorStop(0, 'rgba(255,110,140,0.9)')
          gradient.addColorStop(1, 'rgba(80,0,40,0.05)')
          ctx.fillStyle = gradient
          ctx.beginPath()
          ctx.arc(pos.x, pos.y, pos.size * 0.9, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      const player = projectLane(width, height, playerLaneRef.current, 1)
      ctx.save()
      ctx.translate(player.x, player.y)
      ctx.beginPath()
      ctx.moveTo(0, -player.size * 0.9)
      ctx.lineTo(player.size * 0.6, player.size * 0.7)
      ctx.lineTo(-player.size * 0.6, player.size * 0.7)
      ctx.closePath()
      ctx.fillStyle = 'rgba(110,170,255,0.95)'
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(-player.size * 0.38, player.size * 0.7)
      ctx.lineTo(0, player.size * 1.2)
      ctx.lineTo(player.size * 0.38, player.size * 0.7)
      ctx.fillStyle = 'rgba(255,185,130,0.78)'
      ctx.fill()
      ctx.restore()

      ctx.fillStyle = 'rgba(255,255,255,0.1)'
      ctx.font = '12px Inter, sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(`×${rarityInfo.multiplier.toFixed(2)} relic boost`, width * 0.06, height * 0.18)

      for (let i = objects.length - 1; i >= 0; i--) {
        const obj = objects[i]
        if (obj.z < -1 || obj.z > MAX_DEPTH || (obj.hit && obj.z < 0.2)) {
          objects.splice(i, 1)
        }
      }

      const totalElapsed = (performance.now() - startTime) / 1000
      const remainingTime = Math.max(0, GAME_DURATION - totalElapsed)
      setTimeLeft(remainingTime)
      setScore(Math.round(scoreRef.current))

      if (remainingTime <= 0.05) {
        endRun()
        return
      }

      if (running) {
        animationRef.current = requestAnimationFrame(drawScene)
      }
    }

    function endRun() {
      if (!running) return
      running = false
      cancelAnimationFrame(animationRef.current)
      window.removeEventListener('keydown', onKeyDown)
      const finalScore = Math.round(scoreRef.current)
      setScore(finalScore)
      setPhase('resolving')
      setStatus('Dive complete! Calculating payout…')
      submitScore(finalScore)
    }

    animationRef.current = requestAnimationFrame(drawScene)

    return () => {
      running = false
      cancelAnimationFrame(animationRef.current)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [phase, rarityInfo])

  async function submitScore(finalScore) {
    setSubmitting(true)
    try {
      const result = await api.completeAdventure(finalScore)
      if (result.cooldownSeconds != null) {
        setCooldownLeft(result.cooldownSeconds)
      } else {
        setCooldownLeft(ADVENTURE_COOLDOWN_SECONDS)
      }
      const rarityName = rarityLabels[result.rarityUsed] || rarityLabels.none
      if (result.reward > 0) {
        setStatus(`Aether yield: +${result.reward} gems (×${result.multiplier.toFixed(2)} from ${rarityName}).`)
      } else {
        setStatus('No shards banked this time. Collect more energy for a payout!')
      }
      onAdventureResult?.({ ...result, score: finalScore })
    } catch (err) {
      setStatus(err.message || 'Failed to record dive.')
    } finally {
      setSubmitting(false)
      setPhase('idle')
    }
  }

  function startGame() {
    if (phase === 'playing' || submitting) return
    if (cooldownLeft > 0) {
      setStatus(`Engines cooling down… ${cooldownLeft}s remaining.`)
      return
    }
    setPhase('playing')
  }

  function handleMove(dir) {
    if (phase !== 'playing') return
    const next = Math.max(-1, Math.min(1, playerLaneRef.current + dir))
    playerLaneRef.current = next
    setPlayerLane(next)
  }

  const featuredName = bestRelic?.name || 'No relic found yet'

  return (
    <div className="card adventure-card">
      <div className="row">
        <h3>Aether Dive Mini-game</h3>
        <span className="tag">3D runner</span>
        <div className="spacer" />
        <button className="btn secondary" disabled={phase === 'playing' || submitting || cooldownLeft > 0} onClick={startGame}>
          {phase === 'playing' ? 'In progress…' : cooldownLeft > 0 ? `Cooldown (${cooldownLeft}s)` : 'Start dive'}
        </button>
      </div>
      <p className="muted">
        Glide through the aether corridor to harvest shards. Your strongest gacha relic powers the ship and boosts gem payout –
        another reason to chase rarities!
      </p>
      <div className="adventure-featured">
        <div>
          <div className="muted" style={{ fontSize: 12 }}>Featured relic</div>
          <div className={`adventure-featured-name ${rarityKey !== 'none' ? 'rarity-' + rarityKey : ''}`}>
            {featuredName}
          </div>
        </div>
        <div className="stack" style={{ alignItems: 'flex-end' }}>
          <span className="tag">Multiplier ×{rarityInfo.multiplier.toFixed(2)}</span>
          <span className="muted" style={{ fontSize: 12, maxWidth: 160, textAlign: 'right' }}>{rarityInfo.description}</span>
        </div>
      </div>
      <div className="adventure-scene">
        <canvas ref={canvasRef} className="adventure-canvas" />
        <div className="adventure-hud">
          <div className="adventure-meter">
            <div>
              <span className="hud-label">Score</span>
              <div className="hud-value">{score}</div>
            </div>
            <div>
              <span className="hud-label">Time</span>
              <div className="hud-value">{timeLeft.toFixed(1)}s</div>
            </div>
            <div>
              <span className="hud-label">Best</span>
              <div className="hud-value">{user?.best_adventure_score ?? 0}</div>
            </div>
          </div>
          <div className="adventure-controls">
            <button className="btn circle" type="button" onClick={() => handleMove(-1)} disabled={phase !== 'playing'} aria-label="Move left">⟵</button>
            <button className="btn circle" type="button" onClick={() => handleMove(1)} disabled={phase !== 'playing'} aria-label="Move right">⟶</button>
          </div>
        </div>
      </div>
      <div className="adventure-status">{status}</div>
      <div className="muted" style={{ fontSize: 12 }}>
        Tip: Collect multiple shards in a run to push for higher scores. Void rifts reduce your stored energy, so having rarer
        relics for stability really matters.
      </div>
    </div>
  )
}
