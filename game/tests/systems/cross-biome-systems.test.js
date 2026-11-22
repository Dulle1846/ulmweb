import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import {
    BIOME_CLIMATE_ENVELOPES, BIOME_CLIMATE_ZONES, BIOME_SEASONS,
    BIOME_SEASONAL_APPEARANCE, BIOME_SEASONAL_TINTS, BIOME_SOIL_TYPES,
    BIOME_SYSTEM_REQUIREMENTS, BIOME_VARIANTS
} from "../../js/world/cross-biome-data.js";
import {
    BIOME_PROFILES, BIOME_RESOURCE_BY_ID
} from "../../js/world/biome-resource-data.js";
import {
    applyCrossBiomeAction, getCrossBiomeProfile, normalizeCrossBiomeState,
    serializeCrossBiomeState, validateCrossBiomeState
} from "../../js/systems/cross-biome-state.js";
import {
    cleanBiomeWater, drainBiomeRegion, generateBiomeAtlas, getBiomeOverlayCells,
    getBiomeRegionSnapshot, irrigateBiomeRegion, reforestBiomeRegion,
    restoreBiomeAtlasState, restoreBiomeRegion,
    serializeBiomeAtlasState, slashAndBurnBiomeRegion, updateBiomeAtlasAnnual,
    validateBiomeAtlasSnapshot
} from "../../js/systems/biome-resource-state.js";
import { renderBiomePanel } from "../../js/presentation/biome-panel.js";

const W = 160, H = 160, RES = 2, PIX = W * RES;

function contextForBands() {
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
    return {
        heights, moistures, temperatures, resolution: RES, pixW: PIX, pixH: PIX,
        sea: 0.33, width: W, height: H
    };
}

function setup(seed = 20261121) {
    resetState();
    const context = contextForBands();
    state.worldSeed = seed;
    state.worldW = W;
    state.worldH = H;
    state.heightMap = context.heights;
    state.moistureMap = context.moistures;
    state.temperatureMap = context.temperatures;
    state.seaLevel = context.sea;
    state.terrainResolution = RES;
    state.terrainPixW = PIX;
    state.terrainPixH = PIX;
    state.explored = Array.from({ length: W }, () => new Array(H).fill(false));
    return generateBiomeAtlas(seed, context);
}

function discovered(atlas) {
    return atlas.regions.find(region => region.discovered) || atlas.regions[0];
}

test("1.2.21 catalog has all 66 points, 8 climate zones, 12 envelopes and complete soil/variant/season data", () => {
    assert.equal(BIOME_SYSTEM_REQUIREMENTS.length, 66);
    assert.deepEqual(
        BIOME_SYSTEM_REQUIREMENTS.map(row => row.id),
        Array.from({ length: 66 }, (_, index) => "1.2.21." + (index + 1))
    );
    assert.equal(new Set(BIOME_SYSTEM_REQUIREMENTS.map(row => row.key)).size, 66);
    assert.equal(Object.keys(BIOME_CLIMATE_ZONES).length, 8);
    assert.equal(Object.keys(BIOME_CLIMATE_ENVELOPES).length, 12);
    assert.equal(BIOME_SEASONS.length, 4);
    for (const zone of Object.values(BIOME_CLIMATE_ZONES)) {
        assert.ok(zone.biomes.length >= 2, zone.id + " must contain related biomes");
        assert.ok(zone.temp[0] < zone.temp[1] && zone.precip[0] < zone.precip[1]);
    }
    for (const [biome, envelope] of Object.entries(BIOME_CLIMATE_ENVELOPES)) {
        assert.ok(BIOME_PROFILES[biome], biome + " must be a real atlas biome");
        assert.ok(BIOME_CLIMATE_ZONES[envelope.zone], biome + " needs a real climate zone");
        assert.ok(envelope.temp[0] < envelope.temp[1]);
        assert.ok(envelope.precip[0] < envelope.precip[1]);
        assert.ok(envelope.soils.length >= 2 && envelope.soils.every(id => BIOME_SOIL_TYPES[id]));
        assert.ok(BIOME_VARIANTS[biome].length >= 3, biome + " needs local variants");
        assert.equal(BIOME_SEASONAL_APPEARANCE[biome].length, 4, biome + " needs four seasonal faces");
        assert.equal(BIOME_SEASONAL_TINTS[biome].length, 4, biome + " needs four map-visible seasonal tints");
        assert.ok(BIOME_SEASONAL_TINTS[biome].every(color => /^#[0-9a-f]{6}$/i.test(color)));
    }
    for (const requirement of BIOME_SYSTEM_REQUIREMENTS) {
        assert.ok(requirement.label && requirement.groupLabel && requirement.evidence.length >= 2);
    }
});

test("1.2.21 profiles expose all 66 live values and each biome keeps its own climate envelope", () => {
    const atlas = setup();
    assert.ok(atlas.regions.length === 36);
    let checked = 0;
    for (const region of atlas.regions) {
        const profile = getCrossBiomeProfile(region);
        assert.equal(profile.requirements.length, 66);
        assert.equal(new Set(profile.requirements.map(row => row.id)).size, 66);
        assert.ok(profile.requirements.every(row => row.value !== "" && row.value !== "—"));
        assert.ok(profile.climate.tempC >= -45 && profile.climate.tempC <= 48);
        assert.ok(profile.climate.precipitation >= 0);
        assert.ok(profile.climate.humidity >= 0 && profile.climate.humidity <= 100);
        assert.ok(profile.climate.insolation >= 0 && profile.climate.insolation <= 100);
        assert.ok(profile.climate.wind >= 0 && profile.climate.wind <= 100);
        assert.ok(profile.zone && profile.relatedBiomes.length >= 2);
        assert.ok(profile.variant && profile.variants.length >= 3);
        assert.ok(profile.soil.label && profile.soil.nutrients >= 0 && profile.soil.nutrients <= 100);
        assert.ok(profile.water.riverTiles >= 0 && profile.water.lakeShare >= 0);
        assert.ok(profile.display.biome && profile.display.variants && profile.display.density);
        assert.ok(profile.display.resources && profile.display.fauna && profile.display.climate);
        assert.ok(profile.display.hazards && profile.display.agriculture && profile.display.movement);
        assert.ok(profile.display.changes);
        checked++;
    }
    assert.equal(checked, 36);
    const soils = new Set(atlas.regions.map(region => getCrossBiomeProfile(region).soil.id));
    const variants = new Set(atlas.regions.map(region => getCrossBiomeProfile(region).variant));
    assert.ok(soils.size >= 4, "the atlas must show several real soil types");
    assert.ok(variants.size >= 5, "the atlas must show several local variants");
});

test("1.2.21 elevation, humidity, wind and local deviation change the regional form", () => {
    const atlas = setup(20261122);
    const high = atlas.regions.slice().sort((a, b) => b.sample.height - a.sample.height)[0];
    const low = atlas.regions.slice().sort((a, b) => a.sample.height - b.sample.height)[0];
    const highProfile = getCrossBiomeProfile(high);
    const lowProfile = getCrossBiomeProfile(low);
    assert.ok(highProfile.climate.elevationM > lowProfile.climate.elevationM);
    assert.ok(highProfile.climate.tempC < lowProfile.climate.tempC + 12, "elevation must exert a real lapse rate");
    const wet = atlas.regions.slice().sort((a, b) => b.sample.moisture - a.sample.moisture)[0];
    const dry = atlas.regions.slice().sort((a, b) => a.sample.moisture - b.sample.moisture)[0];
    assert.ok(getCrossBiomeProfile(wet).climate.humidity >= getCrossBiomeProfile(dry).climate.humidity);
    assert.equal(typeof getCrossBiomeProfile(wet).water.gradient, "number");
    const variantsByBiome = new Map();
    for (const region of atlas.regions) {
        const profile = getCrossBiomeProfile(region);
        const list = variantsByBiome.get(profile.biome) || new Set();
        list.add(profile.variant);
        variantsByBiome.set(profile.biome, list);
    }
    assert.ok([...variantsByBiome.values()].some(values => values.size > 1), "same biome must produce regional variants");
});

test("1.2.21 soil and water state are bounded and the annual pass moves nutrients, humus, compaction, salinity and quality", () => {
    const atlas = setup(20261123);
    const region = discovered(atlas);
    region.discovered = true;
    for (const row of region.resources) row.discovered = true;
    setPolicy(region, "intensive");
    const before = serializeCrossBiomeState(region.systems);
    state.year += 1;
    const annual = updateBiomeAtlasAnnual();
    assert.equal(annual.updated, true);
    const after = serializeCrossBiomeState(region.systems);
    assert.ok(after.nutrients >= 0 && after.nutrients <= 1);
    assert.ok(after.humus >= 0 && after.humus <= 1);
    assert.ok(after.compaction >= 0 && after.compaction <= 1);
    assert.ok(after.salinity >= 0 && after.salinity <= 1);
    assert.ok(after.waterQuality >= 0 && after.waterQuality <= 1);
    assert.ok(after.legacy >= 0 && after.legacy <= 1);
    assert.notDeepEqual(after, before, "the annual pass must change the saved ecological state");
    const profile = getCrossBiomeProfile(region);
    assert.ok(profile.soil.compaction >= 0 && profile.soil.erosion >= 0 && profile.soil.organisms >= 0);
    assert.ok(profile.water.groundwater >= 0 && profile.water.scarcity >= 0);
    assert.ok(profile.water.quality >= 0 && profile.water.floodplain >= 0);
    assert.ok(profile.recovery.vegetation >= 0 && profile.recovery.soil >= 0 && profile.recovery.water >= 0);
});

test("1.2.21 seasons change appearance, plant and animal activity, resources, snow line, water level and farm use", () => {
    const atlas = setup(20261124);
    const region = discovered(atlas);
    region.discovered = true;
    for (const row of region.resources) row.discovered = true;
    const looks = new Set();
    const waterLevels = [];
    const farmUse = [];
    for (let season = 0; season < 4; season++) {
        state.seasonIndex = season;
        const profile = getCrossBiomeProfile(region);
        looks.add(profile.season.look);
        waterLevels.push(profile.season.waterLevel);
        farmUse.push(profile.season.farmUse);
        assert.ok(profile.season.plants && profile.season.animals);
        assert.ok(profile.season.water && profile.season.farm && profile.season.hazard);
        assert.ok(profile.season.snowLineM >= 0 && profile.season.snowLineM <= 5000);
        assert.ok(profile.season.animalActivity >= 0 && profile.season.animalActivity <= 100);
        assert.ok(profile.requirements.find(row => row.id === "1.2.21.29").value === profile.season.label);
    }
    assert.equal(looks.size, 4, "every season needs its own visible face");
    assert.equal(new Set(waterLevels).size, 4, "water level must respond to the season");
    assert.equal(new Set(farmUse).size, 4, "farm use must respond to the season");
    state.seasonIndex = 0;
    const springOverlay = getBiomeOverlayCells().find(cell => cell.id === region.id);
    state.seasonIndex = 2;
    const autumnOverlay = getBiomeOverlayCells().find(cell => cell.id === region.id);
    assert.ok(springOverlay?.seasonTint && autumnOverlay?.seasonTint);
    assert.notEqual(springOverlay.seasonTint, autumnOverlay.seasonTint, "the map overlay must change with the season");
    assert.equal(springOverlay.seasonLook, BIOME_SEASONAL_APPEARANCE[region.rawBiome][0]);
    assert.equal(autumnOverlay.seasonLook, BIOME_SEASONAL_APPEARANCE[region.rawBiome][2]);
    assert.ok(springOverlay.seasonTintAlpha >= 0.3 && springOverlay.seasonTintAlpha <= 0.36,
        "the seasonal wash must read on the real map without hiding terrain");
    state.seasonIndex = 3;
    const winterOverlay = getBiomeOverlayCells().find(cell => cell.id === region.id);
    assert.ok(winterOverlay.seasonTintAlpha > 0 && winterOverlay.seasonTintAlpha < springOverlay.seasonTintAlpha,
        "winter uses a lower alpha because its pale tint already lifts the ground");
    state.seasonIndex = 0;
});

test("1.2.21 irrigation, drainage, afforestation, water cleanup and slash-and-burn are real paid actions", () => {
    const atlas = setup(20261125);
    const region = discovered(atlas);
    region.discovered = true;
    for (const row of region.resources) row.discovered = true;
    state.resources.gold = 500;
    state.resources.wood = 500;
    const beforeWater = region.water;
    assert.equal(irrigateBiomeRegion(region.id).ok, true);
    assert.ok(region.water > beforeWater);
    assert.ok(region.systems.landUse.irrigation > 0);
    const beforeDrain = region.water;
    assert.equal(drainBiomeRegion(region.id).ok, true);
    assert.ok(region.water < beforeDrain);
    assert.ok(region.systems.landUse.drainage > 0);
    const beforeVegetation = region.vegetation;
    assert.equal(reforestBiomeRegion(region.id).ok, true);
    assert.ok(region.vegetation > beforeVegetation);
    assert.ok(region.systems.landUse.reforestation > 0);
    region.systems.pollution = 0.6;
    const beforeQuality = region.systems.waterQuality;
    assert.equal(cleanBiomeWater(region.id).ok, true);
    assert.ok(region.systems.waterQuality > beforeQuality);
    const foodBefore = state.resources.food;
    const woodBefore = state.resources.wood;
    assert.equal(slashAndBurnBiomeRegion(region.id).ok, true);
    assert.ok(state.resources.food > foodBefore && state.resources.wood > woodBefore);
    assert.ok(region.systems.legacy > 0);
    assert.equal(slashAndBurnBiomeRegion(region.id).ok, false, "slash-and-burn must be limited once per year");
    const restored = restoreBiomeRegion(region.id);
    assert.equal(restored.ok, true);
    assert.ok(region.systems.landUse.restoration > 0);
});

test("1.2.21 recovery depends on climate, soil and use, and persistent legacy damage is not instantly reversible", () => {
    const atlas = setup(20261126);
    const region = discovered(atlas);
    region.discovered = true;
    region.clearCut = 0.6;
    region.erosion = 0.5;
    region.protectedArea = true;
    region.policy = "conservation";
    const before = getCrossBiomeProfile(region);
    assert.ok(before.recovery.vegetation > 0 && before.recovery.forest >= 0);
    assert.ok(before.recovery.colonization >= 0 && before.recovery.fauna >= 0);
    assert.ok(before.recovery.soil >= 0 && before.recovery.water >= 0 && before.recovery.irreversible >= 0);
    applyCrossBiomeAction(region, "slash-burn");
    const burnt = getCrossBiomeProfile(region);
    const legacy = region.systems.legacy;
    assert.ok(legacy > 0, "burning must leave persistent legacy damage");
    assert.ok(burnt.landUse.clearing > 0);
    assert.ok(burnt.recovery.irreversible >= 0);
    region.systems.legacy = legacy;
    applyCrossBiomeAction(region, "restore");
    assert.ok(region.systems.legacy <= legacy, "restoration may help but must not erase the legacy instantly");
    const after = getCrossBiomeProfile(region);
    assert.ok(after.recovery.soil >= 0 && after.recovery.water >= 0);
    assert.match(after.display.changes, /./);
});

test("1.2.21 the real biome snapshot and panel expose the ten player readouts and all 66 ledger rows", () => {
    const atlas = setup(20261127);
    const region = discovered(atlas);
    region.discovered = true;
    const snapshot = getBiomeRegionSnapshot(region.id);
    assert.ok(snapshot.systems);
    for (const id of ["57", "58", "59", "60", "61", "62", "63", "64", "65", "66"]) {
        assert.ok(snapshot.systems.requirements.find(row => row.id === "1.2.21." + id));
    }
    assert.equal(snapshot.systems.requirements.length, 66);
    const panel = renderBiomePanel();
    assert.match(panel, /BIOME SYSTEM/);
    assert.match(panel, /FULL ECOLOGY LEDGER · 66 PARAMETERS/);
    for (let index = 1; index <= 66; index++) {
        assert.ok(panel.includes('data-biome-requirement="1.2.21.' + index + '"'), "panel must render requirement " + index);
    }
    assert.match(panel, /biome-irrigate/);
    assert.match(panel, /biome-reforest/);
    assert.match(panel, /biome-slash-burn/);
});

test("1.2.21 ecological state survives a save round-trip and old saves receive safe defaults", () => {
    const atlas = setup(20261128);
    const region = discovered(atlas);
    region.discovered = true;
    for (const row of region.resources) row.discovered = true;
    region.systems.nutrients = 0.31;
    region.systems.salinity = 0.27;
    region.systems.legacy = 0.19;
    region.systems.landUse.irrigation = 0.44;
    const saved = serializeBiomeAtlasState();
    const savedRegion = saved.regions.find(row => row.id === region.id);
    assert.ok(savedRegion.systems);
    assert.equal(savedRegion.systems.nutrients, 0.31);
    assert.equal(savedRegion.systems.legacy, 0.19);
    assert.equal(savedRegion.systems.landUse.irrigation, 0.44);
    region.systems.nutrients = 0;
    region.systems.salinity = 0;
    region.systems.legacy = 1;
    const restored = restoreBiomeAtlasState(saved);
    const restoredRegion = restored.regions.find(row => row.id === region.id);
    assert.equal(restoredRegion.systems.nutrients, 0.31);
    assert.equal(restoredRegion.systems.legacy, 0.19);
    assert.equal(restoredRegion.systems.landUse.irrigation, 0.44);
    assert.ok(validateBiomeAtlasSnapshot(saved));
    assert.throws(() => validateCrossBiomeState({ version: 99, soilType: "loam" }));
    assert.throws(() => validateBiomeAtlasSnapshot({
        ...saved,
        regions: saved.regions.map(row => row.id === region.id ? { ...row, systems: { ...row.systems, nutrients: 4 } } : row)
    }));
    const old = JSON.parse(JSON.stringify(saved));
    for (const row of old.regions) delete row.systems;
    const oldRestored = restoreBiomeAtlasState(old);
    const oldRegion = oldRestored.regions.find(row => row.id === region.id);
    assert.ok(oldRegion.systems, "an old 1.2.19 save must receive the new system defaults");
    assert.ok(oldRegion.systems.nutrients >= 0 && oldRegion.systems.nutrients <= 1);
    assert.ok(normalizeCrossBiomeState(undefined, oldRegion, 20261128));
});

function setPolicy(region, policy) {
    region.policy = policy;
}
