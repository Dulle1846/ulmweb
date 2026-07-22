// ========================================================
// CASTLEFORGE — Global Game State
// ========================================================

import { SEASONS, WEATHER } from './config.js'

export const gameState = {
    // Timing
    tick: 0,
    year: 1,
    dayOfYear: 0,
    seasonIndex: 0,
    gameSpeed: 1,
    isPaused: false,
    gameOver: false,
    victory: false,
    
    // Camera
    camera: { x: 0, y: 0 },
    
    // Kingdom
    kingdomName: "ELDRIA",
    
    // Resources
    resources: {
        wood: 180,
        stone: 95,
        gold: 45,
        food: 120,
        research: 0
    },
    
    incomeThisTick: {
        wood: 0,
        stone: 0,
        gold: 0,
        food: 0,
        research: 0
    },
    
    // Morale
    morale: 72,
    
    // Systems
    currentCard: null,
    selectedTab: 0,
    eventLog: [],
    techs: [],
    unlockedTechs: new Set(),
    
    // World
    entities: [],
    particles: [],
    floaters: [],
    world: [],
    explored: [],
    
    // Weather & Events
    lastRandomEvent: 0,
    weather: WEATHER.CLEAR,
    weatherTimer: 0,
    
    // Game stats
    kingHp: 240,
    totalRaidsSurvived: 0
}

export function getCurrentSeason() {
    return SEASONS[gameState.seasonIndex]
}

export function resetIncomeThisTick() {
    gameState.incomeThisTick = {
        wood: 0,
        stone: 0,
        gold: 0,
        food: 0,
        research: 0
    }
}
