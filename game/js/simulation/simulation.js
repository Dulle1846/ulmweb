// ── Main Tick Loop ─────────────────────────────────────────────

import { state } from '../state.js';
import { resetIncome } from '../systems/resources.js';
import { updateMorale } from '../systems/morale.js';
import { checkRandomEvents } from '../systems/events.js';
import { updateWeather } from '../world/weather.js';
import { updateBuildingIncome } from './buildings.js';
import { updateVillagers } from './villagers.js';
import { updateCombat } from './combat.js';
import { updateParticles, updateFloaters } from '../rendering/particles.js';
import { updateMinimap } from '../rendering/minimap.js';
import { showBigMessage } from '../rendering/ui.js';

export function updateSimulation() {
    if (state.isPaused || state.gameOver) return;

    state.tick += state.gameSpeed;
    state.dayOfYear++;

    if (state.dayOfYear > 400) {
        state.dayOfYear = 0;
        state.year++;
    }

    state.seasonIndex = Math.floor(state.dayOfYear / 100) % 4;

    // gentle camera drift
    if (state.tick % 80 === 0) {
        const { WORLD_WIDTH, WORLD_HEIGHT } = await_config();
        // handled inside camera module if desired
    }

    resetIncome();
    updateBuildingIncome();
    updateVillagers();
    updateCombat();
    checkRandomEvents();
    updateWeather();
    updateMorale();
    updateParticles();
    updateFloaters();

    // clean dead
    state.entities = state.entities.filter(e => !e.dead);

    // win condition
    if (state.year >= 12 && state.morale > 80 && !state.victory) {
        state.victory = true;
        showBigMessage("YOUR KINGDOM ENDURES", "A LEGEND WAS BORN", 8000);
    }

    // lose condition
    if (state.morale < 12 && state.tick > 800) {
        state.gameOver = true;
        showBigMessage("THE REALM FELL", "MORALE COLLAPSED", 5000);
    }

    updateMinimap();
}
