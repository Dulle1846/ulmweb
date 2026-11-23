// Custom scenarios are authored locally, so they live beside the local profile
// rather than in a server account. The envelope is versioned and every entry is
// normalized again on read; a malformed entry can never reach world generation.
import { createScenarioDefinition, normalizeScenarioState, validateScenarioDefinition } from "../systems/scenario.js";

export const SCENARIO_LIBRARY_KEY = "kings-and-cards:scenarios:v1";
export const SCENARIO_LIBRARY_VERSION = 1;
export const SCENARIO_LIBRARY_LIMIT = 6;

function storageOrNull(storage) {
    if (storage) return storage;
    try {
        return globalThis.localStorage || null;
    } catch {
        return null;
    }
}

function readJson(storage) {
    try {
        const raw = storage?.getItem(SCENARIO_LIBRARY_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export function readScenarioLibrary(storage = null) {
    const target = storageOrNull(storage);
    const envelope = readJson(target);
    const rows = Array.isArray(envelope) ? envelope : Array.isArray(envelope?.scenarios) ? envelope.scenarios : [];
    const scenarios = [];
    for (const row of rows) {
        try {
            const definition = createScenarioDefinition(row);
            validateScenarioDefinition(definition);
            if (definition.id === "free-realm") continue;
            if (scenarios.some(item => item.id === definition.id)) continue;
            scenarios.push(definition);
        } catch {
            // A broken custom entry is ignored; the next save replaces it.
        }
        if (scenarios.length >= SCENARIO_LIBRARY_LIMIT) break;
    }
    return scenarios;
}

export function writeScenarioLibrary(scenarios, storage = null) {
    const target = storageOrNull(storage);
    if (!target) return null;
    const safe = [];
    for (const row of Array.isArray(scenarios) ? scenarios : []) {
        try {
            const definition = createScenarioDefinition(row);
            if (definition.id === "free-realm") continue;
            safe.push(definition);
        } catch {
            // Do not let one malformed row prevent the other custom scenarios
            // from being saved.
        }
        if (safe.length >= SCENARIO_LIBRARY_LIMIT) break;
    }
    const envelope = { version: SCENARIO_LIBRARY_VERSION, scenarios: safe };
    try {
        target.setItem(SCENARIO_LIBRARY_KEY, JSON.stringify(envelope));
        return envelope;
    } catch {
        return null;
    }
}

export function addScenarioToLibrary(scenarios, definition, storage = null) {
    let normalized;
    try {
        normalized = createScenarioDefinition(definition);
        validateScenarioDefinition(normalized);
    } catch {
        return readScenarioLibrary(storage);
    }
    const next = [
        normalized,
        ...(Array.isArray(scenarios) ? scenarios : []).filter(row => row?.id !== normalized.id)
    ].slice(0, SCENARIO_LIBRARY_LIMIT);
    writeScenarioLibrary(next, storage);
    return next;
}

export function removeScenarioFromLibrary(scenarios, id, storage = null) {
    const next = (Array.isArray(scenarios) ? scenarios : []).filter(row => row?.id !== id);
    writeScenarioLibrary(next, storage);
    return next;
}

// A save can contain a custom scenario authored in another session. Keeping
// this helper here makes the distinction between a definition and a live
// objective explicit for callers and tests.
export function scenarioSaveSummary(snapshot) {
    const scenario = normalizeScenarioState(snapshot);
    return {
        id: scenario.id,
        status: scenario.status,
        target: scenario.objective?.target || 0,
        current: scenario.current || 0
    };
}
