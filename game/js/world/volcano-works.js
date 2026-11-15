// Player-made volcanic works (spec 1.2.13.49–1.2.13.57 and 1.2.13.73).
//
// The ecology profile already describes a basalt quarry, an obsidian working, a
// geothermal plant or a crater expedition as a real potential of the tile. This
// module records which of those the realm has actually built. It is a bounded
// tile map in the same shape as the wetland and mountain works, not a second
// resource economy.
import { state } from "../core/state.js";

export const VOLCANO_WORKS = Object.freeze({
    lavaQuarry: Object.freeze({
        id: "lavaQuarry", requirement: "1.2.13.49", label: "Basalt quarry",
        description: "Basalt is split from cooled flow fronts and dressed into durable building blocks.",
        cost: Object.freeze({ wood: 5, stone: 3 }), cooldownDays: 14,
    }),
    obsidianQuarry: Object.freeze({
        id: "obsidianQuarry", requirement: "1.2.13.50", label: "Obsidian working",
        description: "Glass-sharp obsidian is collected from the flow margin and worked into tools and ornaments.",
        cost: Object.freeze({ wood: 4, stone: 6 }), cooldownDays: 20,
    }),
    pumiceQuarry: Object.freeze({
        id: "pumiceQuarry", requirement: "1.2.13.51", label: "Pumice quarry",
        description: "Light pumice is sieved from the ash cones for plaster, insulation and polishing.",
        cost: Object.freeze({ wood: 3, stone: 2 }), cooldownDays: 12,
    }),
    sulfurMine: Object.freeze({
        id: "sulfurMine", requirement: "1.2.13.52", label: "Sulfur mine",
        description: "Vent crusts are worked behind wet cloth screens; the yellow sulfur is carried down in sealed baskets.",
        cost: Object.freeze({ wood: 6, stone: 4 }), cooldownDays: 22,
    }),
    metalMine: Object.freeze({
        id: "metalMine", requirement: "1.2.13.53", label: "Volcanic metal mine",
        description: "Adits follow the oxidized ore seams exposed by the old flows and ash beds.",
        cost: Object.freeze({ wood: 10, stone: 8 }), cooldownDays: 18,
    }),
    mineralWorks: Object.freeze({
        id: "mineralWorks", requirement: "1.2.13.54", label: "Mineral workings",
        description: "Crusts, salts and zeolites are washed, sorted and barrelled from the warm ground.",
        cost: Object.freeze({ wood: 7, stone: 5 }), cooldownDays: 16,
    }),
    geothermalPlant: Object.freeze({
        id: "geothermalPlant", requirement: "1.2.13.55", label: "Geothermal plant",
        description: "A capped steam well drives a small turbine and a network of hot-water pipes for the settlement.",
        cost: Object.freeze({ wood: 12, stone: 16, gold: 8 }), cooldownDays: 0,
    }),
    fertileTerrace: Object.freeze({
        id: "fertileTerrace", requirement: "1.2.13.56", label: "Volcanic soil terrace",
        description: "Weathered ash and pumice are held behind low stone walls and planted with heat-tolerant crops.",
        cost: Object.freeze({ wood: 7, stone: 9 }), cooldownDays: 0,
    }),
    craterExpedition: Object.freeze({
        id: "craterExpedition", requirement: "1.2.13.57", label: "Crater expedition",
        description: "A rope, ladder and survey team reach the crater floor for rare crystals and mineral samples.",
        cost: Object.freeze({ wood: 8, stone: 3, gold: 5 }), cooldownDays: 30,
    }),
    observatory: Object.freeze({
        id: "observatory", requirement: "1.2.13.73", label: "Volcanic observatory",
        description: "A stone watch post, tilt marks and a warning bell turn the next eruption into a forecast rather than a surprise.",
        cost: Object.freeze({ wood: 9, stone: 14, gold: 7 }), cooldownDays: 0,
    }),
});

export const VOLCANO_WORK_IDS = Object.freeze(Object.keys(VOLCANO_WORKS));
export const VOLCANO_WORK_FLAGS = Object.freeze({
    lavaQuarry: "lavaQuarry", obsidianQuarry: "obsidianQuarry", pumiceQuarry: "pumiceQuarry",
    sulfurMine: "sulfurMine", metalMine: "metalMine", mineralWorks: "mineralWorks",
    geothermalPlant: "geothermalPlant", fertileTerrace: "fertileTerrace",
    craterExpedition: "craterExpedition", observatory: "observatory",
});
const MAX_WORK_TILES = 512;
const MAX_STAT = 100000;

const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const bool = value => value === true || value === 1 || value === "true";

function emptyStats() {
    return Object.fromEntries(VOLCANO_WORK_IDS.map(id => [id, 0]));
}

export function createVolcanoWorksState() {
    return { version: 1, revision: 0, tiles: {}, stats: emptyStats() };
}

function normalizeTile(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const tile = { lastDay: Math.max(0, Math.floor(number(value.lastDay))), lastHarvest: {} };
    for (const id of VOLCANO_WORK_IDS) tile[VOLCANO_WORK_FLAGS[id]] = bool(value[VOLCANO_WORK_FLAGS[id]]);
    for (const id of VOLCANO_WORK_IDS) {
        const day = Number(value.lastHarvest?.[id]);
        if (Number.isFinite(day) && day >= 0) tile.lastHarvest[id] = Math.floor(day);
    }
    if (!VOLCANO_WORK_IDS.some(id => tile[VOLCANO_WORK_FLAGS[id]])) return null;
    return tile;
}

export function normalizeVolcanoWorksState(value = {}) {
    const base = createVolcanoWorksState();
    if (!value || typeof value !== "object" || Array.isArray(value)) return base;
    const tiles = value.tiles && typeof value.tiles === "object" && !Array.isArray(value.tiles) ? value.tiles : {};
    const entries = Object.entries(tiles).filter(([key]) => /^\d+:\d+$/.test(key)).slice(-MAX_WORK_TILES);
    for (const [key, raw] of entries) {
        const tile = normalizeTile(raw);
        if (tile) base.tiles[key] = tile;
    }
    for (const id of VOLCANO_WORK_IDS) {
        base.stats[id] = Math.max(0, Math.min(MAX_STAT, Math.floor(number(value.stats?.[id]))));
    }
    base.revision = Math.max(0, Math.floor(number(value.revision)));
    return base;
}

export function ensureVolcanoWorks() {
    if (!state.volcanoWorks || typeof state.volcanoWorks !== "object" || Array.isArray(state.volcanoWorks)) {
        state.volcanoWorks = createVolcanoWorksState();
    } else if (state.volcanoWorks.version !== 1 || !state.volcanoWorks.tiles || !state.volcanoWorks.stats) {
        state.volcanoWorks = normalizeVolcanoWorksState(state.volcanoWorks);
    }
    return state.volcanoWorks;
}

function tileKey(x, y) {
    return Math.floor(number(x)) + ":" + Math.floor(number(y));
}

export function volcanoWorkAt(x, y) {
    return ensureVolcanoWorks().tiles[tileKey(x, y)] || null;
}

export function volcanoWorkUseAt(x, y) {
    const record = volcanoWorkAt(x, y);
    if (!record) return {};
    const use = {};
    for (const id of VOLCANO_WORK_IDS) {
        const flag = VOLCANO_WORK_FLAGS[id];
        if (record[flag]) use[flag] = true;
    }
    return use;
}

export function volcanoWorkReady(x, y, kind, day = state.dayOfYear) {
    const definition = VOLCANO_WORKS[kind];
    if (!definition) return { ok: false, reason: "Unknown volcanic work" };
    const record = volcanoWorkAt(x, y);
    if (definition.cooldownDays <= 0 && record?.[VOLCANO_WORK_FLAGS[kind]]) {
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

export function applyVolcanoWork(x, y, kind, { day = state.dayOfYear } = {}) {
    const definition = VOLCANO_WORKS[kind];
    if (!definition) return null;
    const works = ensureVolcanoWorks();
    const key = tileKey(x, y);
    let record = works.tiles[key];
    if (!record) {
        record = works.tiles[key] = { lastDay: 0, lastHarvest: {} };
        for (const id of VOLCANO_WORK_IDS) record[VOLCANO_WORK_FLAGS[id]] = false;
    }
    record[VOLCANO_WORK_FLAGS[kind]] = true;
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

export function volcanoWorksSummaryAt(x, y) {
    const record = volcanoWorkAt(x, y);
    if (!record) return "";
    return VOLCANO_WORK_IDS.filter(id => record[VOLCANO_WORK_FLAGS[id]]).map(id => VOLCANO_WORKS[id].label).join(" · ");
}

export function volcanoWorksStats() {
    const works = ensureVolcanoWorks();
    return { ...works.stats, tiles: Object.keys(works.tiles).length, revision: works.revision };
}

export function serializeVolcanoWorks() {
    const works = ensureVolcanoWorks();
    return {
        version: 1,
        revision: works.revision,
        stats: { ...works.stats },
        tiles: Object.fromEntries(Object.entries(works.tiles).map(([key, tile]) => [key, {
            ...tile, lastHarvest: { ...tile.lastHarvest },
        }])),
    };
}

export function restoreVolcanoWorks(snapshot) {
    state.volcanoWorks = normalizeVolcanoWorksState(snapshot);
    return Object.keys(state.volcanoWorks.tiles).length;
}

export function validateVolcanoWorksSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
        throw new Error("Volcanic works snapshot must be an object");
    }
    if (snapshot.version !== 1) throw new Error("Unsupported volcanic works version");
    if (!snapshot.tiles || typeof snapshot.tiles !== "object" || Array.isArray(snapshot.tiles)) {
        throw new Error("Volcanic works tiles must be an object");
    }
    const keys = Object.keys(snapshot.tiles);
    if (keys.length > MAX_WORK_TILES) throw new Error("Volcanic works exceed the tile limit");
    for (const [key, tile] of Object.entries(snapshot.tiles)) {
        if (!/^\d+:\d+$/.test(key)) throw new Error("Invalid volcanic work tile key");
        if (!tile || typeof tile !== "object" || Array.isArray(tile)) throw new Error("Invalid volcanic work tile");
        for (const id of VOLCANO_WORK_IDS) {
            const flag = VOLCANO_WORK_FLAGS[id];
            if (tile[flag] !== undefined && typeof tile[flag] !== "boolean") throw new Error("Invalid volcanic work flag " + flag);
        }
    }
    if (snapshot.stats !== undefined && (!snapshot.stats || typeof snapshot.stats !== "object" || Array.isArray(snapshot.stats))) {
        throw new Error("Invalid volcanic work statistics");
    }
    return true;
}
