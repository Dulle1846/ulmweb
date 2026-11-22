// 1.2.20.91 — a long drought or volcanic age changes the actual world, not
// only the hazard roll. Zero drift is the exact shipped baseline.
import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { getMoistureAt, getTemperatureAt } from "../../js/world/world.js";
import { weatherWeights } from "../../js/world/weather.js";
import { createEnvironmentalHazardState, getHazardProfile } from "../../js/systems/environmental-hazards.js";

function prepare({ climate = "temperate", drift = 0 } = {}) {
    resetState();
    state.worldSeed = 20261122;
    state.worldW = 48;
    state.worldH = 48;
    state.terrainResolution = 1;
    state.terrainPixW = 48;
    state.terrainPixH = 48;
    state.heightMap = new Float32Array(48 * 48).fill(0.55);
    state.moistureMap = new Float32Array(48 * 48).fill(0.5);
    state.temperatureMap = new Float32Array(48 * 48).fill(0.5);
    state.worldOptions = { size: "standard", shape: "continent", climate };
    state.seasonIndex = 1;
    state.dayOfYear = 150;
    state.year = 12;
    state.weather = "clear";
    state.morale = 68;
    state.resources = { wood: 120, stone: 90, gold: 80, food: 180 };
    state.entities = [];
    state.roads = { version: 1, revision: 0, tiles: {} };
    state.health = { sanitation: { score: 40 }, outbreakActive: false };
    state.environmentalHazards = createEnvironmentalHazardState();
    state.environmentalHazards.chronic.climateDrift = drift;
    return state;
}

test("1.2.20.91 climate drift moves per-tile temperature and moisture", () => {
    prepare({ drift: 0 });
    const cold = getTemperatureAt(10, 10);
    const wet = getMoistureAt(10, 10);
    prepare({ drift: 20 });
    assert.ok(getTemperatureAt(10, 10) > cold);
    assert.ok(getMoistureAt(10, 10) < wet);
    prepare({ drift: -20 });
    assert.ok(getTemperatureAt(10, 10) < cold);
    assert.ok(getMoistureAt(10, 10) > wet);
});

test("1.2.20.91 climate drift tilts the real weather table", () => {
    const calm = weatherWeights(150, "temperate", 0);
    const warm = weatherWeights(150, "temperate", 1);
    const cold = weatherWeights(150, "temperate", -1);
    assert.ok(warm.clear > calm.clear);
    assert.ok(warm.rain < calm.rain);
    assert.ok(cold.clear < calm.clear);
    assert.ok(cold.rain > calm.rain);
    assert.deepEqual(weatherWeights(150, "temperate"), calm, "zero drift keeps the shipped table");
});

test("1.2.20.91 climate drift changes hazard pressure by kind", () => {
    prepare({ climate: "arid", drift: 0 });
    const dry = getHazardProfile();
    prepare({ climate: "arid", drift: 20 });
    const warmer = getHazardProfile();
    const heat = profile => profile.hazards.find(row => row.mechanic === "hazard:heat")?.weight || 0;
    assert.ok(heat(warmer) > heat(dry), "a hotter baseline raises heat pressure");

    prepare({ climate: "snow", drift: 0 });
    state.seasonIndex = 3;
    state.weather = "snow";
    const cold = getHazardProfile();
    prepare({ climate: "snow", drift: 20 });
    state.seasonIndex = 3;
    state.weather = "snow";
    const warmerCold = getHazardProfile();
    const frost = profile => profile.hazards.find(row => row.mechanic === "hazard:cold")?.weight || 0;
    assert.ok(frost(warmerCold) < frost(cold), "a hotter baseline lowers cold pressure");
});

test("1.2.20.91 regional bundle exposure is applied to its signature hazards", () => {
    prepare({ climate: "volcanic", drift: 0 });
    const profile = getHazardProfile();
    assert.equal(profile.bundle?.climate, "volcanic");
    assert.ok(profile.exposure > 0, "the bundle exposes the realm");
    const signature = profile.hazards.filter(row => profile.bundle.hazards.includes(row.mechanic.slice("hazard:".length)));
    assert.ok(signature.length > 0, "the bundle names real rolled hazards");
});
