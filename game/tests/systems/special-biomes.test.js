import test from "node:test";
import assert from "node:assert/strict";
import { state, resetState } from "../../js/core/state.js";
import {
    SPECIAL_BIOME_FAMILIES, SPECIAL_BIOME_FAMILY_IDS, SPECIAL_BIOME_MANIFEST,
    RARE_GOODS, RARE_GOOD_IDS, SPECIAL_BIOME_MAX_REGIONS,
    buildSpecialBiomeMap, generateSpecialBiomeRegions, specialBiomeRegionAt, specialBiomeSummary
} from "../../js/world/special-biomes.js";
import {
    attuneSpecialBiome, cleanseSpecialBiome, createSpecialBiomeState, generateSpecialBiomes,
    getSpecialBiomeAt, getSpecialBiomeSnapshot, normalizeSpecialBiomeState,
    rebuildSpecialBiomeAtlas, sellSpecialGood, serializeSpecialBiomeState, updateSpecialBiomes,
    validateSpecialBiomeState
} from "../../js/systems/special-biome-state.js";

const SEED = 20261160;

function setupWorld(seed = SEED) {
    resetState();
    state.hasStarted = true;
    state.worldSeed = seed;
    state.worldOptions = {
        size: "standard", shape: "continent", climate: "temperate", landmass: 64,
        ruggedness: 55, forests: 46, water: 34, fertility: 58, resources: 55
    };
    const size = 120;
    state.worldW = size;
    state.worldH = size;
    state.seaLevel = 0.33;
    state.terrainResolution = 1;
    state.terrainPixW = size;
    state.terrainPixH = size;
    state.heightMap = new Float32Array(size * size).fill(0.62);
    state.moistureMap = new Float32Array(size * size).fill(0.45);
    state.temperatureMap = new Float32Array(size * size).fill(0.55);
    state.explored = Array.from({ length: size }, () => Array(size).fill(false));
    state.resources = { wood: 200, stone: 200, gold: 100, food: 200 };
    generateSpecialBiomes(seed, state.worldOptions, {
        heights: state.heightMap, moistures: state.moistureMap, temperatures: state.temperatureMap,
        resolution: 1, pixW: size, pixH: size, W: size, H: size, sea: state.seaLevel
    });
    return state.specialBiomes;
}

test("the 1.2.17 manifest covers one hundred distinct wonders in nine families", () => {
    assert.equal(SPECIAL_BIOME_MANIFEST.length, 100);
    assert.equal(new Set(SPECIAL_BIOME_MANIFEST.map(entry => entry.id)).size, 100);
    assert.equal(new Set(SPECIAL_BIOME_MANIFEST.map(entry => entry.label)).size, 100);
    const manifestFamilies = new Set(SPECIAL_BIOME_MANIFEST.map(entry => entry.family));
    for (const id of SPECIAL_BIOME_FAMILY_IDS) assert.ok(manifestFamilies.has(id), "missing family " + id);
    // The final eleven points are atlas and cross-system integration work, not
    // additional biomes. They still need an explicit place in the manifest.
    for (const integration of ["atlas", "integration"]) assert.ok(manifestFamilies.has(integration));
    for (const entry of SPECIAL_BIOME_MANIFEST) {
        assert.match(entry.id, /^1\.2\.17\.\d+$/);
        assert.ok(entry.label.length > 1);
        assert.ok(SPECIAL_BIOME_FAMILIES[entry.family] || entry.family === "atlas" || entry.family === "integration");
    }
    assert.equal(Object.keys(RARE_GOODS).length, 9);
});

test("all nine families declare the data the atlas and the survey need", () => {
    assert.equal(SPECIAL_BIOME_FAMILY_IDS.length, 9);
    for (const id of SPECIAL_BIOME_FAMILY_IDS) {
        const family = SPECIAL_BIOME_FAMILIES[id];
        assert.ok(family.tint.length === 3);
        assert.ok(family.radius[0] < family.radius[1]);
        assert.ok(family.variants.length >= 3);
        assert.ok(family.featureKinds.length >= 5);
        assert.ok(family.features.length >= 8);
        assert.ok(family.resource in RARE_GOODS);
        assert.ok(family.boon.length > 20);
        assert.ok(family.hazard.length > 20);
        assert.ok(family.origins.length >= 2);
    }
});

test("atlas generation is deterministic, bounded and never overlaps", () => {
    const first = setupWorld();
    assert.ok(first.regions.length >= 1);
    assert.ok(first.regions.length <= SPECIAL_BIOME_MAX_REGIONS);
    const snapshot = first.regions.map(region => [region.id, region.family, region.x, region.y, region.radius, region.features.length]);
    const second = setupWorld();
    assert.deepEqual(second.regions.map(region => [region.id, region.family, region.x, region.y, region.radius, region.features.length]), snapshot);
    for (const region of first.regions) {
        assert.ok(region.x >= 3 && region.x < state.worldW - 3);
        assert.ok(region.y >= 3 && region.y < state.worldH - 3);
        assert.ok(region.features.length >= 5 && region.features.length <= 9);
        assert.ok(region.radius >= 1 && region.radius <= 12);
        assert.equal(region.resource, SPECIAL_BIOME_FAMILIES[region.family].resource);
    }
    for (let left = 0; left < first.regions.length; left++) {
        for (let right = left + 1; right < first.regions.length; right++) {
            const a = first.regions[left];
            const b = first.regions[right];
            assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > a.radius + b.radius, `${a.id} overlaps ${b.id}`);
        }
    }
});

test("the one-byte tile map answers atlas lookups without a second tile graph", () => {
    const atlas = setupWorld();
    assert.ok(state.specialBiomeMap instanceof Uint8Array);
    assert.equal(state.specialBiomeMap.length, state.worldW * state.worldH);
    assert.equal(state.specialBiomeMap.filter(Boolean).length > 0, true);
    for (const region of atlas.regions) {
        assert.equal(specialBiomeRegionAt(state.specialBiomeMap, state.worldW, region.x, region.y), region.index + 1);
        assert.equal(getSpecialBiomeAt(region.x, region.y)?.id, region.id);
    }
    assert.equal(specialBiomeRegionAt(state.specialBiomeMap, state.worldW, -1, 0), 0);
    assert.equal(specialBiomeRegionAt(state.specialBiomeMap, state.worldW, 0, state.worldH + 2), 0);
});

test("exploring a region discovers it once and pays its rare good annually", () => {
    const atlas = setupWorld();
    const region = atlas.regions[0];
    state.explored[Math.floor(region.x)][Math.floor(region.y)] = true;
    state.tick = 199;
    updateSpecialBiomes();
    assert.equal(region.discovered, false);
    state.tick = 200;
    updateSpecialBiomes();
    assert.equal(region.discovered, true);
    assert.equal(region.discoveredYear, state.year);
    assert.equal(atlas.totalDiscovered, 1);
    // The first annual settlement has already happened before the region was
    // discovered, so the first yield arrives in the next year.
    const amount = Math.max(1, Math.round(region.richness));
    state.year = 2;
    updateSpecialBiomes();
    assert.equal(atlas.rareGoods[region.resource], amount);
    assert.equal(atlas.totalYield, amount);
    const exact = atlas.rareGoods[region.resource];
    updateSpecialBiomes();
    assert.equal(atlas.rareGoods[region.resource], exact);
    state.year = 3;
    updateSpecialBiomes();
    assert.equal(atlas.rareGoods[region.resource], exact + amount);
    assert.equal(atlas.totalYield, amount * 2);
});

test("three rare goods permanently attune a discovered region", () => {
    const atlas = setupWorld();
    const region = atlas.regions.find(entry => entry.family !== "blighted-land");
    state.explored[Math.floor(region.x)][Math.floor(region.y)] = true;
    state.tick = 200;
    updateSpecialBiomes();
    atlas.rareGoods[region.resource] = 2;
    const denied = attuneSpecialBiome(region.id);
    assert.equal(denied.ok, false);
    assert.equal(denied.reason, "not-enough-rare-goods");
    atlas.rareGoods[region.resource] = 4;
    const result = attuneSpecialBiome(region.id);
    assert.equal(result.ok, true);
    assert.equal(region.attuned, true);
    assert.equal(atlas.rareGoods[region.resource], 1);
    assert.equal(atlas.totalAttuned, 1);
    assert.equal(attuneSpecialBiome(region.id).reason, "already-attuned");
});

test("blight can be cleansed and the survey snapshot exposes real state", () => {
    const atlas = createSpecialBiomeState({ seed: SEED, rareGoods: { "blight-resin": 4 } }, [{
        id: "blight-test", family: "blighted-land", x: 40, y: 40, radius: 3,
        discovered: true, discoveredYear: 1, richness: 1.2
    }]);
    state.specialBiomes = atlas;
    state.worldW = 120;
    state.worldH = 120;
    state.year = 3;
    state.resources = { wood: 100, stone: 100, gold: 20, food: 100 };
    rebuildSpecialBiomeAtlas();
    const result = cleanseSpecialBiome("blight-test");
    assert.equal(result.ok, true);
    assert.equal(atlas.regions[0].cleansed, true);
    assert.equal(atlas.regions[0].spread, 0);
    assert.equal(atlas.rareGoods["blight-resin"], 1);
    assert.equal(state.resources.gold, 8);
    const snapshot = getSpecialBiomeSnapshot();
    assert.equal(snapshot.regions[0].familyLabel, "Blighted Land");
    assert.equal(snapshot.manifestCount, 100);
    assert.equal(snapshot.rareGoods.length, 9);
    assert.equal(snapshot.rareGoods.every(good => typeof good.count === "number"), true);
});

test("rare goods have a real market value and never go negative", () => {
    const atlas = setupWorld();
    atlas.rareGoods["star-metal"] = 2;
    const gold = state.resources.gold;
    const sale = sellSpecialGood("star-metal", 1);
    assert.equal(sale.ok, true);
    assert.equal(state.resources.gold, gold + RARE_GOODS["star-metal"].value);
    assert.equal(atlas.rareGoods["star-metal"], 1);
    assert.equal(sellSpecialGood("star-metal", 2).reason, "not-enough-rare-goods");
    assert.equal(sellSpecialGood("not-a-good").reason, "unknown-rare-good");
});

test("save serialization preserves discoveries, goods, blight and attunement", () => {
    const atlas = setupWorld();
    atlas.regions[0].discovered = true;
    atlas.regions[0].discoveredYear = 4;
    atlas.rareGoods["glowcap"] = 7;
    atlas.regions[0].spread = 2;
    atlas.regions[0].cleansed = true;
    atlas.regions[0].attuned = true;
    atlas.totalYield = 19;
    const serialized = serializeSpecialBiomeState();
    assert.equal(serialized.regions.length, atlas.regions.length);
    assert.equal(serialized.rareGoods.glowcap, 7);
    const restored = normalizeSpecialBiomeState(JSON.parse(JSON.stringify(serialized)));
    assert.equal(restored.regions[0].discovered, true);
    assert.equal(restored.regions[0].attuned, true);
    assert.equal(restored.regions[0].spread, 2);
    assert.equal(restored.rareGoods.glowcap, 7);
    assert.equal(restored.totalYield, 19);
    assert.ok(state.specialBiomeMap instanceof Uint8Array);
});

test("malformed atlas snapshots are rejected before they reach the world", () => {
    assert.throws(() => validateSpecialBiomeState(null), /object/);
    assert.throws(() => validateSpecialBiomeState({ version: 99, regions: [] }), /version/);
    assert.throws(() => validateSpecialBiomeState({ regions: [{ family: "not-a-family", x: 1, y: 1, radius: 2 }] }), /family/);
    assert.throws(() => validateSpecialBiomeState({ regions: [], rareGoods: { "not-a-good": 1 } }), /rare good/);
    assert.throws(() => validateSpecialBiomeState({
        regions: [], rareGoods: Object.fromEntries([["glowcap", -1]])
    }), /count/);
});

test("the generator respects a tiny map and the summary stays bounded", () => {
    const small = generateSpecialBiomeRegions(SEED, { climate: "temperate", resources: 50 }, {
        heights: new Float32Array(20 * 20).fill(0.7),
        moistures: new Float32Array(20 * 20).fill(0.5),
        temperatures: new Float32Array(20 * 20).fill(0.55),
        resolution: 1, pixW: 20, pixH: 20, W: 20, H: 20, sea: 0.33
    });
    assert.ok(small.length <= 2);
    const summary = specialBiomeSummary(small);
    assert.equal(summary.total, small.length);
    assert.equal(Object.keys(summary.byFamily).length, new Set(small.map(region => region.family)).size);
    const map = buildSpecialBiomeMap(small, 20, 20);
    assert.equal(map.length, 400);
});
