// 1.2.20 — spatial hazard scars.
//
// Wildfire, floods, lava, lost ground and corruption leave a bounded list of
// tile marks. The list is the only mutable map overlay: terrain generation
// stays deterministic, while movement and gathering read these marks. At most
// sixteen marks per kind are kept, so a long campaign cannot grow the save or
// the per-tile checks without limit.
import { state } from "../core/state.js";
import { harvestForest } from "./resource-geography.js";

export const HAZARD_SCAR_VERSION = 1;
export const HAZARD_SCAR_LIMIT = 16;
export const HAZARD_SCAR_KINDS = Object.freeze(["burnt", "flooded", "lava", "lost", "corruption"]);

const int = (value, fallback = 0) => Math.trunc(Number.isFinite(Number(value)) ? Number(value) : fallback);
const positive = value => Math.max(0, int(value));

export function createHazardScars() {
    return {
        version: HAZARD_SCAR_VERSION,
        revision: 0,
        burnt: [],
        flooded: [],
        lava: [],
        lost: [],
        corruption: []
    };
}

function sanitizeMarks(value, kind) {
    const list = Array.isArray(value) ? value : [];
    const seen = new Set();
    const marks = [];
    for (const item of list) {
        const x = int(item?.x, -1), y = int(item?.y, -1);
        if (x < 0 || y < 0) continue;
        const key = x + ":" + y;
        if (seen.has(key)) continue;
        seen.add(key);
        marks.push({ kind, x, y, year: Math.min(9999, positive(item?.year)) });
        if (marks.length >= HAZARD_SCAR_LIMIT) break;
    }
    return marks;
}

export function normalizeHazardScars(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return {
        version: HAZARD_SCAR_VERSION,
        revision: positive(source.revision),
        burnt: sanitizeMarks(source.burnt, "burnt"),
        flooded: sanitizeMarks(source.flooded, "flooded"),
        lava: sanitizeMarks(source.lava, "lava"),
        lost: sanitizeMarks(source.lost, "lost"),
        corruption: sanitizeMarks(source.corruption, "corruption")
    };
}

export function ensureHazardScars(entry) {
    if (!entry || typeof entry !== "object") return createHazardScars();
    if (!entry.scars || typeof entry.scars !== "object" || Array.isArray(entry.scars)) entry.scars = createHazardScars();
    return entry.scars;
}

/** Add one marked tile, replacing the oldest mark of the same kind at the cap. */
export function addHazardScar(entry, kind, x, y, year = state.year) {
    if (!HAZARD_SCAR_KINDS.includes(kind)) return null;
    const scars = ensureHazardScars(entry);
    const list = scars[kind];
    const tx = int(x, -1), ty = int(y, -1);
    if (tx < 0 || ty < 0) return null;
    if (list.some(mark => mark.x === tx && mark.y === ty)) return null;
    const mark = { kind, x: tx, y: ty, year: Math.min(9999, positive(year)) };
    list.push(mark);
    while (list.length > HAZARD_SCAR_LIMIT) list.shift();
    scars.revision = positive(scars.revision) + 1;
    return mark;
}

// Trees are only touched when the realm has generated resource geography.
// Tests and early setup have none; the scar itself still records the fire.
function burnWoodlandAt(x, y, radius = 1) {
    const geo = state.resourceGeography;
    if (!geo || geo.version !== 1 || !(geo.forestStock instanceof Uint16Array)) return 0;
    const W = Math.max(1, Number(state.worldW) || 1);
    const H = Math.max(1, Number(state.worldH) || 1);
    let burnt = 0;
    for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
            const tx = x + dx, ty = y + dy;
            if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
            const before = geo.forestStock[ty * W + tx] || 0;
            if (before <= 0) continue;
            const taken = harvestForest(tx, ty, before);
            if (taken > 0) burnt += taken;
        }
    }
    return burnt;
}

export function recordWildfireScar(entry, x, y) {
    const mark = addHazardScar(entry, "burnt", x, y);
    const burnt = burnWoodlandAt(int(x), int(y), 1);
    if (entry.chronic) entry.chronic.burntTiles = Math.min(4096, positive(entry.chronic.burntTiles) + Math.max(1, burnt));
    return { mark, burnt };
}

export function recordFloodScar(entry, x, y) {
    return addHazardScar(entry, "flooded", x, y);
}

export function recordLavaScar(entry, x, y) {
    const mark = addHazardScar(entry, "lava", x, y);
    const burnt = burnWoodlandAt(int(x), int(y), 0);
    if (entry.chronic) entry.chronic.burntTiles = Math.min(4096, positive(entry.chronic.burntTiles) + (burnt > 0 ? 1 : 0));
    return mark;
}

export function recordLostGround(entry, x, y) {
    return addHazardScar(entry, "lost", x, y);
}

export function recordCorruptionScar(entry, x, y) {
    return addHazardScar(entry, "corruption", x, y);
}

/**
 * Corruption advances from the old ground. One new tile per year, chosen from
 * the keep or the last corrupted mark, so the burden is visible and bounded.
 */
export function spreadHazardCorruption(entry, amount = 1) {
    const scars = ensureHazardScars(entry);
    let added = 0;
    for (let step = 0; step < Math.max(0, Math.min(2, int(amount, 1))); step++) {
        if (scars.corruption.length >= HAZARD_SCAR_LIMIT) break;
        const seed = Number(state.worldSeed) || 1;
        const keep = (state.entities || []).find(entity => !entity.dead && entity.type === 0);
        const cx = keep ? Math.floor(keep.x) : Math.floor((Number(state.worldW) || 2) / 2);
        const cy = keep ? Math.floor(keep.y) : Math.floor((Number(state.worldH) || 2) / 2);
        const last = scars.corruption[scars.corruption.length - 1];
        const anchorX = last ? last.x : cx;
        const anchorY = last ? last.y : cy;
        const roll = Math.abs((Math.imul(seed + step, 0x9e3779b1) ^ Math.imul(positive(state.year) + 1, 0x85ebca6b)) >>> 0);
        const dx = (roll % 3) - 1;
        const dy = (Math.floor(roll / 3) % 3) - 1;
        const mark = addHazardScar(entry, "corruption", anchorX + dx, anchorY + dy);
        if (mark) added++;
    }
    return added;
}

let blockCacheSource = null;
let blockCacheRevision = -1;
let blockCacheYear = -1;
let blockedTiles = new Set();
let forageCacheSource = null;
let forageCacheRevision = -1;
let forageTiles = new Set();

function tileKey(x, y) {
    return (int(y) * 4096) + int(x);
}

function rebuildBlockCache(scars) {
    blockedTiles = new Set();
    forageTiles = new Set();
    let blocked = 0;
    for (const kind of ["lava", "lost"]) {
        for (const mark of scars[kind] || []) {
            blockedTiles.add(tileKey(mark.x, mark.y));
            blocked++;
        }
    }
    // Floodwater closes a tile for the year it happens and the next one; after
    // that the channel is muddy but walkable again.
    const year = positive(state.year);
    for (const mark of scars.flooded || []) {
        if (mark.year >= year - 1) blockedTiles.add(tileKey(mark.x, mark.y));
    }
    for (const mark of scars.corruption || []) forageTiles.add(tileKey(mark.x, mark.y));
    blockCacheSource = scars;
    blockCacheRevision = positive(scars.revision);
    blockCacheYear = year;
    forageCacheSource = scars;
    forageCacheRevision = positive(scars.revision);
    return blocked;
}

function ensureBlockCache(scars) {
    if (blockCacheSource !== scars || blockCacheRevision !== positive(scars.revision) || blockCacheYear !== positive(state.year)) {
        rebuildBlockCache(scars);
    }
}

/** True for permanently lost ground, lava and fresh floodwater. */
export function isHazardTileBlocked(x, y) {
    const scars = state.environmentalHazards?.scars;
    if (!scars || typeof scars !== "object") return false;
    ensureBlockCache(scars);
    return blockedTiles.has(tileKey(Math.floor(Number(x) || 0), Math.floor(Number(y) || 0)));
}

/**
 * Forbidden growth and corrupted ground close a forage tile. The deterministic
 * roll means the same woodland grove is dangerous until the ground is cleansed.
 */
export function isHazardForageBlocked(x, y) {
    const entry = state.environmentalHazards;
    const scars = entry?.scars;
    const tx = Math.floor(Number(x) || 0), ty = Math.floor(Number(y) || 0);
    if (scars && typeof scars === "object") {
        if (forageCacheSource !== scars || forageCacheRevision !== positive(scars.revision)) {
            ensureBlockCache(scars);
        }
        if (forageTiles.has(tileKey(tx, ty))) return true;
    }
    const forbidden = Number(entry?.magic?.forbidden) || 0;
    if (forbidden < 0.25) return false;
    const seed = Number(state.worldSeed) || 1;
    const roll = Math.abs((Math.imul(tx + 1, 0x27d4eb2d) ^ Math.imul(ty + 1, 0x165667b1) ^ seed) >>> 0) % 1000;
    return roll < forbidden * 360;
}

/** Clear one mark, used by cleansing and resettlement. */
export function clearHazardScar(entry, kind, x, y) {
    if (!HAZARD_SCAR_KINDS.includes(kind) || !entry?.scars) return false;
    const list = entry.scars[kind] || [];
    const index = list.findIndex(mark => mark.x === int(x) && mark.y === int(y));
    if (index < 0) return false;
    list.splice(index, 1);
    entry.scars.revision = positive(entry.scars.revision) + 1;
    return true;
}

export function clearOneHazardScar(entry, kind) {
    if (!entry?.scars || !HAZARD_SCAR_KINDS.includes(kind)) return null;
    const list = entry.scars[kind] || [];
    if (!list.length) return null;
    const mark = list.shift();
    entry.scars.revision = positive(entry.scars.revision) + 1;
    return mark;
}

export function getHazardScarSnapshot() {
    const scars = normalizeHazardScars(state.environmentalHazards?.scars);
    return {
        version: scars.version,
        counts: Object.fromEntries(HAZARD_SCAR_KINDS.map(kind => [kind, scars[kind].length])),
        burnt: scars.burnt.map(mark => ({ ...mark })),
        flooded: scars.flooded.map(mark => ({ ...mark })),
        lava: scars.lava.map(mark => ({ ...mark })),
        lost: scars.lost.map(mark => ({ ...mark })),
        corruption: scars.corruption.map(mark => ({ ...mark })),
        blocked: scars.lava.length + scars.lost.length,
        total: HAZARD_SCAR_KINDS.reduce((sum, kind) => sum + scars[kind].length, 0)
    };
}
