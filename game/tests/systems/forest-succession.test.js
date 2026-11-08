import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import {
    ensureForestSuccession, forestSuccessionAt, resetForestSuccession,
    restoreForestSuccession, serializeForestSuccession, suppressForestDisturbance,
    suppressNearestForestDisturbance, updateForestSuccession,
    validateForestSuccessionSnapshot,
} from "../../js/systems/forest-succession.js";
import {
    forestStandAt, forestSuccessionStage, FOREST_SUCCESSION_PROFILES,
} from "../../js/world/forest-ecology.js";
import { generateResourceGeography, getResourceNodeAt } from "../../js/systems/resource-geography.js";

function setup(seed = 20261108) {
    resetState();
    resetForestSuccession();
    state.worldSeed = seed;
    state.worldW = 64;
    state.worldH = 64;
    state.terrainResolution = 2;
    state.terrainPixW = 128;
    state.terrainPixH = 128;
    state.worldOptions = { landmass: 50, ruggedness: 55, forests: 70, water: 48, climate: "temperate" };
    state.heightMap = new Float32Array(128 * 128).fill(0.62);
    state.moistureMap = new Float32Array(128 * 128).fill(0.68);
    state.temperatureMap = new Float32Array(128 * 128).fill(0.55);
    generateResourceGeography(seed);
    return ensureForestSuccession();
}

function firstRecord(model) {
    const [key, record] = Object.entries(model?.tiles || {})[0] || [];
    assert.ok(key && record, "the test realm must contain at least one disturbance");
    return { key, record };
}

function standContext(overrides = {}) {
    return {
        seed: 20261108, moisture: 0.68, temperature: 0.55, height: 0.62,
        climate: "temperate", forests: 70, stockRatio: 1, rockLine: 0.92,
        ...overrides,
    };
}

test("stage thresholds preserve fresh, regrowth, young and recovered states", () => {
    assert.equal(forestSuccessionStage("burned", 0).id, "fresh");
    assert.equal(forestSuccessionStage("burned", 80).id, "regrowth");
    assert.equal(forestSuccessionStage("burned", 180).id, "young");
    assert.equal(forestSuccessionStage("burned", 360).id, "recovering");
    assert.equal(forestSuccessionStage("burned", 520).id, "recovered");
    assert.equal(forestSuccessionStage("windthrow", 60).id, "regrowth");
    assert.equal(forestSuccessionStage("diseased", 100).id, "regrowth");
    assert.equal(forestSuccessionStage("unknown", 2), null);
    assert.ok(FOREST_SUCCESSION_PROFILES.burned.recoveredDays > FOREST_SUCCESSION_PROFILES.burned.youngDays);
});

test("a seeded world exposes initial disturbances and a live succession lookup", () => {
    const model = setup();
    assert.ok(model);
    const { key, record } = firstRecord(model);
    assert.equal(record.age, 0);
    const [x, y] = key.split(":").map(Number);
    const lookup = forestSuccessionAt(x, y);
    assert.ok(lookup);
    assert.equal(lookup.stage, "fresh");
    assert.match(lookup.label, /Burn|Wind|Disease/);
    const node = getResourceNodeAt(x, y);
    assert.equal(node.forestSuccession.kind, record.kind);
    assert.equal(node.forestDisturbance, record.kind);
    assert.equal(node.forestSuccessionStage, "fresh");
});

test("stand generation overrides the seeded formation and returns to the original wood", () => {
    const fresh = forestStandAt(23.5, 17.5, standContext({
        succession: { kind: "burned", age: 10 },
    }));
    assert.equal(fresh.forest, true);
    assert.equal(fresh.disturbance, "burned");
    assert.equal(fresh.succession.stage, "fresh");
    assert.match(fresh.label, /Burn/);

    const regrowth = forestStandAt(23.5, 17.5, standContext({
        succession: { kind: "burned", age: 120 },
    }));
    assert.equal(regrowth.type, "regenerating");
    assert.equal(regrowth.disturbance, "burned");
    assert.equal(regrowth.succession.stage, "regrowth");
    assert.equal(regrowth.ageClass, "young");

    const recovered = forestStandAt(23.5, 17.5, standContext({
        succession: { kind: "burned", age: 520 },
    }));
    assert.equal(recovered.succession.stage, "recovered");
    assert.equal(recovered.succession.label, null);
    assert.equal(recovered.disturbance, null);
    assert.ok(!["burned", "windthrow", "diseased", "regenerating", "cutover"].includes(recovered.type));
});

test("elapsed days advance one disturbance into regrowth and a durable recovery", () => {
    const model = setup();
    const { key, record } = firstRecord(model);
    const profile = FOREST_SUCCESSION_PROFILES[record.kind];
    for (let i = 0; i < 10 && state.forestSuccession.tiles[key]?.age < profile.freshDays + 1; i++) {
        updateForestSuccession(30);
    }
    const advanced = forestSuccessionAt(...key.split(":").map(Number));
    assert.ok(advanced);
    assert.equal(advanced.stage, "regrowth");
    for (let i = 0; i < 30 && state.forestSuccession.tiles[key]?.age < profile.recoveredDays; i++) {
        updateForestSuccession(30);
    }
    const recovered = forestSuccessionAt(...key.split(":").map(Number));
    assert.ok(recovered);
    assert.equal(recovered.stage, "recovered");
    assert.equal(recovered.recovered, true);
    assert.equal(recovered.label, null);
    assert.equal(state.forestSuccession.tiles[key].age, profile.recoveredDays);
    const [x, y] = key.split(":").map(Number);
    const node = getResourceNodeAt(x, y);
    assert.equal(node.forestSuccessionStage, "recovered");
    assert.equal(node.forestDisturbance, null);
});

test("a new event lowers real stock and is recorded in bounded history", () => {
    const model = setup();
    for (let i = 0; i < 6 && !model.history.length; i++) updateForestSuccession(30);
    assert.equal(model.history.length, 1);
    const event = model.history[0];
    assert.ok(event.stockAfter < event.stockBefore);
    assert.equal(state.resourceGeography.forestStock[event.y * state.worldW + event.x], event.stockAfter);
    assert.ok(model.events >= 1);
});

test("fire, storm and disease spread to neighbouring stands and stay bounded", () => {
    const model = setup();
    for (let i = 0; i < 50; i++) updateForestSuccession(12);
    assert.ok(model.spreadings > 0, "a long campaign should spread at least one disturbance");
    assert.ok(model.spreadHistory.length > 0);
    assert.ok(model.spreadHistory.length <= 24);
    for (const entry of model.spreadHistory) {
        assert.ok(["burned", "windthrow", "diseased"].includes(entry.kind));
        assert.notEqual(entry.to.join(":"), entry.from.join(":"));
        assert.ok(entry.stockAfter < entry.stockBefore);
        assert.equal(Math.max(Math.abs(entry.to[0] - entry.from[0]), Math.abs(entry.to[1] - entry.from[1])), 1);
    }
});

test("a control party contains a disturbance and costs real resources", () => {
    const model = setup();
    state.resources.wood = 100;
    state.resources.food = 100;
    state.resources.gold = 100;
    const key = Object.keys(model.tiles).find(key => {
        const [x, y] = key.split(":").map(Number);
        return forestSuccessionAt(x, y)?.stage === "fresh";
    });
    assert.ok(key);
    const [x, y] = key.split(":").map(Number);
    const record = model.tiles[key];
    const costs = record.kind === "burned" ? { food: 6, wood: 4 }
        : record.kind === "windthrow" ? { wood: 8 } : { gold: 6 };
    const result = suppressForestDisturbance(x, y);
    assert.equal(result.ok, true);
    assert.equal(result.containedUntil, model.day + 90);
    assert.deepEqual(result.cost, costs);
    assert.equal(forestSuccessionAt(x, y).contained, true);
    for (const [resource, amount] of Object.entries(costs)) {
        assert.equal(state.resources[resource], 100 - amount);
    }
    assert.equal(model.suppressed, 1);
    for (let i = 0; i < 3; i++) updateForestSuccession(30);
    assert.equal(forestSuccessionAt(x, y)?.contained, false);
});

test("control fails without resources and can find the nearest disturbance", () => {
    const model = setup();
    state.resources.wood = 0;
    state.resources.food = 0;
    state.resources.gold = 0;
    const [x, y] = Object.keys(model.tiles)[0].split(":").map(Number);
    const denied = suppressForestDisturbance(x, y);
    assert.equal(denied.ok, false);
    assert.match(denied.reason, /Not enough/);
    assert.equal(suppressNearestForestDisturbance(-50, -50, 4).ok, false);
    state.resources.wood = 100;
    state.resources.food = 100;
    state.resources.gold = 100;
    const nearest = suppressNearestForestDisturbance(x, y, 8);
    assert.equal(nearest.ok, true);
    assert.ok(Math.abs(nearest.x - x) + Math.abs(nearest.y - y) <= 8);
});

test("spread and control state survives a save and an older snapshot", () => {
    const model = setup();
    for (let i = 0; i < 12; i++) updateForestSuccession(30);
    state.resources.wood = 100;
    state.resources.food = 100;
    state.resources.gold = 100;
    const key = Object.keys(model.tiles).find(key => {
        const [x, y] = key.split(":").map(Number);
        const entry = forestSuccessionAt(x, y);
        return entry && !entry.recovered;
    });
    assert.ok(key);
    assert.equal(suppressForestDisturbance(...key.split(":").map(Number)).ok, true);
    const snapshot = serializeForestSuccession();
    assert.ok(snapshot.spreadHistory.length > 0);
    assert.ok(snapshot.tiles[key].containedUntil > 0);
    resetForestSuccession();
    restoreForestSuccession(snapshot);
    assert.equal(state.forestSuccession.spreadings, snapshot.spreadings);
    assert.equal(state.forestSuccession.spreadHistory.length, snapshot.spreadHistory.length);
    assert.equal(state.forestSuccession.tiles[key].containedUntil, snapshot.tiles[key].containedUntil);

    const legacy = {
        version: 1, seed: 7, day: 0, events: 0, lastEventDay: 0, daysSinceEvent: 0,
        tiles: { "4:4": { kind: "burned", age: 0 } }, history: [],
    };
    resetForestSuccession();
    assert.equal(restoreForestSuccession(legacy), 1);
    updateForestSuccession(12);
    assert.ok(Array.isArray(state.forestSuccession.spreadHistory));
});

test("succession saves validate and restore without inventing tiles", () => {
    const model = setup();
    const snapshot = serializeForestSuccession();
    assert.ok(snapshot);
    assert.equal(validateForestSuccessionSnapshot(snapshot), true);
    const count = Object.keys(snapshot.tiles).length;
    resetForestSuccession();
    assert.equal(restoreForestSuccession(snapshot), count);
    assert.equal(Object.keys(state.forestSuccession.tiles).length, count);
    assert.throws(() => validateForestSuccessionSnapshot({ version: 1, seed: 1, tiles: { "1:1": { kind: "unknown", age: 0 } } }), /tile/);
    assert.throws(() => validateForestSuccessionSnapshot({ version: 1, seed: 1, tiles: [], history: [] }), /tile map/);
});
