// ── Main Tick Loop ─────────────────────────────────────────────

import { state } from '../core/state.js';
import { resetIncome } from '../systems/resources.js';
import { updateMorale } from '../systems/morale.js';
import { checkRandomEvents } from '../systems/events.js';
import { updateWeather } from '../world/weather.js';
import { updateBuildingIncome } from './buildings.js';
import { updateVillagers } from './villagers.js';
import { updateCombat } from './combat.js';
import { queueMessage } from '../core/presentation-effects.js';

export function updateSimulation() {
    if (state.isPaused || state.gameOver) return;

    state.tick += 1;
    state.dayOfYear++;

    if (state.dayOfYear >= 400) {
        state.dayOfYear = 0;
        state.year++;
    }

    state.seasonIndex = Math.floor(state.dayOfYear / 100) % 4;

    resetIncome();
    updateBuildingIncome();
    updateVillagers();
    updateCombat();
    checkRandomEvents();
    updateWeather();
    updateMorale();

    // clean dead
    state.entities = state.entities.filter(e => !e.dead);

    // Count a raid only after every enemy in the active wave is defeated.
    if (state.raidActive && !state.entities.some(e => e.isEnemy())) {
        state.totalRaidsSurvived++;
        state.raidActive = false;
    }

    // win condition
    if (state.year >= 12 && state.morale > 80 && !state.victory) {
        state.victory = true;
        queueMessage("YOUR KINGDOM ENDURES", "A LEGEND WAS BORN", 8000);
    }

    // lose condition
    if (state.morale < 12 && state.tick > 800) {
        state.gameOver = true;
        showBigMessage("THE REALM FELL", "MORALE COLLAPSED", 5000);
    }

}
