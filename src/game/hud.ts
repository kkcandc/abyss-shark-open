import { DISCOVERIES, REGIONS, WRECKS } from './data'

export interface Reticle {
  text: string
  hot: boolean
  bad: boolean
}

export interface HudVitals {
  region: string
  depth: number
  hunger: number
  stamina: number
  stage: string
  next: string
  length: string
  growth: number
  eaten: number
  found: number
  starving: boolean
  deep: boolean
  reticle: Reticle | null
  showHud: boolean
  showHint: boolean
}

export class Hud {
  private regionName = el('region-name')
  private depth = el('depth')
  private hungerFill = el('hunger-fill')
  private staminaFill = el('stamina-fill')
  private stageName = el('stage-name')
  private length = el('length')
  private growthFill = el('growth-fill')
  private nextStage = el('next-stage')
  private eaten = el('eaten')
  private found = el('found')
  private reticle = el('reticle')
  private reticleLabel = el('reticle-label')
  private hint = el('hint')
  private vignette = el('vignette')
  private card = el('card')
  private toast = el('toast')
  private title = el('title')
  private map = el('map')
  private codex = el('codex')
  private pause = el('pause')
  private codexList = el('codex-list')
  private mapCanvas = el('map-canvas') as HTMLCanvasElement
  private compass = el('compass') as HTMLCanvasElement
  private hudRoot = el('hud')
  private saveBlurb = el('save-blurb')
  private pauseStats = el('pause-stats')
  private toastTimer = 0
  private chompMark = 0

  constructor() {
    this.compass.width = 440
    this.compass.height = 48
    const rect = this.mapCanvas.getBoundingClientRect()
    this.mapCanvas.width = Math.max(640, Math.floor(rect.width) || 720)
    this.mapCanvas.height = 460
  }

  sync(v: HudVitals, dt: number, yaw: number): void {
    this.hudRoot.classList.toggle('hidden', !v.showHud)
    this.regionName.textContent = v.region
    this.depth.textContent = `${Math.round(v.depth)} m`
    this.hungerFill.style.width = `${v.hunger}%`
    this.staminaFill.style.width = `${v.stamina}%`
    this.stageName.textContent = v.stage
    this.length.textContent = v.length
    this.growthFill.style.width = `${v.growth * 100}%`
    this.nextStage.textContent = v.next
    this.eaten.textContent = `${v.eaten} eaten`
    this.found.textContent = `${v.found} / ${DISCOVERIES.length} found`
    this.vignette.classList.toggle('starving', v.starving)
    this.vignette.classList.toggle('deep', v.deep)
    this.hint.classList.toggle('hidden', !v.showHint)
    if (v.reticle) {
      this.reticle.hidden = false
      this.reticle.classList.toggle('hot', v.reticle.hot)
      this.reticle.classList.toggle('bad', v.reticle.bad)
      this.reticleLabel.textContent = v.reticle.text
    } else {
      this.reticle.hidden = true
    }
    drawCompass(this.compass, yaw)
    if (this.toastTimer > 0) {
      this.toastTimer -= dt
      if (this.toastTimer <= 0) this.toast.classList.remove('show')
    }
    if (this.chompMark && performance.now() > this.chompMark) {
      this.vignette.classList.remove('chomp')
      this.chompMark = 0
      document.documentElement.dataset.chomp = '0'
    }
  }

  chomp(): void {
    restart(el('chomp'), 'show')
    restart(el('bite-flash'), 'on')
    this.vignette.classList.add('chomp')
    this.chompMark = performance.now() + 640
    document.documentElement.dataset.chomp = '1'
  }

  showTitle(blurb: string, hasSave: boolean): void {
    this.title.classList.remove('hidden')
    this.saveBlurb.textContent = blurb
    el('dive').hidden = hasSave
    el('continue').hidden = !hasSave
    el('anew').hidden = !hasSave
    this.hudRoot.classList.add('hidden')
  }

  hideTitle(): void {
    this.title.classList.add('hidden')
  }

  showCard(eye: string, title: string, sub: string): void {
    el('card-eye').textContent = eye
    el('card-title').textContent = title
    el('card-sub').textContent = sub
    this.card.classList.remove('hidden')
  }

  hideCard(): void {
    this.card.classList.add('hidden')
  }

  toastMsg(text: string): void {
    this.toast.textContent = text
    this.toast.classList.add('show')
    this.toastTimer = 2.5
  }

  openMap(x: number, z: number, yaw: number, discovered: ReadonlySet<string>): void {
    this.map.classList.remove('hidden')
    drawMap(this.mapCanvas, x, z, yaw, discovered)
  }

  closeMap(): void {
    this.map.classList.add('hidden')
  }

  openCodex(discovered: ReadonlySet<string>): void {
    this.codex.classList.remove('hidden')
    this.codexList.innerHTML = DISCOVERIES.map((d) => {
      const on = discovered.has(d.id)
      return `<li class="${on ? 'on' : ''}"><strong>${on ? d.name : 'Unseen'}</strong><span>${on ? d.blurb : 'Still out in the water.'}</span></li>`
    }).join('')
  }

  closeCodex(): void {
    this.codex.classList.add('hidden')
  }

  openPause(stats: string): void {
    this.pause.classList.remove('hidden')
    this.pauseStats.textContent = stats
  }

  closePause(): void {
    this.pause.classList.add('hidden')
  }
}

function el(id: string): HTMLElement {
  const node = document.getElementById(id)
  if (!node) throw new Error(`Missing #${id}`)
  return node
}

function restart(node: HTMLElement, cls: string): void {
  node.classList.remove(cls)
  void node.offsetWidth
  node.classList.add(cls)
}

function drawCompass(canvas: HTMLCanvasElement, yaw: number): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)
  const heading = (Math.PI - yaw + Math.PI * 2) % (Math.PI * 2)
  const pxPerRad = 78
  ctx.save()
  ctx.beginPath()
  ctx.rect(8, 0, w - 16, h)
  ctx.clip()
  ctx.strokeStyle = 'rgba(232,244,240,0.4)'
  ctx.fillStyle = 'rgba(232,244,240,0.88)'
  ctx.font = '600 13px Outfit, sans-serif'
  ctx.textAlign = 'center'
  ctx.lineWidth = 1
  const names: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }
  for (let deg = -40; deg <= 400; deg += 15) {
    const rad = (deg * Math.PI) / 180
    let delta = rad - heading
    delta = Math.atan2(Math.sin(delta), Math.cos(delta))
    const x = w / 2 + delta * pxPerRad
    if (x < 0 || x > w) continue
    const major = ((deg % 360) + 360) % 360 % 90 === 0
    ctx.beginPath()
    ctx.moveTo(x, major ? 8 : 16)
    ctx.lineTo(x, 24)
    ctx.stroke()
    if (major) {
      const key = ((deg % 360) + 360) % 360
      ctx.fillText(names[key] ?? '', x, 42)
    }
  }
  ctx.restore()
  ctx.fillStyle = '#9ee7d4'
  ctx.beginPath()
  ctx.moveTo(w / 2, 2)
  ctx.lineTo(w / 2 - 5, 10)
  ctx.lineTo(w / 2 + 5, 10)
  ctx.fill()
}

function drawMap(
  canvas: HTMLCanvasElement,
  px: number,
  pz: number,
  yaw: number,
  discovered: ReadonlySet<string>,
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)
  const g = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w * 0.55)
  g.addColorStop(0, '#12343c')
  g.addColorStop(1, '#07141a')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  ctx.strokeStyle = 'rgba(198,161,91,0.16)'
  ctx.lineWidth = 1
  for (let i = 1; i < 6; i++) {
    ctx.beginPath()
    ctx.arc(w / 2, h / 2, i * 58, 0, Math.PI * 2)
    ctx.stroke()
  }

  const scale = (Math.min(w, h) * 0.46) / 980
  const toX = (x: number) => w / 2 + x * scale
  const toY = (z: number) => h / 2 + z * scale

  for (const r of REGIONS) {
    const known = discovered.has(r.id)
    ctx.beginPath()
    ctx.arc(toX(r.x), toY(r.z), r.radius * scale, 0, Math.PI * 2)
    ctx.fillStyle = known ? 'rgba(158,231,212,0.08)' : 'rgba(255,255,255,0.03)'
    ctx.strokeStyle = known ? 'rgba(158,231,212,0.7)' : 'rgba(232,244,240,0.22)'
    ctx.lineWidth = known ? 1.5 : 1
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = known ? '#e7f6f2' : 'rgba(231,246,242,0.45)'
    ctx.font = known ? '600 15px Fraunces, serif' : '13px Outfit, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(known ? r.name : 'Uncharted', toX(r.x), toY(r.z) - 4)
    if (known) {
      ctx.font = '12px Outfit, sans-serif'
      ctx.fillStyle = 'rgba(231,246,242,0.7)'
      ctx.fillText(r.epithet, toX(r.x), toY(r.z) + 14)
    }
  }

  for (const wreck of WRECKS) {
    if (!discovered.has(wreck.id)) continue
    const x = toX(wreck.x)
    const y = toY(wreck.z)
    ctx.strokeStyle = '#e7c27a'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(x - 5, y - 5)
    ctx.lineTo(x + 5, y + 5)
    ctx.moveTo(x + 5, y - 5)
    ctx.lineTo(x - 5, y + 5)
    ctx.stroke()
    ctx.font = '12px Outfit, sans-serif'
    ctx.fillStyle = '#e7c27a'
    ctx.textAlign = 'left'
    ctx.fillText(wreck.name, x + 8, y + 4)
  }

  const sx = toX(px)
  const sy = toY(pz)
  ctx.save()
  ctx.translate(sx, sy)
  ctx.rotate(-yaw)
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.moveTo(0, 11)
  ctx.lineTo(6, -7)
  ctx.lineTo(0, -3)
  ctx.lineTo(-6, -7)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  ctx.fillStyle = 'rgba(231,246,242,0.55)'
  ctx.font = '12px Outfit, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('N', w / 2 - 4, 22)
}
