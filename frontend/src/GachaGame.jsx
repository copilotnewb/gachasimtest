import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

const MAX_SHIELDS = 3
const RARITY_COLORS = {
  common: '#6aa0ff',
  rare: '#a855f7',
  ultra: '#fbbf24'
}
const RARITY_LABELS = {
  common: 'Common',
  rare: 'Rare',
  ultra: 'Ultra'
}
const BURST_DURATION = {
  common: 2.6,
  rare: 3.4,
  ultra: 4.6
}
const BURST_RADIUS = {
  common: 3.2,
  rare: 3.8,
  ultra: 4.6
}
const STARTER_RELICS = [
  { id: 'starter-warden', name: 'Aegis Trainee', rarity: 'common' },
  { id: 'starter-strider', name: 'Strider Gauntlet', rarity: 'common' },
  { id: 'starter-medic', name: 'Starlit Medic', rarity: 'rare' },
  { id: 'starter-ranger', name: 'Nebula Ranger', rarity: 'rare' },
  { id: 'starter-flare', name: 'Nova Prototype', rarity: 'ultra' },
  { id: 'starter-orbiter', name: 'Celestial Orbiter', rarity: 'ultra' }
]

function cloneMaterial(material) {
  if (Array.isArray(material)) {
    return material.map(m => m.clone())
  }
  return material.clone()
}

function disposeMaterial(material) {
  if (!material) return
  if (Array.isArray(material)) {
    material.forEach(m => m.dispose())
  } else {
    material.dispose()
  }
}

function shuffle(array) {
  const copy = array.slice()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function buildAbilityDeck(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return STARTER_RELICS.map((card, idx) => ({
      ...card,
      id: `${card.id}-${idx}`,
      fromInventory: false
    }))
  }

  const rarities = ['ultra', 'rare', 'common']
  const grouped = {
    ultra: [],
    rare: [],
    common: []
  }

  items.forEach((item, idx) => {
    const rarity = rarities.includes(item.rarity) ? item.rarity : 'common'
    grouped[rarity].push({
      id: item.id ?? `inv-${rarity}-${idx}`,
      name: item.name ?? `Mystery Relic #${idx + 1}`,
      rarity,
      fromInventory: true
    })
  })

  rarities.forEach(r => {
    grouped[r] = shuffle(grouped[r])
  })

  const longest = Math.max(grouped.ultra.length, grouped.rare.length, grouped.common.length)
  const deck = []
  for (let i = 0; i < longest; i++) {
    rarities.forEach(r => {
      if (grouped[r][i]) deck.push(grouped[r][i])
    })
  }

  if (deck.length < 6) {
    const needed = Math.min(6 - deck.length, STARTER_RELICS.length)
    for (let i = 0; i < needed; i++) {
      const card = STARTER_RELICS[i % STARTER_RELICS.length]
      deck.push({
        ...card,
        id: `${card.id}-loan-${i}`,
        fromInventory: false
      })
    }
  }

  return deck.slice(0, 80)
}

function formatDuration(seconds) {
  if (seconds <= 0) return '0.0s'
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toFixed(0).padStart(2, '0')}s`
}

export default function GachaGame({ items, onClose }) {
  const mountRef = useRef(null)
  const hudThrottleRef = useRef(0)
  const [hud, setHud] = useState({
    score: 0,
    distance: 0,
    hp: MAX_SHIELDS,
    deckRemaining: 0,
    nextItem: null,
    cooldown: 0,
    crystals: 0,
    burstActive: false,
    message: '',
    time: 0
  })
  const [summary, setSummary] = useState(null)
  const [session, setSession] = useState(0)
  const endRunRef = useRef(null)

  const abilityDeck = useMemo(() => buildAbilityDeck(items), [items])

  const createFallbackSummary = () => ({
    score: hud.score,
    distance: hud.distance,
    crystals: hud.crystals,
    hits: MAX_SHIELDS - hud.hp,
    duration: hud.time,
    usedItems: [],
    chargesLeft: hud.deckRemaining,
    reason: 'Run aborted'
  })

  const handleEndRun = () => {
    if (summary) return
    if (typeof endRunRef.current === 'function') {
      endRunRef.current('Run aborted')
    } else {
      setSummary(s => s || createFallbackSummary())
    }
  }

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    setHud(h => ({
      ...h,
      score: 0,
      distance: 0,
      hp: MAX_SHIELDS,
      deckRemaining: abilityDeck.length,
      nextItem: abilityDeck[0] || null,
      cooldown: 0,
      crystals: 0,
      burstActive: false,
      message: '',
      time: 0
    }))
    setSummary(null)
  }, [session])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.shadowMap.enabled = true
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(mount.clientWidth, mount.clientHeight, false)
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x050711)
    scene.fog = new THREE.FogExp2(0x050711, 0.045)

    const camera = new THREE.PerspectiveCamera(60, mount.clientWidth / mount.clientHeight, 0.1, 120)
    camera.position.set(0, 4.5, 8.5)
    camera.lookAt(0, 1.5, 0)

    const ambientLight = new THREE.AmbientLight(0x7080ff, 0.55)
    scene.add(ambientLight)

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.9)
    dirLight.position.set(6, 10, 8)
    dirLight.castShadow = true
    dirLight.shadow.mapSize.set(1024, 1024)
    dirLight.shadow.camera.far = 30
    scene.add(dirLight)

    const rimLight = new THREE.PointLight(0x6aa0ff, 1.6, 60)
    rimLight.position.set(-6, 6, -8)
    scene.add(rimLight)

    const floorGeometry = new THREE.PlaneGeometry(60, 320)
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x10162a,
      metalness: 0.3,
      roughness: 0.8,
      emissive: new THREE.Color(0x080c16),
      emissiveIntensity: 0.35
    })
    const floor = new THREE.Mesh(floorGeometry, floorMaterial)
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    floor.position.y = 0
    scene.add(floor)

    const laneGlowGeometry = new THREE.PlaneGeometry(2, 320, 1, 1)
    const laneGlowMaterial = new THREE.MeshBasicMaterial({
      color: 0x1b5cff,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide
    })
    const laneGlowLeft = new THREE.Mesh(laneGlowGeometry, laneGlowMaterial)
    laneGlowLeft.rotation.x = -Math.PI / 2
    laneGlowLeft.position.set(-2.6, 0.02, -40)
    scene.add(laneGlowLeft)
    const laneGlowRight = new THREE.Mesh(laneGlowGeometry, laneGlowMaterial)
    laneGlowRight.rotation.x = -Math.PI / 2
    laneGlowRight.position.set(2.6, 0.02, -40)
    scene.add(laneGlowRight)

    const starCount = 900
    const starGeometry = new THREE.BufferGeometry()
    const starPositions = new Float32Array(starCount * 3)
    for (let i = 0; i < starCount; i++) {
      starPositions[i * 3] = (Math.random() - 0.5) * 90
      starPositions[i * 3 + 1] = Math.random() * 50 + 10
      starPositions[i * 3 + 2] = (Math.random() - 0.5) * 200
    }
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
    const starMaterial = new THREE.PointsMaterial({
      color: 0x9ab8ff,
      size: 0.16,
      transparent: true,
      opacity: 0.8
    })
    const starField = new THREE.Points(starGeometry, starMaterial)
    starField.position.y = 12
    scene.add(starField)

    const playerGeometry = new THREE.SphereGeometry(0.7, 36, 32)
    const playerMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.2,
      roughness: 0.35,
      emissive: new THREE.Color(0x0b0f1d),
      emissiveIntensity: 0.12
    })
    const player = new THREE.Mesh(playerGeometry, playerMaterial)
    player.castShadow = true
    player.position.set(0, 0.9, 0)
    scene.add(player)

    const novaMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0
    })
    const novaGeometry = new THREE.SphereGeometry(0.5, 24, 24)
    const nova = new THREE.Mesh(novaGeometry, novaMaterial)
    nova.visible = false
    scene.add(nova)

    const deck = abilityDeck.map(card => ({ ...card }))
    const hudState = {
      score: 0,
      distance: 0,
      hp: MAX_SHIELDS,
      deckRemaining: deck.length,
      nextItem: deck[0] || null,
      cooldown: 0,
      crystals: 0,
      burstActive: false,
      message: '',
      time: 0
    }

    const usedItems = []
    let elapsed = 0
    let messageTimer = 0
    let running = true
    let frameId = null
    let burstActive = false
    let burstElapsed = 0
    let burstDuration = 0
    let burstRadius = 0
    let burstColor = new THREE.Color(0xffffff)
    let burstRequest = false

    const clock = new THREE.Clock()
    const keys = { left: false, right: false, up: false, down: false }

    const drones = deck.slice(0, Math.min(6, deck.length)).map((card, idx, arr) => {
      const baseColor = new THREE.Color(RARITY_COLORS[card.rarity] || '#6aa0ff')
      const droneMaterial = new THREE.MeshStandardMaterial({
        color: baseColor,
        emissive: baseColor.clone().multiplyScalar(0.6),
        emissiveIntensity: 0.5,
        roughness: 0.25,
        metalness: 0.65
      })
      const droneGeometry = new THREE.SphereGeometry(0.22 + (card.rarity === 'ultra' ? 0.05 : 0), 20, 18)
      const mesh = new THREE.Mesh(droneGeometry, droneMaterial)
      mesh.castShadow = true
      mesh.userData = {
        angle: (idx / arr.length) * Math.PI * 2,
        speed: 1.2 + idx * 0.15,
        radius: 1.3 + (idx % 3) * 0.35
      }
      scene.add(mesh)
      return mesh
    })

    const obstacleGeometry = new THREE.BoxGeometry(1.2, 1.8, 1.2)
    const baseObstacleMaterial = new THREE.MeshStandardMaterial({
      color: 0x2d3a7a,
      metalness: 0.4,
      roughness: 0.45,
      emissive: new THREE.Color(0x1b2145),
      emissiveIntensity: 0.35
    })
    const obstacles = []
    const obstacleCount = 16
    for (let i = 0; i < obstacleCount; i++) {
      const material = cloneMaterial(baseObstacleMaterial)
      material.color = new THREE.Color().setHSL(0.58 + Math.random() * 0.1, 0.6, 0.55)
      material.emissive = material.color.clone().multiplyScalar(0.3)
      const mesh = new THREE.Mesh(obstacleGeometry, material)
      mesh.castShadow = true
      mesh.position.set((Math.random() - 0.5) * 8, 0.9, -12 - i * 12 - Math.random() * 6)
      mesh.userData.spin = new THREE.Vector3(Math.random() * 0.6, Math.random() * 0.6, Math.random() * 0.6)
      scene.add(mesh)
      obstacles.push(mesh)
    }

    const crystalGeometry = new THREE.IcosahedronGeometry(0.45, 0)
    const baseCrystalMaterial = new THREE.MeshStandardMaterial({
      color: 0xfff3a8,
      emissive: new THREE.Color(0xffcf6b),
      emissiveIntensity: 0.75,
      roughness: 0.25,
      metalness: 0.7
    })
    const crystals = []
    const crystalCount = 18
    for (let i = 0; i < crystalCount; i++) {
      const material = cloneMaterial(baseCrystalMaterial)
      material.color = new THREE.Color().setHSL(0.12 + Math.random() * 0.08, 0.7, 0.65)
      material.emissive = material.color.clone().multiplyScalar(0.9)
      const mesh = new THREE.Mesh(crystalGeometry, material)
      mesh.castShadow = true
      mesh.position.set((Math.random() - 0.5) * 8, 0.9, -8 - i * 10 - Math.random() * 6)
      mesh.userData.spin = new THREE.Vector3(Math.random() * 0.8, Math.random() * 0.8, Math.random() * 0.8)
      scene.add(mesh)
      crystals.push(mesh)
    }

    const pushHud = (force = false) => {
      const now = performance.now()
      if (!force && now - hudThrottleRef.current < 100) return
      hudThrottleRef.current = now
      setHud({
        score: Math.round(hudState.score),
        distance: Math.round(hudState.distance),
        hp: hudState.hp,
        deckRemaining: hudState.deckRemaining,
        nextItem: hudState.nextItem ? { ...hudState.nextItem } : null,
        cooldown: Math.max(0, hudState.cooldown),
        crystals: hudState.crystals,
        burstActive: hudState.burstActive,
        message: hudState.message,
        time: hudState.time
      })
    }

    const flashMessage = text => {
      hudState.message = text
      messageTimer = 2.6
      pushHud(true)
    }

    const endGame = reason => {
      if (!running) return
      running = false
      hudState.message = ''
      if (frameId !== null) {
        cancelAnimationFrame(frameId)
        frameId = null
      }
      pushHud(true)
      setSummary({
        score: Math.round(hudState.score),
        distance: Math.round(hudState.distance),
        crystals: hudState.crystals,
        hits: MAX_SHIELDS - hudState.hp,
        duration: elapsed,
        usedItems: usedItems.slice(),
        chargesLeft: hudState.deckRemaining,
        reason: reason || 'Run complete'
      })
    }

    endRunRef.current = endGame

    const useBurst = () => {
      if (hudState.deckRemaining <= 0) {
        flashMessage('No gacha charges left!')
        return
      }
      if (hudState.cooldown > 0 || burstActive) {
        flashMessage('Nova is recharging…')
        return
      }
      const card = deck.shift()
      hudState.deckRemaining = deck.length
      hudState.nextItem = deck[0] || null
      hudState.burstActive = true
      burstActive = true
      burstElapsed = 0
      const rarity = card?.rarity || 'common'
      burstDuration = BURST_DURATION[rarity] || 3
      burstRadius = BURST_RADIUS[rarity] || 3.2
      burstColor = new THREE.Color(RARITY_COLORS[rarity] || '#6aa0ff')
      hudState.cooldown = 1.8
      usedItems.push(card)
      playerMaterial.emissive = burstColor.clone().multiplyScalar(0.6)
      playerMaterial.emissiveIntensity = 0.75
      nova.visible = true
      nova.material.color = burstColor.clone().lerp(new THREE.Color(0xffffff), 0.35)
      nova.material.opacity = 0.0
      flashMessage(`${card.name} unleashes a ${RARITY_LABELS[rarity] || rarity} nova!`)
      pushHud(true)
    }

    const handleKeyDown = event => {
      if (event.repeat) {
        if (event.code === 'Space') event.preventDefault()
        return
      }
      switch (event.code) {
        case 'ArrowLeft':
        case 'KeyA':
          keys.left = true
          break
        case 'ArrowRight':
        case 'KeyD':
          keys.right = true
          break
        case 'ArrowUp':
        case 'KeyW':
          keys.up = true
          break
        case 'ArrowDown':
        case 'KeyS':
          keys.down = true
          break
        case 'Space':
          event.preventDefault()
          burstRequest = true
          break
        case 'Escape':
          event.preventDefault()
          endGame('Run aborted by pilot')
          break
        default:
          break
      }
    }

    const handleKeyUp = event => {
      switch (event.code) {
        case 'ArrowLeft':
        case 'KeyA':
          keys.left = false
          break
        case 'ArrowRight':
        case 'KeyD':
          keys.right = false
          break
        case 'ArrowUp':
        case 'KeyW':
          keys.up = false
          break
        case 'ArrowDown':
        case 'KeyS':
          keys.down = false
          break
        case 'Space':
          burstRequest = false
          break
        default:
          break
      }
    }

    const handleResize = () => {
      if (!mount) return
      renderer.setSize(mount.clientWidth, mount.clientHeight, false)
      camera.aspect = mount.clientWidth / mount.clientHeight
      camera.updateProjectionMatrix()
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('resize', handleResize)

    const resetObstacle = mesh => {
      mesh.position.z = -120 - Math.random() * 80
      mesh.position.x = (Math.random() - 0.5) * 8
    }

    const resetCrystal = mesh => {
      mesh.position.z = -110 - Math.random() * 70
      mesh.position.x = (Math.random() - 0.5) * 8
    }

    const animate = () => {
      if (!running) return
      const delta = Math.min(clock.getDelta(), 0.12)
      elapsed += delta
      hudState.time = elapsed

      const difficulty = 1 + hudState.distance / 600
      const forwardStep = (5.5 + difficulty * 2.6) * delta
      hudState.distance += forwardStep * 10
      hudState.score += forwardStep * 65

      const laneSpeed = 4.8 + difficulty * 0.6
      const verticalSpeed = 2.5
      if (keys.left) player.position.x -= laneSpeed * delta
      if (keys.right) player.position.x += laneSpeed * delta
      if (keys.up) player.position.z -= verticalSpeed * delta
      if (keys.down) player.position.z += verticalSpeed * delta
      player.position.x = THREE.MathUtils.clamp(player.position.x, -4.5, 4.5)
      player.position.z = THREE.MathUtils.clamp(player.position.z, -1.8, 1.8)
      player.position.y = 0.9 + Math.sin(elapsed * 2.4) * 0.1

      drones.forEach((drone, idx) => {
        const data = drone.userData
        data.angle += delta * data.speed
        const radius = data.radius
        drone.position.set(
          player.position.x + Math.cos(data.angle) * radius,
          player.position.y + 0.35 + Math.sin(data.angle * 2) * 0.18,
          player.position.z + Math.sin(data.angle) * 0.9
        )
      })

      if (burstRequest) {
        useBurst()
        burstRequest = false
      }

      if (burstActive) {
        burstElapsed += delta
        nova.visible = true
        const t = burstElapsed / burstDuration
        const scale = 1 + t * burstRadius
        nova.position.copy(player.position)
        nova.scale.setScalar(scale)
        nova.material.opacity = THREE.MathUtils.lerp(nova.material.opacity, 0.32, 0.25)
        if (burstElapsed >= burstDuration) {
          burstActive = false
          hudState.burstActive = false
          nova.visible = false
          nova.material.opacity = 0
          playerMaterial.emissive = new THREE.Color(0x0b0f1d)
          playerMaterial.emissiveIntensity = 0.12
          pushHud(true)
        }
      } else {
        nova.material.opacity = THREE.MathUtils.lerp(nova.material.opacity, 0, 0.2)
      }

      if (hudState.cooldown > 0) {
        hudState.cooldown = Math.max(0, hudState.cooldown - delta)
      }

      const playerPos = player.position

      obstacles.forEach(mesh => {
        mesh.position.z += forwardStep * 5
        mesh.rotation.x += mesh.userData.spin.x * delta
        mesh.rotation.y += mesh.userData.spin.y * delta
        mesh.rotation.z += mesh.userData.spin.z * delta

        if (mesh.position.z > 6) {
          resetObstacle(mesh)
          return
        }

        const dx = mesh.position.x - playerPos.x
        const dz = mesh.position.z - playerPos.z
        const distSq = dx * dx + dz * dz

        if (burstActive && distSq < burstRadius * burstRadius) {
          hudState.score += 140
          resetObstacle(mesh)
        } else if (distSq < 1.0) {
          resetObstacle(mesh)
          hudState.hp = Math.max(0, hudState.hp - 1)
          flashMessage('Barrier impact! Shields losing power!')
          if (hudState.hp <= 0) {
            endGame('Shields depleted')
          }
        }
      })

      crystals.forEach(mesh => {
        mesh.position.z += forwardStep * 5.4
        mesh.rotation.x += mesh.userData.spin.x * delta * 1.6
        mesh.rotation.y += mesh.userData.spin.y * delta * 1.6
        mesh.rotation.z += mesh.userData.spin.z * delta * 1.6
        if (mesh.position.z > 6) {
          resetCrystal(mesh)
          return
        }
        const dx = mesh.position.x - playerPos.x
        const dz = mesh.position.z - playerPos.z
        if (dx * dx + dz * dz < 0.7) {
          hudState.score += 220
          hudState.crystals += 1
          resetCrystal(mesh)
        }
        if (burstActive) {
          const distSq = dx * dx + dz * dz
          if (distSq < burstRadius * burstRadius) {
            hudState.score += 220
            hudState.crystals += 1
            resetCrystal(mesh)
          }
        }
      })

      starField.rotation.z += delta * 0.08
      starField.position.z += forwardStep * 0.08
      if (starField.position.z > 40) starField.position.z = 0

      if (hudState.hp <= 0) {
        endGame('Shields depleted')
        renderer.render(scene, camera)
        return
      }

      if (messageTimer > 0) {
        messageTimer -= delta
        if (messageTimer <= 0) {
          hudState.message = ''
        }
      }

      pushHud(false)
      renderer.render(scene, camera)
      if (running) {
        frameId = requestAnimationFrame(animate)
      }
    }

    frameId = requestAnimationFrame(animate)

    return () => {
      running = false
      if (frameId !== null) {
        cancelAnimationFrame(frameId)
        frameId = null
      }
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('resize', handleResize)
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement)
      }
      renderer.dispose()
      floorGeometry.dispose()
      floorMaterial.dispose()
      laneGlowGeometry.dispose()
      laneGlowMaterial.dispose()
      starGeometry.dispose()
      starMaterial.dispose()
      playerGeometry.dispose()
      playerMaterial.dispose()
      novaGeometry.dispose()
      novaMaterial.dispose()
      obstacleGeometry.dispose()
      disposeMaterial(baseObstacleMaterial)
      obstacles.forEach(mesh => {
        disposeMaterial(mesh.material)
      })
      crystalGeometry.dispose()
      disposeMaterial(baseCrystalMaterial)
      crystals.forEach(mesh => {
        disposeMaterial(mesh.material)
      })
      drones.forEach(mesh => {
        mesh.geometry.dispose()
        disposeMaterial(mesh.material)
      })
      endRunRef.current = null
    }
  }, [session])

  const handleRestart = () => {
    setSummary(null)
    setSession(s => s + 1)
  }

  return (
    <div className="game-overlay">
      <div className="game-stage">
        <div ref={mountRef} className="game-canvas" />
        <div className="game-ui">
          <div className="game-top-bar">
            <div className="game-title">Gacha Drift Arcade</div>
            <div className="spacer" />
            <button className="btn secondary" onClick={handleEndRun}>
              End run
            </button>
          </div>
          <div className="game-bottom-bar">
            <div className="game-hud-card">
              <div className="game-hud-grid">
                <div>
                  <div className="hud-label">Score</div>
                  <div className="hud-value">{hud.score.toLocaleString()}</div>
                </div>
                <div>
                  <div className="hud-label">Distance</div>
                  <div className="hud-value">{hud.distance.toLocaleString()}m</div>
                </div>
                <div>
                  <div className="hud-label">Shards</div>
                  <div className="hud-value">{hud.crystals}</div>
                </div>
                <div>
                  <div className="hud-label">Shields</div>
                  <div className="game-shields">
                    {Array.from({ length: MAX_SHIELDS }).map((_, idx) => (
                      <span key={idx} className={idx < hud.hp ? 'is-full' : ''} />
                    ))}
                  </div>
                </div>
              </div>
              <div className="game-ability">
                <div className="hud-label">Nova Burst</div>
                <div className="game-ability-status">
                  {hud.burstActive
                    ? 'Active!'
                    : (hud.cooldown > 0 ? `Charging: ${hud.cooldown.toFixed(1)}s` : 'Ready')}
                </div>
                <div className="game-ability-next">
                  {hud.nextItem ? (
                    <>
                      Next charge: <span className={`rarity-${hud.nextItem.rarity}`}>{hud.nextItem.name}</span>
                      {!hud.nextItem.fromInventory ? <span className="game-loaner">(arcade loan)</span> : null}
                    </>
                  ) : 'No charges remaining'}
                </div>
                <div className="game-ability-queue">Charges left: {hud.deckRemaining}</div>
                <div className="game-ability-tip">Press SPACE to spend the next summon and clear hazards.</div>
              </div>
            </div>
            <div className="game-instructions">
              <h4>How to play</h4>
              <ul>
                <li>Move with A/D or ← →. Adjust depth with W/S or ↑ ↓.</li>
                <li>Collect luminous shards for points and avoid barrier pylons.</li>
                <li>Your inventory summons orbit you as drones. Press SPACE to burn the next one for a Nova Burst.</li>
                <li>Survive as long as you can — three shield hits end the run.</li>
              </ul>
              <div className="game-session-time">Run time: {formatDuration(hud.time)}</div>
            </div>
          </div>
          {hud.message ? <div className="game-toast">{hud.message}</div> : null}
        </div>
        {summary ? (
          <div className="game-summary">
            <div className="game-summary-card">
              <h2>Run complete</h2>
              <p className="muted">{summary.reason}</p>
              <div className="game-summary-stats">
                <div>
                  <div className="hud-label">Score</div>
                  <div className="hud-value">{summary.score.toLocaleString()}</div>
                </div>
                <div>
                  <div className="hud-label">Distance</div>
                  <div className="hud-value">{summary.distance.toLocaleString()}m</div>
                </div>
                <div>
                  <div className="hud-label">Shards</div>
                  <div className="hud-value">{summary.crystals}</div>
                </div>
                <div>
                  <div className="hud-label">Time</div>
                  <div className="hud-value">{formatDuration(summary.duration)}</div>
                </div>
              </div>
              <div className="game-summary-charges">
                <div className="hud-label">Summons unleashed</div>
                {summary.usedItems.length === 0 ? (
                  <div className="muted">No bursts fired — try pressing SPACE next time!</div>
                ) : (
                  <ul className="game-summary-list">
                    {summary.usedItems.map((item, idx) => (
                      <li key={idx} className="game-summary-chip">
                        <span className={`rarity-${item.rarity}`}>{item.name}</span>
                        {!item.fromInventory ? <span className="game-loaner">loaner</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="game-summary-remaining">Charges remaining: {summary.chargesLeft}</div>
              </div>
              <div className="game-summary-actions">
                <button className="btn" onClick={handleRestart}>Play again</button>
                <button className="btn secondary" onClick={onClose}>Return to hub</button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
