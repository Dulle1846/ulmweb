// ── Villager AI / Behavior ─────────────────────────────────────

import { TYPE } from '../types.js';
import { state } from '../state.js';
import { getEntitiesOfType } from '../world/entities.js';
import { randInt } from '../utils.js';

export function updateVillagers() {
    const villagers = getEntitiesOfType(TYPE.VILLAGER);

    villagers.forEach(v => {
        v.age++;

        if (v.state === "idle") {
            if (Math.random() < 0.04) {
                v.state = "walk";
                v.targetX = v.x + randInt(-7, 7);
                v.targetY = v.y + randInt(-7, 7);
            }
        } else if (v.state === "walk") {
            const dx = v.targetX - v.x;
            const dy = v.targetY - v.y;
            const len = Math.hypot(dx, dy);

            if (len > 0.2) {
                v.x += (dx / len) * 0.07;
                v.y += (dy / len) * 0.07;
            } else {
                v.state = "idle";
            }
        }

        // villagers eat food
        if (state.tick % 220 === 0 && state.resources.food > 4) {
            state.resources.food -= 1;
        }
    });
}
