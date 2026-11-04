// ── Morale System ──────────────────────────────────────────────

import { TYPE } from '../types.js';
import { state } from '../state.js';
import { getEntitiesOfType } from '../world/entities.js';

export function updateMorale() {
    if (state.tick % 45 !== 0) return;

    let moraleDelta = 0;

    moraleDelta += getEntitiesOfType(TYPE.TAVERN).length * 0.6;
    moraleDelta += getEntitiesOfType(TYPE.TEMPLE).length * 1.4;
    if (state.unlockedTechs.has('feudalism')) {
        moraleDelta += getEntitiesOfType(TYPE.HOUSE).length;
    }
    moraleDelta -= state.entities.filter(e => !e.dead && e.isEnemy()).length * 2;

    const villagers = getEntitiesOfType(TYPE.VILLAGER);
    if (villagers.length > 35) moraleDelta -= 0.4;

    state.morale = Math.max(8, Math.min(100, state.morale + moraleDelta));
}
