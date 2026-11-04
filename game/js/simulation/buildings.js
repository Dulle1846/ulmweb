// ── Building Effects & Income ──────────────────────────────────

import { TYPE } from '../types.js';
import { TILE_SIZE } from '../config.js';
import { state } from '../state.js';
import { getEntitiesOfType } from '../world/entities.js';
import { addResource } from '../systems/resources.js';
import { createParticle, createFloater } from '../rendering/particles.js';
import { distance } from '../utils.js';

export function updateBuildingIncome() {
    const tick = state.tick;

    const farms   = getEntitiesOfType(TYPE.FARM);
    const lumbers = getEntitiesOfType(TYPE.LUMBER);
    const quarries = getEntitiesOfType(TYPE.QUARRY);
    const taverns = getEntitiesOfType(TYPE.TAVERN);
    const temples = getEntitiesOfType(TYPE.TEMPLE);
    const mills   = getEntitiesOfType(TYPE.MILL);

    // Primary resources every 18 ticks
    if (tick % 18 === 0) {
        farms.forEach(f => {
            let amt = 3;
            if (state.seasonIndex === 0 || state.seasonIndex === 1) amt = 5;

            const nearbyMill = mills.some(m => distance(m.x, m.y, f.x, f.y) < 6);
            if (nearbyMill) amt = Math.floor(amt * 1.6);
            if (state.unlockedTechs.has('irrigation')) amt = Math.floor(amt * 1.4);

            addResource('food', amt);

            if (Math.random() < 0.2) {
                createParticle(f.x * TILE_SIZE + 20, f.y * TILE_SIZE + 12, "#bef575", 26, 0, -1.5);
            }
        });

        lumbers.forEach(() => {
            const amt = 3 + (Math.random() > 0.6 ? 2 : 0);
            addResource('wood', amt);
        });

        quarries.forEach(q => {
            addResource('stone', 4);

            if (Math.random() < (state.unlockedTechs.has('alchemy') ? 0.26 : 0.13)) {
                addResource('gold', 1);
                createFloater(q.x * TILE_SIZE, q.y * TILE_SIZE - 20, "GOLD VEIN!", "#fde047");
            }
        });
    }

    // Taverns & temples every 55 ticks
    if (tick % 55 === 0) {
        taverns.forEach(() => {
            addResource('gold', 2);
            state.morale = Math.min(100, state.morale + 0.6);
        });

        temples.forEach(() => {
            state.morale = Math.min(100, state.morale + 1.2);
            addResource('research', 1);
        });

        if (state.unlockedTechs.has('scholarship')) {
            addResource('research', 2);
        }
    }
}
