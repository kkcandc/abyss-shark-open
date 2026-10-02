import * as THREE from 'three'
import { STAGES, floorHeight, stageIndex, stageScale, WORLD_LIMIT } from './data'
import { finShape, latheBody } from './geo'
import { alignZ, clamp, lerp, wrapAngle } from './util'

export interface SwimInput {
  yaw: number
  pitch: number
  thrust: number
  sprint: boolean
  mouseX: number
  mouseY: number
  lunge: boolean
}

export class Shark {
  readonly group = new THREE.Group()
  readonly position = new THREE.Vector3(0, -10, -6)
  readonly forward = new THREE.Vector3(0, 0, 1)
  yaw = 0
  pitch = 0
  roll = 0
  speed = 8
  scale = 1
  growth = 0
  lunge = 0
  bite = 0
  air = false
  vy = 0
  nose = 0.86

  private tail: THREE.Group
  private jaw: THREE.Object3D
  private bodyMat: THREE.MeshStandardMaterial
  private finMat: THREE.MeshStandardMaterial
  private scar: THREE.Mesh
  private lungeCd = 0
  private attractAng = 0.4
  private readonly q = new THREE.Quaternion()
  private readonly white = new THREE.Color('#ffffff')
  private readonly tint = new THREE.Color()

  constructor(scene: THREE.Scene) {
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.42,
      metalness: 0.08,
      emissive: '#24343e',
      emissiveIntensity: 0.18,
      vertexColors: true,
    })
    this.finMat = new THREE.MeshStandardMaterial({
      color: STAGES[0].fin,
      roughness: 0.48,
      metalness: 0.05,
      emissive: '#1c2a34',
      emissiveIntensity: 0.12,
      side: THREE.DoubleSide,
    })

    const body = new THREE.Mesh(
      latheBody({
        stations: 20,
        seg: 14,
        nose: this.nose,
        tail: -0.98,
        dorsal: new THREE.Color('#9aafbf'),
        belly: new THREE.Color('#f4f8f6'),
        radius(t) {
          let rx: number
          let ry: number
          if (t < 0.16) {
            const k = t / 0.16
            rx = 0.012 + k * 0.07
            ry = 0.01 + k * 0.055
          } else if (t < 0.46) {
            const k = (t - 0.16) / 0.3
            const s = Math.sin(k * Math.PI * 0.5)
            rx = 0.082 + s * 0.1
            ry = 0.065 + s * 0.07
          } else if (t < 0.78) {
            const k = (t - 0.46) / 0.32
            rx = 0.182 - k * 0.09
            ry = 0.135 - k * 0.07
          } else {
            const k = (t - 0.78) / 0.22
            rx = 0.092 * (1 - k) + 0.012
            ry = 0.065 * (1 - k) + 0.01
          }
          return { rx, ry }
        },
      }),
      this.bodyMat,
    )
    this.group.add(body)

    const dorsal = new THREE.Mesh(
      finShape([
        [0, 0],
        [0.5, 0.02],
        [0.16, 0.62],
        [-0.16, 0.06],
      ]),
      this.finMat,
    )
    dorsal.rotation.y = -Math.PI / 2
    dorsal.position.set(0, 0.1, -0.05)
    this.group.add(dorsal)

    const pec = new THREE.Mesh(
      finShape([
        [0, 0],
        [0.72, -0.02],
        [0.78, -0.22],
        [0.18, -0.12],
      ]),
      this.finMat,
    )
    pec.position.set(0.14, -0.03, 0.16)
    pec.rotation.set(-1.15, 0.15, -0.35)
    this.group.add(pec)
    const pecL = pec.clone()
    pecL.position.x = -0.14
    pecL.rotation.z = 0.35
    pecL.rotation.y = -0.15
    this.group.add(pecL)

    this.tail = new THREE.Group()
    this.tail.position.set(0, 0.01, -0.86)
    const caudal = new THREE.Mesh(
      finShape([
        [0, 0],
        [0.78, 0.72],
        [0.34, 0.18],
        [0.62, -0.42],
        [0.08, -0.08],
      ]),
      this.finMat,
    )
    caudal.rotation.y = Math.PI / 2
    this.tail.add(caudal)
    this.group.add(this.tail)

    this.jaw = new THREE.Mesh(
      finShape([
        [0, 0],
        [0.34, 0.01],
        [0.3, -0.08],
        [0.04, -0.05],
      ]),
      this.finMat,
    )
    this.jaw.rotation.y = -Math.PI / 2
    this.jaw.position.set(0, -0.045, 0.48)
    this.group.add(this.jaw)

    const eyeMat = new THREE.MeshStandardMaterial({ color: '#101418', roughness: 0.25, metalness: 0.2 })
    const white = new THREE.MeshStandardMaterial({ color: '#f4f7f6', roughness: 0.35 })
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 10), white)
      eye.position.set(0.07 * side, 0.035, 0.58)
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), eyeMat)
      pupil.position.set(0.012 * side, 0, 0.02)
      eye.add(pupil)
      this.group.add(eye)
    }

    const scarGeo = new THREE.BoxGeometry(0.012, 0.02, 0.34)
    const scarMat = new THREE.MeshStandardMaterial({ color: '#d9d4c8', roughness: 0.6 })
    this.scar = new THREE.Mesh(scarGeo, scarMat)
    this.scar.position.set(0.1, 0.06, 0.05)
    this.scar.rotation.y = 0.15
    this.scar.visible = false
    this.group.add(this.scar)

    scene.add(this.group)
    this.applyGrowth(0, true)
    this.syncMesh(0)
  }

  mouth(target: THREE.Vector3): THREE.Vector3 {
    return target.copy(this.position).addScaledVector(this.forward, this.nose * this.scale * 0.92)
  }

  reset(x: number, y: number, z: number, yaw: number, pitch: number, growth: number): void {
    this.position.set(x, y, z)
    this.yaw = yaw
    this.pitch = pitch
    this.roll = 0
    this.speed = 8
    this.air = false
    this.vy = 0
    this.lunge = 0
    this.growth = growth
    this.applyGrowth(growth, true)
    this.writeForward()
    this.syncMesh(0)
  }

  attract(dt: number): void {
    this.attractAng += dt * 0.22
    const rad = 20
    this.position.x = Math.cos(this.attractAng) * rad
    this.position.z = 26 + Math.sin(this.attractAng) * rad
    this.position.y = -9.2 + Math.sin(this.attractAng * 2) * 0.7
    const tx = -Math.sin(this.attractAng)
    const tz = Math.cos(this.attractAng)
    this.yaw = Math.atan2(tx, tz)
    this.pitch = Math.sin(this.attractAng * 1.6) * 0.05
    this.speed = 7
    this.roll = Math.sin(this.attractAng) * 0.18
    this.writeForward()
    this.applyGrowth(this.growth, false)
  }

  swim(dt: number, input: SwimInput, stamina: number, regenMul = 1): { stamina: number; lunged: boolean } {
    const stage = stageIndex(this.growth)
    const yawRate = 1.35 - stage * 0.1
    const pitchRate = 0.95
    this.yaw += input.yaw * yawRate * dt
    this.yaw -= input.mouseX * 0.00235
    const pitching = input.pitch !== 0 || Math.abs(input.mouseY) > 0
    this.pitch += input.pitch * pitchRate * dt
    this.pitch -= input.mouseY * 0.0017
    if (!pitching && !this.air) this.pitch *= Math.exp(-0.45 * dt)
    this.pitch = clamp(this.pitch, -1.05, 0.95)

    const cruise = 9.4 + stage * 1.15
    const sprint = 17 + stage * 1.55
    let lunged = false
    this.lungeCd = Math.max(0, this.lungeCd - dt)
    if (input.lunge && this.lungeCd <= 0 && stamina >= 24 && !this.air) {
      this.lunge = 0.36
      this.lungeCd = 0.55
      stamina -= 24
      lunged = true
      this.speed = Math.max(this.speed, sprint * 0.95)
    }
    if (this.lunge > 0) this.lunge = Math.max(0, this.lunge - dt)

    const bursting = input.sprint && input.thrust >= 0 && stamina > 6 && this.lunge <= 0
    let target = cruise * 0.78
    if (input.thrust > 0) target = cruise * 1.08
    if (bursting) target = sprint
    if (input.thrust < 0) target = cruise * 0.42
    if (this.lunge > 0) target = sprint
    const accel = bursting || this.lunge > 0 ? 16 : 7
    if (this.speed < target) this.speed = Math.min(target, this.speed + accel * dt)
    else this.speed = Math.max(target, this.speed - accel * 0.7 * dt)

    if (bursting) stamina = Math.max(0, stamina - 20 * dt)
    else if (this.lunge <= 0) {
      const regen = stamina < 100 ? 13 * regenMul : 0
      stamina = Math.min(100, stamina + regen * dt)
    }

    const yawVel = input.yaw * yawRate - input.mouseX * 0.00235 / Math.max(dt, 0.001)
    const targetRoll = clamp(-yawVel * 0.22, -0.55, 0.55)
    this.roll = lerp(this.roll, this.air ? targetRoll * 0.4 : targetRoll, 1 - Math.exp(-4 * dt))

    this.writeForward()

    if (!this.air) {
      this.position.addScaledVector(this.forward, this.speed * dt)
      if (this.position.y > -0.45 && this.pitch > 0.38 && this.speed > 13) {
        this.air = true
        this.vy = Math.sin(this.pitch) * this.speed * 0.62
      } else if (this.position.y > -1.05) {
        this.position.y = -1.05
        if (this.pitch > 0) this.pitch *= 0.45
        this.writeForward()
      }
    } else {
      this.position.x += this.forward.x * this.speed * dt
      this.position.z += this.forward.z * this.speed * dt
      this.vy -= 16 * dt
      this.position.y += this.vy * dt
      if (this.position.y <= -0.7) {
        this.air = false
        this.position.y = -0.7
        this.pitch = -0.18
        this.vy = 0
        this.writeForward()
      }
    }

    const floor = floorHeight(this.position.x, this.position.z) + 1.15 * this.scale
    if (!this.air && this.position.y < floor) {
      this.position.y = floor
      if (this.pitch < 0) this.pitch *= 0.4
      this.writeForward()
    }

    const dist = Math.hypot(this.position.x, this.position.z)
    if (dist > WORLD_LIMIT) {
      const inward = Math.atan2(-this.position.x, -this.position.z)
      this.yaw += clamp(wrapAngle(inward - this.yaw), -1.2, 1.2) * dt * 1.4
      if (dist > WORLD_LIMIT + 30) {
        const k = (WORLD_LIMIT + 30) / dist
        this.position.x *= k
        this.position.z *= k
      }
      this.writeForward()
    }

    this.applyGrowth(this.growth, false)
    return { stamina, lunged }
  }

  steerToward(point: THREE.Vector3, dt: number, strength: number): void {
    const dx = point.x - this.position.x
    const dy = point.y - this.position.y
    const dz = point.z - this.position.z
    const desiredYaw = Math.atan2(dx, dz)
    const desiredPitch = Math.atan2(dy, Math.hypot(dx, dz))
    this.yaw += clamp(wrapAngle(desiredYaw - this.yaw), -1, 1) * strength * dt
    this.pitch += clamp(desiredPitch - this.pitch, -1, 1) * strength * dt
    this.pitch = clamp(this.pitch, -1.05, 0.95)
    this.writeForward()
  }

  nudge(dir: THREE.Vector3, amount: number): void {
    this.position.addScaledVector(dir, amount)
  }

  animate(time: number): void {
    const wag = Math.sin(time * (3.2 + this.speed * 0.28))
    this.tail.rotation.y = wag * (0.34 + Math.min(this.speed, 22) * 0.012)
    const open = this.lunge > 0 || this.bite > 0
    this.jaw.rotation.x = open ? 0.7 : 0.04
    if (this.bite > 0) this.bite = Math.max(0, this.bite - 1 / 60)
  }

  syncMesh(time: number): void {
    this.animate(time)
    this.group.position.copy(this.position)
    this.group.scale.setScalar(this.scale)
    alignZ(this.q, this.forward, this.roll)
    this.group.quaternion.copy(this.q)
  }

  private writeForward(): void {
    const cp = Math.cos(this.pitch)
    this.forward.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp)
  }

  private applyGrowth(growth: number, immediate: boolean): void {
    const target = stageScale(growth)
    this.scale = immediate ? target : lerp(this.scale, target, 0.08)
    const stage = stageIndex(growth)
    this.finMat.color.set(STAGES[stage].fin)
    this.tint.set(stage === 0 ? '#ffffff' : STAGES[stage].dorsal).lerp(this.white, 0.55)
    this.bodyMat.color.copy(this.tint)
    this.scar.visible = stage >= 3
  }
}
