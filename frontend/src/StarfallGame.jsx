import React, { useEffect, useMemo, useRef, useState } from 'react'

const RARITY_ORDER = { ultra: 3, rare: 2, common: 1 }

const RARITY_THEME = {
  common: {
    label: 'Support Sprite',
    color: '#7c8cff',
    glow: 'rgba(124, 140, 255, 0.55)',
    beam: 'rgba(132, 210, 255, 0.85)',
    orbit: 6.2,
    rotate: 0.7,
    fireRate: 1.2,
    damage: 1,
    bonusShield: 0
  },
  rare: {
    label: 'Aegis Wisp',
    color: '#70f0ff',
    glow: 'rgba(112, 245, 255, 0.65)',
    beam: 'rgba(112, 245, 255, 0.95)',
    orbit: 6.8,
    rotate: 0.95,
    fireRate: 0.78,
    damage: 1.7,
    bonusShield: 0
  },
  ultra: {
    label: 'Celestial Relic',
    color: '#ffe37a',
    glow: 'rgba(255, 227, 122, 0.72)',
    beam: 'rgba(255, 215, 140, 0.95)',
    orbit: 7.4,
    rotate: 1.18,
    fireRate: 0.52,
    damage: 2.6,
    bonusShield: 1
  }
}

const FALLBACK_LOADOUT = [
  { id: 'training-drone', name: 'Training Drone', rarity: 'common', obtained_at: new Date().toISOString() }
]

const CAMERA = {
  x: 0,
  y: -6,
  z: -28,
  pitch: 0.28,
  fov: 680
}

function projectPoint(point, width, height) {
  const dx = point.x - CAMERA.x
  const dy = point.y - CAMERA.y
  const dz = point.z - CAMERA.z
  const cos = Math.cos(CAMERA.pitch)
  const sin = Math.sin(CAMERA.pitch)
  const ry = dy * cos - dz * sin
  const rz = dy * sin + dz * cos
  if (rz <= 4) return null
  const scale = CAMERA.fov / (CAMERA.fov + rz)
  const x2d = width / 2 + dx * scale
  const y2d = height / 2 - ry * scale
  return { x: x2d, y: y2d, scale, depth: rz }
}

function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val))
}

function createGameEngine(canvas, loadout, callbacks) {
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true

  const dpr = window.devicePixelRatio || 1
  const state = {
    width: canvas.clientWidth || window.innerWidth,
    height: canvas.clientHeight || window.innerHeight,
    running: false,
    lastTime: performance.now(),
    pointer: 0,
    pointerTarget: 0,
    pointerDown: false,
    input: { left: false, right: false },
    time: 0,
    difficulty: 1,
    score: 0,
    lastScoreSent: 0,
    lives: 3,
    shields: 0,
    spawnTimer: 1.2,
    shardTimer: 5,
    hitFlash: 0,
    parallax: 0,
    player: { x: 0, y: 0, z: 0 },
    companions: [],
    projectiles: [],
    obstacles: [],
    shards: [],
    stars: []
  }

  function resize() {
    state.width = canvas.clientWidth || window.innerWidth
    state.height = canvas.clientHeight || window.innerHeight
    canvas.width = Math.floor(state.width * dpr)
    canvas.height = Math.floor(state.height * dpr)
    ctx.resetTransform?.()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  resize()

  function setupStars() {
    state.stars = Array.from({ length: 220 }, () => ({
      x: (Math.random() * 2 - 1) * 40,
      y: (Math.random() * 2 - 1) * 16 + 6,
      z: Math.random() * 120 + 12,
      speed: Math.random() * 12 + 18,
      twinkle: Math.random() * Math.PI * 2
    }))
  }

  function setupCompanions() {
    const themes = loadout.length ? loadout : FALLBACK_LOADOUT
    const total = themes.length
    state.companions = themes.map((item, idx) => {
      const theme = RARITY_THEME[item.rarity] || RARITY_THEME.common
      return {
        item,
        theme,
        angle: (idx / total) * Math.PI * 2,
        radius: theme.orbit,
        fireCooldown: theme.fireRate * (0.35 + Math.random() * 0.65),
        rotationSpeed: theme.rotate * (0.85 + Math.random() * 0.3),
        pulse: Math.random() * Math.PI * 2,
        world: { x: 0, y: 0, z: 0 }
      }
    })

    const rareCount = state.companions.filter(c => c.item.rarity === 'rare').length
    const ultraCount = state.companions.filter(c => c.item.rarity === 'ultra').length
    state.lives = 3 + Math.floor(rareCount / 2)
    state.shields = state.companions.reduce((sum, c) => sum + (c.theme.bonusShield || 0), 0)
    callbacks.updateLives(state.lives)
    callbacks.updateShields(state.shields)
  }

  function resetGame() {
    state.running = true
    state.time = 0
    state.difficulty = 1
    state.score = 0
    state.lastScoreSent = 0
    state.spawnTimer = 1.1
    state.hitFlash = 0
    state.parallax = 0
    state.pointer = 0
    state.pointerTarget = 0
    state.player = { x: 0, y: 0, z: 0 }
    state.projectiles = []
    state.obstacles = []
    state.shards = []
    setupCompanions()
    callbacks.updateScore(0)
  }

  setupStars()
  setupCompanions()

  function spawnObstacle() {
    const spread = 13.5
    const depth = 70 + Math.random() * 70
    const size = 3.6 + Math.random() * 2.8
    const hue = 210 + Math.random() * 30
    state.obstacles.push({
      x: (Math.random() * 2 - 1) * spread,
      y: Math.random() * 6 - 1,
      z: depth,
      size,
      speed: 16 + state.difficulty * 2.6 + Math.random() * 4,
      hp: 1 + Math.round(Math.random() + state.difficulty * 0.6),
      hue,
      flicker: Math.random() * Math.PI * 2,
      exploded: false
    })
    const baseInterval = 1.05 / (1 + state.difficulty * 0.08)
    state.spawnTimer = baseInterval + Math.random() * 0.4
  }

  function spawnShard(origin) {
    state.shards.push({
      x: origin.x + (Math.random() * 2 - 1) * 3,
      y: origin.y + Math.random() * 2 + 1,
      z: origin.z + Math.random() * 6,
      vy: 6 + Math.random() * 4,
      life: 4 + Math.random() * 2,
      pulse: Math.random() * Math.PI * 2
    })
  }

  function fireProjectile(companion) {
    const { world } = companion
    const theme = companion.theme
    state.projectiles.push({
      x: world.x,
      y: world.y,
      z: world.z,
      vx: Math.sin(companion.angle * 1.2) * 6,
      vy: Math.cos(companion.angle * 1.6) * 3,
      vz: 42 + theme.damage * 6,
      radius: 0.9 + theme.damage * 0.3,
      damage: theme.damage,
      life: 3.6,
      color: theme.beam,
      baseColor: theme.color
    })
  }

  function updateCompanions(dt) {
    const player = state.player
    state.companions.forEach((comp, idx) => {
      comp.angle += comp.rotationSpeed * dt
      comp.pulse += dt * 3.4
      const hover = Math.sin(comp.angle * 1.4 + comp.pulse) * 0.6
      const drift = Math.sin(state.time * 0.6 + idx) * 0.8
      const radius = comp.radius + drift
      comp.world.x = player.x + Math.cos(comp.angle) * radius
      comp.world.y = 1.4 + hover + Math.sin(state.time * 1.2 + idx) * 0.4
      comp.world.z = 6 + Math.sin(comp.angle * 0.8) * 3
      comp.fireCooldown -= dt
      if (comp.fireCooldown <= 0) {
        fireProjectile(comp)
        comp.fireCooldown = comp.theme.fireRate * (0.4 + Math.random() * 0.6)
      }
    })
  }

  function updateProjectiles(dt) {
    for (let i = state.projectiles.length - 1; i >= 0; i--) {
      const p = state.projectiles[i]
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
      p.life -= dt
      if (p.z > 160 || p.life <= 0) {
        state.projectiles.splice(i, 1)
        continue
      }
      for (let j = state.obstacles.length - 1; j >= 0; j--) {
        const o = state.obstacles[j]
        const dx = p.x - o.x
        const dy = p.y - o.y
        const dz = p.z - o.z
        const distSq = dx * dx + dy * dy + dz * dz
        const hitRange = (o.size + p.radius) * 0.9
        if (distSq < hitRange * hitRange) {
          o.hp -= p.damage
          p.life = 0
          state.score += 32 + state.difficulty * 9 + p.damage * 4
          callbacks.updateScore(Math.floor(state.score))
          if (o.hp <= 0 && !o.exploded) {
            o.exploded = true
            callbacks.announce('Enemy shattered! +bonus score')
            state.score += 55 + state.difficulty * 12
            callbacks.updateScore(Math.floor(state.score))
            for (let s = 0; s < 3; s++) spawnShard(o)
            state.obstacles.splice(j, 1)
          }
          break
        }
      }
    }
  }

  function updateObstacles(dt) {
    for (let i = state.obstacles.length - 1; i >= 0; i--) {
      const o = state.obstacles[i]
      o.z -= o.speed * dt
      o.y += Math.sin(state.time * 1.4 + o.flicker) * dt * 2
      o.flicker += dt * 5
      if (o.z < -12) {
        state.obstacles.splice(i, 1)
        continue
      }
      const dx = o.x - state.player.x
      const dy = o.y - (state.player.y + 1)
      const dz = o.z - state.player.z
      const distSq = dx * dx + dy * dy + dz * dz
      const collisionRadius = (o.size + 2.3)
      if (distSq < collisionRadius * collisionRadius) {
        state.obstacles.splice(i, 1)
        if (state.shields > 0) {
          state.shields -= 1
          callbacks.updateShields(state.shields)
          callbacks.announce('Celestial shield absorbed the impact!')
        } else {
          state.lives -= 1
          callbacks.updateLives(state.lives)
          callbacks.announce('Hull integrity damaged!')
          state.hitFlash = 0.6
          if (state.lives <= 0) {
            endGame()
          }
        }
      }
    }
  }

  function updateShards(dt) {
    for (let i = state.shards.length - 1; i >= 0; i--) {
      const shard = state.shards[i]
      shard.z -= 16 * dt
      shard.y += shard.vy * dt
      shard.life -= dt
      if (shard.life <= 0 || shard.z < 0) {
        state.shards.splice(i, 1)
        continue
      }
      const dx = shard.x - state.player.x
      const dy = shard.y - state.player.y
      const dz = shard.z - state.player.z
      const distSq = dx * dx + dy * dy + dz * dz
      if (distSq < 16) {
        state.shards.splice(i, 1)
        state.score += 25
        callbacks.updateScore(Math.floor(state.score))
        callbacks.announce('Chrono shard secured! +25 score')
      }
    }
  }

  function updateStars(dt) {
    const worldSpeed = 26 + state.difficulty * 3
    state.stars.forEach(star => {
      star.z -= (worldSpeed + star.speed) * dt
      star.twinkle += dt * 2.1
      if (star.z < 6) {
        star.z += 120
        star.x = (Math.random() * 2 - 1) * 38
        star.y = (Math.random() * 2 - 1) * 16 + 6
      }
    })
    state.parallax += dt * worldSpeed * 0.12
  }

  function announceRareMoments(dt) {
    state.shardTimer -= dt
    if (state.shardTimer <= 0) {
      if (state.obstacles.length > 0) {
        const focus = state.obstacles[state.obstacles.length - 1]
        spawnShard({ x: focus.x, y: focus.y + focus.size, z: focus.z + 8 })
      }
      state.shardTimer = 4.5 + Math.random() * 3
    }
  }

  function updatePlayer(dt) {
    const inputDir = (state.input.right ? 1 : 0) - (state.input.left ? 1 : 0)
    state.pointerTarget += inputDir * dt * 1.2
    state.pointerTarget = clamp(state.pointerTarget, -1.3, 1.3)
    state.pointer += (state.pointerTarget - state.pointer) * Math.min(1, dt * 6)
    state.player.x = state.pointer * 11
    state.player.y = Math.sin(state.time * 1.5) * 0.6
  }

  function endGame() {
    state.running = false
    callbacks.onGameOver(Math.floor(state.score))
  }

  function drawBackground() {
    const { width, height } = state
    const grd = ctx.createLinearGradient(0, 0, 0, height)
    grd.addColorStop(0, '#050713')
    grd.addColorStop(0.45, '#090d1f')
    grd.addColorStop(1, '#0b1129')
    ctx.fillStyle = grd
    ctx.fillRect(0, 0, width, height)

    ctx.save()
    ctx.globalAlpha = 0.25
    ctx.translate(width / 2, height / 2 + 120)
    ctx.rotate(-Math.PI / 10)
    const spacing = 140
    for (let i = -3; i < 5; i++) {
      const y = ((state.parallax + i * spacing) % (spacing * 4)) - spacing * 2
      ctx.fillStyle = 'rgba(50, 82, 145, 0.18)'
      ctx.fillRect(-520, y, 1040, 6)
    }
    ctx.restore()
  }

  function drawStars() {
    const sprites = []
    state.stars.forEach(star => {
      const proj = projectPoint(star, state.width, state.height)
      if (!proj) return
      const radius = proj.scale * 1.4
      sprites.push({
        type: 'star',
        x: proj.x,
        y: proj.y,
        radius,
        alpha: 0.45 + Math.sin(star.twinkle) * 0.3,
        depth: proj.depth
      })
    })
    sprites.sort((a, b) => b.depth - a.depth)
    sprites.forEach(star => {
      ctx.globalAlpha = clamp(star.alpha, 0.15, 0.8)
      ctx.fillStyle = '#9fb9ff'
      ctx.beginPath()
      ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2)
      ctx.fill()
    })
    ctx.globalAlpha = 1
  }

  function drawProjectiles(queue) {
    const sorted = [...queue].sort((a, b) => a.z - b.z)
    sorted.forEach(p => {
      const proj = projectPoint(p, state.width, state.height)
      if (!proj) return
      const pulse = 0.85 + Math.sin(state.time * 8 + p.z * 0.25) * 0.15
      const r = Math.max(2, proj.scale * 10 * pulse)
      const gradient = ctx.createRadialGradient(proj.x, proj.y, 0, proj.x, proj.y, r)
      gradient.addColorStop(0, p.baseColor)
      gradient.addColorStop(0.5, p.color)
      gradient.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(proj.x, proj.y, r, 0, Math.PI * 2)
      ctx.fill()
    })
  }

  function drawObstacles(queue) {
    const sorted = [...queue].sort((a, b) => b.z - a.z)
    sorted.forEach(o => {
      const proj = projectPoint(o, state.width, state.height)
      if (!proj) return
      const size = proj.scale * o.size * 9
      const angle = (state.time * 1.2 + o.flicker) % (Math.PI * 2)
      const sides = 6
      ctx.save()
      ctx.translate(proj.x, proj.y)
      ctx.rotate(angle)
      const gradient = ctx.createLinearGradient(-size, -size, size, size)
      gradient.addColorStop(0, `hsla(${o.hue}, 70%, 36%, 0.85)`)
      gradient.addColorStop(0.4, `hsla(${o.hue + 10}, 80%, 54%, 0.75)`)
      gradient.addColorStop(1, 'rgba(10, 14, 28, 0.95)')
      ctx.fillStyle = gradient
      ctx.beginPath()
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2
        const px = Math.cos(a) * size
        const py = Math.sin(a) * size
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    })
  }

  function drawCompanions(queue) {
    queue.forEach(c => {
      const proj = projectPoint(c.world, state.width, state.height)
      if (!proj) return
      const r = Math.max(4, proj.scale * 12)
      const glow = ctx.createRadialGradient(proj.x, proj.y, 0, proj.x, proj.y, r * 1.6)
      glow.addColorStop(0, c.theme.color)
      glow.addColorStop(0.65, c.theme.glow)
      glow.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = glow
      ctx.globalAlpha = 0.9
      ctx.beginPath()
      ctx.arc(proj.x, proj.y, r * 1.6, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.fillStyle = '#0a0f1f'
      ctx.beginPath()
      ctx.arc(proj.x, proj.y, r * 0.55, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = c.theme.color
      ctx.lineWidth = Math.max(1.2, proj.scale * 2)
      ctx.beginPath()
      ctx.arc(proj.x, proj.y, r * 0.7, 0, Math.PI * 2)
      ctx.stroke()
    })
  }

  function drawPlayer() {
    const proj = projectPoint({ x: state.player.x, y: state.player.y, z: state.player.z }, state.width, state.height)
    if (!proj) return
    const body = Math.max(12, proj.scale * 26)
    const wing = body * 1.4
    ctx.save()
    ctx.translate(proj.x, proj.y)
    ctx.rotate(Math.sin(state.time * 2) * 0.05)
    const hullGradient = ctx.createLinearGradient(-body, -body, body, body)
    hullGradient.addColorStop(0, '#1b2b4a')
    hullGradient.addColorStop(0.4, '#3d68ff')
    hullGradient.addColorStop(1, '#1b2b4a')
    ctx.fillStyle = hullGradient
    ctx.beginPath()
    ctx.moveTo(0, -body * 0.9)
    ctx.lineTo(wing * 0.6, body)
    ctx.lineTo(0, body * 0.55)
    ctx.lineTo(-wing * 0.6, body)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#9ed1ff'
    ctx.beginPath()
    ctx.arc(0, -body * 0.3, body * 0.4, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    if (state.hitFlash > 0) {
      ctx.globalAlpha = clamp(state.hitFlash, 0, 0.5)
      ctx.fillStyle = 'rgba(255, 86, 104, 0.45)'
      ctx.beginPath()
      ctx.arc(proj.x, proj.y, body * 2.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
    }
  }

  function drawShards(queue) {
    queue.forEach(shard => {
      const proj = projectPoint(shard, state.width, state.height)
      if (!proj) return
      const size = Math.max(3, proj.scale * 10)
      ctx.save()
      ctx.translate(proj.x, proj.y)
      ctx.rotate(shard.pulse)
      const gradient = ctx.createLinearGradient(-size, -size, size, size)
      gradient.addColorStop(0, 'rgba(120, 240, 255, 0.9)')
      gradient.addColorStop(1, 'rgba(40, 120, 255, 0.1)')
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.moveTo(0, -size)
      ctx.lineTo(size * 0.6, size)
      ctx.lineTo(-size * 0.6, size)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    })
  }

  function render() {
    drawBackground()
    drawStars()
    drawShards(state.shards)
    drawObstacles(state.obstacles)
    drawProjectiles(state.projectiles)
    drawCompanions(state.companions)
    drawPlayer()
  }

  function update(dt) {
    state.time += dt
    updatePlayer(dt)
    if (state.running) {
      state.score += dt * (18 + state.difficulty * 4)
      if (Math.floor(state.score) !== state.lastScoreSent) {
        state.lastScoreSent = Math.floor(state.score)
        callbacks.updateScore(state.lastScoreSent)
      }
      state.difficulty += dt * 0.09
      state.spawnTimer -= dt
      if (state.spawnTimer <= 0) spawnObstacle()
      state.hitFlash = Math.max(0, state.hitFlash - dt * 1.6)
      updateCompanions(dt)
      updateProjectiles(dt)
      updateObstacles(dt)
      updateShards(dt)
      announceRareMoments(dt)
    } else {
      updateCompanions(dt * 0.6)
    }
    updateStars(dt)
    render()
  }

  let frame = null
  function loop(now) {
    const dt = Math.min((now - state.lastTime) / 1000, 0.12)
    state.lastTime = now
    update(dt)
    frame = requestAnimationFrame(loop)
  }

  frame = requestAnimationFrame(loop)

  function onPointerMove(event) {
    const rect = canvas.getBoundingClientRect()
    const ratio = (event.clientX - rect.left) / rect.width
    state.pointerTarget = clamp(ratio * 2 - 1, -1.2, 1.2)
  }

  function onPointerDown(event) {
    state.pointerDown = true
    onPointerMove(event)
  }

  function onPointerUp() {
    state.pointerDown = false
  }

  function onKeyDown(event) {
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') state.input.left = true
    if (event.code === 'ArrowRight' || event.code === 'KeyD') state.input.right = true
  }

  function onKeyUp(event) {
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') state.input.left = false
    if (event.code === 'ArrowRight' || event.code === 'KeyD') state.input.right = false
  }

  window.addEventListener('resize', resize)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)

  return {
    start() {
      resetGame()
    },
    stop() {
      state.running = false
    },
    dispose() {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }
}

export default function StarfallGame({ items, onClose }) {
  const canvasRef = useRef(null)
  const engineRef = useRef(null)
  const [phase, setPhase] = useState('intro')
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(() => {
    const stored = localStorage.getItem('starfall_trials_best')
    return stored ? parseInt(stored, 10) || 0 : 0
  })
  const [lives, setLives] = useState(0)
  const [shields, setShields] = useState(0)
  const [announcement, setAnnouncement] = useState('')

  const loadout = useMemo(() => {
    if (!items || items.length === 0) return FALLBACK_LOADOUT
    const sorted = [...items].sort((a, b) => {
      const rarityDiff = (RARITY_ORDER[b.rarity] || 0) - (RARITY_ORDER[a.rarity] || 0)
      if (rarityDiff !== 0) return rarityDiff
      return new Date(a.obtained_at).getTime() - new Date(b.obtained_at).getTime()
    })
    return sorted.slice(0, 12)
  }, [items])

  useEffect(() => {
    if (!canvasRef.current) return
    const engine = createGameEngine(canvasRef.current, loadout, {
      updateScore: val => setScore(val),
      updateLives: val => setLives(val),
      updateShields: val => setShields(val),
      announce: msg => {
        if (!msg) return
        setAnnouncement(msg)
      },
      onGameOver: finalScore => {
        setPhase('gameover')
        setBest(prev => {
          if (finalScore > prev) {
            localStorage.setItem('starfall_trials_best', String(finalScore))
            setAnnouncement('New sector record!')
            return finalScore
          }
          return prev
        })
      }
    })
    engineRef.current = engine
    setScore(0)
    setAnnouncement('')
    setPhase('intro')
    return () => {
      engine.dispose()
      engineRef.current = null
    }
  }, [loadout])

  useEffect(() => {
    if (!announcement) return
    const timer = setTimeout(() => setAnnouncement(''), 2600)
    return () => clearTimeout(timer)
  }, [announcement])

  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    if (phase === 'playing') {
      engine.start()
    } else {
      engine.stop()
    }
  }, [phase])

  const rarityCounts = useMemo(() => {
    return loadout.reduce(
      (acc, item) => {
        acc[item.rarity] = (acc[item.rarity] || 0) + 1
        return acc
      },
      { common: 0, rare: 0, ultra: 0 }
    )
  }, [loadout])

  return (
    <div className="game-overlay">
      <canvas ref={canvasRef} className="game-canvas" />
      <div className="game-hud">
        <div className="hud-left">
          <div className="hud-title">Starfall Trials</div>
          <div className="hud-sub">Score <span>{score.toLocaleString()}</span></div>
          <div className="hud-sub">Best <span>{best.toLocaleString()}</span></div>
        </div>
        <div className="hud-right">
          <div className="hud-badge">Lives: {lives}</div>
          <div className="hud-badge">Shields: {shields}</div>
        </div>
      </div>
      <button className="game-close" onClick={onClose}>Exit</button>
      {announcement ? <div className="game-announcement">{announcement}</div> : null}
      <div className="game-loadout">
        <h4>Your Resonance Squad</h4>
        <ul>
          {loadout.map(item => {
            const theme = RARITY_THEME[item.rarity] || RARITY_THEME.common
            return (
              <li key={item.id}>
                <span className={`rarity-${item.rarity}`}>{item.name}</span>
                <span style={{ color: theme.color }}>{theme.label}</span>
              </li>
            )
          })}
        </ul>
        <div className="game-loadout-summary">
          <span>Companions: {loadout.length}</span>
          <span>★: {rarityCounts.common}</span>
          <span>★★: {rarityCounts.rare}</span>
          <span>★★★: {rarityCounts.ultra}</span>
        </div>
      </div>
      {phase !== 'playing' ? (
        <div className="game-modal">
          {phase === 'intro' ? (
            <>
              <h2>Starfall Trials</h2>
              <p>Use your gacha roster to pilot a starfighter through a storm of crystalline constructs. Each summon becomes a companion drone that defends you.</p>
              <ul>
                <li>Move with <b>mouse</b> or <b>A / D</b> keys</li>
                <li>Companions fire automatically. Rarer summons shoot faster and hit harder.</li>
                <li>Celestial relics add shield charges that block collisions.</li>
                <li>Collect chrono shards for bonus score.</li>
              </ul>
              <button className="btn" onClick={() => setPhase('playing')}>Launch</button>
            </>
          ) : (
            <>
              <h2>Run Complete</h2>
              <p>Your score: <b>{score.toLocaleString()}</b></p>
              <p>Best score: <b>{best.toLocaleString()}</b></p>
              <div className="stack" style={{ marginTop: '16px' }}>
                <button className="btn" onClick={() => setPhase('playing')}>Play again</button>
                <button className="btn secondary" onClick={onClose}>Back to lobby</button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
