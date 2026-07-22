// ========================================================
// CASTLEFORGE — Resource Management
// ========================================================

import { gameState, resetIncomeThisTick } from '../state.js'
import { getEntitiesOfType } from '../world/entities.js'
import { TYPE } from '../config.js'

export function addResource(type, amount) {
    if (gameState.resources[type] !== undefined) {
        gameState.resources[type] += amount
        if (gameState.resources[type] < 0) {
            gameState.resources[type] = 0
        }
    }
}

export function hasResources(cost) {
    for (const [resource, amount] of Object.entries(cost)) {
        if ((gameState.resources[resource] || 0) < amount) {
            return false
        }
    }
    return true
}

export function spendResources(cost) {
    if (!hasResources(cost)) return false
    for (const [resource, amount] of Object.entries(cost)) {
        addResource(resource, -amount)
    }
    return true
}

export function calculateIncome() {
    resetIncomeThisTick()
    
    const farms = getEntitiesOfType(TYPE.FARM)
    const lumber = getEntitiesOfType(TYPE.LUMBER)
    const quarries = getEntitiesOfType(TYPE.QUARRY)
    const taverns = getEntitiesOfType(TYPE.TAVERN)
    
    gameState.incomeThisTick.wood += lumber.length * 4
    gameState.incomeThisTick.stone += quarries.length * 3
    gameState.incomeThisTick.food += farms.length * 7
    gameState.incomeThisTick.gold += taverns.length * 2
}

export function applyIncome() {
    calculateIncome()
    for (const [resource, amount] of Object.entries(gameState.incomeThisTick)) {
        addResource(resource, amount)
    }
}
