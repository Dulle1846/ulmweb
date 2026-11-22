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

test("1.2.21 seasonal water scarcity changes the actual grain harvest and leaves a player note", () => {
    function harvestWith(water, groundwater, drainage, pollution) {
        const atlas = setup();
        state.hasStarted = true;
        state.isPaused = false;
        state.gameOver = false;
        state.seasonIndex = 2;
        state.year = 10;
        state.tick = 1000;
        const region = atlas.regions[0];
        region.water = water;
        const system = region.systems;
        system.groundwater = groundwater;
        system.landUse.drainage = drainage;
        system.pollution = pollution;
        const profile = getCrossBiomeProfile(region);
        const farm = addFarm(region);
        updateFields();
        return { profile, farm, harvest: farm.field.harvestTotal };
    }

    const wet = harvestWith(0.95, 0.95, 0, 0);
    const dry = harvestWith(0.03, 0.05, 0.8, 0.5);
    assert.ok(wet.profile.ecology.pressure.waterScarcity < dry.profile.ecology.pressure.waterScarcity - 20,
        "the wet and dry season must expose a real scarcity difference");
    assert.ok(wet.profile.ecology.pressure.yieldFactor > dry.profile.ecology.pressure.yieldFactor + 0.03,
        "scarcity must lower the water/frost pressure factor");
    assert.ok(wet.profile.ecology.agricultureFactor > dry.profile.ecology.agricultureFactor + 0.02,
        "the panel agriculture multiplier must include that pressure");
    assert.ok(wet.harvest > dry.harvest,
        "the same farm with the same field must harvest less in the dry region: "
        + wet.harvest + " vs " + dry.harvest);
    assert.ok(state.eventLog.some(entry => /BIOME HARVEST/.test(entry.text) && /LESS GRAIN/.test(entry.text)),
        "the player must see why the harvest is smaller");
});

test("1.2.21 snow/frost pressure lowers the shown yield and cuts the standing crop", () => {
    const winterAtlas = setup();
    state.year = 20;
    let chosen = null;
    for (const region of winterAtlas.regions) {
        state.seasonIndex = 3;
        const winter = getCrossBiomeProfile(region);
        state.seasonIndex = 1;
        const summer = getCrossBiomeProfile(region);
        const difference = winter.ecology.pressure.frostRisk - summer.ecology.pressure.frostRisk;
        if (winter.ecology.pressure.frostRisk > 55
            && winter.ecology.pressure.yieldFactor < 0.99
            && (!chosen || difference > chosen.difference)) {
            chosen = { region, profile: winter, difference };
        }
    }
    assert.ok(chosen, "at least one winter region must carry a real frost pressure");
    state.seasonIndex = 3;
    const pressure = chosen.profile.ecology.pressure;
    const baseFactor = Math.max(0.84, Math.min(1.14,
        0.80 + (chosen.profile.ecology.agriculture / 100) * 0.32));
    assert.ok(Math.abs(chosen.profile.ecology.agricultureFactor - baseFactor * pressure.yieldFactor) < 0.01,
        "the shown agriculture factor must actually multiply the frost pressure");

    state.hasStarted = true;
    state.isPaused = false;
    state.gameOver = false;
    state.tick = 1000;
    const winterFarm = addFarm(chosen.region);
    winterFarm.field.stage = "growing";
    winterFarm.field.growth = 80;
    const before = winterFarm.field.growth;
    updateFields();
    const afterFirstPass = winterFarm.field.growth;
    assert.ok(afterFirstPass < before,
        "winter frost must cut the real standing crop: " + before + " -> " + afterFirstPass);
    updateFields();
    assert.equal(winterFarm.field.growth, afterFirstPass,
        "frost damage must be once per field and year, not once per daily tick");
    assert.ok(state.eventLog.some(entry => /BIOME FROST/.test(entry.text) && /GROWTH LOST/.test(entry.text)),
        "the player must see the frost damage note");
});

test("1.2.21 floodplain pressure selects a real flood and damages that region's fields", () => {
    const atlas = setup();
    state.seasonIndex = 1;
    state.year = 12;
    let chosen = null;
    // Low ground plus river/lake margin creates a high floodplain readout. A
    // deliberately saline soil keeps another hazard at the top of the generic
    // list, so only the pressure bridge can select the flood.
    for (const region of atlas.regions) {
        region.engineered = 1;
        region.water = 0.2;
        region.sample = { ...(region.sample || {}), height: 0.335, moisture: 0.5 };
        const system = region.systems;
        system.salinity = 1;
        system.hydrology.riverTiles = 80;
        system.hydrology.lakeShare = 20;
        system.landUse.drainage = 1;
        const profile = getCrossBiomeProfile(region);
        if (profile.ecology.pressure.hazard === "flood"
            && profile.ecology.hazards.some(row => row.id === "flood")
            && profile.ecology.hazards[0].id !== "flood") {
            chosen = { region, profile };
            break;
        }
    }
    assert.ok(chosen, "the atlas must contain a floodplain where flood is not the generic top hazard");
    assert.ok(chosen.profile.ecology.pressure.floodplain > 65,
        "the chosen region must show a real floodplain exposure");
    const farm = addFarm(chosen.region);
    farm.field.stage = "growing";
    farm.field.growth = 80;
    farm.field.fertility = 55;
    const before = farm.field.growth;
    for (const region of atlas.regions) region.discovered = region === chosen.region;
    setHazardProofRoll(0);
    const result = updateEnvironmentalHazards({ force: true });
    setHazardProofRoll(null);
    assert.equal(chosen.region.systems.lastHazard?.id, "flood",
        "the seasonal bridge must choose the pressure flood, not the generic top hazard");
    assert.ok(result.active.some(row => row.source === "biome"
        && row.regionId === chosen.region.id && row.mechanic === "hazard:flood"),
        "the flood must reach the existing shared hazard state");
    assert.ok(farm.field.growth < before,
        "the seasonal flood must damage this region's real standing crop");
    // The seasonal pass also rolls generic hazards with the proof roll; trigger
    // the flood again on the same farm to prove the regional field damage path
    // itself, independent of any generic damage that happened first.
    farm.field.stage = "growing";
    farm.field.growth = 80;
    const direct = triggerBiomeHazard(chosen.region.id, "flood", { severity: 1 });
    assert.equal(direct.ok, true, "the floodplain flood must be triggerable through the shared path");
    assert.ok(farm.field.growth < 80,
        "the shared flood path must cut this region's standing crop");
});
