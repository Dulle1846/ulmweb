// ═══════════════════════════════════════════════════════════════
//  ENTITIES — Spawn, Verwaltung, Startaufbau
// ═══════════════════════════════════════════════════════════════

import { WORLD_WIDTH, WORLD_HEIGHT } from '../config.js';
import { TYPE, Entity } from '../types.js';
import { state } from '../state.js';
import { randInt } from '../utils.js';

// ── Entity erstellen ──────────────────────────────────────────

export function spawnEntity(tx, ty, type) {
    const entity = new Entity(tx, ty, type);

    if (
        state.unlockedTechs.has("steel") &&
        [TYPE.GUARD, TYPE.ARCHER, TYPE.KNIGHT].includes(type)
    ) {
        entity.hp += 25;
        entity.maxHp += 25;
    }

    if (entity.isUnit()) {
        entity.home = { x: tx, y: ty };
        entity.anchor = { x: tx, y: ty };
    }

    if (type === TYPE.KEEP) {
        entity.hp = 1200;
        entity.maxHp = 1200;
    }

    state.entities.push(entity);
    return entity;
}

// ── Hilfsabfragen ─────────────────────────────────────────────

export function buildingAt(tx, ty) {
    return state.entities.find(e =>
        !e.dead &&
        e.isBuilding() &&
        Math.floor(e.x) === tx &&
        Math.floor(e.y) === ty
    );
}

export function getEntitiesOfType(type) {
    return state.entities.filter(e => !e.dead && e.type === type);
}

export function getNearestEnemy(x, y, maxDist = Infinity) {
    let best = null;
    let bestDist = maxDist;

    for (const e of state.entities) {
        if (e.dead || !e.isEnemy()) continue;
        const d = Math.hypot(e.x - x, e.y - y);
        if (d < bestDist) {
            bestDist = d;
            best = e;
        }
    }

    return best;
}

export function getNearestFriendlyBuilding(x, y, type, maxDist = Infinity) {
    let best = null;
    let bestDist = maxDist;

    for (const e of state.entities) {
        if (e.dead || !e.isBuilding() || e.type !== type) continue;
        const d = Math.hypot(e.x - x, e.y - y);
        if (d < bestDist) {
            bestDist = d;
            best = e;
        }
    }

    return best;
}

// ── Startaufbau des Königreichs ───────────────────────────────

export function initStartingKingdom() {
    const cx = Math.floor(WORLD_WIDTH / 2);
    const cy = Math.floor(WORLD_HEIGHT / 2);

    // Burg
    const keep = spawnEntity(cx, cy, TYPE.KEEP);

    // Häuser
    const h1 = spawnEntity(cx - 5, cy - 3, TYPE.HOUSE);
    const h2 = spawnEntity(cx + 6, cy - 6, TYPE.HOUSE);
    const h3 = spawnEntity(cx - 3, cy + 7, TYPE.HOUSE);

    // Produktionsgebäude
    const farm1 = spawnEntity(cx + 8, cy + 4, TYPE.FARM);
    const farm2 = spawnEntity(cx + 9, cy + 5, TYPE.FARM);
    const lumber = spawnEntity(cx - 8, cy - 8, TYPE.LUMBER);
    const quarry = spawnEntity(cx + 2, cy + 10, TYPE.QUARRY);
    const temple = spawnEntity(cx - 10, cy + 2, TYPE.TEMPLE);

    // König – markiert als König, bleibt nah an der Burg
    const king = spawnEntity(cx + 1, cy - 2, TYPE.KNIGHT);
    king.hp = 300;
    king.maxHp = 300;
    king.isKing = true;
    king.home = { x: cx, y: cy };
    king.anchor = { x: cx, y: cy };

    // Dorfbewohner – werden später automatisch per Job zugewiesen
    const villagerSpawns = [
        { x: cx - 4, y: cy - 5,  home: h1 },
        { x: cx + 5, y: cy - 7,  home: h2 },
        { x: cx - 2, y: cy + 6,  home: h3 },
        { x: cx + 7, y: cy + 3,  home: farm1 },
        { x: cx + 10, y: cy + 6, home: farm2 },
        { x: cx - 9, y: cy - 7,  home: lumber },
        { x: cx + 1, y: cy + 9,  home: quarry },
        { x: cx - 11, y: cy + 3, home: temple },
    ];

    villagerSpawns.forEach(s => {
        const v = spawnEntity(
            s.x + randInt(-1, 2),
            s.y + randInt(-1, 2),
            TYPE.VILLAGER
        );
        v.home = { x: s.home.x, y: s.home.y };
        v.anchor = { x: s.home.x, y: s.home.y };
        v.jobRefreshTimer = 0; // sofort Job zuweisen
    });

    // Wachen
    const g1 = spawnEntity(cx - 4, cy - 1, TYPE.GUARD);
    g1.anchor = { x: cx - 4, y: cy - 1 };

    const g2 = spawnEntity(cx + 4, cy + 1, TYPE.GUARD);
    g2.anchor = { x: cx + 4, y: cy + 1 };
}
