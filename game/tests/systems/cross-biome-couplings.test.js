import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { spawnEntity } from "../../js/world/entities.js";
import { HAZARD_EFFECTS } from "../../js/world/hazard-data.js";
import { generateBiomeAtlas } from "../../js/systems/biome-resource-state.js";
import {
    getCrossBiomeFarmYieldFactorAt, getCrossBiomeMovementFactorAt, getCrossBiomeProfile,
    normalizeCrossBiomeState, serializeCrossBiomeState
} from "../../js/systems/cross-biome-state.js";
import { updateFields } from "../../js/systems/fields.js";
import { ensureCityState, updateLogisticsMovement } from "../../js/systems/logistics.js";
import {
    setHazardProofRoll, triggerBiomeHazard, updateEnvironmentalHazards
} from "../../js/systems/environmental-hazards.js";

const W = 160, H = 160, RES = 2, PIX = W * RES;

function setup(seed = 20261121) {
    resetState();
    const heights = new Float32Array(PIX * PIX);
    const moistures = new Float32Array(PIX * PIX);
    const temperatures = new Float32Array(PIX * PIX);
    const bands = [
        { h: 0.2, m: 0.9, t: 0.7 }, { h: 0.345, m: 0.4, t: 0.7 },
        { h: 0.55, m: 0.55, t: 0.1 }, { h: 0.86, m: 0.3, t: 0.5 },
        { h: 0.52, m: 0.5, t: 0.23 }, { h: 0.52, m: 0.55, t: 0.33 },
        { h: 0.36, m: 0.86, t: 0.55 }, { h: 0.52, m: 0.2, t: 0.8 },
        { h: 0.52, m: 0.35, t: 0.65 }, { h: 0.52, m: 0.82, t: 0.56 },
        { h: 0.52, m: 0.55, t: 0.5 }, { h: 0.5, m: 0.36, t: 0.5 }
    ];
    for (let y = 0; y < PIX; y++) {
        const band = bands[Math.min(bands.length - 1, Math.floor(y / PIX * bands.length))];
        for (let x = 0; x < PIX; x++) {
            const index = y * PIX + x;
            heights[index] = band.h;
            moistures[index] = band.m;
            temperatures[index] = band.t;
        }
    }
    state.worldSeed = seed;
    state.worldW = W;
    state.worldH = H;
    state.heightMap = heights;
    state.moistureMap = moistures;
    state.temperatureMap = temperatures;
    state.seaLevel = 0.33;
    state.terrainResolution = RES;
    state.terrainPixW = PIX;
    state.terrainPixH = PIX;
    state.explored = Array.from({ length: W }, () => new Array(H).fill(false));
    const atlas = generateBiomeAtlas(seed, {
        heights, moistures, temperatures, resolution: RES, pixW: PIX, pixH: PIX,
        sea: 0.33, width: W, height: H
    });
    for (const region of atlas.regions) region.discovered = true;
    return atlas;
}

function extremes(atlas, read) {
    let low = null, high = null;
    for (const region of atlas.regions) {
        const value = read(region);
        if (!low || value < low.value) low = { region, value };
        if (!high || value > high.value) high = { region, value };
    }
    return { low, high };
}

function addFarm(region) {
    const farm = spawnEntity(Math.floor(region.centerX), Math.floor(region.centerY), TYPE.FARM);
    farm.construction = { stage: 3 };
    farm.field = { stage: "ripe", growth: 100, fertility: 60, maxFertility: 100 };
    const farmer = spawnEntity(Math.floor(region.centerX) + 1, Math.floor(region.centerY), TYPE.VILLAGER);
    farmer.workplace = farm;
    farmer.job = "farmer";
    return farm;
}

test("1.2.21 movement factor moves a real logistics carrier at the shown speed", () => {
    const atlas = setup();
    const { low, high } = extremes(atlas, region =>
        getCrossBiomeMovementFactorAt(Math.floor(region.centerX), Math.floor(region.centerY)));
    assert.ok(high.value > low.value + 0.1, "the atlas must contain distinct regional going");

    state.buildingCollisionVersion = 0;
    state.roads = { ...(state.roads || {}), revision: 0, tiles: {} };
    const city = ensureCityState();
    city.enabled = true;
    const version = "0:0";
    const carrier = (id, region) => ({
        id, jobId: "job-" + id, x: Math.floor(region.centerX), y: Math.floor(region.centerY),
        path: [{ x: Math.floor(region.centerX) + 20, y: Math.floor(region.centerY) }],
        pathIndex: 0, pathVersion: version, speed: 2, status: "to-destination"
    });
    const slow = carrier("slow", low.region);
    const fast = carrier("fast", high.region);
    city.logistics.carriers = [slow, fast];
    city.logistics.jobs = [
        { id: "job-slow", status: "assigned", to: { id: "target" } },
        { id: "job-fast", status: "assigned", to: { id: "target" } }
    ];
    const slowStart = slow.x, fastStart = fast.x;
    updateLogisticsMovement(0.1);
    const slowDistance = slow.x - slowStart;
    const fastDistance = fast.x - fastStart;
    assert.ok(slowDistance > 0 && fastDistance > 0, "both carriers must actually move");
    assert.ok(fastDistance > slowDistance * 1.1,
        "the open region must move the same carrier farther than the difficult one");
    const ratio = fastDistance / slowDistance;
    const expected = high.value / low.value;
    assert.ok(Math.abs(ratio - expected) < 0.03,
        "carrier displacement must follow the exact regional multiplier: " + ratio + " vs " + expected);
});

test("1.2.21 agricultural suitability changes the grain a real farm harvests", () => {
    const atlas = setup();
    const { low, high } = extremes(atlas, region =>
        getCrossBiomeFarmYieldFactorAt(Math.floor(region.centerX), Math.floor(region.centerY)));
    assert.ok(high.value > low.value + 0.1, "the atlas must contain distinct farm suitability");

    state.hasStarted = true;
    state.isPaused = false;
    state.gameOver = false;
    state.seasonIndex = 2;
    state.year = 4;
    state.tick = 1000;
    const poor = addFarm(low.region);
    const rich = addFarm(high.region);
    updateFields();
    assert.ok(poor.field.harvestTotal > 0 && rich.field.harvestTotal > 0,
        "both farms must actually harvest");
    assert.ok(rich.field.harvestTotal > poor.field.harvestTotal,
        "the suitable region must yield more grain: " + rich.field.harvestTotal + " vs " + poor.field.harvestTotal);
    assert.ok(rich.field.harvestTotal >= poor.field.harvestTotal * 1.08,
        "the panel's harvest multiplier must be visible in the harvested amount");
});

test("1.2.21 regional danger triggers a real 1.2.15 hazard, damages that region's field, and survives save", () => {
    const atlas = setup();
    let chosen = null;
    for (const region of atlas.regions) {
        const profile = getCrossBiomeProfile(region);
        const hazard = profile.ecology.hazards.find(row => (HAZARD_EFFECTS[row.mechanic]?.field || 0) > 0);
        if (hazard) { chosen = { region, hazard }; break; }
    }
    assert.ok(chosen, "at least one region must display a field-damaging hazard");
    const farm = addFarm(chosen.region);
    farm.field.stage = "growing";
    farm.field.growth = 80;
    farm.field.fertility = 55;
    const before = farm.field.growth;
    setHazardProofRoll(0.99);
    const result = triggerBiomeHazard(chosen.region.id, chosen.hazard.id, { severity: 1 });
    setHazardProofRoll(null);
    assert.equal(result.ok, true, "the displayed hazard must be mechanically triggerable");
    assert.ok(result.active.source === "biome" && result.active.regionId === chosen.region.id);
    assert.equal(result.active.mechanic, chosen.hazard.mechanic);
    assert.ok(state.environmentalHazards.active.some(row =>
        row.source === "biome" && row.regionId === chosen.region.id), "the shared hazard state must own the event");
    assert.ok(farm.field.growth < before, "the regional hazard must damage this region's real field");
    assert.ok(chosen.region.systems.lastHazard?.id === chosen.hazard.id,
        "the survey must remember which regional danger struck");

    const saved = serializeCrossBiomeState(chosen.region.systems);
    const restored = normalizeCrossBiomeState(saved, chosen.region, state.worldSeed);
    assert.deepEqual(restored.lastHazard, chosen.region.systems.lastHazard);
});

test("1.2.21 seasonal bridge matures one survey danger through the existing hazard pass", () => {
    const atlas = setup();
    state.seasonIndex = 1;
    state.year = 6;
    setHazardProofRoll(0);
    const result = updateEnvironmentalHazards({ force: true });
    setHazardProofRoll(null);
    assert.ok(result.active.some(row => row.source === "biome" && row.regionId),
        "the seasonal pass must carry a regional survey danger into the shared active hazards");
    assert.ok(atlas.regions.some(region => region.systems?.lastHazard),
        "the struck region must record its hazard");
});
