import { stageLength } from './data'

export interface SaveData {
  v: 1
  growth: number
  hunger: number
  stamina: number
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
  discoveries: string[]
  fishEaten: number
  playSeconds: number
  largestLength: number
}

const KEY = 'abyss-save-v1'

export function defaultSave(): SaveData {
  return {
    v: 1,
    growth: 0,
    hunger: 76,
    stamina: 100,
    x: 0,
    y: -10,
    z: -6,
    yaw: 0,
    pitch: 0,
    discoveries: [],
    fishEaten: 0,
    playSeconds: 0,
    largestLength: 1.7,
  }
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultSave()
    const parsed = JSON.parse(raw) as Partial<SaveData>
    if (parsed.v !== 1 || typeof parsed.growth !== 'number') return defaultSave()
    return { ...defaultSave(), ...parsed, discoveries: Array.isArray(parsed.discoveries) ? parsed.discoveries : [] }
  } catch {
    return defaultSave()
  }
}

export function writeSave(save: SaveData): void {
  save.largestLength = Math.max(save.largestLength, stageLength(save.growth))
  try {
    localStorage.setItem(KEY, JSON.stringify(save))
  } catch {
    /* private mode */
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* private mode */
  }
}

export function hasHistory(save: SaveData): boolean {
  return save.playSeconds > 8 || save.growth > 1 || save.discoveries.length > 0 || save.fishEaten > 0
}
