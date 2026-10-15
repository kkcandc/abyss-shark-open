import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { floorHeight, OCTOPUS, PEARL, WRECKS, type WreckDef } from './data'
import { mulberry32, uTime } from './util'

export const sceneryFog = {
  color: new THREE.Color('#147e86'),
  density: { value: 0.02 },
}

export class Scenery {
  readonly pearl = new THREE.Vector3()

  constructor(scene: THREE.Scene) {
    scene.add(kelpField(-500, 40, 200, 170, 8, 16, '#0c3a24', '#d7e36a', 11))
    scene.add(kelpField(0, 10, 150, 90, 1.2, 2.4, '#145c3a', '#8dcf72', 21))
    scatterCoral(scene)
    scatterRocks(scene)
    for (const wreck of WRECKS) scene.add(buildWreck(wreck))
    scene.add(buildPearl(this.pearl))
    scene.add(buildOctopusHome())
  }
}

function kelpField(
  cx: number,
  cz: number,
  radius: number,
  count: number,
  minH: number,
  maxH: number,
  base: string,
  tip: string,
  seed: number,
): THREE.InstancedMesh {
  const a = new THREE.PlaneGeometry(0.42, 1, 1, 6)
  a.translate(0, 0.5, 0)
  const b = a.clone()
  b.rotateY(Math.PI / 2)
  const geo = mergeGeometries([a, b])!
  const phases = new Float32Array(count)
  const rand = mulberry32(seed)
  for (let i = 0; i < count; i++) phases[i] = rand() * 10
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1))

  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      uTime,
      uBase: { value: new THREE.Color(base) },
      uTip: { value: new THREE.Color(tip) },
      uFogColor: { value: sceneryFog.color },
      uFogDensity: sceneryFog.density,
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      attribute float aPhase;
      varying float vTip;
      varying vec3 vWorld;
      void main() {
        vTip = position.y;
        vec3 p = position;
        float s = sin(uTime * 0.85 + aPhase) * vTip * vTip;
        p.x += s * 0.2;
        p.z += cos(uTime * 0.62 + aPhase * 1.4) * vTip * vTip * 0.14;
        vec4 world = modelMatrix * instanceMatrix * vec4(p, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uBase;
      uniform vec3 uTip;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      varying float vTip;
      varying vec3 vWorld;
      void main() {
        vec3 col = mix(uBase, uTip, pow(clamp(vTip, 0.0, 1.0), 1.15));
        float dist = length(cameraPosition - vWorld);
        float f = 1.0 - exp(-pow(dist * uFogDensity, 2.0));
        col = mix(col, uFogColor, clamp(f, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  })
  const mesh = new THREE.InstancedMesh(geo, mat, count)
  mesh.frustumCulled = false
  const dummy = new THREE.Object3D()
  let placed = 0
  let guard = 0
  while (placed < count && guard < count * 12) {
    guard++
    const ang = rand() * Math.PI * 2
    const rad = Math.sqrt(rand()) * radius
    const x = cx + Math.cos(ang) * rad
    const z = cz + Math.sin(ang) * rad
    const y = floorHeight(x, z)
    dummy.position.set(x, y, z)
    dummy.rotation.set(0, rand() * Math.PI, 0)
    const h = minH + rand() * (maxH - minH)
    dummy.scale.set(0.7 + rand() * 0.8, h, 0.7 + rand() * 0.8)
    dummy.updateMatrix()
    mesh.setMatrixAt(placed, dummy.matrix)
    placed++
  }
  mesh.count = placed
  return mesh
}

function scatterCoral(scene: THREE.Scene): void {
  const colors = ['#e4818e', '#f0a15a', '#c978e8', '#f4e2bf', '#ff7d62', '#7d5bd6']
  const rand = mulberry32(4)
  const cone = new THREE.ConeGeometry(0.38, 1.5, 6)
  cone.translate(0, 0.75, 0)
  const ball = new THREE.SphereGeometry(0.55, 8, 6)
  const cones = new THREE.InstancedMesh(
    cone,
    new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0.02 }),
    80,
  )
  const balls = new THREE.InstancedMesh(
    ball,
    new THREE.MeshStandardMaterial({ roughness: 0.64, metalness: 0.03 }),
    40,
  )
  const dummy = new THREE.Object3D()
  const color = new THREE.Color()
  for (let i = 0; i < 80; i++) {
    const ang = rand() * Math.PI * 2
    const rad = 12 + rand() * 150
    const x = Math.cos(ang) * rad
    const z = Math.sin(ang) * rad * 0.85
    const y = floorHeight(x, z)
    dummy.position.set(x, y, z)
    dummy.rotation.set((rand() - 0.5) * 0.4, rand() * 6, (rand() - 0.5) * 0.4)
    const s = 0.6 + rand() * 1.8
    dummy.scale.set(s, s * (0.8 + rand()), s)
    dummy.updateMatrix()
    cones.setMatrixAt(i, dummy.matrix)
    cones.setColorAt(i, color.set(colors[i % colors.length]))
  }
  for (let i = 0; i < 40; i++) {
    const ang = rand() * Math.PI * 2
    const rad = 8 + rand() * 140
    const x = Math.cos(ang) * rad
    const z = Math.sin(ang) * rad
    const y = floorHeight(x, z) + 0.2
    dummy.position.set(x, y, z)
    dummy.rotation.set(0, rand() * 3, 0)
    const s = 0.5 + rand() * 1.3
    dummy.scale.set(s, s * 0.65, s)
    dummy.updateMatrix()
    balls.setMatrixAt(i, dummy.matrix)
    balls.setColorAt(i, color.set(colors[(i * 3) % colors.length]))
  }
  if (cones.instanceColor) cones.instanceColor.needsUpdate = true
  if (balls.instanceColor) balls.instanceColor.needsUpdate = true
  cones.frustumCulled = false
  balls.frustumCulled = false
  scene.add(cones, balls)
}

function scatterRocks(scene: THREE.Scene): void {
  const geo = new THREE.DodecahedronGeometry(1, 0)
  const mat = new THREE.MeshStandardMaterial({ color: '#3c463f', roughness: 0.92 })
  const mesh = new THREE.InstancedMesh(geo, mat, 70)
  const rand = mulberry32(9)
  const dummy = new THREE.Object3D()
  const spots = [
    { x: 0, z: 0, r: 180, n: 28 },
    { x: 540, z: -90, r: 180, n: 18 },
    { x: 70, z: 500, r: 140, n: 12 },
    { x: -200, z: 180, r: 80, n: 12 },
  ]
  let i = 0
  for (const s of spots) {
    for (let n = 0; n < s.n && i < 70; n++, i++) {
      const ang = rand() * Math.PI * 2
      const rad = rand() * s.r
      const x = s.x + Math.cos(ang) * rad
      const z = s.z + Math.sin(ang) * rad
      const y = floorHeight(x, z)
      dummy.position.set(x, y + 0.2, z)
      dummy.rotation.set(rand(), rand(), rand())
      const sc = 0.6 + rand() * 2.4
      dummy.scale.set(sc, sc * (0.5 + rand() * 0.6), sc)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
  }
  mesh.count = i
  mesh.frustumCulled = false
  scene.add(mesh)
}

function buildWreck(def: WreckDef): THREE.Group {
  const g = new THREE.Group()
  const y = floorHeight(def.x, def.z)
  g.position.set(def.x, y + 1.6, def.z)
  g.rotation.y = def.rot

  const wood = new THREE.MeshStandardMaterial({ color: '#6b4a32', roughness: 0.86 })
  const iron = new THREE.MeshStandardMaterial({ color: '#3e4650', roughness: 0.55, metalness: 0.45 })
  const rust = new THREE.MeshStandardMaterial({ color: '#7a3e2a', roughness: 0.8, metalness: 0.2 })
  const gilt = new THREE.MeshStandardMaterial({ color: '#b08948', roughness: 0.42, metalness: 0.55 })
  const dark = new THREE.MeshStandardMaterial({ color: '#1b1e22', roughness: 0.7 })

  if (def.style === 'clipper') {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(22, 4.2, 5.4), wood)
    hull.rotation.z = def.list
    g.add(hull)
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 11, 6), wood)
    mast.position.set(-2, 6, 0)
    mast.rotation.z = 0.55
    g.add(mast)
    const mast2 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 7, 6), wood)
    mast2.position.set(6, 3.2, 0.2)
    mast2.rotation.z = -0.9
    g.add(mast2)
    const bow = new THREE.Mesh(new THREE.ConeGeometry(2.4, 5, 4), wood)
    bow.rotation.z = -Math.PI / 2
    bow.position.set(12.5, 0.2, 0)
    g.add(bow)
  } else if (def.style === 'steamer') {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(26, 5, 7), iron)
    hull.rotation.z = def.list
    g.add(hull)
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 5), rust)
    cabin.position.set(-2, 3.6, 0)
    g.add(cabin)
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.85, 6, 8), rust)
    stack.position.set(4, 2.2, 1.2)
    stack.rotation.z = Math.PI / 2.4
    g.add(stack)
    for (let i = -2; i <= 2; i++) {
      const port = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 8, 6),
        new THREE.MeshStandardMaterial({ color: '#9fd0c8', emissive: '#6aa89a', emissiveIntensity: 0.4 }),
      )
      port.position.set(-6 + i * 2.2, 0.4, 3.2)
      g.add(port)
    }
  } else {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(16, 3.4, 4.4), wood)
    hull.rotation.z = def.list
    g.add(hull)
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(5, 2.4, 3.2), gilt)
    cabin.position.set(-1, 2.6, 0)
    g.add(cabin)
    const keel = new THREE.Mesh(new THREE.BoxGeometry(15, 0.35, 0.4), gilt)
    keel.position.set(0, -1.8, 0)
    g.add(keel)
    const bow = new THREE.Mesh(new THREE.ConeGeometry(1.8, 4, 4), gilt)
    bow.rotation.z = -Math.PI / 2
    bow.position.set(9, 1.4, 0)
    bow.rotation.y = 0.4
    g.add(bow)
  }

  for (let i = 0; i < 4; i++) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), dark)
    crate.position.set(-4 + i * 1.6, 2.4, (i % 2) * 1.2 - 0.4)
    crate.rotation.y = i
    g.add(crate)
  }

  const glow = new THREE.PointLight('#ffb37a', def.style === 'steamer' ? 3 : 1.4, 16, 2)
  glow.position.set(0, 2, 0)
  g.add(glow)
  return g
}

function buildPearl(out: THREE.Vector3): THREE.Group {
  const g = new THREE.Group()
  const y = floorHeight(PEARL.x, PEARL.z)
  g.position.set(PEARL.x, y, PEARL.z)
  out.set(PEARL.x, y + 1.3, PEARL.z)
  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(1.1, 0),
    new THREE.MeshStandardMaterial({ color: '#6d5a68', roughness: 0.8 }),
  )
  rock.scale.set(2.2, 0.7, 2.2)
  g.add(rock)
  const pearl = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 24, 18),
    new THREE.MeshStandardMaterial({
      color: '#f7f1e6',
      emissive: '#d9c6ff',
      emissiveIntensity: 0.7,
      roughness: 0.18,
      metalness: 0.12,
    }),
  )
  pearl.position.y = 1.15
  g.add(pearl)
  const light = new THREE.PointLight('#f0e4ff', 6, 14, 2)
  light.position.y = 1.3
  g.add(light)
  const coralMat = new THREE.MeshStandardMaterial({ color: '#e7a0c4', roughness: 0.6 })
  for (let i = 0; i < 8; i++) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.18, 1.3, 5), coralMat)
    const a = (i / 8) * Math.PI * 2
    c.position.set(Math.cos(a) * 1.5, 0.4, Math.sin(a) * 1.5)
    c.rotation.z = Math.cos(a) * 0.3
    g.add(c)
  }
  return g
}

function buildOctopusHome(): THREE.Group {
  const g = new THREE.Group()
  const y = floorHeight(OCTOPUS.x, OCTOPUS.z)
  g.position.set(OCTOPUS.x, y + 0.4, OCTOPUS.z)
  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(1.4, 0),
    new THREE.MeshStandardMaterial({ color: '#2d4034', roughness: 0.9 }),
  )
  rock.scale.set(1.6, 0.7, 1.3)
  g.add(rock)
  return g
}
