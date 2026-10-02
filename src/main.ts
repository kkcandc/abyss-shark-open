import './style.css'
import { Game } from './game/game'

const canvas = document.querySelector('#view')
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Missing canvas')
}

new Game(canvas)
