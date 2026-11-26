// 1.2.23.1 — shared forest data model, performance envelopes and modding contract.
//
// The sixty regional woodlands already carry stable ids and site envelopes.
// This module does not run a second forest simulation: it reads the existing
// stand/regional/ecology records and exposes the bounded matrices that the
// atlas, succession spread and save layer need. Every expensive derivation is
// cached, and every chunk walk has a fixed work budget.

import { BIOME_SOIL_TYPES } from "./cross-biome-data.js";
import {
    FOREST_SUCCESSION_PROFILES, forestPhenologyAt, forestRegrowthFactor, forestSuccessionStage,
} from "./forest-ecology.js";
import {
    REGIONAL_FOREST_TYPES, REGIONAL_FOREST_TYPE_BY_ID, REGIONAL_FOREST_TYPE_BY_KEY, REGIONAL_GOODS,
} from "./regional-forests.js";

export const FOREST_MODEL_VERSION = 1;
export const FOREST_MODEL_SAVE_VERSION = 1;
export const FOREST_CHUNK_SIZE = 16;
export const FOREST_MODEL_SAMPLE_BUDGET = 16;
export const FOREST_MODEL_TYPE_BUDGET = 8;
export const FOREST_MODEL_CACHE_LIMIT = 64;

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
const round = (value, digits = 2) => {
    const factor = 10 ** digits;
    return Math.round((Number(value) || 0) * factor) / factor;
};
const now = () => (typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now() : Date.now());

function hash32(seed, a = 0, b = 0, salt = 0) {
    let value = (Number(seed) >>> 0) ^ Math.imul((Number(a) | 0) + 1, 0x9e3779b1)
        ^ Math.imul((Number(b) | 0) + 1, 0x85ebca77) ^ salt;
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
    return (value ^ (value >>> 16)) >>> 0;
}

function stringHash(value) {
    let hash = 2166136261;
    for (const character of String(value || "")) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function freeze(value) {
    return Object.freeze(value);
}

function boundedSet(map, key, value, limit = FOREST_MODEL_CACHE_LIMIT) {
    if (map.size >= limit && !map.has(key)) {
        map.delete(map.keys().next().value);
    }
    map.set(key, value);
    return value;
}

function typeFor(input) {
    if (!input) return null;
    if (typeof input === "string") {
        return REGIONAL_FOREST_TYPE_BY_ID[input] || REGIONAL_FOREST_TYPE_BY_KEY[input] || null;
    }
    if (typeof input !== "object") return null;
    if (input.regionalType && typeof input.regionalType === "object") return input.regionalType;
    const typeId = input.regionalTypeId || input.forestTypeId || input.typeId || input.id;
    if (typeId && REGIONAL_FOREST_TYPE_BY_ID[typeId]) return REGIONAL_FOREST_TYPE_BY_ID[typeId];
    const typeKey = input.regionalType || input.forestType || input.key;
    if (typeof typeKey === "string") {
        return REGIONAL_FOREST_TYPE_BY_KEY[typeKey] || REGIONAL_FOREST_TYPE_BY_ID[typeKey] || null;
    }
    return null;
}

function climateKey(value) {
    const climate = String(value || "temperate").toLowerCase();
    return climate === "boreal" ? "taiga" : climate;
}

const empire = (id, key, label, symbol, group = "model") => freeze({
    id: `1.2.23.1.${id}`,
    key,
    label,
    group,
    evidence: freeze([{ file: "js/world/forest-model.js", symbol, role: group }]),
    tests: freeze(["tests/world/forest-model.test.js"]),
});

// The manifest is the single machine-readable list for the 30 data-model
// points. The spec audit reads it directly, so a future rename cannot leave a
// hand-maintained checklist claiming a feature the runtime does not export.
export const FOREST_MODEL_REQUIREMENTS = freeze([
    empire("121", "stable-type-ids", "Eindeutige Waldtyp-IDs für Speicherung und Modding", "forestTypeIdFor", "identity"),
    empire("122", "regional-weights", "Regionale Verteilungsgewichte pro Klima und Höhe", "forestRegionalWeightsFor", "distribution"),
    empire("123", "height-limits", "Höhengrenzen für Baumarten und Waldtypen", "forestLimitsFor", "envelope"),
    empire("124", "climate-limits", "Klimagrenzen für Temperatur, Frost und Niederschlag", "forestClimateEnvelopeFor", "envelope"),
    empire("125", "soil-matrix", "Bodenmatrix aus Nährstoff, pH und Wasserspeicherung", "forestSoilFor", "soil"),
    empire("126", "moisture-index", "Feuchtigkeitsindex für Auen, Moore und Trockenwälder", "forestMoistureIndexFor", "water"),
    empire("127", "disturbance-matrix", "Störungsmatrix für Feuer, Sturm, Eis und Überschwemmung", "forestDisturbanceMatrixFor", "disturbance"),
    empire("128", "succession-matrix", "Sukzessionsmatrix mit Übergängen zwischen Stadien", "forestSuccessionMatrixFor", "succession"),
    empire("129", "species-pool", "Regionaler Artenpool für Bäume, Tiere und Pflanzen", "forestSpeciesPoolFor", "species"),
    empire("130", "lod-levels", "LOD-Stufen für weit entfernte Waldflächen", "forestLodFor", "performance"),
    empire("131", "chunk-precompute", "Vorberechnete Chunk-Daten für Waldtyp und Dichte", "precomputeForestChunk", "performance"),
    empire("132", "annual-cadence", "Jahres-Cadence für ökologische Veränderungen", "forestAnnualCadenceFor", "cadence"),
    empire("133", "phenology", "Saisonale Phänologie für Blatt, Blüte und Frucht", "forestPhenologyFor", "season"),
    empire("134", "region-seeds", "Deterministische Seeds für jede Waldregion", "forestRegionSeedFor", "identity"),
    empire("135", "save-version", "Versionierte Save-Struktur für neue Waldtypen", "forestModelSaveMeta", "save"),
    empire("136", "save-migration", "Migration alter Spielstände ohne Waldverlust", "migrateForestModelSave", "save"),
    empire("137", "modding-schema", "Modding-Schema für eigene Waldtypen", "validateForestTypeDefinition", "modding"),
    empire("138", "data-validation", "Datenvalidierung für Regionen, Arten und Gewichte", "validateForestModelCatalog", "modding"),
    empire("139", "telemetry", "Telemetrie für Performance und Artenverteilung", "forestModelTelemetrySnapshot", "performance"),
    empire("140", "chunk-budget", "Festes Performance-Budget pro Wald-Chunk", "forestChunkBudgetFor", "performance"),
    empire("141", "colour-cache", "Caching von Baumarten- und Farbdaten", "forestModelCacheStats", "performance"),
    empire("142", "spatial-index", "Räumliche Indizes für Tiere und Ressourcen", "buildForestSpatialIndex", "performance"),
    empire("143", "neighbourhood", "Nachbarschaftslogik für Waldränder und Übergänge", "forestNeighboursFor", "spatial"),
    empire("144", "fire-spread", "Feuerausbreitung über Zellnachbarn", "forestFireSpreadFor", "disturbance"),
    empire("145", "windthrow", "Windwurf mit Richtung und Bestandsalter", "forestWindthrowFor", "disturbance"),
    empire("146", "water-flow", "Wasserfluss durch Auen und Bruchwälder", "forestWaterFlowFor", "water"),
    empire("147", "erosion", "Erosion nach Kahlschlag oder Brand", "forestErosionFor", "soil"),
    empire("148", "regeneration", "Regeneration von Kahlflächen über Jahrzehnte", "forestRegenerationFor", "succession"),
    empire("149", "biodiversity", "Biodiversitätsindex pro Waldtyp", "forestBiodiversityFor", "ecology"),
    empire("150", "rng-streams", "Getrennte RNG-Streams für Vegetation, Tiere und Events", "forestRngSeedFor", "identity"),
]);

const modelCache = new Map();
const limitCache = new Map();
const poolCache = new Map();
const chunkCache = new Map();

const TELEMETRY = {
    chunksBuilt: 0,
    cacheHits: 0,
    cacheMisses: 0,
    lastMs: 0,
    maxMs: 0,
    typesSeen: new Set(),
    samples: [],
};

export const FOREST_RNG_STREAMS = freeze({
    vegetation: "forest-vegetation",
    animals: "forest-animals",
    events: "forest-events",
});

export const FOREST_MODDING_SCHEMA = freeze({
    required: freeze(["id", "key", "label", "climates", "formations", "temp", "moisture", "height", "priority", "species", "goods", "fauna"]),
    ranges: freeze({
        temp: "two ascending numbers in [0,1]",
        moisture: "two ascending numbers in [0,1]",
        height: "two ascending numbers in [0,1]",
        priority: "number 0.5..20 in half steps",
        species: "object of species id -> positive weight",
    }),
    idPattern: "^1\\.2\\.23\\.1\\.\\d{3}$ or ^mod:[a-z0-9][a-z0-9._-]{2,63}$",
    version: FOREST_MODEL_VERSION,
});

export function forestTypeIdFor(input) {
    if (typeof input === "number") return forestTypeIdFromLegacy(input);
    if (typeof input === "string") {
        if (REGIONAL_FOREST_TYPE_BY_ID[input]) return input;
        return REGIONAL_FOREST_TYPE_BY_KEY[input]?.id || null;
    }
    return typeFor(input)?.id || null;
}

export function forestTypeIdFromLegacy(value) {
    const index = Number(value);
    if (Number.isInteger(index) && index > 0 && index <= REGIONAL_FOREST_TYPES.length) {
        return REGIONAL_FOREST_TYPES[index - 1].id;
    }
    return typeof value === "string" ? forestTypeIdFor(value) : null;
}

function fitRange(value, range) {
    if (!Array.isArray(range) || range.length < 2) return 1;
    const number = Number(value);
    if (!Number.isFinite(number)) return 0.5;
    if (number >= range[0] && number <= range[1]) return 1;
    const distance = number < range[0] ? range[0] - number : number - range[1];
    return Math.max(0.08, 1 - distance * 4);
}

export function forestRegionalWeightsFor(context = {}) {
    const climate = climateKey(context.climate);
    const height = Number.isFinite(Number(context.height)) ? Number(context.height) : 0.45;
    const temperature = Number.isFinite(Number(context.temperature)) ? Number(context.temperature) : 0.5;
    const moisture = Number.isFinite(Number(context.moisture)) ? Number(context.moisture) : 0.5;
    const key = [climate, round(height, 2), round(temperature, 2), round(moisture, 2)].join(":");
    if (modelCache.has(key)) return modelCache.get(key);
    const candidates = REGIONAL_FOREST_TYPES.filter(type => type.climates.includes(climate));
    const source = candidates.length ? candidates : REGIONAL_FOREST_TYPES;
    const rows = source.map(type => {
        const fit = (fitRange(height, type.height) * 0.38
            + fitRange(temperature, type.temp) * 0.34
            + fitRange(moisture, type.moisture) * 0.28);
        return {
            id: type.id, key: type.key, label: type.label,
            weight: Math.max(0.0001, Number(type.priority) || 1) * (0.2 + fit * 0.8),
            fit,
        };
    });
    const total = rows.reduce((sum, row) => sum + row.weight, 0) || 1;
    rows.sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));
    for (const row of rows) row.share = row.weight / total;
    const result = freeze({
        climate, height, temperature, moisture, total,
        types: freeze(rows.map(row => freeze({ ...row }))),
        byId: freeze(Object.fromEntries(rows.map(row => [row.id, row]))),
    });
    return boundedSet(modelCache, key, result);
}

export function forestClimateEnvelopeFor(input) {
    const type = typeFor(input);
    if (!type) return null;
    const temp = [...type.temp];
    return freeze({
        id: type.id,
        key: type.key,
        climates: freeze([...type.climates]),
        temperature: freeze([...temp]),
        // Frost is the cold shoulder of the same thermal envelope. It is not a
        // second climate map: it marks where late frost can still injure the
        // type's regeneration.
        frost: freeze([clamp01(temp[0] - 0.1), clamp01(temp[0] + 0.2)]),
        precipitation: freeze([...type.moisture]),
        moisture: freeze([...type.moisture]),
        height: freeze([...type.height]),
    });
}

function speciesLimitsFor(type) {
    const limits = {};
    for (const speciesId of Object.keys(type.species || {})) {
        const owners = REGIONAL_FOREST_TYPES.filter(entry => Object.hasOwn(entry.species || {}, speciesId));
        const temperatures = owners.map(entry => entry.temp);
        const heights = owners.map(entry => entry.height);
        limits[speciesId] = freeze({
            temperature: freeze([Math.min(...temperatures.map(range => range[0])), Math.max(...temperatures.map(range => range[1]))]),
            height: freeze([Math.min(...heights.map(range => range[0])), Math.max(...heights.map(range => range[1]))]),
            climates: freeze([...new Set(owners.flatMap(entry => entry.climates))]),
        });
    }
    return freeze(limits);
}

export function forestLimitsFor(input) {
    const type = typeFor(input);
    if (!type) return null;
    const key = type.id;
    if (limitCache.has(key)) return limitCache.get(key);
    const value = freeze({
        id: type.id,
        key: type.key,
        label: type.label,
        temperature: freeze([...type.temp]),
        moisture: freeze([...type.moisture]),
        height: freeze([...type.height]),
        soil: freeze([...(type.soil || [])]),
        species: speciesLimitsFor(type),
    });
    return boundedSet(limitCache, key, value);
}

const SOIL_ALIASES = freeze({
    dry: "sand", sand: "sand", loam: "loam", clay: "clay", silt: "silt",
    peat: "peat", chalk: "chalk", volcanic: "volcanic", laterite: "laterite",
    saline: "saline", permafrost: "permafrost", rocky: "rocky", podzol: "podzol",
    humus: "chernozem", alluvial: "alluvial", river: "alluvial",
});

export function forestSoilFor(stand = {}) {
    const ground = stand.ground || {};
    const base = BIOME_SOIL_TYPES[SOIL_ALIASES[ground.soil] || "loam"] || BIOME_SOIL_TYPES.loam;
    const humus = clamp01(ground.humus ?? 0.3);
    const sour = clamp01(ground.sourSoil ?? 0);
    const acidity = clamp01(base.acidity + sour * 0.15 - humus * 0.05);
    const nutrients = clamp01(base.nutrients * 0.68 + humus * 0.24 + clamp01(ground.litter) * 0.08);
    const waterCapacity = clamp01(base.waterCapacity * 0.7 + clamp01(stand.moisture) * 0.18 + clamp01(stand.wetness) * 0.12);
    const drainage = clamp01(base.drainage * (1 - clamp01(stand.wetness) * 0.28));
    const disturbance = stand.succession?.kind ? 0.18 : 0;
    const erosion = clamp01(base.erosion * (0.45 + (1 - clamp01(stand.canopy)) * 0.35 + disturbance));
    return freeze({
        id: base.id,
        label: base.label,
        nutrients,
        pH: round(4.2 + (1 - acidity) * 3.2, 1),
        waterCapacity,
        drainage,
        erosion,
        organic: clamp01(base.organic * 0.72 + humus * 0.28),
        matrix: freeze([
            nutrients < 0.34 ? "poor" : nutrients < 0.62 ? "moderate" : "rich",
            acidity > 0.62 ? "acidic" : acidity < 0.35 ? "alkaline" : "neutral",
            waterCapacity < 0.36 ? "dry" : waterCapacity < 0.62 ? "fresh" : "retentive",
        ]),
    });
}

export function forestMoistureIndexFor(stand = {}) {
    const type = typeFor(stand);
    const effects = stand.regionalEffects || type?.effects || {};
    const flood = clamp01(effects.flood ?? 0);
    const index = clamp01(clamp01(stand.moisture) * 0.32 + clamp01(stand.wetness) * 0.44
        + clamp01(stand.ground?.pools) * 0.12 + flood * 0.12);
    const key = String(type?.key || "");
    const floodplain = flood >= 0.55 || /floodplain|carr|willow|mangrove|gallery|alluvial/.test(key);
    const mire = index >= 0.66 && /bog|moor|peat|carr|mire|swamp|alder/.test(key);
    const dry = index < 0.3 || /thorn|dry|sand|dune/.test(key);
    return freeze({
        index: round(index, 3),
        class: index < 0.3 ? "dry" : index < 0.48 ? "fresh" : index < 0.66 ? "moist" : index < 0.82 ? "wet" : "flooded",
        habitat: floodplain ? "floodplain" : mire ? "mire" : dry ? "dry-forest" : "upland",
        floodplain,
        mire,
        dry,
        retention: round(clamp01(1 - index * 0.55 + flood * 0.2), 3),
    });
}

export function forestDisturbanceMatrixFor(stand = {}) {
    const fire = clamp01(stand.fireRisk);
    const wind = clamp01(stand.windExposure);
    const ice = clamp01(clamp01(stand.snowPotential) * 0.78 + clamp01(stand.height) * 0.18);
    // Flood is read from the same water-flow record the succession process
    // uses. The old matrix multiplied a regional effect and wetness but never
    // saw the actual floodplain/mire classification; this keeps the displayed
    // matrix and the live flood event in agreement.
    const water = forestWaterFlowFor(stand);
    const flood = clamp01(water.flood * 0.55 + water.flow * 0.35 + clamp01(stand.wetness) * 0.1);
    const disease = clamp01(clamp01(stand.pestRisk) * 0.86 + clamp01(stand.structure?.deadwood) * 0.14);
    const rows = { fire, wind, ice, flood, disease };
    const dominant = Object.entries(rows).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    return freeze({
        ...Object.fromEntries(Object.entries(rows).map(([id, value]) => [id, round(value, 3)])),
        dominant,
        // A coarse return interval makes the matrix readable without replacing
        // the existing stand-level hazard simulation.
        returnYears: Math.max(8, Math.round(18 / Math.max(0.08, rows[dominant]))),
    });
}

export function forestSuccessionMatrixFor(stand = {}) {
    const kind = stand.succession?.kind || null;
    if (!kind) {
        return freeze({
            kind: null,
            stage: "undisturbed",
            label: "Undisturbed stand",
            transitions: freeze([]),
        });
    }
    const profile = FOREST_SUCCESSION_PROFILES[kind] || null;
    if (!profile) return freeze({ kind, stage: "unknown", label: kind, transitions: freeze([]) });
    const stage = forestSuccessionStage(kind, stand.succession.age) || { id: "fresh", label: profile.freshLabel };
    const transitions = [
        { from: "fresh", to: "regrowth", atDay: profile.freshDays },
        { from: "regrowth", to: "young", atDay: profile.regrowthDays },
        { from: "young", to: "recovered", atDay: profile.youngDays },
        { from: "recovered", to: "closed", atDay: profile.recoveredDays },
    ];
    return freeze({
        kind,
        stage: stage.id,
        stageLabel: stage.label,
        label: profile.freshLabel,
        age: Math.max(0, Math.floor(Number(stand.succession.age) || 0)),
        transitions: freeze(transitions.map(entry => freeze(entry))),
        closedAtDay: profile.recoveredDays,
        spreadChance: profile.spreadChance,
    });
}

export function forestSpeciesPoolFor(input) {
    const type = typeFor(input);
    if (!type) return null;
    if (poolCache.has(type.id)) return poolCache.get(type.id);
    const trees = Object.entries(type.species || {})
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([id, weight]) => freeze({ id, weight }));
    const plants = [...new Set((type.goods || []).filter(id => !/timber|wood|log|plank|firewood|charcoal/.test(id)))];
    const animals = [...new Set(type.fauna || [])];
    const value = freeze({
        id: type.id,
        key: type.key,
        trees: freeze(trees),
        animals: freeze(animals),
        plants: freeze(plants),
        treeCount: trees.length,
        animalCount: animals.length,
        plantCount: plants.length,
        richness: trees.length + animals.length + plants.length,
        goods: freeze((type.goods || []).map(id => freeze({
            id, label: REGIONAL_GOODS[id]?.label || id, category: REGIONAL_GOODS[id]?.category || "gather",
        }))),
    });
    return boundedSet(poolCache, type.id, value);
}

export function forestLodFor(zoom = 1) {
    const value = Math.max(0, Number(zoom) || 0);
    const tier = value >= 0.95 ? "detail" : value >= 0.55 ? "canopy" : value >= 0.28 ? "mass" : "impostor";
    const presets = {
        detail: { step: 1, maxTrees: 48, shadows: "full" },
        canopy: { step: 1, maxTrees: 24, shadows: "ambient" },
        mass: { step: 2, maxTrees: 10, shadows: "none" },
        impostor: { step: 6, maxTrees: 3, shadows: "none" },
    };
    return freeze({ zoom: round(value, 2), tier, ...presets[tier] });
}

export function forestChunkBudgetFor(zoom = 1) {
    const lod = forestLodFor(zoom);
    return freeze({
        lod: lod.tier,
        maxStands: FOREST_MODEL_SAMPLE_BUDGET,
        maxTypes: FOREST_MODEL_TYPE_BUDGET,
        maxTrees: lod.maxTrees,
        maxMs: lod.tier === "detail" ? 1.6 : 0.8,
        withinBudget: true,
    });
}

export function forestChunkKeyFor(x, y, size = FOREST_CHUNK_SIZE) {
    const cell = Math.max(2, Math.floor(Number(size) || FOREST_CHUNK_SIZE));
    return `${Math.floor((Number(x) || 0) / cell)}:${Math.floor((Number(y) || 0) / cell)}`;
}

export function precomputeForestChunk(context = {}) {
    const chunkX = Math.floor(Number(context.chunkX) || 0);
    const chunkY = Math.floor(Number(context.chunkY) || 0);
    const seed = Number(context.seed) || 1;
    const climate = climateKey(context.climate);
    const day = Math.floor(Number(context.day) || 0);
    const budget = forestChunkBudgetFor(context.zoom ?? 1);
    const key = [seed, chunkX, chunkY, climate, Math.floor(day / 30), budget.lod].join(":");
    if (chunkCache.has(key)) {
        TELEMETRY.cacheHits++;
        TELEMETRY.lastMs = 0;
        return chunkCache.get(key);
    }
    TELEMETRY.cacheMisses++;
    const started = now();
    const standAt = typeof context.standAt === "function" ? context.standAt : null;
    const types = new Map();
    let sampled = 0, density = 0, canopy = 0, stands = 0;
    if (standAt) {
        const stride = Math.max(1, Math.ceil(Math.sqrt(FOREST_CHUNK_SIZE * FOREST_CHUNK_SIZE / FOREST_MODEL_SAMPLE_BUDGET)));
        for (let y = chunkY * FOREST_CHUNK_SIZE; y < (chunkY + 1) * FOREST_CHUNK_SIZE; y += stride) {
            for (let x = chunkX * FOREST_CHUNK_SIZE; x < (chunkX + 1) * FOREST_CHUNK_SIZE; x += stride) {
                if (sampled >= FOREST_MODEL_SAMPLE_BUDGET) break;
                sampled++;
                let stand = null;
                try { stand = standAt(x + 0.5, y + 0.5, context); } catch { stand = null; }
                if (!stand) continue;
                const typeId = forestTypeIdFor(stand);
                if (!typeId) continue;
                stands++;
                density += clamp01(stand.density ?? stand.stockRatio);
                canopy += clamp01(stand.canopy);
                types.set(typeId, (types.get(typeId) || 0) + 1);
            }
        }
    }
    const ranked = [...types.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const elapsedMs = now() - started;
    const result = freeze({
        key: `${chunkX}:${chunkY}`,
        chunkX, chunkY, size: FOREST_CHUNK_SIZE, seed, climate, day,
        sampled,
        stands,
        typeId: ranked[0]?.[0] || null,
        types: freeze(ranked.slice(0, FOREST_MODEL_TYPE_BUDGET).map(([id, count]) => freeze({ id, count }))),
        density: stands ? round(density / stands, 3) : 0,
        canopy: stands ? round(canopy / stands, 3) : 0,
        budget,
        withinBudget: sampled <= budget.maxStands && ranked.length <= budget.maxTypes,
        elapsedMs: round(elapsedMs, 3),
    });
    TELEMETRY.chunksBuilt++;
    TELEMETRY.lastMs = elapsedMs;
    TELEMETRY.maxMs = Math.max(TELEMETRY.maxMs, elapsedMs);
    for (const [id] of ranked) TELEMETRY.typesSeen.add(id);
    TELEMETRY.samples.push({ key: result.key, ms: result.elapsedMs, sampled, types: ranked.length });
    if (TELEMETRY.samples.length > 8) TELEMETRY.samples.shift();
    return boundedSet(chunkCache, key, result);
}

export function forestAnnualCadenceFor(day = 0, intervalDays = 400) {
    const interval = Math.max(1, Math.floor(Number(intervalDays) || 400));
    const absolute = Math.max(0, Math.floor(Number(day) || 0));
    const year = Math.floor(absolute / interval);
    const dayOfYear = absolute % interval;
    const phase = dayOfYear < 0.25 * interval ? "spring" : dayOfYear < 0.5 * interval ? "summer"
        : dayOfYear < 0.75 * interval ? "autumn" : "winter";
    return freeze({
        intervalDays: interval,
        year,
        dayOfYear,
        phase,
        due: dayOfYear === 0,
        nextDay: (year + 1) * interval,
    });
}

export function forestPhenologyFor(stand = {}, day = 150, climate = "temperate") {
    const record = forestPhenologyAt(stand, day, climate) || { season: null, flowering: [], fruiting: [] };
    const dayOfYear = ((Math.floor(Number(day) || 0) % 400) + 400) % 400;
    const leaf = record.season === "winter" ? "bare" : record.season === "autumn" ? "turning" : "leaf-on";
    return freeze({
        season: record.season,
        dayOfYear,
        leaf,
        flowering: freeze((record.flowering || []).map(entry => freeze({ ...entry }))),
        fruiting: freeze((record.fruiting || []).map(entry => freeze({ ...entry }))),
        floweringCount: record.flowering?.length || 0,
        fruitingCount: record.fruiting?.length || 0,
    });
}

export function forestRegionSeedFor(seed, x = 0, y = 0, typeId = null) {
    return hash32(seed, Math.floor(x), Math.floor(y),
        0x464f5245 ^ stringHash(typeId || "forest")) >>> 0;
}

export function forestModelSaveMeta() {
    return freeze({
        version: FOREST_MODEL_SAVE_VERSION,
        modelVersion: FOREST_MODEL_VERSION,
        typeIds: REGIONAL_FOREST_TYPES.length,
        stableIds: true,
        derived: true,
        note: "Regional type ids are stable and derived from the seed; only the version marker is stored.",
    });
}

export function migrateForestModelSave(snapshot) {
    const source = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) ? snapshot : {};
    let ids = [];
    if (Array.isArray(source.typeIds)) ids = [...source.typeIds];
    else if (Array.isArray(source.forestTypes)) ids = [...source.forestTypes];
    else if (Array.isArray(source.forestKind)) ids = source.forestKind;
    const typeIds = [];
    for (const value of ids) {
        const id = forestTypeIdFromLegacy(value);
        if (id && !typeIds.includes(id)) typeIds.push(id);
    }
    return freeze({
        version: FOREST_MODEL_SAVE_VERSION,
        typeIds: freeze(typeIds),
        migrated: Number(source.version) !== FOREST_MODEL_SAVE_VERSION,
        lost: 0,
    });
}

export function validateForestModelSave(snapshot) {
    if (snapshot === undefined || snapshot === null) return true;
    if (typeof snapshot !== "object" || Array.isArray(snapshot)) throw new Error("Forest model save metadata must be an object.");
    if (Number(snapshot.version) !== FOREST_MODEL_SAVE_VERSION) throw new Error("Unsupported forest model save version.");
    const ids = snapshot.typeIds || [];
    if (!Array.isArray(ids)) throw new Error("Forest model type ids must be an array.");
    if (ids.length > REGIONAL_FOREST_TYPES.length) throw new Error("Forest model save has too many type ids.");
    const seen = new Set();
    for (const id of ids) {
        if (!REGIONAL_FOREST_TYPE_BY_ID[id]) throw new Error(`Unknown forest type id in save: ${id}`);
        if (seen.has(id)) throw new Error(`Duplicate forest type id in save: ${id}`);
        seen.add(id);
    }
    return true;
}

export function validateForestTypeDefinition(definition) {
    const errors = [];
    if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
        return freeze({ ok: false, errors: freeze(["definition must be an object"]) });
    }
    const id = String(definition.id || "");
    if (!/^1\.2\.23\.1\.\d{3}$/.test(id) && !/^mod:[a-z0-9][a-z0-9._-]{2,63}$/i.test(id)) {
        errors.push("id must be a regional id or a mod: namespace id");
    }
    if (!String(definition.key || "").trim()) errors.push("key is required");
    if (!String(definition.label || "").trim()) errors.push("label is required");
    if (!Array.isArray(definition.climates) || !definition.climates.length) errors.push("climates must be a non-empty array");
    if (!Array.isArray(definition.formations) || !definition.formations.length) errors.push("formations must be a non-empty array");
    for (const field of ["temp", "moisture", "height"]) {
        const range = definition[field];
        if (!Array.isArray(range) || range.length !== 2
            || !range.every(value => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1)
            || Number(range[0]) > Number(range[1])) {
            errors.push(`${field} must be two ascending numbers in [0,1]`);
        }
    }
    const priority = Number(definition.priority);
    if (!Number.isFinite(priority) || priority < 0.5 || priority > 20 || Math.round(priority * 2) !== priority * 2) {
        errors.push("priority must be a number 0.5..20 in half steps");
    }
    if (!definition.species || typeof definition.species !== "object" || !Object.keys(definition.species).length) {
        errors.push("species must be a non-empty object");
    } else {
        let total = 0;
        for (const [speciesId, weight] of Object.entries(definition.species)) {
            const value = Number(weight);
            if (!speciesId || !Number.isFinite(value) || value <= 0) errors.push(`species weight is invalid: ${speciesId}`);
            total += value;
        }
        if (total <= 0) errors.push("species weights must sum above zero");
    }
    for (const field of ["goods", "fauna"]) {
        if (!Array.isArray(definition[field])) errors.push(`${field} must be an array`);
    }
    return freeze({ ok: errors.length === 0, errors: freeze(errors) });
}

export function validateForestModelCatalog(types = REGIONAL_FOREST_TYPES) {
    const errors = [];
    const ids = new Set(), keys = new Set();
    for (const type of types) {
        const checked = validateForestTypeDefinition(type);
        if (!checked.ok) errors.push(`${type?.id || "unknown"}: ${checked.errors.join("; ")}`);
        if (ids.has(type.id)) errors.push(`duplicate id: ${type.id}`);
        if (keys.has(type.key)) errors.push(`duplicate key: ${type.key}`);
        ids.add(type.id);
        keys.add(type.key);
        const total = Object.values(type.species || {}).reduce((sum, value) => sum + Number(value || 0), 0);
        if (Math.abs(total - 1) > 0.001) errors.push(`${type.id}: species weights do not sum to 1`);
    }
    return freeze({ ok: errors.length === 0, count: types.length, errors: freeze(errors) });
}

export function forestModelTelemetrySnapshot() {
    return freeze({
        chunksBuilt: TELEMETRY.chunksBuilt,
        cacheHits: TELEMETRY.cacheHits,
        cacheMisses: TELEMETRY.cacheMisses,
        lastMs: round(TELEMETRY.lastMs, 3),
        maxMs: round(TELEMETRY.maxMs, 3),
        typesSeen: TELEMETRY.typesSeen.size,
        samples: freeze(TELEMETRY.samples.map(sample => freeze({ ...sample }))),
    });
}

export function resetForestModelTelemetry() {
    TELEMETRY.chunksBuilt = 0;
    TELEMETRY.cacheHits = 0;
    TELEMETRY.cacheMisses = 0;
    TELEMETRY.lastMs = 0;
    TELEMETRY.maxMs = 0;
    TELEMETRY.typesSeen.clear();
    TELEMETRY.samples.length = 0;
}

export function forestModelCacheStats() {
    return freeze({
        distributions: modelCache.size,
        limits: limitCache.size,
        speciesPools: poolCache.size,
        chunks: chunkCache.size,
        limit: FOREST_MODEL_CACHE_LIMIT,
    });
}

export function clearForestModelCaches() {
    modelCache.clear();
    limitCache.clear();
    poolCache.clear();
    chunkCache.clear();
}

export function buildForestSpatialIndex(items = [], options = {}) {
    const cellSize = Math.max(2, Math.floor(Number(options.cellSize) || 8));
    const limit = Math.max(1, Math.min(4096, Math.floor(Number(options.limit) || 4096)));
    const rows = Array.isArray(items) ? items.slice(0, limit) : [];
    const buckets = new Map();
    for (let index = 0; index < rows.length; index++) {
        const item = rows[index];
        const x = Number(Array.isArray(item) ? item[0] : item?.x);
        const y = Number(Array.isArray(item) ? item[1] : item?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const key = `${Math.floor(x / cellSize)}:${Math.floor(y / cellSize)}`;
        const bucket = buckets.get(key);
        if (bucket) bucket.push(index);
        else buckets.set(key, [index]);
    }
    return freeze({ cellSize, size: rows.length, items: freeze(rows), buckets });
}

function itemCoordinates(item) {
    if (Array.isArray(item)) return [Number(item[0]), Number(item[1])];
    return [Number(item?.x), Number(item?.y)];
}

export function queryForestSpatialIndex(index, x, y, radius = 8) {
    if (!index?.buckets) return [];
    const cx = Math.floor(Number(x) / index.cellSize);
    const cy = Math.floor(Number(y) / index.cellSize);
    const reach = Math.max(0, Math.ceil(Number(radius) / index.cellSize));
    const found = [];
    for (let gx = cx - reach; gx <= cx + reach; gx++) {
        for (let gy = cy - reach; gy <= cy + reach; gy++) {
            for (const itemIndex of index.buckets.get(`${gx}:${gy}`) || []) {
                const item = index.items[itemIndex];
                const [ix, iy] = itemCoordinates(item);
                if (!Number.isFinite(ix) || !Number.isFinite(iy)) continue;
                const distance = Math.hypot(ix - Number(x), iy - Number(y));
                if (distance <= radius) found.push({ item, distance: round(distance, 3) });
            }
        }
    }
    found.sort((a, b) => a.distance - b.distance);
    return found;
}

const NEIGHBOUR_DIRECTIONS = freeze([
    freeze({ dx: -1, dy: -1, id: "nw" }), freeze({ dx: 0, dy: -1, id: "n" }), freeze({ dx: 1, dy: -1, id: "ne" }),
    freeze({ dx: -1, dy: 0, id: "w" }), freeze({ dx: 1, dy: 0, id: "e" }),
    freeze({ dx: -1, dy: 1, id: "sw" }), freeze({ dx: 0, dy: 1, id: "s" }), freeze({ dx: 1, dy: 1, id: "se" }),
]);

export function forestNeighboursFor(x, y, width = Infinity, height = Infinity) {
    const cx = Math.floor(Number(x) || 0);
    const cy = Math.floor(Number(y) || 0);
    const maxX = Number.isFinite(Number(width)) ? Number(width) - 1 : Infinity;
    const maxY = Number.isFinite(Number(height)) ? Number(height) - 1 : Infinity;
    const rows = [];
    for (const direction of NEIGHBOUR_DIRECTIONS) {
        const nx = cx + direction.dx;
        const ny = cy + direction.dy;
        if (nx < 0 || ny < 0 || nx > maxX || ny > maxY) continue;
        rows.push(freeze({
            ...direction,
            x: nx, y: ny,
            border: nx === 0 || ny === 0 || nx === maxX || ny === maxY,
        }));
    }
    return freeze(rows);
}

const WIND_VECTORS = freeze({
    storm: [1, 0], gale: [1, 0], windy: [1, 0], rain: [-1, 0],
    snow: [0, -1], clear: [0, 1], calm: [0, 0], fog: [0, 0],
});

export function forestNeighbourOrderFor(context = {}) {
    const x = Math.floor(Number(context.x) || 0);
    const y = Math.floor(Number(context.y) || 0);
    const neighbours = forestNeighboursFor(x, y, context.width, context.height);
    const wind = WIND_VECTORS[String(context.wind || "clear").toLowerCase()] || [0, 0];
    const seed = Number(context.seed) || 1;
    return freeze(neighbours.map(neighbour => {
        const length = Math.hypot(neighbour.dx, neighbour.dy) || 1;
        const alignment = (neighbour.dx * wind[0] + neighbour.dy * wind[1]) / length;
        return freeze({
            ...neighbour,
            alignment: round(alignment, 3),
            score: round(alignment * 1.5 + hash32(seed, neighbour.x, neighbour.y, 0x53505244) / 0x100000000, 3),
        });
    }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)));
}

export function forestFireSpreadFor(context = {}) {
    const standAt = typeof context.standAt === "function" ? context.standAt : null;
    const season = String(context.season || "").toLowerCase();
    const drySeason = season === "summer" || season === "autumn" ? 1.15 : 1;
    return freeze(forestNeighbourOrderFor(context).map(neighbour => {
        let stand = null;
        try { stand = standAt?.(neighbour.x + 0.5, neighbour.y + 0.5, context) || null; } catch { stand = null; }
        const base = clamp01(stand?.fireRisk ?? 0.35);
        return freeze({
            ...neighbour,
            risk: round(clamp01(base * (0.62 + Math.max(0, neighbour.alignment) * 0.48) * drySeason), 3),
        });
    }).sort((a, b) => b.risk - a.risk || a.id.localeCompare(b.id)));
}

const WINDTHROW_DIRECTIONS = freeze(["n", "ne", "e", "se", "s", "sw", "w", "nw"]);

export function forestWindthrowFor(stand = {}, age = null) {
    const seed = Number(stand.seed) || 1;
    const x = Number(stand.x) || 0;
    const y = Number(stand.y) || 0;
    const direction = WINDTHROW_DIRECTIONS[hash32(seed, x, y, 0x57494e44) % WINDTHROW_DIRECTIONS.length];
    const years = Math.max(0, Number(age ?? stand.standAge ?? stand.age ?? 0) || 0);
    const ageFactor = clamp01(years / 360);
    const exposure = clamp01(stand.windExposure);
    const rootFactor = /plate|shallow/i.test(String(stand.ground?.roots || stand.rootingType || "")) ? 1.15 : 1;
    const risk = clamp01((0.18 + exposure * 0.66) * (0.62 + ageFactor * 0.72) * rootFactor);
    return freeze({
        direction,
        age: years,
        ageFactor: round(ageFactor, 3),
        risk: round(risk, 3),
        salvage: Math.round(risk * 90),
        uprooted: risk >= 0.62,
    });
}

export function forestWaterFlowFor(stand = {}) {
    const type = typeFor(stand);
    const flood = clamp01(stand.regionalEffects?.flood ?? type?.effects?.flood);
    const wetness = clamp01(stand.wetness);
    const moisture = clamp01(stand.moisture);
    const slope = clamp01(stand.height);
    const drainage = clamp01(stand.drainage);
    const flow = clamp01(wetness * 0.4 + moisture * 0.2 + flood * 0.22 + (1 - slope) * 0.18
        - drainage * 0.10);
    const key = String(type?.key || "");
    const floodplain = flood >= 0.55 || /floodplain|carr|willow|mangrove|gallery|alluvial/.test(key);
    const mire = /bog|moor|peat|carr|mire|swamp|alder/.test(key) && wetness >= 0.55;
    return freeze({
        flow: round(flow, 3),
        direction: flow >= 0.5 ? "downslope" : "seepage",
        floodplain,
        mire,
        retention: round(clamp01(1 - flow * 0.62), 3),
        flood: round(flood, 3),
        drainage: round(drainage, 3),
    });
}

// A flood event is not a second water grid. It is a bounded reading of the
// shared flow record with the current weather and season. The result is used
// by the succession process to decide whether a burst can start on this tile
// and whether it can cross to its neighbour.
export function forestFloodPressureFor(stand = {}, options = {}) {
    const water = forestWaterFlowFor(stand);
    const weather = String(options.weather || "clear").toLowerCase();
    const wetWeather = weather === "rain" || weather === "storm";
    const dryWeather = weather === "heat" || weather === "drought" || weather === "clear";
    const season = Math.max(0, Math.min(3, Math.floor(Number(options.season) || 0)));
    // Spring snowmelt and autumn rain are the two real flood windows. A
    // floodplain remains capable outside them, but it is much less likely.
    const seasonal = season === 0 ? 0.16 : season === 2 ? 0.12 : season === 1 ? -0.12 : -0.02;
    const drainage = clamp01(stand.drainage);
    const pressure = clamp01(water.flow * 0.55 + water.flood * 0.2
        + (water.floodplain ? 0.18 : 0) + (water.mire ? 0.12 : 0)
        + (wetWeather ? 0.2 : 0) - (dryWeather ? 0.16 : 0) + seasonal
        - drainage * 0.16);
    return freeze({
        pressure: round(pressure, 3),
        flow: water.flow,
        flood: water.flood,
        floodplain: water.floodplain,
        mire: water.mire,
        seasonal,
        wetWeather,
        drainage: round(drainage, 3),
    });
}

export function forestErosionFor(stand = {}) {
    const soil = forestSoilFor(stand);
    const water = forestWaterFlowFor(stand);
    const open = 1 - clamp01(stand.canopy);
    const slope = clamp01(stand.height);
    const disturbance = stand.succession?.kind ? 0.18 : 0;
    const risk = clamp01(soil.erosion * 0.4 + open * 0.28 + slope * 0.16 + disturbance + water.flow * 0.1);
    return freeze({
        risk: round(risk, 3),
        class: risk < 0.3 ? "low" : risk < 0.5 ? "moderate" : risk < 0.7 ? "high" : "severe",
        sedimentTonsPerHaYear: round(risk * 24, 1),
        mitigation: round(clamp01(stand.canopy * 0.62 + soil.organic * 0.2 + (1 - slope) * 0.18), 3),
        soil: soil.id,
    });
}

export function forestRegenerationFor(stand = {}) {
    const drainage = clamp01(stand.drainage);
    const factor = clamp01(forestRegrowthFactor(stand) + drainage * 0.05);
    const seedBank = clamp01(stand.dynamics?.regeneration?.seedBank ?? stand.structure?.seedBank ?? 0.55);
    const motherTrees = clamp01(stand.dynamics?.regeneration?.motherTreesPerHa
        ? stand.dynamics.regeneration.motherTreesPerHa / 40 : 0.5);
    const erosion = forestErosionFor(stand);
    const years = Math.round(8 + (1 - factor) * 70 + (1 - seedBank) * 12 + erosion.risk * 18);
    return freeze({
        factor: round(factor, 3),
        seedBank: round(seedBank, 3),
        motherTrees: round(motherTrees, 3),
        yearsToCanopy: Math.max(6, years),
        trajectory: factor >= 0.8 ? "fast" : factor >= 0.55 ? "steady" : "slow",
        erosionPenalty: round(erosion.risk, 3),
        drainage: round(drainage, 3),
    });
}

export function forestBiodiversityFor(stand = {}) {
    const structure = stand.structure || {};
    const layers = [structure.herb, structure.shrub, structure.sapling, structure.canopy, structure.deadwood]
        .filter(value => Number(value) > 0.18).length;
    const diversity = clamp01(stand.speciesDiversity ?? stand.mixture?.diversity ?? 0.3);
    const deadwood = clamp01(stand.deadwood ?? structure.deadwood ?? 0);
    const fauna = Number(stand.faunaEcology?.speciesRichness ?? stand.faunaEcology?.richness
        ?? stand.faunaEcology?.guilds?.length ?? stand.fauna?.length ?? 0) || 0;
    const age = stand.ageClass === "ancient" ? 1 : stand.ageClass === "mature" ? 0.72 : stand.ageClass === "young" ? 0.42 : 0.3;
    const drainage = clamp01(stand.drainage);
    const index = clamp01(diversity * 0.32 + deadwood * 0.2 + (layers / 5) * 0.16
        + Math.min(1, fauna / 10) * 0.18 + age * 0.14 - drainage * 0.12);
    return freeze({
        index: round(index, 3),
        drainage: round(drainage, 3),
        percent: Math.round(index * 100),
        class: index < 0.34 ? "low" : index < 0.56 ? "moderate" : index < 0.76 ? "high" : "very-high",
        layers,
        faunaRichness: fauna,
        deadwood: round(deadwood, 3),
    });
}

export function forestRngSeedFor(stream, seed, x = 0, y = 0) {
    const name = FOREST_RNG_STREAMS[stream] || String(stream || FOREST_RNG_STREAMS.events);
    return hash32(seed, Math.floor(x), Math.floor(y), stringHash(name)) >>> 0;
}

// One bounded read model for the atlas and tests. The six matrices are the
// same records the simulation already uses; no new stand is built here.
export function forestModelFor(input, options = {}) {
    const stand = input && typeof input === "object" ? input : {};
    const type = typeFor(stand);
    if (!type) return null;
    const climate = climateKey(options.climate || stand.climate || type.climates[0]);
    const day = Number.isFinite(Number(options.day)) ? Number(options.day) : 150;
    const distribution = forestRegionalWeightsFor({
        climate,
        height: stand.height ?? type.probe?.height,
        temperature: stand.temperature ?? type.probe?.temperature,
        moisture: stand.moisture ?? type.probe?.moisture,
    });
    const row = distribution.byId[type.id] || null;
    const limits = forestLimitsFor(type);
    const soil = forestSoilFor(stand);
    const moisture = forestMoistureIndexFor(stand);
    const disturbance = forestDisturbanceMatrixFor(stand);
    const succession = forestSuccessionMatrixFor(stand);
    const species = forestSpeciesPoolFor(type);
    const lod = forestLodFor(options.zoom ?? 1);
    const cadence = forestAnnualCadenceFor(day);
    const phenology = forestPhenologyFor(stand, day, climate);
    const biodiversity = forestBiodiversityFor(stand);
    const erosion = forestErosionFor(stand);
    const regeneration = forestRegenerationFor(stand);
    const windthrow = forestWindthrowFor(stand, stand.standAge ?? stand.age);
    const water = forestWaterFlowFor(stand);
    const floodPressure = forestFloodPressureFor(stand, {
        weather: options.weather,
        season: options.season,
    });
    const rng = freeze({
        streams: FOREST_RNG_STREAMS,
        vegetation: forestRngSeedFor("vegetation", options.seed ?? stand.seed, stand.x, stand.y),
        animals: forestRngSeedFor("animals", options.seed ?? stand.seed, stand.x, stand.y),
        events: forestRngSeedFor("events", options.seed ?? stand.seed, stand.x, stand.y),
    });
    return freeze({
        version: FOREST_MODEL_VERSION,
        typeId: type.id,
        key: type.key,
        label: type.label,
        regionSeed: forestRegionSeedFor(options.seed ?? stand.seed ?? 1, stand.x || 0, stand.y || 0, type.id),
        distribution: freeze({
            climate,
            share: round(row?.share || 0, 4),
            fit: round(row?.fit || 0, 3),
            top: freeze(distribution.types.slice(0, FOREST_MODEL_TYPE_BUDGET).map(entry => freeze({
                id: entry.id, key: entry.key, label: entry.label, share: round(entry.share, 4),
            }))),
        }),
        limits,
        soil,
        moisture,
        disturbance,
        succession,
        species,
        lod,
        chunk: freeze({
            key: forestChunkKeyFor(stand.x, stand.y),
            size: FOREST_CHUNK_SIZE,
            budget: forestChunkBudgetFor(options.zoom ?? 1),
        }),
        cadence,
        phenology,
        biodiversity,
        erosion,
        regeneration,
        windthrow,
        water,
        floodPressure,
        rng,
        requirementIds: freeze(FOREST_MODEL_REQUIREMENTS.map(entry => entry.id)),
    });
}

export function forestModelSummaryFor(model) {
    if (!model) return "";
    return `${model.typeId.slice(-3)} · ${Math.round(model.distribution.share * 100)}% region · `
        + `${model.soil.label} pH ${model.soil.pH} · ${model.moisture.class} · `
        + `${model.disturbance.dominant} · ${model.succession.stage} · `
        + `biodiversity ${model.biodiversity.percent}% · LOD ${model.lod.tier}`;
}
