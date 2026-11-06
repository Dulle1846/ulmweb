import test from "node:test";
import assert from "node:assert/strict";
import {
    WORLD_SIZES, WORLD_SHAPES, CLIMATES, DEFAULT_WORLD_OPTIONS,
    normalizeWorldOptions, resolveWorldDimensions, seaLevelFor,
    initNoise, sampleHeight, classifyTerrain, gameplayBiome, carveWaterFeatures,
} from "../../js/world/terrain-model.js";
import {
    defaultInterior, normalizeInterior, INTERIOR_ITEM_IDS, REBUILD_COST,
} from "../../js/presentation/rendering/building-art.js";
import { BUILDING_SIZE } from "../../js/core/config.js";

test("world sizes grow from compact to vast", () => {
    assert.ok(WORLD_SIZES.compact.w < WORLD_SIZES.standard.w);
    assert.ok(WORLD_SIZES.standard.w < WORLD_SIZES.grand.w);
    assert.ok(WORLD_SIZES.grand.w < WORLD_SIZES.vast.w);
    assert.ok(WORLD_SIZES.vast.w >= 288);
});

test("every shape and climate is selectable and documented", () => {
    assert.equal(WORLD_SHAPES.length, 5);
    assert.equal(CLIMATES.length, 5);
    for (const entry of [...WORLD_SHAPES, ...CLIMATES]) {
        assert.ok(entry.id && entry.label && entry.note, entry.id);
    }
});

test("world options clamp sliders and fall back on unknown presets", () => {
    const normalized = normalizeWorldOptions({
        size: "gigantic", shape: "donut", climate: "lava",
        landmass: 500, ruggedness: -20, forests: "wet", water: 61,
    });
    assert.equal(normalized.size, DEFAULT_WORLD_OPTIONS.size);
    assert.equal(normalized.shape, DEFAULT_WORLD_OPTIONS.shape);
    assert.equal(normalized.climate, DEFAULT_WORLD_OPTIONS.climate);
    assert.equal(normalized.landmass, 100);
    assert.equal(normalized.ruggedness, 0);
    assert.equal(normalized.forests, DEFAULT_WORLD_OPTIONS.forests);
    assert.equal(normalized.water, 61);
});

test("resolved dimensions follow the selected size preset", () => {
    assert.deepEqual(resolveWorldDimensions({ size: "vast" }), { w: 288, h: 288, id: "vast" });
    assert.equal(resolveWorldDimensions({ size: "nonsense" }).w, WORLD_SIZES.standard.w);
});

test("more water raises the sea level, more landmass lowers it", () => {
    const dry = seaLevelFor({ water: 5, landmass: 50 });
    const wet = seaLevelFor({ water: 95, landmass: 50 });
    const land = seaLevelFor({ water: 48, landmass: 100 });
    assert.ok(wet > dry);
    assert.ok(land < seaLevelFor({ water: 48, landmass: 0 }));
});

test("height sampling is deterministic for the same seed and options", () => {
    initNoise(4242);
    const options = normalizeWorldOptions({ size: "compact" });
    const first = sampleHeight(40, 40, 128, 128, options);
    initNoise(4242);
    const second = sampleHeight(40, 40, 128, 128, options);
    assert.equal(first, second);
    initNoise(99);
    const otherSeed = sampleHeight(40, 40, 128, 128, options);
    assert.notEqual(first, otherSeed);
});

test("world shapes produce different terrain at the same point", () => {
    initNoise(7);
    const continent = normalizeWorldOptions({ shape: "continent", size: "standard" });
    const valley = normalizeWorldOptions({ shape: "valley", size: "standard" });
    const inland = normalizeWorldOptions({ shape: "inland", size: "standard" });
    const a = sampleHeight(24, 24, 176, 176, continent);
    const b = sampleHeight(24, 24, 176, 176, valley);
    const c = sampleHeight(24, 24, 176, 176, inland);
    assert.notEqual(a, b);
    assert.notEqual(a, c);
});

test("biome classification reads water, snow, desert and swamp", () => {
    assert.equal(classifyTerrain(0.2, 0.5, 0.5, 0.33), "water");
    assert.equal(classifyTerrain(0.9, 0.5, 0.1, 0.33), "snow");
    assert.equal(classifyTerrain(0.55, 0.2, 0.8, 0.33), "desert");
    assert.equal(classifyTerrain(0.35, 0.85, 0.55, 0.33), "swamp");
});

test("gameplay biomes keep the original water/sand/grass/forest vocabulary", () => {
    assert.equal(gameplayBiome("water"), "water");
    assert.equal(gameplayBiome("desert"), "sand");
    assert.equal(gameplayBiome("taiga"), "forest");
    assert.equal(gameplayBiome("meadow"), "grass");
});

test("river carving cuts a channel and ends in water or a lake", () => {
    const width = 64, height = 48;
    const heights = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) heights[y * width + x] = 0.92 - x * 0.012;
    }
    const sea = 0.33;
    const rivers = carveWaterFeatures(heights, width, height, 2024, sea, {});
    assert.ok(rivers.length > 0, "at least one river should be carved");
    let underwater = 0;
    for (const value of heights) if (value < sea) underwater++;
    assert.ok(underwater > rivers[0].length, "the river must widen into water");
});

test("interior defaults differ between a cottage and a tavern", () => {
    const house = defaultInterior(0);
    const tavern = defaultInterior(7);
    assert.notDeepEqual(house, tavern);
    assert.ok(tavern.chair > house.chair);
    for (const id of INTERIOR_ITEM_IDS) {
        assert.ok(Number.isFinite(house[id]), id);
        assert.ok(house[id] >= 0 && house[id] <= 12, id);
    }
});

test("interior edits clamp to the supported range", () => {
    const edited = normalizeInterior(1, { bed: 99, chair: -4, statue: "two" });
    assert.equal(edited.bed, 12);
    assert.equal(edited.chair, 0);
    assert.equal(edited.statue, defaultInterior(1).statue);
});

test("every structure knows what rebuilding it costs", () => {
    for (const key of Object.keys(BUILDING_SIZE)) {
        const cost = REBUILD_COST[key];
        assert.ok(cost && typeof cost === "object", "missing rebuild cost for " + key);
        assert.ok(Object.values(cost).some(amount => amount > 0), "empty rebuild cost for " + key);
    }
});
