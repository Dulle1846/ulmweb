import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import {
    ensureForestSuccession, forestSuccessionAt, resetForestSuccession,
    restoreForestSuccession, serializeForestSuccession, updateForestSuccession,
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
