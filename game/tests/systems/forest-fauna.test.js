import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { generateResourceGeography } from "../../js/systems/resource-geography.js";
import {
    ensureForestFauna, forestFaunaAt, forestFaunaSummaryAt, resetForestFauna,
    restoreForestFauna, serializeForestFauna, updateForestFauna,
    validateForestFaunaSnapshot, FOREST_FAUNA_LIMITS,
} from "../../js/systems/forest-fauna.js";

function setup(seed = 20261108) {
    resetState();
    resetForestFauna();
    state.worldSeed = seed;
    state.worldW = 48;
    state.worldH = 48;
    state.terrainResolution = 2;
    state.terrainPixW = 96;
    state.terrainPixH = 96;
    state.worldOptions = { landmass: 50, ruggedness: 55, forests: 52, water: 48, climate: "temperate" };
    state.heightMap = new Float32Array(96 * 96).fill(0.7);
    state.moistureMap = new Float32Array(96 * 96).fill(0.8);
    state.temperatureMap = new Float32Array(96 * 96).fill(0.55);
    generateResourceGeography(seed);
    return ensureForestFauna();
}

test("forest fauna seeds stable herds on real forest tiles", () => {
    const model = setup();
    assert.ok(model, "a generated forest should produce a fauna model");
    assert.ok(model.herds.length > 0);
    assert.ok(model.herds.length <= FOREST_FAUNA_LIMITS.maxHerds);
    for (const herd of model.herds) {
        assert.ok(herd.id);
        assert.ok(herd.population >= 0);
        assert.ok(herd.capacity >= 1);
        assert.ok(herd.x >= 0 && herd.y >= 0 && herd.x < state.worldW && herd.y < state.worldH);
    }
    const firstSnapshot = JSON.stringify(serializeForestFauna());
    const again = setup();
    assert.equal(JSON.stringify(serializeForestFauna()), firstSnapshot);
    assert.ok(again.herds.length > 0);
});

test("herds grow, decline, move and stay within bounded populations", () => {
    const model = setup();
    const before = model.herds.map(herd => [herd.id, herd.x, herd.y, herd.population]);
    updateForestFauna(24);
    assert.equal(model.herds.length <= FOREST_FAUNA_LIMITS.maxHerds, true);
    assert.ok(model.herds.length > 0);
    assert.ok(model.herds.some(herd => herd.population !== before.find(entry => entry[0] === herd.id)?.[3]) || model.stats.births > 0);
    assert.ok(model.herds.every(herd => herd.population <= Math.max(1, herd.capacity) * 1.35 + 0.11));
    assert.ok(model.stats.migrations >= 0 && model.stats.splits >= 0);
    assert.ok(model.history.length <= 32);
});

test("forest fauna serializes and restores deterministic herd state", () => {
    const model = setup();
    updateForestFauna(8);
    const snapshot = serializeForestFauna();
    assert.ok(snapshot);
    assert.equal(validateForestFaunaSnapshot(snapshot), true);
    assert.ok(snapshot.herds.length > 0);
    resetForestFauna();
    const restored = restoreForestFauna(snapshot);
    assert.equal(restored, snapshot.herds.length);
    assert.equal(serializeForestFauna().herds.length, snapshot.herds.length);
    assert.equal(forestFaunaAt(snapshot.herds[0].x, snapshot.herds[0].y).length > 0, true);
    assert.match(forestFaunaSummaryAt(snapshot.herds[0].x, snapshot.herds[0].y), /[A-Za-z]/);
    assert.throws(() => validateForestFaunaSnapshot({ version: 1, day: 0, herds: [{ species: "unknown" }] }), /herd entry/);
    assert.throws(() => validateForestFaunaSnapshot({ version: 99, day: 0, herds: [] }), /forest-fauna state/);
    assert.equal(restoreForestFauna(null), 0);
    assert.equal(state.forestFauna, null);
});
