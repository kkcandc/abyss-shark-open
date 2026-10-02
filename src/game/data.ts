import * as THREE from 'three'
import { clamp, falloff, lerp } from './util'

export interface Region {
  id: string
  name: string
  epithet: string
  x: number
  z: number
  radius: number
  fog: string
  density: number
}

export interface Stage {
  id: string
  name: string
  growth: number
  scale: number
  length: number
  dorsal: string
  fin: string
}

export type FishTier = 'small' | 'large'

export interface Species {
  id: string
  name: string
  tier: FishTier
  minStage: number
  growth: number
  hunger: number
  speed: number
  flee: number
  respawn: number
  color: string
  belly: string
  emissive?: string
  scale: [number, number, number]
}

export interface SchoolSpawn {
  species: string
  x: number
  y: number
  z: number
  count: number
  radius: number
}

export interface Discovery {
  id: string
  name: string
  blurb: string
  kind: 'region' | 'wreck' | 'life'
  eyebrow: string
  card: boolean
}

export interface WreckDef {
  id: string
  name: string
  x: number
  z: number
  rot: number
  list: number
  style: 'clipper' | 'steamer' | 'gilded'
}

export const WORLD_LIMIT = 980

export const REGIONS: Region[] = [
  {
    id: 'reef',
    name: 'Sunlit Reef',
    epithet: 'Where the light still remembers color',
    x: 0,
    z: 0,
    radius: 210,
    fog: '#1aa3a0',
    density: 0.015,
  },
  {
    id: 'kelp',
    name: 'Kelp Cathedral',
    epithet: 'Gold shafts through a drowned forest',
    x: -500,
    z: 40,
    radius: 240,
    fog: '#0e6a45',
    density: 0.026,
  },
  {
    id: 'wrecks',
    name: 'Wreck Alley',
    epithet: 'Three ships that never found shore',
    x: 540,
    z: -90,
    radius: 260,
    fog: '#2a3a52',
    density: 0.03,
  },
  {
    id: 'trench',
    name: 'Abyssal Trench',
    epithet: 'Below the last color',
    x: 70,
    z: 640,
    radius: 320,
    fog: '#070b14',
    density: 0.034,
  },
]

export const STAGES: Stage[] = [
  { id: 'pup', name: 'Pup', growth: 0, scale: 1, length: 1.7, dorsal: '#8ea0b0', fin: '#7f94a6' },
  { id: 'juvenile', name: 'Juvenile', growth: 26, scale: 1.34, length: 2.7, dorsal: '#6d8294', fin: '#62788a' },
  { id: 'hunter', name: 'Hunter', growth: 68, scale: 1.72, length: 4.0, dorsal: '#516272', fin: '#465868' },
  { id: 'apex', name: 'Apex', growth: 130, scale: 2.22, length: 5.7, dorsal: '#3c4c5a', fin: '#334454' },
  { id: 'leviathan', name: 'Leviathan', growth: 210, scale: 2.9, length: 8.4, dorsal: '#2a3844', fin: '#243240' },
]

export const SPECIES: Species[] = [
  { id: 'sardine', name: 'Sardine', tier: 'small', minStage: 0, growth: 0.85, hunger: 5, speed: 4.2, flee: 4.4, respawn: 20, color: '#3e5870', belly: '#f4f7f8', scale: [0.62, 0.42, 1.25] },
  { id: 'chromis', name: 'Chromis', tier: 'small', minStage: 0, growth: 1.5, hunger: 8, speed: 5.2, flee: 7.5, respawn: 24, color: '#1d6fe0', belly: '#f0c24a', scale: [0.78, 0.58, 1.15] },
  { id: 'mackerel', name: 'Mackerel', tier: 'small', minStage: 0, growth: 2.4, hunger: 12, speed: 6.4, flee: 9, respawn: 28, color: '#2f9a72', belly: '#e7f0e4', scale: [0.7, 0.48, 1.55] },
  { id: 'barracuda', name: 'Barracuda', tier: 'large', minStage: 1, growth: 4.2, hunger: 15, speed: 9.2, flee: 12, respawn: 34, color: '#9aa8a2', belly: '#dfe6e2', scale: [0.48, 0.42, 2.5] },
  { id: 'tuna', name: 'Tuna', tier: 'large', minStage: 1, growth: 6.2, hunger: 18, speed: 11, flee: 14, respawn: 40, color: '#1a4f96', belly: '#e8e4dc', scale: [1.15, 0.88, 2.25] },
  { id: 'grouper', name: 'Grouper', tier: 'large', minStage: 1, growth: 7, hunger: 20, speed: 4.1, flee: 8, respawn: 36, color: '#c56a32', belly: '#e6d2b5', scale: [1.35, 1.05, 1.55] },
  { id: 'angler', name: 'Angler', tier: 'large', minStage: 2, growth: 9, hunger: 22, speed: 3.4, flee: 8, respawn: 46, color: '#243044', belly: '#3a2a38', emissive: '#b6ff6a', scale: [1.05, 0.82, 1.45] },
]

export const SCHOOLS: SchoolSpawn[] = [
  { species: 'sardine', x: 0, y: -10, z: 16, count: 22, radius: 7 },
  { species: 'sardine', x: 0, y: -10, z: 42, count: 16, radius: 8 },
  { species: 'sardine', x: 42, y: -11, z: -18, count: 18, radius: 7 },
  { species: 'chromis', x: -32, y: -10, z: 16, count: 16, radius: 9 },
  { species: 'chromis', x: 22, y: -12, z: 78, count: 12, radius: 8 },
  { species: 'mackerel', x: -470, y: -16, z: 20, count: 16, radius: 12 },
  { species: 'mackerel', x: -560, y: -18, z: 100, count: 12, radius: 10 },
  { species: 'mackerel', x: 100, y: -24, z: 390, count: 10, radius: 12 },
  { species: 'grouper', x: 500, y: -34, z: -70, count: 4, radius: 22 },
  { species: 'grouper', x: 610, y: -36, z: -160, count: 3, radius: 16 },
  { species: 'barracuda', x: 460, y: -26, z: -30, count: 10, radius: 14 },
  { species: 'barracuda', x: 650, y: -32, z: -150, count: 8, radius: 12 },
  { species: 'tuna', x: 220, y: -16, z: 70, count: 5, radius: 46 },
  { species: 'tuna', x: -200, y: -18, z: 200, count: 4, radius: 40 },
  { species: 'angler', x: 70, y: -88, z: 660, count: 6, radius: 55 },
]

export const WRECKS: WreckDef[] = [
  { id: 'marlowe', name: 'The Marlowe', x: 450, z: -30, rot: 0.4, list: 0.22, style: 'clipper' },
  { id: 'vesper', name: 'SS Vesper', x: 620, z: -170, rot: -0.6, list: -0.12, style: 'steamer' },
  { id: 'gilded', name: 'The Gilded Keel', x: 560, z: 50, rot: 1.2, list: 0.08, style: 'gilded' },
]

export const DISCOVERIES: Discovery[] = [
  { id: 'reef', name: 'Sunlit Reef', blurb: 'Where the light still remembers color.', kind: 'region', eyebrow: 'Region', card: true },
  { id: 'kelp', name: 'Kelp Cathedral', blurb: 'Gold shafts through a drowned forest.', kind: 'region', eyebrow: 'Region', card: true },
  { id: 'wrecks', name: 'Wreck Alley', blurb: 'Three ships that never found shore.', kind: 'region', eyebrow: 'Region', card: true },
  { id: 'trench', name: 'Abyssal Trench', blurb: 'Below the last color.', kind: 'region', eyebrow: 'Region', card: true },
  { id: 'marlowe', name: 'The Marlowe', blurb: 'A clipper split on a reef that is no longer here.', kind: 'wreck', eyebrow: 'Wreck', card: true },
  { id: 'vesper', name: 'SS Vesper', blurb: 'Iron, rust, and a stack that still points nowhere.', kind: 'wreck', eyebrow: 'Wreck', card: true },
  { id: 'gilded', name: 'The Gilded Keel', blurb: 'Someone paid to make a ship beautiful. The sea kept the gold.', kind: 'wreck', eyebrow: 'Wreck', card: true },
  { id: 'whale', name: 'The Passing', blurb: 'A whale older than the wrecks. You are still small beside it.', kind: 'life', eyebrow: 'Encounter', card: true },
  { id: 'manta', name: 'Nightwing', blurb: 'A manta turning over the reef like a slow flag.', kind: 'life', eyebrow: 'Life', card: false },
  { id: 'turtle', name: 'Ancient Paddler', blurb: 'It has been crossing this reef longer than the ships.', kind: 'life', eyebrow: 'Life', card: false },
  { id: 'octopus', name: 'The Gardener', blurb: 'An octopus tending a rock in the kelp, unbothered.', kind: 'life', eyebrow: 'Life', card: false },
  { id: 'jellies', name: 'Lantern Choir', blurb: 'Bells of cold light, singing without sound.', kind: 'life', eyebrow: 'Life', card: false },
  { id: 'pearl', name: 'The Pearl That Waits', blurb: 'A pale stone in a bowl of coral. It does not need you.', kind: 'life', eyebrow: 'Place', card: true },
  { id: 'angler', name: 'False Star', blurb: 'A light in the trench that is also a mouth.', kind: 'life', eyebrow: 'Life', card: false },
]

export const PEARL = { x: -78, z: 96 }
export const OCTOPUS = { x: -530, z: 88 }
export const TURTLES = [
  { x: 28, z: -36 },
  { x: -48, z: 48 },
]

const speciesById = new Map(SPECIES.map((s) => [s.id, s]))

export function speciesBy(id: string): Species {
  const s = speciesById.get(id)
  if (!s) throw new Error(`Unknown species ${id}`)
  return s
}

export function discoveryBy(id: string): Discovery | undefined {
  return DISCOVERIES.find((d) => d.id === id)
}

export function stageIndex(growth: number): number {
  let i = 0
  for (let s = 0; s < STAGES.length; s++) {
    if (growth >= STAGES[s].growth) i = s
  }
  return i
}

export function stageScale(growth: number): number {
  const i = stageIndex(growth)
  const cur = STAGES[i]
  const next = STAGES[i + 1]
  if (!next) return cur.scale
  const t = clamp((growth - cur.growth) / (next.growth - cur.growth), 0, 1)
  return lerp(cur.scale, next.scale, t)
}

export function stageLength(growth: number): number {
  const i = stageIndex(growth)
  const cur = STAGES[i]
  const next = STAGES[i + 1]
  if (!next) return cur.length + (growth - cur.growth) * 0.012
  const t = clamp((growth - cur.growth) / (next.growth - cur.growth), 0, 1)
  return lerp(cur.length, next.length, t)
}

export function regionAt(x: number, z: number): Region | null {
  let best: Region | null = null
  let bestD = Infinity
  for (const r of REGIONS) {
    const d = Math.hypot(x - r.x, z - r.z)
    if (d < r.radius && d < bestD) {
      best = r
      bestD = d
    }
  }
  return best
}

export function floorHeight(x: number, z: number): number {
  let h = -26
  h += Math.sin(x * 0.013) * 3.1 + Math.cos(z * 0.011) * 2.3
  h += Math.sin(x * 0.031 + z * 0.02) * 1.5
  h += falloff(x, z, 0, 0, 210) * 12
  h += falloff(x, z, -500, 40, 240) * 3
  h -= falloff(x, z, 540, -90, 260) * 16
  h -= falloff(x, z, 70, 640, 320) * 82
  const groove = Math.exp(-((x - 70) ** 2) / (2 * 78 * 78))
  const along = smoothAlong(z)
  h -= groove * along * 28
  return h
}

function smoothAlong(z: number): number {
  const t = clamp((z - 220) / 480, 0, 1)
  return t * t * (3 - 2 * t)
}

export function floorColor(x: number, z: number, y: number): THREE.Color {
  const reef = falloff(x, z, 0, 0, 210)
  const kelp = falloff(x, z, -500, 40, 240)
  const wreck = falloff(x, z, 540, -90, 260)
  const trench = falloff(x, z, 70, 640, 320)
  const c = new THREE.Color('#0d5560')
  c.lerp(new THREE.Color('#d2b07a'), reef * 0.72)
  c.lerp(new THREE.Color('#1c7d78'), reef * 0.22)
  c.lerp(new THREE.Color('#123528'), kelp)
  c.lerp(new THREE.Color('#2c3544'), wreck)
  c.lerp(new THREE.Color('#070b12'), trench)
  const depth = clamp((-y - 18) / 90, 0, 1)
  c.multiplyScalar(1 - depth * 0.62)
  return c
}

export interface Atmosphere {
  fog: THREE.Color
  density: number
  sun: number
  hemi: number
  sunColor: THREE.Color
  plankton: THREE.Color
  shafts: number
}

const _fog = new THREE.Color()
const _sun = new THREE.Color()
const _plank = new THREE.Color()

export function sampleAtmosphere(x: number, y: number, z: number, air: boolean): Atmosphere {
  const reef = falloff(x, z, 0, 0, 260)
  const kelp = falloff(x, z, -500, 40, 280)
  const wreck = falloff(x, z, 540, -90, 300)
  const trench = falloff(x, z, 70, 640, 360)
  const depth = clamp((-y - 4) / 80, 0, 1)

  _fog.set('#147e86')
  _fog.lerp(new THREE.Color('#1aa8a2'), reef * 0.85)
  _fog.lerp(new THREE.Color('#127a4c'), kelp * 0.9)
  _fog.lerp(new THREE.Color('#31445f'), wreck * 0.85)
  _fog.lerp(new THREE.Color('#070b14'), Math.max(trench, depth * 0.85))
  if (air) _fog.set('#b9d7e4')

  _sun.set('#fff6e4')
  _sun.lerp(new THREE.Color('#d5f0c8'), kelp * 0.45)
  _sun.lerp(new THREE.Color('#c5d4ea'), wreck * 0.4)
  _sun.lerp(new THREE.Color('#9eb4d4'), trench * 0.7)

  _plank.set('#c8f4ee')
  _plank.lerp(new THREE.Color('#d6f0a8'), kelp * 0.7)
  _plank.lerp(new THREE.Color('#9ec0ff'), trench)

  const density = air
    ? 0.00065
    : lerp(0.016, 0.02, depth) * (1 - reef * 0.18) + kelp * 0.008 + wreck * 0.01 + trench * 0.012

  return {
    fog: _fog,
    density,
    sun: air ? 1.35 : lerp(1.25, 0.22, Math.max(depth, trench * 0.85)),
    hemi: air ? 0.85 : lerp(0.82, 0.16, Math.max(depth, trench * 0.8)),
    sunColor: _sun,
    plankton: _plank,
    shafts: air ? 0.15 : lerp(1, 0.05, Math.max(depth * 1.1, trench)),
  }
}
