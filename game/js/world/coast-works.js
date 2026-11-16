// Player-made coastal works (spec 1.2.14.54–1.2.14.63).
//
// The coastal profile already describes a fishing shore, natural harbour, salt
// marsh or exposed headland as a real potential of the tile. This module records
// which of those the realm has actually developed. It is a bounded tile map in
// the same shape as the wetland, mountain and volcanic works, not a second
// resource economy or a per-building simulation.
import { state } from "../core/state.js";

export const COAST_WORKS = Object.freeze({
    fishingVillage: Object.freeze({
        id: "fishingVillage", requirement: "1.2.14.54", label: "Fishing village",
        description: "Net sheds, drying racks and a launching beach turn a productive shore into a working fishing village.",
        cost: Object.freeze({ wood: 10, stone: 4 }), cooldownDays: 14,
    }),
    harbour: Object.freeze({
        id: "harbour", requirement: "1.2.14.55", label: "Harbour town",
        description: "A dredged approach, stone quay and sheltered basin make the natural anchorage a real harbour town.",
        cost: Object.freeze({ wood: 16, stone: 18, gold: 8 }), cooldownDays: 0,
    }),
    tradingPost: Object.freeze({
        id: "tradingPost", requirement: "1.2.14.56", label: "Trading post",
        description: "A warehouse, customs table and beacon receive sea trade goods and carry them inland.",
        cost: Object.freeze({ wood: 12, stone: 6, gold: 6 }), cooldownDays: 0,
    }),
    fortress: Object.freeze({
        id: "fortress", requirement: "1.2.14.57", label: "Coastal fortress",
        description: "A stone battery and watchtower command the seaward approach and the landing beach.",
        cost: Object.freeze({ wood: 10, stone: 24, gold: 6 }), cooldownDays: 0,
    }),
    lighthouse: Object.freeze({
        id: "lighthouse", requirement: "1.2.14.58", label: "Lighthouse",
        description: "A tall stone tower with a sheltered lamp warns shipping off the rocks and marks the harbour mouth.",
        cost: Object.freeze({ wood: 6, stone: 16, gold: 8 }), cooldownDays: 0,
    }),
    shipyard: Object.freeze({
        id: "shipyard", requirement: "1.2.14.59", label: "Shipyard",
        description: "Slipways, a timber yard and a deep-water launch build and repair coastal vessels.",
        cost: Object.freeze({ wood: 18, stone: 10, gold: 8 }), cooldownDays: 0,
    }),
    saltworks: Object.freeze({
        id: "saltworks", requirement: "1.2.14.60", label: "Salt-making works",
        description: "Shallow pans and a boiling house turn tidal brine into sea salt for the realm's stores.",
        cost: Object.freeze({ wood: 8, stone: 8 }), cooldownDays: 18,
    }),
    market: Object.freeze({
        id: "market", requirement: "1.2.14.61", label: "Coastal market",
        description: "A fish market, toll booth and open trading floor connect the shore to inland merchants.",
        cost: Object.freeze({ wood: 10, stone: 6, gold: 4 }), cooldownDays: 0,
    }),
    navalBase: Object.freeze({
        id: "navalBase", requirement: "1.2.14.62", label: "Naval base",
        description: "A defended fleet station with a careening beach, victualling store and signal station.",
        cost: Object.freeze({ wood: 20, stone: 22, gold: 12 }), cooldownDays: 0,
    }),
});

export const COAST_WORK_IDS = Object.freeze(Object.keys(COAST_WORKS));
export const COAST_WORK_FLAGS = Object.freeze({
    fishingVillage: "fishingVillage",
    harbour: "harbour",
    tradingPost: "tradingPost",
    fortress: "fortress",
    lighthouse: "lighthouse",
    shipyard: "shipyard",
    saltworks: "saltworks",
    market: "market",
    navalBase: "navalBase",
});
const MAX_WORK_TILES = 512;
const MAX_STAT = 100000;

const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const bool = value => value === true || value === 1 || value === "true";

function emptyStats() {
    return Object.fromEntries(COAST_WORK_IDS.map(id => [id, 0]));
}

export function createCoastWorksState() {
    return { version: 1, revision: 0, tiles: {}, stats: emptyStats() };
}

function normalizeTile(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const tile = { lastDay: Math.max(0, Math.floor(number(value.lastDay))), lastHarvest: {} };
    for (const id of COAST_WORK_IDS) tile[COAST_WORK_FLAGS[id]] = bool(value[COAST_WORK_FLAGS[id]]);
    for (const id of COAST_WORK_IDS) {
        const day = Number(value.lastHarvest?.[id]);
        if (Number.isFinite(day) && day >= 0) tile.lastHarvest[id] = Math.floor(day);
    }
    if (!COAST_WORK_IDS.some(id => tile[COAST_WORK_FLAGS[id]])) return null;
    return tile;
}

export function normalizeCoastWorksState(value = {}) {
    const base = createCoastWorksState();
    if (!value || typeof value !== "object" || Array.isArray(value)) return base;
    const tiles = value.tiles && typeof value.tiles === "object" && !Array.isArray(value.tiles) ? value.tiles : {};
    const entries = Object.entries(tiles).filter(([key]) => /^\d+:\d+$/.test(key)).slice(-MAX_WORK_TILES);
    for (const [key, raw] of entries) {
        const tile = normalizeTile(raw);
        if (tile) base.tiles[key] = tile;
    }
    for (const id of COAST_WORK_IDS) {
        base.stats[id] = Math.max(0, Math.min(MAX_STAT, Math.floor(number(value.stats?.[id]))));
    }
    base.revision = Math.max(0, Math.floor(number(value.revision)));
    return base;
}

export function ensureCoastWorks() {
    if (!state.coastWorks || typeof state.coastWorks !== "object" || Array.isArray(state.coastWorks)) {
        state.coastWorks = createCoastWorksState();
    } else if (state.coastWorks.version !== 1 || !state.coastWorks.tiles || !state.coastWorks.stats) {
        state.coastWorks = normalizeCoastWorksState(state.coastWorks);
    }
    return state.coastWorks;
}

function tileKey(x, y) {
    return Math.floor(number(x)) + ":" + Math.floor(number(y));
}

export function coastWorkAt(x, y) {
    return ensureCoastWorks().tiles[tileKey(x, y)] || null;
}

export function coastWorkUseAt(x, y) {
    const record = coastWorkAt(x, y);
    if (!record) return {};
    const use = {};
    for (const id of COAST_WORK_IDS) {
        const flag = COAST_WORK_FLAGS[id];
        if (record[flag]) use[flag] = true;
    }
    return use;
}

export function coastWorkReady(x, y, kind, day = state.dayOfYear) {
    const definition = COAST_WORKS[kind];
    if (!definition) return { ok: false, reason: "Unknown coastal work" };
    const record = coastWorkAt(x, y);
    if (definition.cooldownDays <= 0 && record?.[COAST_WORK_FLAGS[kind]]) {
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

export function applyCoastWork(x, y, kind, { day = state.dayOfYear } = {}) {
    const definition = COAST_WORKS[kind];
    if (!definition) return null;
    const works = ensureCoastWorks();
    const key = tileKey(x, y);
    let record = works.tiles[key];
    if (!record) {
        record = works.tiles[key] = { lastDay: 0, lastHarvest: {} };
        for (const id of COAST_WORK_IDS) record[COAST_WORK_FLAGS[id]] = false;
    }
    record[COAST_WORK_FLAGS[kind]] = true;
    record.lastDay = Math.max(0, Math.floor(number(day)));
    record.lastHarvest[kind] = Math.max(0, Math.floor(number(day)));
    works.stats[kind] = Math.min(MAX_STAT, Math.max(0, Math.floor(number(works.stats[kind]))) + 1);
    works.revision += 1;
    state.forestVisualRevision = (Number(state.forestVisualRevision) || 0) + 1;
    state.terrainDirty = true;
    const keys = Object.keys(works.tiles);
    if (keys.length > MAX_WORK_TILES) {
        for (const stale of keys.slice(0, keys.length - MAX_WORK_TILES)) delete works.tiles[stale];
    }
    return { ...record, lastHarvest: { ...record.lastHarvest } };
}

export function coastWorksSummaryAt(x, y) {
    const record = coastWorkAt(x, y);
    if (!record) return "";
    return COAST_WORK_IDS.filter(id => record[COAST_WORK_FLAGS[id]]).map(id => COAST_WORKS[id].label).join(" · ");
}

export function coastWorksStats() {
    const works = ensureCoastWorks();
    return { ...works.stats, tiles: Object.keys(works.tiles).length, revision: works.revision };
}

export function serializeCoastWorks() {
    const works = ensureCoastWorks();
    return {
        version: 1,
        revision: works.revision,
        stats: { ...works.stats },
        tiles: Object.fromEntries(Object.entries(works.tiles).map(([key, tile]) => [key, {
            ...tile, lastHarvest: { ...tile.lastHarvest },
        }])),
    };
}

export function restoreCoastWorks(snapshot) {
    state.coastWorks = normalizeCoastWorksState(snapshot);
    return Object.keys(state.coastWorks.tiles).length;
}

export function validateCoastWorksSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
        throw new Error("Coastal works snapshot must be an object");
    }
    if (snapshot.version !== 1) throw new Error("Unsupported coastal works version");
    if (!snapshot.tiles || typeof snapshot.tiles !== "object" || Array.isArray(snapshot.tiles)) {
        throw new Error("Coastal works tiles must be an object");
    }
    const keys = Object.keys(snapshot.tiles);
    if (keys.length > MAX_WORK_TILES) throw new Error("Coastal works exceed the tile limit");
    for (const [key, tile] of Object.entries(snapshot.tiles)) {
        if (!/^\d+:\d+$/.test(key)) throw new Error("Invalid coastal work tile key");
        if (!tile || typeof tile !== "object" || Array.isArray(tile)) throw new Error("Invalid coastal work tile");
        for (const id of COAST_WORK_IDS) {
            const flag = COAST_WORK_FLAGS[id];
            if (tile[flag] !== undefined && typeof tile[flag] !== "boolean") throw new Error("Invalid coastal work flag " + flag);
        }
    }
    if (snapshot.stats !== undefined && (!snapshot.stats || typeof snapshot.stats !== "object" || Array.isArray(snapshot.stats))) {
        throw new Error("Invalid coastal work statistics");
    }
    return true;
}
