// ========================================================
// CASTLEFORGE — Technology Tree
// ========================================================

import { gameState } from '../state.js'

export function initTechTree() {
    gameState.techs = [
        { id: "irrigation", name: "IRRIGATION", cost: 35, unlocked: false, effect: "Farms produce 40% more food", icon: "💧" },
        { id: "steel", name: "STEEL FORGING", cost: 55, unlocked: false, effect: "All military units +25 HP", icon: "⚔️" },
        { id: "scholarship", name: "SCHOLARSHIP", cost: 40, unlocked: false, effect: "Research income +2", icon: "📜" },
        { id: "feudalism", name: "FEUDAL SYSTEM", cost: 70, unlocked: false, effect: "Houses give +1 morale", icon: "🏛️" },
        { id: "alchemy", name: "ALCHEMY", cost: 85, unlocked: false, effect: "Gold mines occasionally spawn gold", icon: "🧪" },
    ]
}

export function isTechUnlocked(techId) {
    return gameState.unlockedTechs.has(techId)
}

export function unlockTech(techId) {
    const tech = gameState.techs.find(t => t.id === techId)
    if (tech && !tech.unlocked) {
        tech.unlocked = true
        gameState.unlockedTechs.add(techId)
        return true
    }
    return false
}
