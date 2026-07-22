// ========================================================
// CASTLEFORGE — World Generation & Management
// ========================================================

import { WORLD_WIDTH, WORLD_HEIGHT, TERRAIN } from '../config.js'
import { gameState } from '../state.js'
import { randInt, distance } from '../utils/math.js'

export function initWorld() {
    gameState.world = []
    gameState.explored = []
    
    for (let x = 0; x < WORLD_WIDTH; x++) {
        gameState.world[x] = []
        gameState.explored[x] = []
        for (let y = 0; y < WORLD_HEIGHT; y++) {
            gameState.explored[x][y] = false
            
            const r = Math.random()
            
            if (r < 0.07) {
                gameState.world[x][y] = { terrain: TERRAIN.WATER, variant: randInt(0, 3) }
            } else if (r < 0.3) {
                gameState.world[x][y] = { terrain: TERRAIN.FOREST, variant: randInt(0, 4) }
            } else if (r < 0.37) {
                gameState.world[x][y] = { terrain: TERRAIN.ROCK, variant: randInt(0, 3) }
            } else if (r < 0.4) {
                gameState.world[x][y] = { terrain: TERRAIN.RUINS, variant: randInt(0, 2) }
            } else {
                gameState.world[x][y] = { terrain: TERRAIN.GRASS, variant: randInt(0, 5) }
            }
        }
    }
    
    // Central fertile valley
    const cx = Math.floor(WORLD_WIDTH / 2)
    const cy = Math.floor(WORLD_HEIGHT / 2)
    
    for (let x = cx - 18; x <= cx + 18; x++) {
        for (let y = cy - 18; y <= cy + 18; y++) {
            if (x < 0 || x >= WORLD_WIDTH || y < 0 || y >= WORLD_HEIGHT) continue
            if (gameState.world[x][y].terrain === TERRAIN.WATER) continue
            gameState.world[x][y].terrain = TERRAIN.GRASS
            gameState.world[x][y].variant = 0
        }
    }
    
    // Reveal starting area
    revealArea(cx, cy, 22)
}

export function revealArea(tx, ty, radius) {
    for (let x = tx - radius; x <= tx + radius; x++) {
        for (let y = ty - radius; y <= ty + radius; y++) {
            if (x < 0 || x >= WORLD_WIDTH || y < 0 || y >= WORLD_HEIGHT) continue
            if (distance(tx, ty, x, y) < radius) {
                gameState.explored[x][y] = true
            }
        }
    }
}

export function getTile(x, y) {
    if (x < 0 || x >= WORLD_WIDTH || y < 0 || y >= WORLD_HEIGHT) {
        return null
    }
    return gameState.world[x][y]
}

export function isExplored(x, y) {
    if (x < 0 || x >= WORLD_WIDTH || y < 0 || y >= WORLD_HEIGHT) {
        return false
    }
    return gameState.explored[x][y]
}
