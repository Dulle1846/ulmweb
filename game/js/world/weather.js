// ── Weather System ─────────────────────────────────────────────

import { state } from '../core/state.js';
import { randInt as seededRandInt } from '../core/random.js';
const randInt=(min,max)=>seededRandInt(min,max,"weather");
import { addLog } from '../systems/events.js';

export function updateWeather() {
    state.weatherTimer--;

    if (state.weatherTimer <= 0) {
        const weathers = ["clear", "rain", "snow"];
        state.weather = weathers[randInt(0, weathers.length)];
        state.weatherTimer = randInt(280, 1100);

        if (state.weather === "rain") addLog("IT BEGINS TO RAIN", "#22d3ee");
        if (state.weather === "snow") addLog("SNOW FALLS OVER THE LAND", "#e0f2fe");
    }
}
