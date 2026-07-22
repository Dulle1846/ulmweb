// ========================================================
// CASTLEFORGE — Event System
// ========================================================

import { gameState } from '../state.js'
import { randInt } from '../utils/math.js'

const EVENT_TYPES = [
    "🐛 Pest invasion! Farms threatened.",
    "⛈️ Terrible storm approaching!",
    "🎉 Festival! Morale +10",
    "💀 Sickness spreads through village",
    "🐺 Wolves spotted near settlements",
    "📜 Merchants arrived with rare goods",
    "🌲 Lumber abundance! +50 wood",
    "⛏️ Gold vein discovered! +30 gold"
]

export function logEvent(message) {
    gameState.eventLog.unshift({
        tick: gameState.tick,
        message: message
    })
    if (gameState.eventLog.length > 50) {
        gameState.eventLog.pop()
    }
}

export function triggerRandomEvent() {
    if (gameState.tick - gameState.lastRandomEvent < 200) return
    
    if (Math.random() < 0.02) {
        const event = EVENT_TYPES[randInt(0, EVENT_TYPES.length)]
        logEvent(event)
        gameState.lastRandomEvent = gameState.tick
    }
}

export function getEventLog() {
    return gameState.eventLog
}
