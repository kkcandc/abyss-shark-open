import * as THREE from 'three'

export const TAU = Math.PI * 2

export const uTime = { value: 0 }

export function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v))
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

export function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a))
}

export function falloff(x: number, z: number, cx: number, cz: number, radius: number): number {
  const d = Math.hypot(x - cx, z - cz)
  return smoothstep(radius, radius * 0.15, d)
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function formatDive(seconds: number): string {
  const m = Math.floor(seconds / 60)
  if (m < 1) return 'a new dive'
  if (m < 60) return `${m} min in the water`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm ? `${h} h ${rm} min in the water` : `${h} h in the water`
}

export const AXIS_Z = new THREE.Vector3(0, 0, 1)
export const AXIS_Y = new THREE.Vector3(0, 1, 0)

export function alignZ(out: THREE.Quaternion, forward: THREE.Vector3, roll: number): void {
  if (forward.dot(AXIS_Z) < -0.9999) {
    out.setFromAxisAngle(AXIS_Y, Math.PI)
  } else {
    out.setFromUnitVectors(AXIS_Z, forward)
  }
  _roll.setFromAxisAngle(AXIS_Z, roll)
  out.multiply(_roll)
}

const _roll = new THREE.Quaternion()
