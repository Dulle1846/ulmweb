import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { generateResourceGeography } from "../../js/systems/resource-geography.js";
import {
    ensureForestFauna, forestProcessFactorsFor, harvestForestGameAt, resetForestFauna, updateForestFauna,
} from "../../js/systems/forest-fauna.js";
import { forestGoodsFor } from "../../js/world/forest-ecology.js";

function setup(seed = 20261108) {
    resetState();
    resetForestFauna();
    state.worldSeed = seed;
    state.worldW = 48;
    state.worldH = 48;
    state.terrainResolution = 2;
    state.terrainPixW = 96;
    state.terrainPixH = 96;
    state.worldOptions = { landmass: 50, ruggedness: 55, forests: 70, water: 48, climate: "temperate" };
    state.heightMap = new Float32Array(96 * 96).fill(0.7);
    state.moistureMap = new Float32Array(96 * 96).fill(0.8);
    state.temperatureMap = new Float32Array(96 * 96).fill(0.55);
    generateResourceGeography(seed);
    return ensureForestFauna();
}

const stand = {
    forest: true, x: 8, y: 9, seed: 20261126, ageClass: "mature",
    canopy: 0.72, density: 0.8, moisture: 0.66, wetness: 0.7, deadwood: 0.35,
    edge: true, clearing: 0.18, regionalTransitionShare: 0.22,
    ground: { litter: 0.55, huntingPressure: 0.22, pools: 0.12 },
    species: [], regionalEffects: { fauna: 1, forage: 1 },
};

test("117 parasite pressure is host-bound and only bites at herd density", () => {
    const low = forestProcessFactorsFor({
        herd: { species: "deer", population: 5, capacity: 20 },
        stand, day: 180,
    });
    const dense = forestProcessFactorsFor({
        herd: { species: "deer", population: 20, capacity: 20 },
        stand, day: 180,
    });
    const owl = forestProcessFactorsFor({
        herd: { species: "owl", population: 20, capacity: 20 },
        stand, day: 180,
    });
    assert.equal(low.densityBrake, 0, "a sparse herd must not pay a constant parasite tax");
    assert.equal(low.parasiteBrake, 0);
    assert.ok(dense.parasiteLoad > low.parasiteLoad);
    assert.ok(dense.parasiteBrake > 0 && dense.parasiteBrake < 0.3);
    assert.ok(dense.meatQualityFactor < low.meatQualityFactor);
    assert.ok(owl.parasiteLoad < dense.parasiteLoad, "an owl must not carry the deer tick load");
    assert.ok(Number.isFinite(owl.parasiteBrake));
});

test("118 scavenger cleanup lowers parasite pressure and leaves a bounded bone find", () => {
    const herd = { species: "deer", population: 20, capacity: 20 };
    const clean = forestProcessFactorsFor({ herd, stand, day: 200, carrion: 0 });
    const carrion = forestProcessFactorsFor({ herd, stand, day: 200, carrion: 8 });
    assert.ok(carrion.scavengerRelief > clean.scavengerRelief);
    assert.ok(carrion.parasiteLoad < clean.parasiteLoad);
    assert.ok(carrion.parasiteBrake < clean.parasiteBrake);

    const goodsStand = {
        forest: true, productivity: 1, goods: ["game"],
        regionalEffects: { forage: 1 },
        dynamics: { goods: { boost: {}, extra: [] }, silviculture: {}, working: {} },
        faunaEcology: {
            signals: { gameYield: 0.5, scavenging: 0.6 },
            scavengers: { carcassSites: 3, abundance: 60 },
        },
    };
    const withCarcass = forestGoodsFor(goodsStand, 240);
    assert.ok(withCarcass.some(good => good.id === "bone"),
        "scavengers must turn a recent kill into a small bone-and-horn find");
    const withoutCarcass = forestGoodsFor({
        ...goodsStand,
        faunaEcology: { ...goodsStand.faunaEcology, scavengers: { carcassSites: 0, abundance: 60 } },
    }, 240);
    assert.ok(!withoutCarcass.some(good => good.id === "bone"),
        "no carcass sites means no scavenger find");
});

test("119 cycles are deterministic, bounded and reciprocally coupled", () => {
    const base = { species: "hare", population: 10, capacity: 10 };
    const low = forestProcessFactorsFor({
        herd: base, day: 220,
        ecology: { cycleHare: 0.1, cycleLynx: 0.1, cycleVole: 0.1, cycleOwl: 0.1, cycleMast: 0.1, scavenging: 0, parasiteLoad: 0, corridor: 0.4 },
    });
    const high = forestProcessFactorsFor({
        herd: base, day: 220,
        ecology: { cycleHare: 0.9, cycleLynx: 0.9, cycleVole: 0.9, cycleOwl: 0.9, cycleMast: 0.9, scavenging: 0, parasiteLoad: 0, corridor: 0.4 },
    });
    assert.ok(high.cycleFactor > low.cycleFactor);
    for (const value of [low.cycleFactor, high.cycleFactor]) {
        assert.ok(Number.isFinite(value) && value >= 0.86 && value <= 1.06);
    }
    const predatorHungry = forestProcessFactorsFor({
        herd: { species: "lynx", population: 1.5, capacity: 2 },
        day: 50, preyBiomass: 0,
        ecology: { cycleLynx: 0.5, cycleHare: 0.5, scavenging: 0, parasiteLoad: 0, corridor: 0.4 },
    });
    const predatorFed = forestProcessFactorsFor({
        herd: { species: "lynx", population: 1.5, capacity: 2 },
        day: 50, preyBiomass: 24,
        ecology: { cycleLynx: 0.5, cycleHare: 0.5, scavenging: 0, parasiteLoad: 0, corridor: 0.4 },
    });
    assert.ok(predatorFed.cycleFactor > predatorHungry.cycleFactor);
    const predatorOvershoot = forestProcessFactorsFor({
        herd: { species: "lynx", population: 1.5, capacity: 2 },
        day: 50, preyBiomass: 60,
        ecology: { cycleLynx: 0.5, cycleHare: 0.5, scavenging: 0, parasiteLoad: 0, corridor: 0.4 },
    });
    assert.ok(predatorOvershoot.cycleFactor < predatorFed.cycleFactor,
        "prey overshoot must ease predator capacity back down");
    const preyCalm = forestProcessFactorsFor({
        herd: base, day: 50, predatorPressure: 0,
        ecology: { cycleHare: 0.5, cycleLynx: 0.5, scavenging: 0, parasiteLoad: 0, corridor: 0.4 },
    });
    const preyHunted = forestProcessFactorsFor({
        herd: base, day: 50, predatorPressure: 0.8,
        ecology: { cycleHare: 0.5, cycleLynx: 0.5, scavenging: 0, parasiteLoad: 0, corridor: 0.4 },
    });
    assert.ok(preyHunted.cycleFactor < preyCalm.cycleFactor);
    assert.deepEqual(
        forestProcessFactorsFor({ herd: base, stand, day: 180 }),
        forestProcessFactorsFor({ herd: base, stand, day: 180 }),
        "the process record must be deterministic",
    );
});

test("120 corridor quality separates a linked wood from an isolated one", () => {
    const linked = forestProcessFactorsFor({
        herd: { species: "deer", population: 4, capacity: 12 },
        stand: { ...stand, edge: true, regionalTransitionShare: 0.45, clearing: 0.3 },
        day: 150,
    });
    const isolated = forestProcessFactorsFor({
        herd: { species: "deer", population: 4, capacity: 12 },
        stand: {
            ...stand, edge: false, regionalTransitionShare: 0, clearing: 0,
            canopy: 0.92, moisture: 0.28, deadwood: 0.04,
            ground: { ...stand.ground, huntingPressure: 0.08 },
        },
        day: 150,
    });
    assert.ok(linked.corridorQuality > isolated.corridorQuality);
    assert.ok(linked.corridorQuality >= 0 && linked.corridorQuality <= 1);
    assert.ok(isolated.corridorQuality >= 0 && isolated.corridorQuality <= 1);
});

test("hunting records the parasite penalty and leaves carrion on the tile", () => {
    const model = setup();
    const herd = model.herds.find(entry => entry.species === "deer" || entry.species === "roe-deer");
    assert.ok(herd, "the fixture realm must carry a huntable deer herd");
    herd.population = Math.max(2, herd.capacity * 0.8);
    herd.huntingPressure = 0;
    const result = harvestForestGameAt(herd.x, herd.y, 1);
    assert.ok(result, "a populated tile must allow a hunt");
    assert.ok(["prime", "good", "lean"].includes(result.quality));
    assert.ok(result.parasiteLoad >= 0 && result.parasiteLoad <= 1);
    assert.ok(result.meatQualityFactor > 0 && result.meatQualityFactor <= 1);
    assert.ok(Number.isFinite(model.carrion.get(herd.x + ":" + herd.y)));
    assert.ok(model.carrion.get(herd.x + ":" + herd.y) > 0);
    updateForestFauna(1);
    assert.ok(model.herds.every(entry => Number.isFinite(entry.population) && Number.isFinite(entry.capacity)));
});
