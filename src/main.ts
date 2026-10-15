import './style.css'
import { Game } from './game/game'

export const ABYSS_BUILD = 'bite-punch-1'

document.documentElement.dataset.abyssBuild = ABYSS_BUILD
console.info(`abyss-build ${ABYSS_BUILD}`)

const canvas = document.querySelector('#view')
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Missing canvas')
}

new Game(canvas)
