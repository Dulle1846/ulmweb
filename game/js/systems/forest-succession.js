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
import {
    buildForestSpatialIndex, forestBiodiversityFor, forestErosionFor,
    forestFireSpreadFor, forestFloodPressureFor, forestNeighbourOrderFor,
    forestRngSeedFor, forestWaterFlowFor, forestWindthrowFor,
    queryForestSpatialIndex,
} from "../world/forest-model.js";

// Version 2 adds player stewardship: firebreak belts, drainage decisions and
// a bounded order ledger. Version 1 snapshots load unchanged and are migrated
// in memory; the disturbance tiles themselves never need to be rewritten.
const VERSION = 2;
const MAX_TILES = 4096;
const MAX_HISTORY = 24;
const MAX_STEWARDSHIP = 24;
const MAX_BREAKS = 512;
const MAX_DRAINED = 512;
const MAX_STEP_DAYS = 30;
const EVENT_INTERVAL_DAYS = 140;
const SPREAD_INTERVAL_DAYS = 12;
const MAX_SPREAD_PER_PASS = 4;
const CONTROL_DAYS = 90;
const FIREBREAK_DAYS = 1200;
const FIREBREAK_RADIUS = 1;
const STEWARDSHIP_RADIUS = 9;

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
        planted: 0,
        stewardshipActions: 0,
        lastActionDay: 0,
        revision: 0,
        // Saveable player decisions. A break is a protected strip for a bounded
        // time; drainage is a permanent site decision until explicitly restored.
        breaks: {},
        drainage: {},
        tiles: {},
        // Internal work list: recovered records stay in tiles so the renderer
        // keeps their history, but they no longer need a daily age update.
        activeKeys: [],
        history: [],
        spreadHistory: [],
        stewardshipHistory: [],
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
    const model = state.forestSuccession;
    const drained = validModel(model) && Boolean(model.drainage?.[tileKey(x, y)]);
    return forestStandAt(x + 0.5, y + 0.5, {
        seed: Number(state.worldSeed) || 1,
        moisture: sample.moisture,
        temperature: sample.temperature,
        height: sample.height,
        climate: state.worldOptions?.climate || "temperate",
        forests: state.worldOptions?.forests ?? 52,
        stockRatio: Number(geo.forestStock?.[index] || 0) / capacity,
        rockLine: 0.92,
        drainage: drained ? 1 : 0,
    });
}

// Build the initial disturbance roster from the deterministic landscape. The
// records start at age zero so a fresh realm still shows its burn scars,
// windthrow gaps and disease patches; only elapsed simulation days move them
// into regrowth.
// Recovered records are permanent history, not active disturbances. Keeping
// them out of the daily loop avoids walking every old burn scar forever.
function rebuildActiveKeys(model) {
    const keys = [];
    for (const key in model.tiles) {
        if (activeSuccessionRecord(model.tiles[key])) keys.push(key);
    }
    model.activeKeys = keys;
    return keys;
}

function activeKeyList(model) {
    if (!Array.isArray(model.activeKeys)) rebuildActiveKeys(model);
    return model.activeKeys;
}

function activateKey(model, key) {
    const keys = activeKeyList(model);
    if (!keys.includes(key)) keys.push(key);
}

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
            model.tiles[tileKey(x, y)] = {
                kind: stand.disturbance, age: 0, containedUntil: 0,
                typeId: stand.regionalTypeId || null, typeLabel: stand.regionalLabel || null,
                year: Math.max(1, Math.floor(number(state.year, 1))), area: 1,
            };
            count++;
        }
    }
    rebuildActiveKeys(model);
    state.forestSuccession = model;
    return model;
}

export function resetForestSuccession() {
    state.forestSuccession = null;
}

// The stewardship record exists even when no disturbance tile does. Drainage
// and a firebreak therefore remain visible in the inspector and atlas without
// inventing a second woodland state.
export function forestStewardshipAt(x, y) {
    const model = state.forestSuccession;
    const tx = Math.floor(number(x)), ty = Math.floor(number(y));
    const key = tileKey(tx, ty);
    if (!validModel(model)) {
        return { available: false, x: tx, y: ty, drained: false, drainage: 0, drainDay: 0, firebreak: false, firebreakUntil: 0 };
    }
    const drainDay = Math.max(0, Math.floor(number(model.drainage?.[key])));
    const firebreakUntil = Math.max(0, Math.floor(number(model.breaks?.[key])));
    const record = model.tiles[key];
    return {
        available: true, x: tx, y: ty, key,
        drained: drainDay > 0,
        drainage: drainDay > 0 ? 1 : 0,
        drainDay,
        firebreak: firebreakUntil > model.day,
        firebreakUntil,
        restoredDay: Math.max(0, Math.floor(number(record?.restoredDay))),
    };
}

export function forestSuccessionAt(x, y) {
    const model = state.forestSuccession;
    if (!validModel(model)) return null;
    const key = tileKey(x, y);
    const record = model.tiles[key];
    if (!record) return null;
    const stage = forestSuccessionStage(record.kind, record.age);
    if (!stage) return null;
    const profile = forestSuccessionProfile(record.kind);
    const containedUntil = Math.max(0, Math.floor(number(record.containedUntil)));
    const drainDay = Math.max(0, Math.floor(number(model.drainage?.[key])));
    const firebreakUntil = Math.max(0, Math.floor(number(model.breaks?.[key])));
    return {
        kind: record.kind,
        age: Math.max(0, Math.floor(number(record.age))),
        stage: stage.id,
        label: stage.label,
        recovered: stage.id === "recovered",
        contained: containedUntil > model.day,
        containedUntil,
        progress: profile ? clamp(number(record.age) / profile.recoveredDays, 0, 1) : 0,
        typeId: record.typeId || null,
        typeLabel: record.typeLabel || null,
        restoredDay: Math.max(0, Math.floor(number(record.restoredDay))),
        drained: drainDay > 0,
        drainage: drainDay > 0 ? 1 : 0,
        firebreak: firebreakUntil > model.day,
        firebreakUntil,
    };
}

// A firebreak is a saved strip, not a global modifier. This helper is shared by
// the spread pass, the spawn pass and the focused tests so the visible order and
// the simulated protection cannot drift apart.
export function forestFirebreakAt(x, y) {
    const model = state.forestSuccession;
    if (!validModel(model)) return 0;
    const until = Math.max(0, Math.floor(number(model.breaks?.[tileKey(x, y)])));
    return until > model.day ? until : 0;
}

// Shared gate for both ignition and spread. Keeping the rule here means a
// protected strip cannot be bypassed by one of the two fire paths.
export function forestFireMayEnter(x, y) {
    return forestFirebreakAt(x, y) === 0;
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

// A compact, read-only pulse for the atlas and the building survey. It is
// derived from the same tiles the simulation advances; no second disturbance
// ledger is maintained.
export function forestSuccessionStats() {
    const model = state.forestSuccession;
    if (!validModel(model)) {
        return {
            available: false, active: 0, contained: 0, recovered: 0, byKind: {},
            events: 0, spreadings: 0, suppressed: 0, day: 0, firebreaks: 0,
            drained: 0, planted: 0, stewardshipActions: 0, regions: {},
        };
    }
    const byKind = {};
    const regions = {};
    let active = 0, contained = 0, recovered = 0;
    for (const record of Object.values(model.tiles)) {
        const stage = forestSuccessionStage(record.kind, record.age);
        if (!stage) continue;
        const regionId = record.typeId || null;
        if (regionId) {
            const region = regions[regionId] || (regions[regionId] = { active: 0, contained: 0, recovered: 0, byKind: {}, area: 0 });
            if (stage.id === "recovered") region.recovered++;
            else {
                region.active++;
                region.area++;
                region.byKind[record.kind] = (region.byKind[record.kind] || 0) + 1;
                if (Math.max(0, number(record.containedUntil)) > model.day) region.contained++;
            }
        }
        if (stage.id === "recovered") {
            recovered++;
            continue;
        }
        active++;
        byKind[record.kind] = (byKind[record.kind] || 0) + 1;
        if (Math.max(0, number(record.containedUntil)) > model.day) contained++;
    }
    let firebreaks = 0;
    for (const until of Object.values(model.breaks || {})) {
        if (Math.max(0, number(until)) > model.day) firebreaks++;
    }
    return {
        available: true,
        active, contained, recovered, byKind, regions,
        events: Math.max(0, Math.floor(number(model.events))),
        spreadings: Math.max(0, Math.floor(number(model.spreadings))),
        suppressed: Math.max(0, Math.floor(number(model.suppressed))),
        day: Math.max(0, Math.floor(number(model.day))),
        firebreaks,
        drained: Object.keys(model.drainage || {}).length,
        planted: Math.max(0, Math.floor(number(model.planted))),
        stewardshipActions: Math.max(0, Math.floor(number(model.stewardshipActions))),
        lastActionDay: Math.max(0, Math.floor(number(model.lastActionDay))),
    };
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
    // The regime's severity and refugia are not only labels. A severe regime
    // raises the fire and wind paths, while a stand with real refugia damps
    // them. Synthetic stands have no dynamics and keep the historical weights.
    const regime = stand?.dynamics?.hazard?.regime;
    const severity = clamp01(number(regime?.severity));
    const refugia = clamp01(number(regime?.refugia));
    const fireRegime = 1 + severity * 0.20 - refugia * 0.10;
    const windRegime = 1 + severity * 0.18 - refugia * 0.06;
    return {
        burned: (0.02 + fireRisk * 0.98) * CONIFER_SEASON.burned[seasonIndex] * weatherFire * fireRegime,
        "bark-beetle": (0.03 + pestRisk * 0.72 + monoculture * 0.45 + beetlePressure * 0.55)
            * CONIFER_SEASON["bark-beetle"][seasonIndex] * weatherPest * (1 + severity * 0.08),
        snowbreak: (0.03 + snowPotential * 0.97) * CONIFER_SEASON.snowbreak[seasonIndex] * weatherSnow,
        "drought-stressed": (0.03 + fireRisk * 0.5) * CONIFER_SEASON["drought-stressed"][seasonIndex] * weatherDrought * fireRegime,
        // Conifer windthrow was previously only a seeded base state. Exposure
        // and storms now make it a live event, with root-plate and salvage
        // consequences handled by the shared windthrow succession profile.
        windthrow: (0.012 + windExposure * 0.55 + (stand.disturbance === "windthrow" ? 0.08 : 0))
            * (storm ? 2.4 : seasonIndex === 3 ? 1.25 : 0.72) * windRegime,
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
    // A target stand with a strong refugium (wet hollow, old-growth core,
    // sheltered edge) resists a crossing fire, beetle wave or windthrow. The
    // factor is 1 when the stand has no dynamics record, preserving every
    // synthetic call and old save path.
    const refugia = clamp01(number(stand?.dynamics?.hazard?.regime?.refugia));
    const shelter = 1 - refugia * 0.18;
    if (kind === "burned") return clamp((0.55 + fire * 0.9) * shelter, 0.45, 1.45);
    if (kind === "bark-beetle") return clamp((0.5 + pest * 0.8 + monoculture * 0.45 + clamp01(number(insectPressure)) * 0.35) * shelter, 0.4, 1.5);
    if (kind === "snowbreak") return clamp((0.5 + snow * 0.9) * shelter, 0.45, 1.5);
    if (kind === "drought-stressed") return clamp((0.55 + fire * 0.7) * shelter, 0.45, 1.4);
    if (kind === "windthrow") {
        if (!stand?.conifer) return 1;
        return clamp((0.55 + clamp01(number(stand.windExposure ?? stand.exposure)) * 0.9) * shelter, 0.45, 1.45);
    }
    if (kind === "flooded") {
        const water = forestWaterFlowFor(stand);
        return clamp((0.42 + water.flow * 0.9 + (water.floodplain ? 0.22 : 0)) * shelter, 0.35, 1.6);
    }
    return 1;
}

// Exposed for the focused tests and for any future event UI. The caller can
// supply the roll, season and weather, so a flood can be reproduced without
// waiting for a particular campaign year.
export function forestDisturbanceKindFor(stand = {}, options = {}) {
    const season = Math.floor(number(options.season ?? state.seasonIndex, 0)) % 4;
    const weather = options.weather ?? state.weather;
    const insectPressure = number(options.insectPressure);
    const roll = clamp01(number(options.roll, 0.5));
    // A flood is a real succession event, not merely a value in the atlas. It
    // starts only where the shared water model already names a floodplain,
    // mire or strong flow, and it is common in wet spring/autumn weather.
    if (stand) {
        const flood = forestFloodPressureFor(stand, { season, weather });
        if (flood.pressure >= 0.46 && roll < Math.min(0.55, flood.pressure)) return "flooded";
    }
    // Conifer stands use the derived fire/pest/monoculture/snow pressure to
    // choose among real disturbances. Broadleaf woodland keeps its existing
    // fire/wind/disease cycle.
    if (stand?.conifer === true || number(stand?.coniferShare) > 0.4) {
        return weightedDisturbance(coniferDisturbanceWeights(stand, season, weather, insectPressure), roll);
    }
    if (season === 1) return roll < 0.62 ? "burned" : "diseased";
    if (season === 2 || season === 3) return roll < 0.64 ? "windthrow" : "diseased";
    return roll < 0.45 ? "windthrow" : "diseased";
}

function chooseKind(model, day, stand = null, insectPressure = 0) {
    const season = Math.floor(number(state.seasonIndex, 0)) % 4;
    // The event stream is deliberately separate from vegetation and animal
    // rolls. A new tree or herd can never shift which hazard a year receives.
    const eventSeed = forestRngSeedFor("events", model.seed, model.events + 1, day);
    return forestDisturbanceKindFor(stand, {
        season, weather: state.weather, roll: eventSeed / 0x100000000, insectPressure,
    });
}

function spawnDisturbance(model) {
    const geo = state.resourceGeography;
    const width = Number(state.worldW) || 0;
    const height = Number(state.worldH) || 0;
    if (!geo || !width || !height) return null;
    for (let attempt = 0; attempt < 96; attempt++) {
        const eventSeed = forestRngSeedFor("events", model.seed, model.events + 1, model.day + 1);
        const hash = hash32(eventSeed, attempt, 0x53544f52);
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
        // A maintained firebreak keeps a fire from starting inside the cleared
        // strip. Other disturbances may still reach the protected woodland.
        if (kind === "burned" && !forestFireMayEnter(x, y)) continue;
        const before = Math.max(1, Math.floor(number(geo.forestStock[index], 1)));
        // A severe regime removes more of the stand in the same event; refugia
        // leave a little more standing stock for seed and habitat. The shared
        // erosion and biodiversity readings now join that decision, so a steep
        // bare site loses more while a layered old wood keeps a seed source.
        const regime = stand?.dynamics?.hazard?.regime;
        const severity = clamp01(number(regime?.severity));
        const refugia = clamp01(number(regime?.refugia));
        const erosion = forestErosionFor(stand);
        const biodiversity = forestBiodiversityFor(stand);
        const retained = clamp(number(profile.severity) - severity * 0.06 + refugia * 0.03
            - erosion.risk * 0.08 + biodiversity.index * 0.03, 0.18, 0.95);
        const after = Math.max(1, Math.min(before, Math.floor(before * retained)));
        geo.forestStock[index] = after;
        model.tiles[key] = {
            kind, age: 0, containedUntil: 0,
            typeId: stand.regionalTypeId || null, typeLabel: stand.regionalLabel || null,
            year: Math.max(1, Math.floor(number(state.year, 1))), area: 1,
        };
        activateKey(model, key);
        model.events++;
        model.lastEventDay = model.day;
        model.history.push({
            day: model.day, year: Math.max(1, Math.floor(number(state.year, 1))),
            kind, x, y, area: 1,
            typeId: stand.regionalTypeId || null, typeLabel: stand.regionalLabel || null,
            stockBefore: before, stockAfter: after,
        });
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

    // The active work list contains only records that can still change. The
    // recovered records remain in model.tiles for rendering and save history,
    // but they are not scanned every tick. Keep the list exact when a record
    // reaches its recovered age.
    const active = activeKeyList(model);
    const remaining = [];
    const profiles = new Map();
    for (const key of active) {
        const record = model.tiles[key];
        if (!record) continue;
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
        const next = Math.min(profile.recoveredDays, age + steps);
        record.age = next;
        if (next < profile.recoveredDays) remaining.push(key);
    }
    model.activeKeys = remaining;
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
    if (kind === "flooded") return { food: 5, gold: 4 };
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
    // Spread order must stay in tile-creation order for deterministic saves.
    // Iterate the maintained active list (also insertion-ordered) instead of
    // every recovered record: a mature wetland can hold thousands of old
    // scars, and re-evaluating each one every twelve days was the remaining
    // low-end spike. The snapshot preserves the old "do not visit records
    // created during this pass" rule.
    const keys = activeKeyList(model).slice();
    let tileCount = Object.keys(model.tiles).length;
    let spreads = 0;

    for (const key of keys) {
        if (spreads >= MAX_SPREAD_PER_PASS) break;
        const record = model.tiles[key];
        if (!record) continue;
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
        const riskAware = ["burned", "bark-beetle", "snowbreak", "drought-stressed", "windthrow", "flooded"].includes(record.kind);
        if (roll > chance * (riskAware ? 1.5 : 1)) continue;
        // The shared neighbourhood order follows the current weather: a storm
        // pushes fire and windthrow downwind first, while a calm day still uses
        // a deterministic hash start. This is the same eight-neighbour walk the
        // renderer and atlas use, not a second spread model.
        let neighbourOrder = forestNeighbourOrderFor({
            x, y, width, height, wind: state.weather, seed: model.seed,
        });
        let gust = null;
        if (record.kind === "windthrow") {
            // The storm direction and stand age choose the downwind edge. Only
            // a windthrow that survived its roll builds one source stand; the
            // earlier eager build for every active tile caused avoidable
            // cold-start long tasks in dense swamp realms.
            const sourceStand = standAtTile(geo, x, y);
            if (sourceStand) {
                gust = forestWindthrowFor(sourceStand, sourceStand.standAge ?? sourceStand.age);
                chance *= 0.72 + gust.risk * 0.55;
                neighbourOrder = [...neighbourOrder].sort((a, b) =>
                    a.id === gust.direction ? -1 : b.id === gust.direction ? 1 : 0);
            }
        }
        if (record.kind === "flooded") {
            const sourceStand = standAtTile(geo, x, y);
            if (sourceStand) {
                const sourceWater = forestWaterFlowFor(sourceStand);
                chance *= 0.6 + sourceWater.flow * 0.7;
            }
        }
        if (record.kind === "burned") {
            // Fire uses the eight-neighbour risk record, including the wind
            // alignment and the target's actual fireRisk. The list is already
            // sorted by crossing risk, so start at the top and let the shared
            // threshold decide whether that edge ignites. No source stand is
            // needed; the neighbour walk reads only the targets.
            neighbourOrder = forestFireSpreadFor({
                x, y, width, height, wind: state.weather,
                season: ["spring", "summer", "autumn", "winter"][season],
                seed: model.seed,
                standAt: (sx, sy) => standAtTile(geo, Math.floor(sx), Math.floor(sy)),
            });
        }
        const start = record.kind === "burned" || record.kind === "windthrow"
            ? 0 : hash32(model.seed, x, y, model.day + 0x53505244) % neighbourOrder.length;
        for (let offset = 0; offset < neighbourOrder.length; offset++) {
            const neighbour = neighbourOrder[(start + offset) % neighbourOrder.length];
            const dx = neighbour.dx;
            const dy = neighbour.dy;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const nkey = tileKey(nx, ny);
            const existing = model.tiles[nkey];
            if (existing && activeSuccessionRecord(existing)) continue;
            if (!existing && tileCount >= MAX_TILES) break;
            if (record.kind === "burned" && !forestFireMayEnter(nx, ny)) continue;
            const index = ny * width + nx;
            const before = Math.max(0, Math.floor(number(geo.forestStock?.[index])));
            if (!geo.forestCapacity?.[index] || before < 12) continue;
            const stand = standAtTile(geo, nx, ny);
            if (!stand?.forest || stand.type === "cutover") continue;
            // Fire carries its own target risk from forestFireSpreadFor; a
            // flood can cross only into another wet low site. The shared
            // spread-risk factor still owns pest, snow, drought and wind.
            const fireRisk = record.kind === "burned"
                ? Math.max(0.22, Number(neighbour.risk) || 0) : 1;
            if (record.kind === "flooded") {
                const targetFlood = forestFloodPressureFor(stand, { season, weather: state.weather });
                if (targetFlood.pressure < 0.38) continue;
            }
            if (roll > chance * fireRisk * spreadRiskFactor(record.kind, stand, forestBarkBeetlePressureAt(nx, ny))) continue;
            // A diverse, layered stand keeps more seed and shade after the
            // disturbance; an erodible open slope loses more of its stock.
            const erosion = forestErosionFor(stand);
            const biodiversity = forestBiodiversityFor(stand);
            const loss = clamp(0.18 + erosion.risk * 0.16 - biodiversity.index * 0.05, 0.1, 0.45);
            const after = Math.max(1, Math.floor(before * (1 - loss)));
            geo.forestStock[index] = after;
            model.tiles[nkey] = {
                kind: record.kind, age: 0, containedUntil: 0,
                typeId: stand.regionalTypeId || null, typeLabel: stand.regionalLabel || null,
                year: Math.max(1, Math.floor(number(state.year, 1))), area: 1,
            };
            activateKey(model, nkey);
            tileCount++;
            model.spreadings = Math.max(0, Math.floor(number(model.spreadings))) + 1;
            model.spreadHistory.push({
                day: model.day, year: Math.max(1, Math.floor(number(state.year, 1))),
                kind: record.kind, from: [x, y], to: [nx, ny], area: 1,
                typeId: stand.regionalTypeId || null, typeLabel: stand.regionalLabel || null,
                stockBefore: before, stockAfter: after,
            });
            if (model.spreadHistory.length > MAX_HISTORY) model.spreadHistory.splice(0, model.spreadHistory.length - MAX_HISTORY);
            spreads++;
            break;
        }
    }
    return spreads;
}

const STEWARDSHIP_LABELS = Object.freeze({
    reforest: "Reforestation",
    firebreak: "Firebreak belt",
    burn: "Controlled burn",
    drain: "Wetland drainage",
    restore: "Wetland restoration",
    control: "Disturbance control",
});

function affordable(cost) {
    for (const [key, amount] of Object.entries(cost)) {
        if ((Number(state.resources?.[key]) || 0) < amount) return key;
    }
    return null;
}

function pay(cost) {
    for (const [key, amount] of Object.entries(cost)) {
        state.resources[key] = Math.max(0, Math.round(((Number(state.resources[key]) || 0) - amount) * 100) / 100);
    }
}

function addStewardship(model, entry) {
    if (!Array.isArray(model.stewardshipHistory)) model.stewardshipHistory = [];
    model.stewardshipActions = Math.max(0, Math.floor(number(model.stewardshipActions))) + 1;
    model.lastActionDay = Math.max(0, Math.floor(number(model.day)));
    model.revision = Math.max(0, Math.floor(number(model.revision))) + 1;
    model.stewardshipHistory.push({
        ...entry,
        day: Math.max(0, Math.floor(number(model.day))),
        year: Math.max(1, Math.floor(number(entry.year ?? state.year, 1))),
        area: Math.max(1, Math.floor(number(entry.area, 1))),
    });
    if (model.stewardshipHistory.length > MAX_STEWARDSHIP) {
        model.stewardshipHistory.splice(0, model.stewardshipHistory.length - MAX_STEWARDSHIP);
    }
}

function nearestForestTarget(geo, originX, originY, radius, predicate) {
    const width = Number(state.worldW) || 0;
    const height = Number(state.worldH) || 0;
    if (!geo || !width || !height) return null;
    const cx = Math.floor(number(originX));
    const cy = Math.floor(number(originY));
    const limit = clamp(Math.floor(number(radius, STEWARDSHIP_RADIUS)), 1, 14);
    const x0 = Math.max(0, cx - limit), x1 = Math.min(width - 1, cx + limit);
    const y0 = Math.max(0, cy - limit), y1 = Math.min(height - 1, cy + limit);
    let best = null;
    for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
            const distance = Math.abs(x - cx) + Math.abs(y - cy);
            if (distance > limit || (best && distance > best.distance)) continue;
            const index = y * width + x;
            if (!Number(geo.forestCapacity?.[index])) continue;
            const stand = standAtTile(geo, x, y);
            if (!stand?.forest) continue;
            if (!predicate(stand, x, y, index)) continue;
            if (!best || distance < best.distance || (distance === best.distance && index < best.index)) {
                best = { stand, x, y, index, distance };
            }
        }
    }
    return best;
}

function sitePlantingFactor(stand) {
    const biodiversity = forestBiodiversityFor(stand);
    const erosion = forestErosionFor(stand);
    return clamp(
        0.48 + biodiversity.index * 0.30 + (1 - erosion.risk) * 0.18
        + clamp01(number(stand.regionalEffects?.regrowth, 1)) * 0.10
        + (stand.ageClass === "young" ? 0.05 : 0)
        - (clamp01(number(stand.height)) > 0.8 ? 0.12 : 0),
        0.35, 1.12,
    );
}

function recordStewardedTile(model, x, y, stand) {
    const key = tileKey(x, y);
    const record = model.tiles[key];
    if (!record) return;
    record.restoredDay = Math.max(0, Math.floor(number(model.day)));
    record.typeId = record.typeId || stand?.regionalTypeId || null;
    record.typeLabel = record.typeLabel || stand?.regionalLabel || null;
}

// Plant a real clearing. The action restores stock inside a compact 3×3 patch;
// survival and the number of planted units come from the same site, age,
// biodiversity and erosion readings the regrowth loop uses.
export function reforestNearestForestTile(originX, originY, radius = STEWARDSHIP_RADIUS) {
    const model = ensureForestSuccession();
    const geo = state.resourceGeography;
    if (!model || !geo) return { ok: false, reason: "No active forest geography" };
    const target = nearestForestTarget(geo, originX, originY, radius, (stand, x, y, index) => {
        const capacity = Number(geo.forestCapacity[index]) || 0;
        return capacity >= 20 && Number(geo.forestStock[index]) < capacity * 0.82;
    });
    if (!target) return { ok: false, reason: "No restorable clearing within " + radius + " tiles" };
    const cost = { gold: 8, food: 5 };
    const missing = affordable(cost);
    if (missing) return { ok: false, reason: "Not enough " + missing + " for a planting crew" };
    let tiles = 0, planted = 0, factorTotal = 0, stockBeforeTotal = 0, stockAfterTotal = 0;
    for (let y = target.y - 1; y <= target.y + 1; y++) {
        for (let x = target.x - 1; x <= target.x + 1; x++) {
            if (x < 0 || y < 0 || x >= (Number(state.worldW) || 0) || y >= (Number(state.worldH) || 0)) continue;
            const index = y * (Number(state.worldW) || 0) + x;
            const capacity = Number(geo.forestCapacity[index]) || 0;
            const before = Number(geo.forestStock[index]) || 0;
            if (capacity < 20 || before >= capacity * 0.86) continue;
            const stand = standAtTile(geo, x, y);
            if (!stand?.forest) continue;
            const factor = sitePlantingFactor(stand);
            const amount = Math.min(capacity - before,
                Math.max(1, Math.round(capacity * (0.13 + factor * 0.11))));
            if (amount <= 0) continue;
            geo.forestStock[index] = before + amount;
            stockBeforeTotal += before;
            stockAfterTotal += before + amount;
            planted += amount;
            tiles++;
            factorTotal += factor;
            recordStewardedTile(model, x, y, stand);
        }
    }
    if (!tiles) return { ok: false, reason: "The clearing has no plantable forest tiles" };
    pay(cost);
    model.planted = Math.max(0, Math.floor(number(model.planted))) + planted;
    addStewardship(model, {
        kind: "reforest", x: target.x, y: target.y, area: tiles, amount: planted,
        stockBefore: stockBeforeTotal, stockAfter: stockAfterTotal,
        typeId: target.stand.regionalTypeId || null, typeLabel: target.stand.regionalLabel || null,
        siteFactor: Math.round((factorTotal / tiles) * 100) / 100, cost,
    });
    return {
        ok: true, action: "reforest", x: target.x, y: target.y, tiles, planted, amount: planted,
        stockBefore: stockBeforeTotal, stockAfter: stockAfterTotal,
        siteFactor: Math.round((factorTotal / tiles) * 100) / 100, cost,
        typeId: target.stand.regionalTypeId || null, typeLabel: target.stand.regionalLabel || null,
    };
}

// Clear a protected 3×3 belt. The break is stored per tile and read by both the
// natural ignition and the spread pass, so it is a real island of protection
// rather than a one-off event modifier.
export function buildNearestForestFirebreak(originX, originY, radius = STEWARDSHIP_RADIUS) {
    const model = ensureForestSuccession();
    const geo = state.resourceGeography;
    if (!model || !geo) return { ok: false, reason: "No active forest geography" };
    const target = nearestForestTarget(geo, originX, originY, radius, (stand, x, y) =>
        !forestFirebreakAt(x, y) && Number(stand.stockRatio) > 0.05);
    if (!target) return { ok: false, reason: "No unprotected forest within " + radius + " tiles" };
    const keys = [];
    for (let y = target.y - FIREBREAK_RADIUS; y <= target.y + FIREBREAK_RADIUS; y++) {
        for (let x = target.x - FIREBREAK_RADIUS; x <= target.x + FIREBREAK_RADIUS; x++) {
            if (x < 0 || y < 0 || x >= (Number(state.worldW) || 0) || y >= (Number(state.worldH) || 0)) continue;
            const index = y * (Number(state.worldW) || 0) + x;
            if (!Number(geo.forestCapacity?.[index])) continue;
            keys.push(tileKey(x, y));
        }
    }
    if (!keys.length) return { ok: false, reason: "No woodland can be cleared for a firebreak here" };
    const cost = { wood: Math.max(3, Math.ceil(keys.length * 0.55)), gold: Math.max(2, Math.ceil(keys.length * 0.35)) };
    const missing = affordable(cost);
    if (missing) return { ok: false, reason: "Not enough " + missing + " for a firebreak crew" };
    if (!model.breaks || typeof model.breaks !== "object") model.breaks = {};
    // Keep the saved strip bounded. Expired strips are discarded first.
    for (const [key, until] of Object.entries(model.breaks)) {
        if (Math.max(0, number(until)) <= model.day) delete model.breaks[key];
    }
    if (Object.keys(model.breaks).length + keys.length > MAX_BREAKS) {
        return { ok: false, reason: "The realm already maintains too many firebreak strips" };
    }
    const until = model.day + FIREBREAK_DAYS;
    for (const key of keys) model.breaks[key] = until;
    pay(cost);
    addStewardship(model, {
        kind: "firebreak", x: target.x, y: target.y, area: keys.length, untilDays: FIREBREAK_DAYS,
        typeId: target.stand.regionalTypeId || null, typeLabel: target.stand.regionalLabel || null, cost,
    });
    return {
        ok: true, action: "firebreak", x: target.x, y: target.y, tiles: keys.length,
        until, days: FIREBREAK_DAYS, cost, typeId: target.stand.regionalTypeId || null,
        typeLabel: target.stand.regionalLabel || null,
    };
}

// A controlled burn is a deliberate disturbance with a real salvage yield and a
// real escape risk. It uses the stewardship RNG stream, never the vegetation or
// natural-event stream, so planting a wood cannot reroll the fire.
export function controlledBurnNearestForestTile(originX, originY, radius = STEWARDSHIP_RADIUS) {
    const model = ensureForestSuccession();
    const geo = state.resourceGeography;
    if (!model || !geo) return { ok: false, reason: "No active forest geography" };
    const target = nearestForestTarget(geo, originX, originY, radius, (stand, x, y, index) => {
        if (forestFirebreakAt(x, y)) return false;
        const record = model.tiles[tileKey(x, y)];
        const stage = record ? forestSuccessionStage(record.kind, record.age) : null;
        if (stage && stage.id !== "recovered") return false;
        if (stand.ageClass === "young") return false;
        return Number(geo.forestStock[index]) >= Math.max(18, Number(geo.forestCapacity[index]) * 0.28);
    });
    if (!target) return { ok: false, reason: "No mature, unbroken stand within " + radius + " tiles" };
    const cost = { gold: 6, food: 3 };
    const missing = affordable(cost);
    if (missing) return { ok: false, reason: "Not enough " + missing + " for a burn crew" };
    const index = target.index;
    const before = Math.max(1, Number(geo.forestStock[index]) || 1);
    const biodiversity = forestBiodiversityFor(target.stand);
    const weather = String(state.weather || "clear").toLowerCase();
    const dry = weather === "clear" || weather === "heat" || weather === "drought";
    const escapeChance = clamp(0.04 + clamp01(number(target.stand.fireRisk)) * 0.28
        + (dry ? 0.10 : 0) + (1 - biodiversity.index) * 0.08
        - clamp01(number(target.stand.wetness)) * 0.10, 0.03, 0.50);
    const roll = forestRngSeedFor("stewardship", model.seed,
        target.x + model.day * 131, target.y + model.events * 17) / 0x100000000;
    const escaped = roll < escapeChance;
    const retained = clamp(0.84 - clamp01(number(target.stand.fireRisk)) * 0.08
        + biodiversity.index * 0.02, 0.68, 0.90);
    const after = Math.max(1, Math.floor(before * retained));
    const wood = Math.max(1, Math.round((before - after) * 0.45));
    geo.forestStock[index] = after;
    model.tiles[tileKey(target.x, target.y)] = {
        kind: "burned", age: 0,
        containedUntil: escaped ? 0 : model.day + CONTROL_DAYS,
        typeId: target.stand.regionalTypeId || null,
        typeLabel: target.stand.regionalLabel || null,
        year: Math.max(1, Math.floor(number(state.year, 1))),
        area: 1, origin: "controlled-burn",
    };
    activateKey(model, tileKey(target.x, target.y));
    model.events = Math.max(0, Math.floor(number(model.events))) + 1;
    model.lastEventDay = model.day;
    model.daysSinceEvent = 0;
    if (escaped) model.daysSinceSpread = SPREAD_INTERVAL_DAYS;
    state.resources.wood = Math.max(0, Math.round(((Number(state.resources.wood) || 0) + wood) * 100) / 100);
    pay(cost);
    model.history.push({
        day: model.day, year: Math.max(1, Math.floor(number(state.year, 1))),
        kind: "burned", x: target.x, y: target.y, area: 1, cause: "controlled-burn",
        typeId: target.stand.regionalTypeId || null, typeLabel: target.stand.regionalLabel || null,
        stockBefore: before, stockAfter: after,
    });
    if (model.history.length > MAX_HISTORY) model.history.splice(0, model.history.length - MAX_HISTORY);
    addStewardship(model, {
        kind: "burn", x: target.x, y: target.y, area: 1, escaped,
        escapeChance: Math.round(escapeChance * 100) / 100, wood,
        stockBefore: before, stockAfter: after,
        typeId: target.stand.regionalTypeId || null, typeLabel: target.stand.regionalLabel || null, cost,
    });
    return {
        ok: true, action: "burn", x: target.x, y: target.y, escaped, wood,
        stockBefore: before, stockAfter: after, cost,
        containedUntil: escaped ? 0 : model.day + CONTROL_DAYS,
        escapeChance: Math.round(escapeChance * 100) / 100,
        typeId: target.stand.regionalTypeId || null, typeLabel: target.stand.regionalLabel || null,
    };
}

// Drain the nearest undrained wet stand, or restore the nearest drained one.
// The toggle is one decision with two directions: flood pressure and habitat
// respond immediately and the site carries the choice through every later save.
export function toggleNearestWetlandDrainage(originX, originY, radius = STEWARDSHIP_RADIUS) {
    const model = ensureForestSuccession();
    const geo = state.resourceGeography;
    if (!model || !geo) return { ok: false, reason: "No active forest geography" };
    const season = Math.floor(number(state.seasonIndex, 0)) % 4;
    const target = nearestForestTarget(geo, originX, originY, radius, (stand, x, y, index) => {
        const key = tileKey(x, y);
        if (model.drainage?.[key]) return true;
        const wet = clamp01(number(stand.wetness));
        if (wet < 0.52) return false;
        const typeKey = String(stand.regionalType?.key || "");
        return forestFloodPressureFor(stand, { season, weather: state.weather }).pressure >= 0.40
            || /floodplain|carr|mire|swamp|bog|alder|willow|mangrove|alluvial/.test(typeKey);
    });
    if (!target) return { ok: false, reason: "No wetland stand within " + radius + " tiles" };
    const key = tileKey(target.x, target.y);
    const restoring = Boolean(model.drainage?.[key]);
    const cost = restoring ? { gold: 6, food: 4 } : { gold: 10, wood: 6 };
    const missing = affordable(cost);
    if (missing) return { ok: false, reason: "Not enough " + missing + " for a wetland crew" };
    if (!restoring && Object.keys(model.drainage || {}).length >= MAX_DRAINED) {
        return { ok: false, reason: "The realm already maintains too many drained sites" };
    }
    const beforeWater = forestFloodPressureFor(target.stand, { season, weather: state.weather });
    const beforeBio = forestBiodiversityFor(target.stand);
    if (!model.drainage || typeof model.drainage !== "object") model.drainage = {};
    if (restoring) delete model.drainage[key];
    else model.drainage[key] = model.day + 1;
    const afterStand = standAtTile(geo, target.x, target.y);
    const afterWater = forestFloodPressureFor(afterStand, { season, weather: state.weather });
    const afterBio = forestBiodiversityFor(afterStand);
    const record = model.tiles[key];
    if (record) record.restoredDay = model.day;
    pay(cost);
    addStewardship(model, {
        kind: restoring ? "restore" : "drain", x: target.x, y: target.y, area: 1,
        beforeFlood: beforeWater.pressure, afterFlood: afterWater.pressure,
        beforeBiodiversity: beforeBio.index, afterBiodiversity: afterBio.index,
        typeId: target.stand.regionalTypeId || null, typeLabel: target.stand.regionalLabel || null, cost,
    });
    return {
        ok: true, action: restoring ? "restore" : "drain", x: target.x, y: target.y,
        drained: !restoring, beforeFlood: beforeWater.pressure, afterFlood: afterWater.pressure,
        beforeBiodiversity: beforeBio.index, afterBiodiversity: afterBio.index,
        cost, typeId: target.stand.regionalTypeId || null, typeLabel: target.stand.regionalLabel || null,
    };
}

function chronicleYear(model, entry) {
    const recorded = Math.floor(number(entry.year));
    if (recorded > 0) return recorded;
    const elapsed = Math.max(0, Math.floor(number(model.day)) - Math.max(0, Math.floor(number(entry.day))));
    return Math.max(1, Math.floor(number(state.year, 1)) - Math.floor(elapsed / 400));
}

function chronicleEvent(model, source, entry, override = {}) {
    const kind = entry.kind;
    const x = Math.floor(number(override.x ?? entry.x));
    const y = Math.floor(number(override.y ?? entry.y));
    const live = forestSuccessionAt(x, y);
    const action = source === "stewardship";
    return {
        source, kind, x, y,
        day: Math.max(0, Math.floor(number(entry.day))),
        year: chronicleYear(model, entry),
        area: Math.max(1, Math.floor(number(entry.area, 1))),
        typeId: entry.typeId || null,
        typeLabel: entry.typeLabel || null,
        label: action ? (STEWARDSHIP_LABELS[kind] || String(kind)) : (forestSuccessionProfile(kind)?.freshLabel || String(kind)),
        progress: !action && live ? live.progress : null,
        recovered: !action && live ? live.recovered : null,
        stockBefore: Number.isFinite(Number(entry.stockBefore)) ? Number(entry.stockBefore) : null,
        stockAfter: Number.isFinite(Number(entry.stockAfter)) ? Number(entry.stockAfter) : null,
        amount: Number.isFinite(Number(entry.amount)) ? Number(entry.amount) : null,
        escaped: Boolean(entry.escaped),
        spread: source === "spread",
        cost: entry.cost && typeof entry.cost === "object" ? { ...entry.cost } : null,
        beforeFlood: Number.isFinite(Number(entry.beforeFlood)) ? Number(entry.beforeFlood) : null,
        afterFlood: Number.isFinite(Number(entry.afterFlood)) ? Number(entry.afterFlood) : null,
        beforeBiodiversity: Number.isFinite(Number(entry.beforeBiodiversity)) ? Number(entry.beforeBiodiversity) : null,
        afterBiodiversity: Number.isFinite(Number(entry.afterBiodiversity)) ? Number(entry.afterBiodiversity) : null,
    };
}

// Bounded region chronicle for the atlas. It reads only the saved capped
// ledgers plus the disturbance record at the event's own coordinates, never a
// per-tile scan. Every entry keeps its regional type when one was known.
export function forestSuccessionChronicle(limit = 24) {
    const model = state.forestSuccession;
    if (!validModel(model)) return { available: false, day: 0, entries: [], byRegion: {}, total: 0 };
    const entries = [];
    for (const entry of Array.isArray(model.history) ? model.history : []) {
        if (!entry || !FOREST_DISTURBANCE_KINDS.includes(entry.kind)) continue;
        if (entry.cause === "controlled-burn") continue;
        entries.push(chronicleEvent(model, "disturbance", entry));
    }
    for (const entry of Array.isArray(model.spreadHistory) ? model.spreadHistory : []) {
        if (!entry || !FOREST_DISTURBANCE_KINDS.includes(entry.kind)) continue;
        const to = Array.isArray(entry.to) ? entry.to : [entry.x, entry.y];
        entries.push(chronicleEvent(model, "spread", entry, { x: to[0], y: to[1] }));
    }
    for (const entry of Array.isArray(model.stewardshipHistory) ? model.stewardshipHistory : []) {
        if (!entry || !STEWARDSHIP_LABELS[entry.kind]) continue;
        entries.push(chronicleEvent(model, "stewardship", entry));
    }
    entries.sort((a, b) => b.day - a.day || String(a.kind).localeCompare(String(b.kind)) || a.x - b.x || a.y - b.y);
    const byRegion = {};
    for (const entry of entries) {
        const id = entry.typeId || "legacy";
        (byRegion[id] || (byRegion[id] = [])).push(entry);
    }
    // Keep every bounded entry. The UI decides how many recent events to show;
    // dropping old entries here could hide a player order that sits behind two
    // years of natural disturbances.
    return {
        available: true,
        day: Math.max(0, Math.floor(number(model.day))),
        total: entries.length,
        entries: entries.slice(0, Math.max(1, Math.min(60, Math.floor(number(limit, 24))))),
        byRegion,
    };
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
    addStewardship(model, {
        kind: "control", x: Math.floor(x), y: Math.floor(y), area: 1,
        disturbance: record.kind, days: CONTROL_DAYS,
        typeId: record.typeId || null, typeLabel: record.typeLabel || null, cost,
    });
    return { ok: true, x: Math.floor(x), y: Math.floor(y), kind: record.kind, days: CONTROL_DAYS, cost, containedUntil: record.containedUntil };
}

export function suppressNearestForestDisturbance(x, y, radius = 8) {
    const model = ensureForestSuccession();
    if (!model) return { ok: false, reason: "No active succession model" };
    const cx = Math.floor(number(x));
    const cy = Math.floor(number(y));
    const limit = Math.max(1, Math.floor(number(radius, 8)));
    // The active disturbances are spatially indexed instead of scanning every
    // old scar. The index is bounded to the existing tile cap and is built only
    // for this player action; the daily simulation never pays for it.
    const active = [];
    for (const [key, record] of Object.entries(model.tiles)) {
        if (!activeSuccessionRecord(record) || Math.max(0, number(record.containedUntil)) > model.day) continue;
        const [tx, ty] = key.split(":").map(Number);
        active.push({ key, x: tx, y: ty });
    }
    const index = buildForestSpatialIndex(active, { cellSize: Math.max(2, Math.ceil(limit / 2)), limit: MAX_TILES });
    const candidates = queryForestSpatialIndex(index, cx, cy, limit * Math.SQRT2)
        .map(({ item }) => ({ ...item, distance: Math.abs(item.x - cx) + Math.abs(item.y - cy) }))
        .filter(item => item.distance <= limit)
        .sort((a, b) => a.distance - b.distance || a.key.localeCompare(b.key));
    const best = candidates[0];
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
            typeId: typeof record.typeId === "string" ? record.typeId.slice(0, 48) : null,
            typeLabel: typeof record.typeLabel === "string" ? record.typeLabel.slice(0, 80) : null,
            year: Math.max(0, Math.floor(number(record.year))),
            area: Math.max(1, Math.floor(number(record.area, 1))),
            restoredDay: Math.max(0, Math.floor(number(record.restoredDay))),
            origin: record.origin === "controlled-burn" ? "controlled-burn" : null,
        };
    }
    const breaks = {};
    for (const [key, until] of Object.entries(model.breaks || {})) {
        if (!validKey(key) || !Number.isFinite(Number(until))) continue;
        if (Object.keys(breaks).length >= MAX_BREAKS) break;
        breaks[key] = Math.max(0, Math.floor(number(until)));
    }
    const drainage = {};
    for (const [key, day] of Object.entries(model.drainage || {})) {
        if (!validKey(key) || !Number.isFinite(Number(day))) continue;
        if (Object.keys(drainage).length >= MAX_DRAINED) break;
        drainage[key] = Math.max(1, Math.floor(number(day)));
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
        planted: Math.max(0, Math.floor(number(model.planted))),
        stewardshipActions: Math.max(0, Math.floor(number(model.stewardshipActions))),
        lastActionDay: Math.max(0, Math.floor(number(model.lastActionDay))),
        tiles, breaks, drainage,
        spreadHistory: (Array.isArray(model.spreadHistory) ? model.spreadHistory : [])
            .filter(entry => entry && FOREST_DISTURBANCE_KINDS.includes(entry.kind))
            .slice(-MAX_HISTORY)
            .map(entry => ({
                day: Math.max(0, Math.floor(number(entry.day))), kind: entry.kind,
                year: Math.max(0, Math.floor(number(entry.year))),
                area: Math.max(1, Math.floor(number(entry.area, 1))),
                typeId: typeof entry.typeId === "string" ? entry.typeId.slice(0, 48) : null,
                typeLabel: typeof entry.typeLabel === "string" ? entry.typeLabel.slice(0, 80) : null,
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
                year: Math.max(0, Math.floor(number(entry.year))),
                area: Math.max(1, Math.floor(number(entry.area, 1))),
                cause: entry.cause === "controlled-burn" ? "controlled-burn" : null,
                typeId: typeof entry.typeId === "string" ? entry.typeId.slice(0, 48) : null,
                typeLabel: typeof entry.typeLabel === "string" ? entry.typeLabel.slice(0, 80) : null,
                x: Math.floor(number(entry.x)),
                y: Math.floor(number(entry.y)),
                stockBefore: Math.max(0, Math.floor(number(entry.stockBefore))),
                stockAfter: Math.max(0, Math.floor(number(entry.stockAfter))),
            })),
        stewardshipHistory: (Array.isArray(model.stewardshipHistory) ? model.stewardshipHistory : [])
            .filter(entry => entry && STEWARDSHIP_LABELS[entry.kind])
            .slice(-MAX_STEWARDSHIP)
            .map(entry => ({
                kind: entry.kind,
                day: Math.max(0, Math.floor(number(entry.day))),
                year: Math.max(0, Math.floor(number(entry.year))),
                x: Math.floor(number(entry.x)), y: Math.floor(number(entry.y)),
                area: Math.max(1, Math.floor(number(entry.area, 1))),
                amount: Math.max(0, Math.floor(number(entry.amount))),
                typeId: typeof entry.typeId === "string" ? entry.typeId.slice(0, 48) : null,
                typeLabel: typeof entry.typeLabel === "string" ? entry.typeLabel.slice(0, 80) : null,
                stockBefore: Math.max(0, Math.floor(number(entry.stockBefore))),
                stockAfter: Math.max(0, Math.floor(number(entry.stockAfter))),
                beforeFlood: Math.max(0, Math.min(1, number(entry.beforeFlood))),
                afterFlood: Math.max(0, Math.min(1, number(entry.afterFlood))),
                beforeBiodiversity: Math.max(0, Math.min(1, number(entry.beforeBiodiversity))),
                afterBiodiversity: Math.max(0, Math.min(1, number(entry.afterBiodiversity))),
                escaped: Boolean(entry.escaped),
                wood: Math.max(0, Math.floor(number(entry.wood))),
                cost: entry.cost && typeof entry.cost === "object" ? { ...entry.cost } : null,
            })),
    };
}

export function validateForestSuccessionSnapshot(snapshot) {
    if (snapshot === undefined || snapshot === null) return true;
    const version = Number(snapshot?.version);
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)
        || (version !== 1 && version !== VERSION)) {
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
        if (record.typeId !== undefined && record.typeId !== null && typeof record.typeId !== "string") {
            throw new Error("Save data contains an invalid forest-succession region id.");
        }
        if (record.typeLabel !== undefined && record.typeLabel !== null && typeof record.typeLabel !== "string") {
            throw new Error("Save data contains an invalid forest-succession region label.");
        }
    }
    if (snapshot.breaks !== undefined) {
        if (!snapshot.breaks || typeof snapshot.breaks !== "object" || Array.isArray(snapshot.breaks)) {
            throw new Error("Save data contains an invalid forest firebreak register.");
        }
        const entries = Object.entries(snapshot.breaks);
        if (entries.length > MAX_BREAKS) throw new Error("Save data contains too many forest firebreaks.");
        for (const [key, until] of entries) {
            if (!validKey(key) || !Number.isFinite(Number(until)) || Number(until) < 0) {
                throw new Error("Save data contains an invalid forest firebreak.");
            }
        }
    }
    if (snapshot.drainage !== undefined) {
        if (!snapshot.drainage || typeof snapshot.drainage !== "object" || Array.isArray(snapshot.drainage)) {
            throw new Error("Save data contains an invalid forest drainage register.");
        }
        const entries = Object.entries(snapshot.drainage);
        if (entries.length > MAX_DRAINED) throw new Error("Save data contains too many drained forest sites.");
        for (const [key, day] of entries) {
            if (!validKey(key) || !Number.isFinite(Number(day)) || Number(day) < 1) {
                throw new Error("Save data contains an invalid drained forest site.");
            }
        }
    }
    if (snapshot.stewardshipHistory !== undefined) {
        if (!Array.isArray(snapshot.stewardshipHistory) || snapshot.stewardshipHistory.length > MAX_STEWARDSHIP) {
            throw new Error("Save data contains an invalid forest stewardship history.");
        }
        for (const entry of snapshot.stewardshipHistory) {
            if (!entry || !STEWARDSHIP_LABELS[entry.kind]) {
                throw new Error("Save data contains an invalid forest stewardship order.");
            }
            if (!Number.isFinite(Number(entry.day)) || Number(entry.day) < 0) {
                throw new Error("Save data contains an invalid forest stewardship date.");
            }
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
            typeId: typeof record.typeId === "string" ? record.typeId : null,
            typeLabel: typeof record.typeLabel === "string" ? record.typeLabel : null,
            year: Math.max(0, Math.floor(number(record.year))),
            area: Math.max(1, Math.floor(number(record.area, 1))),
            restoredDay: Math.max(0, Math.floor(number(record.restoredDay))),
            origin: record.origin === "controlled-burn" ? "controlled-burn" : null,
        };
    }
    const breaks = {};
    for (const [key, until] of Object.entries(snapshot.breaks || {})) {
        if (!validKey(key) || !Number.isFinite(Number(until))) continue;
        breaks[key] = Math.max(0, Math.floor(number(until)));
    }
    const drainage = {};
    for (const [key, day] of Object.entries(snapshot.drainage || {})) {
        if (!validKey(key) || !Number.isFinite(Number(day))) continue;
        drainage[key] = Math.max(1, Math.floor(number(day)));
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
        planted: Math.max(0, Math.floor(number(snapshot.planted))),
        stewardshipActions: Math.max(0, Math.floor(number(snapshot.stewardshipActions))),
        lastActionDay: Math.max(0, Math.floor(number(snapshot.lastActionDay))),
        // Version 1 snapshots simply get empty registers; every disturbance
        // tile and every unit of forest stock is preserved exactly.
        breaks, drainage,
        tiles,
        history: (Array.isArray(snapshot.history) ? snapshot.history : []).slice(-MAX_HISTORY),
        spreadHistory: (Array.isArray(snapshot.spreadHistory) ? snapshot.spreadHistory : []).slice(-MAX_HISTORY),
        stewardshipHistory: (Array.isArray(snapshot.stewardshipHistory) ? snapshot.stewardshipHistory : [])
            .filter(entry => entry && STEWARDSHIP_LABELS[entry.kind])
            .slice(-MAX_STEWARDSHIP),
        activeKeys: [],
        revision: 0,
    };
    rebuildActiveKeys(state.forestSuccession);
    return Object.keys(tiles).length;
}
