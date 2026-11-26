// Local content packs: a versioned, bounded JSON contract for player-authored
// scenarios and province labels. This is deliberately a data loader, not a
// plugin runtime: no code, URLs, DOM or game-state mutation is accepted. The
// same normalized pack feeds the start-screen scenario cards and the world
// map's province labels, so a pack has a visible consumer without creating a
// second scenario or world system.
import { createScenarioDefinition } from "../systems/scenario.js";
import { WORLD_REGION_IDS, regionIsKnown } from "../world/world-regions.js";

export const DATA_PACK_FORMAT = "kings-and-cards-data-pack";
export const DATA_PACK_VERSION = 1;
export const DATA_PACK_GAME_VERSION = "3.72.0";
export const DATA_PACK_KEY = "kings-and-cards:data-packs:v1";
export const DATA_PACK_LIMIT = 3;
export const DATA_PACK_SCENARIO_LIMIT = 6;
export const DATA_PACK_SCENARIO_TOTAL_LIMIT = 12;
export const DATA_PACK_REGION_LIMIT = WORLD_REGION_IDS.length;
export const DATA_PACK_MAX_BYTES = 96_000;
export const DATA_PACK_NAME_LIMIT = 48;
export const DATA_PACK_DESCRIPTION_LIMIT = 240;

const SEMVER = /^\d+\.\d+\.\d+$/;
const PACK_ID = /^[a-z0-9][a-z0-9-]{2,31}$/;
const SCENARIO_ID = /^[a-z0-9][a-z0-9-]{2,63}$/;
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor", "script", "code", "eval", "function", "html", "src"]);
const PACK_KEYS = new Set(["format", "formatVersion", "id", "name", "author", "version", "gameVersion", "description", "scenarios", "regions"]);
const SCENARIO_KEYS = new Set([
    "id", "name", "description", "difficulty", "recommendedClimate", "startDay",
    "resources", "morale", "legitimacy", "objective", "reward", "failure",
    // Written back by createScenarioDefinition when a normalized pack is
    // stored. They are derived values, never executable content.
    "version", "startSeason"
]);
const OBJECTIVE_KEYS = new Set(["type", "target", "deadlineYear", "deadlineDay"]);
const STORE_KEYS = new Set(["wood", "stone", "gold", "food"]);
const EFFECT_KEYS = new Set(["wood", "stone", "gold", "food", "morale", "legitimacy"]);
const REGION_KEYS = new Set(["id", "name"]);

function rejectUnknownKeys(source, allowed, path) {
    for (const key of Object.keys(source)) {
        if (!allowed.has(key)) throw new Error(path + " contains the unknown field '" + key + "'.");
    }
}

function storageOrNull(storage) {
    if (storage) return storage;
    try {
        return globalThis.localStorage || null;
    } catch {
        return null;
    }
}

function readEnvelope(storage) {
    try {
        const raw = storage?.getItem(DATA_PACK_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function writeEnvelope(storage, packs) {
    if (!storage) return null;
    const envelope = { version: DATA_PACK_VERSION, packs };
    try {
        storage.setItem(DATA_PACK_KEY, JSON.stringify(envelope));
        return envelope;
    } catch {
        return null;
    }
}

function safeText(value, field, { min = 0, max = 80, allowEmpty = true } = {}) {
    if (typeof value !== "string") throw new Error(field + " must be text.");
    if (/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
        throw new Error(field + " contains markup or control characters.");
    }
    const clean = value.replace(/\s+/g, " ").trim();
    if (!allowEmpty && !clean) throw new Error(field + " is required.");
    if (clean.length < min || clean.length > max) {
        throw new Error(field + " must be " + (min ? "at least " + min + " and " : "") + "at most " + max + " characters.");
    }
    return clean;
}

function safeVersion(value, field) {
    if (typeof value !== "string" || !SEMVER.test(value)) throw new Error(field + " must be a semantic version such as 1.0.0.");
    return value;
}

function versionParts(value) {
    return value.split(".").map(part => Number(part));
}

function safeJsonValue(value, path, depth = 0) {
    if (depth > 8) throw new Error(path + " is nested too deeply.");
    if (value === null || typeof value === "boolean" || typeof value === "number") {
        if (typeof value === "number" && !Number.isFinite(value)) throw new Error(path + " contains a non-finite number.");
        return;
    }
    if (typeof value === "string") {
        if (value.length > 4000) throw new Error(path + " contains an oversized text value.");
        if (/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
            throw new Error(path + " contains markup or control characters.");
        }
        return;
    }
    if (Array.isArray(value)) {
        if (value.length > 40) throw new Error(path + " contains too many entries.");
        value.forEach((entry, index) => safeJsonValue(entry, path + "[" + index + "]", depth + 1));
        return;
    }
    if (typeof value === "object") {
        for (const [key, entry] of Object.entries(value)) {
            if (FORBIDDEN_KEYS.has(key)) throw new Error(path + " contains the forbidden key '" + key + "'.");
            safeJsonValue(entry, path + "." + key, depth + 1);
        }
        return;
    }
    throw new Error(path + " contains a non-data value.");
}

function normalizeScenarioScenario(raw, packId, index) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("scenario " + (index + 1) + " must be an object.");
    safeJsonValue(raw, "scenarios[" + index + "]");
    const path = "scenario " + (index + 1);
    rejectUnknownKeys(raw, SCENARIO_KEYS, path);
    for (const [field, allowed] of [["resources", STORE_KEYS], ["objective", OBJECTIVE_KEYS], ["reward", EFFECT_KEYS], ["failure", EFFECT_KEYS]]) {
        if (raw[field] === undefined) continue;
        if (!raw[field] || typeof raw[field] !== "object" || Array.isArray(raw[field])) {
            throw new Error(path + " " + field + " must be an object.");
        }
        rejectUnknownKeys(raw[field], allowed, path + " " + field);
    }
    const rawId = safeText(raw.id, "scenario " + (index + 1) + " id", { min: 3, max: 48, allowEmpty: false });
    if (!SCENARIO_ID.test(rawId)) throw new Error("scenario " + (index + 1) + " id must use lowercase letters, numbers and single hyphens.");
    const prefix = packId + "-";
    const base = rawId.startsWith(prefix) ? rawId.slice(prefix.length) : rawId;
    const id = (prefix + base).slice(0, 64);
    if (!SCENARIO_ID.test(id)) throw new Error("scenario " + (index + 1) + " id is invalid after namespacing.");
    try {
        return createScenarioDefinition({ ...raw, id });
    } catch (error) {
        throw new Error("scenario " + (index + 1) + ": " + (error?.message || "invalid scenario definition"));
    }
}

function normalizeRegionOverride(raw, index) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("region " + (index + 1) + " must be an object.");
    rejectUnknownKeys(raw, REGION_KEYS, "region " + (index + 1));
    const id = safeText(raw.id, "region " + (index + 1) + " id", { min: 3, max: 40, allowEmpty: false });
    if (!regionIsKnown(id)) throw new Error("region " + (index + 1) + " uses an unknown province id.");
    const name = safeText(raw.name, "region " + (index + 1) + " name", { min: 2, max: 48, allowEmpty: false });
    return { id, name };
}

export function validateDataPack(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("A data pack must be a JSON object.");
    for (const key of Object.keys(input)) {
        if (!PACK_KEYS.has(key)) throw new Error("Unknown data-pack field '" + key + "'.");
    }
    if (input.format !== DATA_PACK_FORMAT) throw new Error("This is not a Kings & Cards data pack.");
    if (Number(input.formatVersion) !== DATA_PACK_VERSION) throw new Error("Unsupported data-pack format version.");
    const id = safeText(input.id, "pack id", { min: 3, max: 32, allowEmpty: false });
    if (!PACK_ID.test(id)) throw new Error("Pack id must use lowercase letters, numbers and single hyphens.");
    const name = safeText(input.name, "pack name", { min: 3, max: DATA_PACK_NAME_LIMIT, allowEmpty: false });
    const author = safeText(input.author ?? "Anonymous keeper", "pack author", { min: 1, max: DATA_PACK_NAME_LIMIT, allowEmpty: false });
    const version = safeVersion(input.version, "pack version");
    const gameVersion = safeVersion(input.gameVersion, "game version");
    const current = versionParts(DATA_PACK_GAME_VERSION);
    const declared = versionParts(gameVersion);
    if (declared[0] !== 3) throw new Error("This pack targets a different major game version.");
    if (declared[0] > current[0] || (declared[0] === current[0] && declared[1] > current[1]) ||
        (declared[0] === current[0] && declared[1] === current[1] && declared[2] > current[2])) {
        throw new Error("This pack was written for a newer game version (" + gameVersion + ").");
    }
    const description = safeText(input.description ?? "", "pack description", { max: DATA_PACK_DESCRIPTION_LIMIT });
    const rawScenarios = input.scenarios === undefined ? [] : input.scenarios;
    const rawRegions = input.regions === undefined ? [] : input.regions;
    if (!Array.isArray(rawScenarios) || rawScenarios.length > DATA_PACK_SCENARIO_LIMIT) {
        throw new Error("A pack may contain at most " + DATA_PACK_SCENARIO_LIMIT + " scenarios.");
    }
    if (!Array.isArray(rawRegions) || rawRegions.length > DATA_PACK_REGION_LIMIT) {
        throw new Error("A pack may contain at most " + DATA_PACK_REGION_LIMIT + " province labels.");
    }
    if (!rawScenarios.length && !rawRegions.length) throw new Error("A pack must contain at least one scenario or province label.");
    const scenarios = rawScenarios.map((raw, index) => normalizeScenarioScenario(raw, id, index));
    const seenScenarios = new Set();
    for (const scenario of scenarios) {
        if (seenScenarios.has(scenario.id)) throw new Error("A pack cannot contain two scenarios with the same id.");
        seenScenarios.add(scenario.id);
    }
    const regions = rawRegions.map(normalizeRegionOverride);
    const seenRegions = new Set();
    for (const region of regions) {
        if (seenRegions.has(region.id)) throw new Error("A pack cannot rename the same province twice.");
        seenRegions.add(region.id);
    }
    return {
        format: DATA_PACK_FORMAT,
        formatVersion: DATA_PACK_VERSION,
        id,
        name,
        author,
        version,
        gameVersion,
        description,
        scenarios,
        regions
    };
}

export function parseDataPackText(text) {
    if (typeof text !== "string") throw new Error("The selected file is not text.");
    if (text.length > DATA_PACK_MAX_BYTES) throw new Error("The data pack is larger than " + Math.round(DATA_PACK_MAX_BYTES / 1024) + " KB.");
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new Error("The selected file is not valid JSON.");
    }
    return validateDataPack(parsed);
}

function packsFromStorage(storage = null) {
    const target = storageOrNull(storage);
    const envelope = readEnvelope(target);
    const rows = Array.isArray(envelope) ? envelope : Array.isArray(envelope?.packs) ? envelope.packs : [];
    const packs = [];
    for (const row of rows) {
        try {
            const pack = validateDataPack(row);
            if (packs.some(item => item.id === pack.id)) continue;
            packs.push(pack);
        } catch {
            // A corrupt pack is ignored; the rest of the library remains usable.
        }
        if (packs.length >= DATA_PACK_LIMIT) break;
    }
    return packs;
}

let activePacks = [];
let activePacksLoaded = false;

function activate(storage = null) {
    const target = storageOrNull(storage);
    if (!storage || target === storageOrNull(null)) activePacksLoaded = true;
    activePacks = packsFromStorage(target);
    return activePacks;
}

export function readDataPackLibrary(storage = null) {
    if (!storage) return activate(null);
    return packsFromStorage(storage);
}

export function ensureDataPacksLoaded() {
    if (!activePacksLoaded) activate(null);
    return activePacks;
}

export function installDataPack(input, storage = null) {
    try {
        const pack = validateDataPack(input);
        const target = storageOrNull(storage);
        const current = packsFromStorage(target);
        const existing = current.findIndex(item => item.id === pack.id);
        const next = existing >= 0
            ? current.map(item => item.id === pack.id ? pack : item)
            : [...current, pack];
        if (next.length > DATA_PACK_LIMIT) {
            return { ok: false, error: "At most " + DATA_PACK_LIMIT + " data packs can be installed.", packs: current };
        }
        if (next.reduce((sum, item) => sum + item.scenarios.length, 0) > DATA_PACK_SCENARIO_TOTAL_LIMIT) {
            return { ok: false, error: "Installed packs may add at most " + DATA_PACK_SCENARIO_TOTAL_LIMIT + " scenarios.", packs: current };
        }
        const envelope = writeEnvelope(target, next);
        if (!envelope) return { ok: false, error: "This browser could not store the data pack.", packs: current };
        if (!storage) {
            activePacks = next;
            activePacksLoaded = true;
        }
        return { ok: true, pack, packs: next };
    } catch (error) {
        return { ok: false, error: String(error?.message || "The data pack could not be read."), packs: packsFromStorage(storage) };
    }
}

export function removeDataPack(id, storage = null) {
    const target = storageOrNull(storage);
    const next = packsFromStorage(target).filter(pack => pack.id !== String(id || ""));
    writeEnvelope(target, next);
    if (!storage) {
        activePacks = next;
        activePacksLoaded = true;
    }
    return next;
}

export function getDataPackScenarios(storage = null) {
    const packs = storage ? packsFromStorage(storage) : ensureDataPacksLoaded();
    return packs.flatMap(pack => pack.scenarios.map(scenario => ({
        ...scenario,
        packId: pack.id,
        packName: pack.name
    })));
}

export function getDataPackRegionLabel(regionId, storage = null) {
    const packs = storage ? packsFromStorage(storage) : ensureDataPacksLoaded();
    for (const pack of packs) {
        const override = pack.regions.find(region => region.id === String(regionId || ""));
        if (override) return override.name;
    }
    return null;
}

export function getDataPackScenarioLabel(scenarioId, storage = null) {
    const id = String(scenarioId || "");
    const packs = storage ? packsFromStorage(storage) : ensureDataPacksLoaded();
    for (const pack of packs) {
        if (pack.scenarios.some(scenario => scenario.id === id)) return pack.name;
    }
    return null;
}

export function getDataPackSummary(storage = null) {
    const packs = storage ? packsFromStorage(storage) : ensureDataPacksLoaded();
    return packs.map(pack => ({
        id: pack.id,
        name: pack.name,
        author: pack.author,
        version: pack.version,
        scenarios: pack.scenarios.length,
        regions: pack.regions.length
    }));
}
