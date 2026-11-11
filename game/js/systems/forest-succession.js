// Persistent disturbance succession for woodland.
//
// The seeded world supplies the initial burn scars, windthrow gaps and disease
// patches. This module gives those states a life: every disturbance records its
// age, advances through fresh -> regrowth -> young -> recovered, and eventually
// returns the tile to its original woodland. New events are rare, deterministic
// and reduce the tile's real forest stock; the existing regrowth system then
// closes the canopy over time.
import { state } from "../core/state.js";
import {
    FOREST_DISTURBANCE_KINDS, forestStandAt, forestSuccessionProfile,
    forestSuccessionStage,
} from "../world/forest-ecology.js";
import { forestBarkBeetlePressureAt } from "./forest-fauna.js";

const VERSION = 1;
const MAX_TILES = 4096;
const MAX_HISTORY = 24;
const MAX_STEP_DAYS = 30;
const EVENT_INTERVAL_DAYS = 140;
const SPREAD_INTERVAL_DAYS = 12;
const MAX_SPREAD_PER_PASS = 4;
const CONTROL_DAYS = 90;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const clamp01 = value => clamp(value, 0, 1);
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function hash32(seed, a, b, salt = 0) {
    let value = (Number(seed) >>> 0) ^ Math.imul((Number(a) | 0) + 1, 0x9e3779b1)
        ^ Math.imul((Number(b) | 0) + 1, 0x85ebca6b) ^ (Number(salt) >>> 0);
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
    return (value ^ (value >>> 16)) >>> 0;
}

function unitHash(seed, a, b, salt = 0) {
    return hash32(seed, a, b, salt) / 0x100000000;
}

function tileKey(x, y) {
    return Math.floor(Number(x)) + ":" + Math.floor(Number(y));
}

function validKey(key) {
    return /^\d+:\d+$/.test(String(key));
}

function emptyModel(seed) {
    return {
        version: VERSION,
        seed: Math.max(1, Math.floor(number(seed, 1))),
        day: 0,
        events: 0,
        lastEventDay: 0,
        daysSinceEvent: 0,
        daysSinceSpread: 0,
        spreadings: 0,
        suppressed: 0,
        tiles: {},
        history: [],
        spreadHistory: [],
    };
}

function validModel(model) {
    return Boolean(model && model.version === VERSION && model.tiles
        && typeof model.tiles === "object" && !Array.isArray(model.tiles));
}

function mapSample(x, y) {
    const resolution = Math.max(1, Number(state.terrainResolution) || 1);
    const width = Number(state.terrainPixW) || 0;
    const height = Number(state.terrainPixH) || 0;
    if (!width || !height) return { moisture: 0.55, temperature: 0.55, height: 0.55 };
    const px = clamp(Math.floor((x + 0.5) * resolution), 0, width - 1);
    const py = clamp(Math.floor((y + 0.5) * resolution), 0, height - 1);
    const index = py * width + px;
    return {
        moisture: Number(state.moistureMap?.[index]) || 0.55,
        temperature: Number(state.temperatureMap?.[index]) || 0.55,
        height: Number(state.heightMap?.[index]) || 0.55,
    };
}

function standAtTile(geo, x, y) {
    const width = Number(state.worldW) || 0;
    if (!width) return null;
    const index = Math.floor(y) * width + Math.floor(x);
    const capacity = Number(geo.forestCapacity?.[index]) || 0;
    if (!capacity) return null;
    const sample = mapSample(x, y);
    return forestStandAt(x + 0.5, y + 0.5, {
        seed: Number(state.worldSeed) || 1,
        moisture: sample.moisture,
        temperature: sample.temperature,
        height: sample.height,
        climate: state.worldOptions?.climate || "temperate",
        forests: state.worldOptions?.forests ?? 52,
        stockRatio: Number(geo.forestStock?.[index] || 0) / capacity,
        rockLine: 0.92,
    });
}

// Build the initial disturbance roster from the deterministic landscape. The
// records start at age zero so a fresh realm still shows its burn scars,
// windthrow gaps and disease patches; only elapsed simulation days move them
// into regrowth.
export function ensureForestSuccession() {
    if (validModel(state.forestSuccession)) return state.forestSuccession;
    const geo = state.resourceGeography;
    const width = Number(state.worldW) || 0;
    const height = Number(state.worldH) || 0;
    if (!geo || !width || !height) return null;

    const model = emptyModel(state.worldSeed);
    let count = 0;
    for (let y = 0; y < height && count < MAX_TILES; y++) {
        for (let x = 0; x < width && count < MAX_TILES; x++) {
            const stand = standAtTile(geo, x, y);
            if (!stand?.forest) continue;
            if (!FOREST_DISTURBANCE_KINDS.includes(stand.disturbance)) continue;
            model.tiles[tileKey(x, y)] = { kind: stand.disturbance, age: 0, containedUntil: 0 };
            count++;
        }
    }
    state.forestSuccession = model;
    return model;
}

export function resetForestSuccession() {
    state.forestSuccession = null;
}

export function forestSuccessionAt(x, y) {
    const model = state.forestSuccession;
    if (!validModel(model)) return null;
    const record = model.tiles[tileKey(x, y)];
    if (!record) return null;
    const stage = forestSuccessionStage(record.kind, record.age);
    if (!stage) return null;
    const profile = forestSuccessionProfile(record.kind);
    const containedUntil = Math.max(0, Math.floor(number(record.containedUntil)));
    return {
        kind: record.kind,
        age: Math.max(0, Math.floor(number(record.age))),
        stage: stage.id,
        label: stage.label,
        recovered: stage.id === "recovered",
        contained: containedUntil > model.day,
        containedUntil,
        progress: profile ? clamp(number(record.age) / profile.recoveredDays, 0, 1) : 0,
    };
}

export function forestSuccessionSummary(limit = 3) {
    const model = state.forestSuccession;
    if (!validModel(model)) return "";
    const rows = Object.entries(model.tiles)
        .map(([key, record]) => {
            const stage = forestSuccessionStage(record.kind, record.age);
            return { key, kind: record.kind, age: Math.floor(number(record.age)), stage };
        })
        .filter(row => row.stage && row.stage.id !== "recovered")
        .sort((a, b) => b.age - a.age)
        .slice(0, Math.max(1, Math.floor(number(limit, 3))));
    if (!rows.length) return "No active disturbance";
    return rows.map(row => row.stage.label + " · " + row.kind).join(" · ");
}

// Seasonal envelopes keep the existing disturbance rhythm. The stand's derived
// fire, pest, monoculture and snow values decide which kind wins the next real
// event; they are not stored and add no per-tick work.
const CONIFER_SEASON = Object.freeze({
    burned: Object.freeze([0.8, 1.35, 1.05, 0.5]),
    "bark-beetle": Object.freeze([1, 1.25, 0.95, 0.45]),
    snowbreak: Object.freeze([0.65, 0.12, 0.3, 1.45]),
    "drought-stressed": Object.freeze([0.65, 1.15, 0.95, 0.35]),
});

// Exposed for tests and for any future survey/event UI. A high fire risk opens
// the burned path even in a conifer stand, while pest pressure and a pure stand
// both raise the bark-beetle weight. Monoculture deliberately stays a separate
// multiplier: it is a vulnerability, not a disturbance in its own right.
export function coniferDisturbanceWeights(stand = {}, season = state.seasonIndex, weather = state.weather, insectPressure = 0) {
    const seasonIndex = ((Math.floor(number(season, 0)) % 4) + 4) % 4;
    const fireRisk = clamp01(number(stand.fireRisk));
    const pestRisk = clamp01(number(stand.pestRisk));
    const monoculture = clamp01(number(stand.monoculture));
    // A real, saved bark-beetle colony is an additional pressure on top of the
    // stand's static pest-risk estimate. This is the feedback from the insect
    // population into the existing disturbance event, not a second outbreak
    // system.
    const beetlePressure = clamp01(number(insectPressure));
    const snowPotential = clamp01(number(stand.snowPotential));
    const windExposure = clamp01(number(stand.windExposure ?? stand.exposure));
    const weatherName = String(weather || "clear").toLowerCase();
    const wet = weatherName === "rain" || weatherName === "storm" || weatherName === "snow";
    const storm = weatherName === "storm";
    const drySpell = weatherName === "clear" || weatherName === "heat" || weatherName === "drought";
    const weatherFire = wet ? 0.55 : drySpell ? 1.18 : 1;
    const weatherPest = wet ? 0.9 : drySpell ? 1.12 : 1;
    const weatherSnow = weatherName === "snow" ? 1.35 : wet ? 1.08 : 1;
    const weatherDrought = wet ? 0.45 : drySpell ? 1.2 : 1;
    return {
        burned: (0.02 + fireRisk * 0.98) * CONIFER_SEASON.burned[seasonIndex] * weatherFire,
        "bark-beetle": (0.03 + pestRisk * 0.72 + monoculture * 0.45 + beetlePressure * 0.55)
            * CONIFER_SEASON["bark-beetle"][seasonIndex] * weatherPest,
        snowbreak: (0.03 + snowPotential * 0.97) * CONIFER_SEASON.snowbreak[seasonIndex] * weatherSnow,
        "drought-stressed": (0.03 + fireRisk * 0.5) * CONIFER_SEASON["drought-stressed"][seasonIndex] * weatherDrought,
        // Conifer windthrow was previously only a seeded base state. Exposure
        // and storms now make it a live event, with root-plate and salvage
        // consequences handled by the shared windthrow succession profile.
        windthrow: (0.012 + windExposure * 0.55 + (stand.disturbance === "windthrow" ? 0.08 : 0))
            * (storm ? 2.4 : seasonIndex === 3 ? 1.25 : 0.72),
    };
}

function weightedDisturbance(weights, roll) {
    const entries = Object.entries(weights).filter(([, weight]) => Number.isFinite(weight) && weight > 0);
    if (!entries.length) return "burned";
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
    let cursor = clamp01(roll) * total;
    for (const [kind, weight] of entries) {
        cursor -= weight;
        if (cursor < 0) return kind;
    }
    return entries[entries.length - 1][0];
}

export function coniferDisturbanceKind(stand = {}, season = state.seasonIndex, roll = 0.5, insectPressure = 0) {
    return weightedDisturbance(coniferDisturbanceWeights(stand, season, state.weather, insectPressure), roll);
}

// A disturbance entering a neighbouring stand is more likely when that stand
// is itself dry, pest-ridden, pure or snow-loaded. Returning 1 for broadleaf
// disturbances keeps their existing spread curve untouched.
export function spreadRiskFactor(kind, stand = {}, insectPressure = 0) {
    const fire = clamp01(number(stand.fireRisk));
    const pest = clamp01(number(stand.pestRisk));
    const monoculture = clamp01(number(stand.monoculture));
    const snow = clamp01(number(stand.snowPotential));
    if (kind === "burned") return clamp(0.55 + fire * 0.9, 0.45, 1.45);
    if (kind === "bark-beetle") return clamp(0.5 + pest * 0.8 + monoculture * 0.45 + clamp01(number(insectPressure)) * 0.35, 0.4, 1.5);
    if (kind === "snowbreak") return clamp(0.5 + snow * 0.9, 0.45, 1.5);
    if (kind === "drought-stressed") return clamp(0.55 + fire * 0.7, 0.45, 1.4);
    if (kind === "windthrow") {
        if (!stand?.conifer) return 1;
        return clamp(0.55 + clamp01(number(stand.windExposure ?? stand.exposure)) * 0.9, 0.45, 1.45);
    }
    return 1;
}

function chooseKind(model, day, stand = null, insectPressure = 0) {
    const season = Math.floor(number(state.seasonIndex, 0)) % 4;
    const roll = unitHash(model.seed, model.events + 1, day, 0x4b494e44);
    // Conifer stands use the derived fire/pest/monoculture/snow pressure to
    // choose among real disturbances. Broadleaf woodland keeps its existing
    // fire/wind/disease cycle.
    if (stand?.conifer === true || number(stand?.coniferShare) > 0.4) {
        return coniferDisturbanceKind(stand, season, roll, insectPressure);
    }
    if (season === 1) return roll < 0.62 ? "burned" : "diseased";
    if (season === 2 || season === 3) return roll < 0.64 ? "windthrow" : "diseased";
    return roll < 0.45 ? "windthrow" : "diseased";
}

function spawnDisturbance(model) {
    const geo = state.resourceGeography;
    const width = Number(state.worldW) || 0;
    const height = Number(state.worldH) || 0;
    if (!geo || !width || !height) return null;
    for (let attempt = 0; attempt < 96; attempt++) {
        const hash = hash32(model.seed, model.events + 1, model.day + 1, attempt + 0x53544f52);
        const index = hash % (width * height);
        const x = index % width;
        const y = Math.floor(index / width);
        const key = tileKey(x, y);
        const existing = model.tiles[key];
        // A recovered tile is available for a later disturbance. An active
        // fresh/regrowth/young/recovering tile is not disturbed again.
        if (existing && forestSuccessionStage(existing.kind, existing.age)?.id !== "recovered") continue;
        if (!existing && Object.keys(model.tiles).length >= MAX_TILES) continue;
        if (!geo.forestCapacity?.[index] || Number(geo.forestStock?.[index] || 0) < 18) continue;
        const stand = standAtTile(geo, x, y);
        if (!stand?.forest || stand.type === "cutover") continue;
        const kind = chooseKind(model, model.day, stand, forestBarkBeetlePressureAt(x, y));
        const profile = forestSuccessionProfile(kind);
        if (!profile) continue;
        const before = Math.max(1, Math.floor(number(geo.forestStock[index], 1)));
        const after = Math.max(1, Math.min(before, Math.floor(before * profile.severity)));
        geo.forestStock[index] = after;
        model.tiles[key] = { kind, age: 0, containedUntil: 0 };
        model.events++;
        model.lastEventDay = model.day;
        model.history.push({ day: model.day, kind, x, y, stockBefore: before, stockAfter: after });
        if (model.history.length > MAX_HISTORY) model.history.splice(0, model.history.length - MAX_HISTORY);
        return { x, y, kind, age: 0 };
    }
    return null;
}

// Advance every disturbance once per simulation day. A newly spawned event
// lowers the tile's real stock; the existing regrowth loop handles the long
// climb back to capacity.
export function updateForestSuccession(days = 1) {
    const model = ensureForestSuccession();
    if (!model) return null;
    const steps = Math.max(0, Math.min(MAX_STEP_DAYS, Math.floor(number(days, 1))));
    if (!steps) return model;

    // Object.entries allocated a fresh 4,000-row array every tick. This loop
    // only advances a handful of active records; use the object keys directly
    // and cache the profile lookup by disturbance kind.
    const profiles = new Map();
    for (const key in model.tiles) {
        if (!Object.prototype.hasOwnProperty.call(model.tiles, key)) continue;
        const record = model.tiles[key];
        let profile = profiles.get(record.kind);
        if (profile === undefined) {
            profile = forestSuccessionProfile(record.kind);
            profiles.set(record.kind, profile);
        }
        if (!profile) {
            delete model.tiles[key];
            continue;
        }
        // Keep a recovered record. Without it the renderer would fall back to
        // the seeded damage hash and the old burn scar/windthrow would reappear
        // forever. A later event may reuse this recovered slot.
        const age = Math.max(0, Math.floor(number(record.age)));
        if (age >= profile.recoveredDays) {
            if (age !== profile.recoveredDays) record.age = profile.recoveredDays;
            continue;
        }
        record.age = Math.min(profile.recoveredDays, age + steps);
    }
    model.day = Math.max(0, Math.floor(number(model.day))) + steps;
    model.daysSinceEvent = Math.max(0, Math.floor(number(model.daysSinceEvent))) + steps;
    if (model.daysSinceEvent >= EVENT_INTERVAL_DAYS) {
        spawnDisturbance(model);
        model.daysSinceEvent = 0;
    }
    // Fire, wind and disease do not stay inside their ignition tile. The pass is
    // deliberately coarse (every 12 days) and capped, so a long campaign gets
    // spreading disturbances without a per-day neighbour scan of the whole map.
    model.daysSinceSpread = Math.max(0, Math.floor(number(model.daysSinceSpread))) + steps;
    if (model.daysSinceSpread >= SPREAD_INTERVAL_DAYS) {
        spreadDisturbances(model);
        model.daysSinceSpread = 0;
    }
    return model;
}

function activeSuccessionRecord(record) {
    if (!record) return false;
    const stage = forestSuccessionStage(record.kind, record.age);
    return Boolean(stage && stage.id !== "recovered");
}

function controlCost(kind) {
    if (kind === "burned") return { food: 6, wood: 4 };
    if (kind === "windthrow") return { wood: 8 };
    // Pest, snow and drought control are paid specialists and equipment, so
    // they use the same gold cost as disease. An empty cost made those kinds
    // free to contain and let a control party succeed with no resources.
    if (kind === "diseased" || kind === "bark-beetle" || kind === "snowbreak" || kind === "drought-stressed") {
        return { gold: 6 };
    }
    return {};
}

function spreadDisturbances(model) {
    if (!Array.isArray(model.spreadHistory)) model.spreadHistory = [];
    const geo = state.resourceGeography;
    const width = Number(state.worldW) || 0;
    const height = Number(state.worldH) || 0;
    if (!geo || !width || !height) return 0;
    const keys = Object.keys(model.tiles);
    let tileCount = keys.length;
    const neighbourOrder = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
    let spreads = 0;

    for (const key of keys) {
        if (spreads >= MAX_SPREAD_PER_PASS) break;
        const record = model.tiles[key];
        if (!record || !activeSuccessionRecord(record)) continue;
        if (Math.max(0, number(record.containedUntil)) > model.day) continue;
        const profile = forestSuccessionProfile(record.kind);
        if (!profile?.spreadChance) continue;
        const stage = forestSuccessionStage(record.kind, record.age);
        if (!stage || stage.id === "recovered") continue;
        const [x, y] = key.split(":").map(Number);
        const season = Math.floor(number(state.seasonIndex, 0)) % 4;
        let chance = profile.spreadChance;
        if (record.kind === "burned") chance *= season === 1 ? 1.35 : state.weather === "rain" || state.weather === "storm" ? 0.35 : 0.85;
        if (record.kind === "windthrow") chance *= state.weather === "storm" ? 1.5 : season === 2 ? 1.15 : 0.8;
        if (record.kind === "diseased") chance *= stage.id === "fresh" ? 1.1 : 0.75;
        const roll = unitHash(model.seed, x * 37 + model.day, y * 53 + model.events, 0x53505244);
        // Risk-aware kinds may spread into a nearby stand up to the highest
        // possible factor. The target's own pressure then decides whether the
        // crossing actually happens; broadleaf kinds keep the old threshold.
        const riskAware = ["burned", "bark-beetle", "snowbreak", "drought-stressed", "windthrow"].includes(record.kind);
        if (roll > chance * (riskAware ? 1.5 : 1)) continue;
        const start = hash32(model.seed, x, y, model.day + 0x53505244) % neighbourOrder.length;
        for (let offset = 0; offset < neighbourOrder.length; offset++) {
            const [dx, dy] = neighbourOrder[(start + offset) % neighbourOrder.length];
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const nkey = tileKey(nx, ny);
            const existing = model.tiles[nkey];
            if (existing && activeSuccessionRecord(existing)) continue;
            if (!existing && tileCount >= MAX_TILES) break;
            const index = ny * width + nx;
            const before = Math.max(0, Math.floor(number(geo.forestStock?.[index])));
            if (!geo.forestCapacity?.[index] || before < 12) continue;
            const stand = standAtTile(geo, nx, ny);
            if (!stand?.forest || stand.type === "cutover") continue;
            if (roll > chance * spreadRiskFactor(record.kind, stand, forestBarkBeetlePressureAt(nx, ny))) continue;
            const after = Math.max(1, Math.floor(before * 0.72));
            geo.forestStock[index] = after;
            model.tiles[nkey] = { kind: record.kind, age: 0, containedUntil: 0 };
            tileCount++;
            model.spreadings = Math.max(0, Math.floor(number(model.spreadings))) + 1;
            model.spreadHistory.push({
                day: model.day, kind: record.kind, from: [x, y], to: [nx, ny],
                stockBefore: before, stockAfter: after,
            });
            if (model.spreadHistory.length > MAX_HISTORY) model.spreadHistory.splice(0, model.spreadHistory.length - MAX_HISTORY);
            spreads++;
            break;
        }
    }
    return spreads;
}

export function suppressForestDisturbance(x, y) {
    const model = ensureForestSuccession();
    if (!model) return { ok: false, reason: "No active succession model" };
    const record = model.tiles[tileKey(x, y)];
    const stage = record ? forestSuccessionStage(record.kind, record.age) : null;
    if (!record || !stage || stage.id === "recovered") return { ok: false, reason: "No active disturbance at this tile" };
    const cost = controlCost(record.kind);
    for (const [key, amount] of Object.entries(cost)) {
        if ((Number(state.resources?.[key]) || 0) < amount) {
            return { ok: false, reason: "Not enough " + key + " for a control party" };
        }
    }
    for (const [key, amount] of Object.entries(cost)) state.resources[key] = Math.max(0, (Number(state.resources[key]) || 0) - amount);
    record.containedUntil = model.day + CONTROL_DAYS;
    model.suppressed = Math.max(0, Math.floor(number(model.suppressed))) + 1;
    return { ok: true, x: Math.floor(x), y: Math.floor(y), kind: record.kind, days: CONTROL_DAYS, cost, containedUntil: record.containedUntil };
}

export function suppressNearestForestDisturbance(x, y, radius = 8) {
    const model = ensureForestSuccession();
    if (!model) return { ok: false, reason: "No active succession model" };
    const cx = Math.floor(number(x));
    const cy = Math.floor(number(y));
    const limit = Math.max(1, Math.floor(number(radius, 8)));
    let best = null;
    for (const [key, record] of Object.entries(model.tiles)) {
        if (!activeSuccessionRecord(record) || Math.max(0, number(record.containedUntil)) > model.day) continue;
        const [tx, ty] = key.split(":").map(Number);
        const distance = Math.abs(tx - cx) + Math.abs(ty - cy);
        if (distance > limit) continue;
        if (!best || distance < best.distance) best = { x: tx, y: ty, distance };
    }
    if (!best) return { ok: false, reason: "No active disturbance within " + limit + " tiles" };
    return suppressForestDisturbance(best.x, best.y);
}

export function serializeForestSuccession() {
    const model = state.forestSuccession;
    if (!validModel(model)) return null;
    const tiles = {};
    for (const [key, record] of Object.entries(model.tiles)) {
        if (!validKey(key) || !FOREST_DISTURBANCE_KINDS.includes(record?.kind)) continue;
        tiles[key] = {
            kind: record.kind,
            age: Math.max(0, Math.min(100000, Math.floor(number(record.age)))),
            containedUntil: Math.max(0, Math.floor(number(record.containedUntil))),
        };
    }
    return {
        version: VERSION,
        seed: Math.max(1, Math.floor(number(model.seed, state.worldSeed || 1))),
        day: Math.max(0, Math.floor(number(model.day))),
        events: Math.max(0, Math.floor(number(model.events))),
        lastEventDay: Math.max(0, Math.floor(number(model.lastEventDay))),
        daysSinceEvent: Math.max(0, Math.floor(number(model.daysSinceEvent))),
        daysSinceSpread: Math.max(0, Math.floor(number(model.daysSinceSpread))),
        spreadings: Math.max(0, Math.floor(number(model.spreadings))),
        suppressed: Math.max(0, Math.floor(number(model.suppressed))),
        tiles,
        spreadHistory: (Array.isArray(model.spreadHistory) ? model.spreadHistory : [])
            .filter(entry => entry && FOREST_DISTURBANCE_KINDS.includes(entry.kind))
            .slice(-MAX_HISTORY)
            .map(entry => ({
                day: Math.max(0, Math.floor(number(entry.day))), kind: entry.kind,
                from: Array.isArray(entry.from) ? entry.from.map(value => Math.floor(number(value))) : [0, 0],
                to: Array.isArray(entry.to) ? entry.to.map(value => Math.floor(number(value))) : [0, 0],
                stockBefore: Math.max(0, Math.floor(number(entry.stockBefore))),
                stockAfter: Math.max(0, Math.floor(number(entry.stockAfter))),
            })),
        history: (Array.isArray(model.history) ? model.history : [])
            .filter(entry => entry && FOREST_DISTURBANCE_KINDS.includes(entry.kind))
            .slice(-MAX_HISTORY)
            .map(entry => ({
                day: Math.max(0, Math.floor(number(entry.day))),
                kind: entry.kind,
                x: Math.floor(number(entry.x)),
                y: Math.floor(number(entry.y)),
                stockBefore: Math.max(0, Math.floor(number(entry.stockBefore))),
                stockAfter: Math.max(0, Math.floor(number(entry.stockAfter))),
            })),
    };
}

export function validateForestSuccessionSnapshot(snapshot) {
    if (snapshot === undefined || snapshot === null) return true;
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) || snapshot.version !== VERSION) {
        throw new Error("Save data contains an invalid forest-succession state.");
    }
    if (!Number.isFinite(Number(snapshot.seed)) || Number(snapshot.seed) <= 0) {
        throw new Error("Save data contains an invalid forest-succession seed.");
    }
    if (!snapshot.tiles || typeof snapshot.tiles !== "object" || Array.isArray(snapshot.tiles)) {
        throw new Error("Save data contains an invalid forest-succession tile map.");
    }
    const keys = Object.keys(snapshot.tiles);
    if (keys.length > MAX_TILES) throw new Error("Save data contains too many forest-succession tiles.");
    for (const [key, record] of Object.entries(snapshot.tiles)) {
        if (!validKey(key) || !record || !FOREST_DISTURBANCE_KINDS.includes(record.kind)) {
            throw new Error("Save data contains an invalid forest-succession tile.");
        }
        if (!Number.isFinite(Number(record.age)) || Number(record.age) < 0 || Number(record.age) > 100000) {
            throw new Error("Save data contains an invalid forest-succession age.");
        }
        if (record.containedUntil !== undefined && (!Number.isFinite(Number(record.containedUntil)) || Number(record.containedUntil) < 0)) {
            throw new Error("Save data contains an invalid forest-succession control date.");
        }
    }
    if (snapshot.history !== undefined) {
        if (!Array.isArray(snapshot.history) || snapshot.history.length > MAX_HISTORY) {
            throw new Error("Save data contains an invalid forest-succession history.");
        }
        for (const entry of snapshot.history) {
            if (!entry || !FOREST_DISTURBANCE_KINDS.includes(entry.kind)) {
                throw new Error("Save data contains an invalid forest-succession event.");
            }
        }
    }
    if (snapshot.spreadHistory !== undefined) {
        if (!Array.isArray(snapshot.spreadHistory) || snapshot.spreadHistory.length > MAX_HISTORY) {
            throw new Error("Save data contains an invalid forest-succession spread history.");
        }
        for (const entry of snapshot.spreadHistory) {
            if (!entry || !FOREST_DISTURBANCE_KINDS.includes(entry.kind)) {
                throw new Error("Save data contains an invalid forest-succession spread event.");
            }
        }
    }
    return true;
}

export function restoreForestSuccession(snapshot) {
    if (snapshot === undefined || snapshot === null) return 0;
    validateForestSuccessionSnapshot(snapshot);
    const tiles = {};
    for (const [key, record] of Object.entries(snapshot.tiles)) {
        if (!validKey(key) || !FOREST_DISTURBANCE_KINDS.includes(record.kind)) continue;
        tiles[key] = {
            kind: record.kind,
            age: Math.max(0, Math.floor(number(record.age))),
            containedUntil: Math.max(0, Math.floor(number(record.containedUntil))),
        };
    }
    state.forestSuccession = {
        version: VERSION,
        seed: Math.max(1, Math.floor(number(snapshot.seed, state.worldSeed || 1))),
        day: Math.max(0, Math.floor(number(snapshot.day))),
        events: Math.max(0, Math.floor(number(snapshot.events))),
        lastEventDay: Math.max(0, Math.floor(number(snapshot.lastEventDay))),
        daysSinceEvent: Math.max(0, Math.floor(number(snapshot.daysSinceEvent))),
        daysSinceSpread: Math.max(0, Math.floor(number(snapshot.daysSinceSpread))),
        spreadings: Math.max(0, Math.floor(number(snapshot.spreadings))),
        suppressed: Math.max(0, Math.floor(number(snapshot.suppressed))),
        tiles,
        history: (Array.isArray(snapshot.history) ? snapshot.history : []).slice(-MAX_HISTORY),
        spreadHistory: (Array.isArray(snapshot.spreadHistory) ? snapshot.spreadHistory : []).slice(-MAX_HISTORY),
    };
    return Object.keys(tiles).length;
}
