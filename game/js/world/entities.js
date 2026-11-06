// ═══════════════════════════════════════════════════════════════
//  ENTITIES — Spawn, Verwaltung, Startaufbau
// ═══════════════════════════════════════════════════════════════

import { WORLD_WIDTH, WORLD_HEIGHT, BUILDING_SIZE } from '../core/config.js';
import { TYPE, Entity } from '../core/types.js';
import { state } from '../core/state.js';
import { randInt as seededRandInt } from '../core/random.js';
import {ensurePersonProfile} from '../systems/people.js';
const randInt=(min,max)=>seededRandInt(min,max,"entity");

// ── Entity erstellen ──────────────────────────────────────────

const MAX_WORLD_ENTITIES=900;
const MAX_MOBILE_ENTITIES=420;
const MOBILE_TYPES=new Set([TYPE.VILLAGER,TYPE.GUARD,TYPE.ARCHER,TYPE.KNIGHT,TYPE.PRIEST,TYPE.DRAGON,TYPE.DEER,TYPE.GOBLIN,TYPE.ORC,TYPE.TROLL]);
export function canSpawnEntity(type, count = 1) {
    const requested = Number(count);
    if (!Number.isSafeInteger(requested) || requested < 0) return false;
    if (requested === 0) return true;
    let total=0,mobile=0;
    for(const entity of state.entities){
        if(entity.dead)continue;
        total++;
        if(MOBILE_TYPES.has(entity.type))mobile++;
    }
    return total + requested <= MAX_WORLD_ENTITIES &&
        (!MOBILE_TYPES.has(type) || mobile + requested <= MAX_MOBILE_ENTITIES);
}

export function spawnEntity(tx, ty, type) {
    if(!canSpawnEntity(type))return null;
    const entity = new Entity(tx, ty, type);
    const serial = Number.isSafeInteger(state.nextEntityId) && state.nextEntityId > 0 ? state.nextEntityId : 1;
    state.nextEntityId = serial + 1;
    entity.id = "e" + (Number(state.worldSeed) || 1).toString(36) + "-" + serial.toString(36);
    if (type === TYPE.VILLAGER) { entity.personId = entity.id; ensurePersonProfile(entity); }

    if (entity.isUnit()) {
        entity.home = { x: tx, y: ty };
        entity.anchor = { x: tx, y: ty };
    }

    if (type === TYPE.KEEP) {
        entity.hp = 1200;
        entity.maxHp = 1200;
    }

    state.entities.push(entity);
    if(entity.isBuilding())state.buildingCollisionVersion=(state.buildingCollisionVersion||0)+1;
    return entity;
}

// ── Hilfsabfragen ─────────────────────────────────────────────

export function buildingAt(tx, ty) {
    return buildingOverlaps(tx, ty, null);
}

// Check the full rectangular footprint, not only the building's centre tile.
export function buildingOverlaps(tx, ty, type, footprintScale = 1, ignore = null) {
    const scale = Math.max(0.25, Math.min(6, Number(footprintScale) || 1));
    const baseCandidate = BUILDING_SIZE[type] || { w: 1, h: 1 };
    const candidate = { w: baseCandidate.w * scale, h: baseCandidate.h * scale };
    const left = tx + 0.5 - candidate.w / 2;
    const right = tx + 0.5 + candidate.w / 2;
    const top = ty + 0.5 - candidate.h / 2;
    const bottom = ty + 0.5 + candidate.h / 2;

    return state.entities.some(e => {
        if (e.dead || !e.isBuilding() || e === ignore) return false;
        const size = BUILDING_SIZE[e.type] || { w: 1, h: 1 };
        const otherLeft = e.x + 0.5 - size.w / 2;
        const otherRight = e.x + 0.5 + size.w / 2;
        const otherTop = e.y + 0.5 - size.h / 2;
        const otherBottom = e.y + 0.5 + size.h / 2;

        const scale = Math.max(0.25, Number(e.footprintScale) || 1);
        const scaledLeft = e.x + 0.5 - size.w * scale / 2;
        const scaledRight = e.x + 0.5 + size.w * scale / 2;
        const scaledTop = e.y + 0.5 - size.h * scale / 2;
        const scaledBottom = e.y + 0.5 + size.h * scale / 2;
        return left < scaledRight && right > scaledLeft &&
            top < scaledBottom && bottom > scaledTop;
    });
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

function findDryStart(cx, cy) {
    const sea = Number(state.seaLevel) || 0.33;
    const res = Number(state.terrainResolution) || 1;
    const dry = (x, y) => {
        const px = Math.min(state.terrainPixW - 1, Math.floor((x + 0.5) * res));
        const py = Math.min(state.terrainPixH - 1, Math.floor((y + 0.5) * res));
        const h = state.heightMap?.[py * state.terrainPixW + px];
        return !Number.isFinite(h) || h >= sea + 0.012;
    };
    if (dry(cx, cy)) return { cx, cy };
    const maxRadius = Math.max(48, Math.round((Number(state.worldW) || WORLD_WIDTH) * 0.22));
    for (let radius = 1; radius <= maxRadius; radius++) {
        for (let ox = -radius; ox <= radius; ox++) {
            for (let oy = -radius; oy <= radius; oy++) {
                if (Math.max(Math.abs(ox), Math.abs(oy)) !== radius) continue;
                const x = cx + ox, y = cy + oy;
                if (x < 3 || y < 3 || x > (Number(state.worldW) || WORLD_WIDTH) - 4 || y > (Number(state.worldH) || WORLD_HEIGHT) - 4) continue;
                if (dry(x, y)) return { cx: x, cy: y };
            }
        }
    }
    return { cx, cy };
}

export function initStartingKingdom() {
    const center = findDryStart(
        Math.floor((Number(state.worldW) || WORLD_WIDTH) / 2),
        Math.floor((Number(state.worldH) || WORLD_HEIGHT) / 2)
    );
    const cx = center.cx, cy = center.cy;

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
    const goldmine = spawnEntity(cx + 12, cy - 10, TYPE.GOLDMINE);
    const temple = spawnEntity(cx - 10, cy + 2, TYPE.TEMPLE);

    // The starting settlement already owns the physical infrastructure its
    // first production chains need. These are complete buildings, not free
    // construction placeholders; the crown must still staff and supply them.
    function placeExtra(type, ox, oy) {
        for (let radius = 0; radius <= 5; radius++) {
            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
                    const x = cx + ox + dx, y = cy + oy + dy;
                    if (!buildingOverlaps(x, y, type)) return spawnEntity(x, y, type);
                }
            }
        }
        return null;
    }
    const warehouse = placeExtra(TYPE.WAREHOUSE, -14, -3);
    const sawmill = placeExtra(TYPE.SAWMILL, 13, 2);
    const bakery = placeExtra(TYPE.BAKERY, 7, 9);
    const well = placeExtra(TYPE.WELL, -1, 4);
    const mason = placeExtra(TYPE.MASON, -6, 11);
    const forester = placeExtra(TYPE.FORESTER, -16, -7);
    const market = placeExtra(TYPE.MARKET, 15, -4);
    const stoneHouse = placeExtra(TYPE.STONE_HOUSE, 7, -10);

    // König – markiert als König, bleibt nah an der Burg
    const king = spawnEntity(cx + 1, cy - 2, TYPE.KNIGHT);
    king.hp = 300;
    king.maxHp = 300;
    king.isKing = true;
    king.isRoyalFamily = true;
    king.personId = king.id;
    ensurePersonProfile(king,{role:"king"});
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
        { x: cx + 11, y: cy - 9, home: goldmine },
        { x: cx - 11, y: cy + 3, home: temple },
        { x: cx - 13, y: cy - 2, home: stoneHouse || h2, workplace: warehouse, job: "hauler" },
        { x: cx + 12, y: cy + 3, home: stoneHouse || h2, workplace: sawmill, job: "sawyer" },
        { x: cx + 8, y: cy + 9, home: stoneHouse || h3, workplace: bakery, job: "baker" },
        { x: cx - 2, y: cy + 5, home: stoneHouse || h1, workplace: well, job: "wellkeeper" },
        { x: cx - 7, y: cy + 11, home: stoneHouse || h3, workplace: mason, job: "mason" },
        { x: cx + 14, y: cy - 4, home: stoneHouse || h2, workplace: market, job: "merchant" },
    ];

    villagerSpawns.forEach(s => {
        const v = spawnEntity(
            s.x + randInt(-1, 2),
            s.y + randInt(-1, 2),
            TYPE.VILLAGER
        );
        v.home = { x: s.home.x, y: s.home.y };
        v.anchor = { x: s.home.x, y: s.home.y };
        if (s.workplace) {
            v.workplace = s.workplace;
            v.job = s.job;
            v.anchor = { x: s.workplace.x, y: s.workplace.y };
            v.jobRefreshTimer = 220;
        } else {
            v.jobRefreshTimer = 0; // sofort Job zuweisen
        }
    });

    // Wachen
    const g1 = spawnEntity(cx - 4, cy - 1, TYPE.GUARD);
    g1.anchor = { x: cx - 4, y: cy - 1 };

    const g2 = spawnEntity(cx + 4, cy + 1, TYPE.GUARD);
    g2.anchor = { x: cx + 4, y: cy + 1 };
}
