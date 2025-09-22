import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Html, OrbitControls } from '@react-three/drei'

const RARITY_TRAITS = {
  common: {
    color: '#6aa0ff',
    beamColor: '#80b8ff',
    range: 6.8,
    damage: 12,
    fireRate: 0.9,
    label: 'Common'
  },
  rare: {
    color: '#7cffec',
    beamColor: '#6affd6',
    range: 8.2,
    damage: 18,
    fireRate: 1.15,
    label: 'Rare'
  },
  ultra: {
    color: '#ffe174',
    beamColor: '#ffce6a',
    range: 10.5,
    damage: 26,
    fireRate: 1.35,
    label: 'Ultra'
  }
}

const ENEMY_COLORS = ['#ff8b66', '#ffb366', '#66d1ff', '#ffa1c6']
const BASE_LIVES = 5

function buildUnits(items) {
  if (!Array.isArray(items) || items.length === 0) return []
  const radius = 6.5 + Math.min(items.length, 16) * 0.08
  return items.map((item, idx) => {
    const rarity = item.rarity || 'common'
    const traits = RARITY_TRAITS[rarity] || RARITY_TRAITS.common
    const angle = (idx / items.length) * Math.PI * 2
    const position = [
      Math.cos(angle) * radius,
      0,
      Math.sin(angle) * radius
    ]
    return {
      key: item.id || `${item.name}-${idx}`,
      name: item.name,
      rarity,
      range: traits.range,
      damage: traits.damage,
      fireRate: traits.fireRate,
      cooldown: 1 / traits.fireRate,
      color: traits.color,
      beamColor: traits.beamColor,
      label: traits.label,
      position,
      height: 1.2
    }
  })
}

function spawnEnemy({ logic, stats, enemies }) {
  const radius = 14 + Math.random() * 4
  const angle = Math.random() * Math.PI * 2
  const x = Math.cos(angle) * radius
  const z = Math.sin(angle) * radius
  const speed = 1 + stats.wave * 0.15 + Math.random() * 0.35
  const distance = Math.sqrt(x * x + z * z) || 1
  const vx = (-x / distance) * speed
  const vz = (-z / distance) * speed
  const maxHp = 28 + stats.wave * 8 + Math.random() * 14
  enemies.push({
    id: logic.enemyId++,
    position: { x, y: 0.9, z },
    velocity: { x: vx, y: 0, z: vz },
    hp: maxHp,
    maxHp,
    spin: Math.random() * Math.PI * 2,
    value: Math.round(18 + maxHp * 0.6),
    color: ENEMY_COLORS[(stats.wave - 1) % ENEMY_COLORS.length]
  })
}

function GameLoop({ units, logicRef, enemiesRef, shotsRef, statsRef, running, onGameOver, gameOverRef }) {
  useFrame((_, delta) => {
    if (!running || !logicRef.current) return
    const logic = logicRef.current
    const stats = statsRef.current
    const enemies = enemiesRef.current

    logic.spawnTimer -= delta
    const intervalBase = Math.max(0.65, logic.spawnInterval * (0.86 + Math.random() * 0.28))
    while (logic.spawnTimer <= 0) {
      spawnEnemy({ logic, stats, enemies })
      logic.spawnTimer += intervalBase
    }

    const moved = []
    let livesLost = 0
    enemies.forEach(enemy => {
      enemy.position.x += enemy.velocity.x * delta
      enemy.position.z += enemy.velocity.z * delta
      enemy.spin += delta * 1.2
      const distToCrystal = Math.sqrt(enemy.position.x ** 2 + enemy.position.z ** 2)
      if (distToCrystal <= 1.35) {
        livesLost += 1
      } else {
        moved.push(enemy)
      }
    })
    enemiesRef.current = moved

    if (livesLost > 0) {
      stats.lives = Math.max(0, stats.lives - livesLost)
      if (stats.lives <= 0 && !gameOverRef.current) {
        gameOverRef.current = true
        onGameOver?.()
        return
      }
    }

    const newShots = []
    logic.turrets.forEach((turret, idx) => {
      turret.cooldown = Math.max(0, turret.cooldown - delta)
      if (turret.cooldown > 0) return
      const unit = units[idx]
      if (!unit) return
      let target = null
      let bestDist = Infinity
      enemiesRef.current.forEach(enemy => {
        const dx = enemy.position.x - unit.position[0]
        const dz = enemy.position.z - unit.position[2]
        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist <= unit.range && dist < bestDist) {
          bestDist = dist
          target = enemy
        }
      })
      if (target) {
        target.hp -= unit.damage
        turret.cooldown = unit.cooldown
        newShots.push({
          id: logic.shotId++,
          from: { x: unit.position[0], y: unit.height, z: unit.position[2] },
          to: { x: target.position.x, y: 0.8, z: target.position.z },
          ttl: 0.22,
          maxTtl: 0.22,
          color: unit.beamColor
        })
      }
    })

    if (newShots.length) {
      shotsRef.current = [...shotsRef.current, ...newShots]
    }

    const survivors = []
    let defeatedNow = 0
    enemiesRef.current.forEach(enemy => {
      if (enemy.hp <= 0) {
        defeatedNow += 1
        stats.score += enemy.value
      } else {
        survivors.push(enemy)
      }
    })
    enemiesRef.current = survivors
    stats.totalDefeated += defeatedNow

    if (stats.totalDefeated >= logic.nextWaveAt) {
      stats.wave += 1
      logic.nextWaveAt += 6 + stats.wave * 2
      logic.spawnInterval = Math.max(0.55, logic.spawnInterval * 0.9)
    }

    const activeShots = []
    shotsRef.current.forEach(shot => {
      shot.ttl -= delta
      if (shot.ttl > 0) activeShots.push(shot)
    })
    shotsRef.current = activeShots
  })
  return null
}

function ArenaFloor() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[16, 48]} />
        <meshStandardMaterial color="#111521" metalness={0.2} roughness={0.8} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[1.4, 1.7, 48]} />
        <meshStandardMaterial color="#6aa0ff" emissive="#3760ff" emissiveIntensity={0.5} />
      </mesh>
      <mesh castShadow position={[0, 1.1, 0]}>
        <octahedronGeometry args={[0.7, 0]} />
        <meshStandardMaterial color="#9e6aff" emissive="#c49bff" emissiveIntensity={0.8} metalness={0.5} roughness={0.35} />
      </mesh>
    </group>
  )
}

function Turret({ unit }) {
  const headRef = useRef(null)
  useFrame((_, delta) => {
    if (headRef.current) {
      headRef.current.rotation.y += delta * 0.8
    }
  })
  return (
    <group position={unit.position}>
      <mesh castShadow receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.45, 0.65, 0.6, 16]} />
        <meshStandardMaterial color="#1c2335" metalness={0.3} roughness={0.6} />
      </mesh>
      <mesh ref={headRef} castShadow position={[0, 0.65, 0]}>
        <coneGeometry args={[0.5, 1.1, 6]} />
        <meshStandardMaterial color={unit.color} emissive={unit.color} emissiveIntensity={0.6} metalness={0.4} roughness={0.4} />
      </mesh>
      <Html distanceFactor={12} position={[0, 1.6, 0]} center>
        <div className={`turret-label rarity-${unit.rarity}`}>
          <strong>{unit.name}</strong>
          <span>{unit.label} • Range {unit.range.toFixed(1)}</span>
        </div>
      </Html>
    </group>
  )
}

function Enemy({ enemy }) {
  const ref = useRef(null)
  useFrame(() => {
    if (!ref.current) return
    ref.current.position.set(enemy.position.x, enemy.position.y, enemy.position.z)
    ref.current.rotation.y = enemy.spin
  })
  const hpRatio = Math.max(0, Math.min(1, enemy.hp / enemy.maxHp))
  return (
    <group>
      <mesh ref={ref} castShadow position={[enemy.position.x, enemy.position.y, enemy.position.z]}>
        <icosahedronGeometry args={[0.7, 0]} />
        <meshStandardMaterial color={enemy.color} emissive={enemy.color} emissiveIntensity={0.4} metalness={0.2} roughness={0.5} />
      </mesh>
      <Html position={[enemy.position.x, enemy.position.y + 1, enemy.position.z]} center distanceFactor={16}>
        <div className="enemy-bar">
          <div style={{ width: `${hpRatio * 100}%` }} />
        </div>
      </Html>
    </group>
  )
}

function ShotBeam({ shot }) {
  const ref = useRef(null)
  useFrame(() => {
    if (!ref.current) return
    const { from, to } = shot
    const dx = to.x - from.x
    const dy = to.y - from.y
    const dz = to.z - from.z
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.001
    ref.current.position.set(from.x + dx / 2, from.y + dy / 2, from.z + dz / 2)
    ref.current.lookAt(to.x, to.y, to.z)
    ref.current.scale.set(1, dist, 1)
    ref.current.material.opacity = Math.max(0, shot.ttl / shot.maxTtl)
  })
  return (
    <mesh ref={ref} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[0.05, 0.05, 1, 6]} />
      <meshStandardMaterial color={shot.color} emissive={shot.color} emissiveIntensity={0.9} transparent opacity={0.8} />
    </mesh>
  )
}

function initialStats() {
  return { score: 0, lives: BASE_LIVES, wave: 1, totalDefeated: 0 }
}

function initialLogic(units) {
  return {
    running: false,
    spawnInterval: 2.6,
    spawnTimer: 2.6,
    nextWaveAt: 8,
    enemyId: 1,
    shotId: 1,
    turrets: units.map(() => ({ cooldown: 0 }))
  }
}

export default function GachaGame({ items }) {
  const units = useMemo(() => buildUnits(items), [items])
  const enemiesRef = useRef([])
  const shotsRef = useRef([])
  const statsRef = useRef(initialStats())
  const logicRef = useRef(initialLogic(units))
  const gameOverRef = useRef(false)

  const [snapshot, setSnapshot] = useState({
    enemies: [],
    shots: [],
    stats: initialStats(),
    running: false
  })
  const [running, setRunning] = useState(false)
  const [gameOver, setGameOver] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const resetGame = useCallback(() => {
    enemiesRef.current = []
    shotsRef.current = []
    const stats = initialStats()
    statsRef.current = stats
    logicRef.current = initialLogic(units)
    gameOverRef.current = false
    setRunning(false)
    setGameOver(false)
    setSnapshot({ enemies: [], shots: [], stats, running: false })
  }, [units])

  useEffect(() => { resetGame() }, [resetGame])

  useEffect(() => {
    const id = setInterval(() => {
      setSnapshot({
        enemies: [...enemiesRef.current],
        shots: [...shotsRef.current],
        stats: { ...statsRef.current },
        running: logicRef.current?.running ?? false
      })
    }, 120)
    return () => clearInterval(id)
  }, [])

  const startGame = useCallback(() => {
    if (!units.length) return
    logicRef.current.running = true
    logicRef.current.spawnTimer = Math.min(logicRef.current.spawnTimer, logicRef.current.spawnInterval)
    gameOverRef.current = false
    setGameOver(false)
    setRunning(true)
  }, [units])

  const pauseGame = useCallback(() => {
    logicRef.current.running = false
    setRunning(false)
  }, [])

  const handleGameOver = useCallback(() => {
    logicRef.current.running = false
    setRunning(false)
    setGameOver(true)
  }, [])

  const stats = snapshot.stats

  useEffect(() => {
    if (!expanded) return undefined
    if (typeof document === 'undefined') return undefined
    const { style } = document.body
    const previous = style.overflow
    style.overflow = 'hidden'
    return () => {
      style.overflow = previous
    }
  }, [expanded])

  useEffect(() => {
    if (!expanded) return undefined
    const handler = event => {
      if (event.key === 'Escape') {
        setExpanded(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [expanded])

  return (
    <>
      {expanded ? <div className="game-expand-backdrop" onClick={() => setExpanded(false)} aria-hidden="true" /> : null}
      <div className={`card game-card ${expanded ? 'is-expanded' : ''}`}>
        <div className="row">
          <h3>Crystal Siege 3D</h3>
          <div className="spacer" />
          <div className="row game-buttons">
            <button
              className="btn secondary"
              onClick={() => setExpanded(prev => !prev)}
            >
              {expanded ? 'Close Expanded View' : 'Expand Arena'}
            </button>
            <button className="btn secondary" onClick={resetGame}>Reset</button>
            {running ? (
              <button className="btn secondary" onClick={pauseGame}>Pause</button>
            ) : (
              <button className="btn" onClick={startGame} disabled={!units.length}>
                {gameOver ? 'Restart' : 'Start Battle'}
              </button>
            )}
          </div>
        </div>
        <p className="muted">
          Deploy your pulls as arcane turrets to guard the central crystal. Each rarity boosts range, damage, and fire rate. Survive as long as you can!
        </p>
        <div className="arena-wrapper">
          {units.length ? (
            <>
              <Canvas className="arena-canvas" shadows camera={{ position: [0, 10, 18], fov: 50 }}>
                <color attach="background" args={['#04060b']} />
                <ambientLight intensity={0.4} />
                <spotLight position={[0, 16, 6]} angle={0.6} penumbra={0.35} intensity={1.5} castShadow />
                <pointLight position={[0, 6, -8]} intensity={0.6} />
                <GameLoop
                  units={units}
                  logicRef={logicRef}
                  enemiesRef={enemiesRef}
                  shotsRef={shotsRef}
                  statsRef={statsRef}
                  running={running && logicRef.current?.running}
                  onGameOver={handleGameOver}
                  gameOverRef={gameOverRef}
                />
                <ArenaFloor />
                {units.map(unit => (
                  <Turret key={unit.key} unit={unit} />
                ))}
                {snapshot.enemies.map(enemy => (
                  <Enemy key={enemy.id} enemy={enemy} />
                ))}
                {snapshot.shots.map(shot => (
                  <ShotBeam key={shot.id} shot={shot} />
                ))}
                <OrbitControls enablePan={false} minDistance={9} maxDistance={24} maxPolarAngle={Math.PI / 2.2} />
              </Canvas>
              <div className="arena-hud">
                <div>
                  <div className="hud-title">Wave</div>
                  <div className="hud-value">{stats.wave}</div>
                </div>
                <div>
                  <div className="hud-title">Score</div>
                  <div className="hud-value">{Math.round(stats.score)}</div>
                </div>
                <div>
                  <div className="hud-title">Lives</div>
                  <div className={`hud-value ${stats.lives <= 1 ? 'hud-danger' : ''}`}>{stats.lives}</div>
                </div>
                <div>
                  <div className="hud-title">Units</div>
                  <div className="hud-value">{units.length}</div>
                </div>
              </div>
              {gameOver ? (
                <div className="arena-overlay">
                  <strong>Crystal shattered!</strong>
                  <span>Your score: {Math.round(stats.score)}</span>
                  <span>Press Start to rally again.</span>
                </div>
              ) : null}
            </>
          ) : (
            <div className="arena-empty">
              <div>
                <strong>No defenders yet.</strong>
                <span>Roll on a banner to unlock units for the arena.</span>
              </div>
            </div>
          )}
        </div>
        {units.length ? (
          <div className="unit-grid">
            {units.map(unit => (
              <div key={unit.key} className="unit-card">
                <div className={`unit-title rarity-${unit.rarity}`}>{unit.name}</div>
                <div className="unit-meta">
                  <span>Range {unit.range.toFixed(1)}</span>
                  <span>Damage {unit.damage}</span>
                  <span>Rate {unit.fireRate.toFixed(2)}/s</span>
                </div>
                <div className="muted">{unit.label} rarity bonus active.</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </>
  )
}
