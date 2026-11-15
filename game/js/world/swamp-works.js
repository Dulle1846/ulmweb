// Player-made wetland works (spec 1.2.11.64–1.2.11.72).
//
// The ecology profile already knows how a drained fen, a boardwalk or a
// peat cutting *would* behave. This module is the small persistent layer that
// records which of those works the realm has actually built on a tile. It is a
// bounded map keyed by tile, not a per-tile object on the hot path, and it is
// saved alongside the other living-world domains.
import { state } from "../core/state.js";

export const SWAMP_WORKS = Object.freeze({
    boardwalk: Object.freeze({
        id: "boardwalk", requirement: "1.2.11.65", label: "Timber boardwalk",
        description: "A plank way over the softest ground; carts and walkers cross without sinking.",
        cost: Object.freeze({ wood: 10 }), cooldownDays: 0,
    }),
    drainage: Object.freeze({
        id: "drainage", requirement: "1.2.11.67", label: "Drainage cut",
        description: "A shallow cut carries standing water away and firms the peat for building.",
        cost: Object.freeze({ wood: 6, stone: 4 }), cooldownDays: 0,
    }),
    peat: Object.freeze({
        id: "peat", requirement: "1.2.11.68", label: "Peat cutting",
        description: "Turf is cut, stacked and dried for fuel; the cutting floods in later years.",
        cost: Object.freeze({}), cooldownDays: 20,
    }),
    fishing: Object.freeze({
        id: "fishing", requirement: "1.2.11.69", label: "Wetland fishing",
        description: "Wicker traps and a hook line take marsh fish and waterfowl from the pool.",
        cost: Object.freeze({ wood: 2 }), cooldownDays: 10,
    }),
    reeds: Object.freeze({
        id: "reeds", requirement: "1.2.11.70", label: "Reed and basketry harvest",
        description: "Reed is cut green, sorted and woven into matting, baskets and thatch.",
        cost: Object.freeze({}), cooldownDays: 12,
    }),
    stilt: Object.freeze({
        id: "stilt", requirement: "1.2.11.64", label: "Stilt platform",
        description: "A raised dry floor for a hut or store above the seasonal flood.",
        cost: Object.freeze({ wood: 14, stone: 6 }), cooldownDays: 0,
    }),
    bridge: Object.freeze({
        id: "bridge", requirement: "1.2.11.66", label: "Small bridge and dam",
        description: "A short timber span and brush dam make a safe crossing over a narrow channel.",
        cost: Object.freeze({ wood: 8, stone: 3 }), cooldownDays: 0,
    }),
    defence: Object.freeze({
        id: "defence", requirement: "1.2.11.71", label: "Reed screen and dyke",
        description: "A cut reed screen and a low dyke turn soft ground into a defended approach.",
        cost: Object.freeze({ wood: 6 }), cooldownDays: 0,
    }),
    survey: Object.freeze({
        id: "survey", requirement: "1.2.11.72", label: "Wetland access survey",
        description: "A measured line and marked crossings make a large wetland easier to open.",
        cost: Object.freeze({ gold: 4 }), cooldownDays: 0,
    }),
});

export const SWAMP_WORK_IDS = Object.freeze(Object.keys(SWAMP_WORKS));
// Work ids describe the action; flags describe the resulting ground state.
// Keeping the mapping explicit avoids a second set of save fields.
export const SWAMP_WORK_FLAGS = Object.freeze({
    boardwalk: "boardwalk", drainage: "drained", peat: "peatCut",
    fishing: "fished", reeds: "reedsCut", stilt: "settled", bridge: "bridged",
    defence: "defended", survey: "surveyed",
});
const MAX_WORK_TILES = 512;
const MAX_STAT = 100000;

const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const bool = value => value === true || value === 1 || value === "true";

function emptyStats() {
    return Object.fromEntries(SWAMP_WORK_IDS.map(id => [id, 0]));
}

export function createSwampWorksState() {
    return { version: 1, revision: 0, tiles: {}, stats: emptyStats() };
}

function normalizeTile(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const tile = {
        boardwalk: bool(value.boardwalk), drained: bool(value.drained),
        peatCut: bool(value.peatCut), fished: bool(value.fished),
        reedsCut: bool(value.reedsCut), settled: bool(value.settled),
        bridged: bool(value.bridged), defended: bool(value.defended),
        surveyed: bool(value.surveyed),
        lastDay: Math.max(0, Math.floor(number(value.lastDay))),
        lastHarvest: {},
    };
    for (const id of SWAMP_WORK_IDS) {
        if (value.lastHarvest && typeof value.lastHarvest === "object") {
            const day = Number(value.lastHarvest[id]);
            if (Number.isFinite(day) && day >= 0) tile.lastHarvest[id] = Math.floor(day);
        }
    }
    if (!SWAMP_WORK_IDS.some(id => tile[SWAMP_WORK_FLAGS[id]])) return null;
    return tile;
}

export function normalizeSwampWorksState(value = {}) {
    const base = createSwampWorksState();
    if (!value || typeof value !== "object" || Array.isArray(value)) return base;
    const tiles = value.tiles && typeof value.tiles === "object" && !Array.isArray(value.tiles) ? value.tiles : {};
    const entries = Object.entries(tiles)
        .filter(([key]) => /^\d+:\d+$/.test(key))
        .slice(-MAX_WORK_TILES);
    for (const [key, raw] of entries) {
        const tile = normalizeTile(raw);
        if (tile) base.tiles[key] = tile;
    }
    for (const id of SWAMP_WORK_IDS) {
        base.stats[id] = Math.max(0, Math.min(MAX_STAT, Math.floor(number(value.stats?.[id]))));
    }
    base.revision = Math.max(0, Math.floor(number(value.revision)));
    return base;
}

export function ensureSwampWorks() {
    if (!state.swampWorks || typeof state.swampWorks !== "object" || Array.isArray(state.swampWorks)) {
        state.swampWorks = createSwampWorksState();
    } else if (state.swampWorks.version !== 1 || !state.swampWorks.tiles || !state.swampWorks.stats) {
        state.swampWorks = normalizeSwampWorksState(state.swampWorks);
    }
    return state.swampWorks;
}

function tileKey(x, y) {
    return Math.floor(number(x)) + ":" + Math.floor(number(y));
}

export function swampWorkAt(x, y) {
    return ensureSwampWorks().tiles[tileKey(x, y)] || null;
}

/** Only true flags are returned, so a spread cannot erase meadow land-use. */
export function swampWorkUseAt(x, y) {
    const record = swampWorkAt(x, y);
    if (!record) return {};
    const use = {};
    for (const id of SWAMP_WORK_IDS) {
        const flag = SWAMP_WORK_FLAGS[id];
        if (record[flag]) use[flag] = true;
    }
    return use;
}

export function swampWorkCooldownDays(kind) {
    return Math.max(0, number(SWAMP_WORKS[kind]?.cooldownDays));
}

export function swampWorkReady(x, y, kind, day = state.dayOfYear) {
    const definition = SWAMP_WORKS[kind];
    if (!definition) return { ok: false, reason: "Unknown wetland work" };
    const record = swampWorkAt(x, y);
    if (definition.cooldownDays <= 0 && record?.[SWAMP_WORK_FLAGS[kind]]) {
        return { ok: false, reason: definition.label + " is already built here" };
    }
    const last = Number(record?.lastHarvest?.[kind]);
    if (definition.cooldownDays > 0 && Number.isFinite(last)) {
        const today = Math.max(0, Math.floor(number(day)));
        const elapsed = today >= last ? today - last : 400 - last + today;
        if (elapsed < definition.cooldownDays) {
            return { ok: false, reason: definition.label + " needs " + (definition.cooldownDays - elapsed) + " more days to recover" };
        }
    }
    return { ok: true };
}

/** Record a completed work. Returns a copy of the persistent record. */
export function applySwampWork(x, y, kind, { day = state.dayOfYear } = {}) {
    const definition = SWAMP_WORKS[kind];
    if (!definition) return null;
    const works = ensureSwampWorks();
    const key = tileKey(x, y);
    let record = works.tiles[key];
    if (!record) record = works.tiles[key] = {
        boardwalk: false, drained: false, peatCut: false, fished: false,
        reedsCut: false, settled: false, bridged: false, defended: false,
        surveyed: false, lastDay: 0, lastHarvest: {},
    };
    record[SWAMP_WORK_FLAGS[kind]] = true;
    record.lastDay = Math.max(0, Math.floor(number(day)));
    record.lastHarvest[kind] = Math.max(0, Math.floor(number(day)));
    works.stats[kind] = Math.min(MAX_STAT, Math.max(0, Math.floor(number(works.stats[kind]))) + 1);
    works.revision += 1;
    // The terrain cache is keyed by the visual revision; a new boardwalk or
    // drainage cut must repaint the tile without waiting for a season change.
    state.forestVisualRevision = (Number(state.forestVisualRevision) || 0) + 1;
    state.terrainDirty = true;
    const keys = Object.keys(works.tiles);
    if (keys.length > MAX_WORK_TILES) {
        for (const stale of keys.slice(0, keys.length - MAX_WORK_TILES)) delete works.tiles[stale];
    }
    return { ...record, lastHarvest: { ...record.lastHarvest } };
}

export function swampWorksSummaryAt(x, y) {
    const record = swampWorkAt(x, y);
    if (!record) return "";
    return SWAMP_WORK_IDS
        .filter(id => record[SWAMP_WORK_FLAGS[id]])
        .map(id => SWAMP_WORKS[id].label)
        .join(" · ");
}

export function swampWorksStats() {
    const works = ensureSwampWorks();
    return { ...works.stats, tiles: Object.keys(works.tiles).length, revision: works.revision };
}

export function serializeSwampWorks() {
    const works = ensureSwampWorks();
    return {
        version: 1,
        revision: works.revision,
        stats: { ...works.stats },
        tiles: Object.fromEntries(Object.entries(works.tiles).map(([key, tile]) => [key, {
            ...tile, lastHarvest: { ...tile.lastHarvest },
        }])),
    };
}

export function restoreSwampWorks(snapshot) {
    state.swampWorks = normalizeSwampWorksState(snapshot);
    return Object.keys(state.swampWorks.tiles).length;
}

export function validateSwampWorksSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
        throw new Error("Swamp works snapshot must be an object");
    }
    if (snapshot.version !== 1) throw new Error("Unsupported swamp works version");
    if (!snapshot.tiles || typeof snapshot.tiles !== "object" || Array.isArray(snapshot.tiles)) {
        throw new Error("Swamp works tiles must be an object");
    }
    const keys = Object.keys(snapshot.tiles);
    if (keys.length > MAX_WORK_TILES) throw new Error("Swamp works exceed the tile limit");
    for (const [key, tile] of Object.entries(snapshot.tiles)) {
        if (!/^\d+:\d+$/.test(key)) throw new Error("Invalid swamp work tile key");
        if (!tile || typeof tile !== "object" || Array.isArray(tile)) throw new Error("Invalid swamp work tile");
        for (const id of SWAMP_WORK_IDS) {
            const flag = SWAMP_WORK_FLAGS[id];
            if (tile[flag] !== undefined && typeof tile[flag] !== "boolean") throw new Error("Invalid swamp work flag " + flag);
        }
    }
    if (snapshot.stats !== undefined && (!snapshot.stats || typeof snapshot.stats !== "object" || Array.isArray(snapshot.stats))) {
        throw new Error("Invalid swamp work statistics");
    }
    return true;
}
