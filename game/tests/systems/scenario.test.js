import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import {
    SCENARIO_PRESETS, SCENARIO_PRESET_LIST, SCENARIO_VERSION,
    applyScenarioStart, createCustomScenario, createScenarioState, getScenarioSnapshot,
    normalizeScenarioState, refreshScenarioProgress, updateScenario, validateScenarioState
} from "../../js/systems/scenario.js";
import { SAVE_SCHEMA_MIGRATIONS } from "../../js/core/save-migrations.js";
import { SAVE_SCHEMA_VERSION } from "../../js/core/save-validation.js";
import { addScenarioToLibrary, readScenarioLibrary, SCENARIO_LIBRARY_LIMIT, SCENARIO_LIBRARY_KEY } from "../../js/core/scenario-library.js";
import { createLegacyState } from "../../js/systems/legacy.js";

function fakeStorage() {
    const values = new Map();
    return {
        getItem(key) { return values.has(key) ? values.get(key) : null; },
        setItem(key, value) { values.set(key, String(value)); },
        removeItem(key) { values.delete(key); },
        dump() { return values; }
    };
}

function customDefinition(overrides = {}) {
    return createCustomScenario({
        id: "custom-test-scenario",
        name: "Test Opening",
        description: "A deterministic opening used by the scenario regression.",
        recommendedClimate: "temperate",
        startDay: 0,
        resources: { food: 40, wood: 40, stone: 40, gold: 40 },
        morale: 50,
        legitimacy: 40,
        objective: { type: "food", target: 100, deadlineYear: 2, deadlineDay: 0 },
        reward: { food: 10, morale: 2 },
        failure: { morale: -5 },
        ...overrides
    });
}

test("the scenario catalog carries distinct authored start conditions", () => {
    assert.equal(SCENARIO_PRESET_LIST.length, 5);
    assert.equal(SCENARIO_PRESETS["free-realm"].objective, null);
    assert.equal(SCENARIO_PRESETS["first-winter"].startSeason, 2);
    assert.equal(SCENARIO_PRESETS["first-winter"].objective.type, "food");
    assert.equal(SCENARIO_PRESETS["empty-granary"].objective.deadlineYear, 1);
    assert.equal(SCENARIO_PRESETS["broken-crown"].objective.type, "legitimacy");
    assert.equal(SCENARIO_PRESETS["green-frontier"].objective.type, "regions");
    assert.ok(SCENARIO_PRESETS["first-winter"].resources.food < SCENARIO_PRESETS["green-frontier"].resources.food);
    assert.equal(new Set(SCENARIO_PRESET_LIST.map(entry => entry.id)).size, SCENARIO_PRESET_LIST.length);
});

test("custom scenarios are bounded and reject a deadline before the opening", () => {
    const definition = customDefinition();
    assert.equal(definition.difficulty, "CUSTOM");
    assert.equal(definition.objective.target, 100);
    assert.throws(() => createCustomScenario({
        id: "custom-invalid-deadline",
        name: "Too Late",
        description: "A deadline that cannot be reached.",
        startDay: 380,
        objective: { type: "food", target: 10, deadlineYear: 1, deadlineDay: 299 }
    }), /deadline/i);
    const clamped = createCustomScenario({
        id: "custom-clamped",
        name: "Clamped",
        description: "Out-of-range values are normalized.",
        startDay: 120,
        resources: { food: -5, wood: 99999 },
        morale: 140,
        legitimacy: -4,
        objective: { type: "legitimacy", target: 1000, deadlineYear: 2, deadlineDay: 0 }
    });
    assert.equal(clamped.resources.food, 0);
    assert.equal(clamped.resources.wood, 9999);
    assert.equal(clamped.morale, 100);
    assert.equal(clamped.legitimacy, 0);
    assert.equal(clamped.objective.target, 100);
});

test("the free realm starts without an authored objective", () => {
    resetState();
    state.legacy = createLegacyState({ foundedYear: 1 });
    const scenario = applyScenarioStart(SCENARIO_PRESETS["free-realm"]);
    assert.equal(scenario.id, "free-realm");
    assert.equal(scenario.status, "free");
    assert.equal(scenario.objective, null);
    assert.equal(state.scenario, scenario);
    assert.equal(getScenarioSnapshot().visible, false);
    assert.deepEqual(state.resources, { wood: 180, stone: 95, gold: 75, food: 120 });
});

test("a scenario changes date, stores, morale and legitimacy through the real start path", () => {
    resetState();
    state.legacy = createLegacyState({ foundedYear: 1 });
    const scenario = applyScenarioStart(SCENARIO_PRESETS["first-winter"]);
    assert.equal(state.year, 1);
    assert.equal(state.dayOfYear, 200);
    assert.equal(state.seasonIndex, 2);
    assert.deepEqual(state.resources, { wood: 130, stone: 75, gold: 70, food: 70 });
    assert.equal(state.morale, 60);
    assert.equal(state.politics.legitimacy, 52);
    assert.equal(scenario.id, "first-winter");
    assert.equal(state.scenario.status, "active");
    assert.equal(state.scenario.objective.target, 150);
    assert.match(state.eventLog[0]?.text || "", /SCENARIO — The First Winter/);
    refreshScenarioProgress();
    assert.equal(state.scenario.current, 70);
    assert.equal(state.scenario.progress, 70 / 150);
    const snapshot = getScenarioSnapshot();
    assert.equal(snapshot.visible, true);
    assert.equal(snapshot.startLabel, "Autumn · Year 1");
    assert.equal(snapshot.progressLabel, "70 / 150 food");
});

test("an objective is completed once, rewards the live economy and never pays twice", () => {
    resetState();
    state.legacy = createLegacyState({ foundedYear: 1 });
    state.resources.food = 120;
    state.morale = 55;
    state.scenario = createScenarioState(customDefinition(), { year: 1, day: 20 });
    state.year = 1;
    state.dayOfYear = 20;
    const before = state.resources.food;
    assert.equal(updateScenario(), true);
    assert.equal(state.scenario.status, "won");
    assert.equal(state.scenario.current, 120);
    assert.equal(state.resources.food, before + 10);
    assert.equal(state.morale, 57);
    assert.equal(state.scenario.history.length, 1);
    assert.match(state.scenario.history[0].text, /Objective met/);
    const after = state.resources.food;
    assert.equal(updateScenario(), false);
    assert.equal(state.resources.food, after, "a completed scenario must not pay again");
    assert.equal(validateScenarioState(state.scenario), true);
});

test("a custom scenario name is escaped before it reaches a presentation message", () => {
    resetState();
    state.legacy = createLegacyState({ foundedYear: 1 });
    state.resources.food = 120;
    state.scenario = createScenarioState(customDefinition({
        name: '<img src=x onerror="alert(1)">'
    }), { year: 1, day: 20 });
    state.year = 1;
    state.dayOfYear = 20;
    assert.equal(updateScenario(), true);
    const messages = (state.pendingPresentationEffects || []).filter(effect => effect.type === "message");
    assert.ok(messages.length > 0, "completion must queue a presentation message");
    const subtitle = messages[messages.length - 1].subtitle;
    assert.equal(subtitle.includes("<img"), false, "raw markup must not reach the message");
    assert.ok(subtitle.includes("&lt;IMG"), "the name must be HTML-escaped");
    assert.ok(subtitle.includes("&quot;"), "quotes must be HTML-escaped");
});

test("a missed deadline applies its consequence once and records the failure", () => {
    resetState();
    state.legacy = createLegacyState({ foundedYear: 1 });
    state.resources.food = 10;
    state.morale = 50;
    state.scenario = createScenarioState(customDefinition({
        objective: { type: "food", target: 500, deadlineYear: 1, deadlineDay: 150 }
    }), { year: 1, day: 0 });
    state.year = 1;
    state.dayOfYear = 150;
    assert.equal(updateScenario(), true);
    assert.equal(state.scenario.status, "failed");
    assert.equal(state.morale, 45);
    assert.equal(state.scenario.history.length, 1);
    assert.match(state.scenario.history[0].text, /missed/);
    assert.equal(updateScenario(), false);
    assert.equal(state.morale, 45);
});

test("old saves migrate to free realm and scenario state survives normalization", () => {
    assert.equal(SAVE_SCHEMA_VERSION, 15);
    assert.equal(SCENARIO_VERSION, 1);
    const legacy = { saveSchemaVersion: 13 };
    SAVE_SCHEMA_MIGRATIONS[13](legacy);
    assert.equal(legacy.scenario, null);
    const free = normalizeScenarioState(legacy.scenario);
    assert.equal(free.id, "free-realm");
    assert.equal(free.status, "free");
    assert.equal(free.objective, null);
    const active = normalizeScenarioState(createScenarioState(customDefinition(), { year: 1, day: 20 }));
    assert.equal(active.id, "custom-test-scenario");
    assert.equal(active.objective.target, 100);
    assert.equal(validateScenarioState(active), true);
});

test("the custom scenario library validates entries, replaces ids and caps its size", () => {
    const storage = fakeStorage();
    let list = [];
    for (let index = 0; index < SCENARIO_LIBRARY_LIMIT + 2; index++) {
        const definition = customDefinition({
            id: "custom-library-" + index,
            name: "Library " + index,
            description: "A bounded custom scenario."
        });
        list = addScenarioToLibrary(list, definition, storage);
    }
    assert.equal(list.length, SCENARIO_LIBRARY_LIMIT);
    assert.equal(list[0].id, "custom-library-" + (SCENARIO_LIBRARY_LIMIT + 1));
    const envelope = JSON.parse(storage.getItem(SCENARIO_LIBRARY_KEY));
    assert.equal(envelope.version, 1);
    assert.equal(envelope.scenarios.length, SCENARIO_LIBRARY_LIMIT);
    const read = readScenarioLibrary(storage);
    assert.deepEqual(read.map(entry => entry.id), list.map(entry => entry.id));
    envelope.scenarios.push({ id: "not-valid", name: "", description: "" });
    storage.setItem(SCENARIO_LIBRARY_KEY, JSON.stringify(envelope));
    assert.equal(readScenarioLibrary(storage).length, SCENARIO_LIBRARY_LIMIT);
});
