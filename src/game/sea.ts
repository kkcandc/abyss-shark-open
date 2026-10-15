import * as THREE from 'three'
import { floorColor, floorHeight, type Atmosphere } from './data'
import { uTime } from './util'

const CAUSTIC = /* glsl */ `
float caustic(vec2 uv, float t) {
  vec2 p = uv;
  float c = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + vec2(t * 0.35 + fi, -t * 0.27);
    c += sin(p.x) * sin(p.y);
  }
  return pow(max(c * 0.33, 0.0), 1.55);
}
`

export class Sea {
  readonly hemi: THREE.HemisphereLight
  readonly sun: THREE.DirectionalLight
  private water: THREE.Mesh
  private sky: THREE.Mesh
  private splashMesh: THREE.Mesh
  private splashLife = 0
  private plankton: THREE.Points
  private bubbles: THREE.Points
  private bubbleLife: { x: number; y: number; z: number; vy: number; life: number; max: number }[] = []
  private bubblePos: Float32Array
  private fog: THREE.FogExp2
  private skyMat: THREE.ShaderMaterial
  private waterMat: THREE.ShaderMaterial
  private floorMat: THREE.ShaderMaterial
  private splashMat: THREE.MeshBasicMaterial
  private plankMat: THREE.ShaderMaterial
  private flakes: THREE.Points
  private flakeLife: { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number }[] = []
  private flakePos: Float32Array
  private readonly uShaft = { value: 1 }
  private readonly uPunch = { value: 0 }

  constructor(scene: THREE.Scene) {
    this.fog = new THREE.FogExp2('#147e86', 0.016)
    scene.fog = this.fog
    scene.background = this.fog.color

    this.hemi = new THREE.HemisphereLight('#d7f4f2', '#08343a', 0.85)
    scene.add(this.hemi)
    this.sun = new THREE.DirectionalLight('#fff6e4', 1.2)
    this.sun.position.set(-120, 180, 60)
    scene.add(this.sun)

    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      transparent: true,
      uniforms: { uAlpha: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vDir = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        uniform float uAlpha;
        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 zenith = vec3(0.42, 0.70, 0.88);
          vec3 horizon = vec3(0.78, 0.90, 0.92);
          vec3 col = mix(horizon, zenith, pow(h, 0.7));
          vec3 sunDir = normalize(vec3(-0.35, 0.72, 0.28));
          float sun = pow(max(dot(d, sunDir), 0.0), 220.0);
          col += vec3(1.0, 0.96, 0.85) * sun;
          gl_FragColor = vec4(col, uAlpha);
        }
      `,
    })
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1700, 32, 20), this.skyMat)
    this.sky.frustumCulled = false
    this.sky.renderOrder = -2
    scene.add(this.sky)

    this.floorMat = new THREE.ShaderMaterial({
      uniforms: { uTime, uFogColor: { value: this.fog.color }, uFogDensity: { value: 0.016 }, uPunch: this.uPunch },
      vertexShader: /* glsl */ `
        varying vec3 vColor;
        varying vec3 vWorld;
        void main() {
          vColor = color;
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying vec3 vWorld;
        uniform float uTime;
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        uniform float uPunch;
        ${CAUSTIC}
        void main() {
          float c = caustic(vWorld.xz * 0.045, uTime) * (1.0 + uPunch * 2.4);
          float depthShade = clamp((-vWorld.y - 8.0) / 100.0, 0.0, 1.0);
          vec3 col = vColor * mix(0.72 + c * 1.25, 0.38, depthShade);
          col += vec3(0.62, 0.84, 0.78) * uPunch * 0.48;
          float dist = length(cameraPosition - vWorld);
          float f = 1.0 - exp(-pow(dist * uFogDensity, 2.0));
          col = mix(col, uFogColor, clamp(f, 0.0, 1.0));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    })
    this.floorMat.vertexColors = true
    const floor = buildFloor(this.floorMat)
    floor.frustumCulled = false
    scene.add(floor)

    this.waterMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime,
        uFogColor: { value: this.fog.color },
        uFogDensity: { value: 0.016 },
        uShallow: { value: new THREE.Color('#8fe3df') },
        uSky: { value: new THREE.Color('#d5f1f4') },
        uPunch: this.uPunch,
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying vec3 vWorld;
        varying vec3 vNormal;
        varying float vWave;
        void main() {
          vec3 p = position;
          float w1 = sin(p.x * 0.045 + uTime * 0.75) * 0.42;
          float w2 = cos(p.z * 0.038 + uTime * 0.55) * 0.34;
          float w3 = sin((p.x + p.z) * 0.07 + uTime * 1.1) * 0.16;
          float h = w1 + w2 + w3;
          p.y += h;
          float dhdx = cos(p.x * 0.045 + uTime * 0.75) * 0.045 * 0.42 + cos((p.x + p.z) * 0.07 + uTime * 1.1) * 0.07 * 0.16;
          float dhdz = -sin(p.z * 0.038 + uTime * 0.55) * 0.038 * 0.34 + cos((p.x + p.z) * 0.07 + uTime * 1.1) * 0.07 * 0.16;
          vec4 world = modelMatrix * vec4(p, 1.0);
          vWorld = world.xyz;
          vNormal = normalize(mat3(modelMatrix) * vec3(-dhdx, 1.0, -dhdz));
          vWave = h;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        uniform vec3 uShallow;
        uniform vec3 uSky;
        uniform float uPunch;
        varying vec3 vWorld;
        varying vec3 vNormal;
        varying float vWave;
        ${CAUSTIC}
        void main() {
          vec3 V = normalize(cameraPosition - vWorld);
          float ndv = abs(dot(normalize(vNormal), V));
          float fres = pow(1.0 - ndv, 2.4);
          float c = caustic(vWorld.xz * 0.05, uTime) * (1.0 + uPunch * 2.8);
          float above = step(0.2, cameraPosition.y);
          vec3 belowCol = mix(uShallow, uSky, fres * 0.75 + 0.12);
          belowCol += vec3(0.55, 0.85, 0.82) * c * 0.45;
          belowCol += vec3(0.78, 0.96, 0.92) * uPunch * 0.38;
          belowCol += vec3(1.0) * smoothstep(0.35, 0.9, vWave) * 0.18;
          vec3 aboveCol = mix(vec3(0.05, 0.22, 0.28), uSky, fres * 0.65 + 0.2);
          aboveCol += c * 0.08;
          vec3 col = mix(belowCol, aboveCol, above);
          float alpha = mix(0.28 + fres * 0.38, 0.72, above);
          float dist = length(cameraPosition - vWorld);
          float f = 1.0 - exp(-pow(dist * uFogDensity, 2.0));
          col = mix(col, uFogColor, clamp(f, 0.0, 1.0));
          alpha *= mix(1.0, 0.15, f);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    })
    const waterGeo = new THREE.PlaneGeometry(2400, 2400, 90, 90)
    waterGeo.rotateX(-Math.PI / 2)
    this.water = new THREE.Mesh(waterGeo, this.waterMat)
    this.water.frustumCulled = false
    this.water.renderOrder = 2
    scene.add(this.water)

    this.plankton = buildPlankton()
    this.plankMat = this.plankton.material as THREE.ShaderMaterial
    scene.add(this.plankton)

    this.bubblePos = new Float32Array(90 * 3)
    const bGeo = new THREE.BufferGeometry()
    bGeo.setAttribute('position', new THREE.BufferAttribute(this.bubblePos, 3))
    bGeo.setDrawRange(0, 0)
    this.bubbles = new THREE.Points(
      bGeo,
      new THREE.PointsMaterial({
        color: '#e7fbff',
        size: 0.28,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      }),
    )
    this.bubbles.frustumCulled = false
    this.bubbles.renderOrder = 4
    scene.add(this.bubbles)

    this.flakePos = new Float32Array(48 * 3)
    const flakeGeo = new THREE.BufferGeometry()
    flakeGeo.setAttribute('position', new THREE.BufferAttribute(this.flakePos, 3))
    flakeGeo.setDrawRange(0, 0)
    this.flakes = new THREE.Points(
      flakeGeo,
      new THREE.PointsMaterial({
        color: '#fff4e4',
        map: scaleDiamond(),
        size: 1.15,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        alphaTest: 0.25,
        sizeAttenuation: true,
      }),
    )
    this.flakes.frustumCulled = false
    this.flakes.renderOrder = 6
    scene.add(this.flakes)

    this.splashMat = new THREE.MeshBasicMaterial({
      color: '#e9f8f8',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    this.splashMesh = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.7, 28), this.splashMat)
    this.splashMesh.rotation.x = -Math.PI / 2
    this.splashMesh.visible = false
    this.splashMesh.renderOrder = 5
    scene.add(this.splashMesh)
  }

  addShafts(scene: THREE.Scene): void {
    const spots: { x: number; z: number; h: number; tint: string }[] = [
      { x: 8, z: 28, h: 20, tint: '#d8fff8' },
      { x: -18, z: 8, h: 18, tint: '#d8fff8' },
      { x: 30, z: 70, h: 22, tint: '#e7fff6' },
      { x: -40, z: -20, h: 16, tint: '#d8fff8' },
      { x: -470, z: 30, h: 26, tint: '#e4f7b0' },
      { x: -540, z: 80, h: 24, tint: '#d5f0a0' },
      { x: -420, z: -10, h: 20, tint: '#e7f7c4' },
      { x: 500, z: -40, h: 22, tint: '#d5e2f4' },
      { x: 600, z: -140, h: 18, tint: '#d0d8ea' },
      { x: 90, z: 360, h: 28, tint: '#d5eef8' },
    ]
    for (const s of spots) {
      const group = new THREE.Group()
      const geo = new THREE.PlaneGeometry(7, s.h, 1, 1)
      geo.translate(0, s.h / 2, 0)
      const mat = shaftMaterial(s.tint, this.uShaft)
      for (const rot of [0, Math.PI / 3, (Math.PI * 2) / 3]) {
        const mesh = new THREE.Mesh(geo, mat)
        mesh.rotation.y = rot
        mesh.renderOrder = 3
        mesh.frustumCulled = false
        group.add(mesh)
      }
      const floor = floorHeight(s.x, s.z)
      group.position.set(s.x, Math.min(-1.2, floor + 2), s.z)
      scene.add(group)
    }
  }

  update(dt: number, camera: THREE.Camera, atmo: Atmosphere, air: boolean): void {
    this.fog.color.copy(atmo.fog)
    this.fog.density = atmo.density
    this.hemi.intensity = atmo.hemi
    this.sun.intensity = atmo.sun
    this.sun.color.copy(atmo.sunColor)
    this.waterMat.uniforms.uFogDensity.value = atmo.density
    this.floorMat.uniforms.uFogDensity.value = atmo.density
    this.uShaft.value = atmo.shafts
    this.skyMat.uniforms.uAlpha.value = air ? 1 : THREE.MathUtils.smoothstep(camera.position.y, -8, -0.4) * 0.35
    ;(this.plankMat.uniforms.uTint.value as THREE.Color).copy(atmo.plankton)
    this.wrapPlankton(camera.position)
    this.updateBubbles(dt)
    this.updateFlakes(dt)
    this.updateSplash(dt)
  }

  setPunch(amount: number): void {
    this.uPunch.value = amount
  }

  splash(x: number, z: number): void {
    this.splashMesh.position.set(x, 0.15, z)
    this.splashMesh.scale.setScalar(1)
    this.splashLife = 1
    this.splashMesh.visible = true
  }

  scales(x: number, y: number, z: number): void {
    for (let i = 0; i < 18; i++) {
      if (this.flakeLife.length > 46) this.flakeLife.shift()
      const ang = Math.random() * Math.PI * 2
      const spd = 1.8 + Math.random() * 4.4
      this.flakeLife.push({
        x,
        y,
        z,
        vx: Math.cos(ang) * spd,
        vy: 0.6 + Math.random() * 3.4,
        vz: Math.sin(ang) * spd,
        life: 0.38 + Math.random() * 0.28,
      })
    }
  }

  burst(x: number, y: number, z: number, n: number): void {
    for (let i = 0; i < n; i++) {
      if (this.bubbleLife.length > 80) this.bubbleLife.shift()
      this.bubbleLife.push({
        x: x + (Math.random() - 0.5) * 0.8,
        y,
        z: z + (Math.random() - 0.5) * 0.8,
        vy: 0.8 + Math.random() * 1.6,
        life: 0.6 + Math.random() * 0.7,
        max: 1,
      })
    }
  }

  private updateBubbles(dt: number): void {
    const next = []
    for (const b of this.bubbleLife) {
      b.life -= dt
      b.y += b.vy * dt
      b.x += Math.sin(b.y * 3) * dt * 0.2
      if (b.life > 0) next.push(b)
    }
    this.bubbleLife = next
    for (let i = 0; i < this.bubbleLife.length; i++) {
      const b = this.bubbleLife[i]
      this.bubblePos[i * 3] = b.x
      this.bubblePos[i * 3 + 1] = b.y
      this.bubblePos[i * 3 + 2] = b.z
    }
    const attr = this.bubbles.geometry.getAttribute('position') as THREE.BufferAttribute
    attr.needsUpdate = true
    this.bubbles.geometry.setDrawRange(0, this.bubbleLife.length)
  }

  private updateFlakes(dt: number): void {
    const next = []
    for (const flake of this.flakeLife) {
      flake.life -= dt
      flake.x += flake.vx * dt
      flake.y += flake.vy * dt
      flake.z += flake.vz * dt
      flake.vy -= 2.4 * dt
      if (flake.life > 0) next.push(flake)
    }
    this.flakeLife = next
    for (let i = 0; i < this.flakeLife.length; i++) {
      const flake = this.flakeLife[i]
      this.flakePos[i * 3] = flake.x
      this.flakePos[i * 3 + 1] = flake.y
      this.flakePos[i * 3 + 2] = flake.z
    }
    const attr = this.flakes.geometry.getAttribute('position') as THREE.BufferAttribute
    attr.needsUpdate = true
    this.flakes.geometry.setDrawRange(0, this.flakeLife.length)
  }

  private updateSplash(dt: number): void {
    if (this.splashLife <= 0) return
    this.splashLife -= dt * 0.8
    const k = 1 - Math.max(this.splashLife, 0)
    this.splashMesh.scale.setScalar(1 + k * 14)
    this.splashMat.opacity = Math.max(0, this.splashLife) * 0.55
    this.splashMesh.visible = this.splashLife > 0
  }

  private wrapPlankton(cam: THREE.Vector3): void {
    const pos = this.plankton.geometry.getAttribute('position') as THREE.BufferAttribute
    const R = 42
    let moved = false
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i)
      let y = pos.getY(i)
      let z = pos.getZ(i)
      let dirty = false
      if (x - cam.x > R) { x -= R * 2; dirty = true }
      if (cam.x - x > R) { x += R * 2; dirty = true }
      if (z - cam.z > R) { z -= R * 2; dirty = true }
      if (cam.z - z > R) { z += R * 2; dirty = true }
      if (y > -1.5) { y = cam.y - 8 - Math.random() * 20; dirty = true }
      if (y < cam.y - 36) { y = cam.y - Math.random() * 10; dirty = true }
      if (dirty) {
        pos.setXYZ(i, x, y, z)
        moved = true
      }
    }
    if (moved) pos.needsUpdate = true
  }
}

function buildFloor(mat: THREE.Material): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(1900, 1900, 150, 150)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.getAttribute('position')
  const colors = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const y = floorHeight(x, z)
    pos.setY(i, y)
    const c = floorColor(x, z, y)
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  return new THREE.Mesh(geo, mat)
}

function buildPlankton(): THREE.Points {
  const count = 280
  const positions = new Float32Array(count * 3)
  const phases = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 80
    positions[i * 3 + 1] = -2 - Math.random() * 28
    positions[i * 3 + 2] = (Math.random() - 0.5) * 80
    phases[i] = Math.random()
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime, uTint: { value: new THREE.Color('#c8f4ee') } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      attribute float aPhase;
      varying float vA;
      void main() {
        vec3 p = position;
        p.y += sin(uTime * 0.35 + aPhase * 8.0) * 0.35;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float tw = 0.35 + 0.65 * abs(sin(uTime * 1.3 + aPhase * 12.0));
        gl_PointSize = (2.2 + aPhase * 3.2) * tw * (160.0 / max(-mv.z, 0.1));
        vA = tw;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTint;
      varying float vA;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = dot(d, d);
        if (r > 0.25) discard;
        float a = smoothstep(0.25, 0.0, r) * vA;
        gl_FragColor = vec4(uTint, a * 0.7);
      }
    `,
  })
  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false
  return points
}

function scaleDiamond(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 32
  canvas.height = 32
  const ctx = canvas.getContext('2d')
  if (!ctx) return new THREE.CanvasTexture(canvas)
  ctx.clearRect(0, 0, 32, 32)
  ctx.fillStyle = '#fff8ee'
  ctx.beginPath()
  ctx.moveTo(16, 2)
  ctx.lineTo(29, 16)
  ctx.lineTo(16, 30)
  ctx.lineTo(3, 16)
  ctx.closePath()
  ctx.fill()
  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true
  return tex
}

function shaftMaterial(tint: string, uStrength: { value: number }): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime,
      uColor: { value: new THREE.Color(tint) },
      uStrength,
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
      void main() {
        float beam = exp(-pow((vUv.x - 0.5) * 2.4, 2.0));
        float fade = smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.35, vUv.y);
        float flicker = 0.78 + 0.22 * sin(uTime * 0.6 + vUv.y * 9.0);
        float a = beam * fade * flicker * 0.16 * uStrength;
        gl_FragColor = vec4(uColor, a);
      }
    `,
  })
}
