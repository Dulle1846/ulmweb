// Player-made mountain works (spec 1.2.12.69–1.2.12.77).
//
// The mountain ecology already describes a terraced village, a pass, a mine or
// a quarry as a potential use of the slope. This module records which of those
// works the realm has actually built. It is a bounded tile map in the same
// shape as the wetland works, not a second resource economy.
import { state } from "../core/state.js";

export const MOUNTAIN_WORKS = Object.freeze({
    terrace: Object.freeze({
        id: "terrace", requirement: "1.2.12.69", label: "Terraced mountain village",
        description: "Stone-faced terraces turn a steep slope into gardens, threshing floors and a safe footing for houses.",
        cost: Object.freeze({ wood: 8, stone: 10 }), cooldownDays: 0,
    }),
    village: Object.freeze({
        id: "village", requirement: "1.2.12.70", label: "Sheltered valley settlement",
        description: "A compact settlement in the lee of the ridge, out of the wind and above the worst snowmelt.",
        cost: Object.freeze({ wood: 14, stone: 8 }), cooldownDays: 0,
    }),
    fort: Object.freeze({
        id: "fort", requirement: "1.2.12.71", label: "Summit fortress",
        description: "A small stone keep on the highest defensible knoll; the approach is broken and exposed.",
        cost: Object.freeze({ wood: 10, stone: 24, gold: 6 }), cooldownDays: 0,
    }),
    passFort: Object.freeze({
        id: "passFort", requirement: "1.2.12.72", label: "Fortified pass",
        description: "A gate, wall and watch post close the only practical road through the range.",
        cost: Object.freeze({ wood: 8, stone: 20, gold: 4 }), cooldownDays: 0,
    }),
    road: Object.freeze({
        id: "road", requirement: "1.2.12.73", label: "Switchback road",
        description: "A graded zigzag path with low retaining walls makes the slope passable for carts and pack trains.",
        cost: Object.freeze({ wood: 6, stone: 6 }), cooldownDays: 0,
    }),
    bridge: Object.freeze({
        id: "bridge", requirement: "1.2.12.74", label: "Gorge bridge",
        description: "A timber and stone span carries the path over a ravine instead of forcing a long detour.",
        cost: Object.freeze({ wood: 12, stone: 8 }), cooldownDays: 0,
    }),
    mine: Object.freeze({
        id: "mine", requirement: "1.2.12.75", label: "Mountain mine",
        description: "Adits and timber props follow an ore seam into the mountain; the spoil heap marks the entrance.",
        cost: Object.freeze({ wood: 10, stone: 6 }), cooldownDays: 18,
    }),
    quarry: Object.freeze({
        id: "quarry", requirement: "1.2.12.76", label: "Stone quarry",
        description: "Blocks are split along the bedding planes and lowered by sledges and ropeways.",
        cost: Object.freeze({ wood: 4, stone: 2 }), cooldownDays: 14,
    }),
    aqueduct: Object.freeze({
        id: "aqueduct", requirement: "1.2.12.77", label: "Water conduit and small dam",
        description: "A spring is captured, a stone channel follows the contour and a small dam stores meltwater for the settlement.",
        cost: Object.freeze({ wood: 6, stone: 14 }), cooldownDays: 0,
    }),
});

export const MOUNTAIN_WORK_IDS = Object.freeze(Object.keys(MOUNTAIN_WORKS));
export const MOUNTAIN_WORK_FLAGS = Object.freeze({
    terrace: "terraced", village: "valleySettlement", fort: "fortress",
    passFort: "fortifiedPass", road: "road", bridge: "bridge",
    mine: "mine", quarry: "quarry", aqueduct: "aqueduct",
});
const MAX_WORK_TILES = 512;
const MAX_STAT = 100000;

const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const bool = value => value === true || value === 1 || value === "true";

function emptyStats() {
    return Object.fromEntries(MOUNTAIN_WORK_IDS.map(id => [id, 0]));
}

export function createMountainWorksState() {
    return { version: 1, revision: 0, tiles: {}, stats: emptyStats() };
}

function normalizeTile(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const tile = {
        terraced: bool(value.terraced), valleySettlement: bool(value.valleySettlement),
        fortress: bool(value.fortress), fortifiedPass: bool(value.fortifiedPass),
        road: bool(value.road), bridge: bool(value.bridge),
        mine: bool(value.mine), quarry: bool(value.quarry), aqueduct: bool(value.aqueduct),
        lastDay: Math.max(0, Math.floor(number(value.lastDay))),
        lastHarvest: {},
    };
    for (const id of MOUNTAIN_WORK_IDS) {
        const day = Number(value.lastHarvest?.[id]);
        if (Number.isFinite(day) && day >= 0) tile.lastHarvest[id] = Math.floor(day);
    }
    if (!MOUNTAIN_WORK_IDS.some(id => tile[MOUNTAIN_WORK_FLAGS[id]])) return null;
    return tile;
}

export function normalizeMountainWorksState(value = {}) {
    const base = createMountainWorksState();
    if (!value || typeof value !== "object" || Array.isArray(value)) return base;
    const tiles = value.tiles && typeof value.tiles === "object" && !Array.isArray(value.tiles) ? value.tiles : {};
    const entries = Object.entries(tiles).filter(([key]) => /^\d+:\d+$/.test(key)).slice(-MAX_WORK_TILES);
    for (const [key, raw] of entries) {
        const tile = normalizeTile(raw);
        if (tile) base.tiles[key] = tile;
    }
    for (const id of MOUNTAIN_WORK_IDS) {
        base.stats[id] = Math.max(0, Math.min(MAX_STAT, Math.floor(number(value.stats?.[id]))));
    }
    base.revision = Math.max(0, Math.floor(number(value.revision)));
    return base;
}

export function ensureMountainWorks() {
    if (!state.mountainWorks || typeof state.mountainWorks !== "object" || Array.isArray(state.mountainWorks)) {
        state.mountainWorks = createMountainWorksState();
    } else if (state.mountainWorks.version !== 1 || !state.mountainWorks.tiles || !state.mountainWorks.stats) {
        state.mountainWorks = normalizeMountainWorksState(state.mountainWorks);
    }
    return state.mountainWorks;
}

function tileKey(x, y) {
    return Math.floor(number(x)) + ":" + Math.floor(number(y));
}

export function mountainWorkAt(x, y) {
    return ensureMountainWorks().tiles[tileKey(x, y)] || null;
}

export function mountainWorkUseAt(x, y) {
    const record = mountainWorkAt(x, y);
    if (!record) return {};
    const use = {};
    for (const id of MOUNTAIN_WORK_IDS) {
        const flag = MOUNTAIN_WORK_FLAGS[id];
        if (record[flag]) use[flag] = true;
    }
    return use;
}

export function mountainWorkReady(x, y, kind, day = state.dayOfYear) {
    const definition = MOUNTAIN_WORKS[kind];
    if (!definition) return { ok: false, reason: "Unknown mountain work" };
    const record = mountainWorkAt(x, y);
    if (definition.cooldownDays <= 0 && record?.[MOUNTAIN_WORK_FLAGS[kind]]) {
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

export function applyMountainWork(x, y, kind, { day = state.dayOfYear } = {}) {
    const definition = MOUNTAIN_WORKS[kind];
    if (!definition) return null;
    const works = ensureMountainWorks();
    const key = tileKey(x, y);
    let record = works.tiles[key];
    if (!record) record = works.tiles[key] = {
        terraced: false, valleySettlement: false, fortress: false, fortifiedPass: false,
        road: false, bridge: false, mine: false, quarry: false, aqueduct: false,
        lastDay: 0, lastHarvest: {},
    };
    record[MOUNTAIN_WORK_FLAGS[kind]] = true;
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

export function mountainWorksSummaryAt(x, y) {
    const record = mountainWorkAt(x, y);
    if (!record) return "";
    return MOUNTAIN_WORK_IDS.filter(id => record[MOUNTAIN_WORK_FLAGS[id]]).map(id => MOUNTAIN_WORKS[id].label).join(" · ");
}

export function mountainWorksStats() {
    const works = ensureMountainWorks();
    return { ...works.stats, tiles: Object.keys(works.tiles).length, revision: works.revision };
}

export function serializeMountainWorks() {
    const works = ensureMountainWorks();
    return {
        version: 1,
        revision: works.revision,
        stats: { ...works.stats },
        tiles: Object.fromEntries(Object.entries(works.tiles).map(([key, tile]) => [key, {
            ...tile, lastHarvest: { ...tile.lastHarvest },
        }])),
    };
}

export function restoreMountainWorks(snapshot) {
    state.mountainWorks = normalizeMountainWorksState(snapshot);
    return Object.keys(state.mountainWorks.tiles).length;
}

export function validateMountainWorksSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
        throw new Error("Mountain works snapshot must be an object");
    }
    if (snapshot.version !== 1) throw new Error("Unsupported mountain works version");
    if (!snapshot.tiles || typeof snapshot.tiles !== "object" || Array.isArray(snapshot.tiles)) {
        throw new Error("Mountain works tiles must be an object");
    }
    const keys = Object.keys(snapshot.tiles);
    if (keys.length > MAX_WORK_TILES) throw new Error("Mountain works exceed the tile limit");
    for (const [key, tile] of Object.entries(snapshot.tiles)) {
        if (!/^\d+:\d+$/.test(key)) throw new Error("Invalid mountain work tile key");
        if (!tile || typeof tile !== "object" || Array.isArray(tile)) throw new Error("Invalid mountain work tile");
        for (const id of MOUNTAIN_WORK_IDS) {
            const flag = MOUNTAIN_WORK_FLAGS[id];
            if (tile[flag] !== undefined && typeof tile[flag] !== "boolean") throw new Error("Invalid mountain work flag " + flag);
        }
    }
    if (snapshot.stats !== undefined && (!snapshot.stats || typeof snapshot.stats !== "object" || Array.isArray(snapshot.stats))) {
        throw new Error("Invalid mountain work statistics");
    }
    return true;
}
