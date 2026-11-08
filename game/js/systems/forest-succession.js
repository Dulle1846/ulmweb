// Persistent disturbance succession for broadleaf woodland.
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

const VERSION = 1;
const MAX_TILES = 4096;
const MAX_HISTORY = 24;
const MAX_STEP_DAYS = 30;
const EVENT_INTERVAL_DAYS = 140;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
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
        tiles: {},
        history: [],
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
            model.tiles[tileKey(x, y)] = { kind: stand.disturbance, age: 0 };
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
    return {
        kind: record.kind,
        age: Math.max(0, Math.floor(number(record.age))),
        stage: stage.id,
        label: stage.label,
        recovered: stage.id === "recovered",
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

function chooseKind(model, day) {
    const season = Math.floor(number(state.seasonIndex, 0)) % 4;
    const roll = unitHash(model.seed, model.events + 1, day, 0x4b494e44);
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
        const kind = chooseKind(model, model.day);
        const profile = forestSuccessionProfile(kind);
        if (!profile) continue;
        const before = Math.max(1, Math.floor(number(geo.forestStock[index], 1)));
        const after = Math.max(1, Math.min(before, Math.floor(before * profile.severity)));
        geo.forestStock[index] = after;
        model.tiles[key] = { kind, age: 0 };
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

    for (const record of Object.values(model.tiles)) {
        const profile = forestSuccessionProfile(record.kind);
        if (!profile) {
            delete model.tiles[key];
            continue;
        }
        // Keep a recovered record. Without it the renderer would fall back to
        // the seeded damage hash and the old burn scar/windthrow would reappear
        // forever. A later event may reuse this recovered slot.
        record.age = Math.min(profile.recoveredDays, Math.max(0, Math.floor(number(record.age))) + steps);
    }
    model.day = Math.max(0, Math.floor(number(model.day))) + steps;
    model.daysSinceEvent = Math.max(0, Math.floor(number(model.daysSinceEvent))) + steps;
    if (model.daysSinceEvent >= EVENT_INTERVAL_DAYS) {
        spawnDisturbance(model);
        model.daysSinceEvent = 0;
    }
    return model;
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
        };
    }
    return {
        version: VERSION,
        seed: Math.max(1, Math.floor(number(model.seed, state.worldSeed || 1))),
        day: Math.max(0, Math.floor(number(model.day))),
        events: Math.max(0, Math.floor(number(model.events))),
        lastEventDay: Math.max(0, Math.floor(number(model.lastEventDay))),
        daysSinceEvent: Math.max(0, Math.floor(number(model.daysSinceEvent))),
        tiles,
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
        };
    }
    state.forestSuccession = {
        version: VERSION,
        seed: Math.max(1, Math.floor(number(snapshot.seed, state.worldSeed || 1))),
        day: Math.max(0, Math.floor(number(snapshot.day))),
        events: Math.max(0, Math.floor(number(snapshot.events))),
        lastEventDay: Math.max(0, Math.floor(number(snapshot.lastEventDay))),
        daysSinceEvent: Math.max(0, Math.floor(number(snapshot.daysSinceEvent))),
        tiles,
        history: (Array.isArray(snapshot.history) ? snapshot.history : []).slice(-MAX_HISTORY),
    };
    return Object.keys(tiles).length;
}
