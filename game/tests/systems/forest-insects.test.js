import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { generateResourceGeography, getResourceNodeAt } from "../../js/systems/resource-geography.js";
import {
    ensureForestFauna, forestBarkBeetlePressureAt, forestInsectAt, forestInsectGrowth, forestInsectHabitat,
    resetForestFauna, restoreForestFauna, serializeForestFauna, updateForestFauna,
    validateForestFaunaSnapshot, FOREST_FAUNA_LIMITS, SIMULATED_INSECT_IDS,
} from "../../js/systems/forest-fauna.js";
import { coniferDisturbanceWeights } from "../../js/systems/forest-succession.js";
import { forestProductsAt } from "../../js/systems/forest-gathering.js";

function setup(seed = 20261109) {
    resetState();
    resetForestFauna();
    state.worldSeed = seed;
    state.worldW = 48;
    state.worldH = 48;
    state.terrainResolution = 2;
    state.terrainPixW = 96;
    state.terrainPixH = 96;
    state.worldOptions = { landmass: 50, ruggedness: 55, forests: 76, water: 48, climate: "temperate" };
    // A cold, moderately dry realm exposes the conifer formations where both
    // bark beetles and ants have real habitat.
    state.heightMap = new Float32Array(96 * 96).fill(0.68);
    state.moistureMap = new Float32Array(96 * 96).fill(0.48);
    state.temperatureMap = new Float32Array(96 * 96).fill(0.36);
    generateResourceGeography(seed);
    return ensureForestFauna();
}

function insectOf(model, species, predicate = () => true) {
    return (model.insects || []).find(insect => insect.species === species && predicate(insect));
}

function bestMonocultureTile() {
    let best = null;
    for (let y = 2; y < state.worldH - 2; y++) {
        for (let x = 2; x < state.worldW - 2; x++) {
            const products = forestProductsAt(x, y, 150);
            if (!products) continue;
            if (!best || products.stand.monoculture > best.stand.monoculture) {
                best = { x, y, stand: products.stand };
            }
        }
    }
    return best;
}

test("insect colonies are saved populations that grow without intervention", () => {
    const model = setup();
    assert.ok(model.insects.length > 0, "a conifer wood must seed real insect colonies");
    assert.ok(model.insects.length <= FOREST_FAUNA_LIMITS.maxInsects);
    for (const species of ["ant", "bark-beetle", "beetle"]) {
        assert.ok(SIMULATED_INSECT_IDS.includes(species), species + " must be a simulated insect");
    }
    const ant = insectOf(model, "ant");
    const beetle = insectOf(model, "bark-beetle");
    assert.ok(ant, "the wood must carry an ant colony");
    assert.ok(beetle, "the conifer wood must carry a bark-beetle colony");

    ant.population = 0.2;
    const before = ant.population;
    updateForestFauna(1);
    assert.ok(ant.population > before, "an ant colony below carrying capacity must grow on its own");
    assert.ok(model.stats.insectBirths > 0, "the tick must record the population gain");
    assert.ok(forestInsectAt(ant.x, ant.y).some(entry => entry.id === "ant"));

    const snapshot = serializeForestFauna();
    assert.ok(Array.isArray(snapshot.insects) && snapshot.insects.length > 0);
    assert.equal(validateForestFaunaSnapshot(snapshot), true);
    resetForestFauna();
    const restored = restoreForestFauna(snapshot);
    assert.equal(restored, snapshot.herds.length);
    assert.equal(serializeForestFauna().insects.length, snapshot.insects.length);
    assert.ok(forestInsectAt(snapshot.insects[0].x, snapshot.insects[0].y).length > 0);
    assert.throws(() => validateForestFaunaSnapshot({
        version: 1, day: 0, herds: [], insects: [{ species: "unknown", x: 0, y: 0, population: 1, capacity: 1 }],
    }), /forest-insect colony/);

    const legacy = { ...snapshot };
    delete legacy.insects;
    assert.equal(validateForestFaunaSnapshot(legacy), true);
    resetForestFauna();
    restoreForestFauna(legacy);
    const rebuilt = ensureForestFauna();
    assert.ok(rebuilt.insects.length > 0,
        "a pre-insect save must seed the bounded colony set instead of staying permanently empty");
    assert.ok(forestInsectAt(rebuilt.insects[0].x, rebuilt.insects[0].y).length > 0);
});

test("drought and monoculture collapse an ant population instead of only decorating the tile", () => {
    const model = setup();
    const ant = insectOf(model, "ant");
    assert.ok(ant);
    const node = getResourceNodeAt(ant.x, ant.y);
    assert.ok(node?.forestCapacity);

    ant.population = 2.4;
    node.forestSuccession = { kind: "drought-stressed", age: 12 };
    const beforeDrought = ant.population;
    updateForestFauna(1);
    assert.ok(ant.population < beforeDrought,
        "drought must lower the ant carrying capacity and cause a measurable decline");
    assert.ok(ant.droughtStress >= 0.99 || ant.trend === "declining");

    // A separate colony on a real, species-poor stand gives the monoculture
    // effect a concrete population target rather than a synthetic stand object.
    const tile = bestMonocultureTile();
    assert.ok(tile, "the generated conifer world must expose a candidate stand");
    assert.ok(tile.stand.monoculture > 0.2, "the fixture must actually be a species-poor stand");
    node.forestSuccession = null;
    const mono = {
        id: "test-ant-monoculture", species: "ant", x: tile.x, y: tile.y,
        population: 2.8, capacity: 2, density: 0.9, trend: "stable",
        droughtStress: 0, monocultureStress: 0,
    };
    model.insects.push(mono);
    const beforeMono = mono.population;
    updateForestFauna(1);
    assert.ok(mono.population < beforeMono,
        "a species-poor stand must reduce ant survival below the starting population");

    const healthy = { density: 0.75, ground: { litter: 0.7 }, wetness: 0.7, monoculture: 0, coniferShare: 0 };
    const dry = forestInsectHabitatForTest(healthy, "ant", { disturbance: "drought-stressed" });
    const pure = forestInsectHabitatForTest(healthy, "ant", { monoculture: 1 });
    assert.ok(dry.capacity < healthyCapacity(healthy, "ant") * 0.55);
    assert.ok(pure.capacity < healthyCapacity(healthy, "ant") * 0.7);
});

function forestInsectHabitatForTest(base, species, overrides) {
    // The public habitat helper needs the same shape the stand supplies.
    return forestInsectHabitat({ ...base, ...overrides }, species);
}

function healthyCapacity(base, species) {
    return forestInsectHabitat(base, species).capacity;
}

test("bark-beetle population pressure raises the existing disturbance weight", () => {
    const model = setup();
    const beetle = insectOf(model, "bark-beetle");
    assert.ok(beetle);
    const products = forestProductsAt(beetle.x, beetle.y, 150);
    assert.ok(products);
    const pressure = forestBarkBeetlePressureAt(beetle.x, beetle.y);
    assert.ok(pressure > 0, "a living bark-beetle colony must expose real pressure");
    const base = {
        ...products.stand, fireRisk: 0.1, pestRisk: 0.1, monoculture: 0, snowPotential: 0.1,
    };
    const calm = coniferDisturbanceWeights(base, 1, "clear", 0);
    const infested = coniferDisturbanceWeights(base, 1, "clear", pressure);
    assert.ok(infested["bark-beetle"] > calm["bark-beetle"],
        "saved bark-beetle density must feed the live succession event");
    const delta = forestInsectGrowth({
        population: 0.4, capacity: 2, reproduction: 0.2, mortality: 0.05,
        droughtStress: 1, monocultureStress: 1,
    });
    assert.ok(delta < forestInsectGrowth({
        population: 0.4, capacity: 2, reproduction: 0.2, mortality: 0.05,
    }), "the shared growth rule must react to drought and monoculture stress");
});
