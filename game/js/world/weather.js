// ========================================================
// CASTLEFORGE — Weather System
// ========================================================

import { WEATHER } from '../config.js'
import { gameState } from '../state.js'
import { randInt } from '../utils/math.js'

export function updateWeather() {
    gameState.weatherTimer--
    
    if (gameState.weatherTimer <= 0) {
        const weatherTypes = Object.values(WEATHER)
        gameState.weather = weatherTypes[randInt(0, weatherTypes.length)]
        gameState.weatherTimer = randInt(100, 400)
    }
}

export function getWeatherModifier() {
    switch (gameState.weather) {
        case WEATHER.RAIN:
            return 0.8
        case WEATHER.SNOW:
            return 0.6
        case WEATHER.STORM:
            return 0.5
        case WEATHER.CLEAR:
        default:
            return 1.0
    }
}
