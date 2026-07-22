// ── Entity Management ──────────────────────────────────────────

import { WORLD_WIDTH, WORLD_HEIGHT } from '../config.js';
import { TYPE, Entity } from '../types.js';
import { state } from '../state.js';
import { randInt } from '../utils.js';

export function spawnEntity(tx, ty, type) {
    const entity = new Entity(tx, ty, type);

    if (type === TYPE.VILLAGER) {
        entity.home = { x: tx, y: ty };
    }
    if (type === TYPE.KEEP) {
        entity.hp = 1200;
    }

    state.entities.push(entity);
    return entity;
}

export function buildingAt(tx, ty) {
    return state.entities.find(e =>
        !e.dead && e.isBuilding() && Math.floor(e.x) === tx && Math.floor(e.y) === ty
    );
}

export function getEntitiesOfType(type) {
    return state.entities.filter(e => !e.dead && e.type === type);
}

export function initStartingKingdom() {
    const cx = Math.floor(WORLD_WIDTH / 2);
    const cy = Math.floor(WORLD_HEIGHT / 2);

    // Main keep
    spawnEntity(cx, cy, TYPE.KEEP);

    // Initial buildings
    spawnEntity(cx - 5, cy - 3, TYPE.HOUSE);
    spawnEntity(cx + 6, cy - 6, TYPE.HOUSE);
    spawnEntity(cx - 3, cy + 7, TYPE.HOUSE);

    spawnEntity(cx + 8, cy + 4, TYPE.FARM);
    spawnEntity(cx + 9, cy + 5, TYPE.FARM);
    spawnEntity(cx - 8, cy - 8, TYPE.LUMBER);
    spawnEntity(cx + 2, cy + 10, TYPE.QUARRY);
    spawnEntity(cx - 10, cy + 2, TYPE.TEMPLE);

    // Units
    const king = spawnEntity(cx + 1, cy - 2, TYPE.KNIGHT);
    king.hp = 300;

    for (let i = 0; i < 6; i++) {
        const v = spawnEntity(
            cx + randInt(-6, 6),
            cy + randInt(-6, 6),
            TYPE.VILLAGER
        );
        v.home = { x: cx + randInt(-4, 4), y: cy + randInt(-4, 4) };
    }

    // Guards
    spawnEntity(cx - 4, cy - 1, TYPE.GUARD);
    spawnEntity(cx + 4, cy + 1, TYPE.GUARD);
}
