import * as THREE from 'three'
import { clamp, prefersReducedMotion, smoothstep, uTime } from './util'

const WAKE_MAX = 64
const SNOW_COUNT = 140
const RIBBON = 18

interface Drop {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  life: number
  max: number
  size: number
}

export interface WakeSource {
  position: THREE.Vector3
  forward: THREE.Vector3
  speed: number
  scale: number
}

/**
 * Swimming readability: a speed-scaled bubble wake, drifting marine snow,
 * and soft surface light columns. Looping motion pauses when the visitor
 * prefers reduced motion; banking and the still snow field stay.
 */
export class SwimFeel {
  private readonly reduced = prefersReducedMotion()
  private readonly drops: Drop[] = []
  private emit = 0
  private readonly wakePos = new Float32Array(WAKE_MAX * 3)
  private readonly wakeFade = new Float32Array(WAKE_MAX)
  private readonly wakeSize = new Float32Array(WAKE_MAX)
  private readonly wakePoints: THREE.Points
  private readonly snow: THREE.Points
  private readonly shafts: THREE.Group[]
  private readonly shaftMat: THREE.ShaderMaterial
  private readonly shaftTint = new THREE.Color('#d8fff8')
  private readonly anchors = [
    { f: 7.2, s: -4.4 },
    { f: 9.4, s: 5.1 },
  ]
  private readonly ribbonPos = new Float32Array(RIBBON * 2 * 3)
  private readonly ribbonUv = new Float32Array(RIBBON * 2 * 2)
  private readonly ribbon: THREE.Mesh
  private readonly ribbonMat: THREE.ShaderMaterial
  private readonly trail: { x: number; y: number; z: number }[] = []
  private trailI = 0
  private trailN = 0
  private trailMark = new THREE.Vector3(Number.NaN, Number.NaN, Number.NaN)

  constructor(scene: THREE.Scene) {
    const wakeGeo = new THREE.BufferGeometry()
    wakeGeo.setAttribute('position', new THREE.BufferAttribute(this.wakePos, 3))
    wakeGeo.setAttribute('aFade', new THREE.BufferAttribute(this.wakeFade, 1))
    wakeGeo.setAttribute('aSize', new THREE.BufferAttribute(this.wakeSize, 1))
    wakeGeo.setDrawRange(0, 0)
    this.wakePoints = new THREE.Points(wakeGeo, wakeMaterial())
    this.wakePoints.frustumCulled = false
    this.wakePoints.renderOrder = 4
    scene.add(this.wakePoints)

    this.snow = buildSnow()
    scene.add(this.snow)

    for (let i = 0; i < RIBBON; i++) this.trail.push({ x: 0, y: 0, z: 0 })
    const ribbonGeo = new THREE.BufferGeometry()
    ribbonGeo.setAttribute('position', new THREE.BufferAttribute(this.ribbonPos, 3))
    ribbonGeo.setAttribute('uv', new THREE.BufferAttribute(this.ribbonUv, 2))
    const ribbonIndex: number[] = []
    for (let i = 0; i < RIBBON - 1; i++) {
      const a = i * 2
      ribbonIndex.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
    ribbonGeo.setIndex(ribbonIndex)
    ribbonGeo.setDrawRange(0, 0)
    this.ribbonMat = ribbonMaterial()
    this.ribbon = new THREE.Mesh(ribbonGeo, this.ribbonMat)
    this.ribbon.frustumCulled = false
    this.ribbon.renderOrder = 4
    scene.add(this.ribbon)

    this.shaftMat = shaftMaterial(this.reduced)
    this.shafts = this.anchors.map(() => {
      const group = new THREE.Group()
      group.rotation.set(-0.14, 0, 0.24)
      const geo = new THREE.PlaneGeometry(8.4, 20, 1, 1)
      geo.translate(0, -10, 0)
      for (const rot of [0, Math.PI / 2]) {
        const mesh = new THREE.Mesh(geo, this.shaftMat)
        mesh.rotation.y = rot
        mesh.renderOrder = 3
        group.add(mesh)
      }
      scene.add(group)
      return group
    })
  }

  update(
    dt: number,
    camera: THREE.Camera,
    shark: WakeSource,
    boost: boolean,
    emitWake: boolean,
    shaftStrength: number,
    sun: THREE.Color,
  ): void {
    const side = _side.crossVectors(_up, shark.forward)
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0)
    else side.normalize()
    if (emitWake && !this.reduced) {
      this.emitWake(dt, shark, boost, side)
      this.pushTrail(shark, side)
    }
    this.stepWake(dt)
    this.writeRibbon(shark, boost, side)
    this.stepSnow(dt, camera.position)
    this.placeShafts(camera.position, shark, side, shaftStrength, sun)
  }

  private emitWake(dt: number, shark: WakeSource, boost: boolean, side: THREE.Vector3): void {
    const pace = clamp((shark.speed - 4) / 13, 0, 1)
    const rate = 6 + pace * 16 + (boost ? 16 : 0)
    this.emit += dt * rate
    const slip = boost ? 0.78 : 0.88
    const spread = (boost ? 1.15 : 0.55) * shark.scale
    while (this.emit >= 1 && this.drops.length < WAKE_MAX) {
      this.emit -= 1
      const along = Math.random()
      const lateral = (0.2 + Math.random() * 0.8) * spread
      const lift = (Math.random() - 0.2) * 0.28 * shark.scale
      const back = (0.55 + along * 1.6) * shark.scale
      const life = 0.95 + Math.random() * 0.7
      const size = (0.32 + Math.random() * 0.5) * (boost ? 1.7 : 1.15) * Math.sqrt(shark.scale)
      this.drops.push({
        x: shark.position.x - shark.forward.x * back + side.x * lateral,
        y: shark.position.y + lift,
        z: shark.position.z - shark.forward.z * back + side.z * lateral,
        vx: shark.forward.x * shark.speed * slip + side.x * (0.2 + Math.random() * (boost ? 1.3 : 0.45)),
        vy: 0.85 + Math.random() * (boost ? 1.9 : 0.85),
        vz: shark.forward.z * shark.speed * slip + side.z * (0.2 + Math.random() * (boost ? 1.3 : 0.45)),
        life,
        max: life,
        size,
      })
    }
    if (this.emit > 2) this.emit = 2
  }

  private pushTrail(shark: WakeSource, side: THREE.Vector3): void {
    const back = 0.82 * shark.scale
    _tail.set(
      shark.position.x - shark.forward.x * back + side.x * 0.42 * shark.scale,
      shark.position.y + 0.05,
      shark.position.z - shark.forward.z * back + side.z * 0.42 * shark.scale,
    )
    if (Number.isFinite(this.trailMark.x) && _tail.distanceToSquared(this.trailMark) < 0.38 * 0.38) return
    this.trailMark.copy(_tail)
    const sample = this.trail[this.trailI]
    sample.x = _tail.x
    sample.y = _tail.y
    sample.z = _tail.z
    this.trailI = (this.trailI + 1) % RIBBON
    this.trailN = Math.min(RIBBON, this.trailN + 1)
  }

  private writeRibbon(shark: WakeSource, boost: boolean, side: THREE.Vector3): void {
    const geo = this.ribbon.geometry
    const n = this.reduced ? 0 : this.trailN
    if (n < 2) {
      geo.setDrawRange(0, 0)
      this.ribbonMat.uniforms.uAlpha.value = 0
      return
    }
    const pace = clamp(shark.speed / 18, 0, 1)
    const height = (0.42 + pace * 1.05) * (boost ? 1.45 : 1) * Math.sqrt(shark.scale)
    for (let i = 0; i < n; i++) {
      const sample = this.trail[(this.trailI - 1 - i + RIBBON * 2) % RIBBON]
      const along = i / (n - 1)
      const h = height * (1.05 - along * 0.45)
      const lean = 0.18 + along * 0.35
      const top = i * 2
      const bot = top + 1
      this.ribbonPos[top * 3] = sample.x + side.x * lean
      this.ribbonPos[top * 3 + 1] = sample.y + h
      this.ribbonPos[top * 3 + 2] = sample.z + side.z * lean
      this.ribbonPos[bot * 3] = sample.x
      this.ribbonPos[bot * 3 + 1] = sample.y - h * 0.22
      this.ribbonPos[bot * 3 + 2] = sample.z
      this.ribbonUv[top * 2] = 0
      this.ribbonUv[top * 2 + 1] = along
      this.ribbonUv[bot * 2] = 1
      this.ribbonUv[bot * 2 + 1] = along
    }
    ;(geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
    ;(geo.getAttribute('uv') as THREE.BufferAttribute).needsUpdate = true
    geo.setDrawRange(0, (n - 1) * 6)
    this.ribbonMat.uniforms.uAlpha.value = 0.22 + pace * 0.16 + (boost ? 0.18 : 0)
  }

  private stepWake(dt: number): void {
    let count = 0
    for (let i = 0; i < this.drops.length; i++) {
      const drop = this.drops[i]
      drop.life -= dt
      if (drop.life <= 0) continue
      drop.x += drop.vx * dt
      drop.y += drop.vy * dt
      drop.z += drop.vz * dt
      drop.vx *= 1 - Math.min(dt * 0.6, 0.2)
      drop.vz *= 1 - Math.min(dt * 0.6, 0.2)
      this.drops[count] = drop
      count += 1
    }
    this.drops.length = count
    for (let i = 0; i < this.drops.length; i++) {
      const drop = this.drops[i]
      this.wakePos[i * 3] = drop.x
      this.wakePos[i * 3 + 1] = drop.y
      this.wakePos[i * 3 + 2] = drop.z
      this.wakeFade[i] = clamp(drop.life / drop.max, 0, 1)
      this.wakeSize[i] = drop.size
    }
    const geo = this.wakePoints.geometry
    ;(geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
    ;(geo.getAttribute('aFade') as THREE.BufferAttribute).needsUpdate = true
    ;(geo.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true
    geo.setDrawRange(0, this.drops.length)
  }

  private stepSnow(dt: number, cam: THREE.Vector3): void {
    const pos = this.snow.geometry.getAttribute('position') as THREE.BufferAttribute
    const phase = this.snow.geometry.getAttribute('aPhase') as THREE.BufferAttribute
    const reach = 34
    let moved = false
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i)
      let y = pos.getY(i)
      let z = pos.getZ(i)
      if (!this.reduced) {
        const drift = 0.28 + phase.getX(i) * 0.55
        y -= drift * dt
        x += Math.sin(uTime.value * 0.2 + phase.getX(i) * 12) * dt * 0.35
      }
      if (x - cam.x > reach) x -= reach * 2
      if (cam.x - x > reach) x += reach * 2
      if (z - cam.z > reach) z -= reach * 2
      if (cam.z - z > reach) z += reach * 2
      if (y > cam.y + 6) y = cam.y - 26 - Math.random() * 8
      if (y < cam.y - 32) y = cam.y + 2 + Math.random() * 4
      if (x !== pos.getX(i) || y !== pos.getY(i) || z !== pos.getZ(i)) {
        pos.setXYZ(i, x, y, z)
        moved = true
      }
    }
    if (moved) pos.needsUpdate = true
  }

  private placeShafts(
    cam: THREE.Vector3,
    shark: WakeSource,
    side: THREE.Vector3,
    strength: number,
    sun: THREE.Color,
  ): void {
    const depth = -cam.y
    const near = 1 - smoothstep(4, 32, depth)
    this.shaftMat.uniforms.uStrength.value = near * strength
    this.shaftTint.set('#e7fff8').lerp(sun, 0.22)
    ;(this.shaftMat.uniforms.uColor.value as THREE.Color).copy(this.shaftTint)
    for (let i = 0; i < this.shafts.length; i++) {
      const anchor = this.anchors[i]
      this.shafts[i].position.set(
        shark.position.x + shark.forward.x * anchor.f + side.x * anchor.s,
        -0.25,
        shark.position.z + shark.forward.z * anchor.f + side.z * anchor.s,
      )
    }
  }
}

const _up = new THREE.Vector3(0, 1, 0)
const _side = new THREE.Vector3()
const _tail = new THREE.Vector3()

function wakeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {},
    vertexShader: /* glsl */ `
      attribute float aFade;
      attribute float aSize;
      varying float vFade;
      void main() {
        vec4 mv = viewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(aSize * 190.0 / max(-mv.z, 0.35), 2.0, 42.0);
        vFade = aFade;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vFade;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d);
        if (r > 0.5) discard;
        float ring = smoothstep(0.5, 0.3, r) * smoothstep(0.08, 0.24, r);
        float core = smoothstep(0.2, 0.0, r);
        float a = (ring * 0.85 + core * 0.55) * vFade;
        gl_FragColor = vec4(0.72, 0.94, 1.0, a);
      }
    `,
  })
}

function buildSnow(): THREE.Points {
  const positions = new Float32Array(SNOW_COUNT * 3)
  const phases = new Float32Array(SNOW_COUNT)
  for (let i = 0; i < SNOW_COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 64
    positions[i * 3 + 1] = -2 - Math.random() * 30
    positions[i * 3 + 2] = (Math.random() - 0.5) * 64
    phases[i] = Math.random()
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {},
    vertexShader: /* glsl */ `
      attribute float aPhase;
      varying float vA;
      void main() {
        vec4 mv = viewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp((7.0 + aPhase * 14.0) * (170.0 / max(-mv.z, 0.45)), 2.0, 26.0);
        vA = 0.45 + aPhase * 0.45;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = dot(d, d);
        if (r > 0.25) discard;
        float a = smoothstep(0.25, 0.0, r) * vA;
        gl_FragColor = vec4(0.95, 0.98, 0.99, a);
      }
    `,
  })
  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false
  points.renderOrder = 1
  return points
}

function ribbonMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uAlpha: { value: 0.35 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform float uAlpha;
      void main() {
        float across = smoothstep(0.0, 0.22, vUv.x) * smoothstep(1.0, 0.55, vUv.x);
        float along = pow(1.0 - vUv.y, 1.15);
        float a = across * along * uAlpha;
        gl_FragColor = vec4(0.62, 0.9, 0.96, a);
      }
    `,
  })
}

function shaftMaterial(reduced: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime,
      uColor: { value: new THREE.Color('#d8fff8') },
      uStrength: { value: 1 },
      uStill: { value: reduced ? 1 : 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uStrength;
      uniform float uStill;
      void main() {
        float beam = exp(-pow((vUv.x - 0.5) * 1.25, 2.0));
        float fade = smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.2, vUv.y);
        float flicker = uStill > 0.5 ? 1.0 : 0.86 + 0.14 * sin(uTime * 0.45 + vUv.y * 7.0);
        float a = beam * fade * flicker * 0.42 * uStrength;
        gl_FragColor = vec4(uColor, a);
      }
    `,
  })
}
