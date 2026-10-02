import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { SeaAudio } from './audio'
import {
  discoveryBy,
  floorHeight,
  regionAt,
  sampleAtmosphere,
  STAGES,
  stageIndex,
  stageLength,
} from './data'
import { Fauna, type Scan } from './fauna'
import { Hud } from './hud'
import { clearSave, defaultSave, hasHistory, loadSave, writeSave, type SaveData } from './save'
import { sceneryFog, Scenery } from './scenery'
import { Sea } from './sea'
import { Shark, type SwimInput } from './shark'
import { clamp, formatDive, lerp, uTime } from './util'

type Overlay = 'none' | 'map' | 'codex' | 'pause'

export class Game {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private composer: EffectComposer
  private sea: Sea
  private scenery: Scenery
  private fauna: Fauna
  private shark: Shark
  private audio = new SeaAudio()
  private hud = new Hud()
  private save: SaveData
  private mode: 'attract' | 'play' = 'attract'
  private overlay: Overlay = 'none'
  private keys = new Set<string>()
  private mouseX = 0
  private mouseY = 0
  private lungeQueued = false
  private burstHeld = false
  private camPos = new THREE.Vector3()
  private camReady = false
  private stage = 0
  private cards: { eye: string; title: string; sub: string }[] = []
  private cardTime = 0
  private cardOn = false
  private saveTimer = 0
  private playHint = 0
  private edgeWarned = false
  private whaleSong = 0
  private toastAt = 0
  private respectAt = 0
  private intro = false
  private forgetArm = false
  private last = performance.now()
  private fps = 0
  private fpsOn = new URLSearchParams(location.search).has('fps')
  private lockTarget: { x: number; y: number; z: number } | null = null
  private lastScan: Scan | null = null

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6))
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.02
    this.camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.12, 2200)
    this.sea = new Sea(this.scene)
    this.sea.addShafts(this.scene)
    this.scenery = new Scenery(this.scene)
    this.fauna = new Fauna(this.scene)
    this.shark = new Shark(this.scene)
    this.save = loadSave()
    this.shark.growth = hasHistory(this.save) ? this.save.growth : 0
    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.12, 0.4, 0.94)
    this.composer.addPass(bloom)
    this.composer.addPass(new OutputPass())
    this.bind()
    this.refreshTitle()
    this.shark.attract(0.016)
    this.frame(performance.now())
    if (new URLSearchParams(location.search).has('dive')) this.dive(true)
  }

  private bind(): void {
    window.addEventListener('resize', () => this.resize())
    window.addEventListener('keydown', (e) => this.onKey(e, true))
    window.addEventListener('keyup', (e) => this.onKey(e, false))
    window.addEventListener('blur', () => this.keys.clear())
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.persist()
    })
    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.mode !== 'play' || this.overlay !== 'none') return
      this.canvas.setPointerCapture(e.pointerId)
      if (!this.burstHeld) this.canvas.requestPointerLock?.()
    })
    window.addEventListener('pointermove', (e) => {
      const locked = document.pointerLockElement === this.canvas
      if (!locked && e.buttons === 0) return
      if (this.mode !== 'play' || this.overlay !== 'none') return
      this.mouseX += e.movementX
      this.mouseY += e.movementY
    })
    document.addEventListener('pointerdown', () => this.audio.start())
    el('dive').addEventListener('click', () => {
      blur()
      this.dive(true)
    })
    el('continue').addEventListener('click', () => {
      blur()
      this.dive(false)
    })
    el('anew').addEventListener('click', () => {
      blur()
      if (!this.forgetArm) {
        this.forgetArm = true
        el('anew').textContent = 'Forget this shark'
        return
      }
      this.forget()
    })
    el('resume').addEventListener('click', () => {
      blur()
      this.setOverlay('none')
    })
    el('surface').addEventListener('click', () => {
      blur()
      this.surface()
    })
    el('forget').addEventListener('click', () => {
      blur()
      this.forget()
    })
    el('close-map').addEventListener('click', () => this.setOverlay('none'))
    el('close-codex').addEventListener('click', () => this.setOverlay('none'))
    const bite = el('btn-bite')
    const burst = el('btn-burst')
    bite.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      this.lungeQueued = true
    })
    burst.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      this.burstHeld = true
    })
    burst.addEventListener('pointerup', () => {
      this.burstHeld = false
    })
    burst.addEventListener('pointerleave', () => {
      this.burstHeld = false
    })
  }

  private dive(fresh: boolean): void {
    this.audio.start()
    if (fresh) {
      clearSave()
      this.save = defaultSave()
    } else {
      this.save = loadSave()
    }
    const y = Math.max(this.save.y, floorHeight(this.save.x, this.save.z) + 2.2)
    this.shark.reset(this.save.x, y, this.save.z, this.save.yaw, this.save.pitch, this.save.growth)
    this.stage = stageIndex(this.save.growth)
    this.mode = 'play'
    this.intro = fresh || this.save.fishEaten === 0
    this.playHint = 0
    this.edgeWarned = false
    this.cards = []
    this.cardOn = false
    this.hud.hideCard()
    this.hud.hideTitle()
    this.setOverlay('none')
    this.camReady = false
    this.forgetArm = false
    if (!this.save.discoveries.includes('reef') && regionAt(this.shark.position.x, this.shark.position.z)?.id === 'reef') {
      this.discover('reef')
    }
  }

  private surface(): void {
    this.persist()
    this.mode = 'attract'
    this.setOverlay('none')
    this.hud.hideCard()
    document.exitPointerLock?.()
    this.refreshTitle()
  }

  private forget(): void {
    clearSave()
    this.save = defaultSave()
    this.shark.growth = 0
    this.mode = 'attract'
    this.forgetArm = false
    el('anew').textContent = 'Begin again'
    this.setOverlay('none')
    document.exitPointerLock?.()
    this.refreshTitle()
  }

  private refreshTitle(): void {
    const save = loadSave()
    const history = hasHistory(save)
    const blurb = history
      ? `${STAGES[stageIndex(save.growth)].name} · ${stageLength(save.growth).toFixed(1)} m · ${formatDive(save.playSeconds)} · ${save.discoveries.length} discoveries`
      : 'Four regions are already on the chart. Their names are not.'
    this.hud.showTitle(blurb, history)
    this.forgetArm = false
    el('anew').textContent = 'Begin again'
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    const key = e.key.toLowerCase()
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) e.preventDefault()
    if (down && !e.repeat) {
      if (key === 'm') this.toggle('map')
      else if (key === 'c') this.toggle('codex')
      else if (key === 'escape') this.onEsc()
      else if (key === ' ' || key === 'e') this.lungeQueued = true
    }
    if (down) this.keys.add(key)
    else this.keys.delete(key)
  }

  private toggle(which: Overlay): void {
    if (this.mode !== 'play') return
    this.setOverlay(this.overlay === which ? 'none' : which)
  }

  private onEsc(): void {
    if (this.mode !== 'play') return
    if (this.overlay !== 'none') this.setOverlay('none')
    else this.setOverlay('pause')
  }

  private setOverlay(next: Overlay): void {
    this.overlay = next
    if (next !== 'map') this.hud.closeMap()
    if (next !== 'codex') this.hud.closeCodex()
    if (next !== 'pause') this.hud.closePause()
    if (next === 'map') {
      this.hud.openMap(this.shark.position.x, this.shark.position.z, this.shark.yaw, new Set(this.save.discoveries))
    }
    if (next === 'codex') this.hud.openCodex(new Set(this.save.discoveries))
    if (next === 'pause') {
      const s = this.save
      this.hud.openPause(
        `${STAGES[stageIndex(s.growth)].name} · ${stageLength(s.growth).toFixed(1)} m\n${formatDive(s.playSeconds)}\n${s.fishEaten} fish · ${s.discoveries.length} discoveries`,
      )
    }
    if (next !== 'none') document.exitPointerLock?.()
  }

  private input(): SwimInput {
    const yaw = (this.keys.has('d') || this.keys.has('arrowright') ? 1 : 0) - (this.keys.has('a') || this.keys.has('arrowleft') ? 1 : 0)
    const pitch = (this.keys.has('arrowup') || this.keys.has('r') ? 1 : 0) - (this.keys.has('arrowdown') || this.keys.has('f') ? 1 : 0)
    const thrust = (this.keys.has('w') ? 1 : 0) - (this.keys.has('s') ? 1 : 0)
    const frame: SwimInput = {
      yaw,
      pitch,
      thrust,
      sprint: this.keys.has('shift') || this.burstHeld,
      mouseX: this.mouseX,
      mouseY: this.mouseY,
      lunge: this.lungeQueued,
    }
    this.mouseX = 0
    this.mouseY = 0
    this.lungeQueued = false
    return frame
  }

  private frame = (now: number): void => {
    const dt = clamp((now - this.last) / 1000, 0, 0.05)
    this.last = now
    if (this.fpsOn) {
      this.fps = this.fps * 0.9 + (dt > 0 ? 1 / dt : 60) * 0.1
      const node = document.getElementById('fps')
      if (node) node.textContent = `${this.fps.toFixed(0)} fps`
    }
    uTime.value += dt
    const playing = this.mode === 'play' && this.overlay === 'none'
    let lunged = false
    if (this.mode === 'attract') {
      this.shark.attract(dt)
      this.fauna.update(dt, this.shark, true)
    } else if (playing) {
      const inp = this.input()
      if (this.lockTarget && (inp.lunge || this.shark.lunge > 0)) {
        this.shark.steerToward(new THREE.Vector3(this.lockTarget.x, this.lockTarget.y, this.lockTarget.z), dt, 1.7)
      }
      const wasAir = this.shark.air
      const regen = this.save.hunger < 22 ? 0.35 : 1
      const stepped = this.shark.swim(dt, inp, this.save.stamina, regen)
      this.save.stamina = stepped.stamina
      lunged = stepped.lunged
      if (this.shark.air !== wasAir) {
        this.sea.splash(this.shark.position.x, this.shark.position.z)
        this.audio.splash()
      }
      this.fauna.update(dt, this.shark, false)
      this.hunt(lunged || this.shark.lunge > 0)
      this.vitals(dt, inp)
      this.explore()
      this.bounds()
      this.save.x = this.shark.position.x
      this.save.y = this.shark.position.y
      this.save.z = this.shark.position.z
      this.save.yaw = this.shark.yaw
      this.save.pitch = this.shark.pitch
      this.save.growth = this.shark.growth
      this.saveTimer += dt
      if (this.saveTimer > 5) {
        this.saveTimer = 0
        this.persist()
      }
    } else {
      this.mouseX = 0
      this.mouseY = 0
      this.lungeQueued = false
      this.shark.syncMesh(uTime.value)
    }

    if (this.mode === 'attract' || playing) this.shark.syncMesh(uTime.value)
    this.follow(dt, this.mode === 'attract')
    const atmo = sampleAtmosphere(this.camera.position.x, this.camera.position.y, this.camera.position.z, this.shark.air || this.camera.position.y > -0.2)
    sceneryFog.color.copy(atmo.fog)
    sceneryFog.density.value = atmo.density
    this.sea.update(dt, this.camera, atmo, this.shark.air)
    if (playing && (this.keys.has('shift') || this.burstHeld) && Math.random() < dt * 8) {
      const tail = this.shark.position.clone().addScaledVector(this.shark.forward, -this.shark.scale)
      this.sea.burst(tail.x, tail.y, tail.z, 1)
    }
    this.audio.setDepth(Math.max(0, -this.camera.position.y), this.overlay !== 'none' || this.mode === 'attract')
    this.cardsTick(dt)
    this.paintHud(dt)
    this.composer.render()
    requestAnimationFrame(this.frame)
  }

  private hunt(lunging: boolean): void {
    const scan = this.fauna.scan(this.shark, lunging)
    this.lastScan = scan
    this.lockTarget = scan.hint ?? scan.eat
    if (scan.eat) {
      const species = scan.eat.species
      this.fauna.eat(scan.eat)
      const bonus = this.save.hunger > 72 ? 1.15 : 1
      this.save.hunger = Math.min(100, this.save.hunger + species.hunger)
      this.save.growth += species.growth * bonus
      this.save.fishEaten += 1
      this.shark.growth = this.save.growth
      this.shark.bite = 0.22
      this.audio.bite()
      this.sea.burst(scan.eat.x, scan.eat.y, scan.eat.z, 8)
      const next = stageIndex(this.save.growth)
      if (next !== this.stage) {
        this.stage = next
        this.audio.evolve()
        this.cards.push({
          eye: 'Evolution',
          title: STAGES[next].name,
          sub: next === STAGES.length - 1 ? 'The trench knows your name.' : 'The water makes room.',
        })
      }
    } else if (scan.denied && lunging && performance.now() - this.toastAt > 1800) {
      this.toastAt = performance.now()
      this.hud.toastMsg(`${scan.denied.species.name} is still too much ocean for you.`)
    } else if (scan.respect && lunging && performance.now() - this.respectAt > 5000) {
      this.respectAt = performance.now()
      this.hud.toastMsg(scan.respect)
    }
  }

  private vitals(dt: number, inp: SwimInput): void {
    const sprinting = inp.sprint && inp.thrust >= 0 && this.shark.lunge <= 0
    const drain = (0.34 + (inp.thrust > 0 ? 0.08 : 0) + (sprinting ? 0.48 : 0)) * dt
    this.save.hunger = Math.max(0, this.save.hunger - drain)
    if (this.save.hunger <= 0) this.save.growth = Math.max(0, this.save.growth - 0.12 * dt)
    this.shark.growth = this.save.growth
    this.save.playSeconds += dt
    this.playHint += dt
    const stage = stageIndex(this.save.growth)
    if (stage !== this.stage && this.save.hunger <= 0) this.stage = stage
    if (this.intro && this.playHint > 2.2 && this.save.fishEaten === 0) {
      this.intro = false
      this.hud.toastMsg('Hunger is patient. The reef is not empty.')
    }
    const whaleD = this.shark.position.distanceTo(this.fauna.whalePos)
    this.whaleSong -= dt
    if (whaleD < 150 && this.whaleSong <= 0) {
      this.whaleSong = 28
      this.audio.whale()
    }
  }

  private explore(): void {
    const p = this.shark.position
    const region = regionAt(p.x, p.z)
    if (region) this.discover(region.id)
    for (const id of ['marlowe', 'vesper', 'gilded'] as const) {
      const wreck = discoveryAnchor(id)
      if (wreck && Math.hypot(p.x - wreck.x, p.z - wreck.z) < 30) this.discover(id)
    }
    if (p.distanceTo(this.scenery.pearl) < 10) this.discover('pearl')
    if (p.distanceTo(this.fauna.whalePos) < 48) this.discover('whale')
    if (p.distanceTo(this.fauna.mantaPos) < 24) this.discover('manta')
    if (this.fauna.turtlePos.some((t) => p.distanceTo(t) < 14)) this.discover('turtle')
    if (Math.hypot(p.x - (-530), p.z - 88) < 14) this.discover('octopus')
    if (this.fauna.jellyPos.some((t) => p.distanceTo(t) < 18)) this.discover('jellies')
    if (this.fauna.nearestAngler(p) < 16) this.discover('angler')
  }

  private discover(id: string): void {
    if (this.save.discoveries.includes(id)) return
    this.save.discoveries.push(id)
    const d = discoveryBy(id)
    if (!d) return
    this.audio.discover()
    if (d.card) this.cards.push({ eye: d.eyebrow, title: d.name, sub: d.blurb })
    else this.hud.toastMsg(`${d.name} — ${d.blurb}`)
    this.persist()
  }

  private bounds(): void {
    const d = Math.hypot(this.shark.position.x, this.shark.position.z)
    if (d > 930 && !this.edgeWarned) {
      this.edgeWarned = true
      this.hud.toastMsg('The chart ends. The center still holds.')
    }
    if (d < 860) this.edgeWarned = false
  }

  private cardsTick(dt: number): void {
    if (this.cardOn) {
      this.cardTime -= dt
      if (this.cardTime <= 0) {
        this.cardOn = false
        this.hud.hideCard()
      }
      return
    }
    const next = this.cards.shift()
    if (!next) return
    this.hud.showCard(next.eye, next.title, next.sub)
    this.cardOn = true
    this.cardTime = 4.3
  }

  private follow(dt: number, attract: boolean): void {
    const s = this.shark
    const back = attract ? 7.4 : 4.4 + s.scale * 0.85
    const lift = attract ? 1.7 : 1.25 + s.scale * 0.22
    _up.set(0, 1, 0)
    _side.crossVectors(_up, s.forward)
    if (_side.lengthSq() < 1e-4) _side.set(1, 0, 0)
    else _side.normalize()
    _desired.copy(s.position).addScaledVector(s.forward, -back).addScaledVector(_up, lift)
    _desired.addScaledVector(_side, attract ? -2.6 : 1.55)
    if (!s.air) {
      const floor = floorHeight(_desired.x, _desired.z) + 1.4
      if (_desired.y < floor) _desired.y = floor
      if (_desired.y > -1.15) _desired.y = -1.15
    }
    if (!this.camReady) {
      this.camPos.copy(_desired)
      this.camReady = true
    } else {
      this.camPos.lerp(_desired, 1 - Math.exp(-3.2 * dt))
    }
    this.camera.position.copy(this.camPos)
    _look.copy(s.position).addScaledVector(s.forward, attract ? 1.4 : 2.4)
    this.camera.up.set(0, 1, 0)
    this.camera.lookAt(_look)
    this.camera.rotateZ(s.roll * (attract ? 0.25 : 0.5))
    const targetFov = s.speed > 15 ? 76 : 64
    this.camera.fov = lerp(this.camera.fov, targetFov, 1 - Math.exp(-3 * dt))
    this.camera.updateProjectionMatrix()
  }

  private paintHud(dt: number): void {
    const playing = this.mode === 'play'
    const region = regionAt(this.shark.position.x, this.shark.position.z)
    const i = stageIndex(this.save.growth)
    const next = STAGES[i + 1]
    const growth = next ? clamp((this.save.growth - STAGES[i].growth) / (next.growth - STAGES[i].growth), 0, 1) : 1
    let reticle: { text: string; hot: boolean; bad: boolean } | null = null
    const hint = this.lastScan
    if (playing && this.overlay === 'none' && hint) {
      if (hint.denied && !hint.eat && !hint.hint) {
        reticle = { text: `${hint.denied.species.name} · not yet`, hot: false, bad: true }
      } else if (hint.hint) {
        const large = hint.hint.species.tier === 'large'
        reticle = {
          text: large ? `${hint.hint.species.name} · space to lunge` : hint.hint.species.name,
          hot: !large || this.shark.lunge > 0,
          bad: false,
        }
      }
    }
    this.hud.sync(
      {
        region: region ? region.name : 'The Blue',
        depth: Math.max(0, -this.shark.position.y),
        hunger: this.save.hunger,
        stamina: this.save.stamina,
        stage: STAGES[i].name,
        next: next ? `toward ${next.name}` : 'the chart has no further name',
        length: `${stageLength(this.save.growth).toFixed(1)} m`,
        growth,
        eaten: this.save.fishEaten,
        found: this.save.discoveries.length,
        starving: playing && this.save.hunger < 18,
        deep: this.shark.position.y < -45,
        reticle,
        showHud: playing,
        showHint: playing && this.overlay === 'none' && this.playHint < 16,
      },
      dt,
      this.shark.yaw,
    )
  }

  private persist(): void {
    if (this.mode !== 'play') return
    writeSave(this.save)
  }

  private resize(): void {
    const w = window.innerWidth
    const h = window.innerHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
    this.composer.setSize(w, h)
  }
}

const _up = new THREE.Vector3()
const _side = new THREE.Vector3()
const _desired = new THREE.Vector3()
const _look = new THREE.Vector3()

function el(id: string): HTMLElement {
  const node = document.getElementById(id)
  if (!node) throw new Error(`Missing #${id}`)
  return node
}

function blur(): void {
  const active = document.activeElement
  if (active instanceof HTMLElement) active.blur()
}

function discoveryAnchor(id: string): { x: number; z: number } | null {
  if (id === 'marlowe') return { x: 450, z: -30 }
  if (id === 'vesper') return { x: 620, z: -170 }
  if (id === 'gilded') return { x: 560, z: 50 }
  return null
}
