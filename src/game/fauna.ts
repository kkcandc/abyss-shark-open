import * as THREE from 'three'
import {
  floorHeight,
  OCTOPUS,
  SCHOOLS,
  speciesBy,
  stageIndex,
  TURTLES,
  type Species,
} from './data'
import { fishGeometry } from './geo'
import type { Shark } from './shark'
import { AXIS_Z, clamp, uTime } from './util'

interface Fish {
  species: Species
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  homeX: number
  homeY: number
  homeZ: number
  phase: number
  alive: boolean
  respawn: number
}

interface School {
  species: Species
  mesh: THREE.InstancedMesh
  fish: Fish[]
  lure?: THREE.InstancedMesh
}

export interface Scan {
  eat: Fish | null
  hint: Fish | null
  denied: Fish | null
  respect: string | null
}

export class Fauna {
  readonly whalePos = new THREE.Vector3()
  readonly mantaPos = new THREE.Vector3()
  readonly turtlePos: THREE.Vector3[] = []
  readonly jellyPos: THREE.Vector3[] = []
  private schools: School[] = []
  private whale: THREE.Group
  private whaleTail: THREE.Object3D
  private manta: THREE.Group
  private turtles: THREE.Group[] = []
  private turtleTargets: THREE.Vector3[] = []
  private octopus: THREE.Group
  private octopusLegs: THREE.Object3D[] = []
  private jellies: THREE.Group[] = []
  private anglerLight: THREE.PointLight
  private whaleAng = 0.6
  private mantaAng = 1.2
  private dummy = new THREE.Object3D()
  private mouth = new THREE.Vector3()

  constructor(scene: THREE.Scene) {
    const geo = fishGeometry()
    const bySpecies = new Map<string, School>()
    for (const spawn of SCHOOLS) {
      const species = speciesBy(spawn.species)
      let school = bySpecies.get(species.id)
      if (!school) {
        const mat = new THREE.MeshStandardMaterial({
          color: species.color,
          roughness: 0.45,
          metalness: 0.08,
          emissive: species.emissive ?? '#000000',
          emissiveIntensity: species.emissive ? 0.15 : 0,
        })
        mat.onBeforeCompile = (shader) => {
          shader.uniforms.uTime = uTime
          shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            '#include <common>\nuniform float uTime;',
          )
          shader.vertexShader = shader.vertexShader.replace(
            'vec3 transformed = vec3( position );',
            `vec3 transformed = vec3( position );
             float tail = smoothstep(0.05, -0.55, position.z);
             transformed.x += sin(uTime * 7.0 + float(gl_InstanceID)) * tail * 0.25;`,
          )
        }
        const mesh = new THREE.InstancedMesh(geo, mat, 80)
        mesh.frustumCulled = false
        mesh.count = 0
        scene.add(mesh)
        school = { species, mesh, fish: [] }
        if (species.id === 'angler') {
          const lure = new THREE.InstancedMesh(
            new THREE.SphereGeometry(0.16, 8, 6),
            new THREE.MeshStandardMaterial({
              color: '#eaffc2',
              emissive: '#c6ff6a',
              emissiveIntensity: 2.2,
              roughness: 0.3,
            }),
            80,
          )
          lure.frustumCulled = false
          lure.count = 0
          scene.add(lure)
          school.lure = lure
        }
        bySpecies.set(species.id, school)
        this.schools.push(school)
      }
      for (let i = 0; i < spawn.count; i++) {
        const a = Math.random() * Math.PI * 2
        const r = Math.random() * spawn.radius
        school.fish.push({
          species,
          x: spawn.x + Math.cos(a) * r,
          y: spawn.y,
          z: spawn.z + Math.sin(a) * r,
          vx: Math.cos(a),
          vy: 0,
          vz: Math.sin(a),
          homeX: spawn.x,
          homeY: spawn.y,
          homeZ: spawn.z,
          phase: Math.random() * 10,
          alive: true,
          respawn: 0,
        })
      }
      school.mesh.count = school.fish.length
      if (school.lure) school.lure.count = school.fish.length
    }

    this.whaleTail = new THREE.Group()
    this.whale = buildWhale(this.whaleTail)
    scene.add(this.whale)
    this.manta = buildManta()
    scene.add(this.manta)
    for (const t of TURTLES) {
      const turtle = buildTurtle()
      const y = Math.max(floorHeight(t.x, t.z) + 2.2, -12)
      turtle.position.set(t.x, y, t.z)
      scene.add(turtle)
      this.turtles.push(turtle)
      this.turtlePos.push(turtle.position)
      this.turtleTargets.push(new THREE.Vector3(t.x, y, t.z))
    }
    this.octopus = buildOctopus(this.octopusLegs)
    const oy = floorHeight(OCTOPUS.x, OCTOPUS.z) + 1.15
    this.octopus.position.set(OCTOPUS.x, oy, OCTOPUS.z)
    scene.add(this.octopus)
    for (let i = 0; i < 12; i++) {
      const jelly = buildJelly(i)
      scene.add(jelly)
      this.jellies.push(jelly)
      this.jellyPos.push(jelly.position)
    }
    this.anglerLight = new THREE.PointLight('#c6ff6a', 0, 12, 2)
    scene.add(this.anglerLight)
    this.syncFish()
  }

  update(dt: number, shark: Shark, passive: boolean): void {
    for (const school of this.schools) {
      for (const f of school.fish) this.stepFish(f, dt, shark, passive)
    }
    this.syncFish()
    this.stepWhale(dt)
    this.stepManta(dt)
    this.stepTurtles(dt)
    this.stepOctopus()
    this.stepJellies()
    this.stepLure(shark)
  }

  scan(shark: Shark, lunging: boolean): Scan {
    shark.mouth(this.mouth)
    let eat: Fish | null = null
    let eatD = Infinity
    let hint: Fish | null = null
    let hintD = Infinity
    let denied: Fish | null = null
    let deniedD = Infinity
    const stage = stageIndex(shark.growth)
    for (const school of this.schools) {
      for (const f of school.fish) {
        if (!f.alive) continue
        const dx = f.x - this.mouth.x
        const dy = f.y - this.mouth.y
        const dz = f.z - this.mouth.z
        const d = Math.hypot(dx, dy, dz)
        const dot = (dx * shark.forward.x + dy * shark.forward.y + dz * shark.forward.z) / (d + 0.0001)
        if (dot < 0.05 && d > 2) continue
        if (stage < f.species.minStage) {
          if (d < 3.4 * shark.scale && d < deniedD) {
            denied = f
            deniedD = d
          }
          continue
        }
        const contact = (f.species.tier === 'small' ? 4.4 : lunging ? 6.2 : 0) * shark.scale
        if (contact > 0 && d < contact && d < eatD && (f.species.tier === 'small' || dot > 0.25)) {
          eat = f
          eatD = d
        }
        if (d < 10 * shark.scale && d < hintD && dot > 0.4) {
          hint = f
          hintD = d
        }
      }
    }
    let respect: string | null = null
    if (!eat && (lunging || true)) {
      const nearTurtle = this.turtles.some((t) => t.position.distanceTo(this.mouth) < 2.4 * shark.scale)
      if (nearTurtle && lunging) respect = 'You let the ancient one pass.'
      else if (this.octopus.position.distanceTo(this.mouth) < 2.6 * shark.scale && lunging) respect = 'The gardener stays.'
      else if (this.whale.position.distanceTo(shark.position) < 10 && lunging) respect = 'Even now, you are small beside it.'
    }
    return { eat, hint, denied, respect }
  }

  eat(fish: Fish): void {
    fish.alive = false
    fish.respawn = fish.species.respawn * (0.75 + Math.random() * 0.6)
  }

  nearestAngler(from: THREE.Vector3): number {
    let best = Infinity
    for (const school of this.schools) {
      if (school.species.id !== 'angler') continue
      for (const f of school.fish) {
        if (!f.alive) continue
        best = Math.min(best, Math.hypot(f.x - from.x, f.y - from.y, f.z - from.z))
      }
    }
    return best
  }

  private stepFish(f: Fish, dt: number, shark: Shark, passive: boolean): void {
    if (!f.alive) {
      f.respawn -= dt
      if (f.respawn <= 0) {
        const a = Math.random() * Math.PI * 2
        const r = Math.random() * 8
        f.alive = true
        f.x = f.homeX + Math.cos(a) * r
        f.z = f.homeZ + Math.sin(a) * r
        f.y = f.homeY
        f.vx = Math.cos(a)
        f.vz = Math.sin(a)
      }
      return
    }
    f.phase += dt
    let ax = (f.homeX - f.x) * 0.18 + Math.sin(f.phase * 0.7) * 1.6
    let ay = (f.homeY - f.y) * 0.25
    let az = (f.homeZ - f.z) * 0.18 + Math.cos(f.phase * 0.63 + 1.7) * 1.6
    const sdx = f.x - shark.position.x
    const sdy = f.y - shark.position.y
    const sdz = f.z - shark.position.z
    const sd = Math.hypot(sdx, sdy, sdz) + 0.001
    const fleeR = f.species.flee * (0.7 + shark.scale * 0.25)
    let fleeing = false
    if (!passive && sd < fleeR) {
      const m = (1 - sd / fleeR) * f.species.speed * 2.4
      ax += (sdx / sd) * m
      ay += (sdy / sd) * m * 0.25
      az += (sdz / sd) * m
      fleeing = true
    }
    f.vx = f.vx * 0.9 + ax * dt
    f.vy = f.vy * 0.88 + ay * dt
    f.vz = f.vz * 0.9 + az * dt
    const sp = Math.hypot(f.vx, f.vy, f.vz)
    const maxS = f.species.speed * (fleeing ? 1.28 : 1)
    if (sp > maxS) {
      const k = maxS / sp
      f.vx *= k
      f.vy *= k
      f.vz *= k
    }
    f.x += f.vx * dt
    f.y += f.vy * dt
    f.z += f.vz * dt
    const floor = floorHeight(f.x, f.z) + 1.3
    if (f.y < floor) f.y = floor
    if (f.y > -2.2) f.y = -2.2
  }

  private syncFish(): void {
    for (const school of this.schools) {
      school.fish.forEach((f, i) => {
        const vel = _vel.set(f.vx, f.vy, f.vz)
        if (vel.lengthSq() < 1e-4) vel.set(0, 0, 1)
        vel.normalize()
        this.dummy.position.set(f.x, f.y, f.z)
        if (vel.dot(AXIS_Z) < -0.999) this.dummy.quaternion.setFromAxisAngle(_y, Math.PI)
        else this.dummy.quaternion.setFromUnitVectors(AXIS_Z, vel)
        const s = f.species.scale
        this.dummy.scale.set(f.alive ? s[0] : 0, f.alive ? s[1] : 0, f.alive ? s[2] : 0)
        this.dummy.updateMatrix()
        school.mesh.setMatrixAt(i, this.dummy.matrix)
        if (school.lure) {
          this.dummy.position.addScaledVector(vel, 0.55)
          this.dummy.scale.setScalar(f.alive ? 1 : 0)
          this.dummy.updateMatrix()
          school.lure.setMatrixAt(i, this.dummy.matrix)
        }
      })
      school.mesh.instanceMatrix.needsUpdate = true
      if (school.lure) school.lure.instanceMatrix.needsUpdate = true
    }
  }

  private stepWhale(dt: number): void {
    this.whaleAng += dt * 0.045
    const x = -140 + Math.cos(this.whaleAng) * 380
    const z = 280 + Math.sin(this.whaleAng) * 250
    const y = -32 + Math.sin(this.whaleAng * 2) * 3.5
    const prev = this.whale.position.clone()
    this.whale.position.set(x, y, z)
    this.whalePos.copy(this.whale.position)
    const dir = _vel.set(x - prev.x, y - prev.y, z - prev.z)
    if (dir.lengthSq() > 1e-6) {
      dir.normalize()
      if (dir.dot(AXIS_Z) < -0.999) this.whale.quaternion.setFromAxisAngle(_y, Math.PI)
      else this.whale.quaternion.setFromUnitVectors(AXIS_Z, dir)
    }
    this.whaleTail.rotation.y = Math.sin(uTime.value * 0.8) * 0.28
  }

  private stepManta(dt: number): void {
    this.mantaAng += dt * 0.16
    const x = Math.cos(this.mantaAng) * 78
    const z = Math.sin(this.mantaAng * 0.85) * 48
    const y = -11.5 + Math.sin(this.mantaAng * 2) * 1.2
    const prev = this.manta.position.clone()
    this.manta.position.set(x, Math.max(y, floorHeight(x, z) + 3), z)
    this.mantaPos.copy(this.manta.position)
    const dir = _vel.set(x - prev.x, 0, z - prev.z)
    if (dir.lengthSq() > 1e-6) {
      dir.normalize()
      this.manta.quaternion.setFromUnitVectors(AXIS_Z, dir)
      this.manta.rotateZ(Math.sin(uTime.value * 0.9) * 0.18)
    }
  }

  private stepTurtles(dt: number): void {
    this.turtles.forEach((turtle, i) => {
      const target = this.turtleTargets[i]
      if (turtle.position.distanceTo(target) < 2) {
        const a = Math.random() * Math.PI * 2
        const r = 10 + Math.random() * 28
        target.set(Math.cos(a) * r, turtle.position.y, Math.sin(a) * r)
      }
      const dir = _vel.copy(target).sub(turtle.position)
      dir.y = 0
      if (dir.lengthSq() > 0.01) {
        dir.normalize()
        turtle.position.addScaledVector(dir, dt * 1.3)
        turtle.quaternion.setFromUnitVectors(AXIS_Z, dir)
      }
      const floor = floorHeight(turtle.position.x, turtle.position.z) + 2
      turtle.position.y = Math.min(-6, Math.max(floor, -14))
    })
  }

  private stepOctopus(): void {
    this.octopusLegs.forEach((leg, i) => {
      leg.rotation.x = Math.sin(uTime.value * 0.8 + i) * 0.25
      leg.rotation.z = Math.cos(uTime.value * 0.6 + i * 0.7) * 0.3
    })
  }

  private stepJellies(): void {
    this.jellies.forEach((jelly, i) => {
      const baseA = i * 0.9
      const rad = 30 + (i % 5) * 18
      const x = 70 + Math.cos(uTime.value * 0.08 + baseA) * rad
      const z = 640 + Math.sin(uTime.value * 0.07 + baseA) * rad
      const y = -48 - (i % 4) * 12 + Math.sin(uTime.value * 0.5 + i) * 2.2
      jelly.position.set(x, Math.max(y, floorHeight(x, z) + 4), z)
    })
  }

  private stepLure(shark: Shark): void {
    let best = Infinity
    let bx = 0
    let by = 0
    let bz = 0
    for (const school of this.schools) {
      if (school.species.id !== 'angler') continue
      for (const f of school.fish) {
        if (!f.alive) continue
        const d = Math.hypot(f.x - shark.position.x, f.y - shark.position.y, f.z - shark.position.z)
        if (d < best) {
          best = d
          bx = f.x
          by = f.y
          bz = f.z
        }
      }
    }
    if (best < 42) {
      this.anglerLight.position.set(bx, by, bz)
      this.anglerLight.intensity = clamp(8 - best * 0.12, 1.5, 8)
    } else {
      this.anglerLight.intensity = 0
    }
  }
}

const _vel = new THREE.Vector3()
const _y = new THREE.Vector3(0, 1, 0)

function buildWhale(tail: THREE.Object3D): THREE.Group {
  const g = new THREE.Group()
  const bodyMat = new THREE.MeshStandardMaterial({ color: '#5b7382', roughness: 0.62, metalness: 0.04 })
  const bellyMat = new THREE.MeshStandardMaterial({ color: '#d5dee2', roughness: 0.7 })
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 22, 16), bodyMat)
  body.scale.set(2.3, 1.7, 8.4)
  g.add(body)
  const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), bellyMat)
  belly.scale.set(1.6, 0.72, 6.4)
  belly.position.y = -0.85
  g.add(belly)
  const head = new THREE.Mesh(new THREE.SphereGeometry(1.35, 16, 12), bodyMat)
  head.scale.set(1.2, 0.95, 1.45)
  head.position.z = 7.1
  g.add(head)
  tail.position.set(0, 0, -7.6)
  const fluke = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.18, 2.1), bodyMat)
  fluke.position.z = -1.2
  tail.add(fluke)
  g.add(tail)
  for (const side of [-1, 1]) {
    const pec = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 1.1), bodyMat)
    pec.position.set(1.8 * side, -0.4, 1.5)
    pec.rotation.z = side * -0.4
    pec.rotation.y = side * 0.3
    g.add(pec)
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 6),
      new THREE.MeshStandardMaterial({ color: '#111' }),
    )
    eye.position.set(0.7 * side, 0.35, 7.6)
    g.add(eye)
  }
  return g
}

function buildManta(): THREE.Group {
  const g = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: '#243038', roughness: 0.45, metalness: 0.08 })
  const belly = new THREE.MeshStandardMaterial({ color: '#e7e1d4', roughness: 0.55 })
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), mat)
  body.scale.set(1.3, 0.22, 1.6)
  g.add(body)
  const under = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), belly)
  under.scale.set(0.9, 0.12, 1.2)
  under.position.y = -0.08
  g.add(under)
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), mat)
    wing.scale.set(2.6, 0.08, 1.3)
    wing.position.x = 2.2 * side
    g.add(wing)
  }
  return g
}

function buildTurtle(): THREE.Group {
  const g = new THREE.Group()
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 12, 10),
    new THREE.MeshStandardMaterial({ color: '#6d7a3e', roughness: 0.75 }),
  )
  shell.scale.set(1.1, 0.55, 1.35)
  g.add(shell)
  const belly = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 10, 8),
    new THREE.MeshStandardMaterial({ color: '#e6d2a2', roughness: 0.6 }),
  )
  belly.scale.y = 0.4
  belly.position.y = -0.2
  g.add(belly)
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 8, 6),
    new THREE.MeshStandardMaterial({ color: '#c4b48a', roughness: 0.6 }),
  )
  head.position.set(0, 0, 0.85)
  g.add(head)
  const flip = new THREE.MeshStandardMaterial({ color: '#b7a56f', roughness: 0.6, side: THREE.DoubleSide })
  for (const [x, z] of [
    [0.7, 0.25],
    [-0.7, 0.25],
    [0.45, -0.45],
    [-0.45, -0.45],
  ] as const) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, 0.22), flip)
    fin.position.set(x, -0.05, z)
    g.add(fin)
  }
  return g
}

function buildOctopus(legs: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: '#7a3048', roughness: 0.55 })
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 12), mat)
  head.scale.y = 0.8
  head.position.y = 0.35
  g.add(head)
  for (let i = 0; i < 8; i++) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 1.1, 5), mat)
    const a = (i / 8) * Math.PI * 2
    leg.position.set(Math.cos(a) * 0.32, -0.15, Math.sin(a) * 0.32)
    leg.rotation.z = Math.cos(a) * 0.6
    leg.rotation.x = Math.sin(a) * 0.6
    g.add(leg)
    legs.push(leg)
  }
  const eyeMat = new THREE.MeshStandardMaterial({ color: '#f2e6c8' })
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), eyeMat)
    eye.position.set(0.16 * side, 0.45, 0.42)
    g.add(eye)
  }
  return g
}

function buildJelly(i: number): THREE.Group {
  const g = new THREE.Group()
  const hue = i % 2 === 0 ? '#7a5cff' : '#3ad0c2'
  const bell = new THREE.Mesh(
    new THREE.SphereGeometry(0.8, 14, 10),
    new THREE.MeshStandardMaterial({
      color: hue,
      emissive: hue,
      emissiveIntensity: 1.4,
      transparent: true,
      opacity: 0.82,
      roughness: 0.25,
    }),
  )
  bell.scale.y = 0.55
  g.add(bell)
  const tent = new THREE.MeshStandardMaterial({
    color: hue,
    emissive: hue,
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
  })
  for (let t = 0; t < 4; t++) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 1.8), tent)
    const a = (t / 4) * Math.PI * 2
    strip.position.set(Math.cos(a) * 0.2, -1.1, Math.sin(a) * 0.2)
    g.add(strip)
  }
  return g
}
