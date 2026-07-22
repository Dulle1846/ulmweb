// ========================================================
// CASTLEFORGE — Morale System
// ========================================================

import { gameState } from '../state.js'
import { getEntitiesOfType } from '../world/entities.js'
import { TYPE } from '../config.js'
import { clamp } from '../utils/math.js'

const MIN_MORALE = 0
const MAX_MORALE = 100

export function updateMorale() {
    // Houses boost morale
    const houses = getEntitiesOfType(TYPE.HOUSE)
    const tavernMorale = getEntitiesOfType(TYPE.TAVERN).length * 3
    const templeBonus = getEntitiesOfType(TYPE.TEMPLE).length * 2
    
    let change = -0.1 // slight decay
    change += houses.length * 0.5
    change += tavernMorale
    change += templeBonus
    
    // Food shortage
    if (gameState.resources.food < 30) {
        change -= 1.5
    }
    
    gameState.morale = clamp(gameState.morale + change, MIN_MORALE, MAX_MORALE)
}

export function getMoralePercentage() {
    return gameState.morale / MAX_MORALE
}
