import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
    WORLD_SIZES, WORLD_SHAPES, CLIMATES, DEFAULT_WORLD_OPTIONS,
    normalizeWorldOptions, resolveWorldDimensions, seaLevelFor,
    initNoise, sampleHeight, sampleMoisture, sampleTemperature,
    classifyTerrain, gameplayBiome, carveWaterFeatures,
    terrainResolutionFor, generateWorldData, getWorldData, clearWorldDataCache, worldDataKey,
    TERRAIN_GENERATION_VERSION, resolveSavedTerrainVersion, renderWorldPreview,
} from "../../js/world/terrain-model.js";
import {
    defaultInterior, normalizeInterior, INTERIOR_ITEM_IDS, REBUILD_COST,
} from "../../js/presentation/rendering/building-art.js";
import { BUILDING_SIZE } from "../../js/core/config.js";

test("world sizes grow from compact to colossal", () => {
    const order = ["compact", "standard", "grand", "vast", "huge", "gigantic", "colossal"];
    for (let i = 1; i < order.length; i++) {
        assert.ok(WORLD_SIZES[order[i - 1]].w < WORLD_SIZES[order[i]].w, order[i]);
    }
    assert.ok(WORLD_SIZES.colossal.w >= 576);
    assert.equal(terrainResolutionFor(128, 128), 5);
    assert.equal(terrainResolutionFor(176, 176), 4);
    assert.equal(terrainResolutionFor(288, 288), 3);
    assert.equal(terrainResolutionFor(352, 352), 3);
    assert.equal(terrainResolutionFor(448, 448), 2);
    assert.equal(terrainResolutionFor(576, 576), 2);
    assert.ok(WORLD_SIZES.colossal.w * terrainResolutionFor(576, 576) <= 1152, "terrain memory must stay bounded");
});

test("every shape and climate is selectable and documented", () => {
    assert.equal(WORLD_SHAPES.length, 5);
    assert.equal(CLIMATES.length, 7);
    for (const entry of [...WORLD_SHAPES, ...CLIMATES]) {
        assert.ok(entry.id && entry.label && entry.note, entry.id);
    }
});

test("world options clamp sliders and fall back on unknown presets", () => {
    const normalized = normalizeWorldOptions({
        size: "impossible", shape: "donut", climate: "lava",
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

test("mountains and coastline sliders reshape the landmass", () => {
    initNoise(31337);
    const base = normalizeWorldOptions({ size: "standard" });
    const sample = overrides => {
        let sum = 0, max = 0;
        for (let y = 8; y < 176; y += 8) {
            for (let x = 8; x < 176; x += 8) {
                const height = sampleHeight(x, y, 176, 176, { ...base, ...overrides });
                sum += height;
                max = Math.max(max, height);
            }
        }
        return { sum, max };
    };
    const low = sample({ mountains: 0 });
    const high = sample({ mountains: 100 });
    assert.ok(high.sum > low.sum, "more mountains must lift the terrain");
    assert.ok(high.max > low.max, "more mountains must raise the peaks");

    const smooth = normalizeWorldOptions({ size: "standard", coastline: 0 });
    const ragged = normalizeWorldOptions({ size: "standard", coastline: 100 });
    let differences = 0;
    for (let y = 8; y < 176; y += 8) {
        for (let x = 2; x < 40; x += 2) {
            if (sampleHeight(x, y, 176, 176, smooth) !== sampleHeight(x, y, 176, 176, ragged)) differences++;
        }
    }
    assert.ok(differences > 0, "coastline must alter the edge of the landmass");
});

test("snow, wetlands and aridity sliders shift climate and moisture", () => {
    const base = normalizeWorldOptions({ size: "standard" });
    const cold = sampleTemperature(90, 60, 176, 176, 0.6, 0.33, { ...base, snow: 100 });
    const warm = sampleTemperature(90, 60, 176, 176, 0.6, 0.33, { ...base, snow: 0 });
    assert.ok(cold < warm - 0.05, "more snow must lower the temperature");

    const dry = sampleMoisture(90, 60, { ...base, aridity: 100, wetlands: 0 });
    const wet = sampleMoisture(90, 60, { ...base, aridity: 0, wetlands: 100 });
    assert.ok(wet > dry + 0.1, "wetlands must make the land wetter than aridity");

    const arid = sampleTemperature(90, 60, 176, 176, 0.6, 0.33, { ...base, aridity: 100 });
    const mild = sampleTemperature(90, 60, 176, 176, 0.6, 0.33, { ...base, aridity: 0 });
    assert.ok(arid > mild + 0.03, "aridity must raise the temperature");
});

test("river and lake sliders control how much water is carved", () => {
    const width = 320, height = 240, sea = 0.33;
    const makeGrid = () => {
        const heights = new Float32Array(width * height);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) heights[y * width + x] = 0.92 - x * 0.0022;
        }
        return heights;
    };
    const dry = makeGrid();
    const wet = makeGrid();
    const dryRivers = carveWaterFeatures(dry, width, height, 2024, sea, { rivers: 0, lakes: 0 });
    const wetRivers = carveWaterFeatures(wet, width, height, 2024, sea, { rivers: 100, lakes: 100 });
    assert.ok(wetRivers.length >= dryRivers.length, "more rivers must not carve fewer channels");
    const underwater = grid => {
        let count = 0;
        for (const value of grid) if (value < sea) count++;
        return count;
    };
    assert.ok(underwater(wet) > underwater(dry), "rivers and lakes must add up to more water");
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
    assert.equal(gameplayBiome("tundra"), "grass");
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

test("generation v3 carves soft basins while older versions stay reproducible", () => {
    clearWorldDataCache();
    const options = { size: "standard", shape: "continent", climate: "temperate" };
    const current = generateWorldData(20261104, options);
    assert.equal(current.terrainVersion, TERRAIN_GENERATION_VERSION);
    const sea = current.sea;
    let water = 0;
    let flatLegacyPlates = 0;
    for (const height of current.heights) {
        if (height < sea) water++;
        if (Math.abs(height - (sea - 0.012)) < 1e-7) flatLegacyPlates++;
    }
    assert.ok(water > 0, "a temperate continent must contain water");
    assert.equal(flatLegacyPlates, 0, "v3 must not leave flat sea-level plates behind");
    assert.ok(current.rivers.length > 0, "v3 must still carve rivers");

    const legacy = generateWorldData(20261104, options, 1);
    assert.equal(legacy.terrainVersion, 1);
    let differences = 0;
    for (let index = 0; index < legacy.heights.length; index += 97) {
        if (legacy.heights[index] !== current.heights[index]) differences++;
    }
    assert.ok(differences > 0, "a legacy world must keep the version-1 generator");
    assert.notEqual(overlapKey(options), worldDataKey(20261104, options, 1));
    clearWorldDataCache();
});

function overlapKey(options) {
    return worldDataKey(20261104, options, TERRAIN_GENERATION_VERSION);
}

test("saved terrain versions keep their generator", () => {
    assert.equal(resolveSavedTerrainVersion(undefined), 1);
    assert.equal(resolveSavedTerrainVersion(0), 1);
    assert.equal(resolveSavedTerrainVersion(1), 1);
    assert.equal(resolveSavedTerrainVersion(2), 2);
    assert.equal(resolveSavedTerrainVersion(3), 3);
    assert.equal(resolveSavedTerrainVersion(99), TERRAIN_GENERATION_VERSION);
});

test("generation v2 keeps old saves byte-for-byte", () => {
    const options = {
        size: "standard", shape: "continent", climate: "temperate",
        landmass: 72, ruggedness: 64, forests: 81, water: 43,
    };
    const legacy = generateWorldData(20261104, options, 2);
    assert.equal(legacy.terrainVersion, 2);
    assert.deepEqual(hashFloat32(legacy.heights), { hashA: "053909d4", hashB: "af5c36b0" });
    assert.deepEqual(hashFloat32(legacy.moistures), { hashA: "bba41b21", hashB: "8e013dad" });
});

test("generation v3 blends steep banks into the local slope", () => {
    const options = {
        size: "standard", shape: "continent", climate: "temperate",
        landmass: 66, ruggedness: 88, mountains: 78, forests: 74,
        water: 55, rivers: 65, lakes: 65,
    };
    const legacy = generateWorldData(20261203, options, 2);
    const current = generateWorldData(20261203, options, 3);
    const sea = legacy.sea;

    // The v2 generator leaves a one-sample wall at steep banks. Every such
    // water/land edge is a regression fixture for the v3 bank blend.
    const abrupt = [];
    for (let y = 0; y < legacy.pixH; y++) {
        for (let x = 0; x < legacy.pixW; x++) {
            const index = y * legacy.pixW + x;
            const height = legacy.heights[index];
            for (const [dx, dy] of [[1, 0], [0, 1]]) {
                const nx = x + dx, ny = y + dy;
                if (nx >= legacy.pixW || ny >= legacy.pixH) continue;
                const neighbour = legacy.heights[ny * legacy.pixW + nx];
                if ((height < sea) === (neighbour < sea)) continue;
                if (Math.abs(height - neighbour) > 0.3) abrupt.push({ x, y, dx, dy });
            }
        }
    }
    assert.ok(abrupt.length >= 20, "the fixture must still contain steep v2 banks");

    let worstLegacyEdge = 0;
    for (const edge of abrupt) {
        const step = Math.abs(
            current.heights[edge.y * current.pixW + edge.x]
            - current.heights[(edge.y + edge.dy) * current.pixW + edge.x + edge.dx]
        );
        worstLegacyEdge = Math.max(worstLegacyEdge, step);
    }
    assert.ok(worstLegacyEdge < 0.12, "v3 must not leave a wall where v2 cut into a steep bank");

    // No water/land edge in the new terrain should read as a carved cliff.
    let worstShore = 0;
    for (let y = 0; y < current.pixH; y++) {
        for (let x = 0; x < current.pixW; x++) {
            const index = y * current.pixW + x;
            const height = current.heights[index];
            for (const [dx, dy] of [[1, 0], [0, 1]]) {
                const nx = x + dx, ny = y + dy;
                if (nx >= current.pixW || ny >= current.pixH) continue;
                const neighbour = current.heights[ny * current.pixW + nx];
                if ((height < sea) === (neighbour < sea)) continue;
                worstShore = Math.max(worstShore, Math.abs(height - neighbour));
            }
        }
    }
    assert.ok(worstShore < 0.12, "v3 shorelines must not end in a one-sample wall");
});

test("terrain preview pixels and tile seams are stable", () => {
    clearWorldDataCache();
    const options = {
        size: "standard", shape: "continent", climate: "temperate",
        landmass: 72, ruggedness: 64, forests: 81, water: 43,
    };
    let image = null;
    const context = {
        createImageData(width, height) {
            return { width, height, data: new Uint8ClampedArray(width * height * 4) };
        },
        putImageData(value) { image = value; },
    };
    renderWorldPreview(context, 1, 1, options, 20261104);
    assert.ok(image, "the preview must produce a pixel buffer without a DOM");
    assert.deepEqual(hashBytes(image.data), { hashA: "44974c7f", hashB: "6885a8bf" });
    assert.deepEqual(terrainSeamSpikes(image, 4), [], "tile boundaries must not create pixel seams");
    clearWorldDataCache();
});

test("browser terrain goldens match the current generator", async () => {
    const golden = JSON.parse(await readFile(
        new URL("../browser/terrain-hashes.golden.json", import.meta.url), "utf8"
    ));
    const options = {
        size: "standard", shape: "continent", climate: "temperate",
        landmass: 72, ruggedness: 64, forests: 81, water: 43,
    };
    const data = generateWorldData(20261104, options);
    const hashes = {
        heightMap: { kind: "Float32Array", length: data.heights.length, ...hashFloat32(data.heights) },
        moistureMap: { kind: "Float32Array", length: data.moistures.length, ...hashFloat32(data.moistures) },
        temperatureMap: { kind: "Float32Array", length: data.temperatures.length, ...hashFloat32(data.temperatures) },
    };
    assert.deepEqual(hashes, {
        heightMap: golden.hashes.heightMap,
        moistureMap: golden.hashes.moistureMap,
        temperatureMap: golden.hashes.temperatureMap,
    });
});

test("preview and realm share one cached world data set", () => {
    clearWorldDataCache();
    const options = {
        size: "compact", shape: "archipelago", climate: "northern",
        rivers: 65, lakes: 35, coastline: 70, snow: 60,
    };
    const key = worldDataKey(2026, options);
    const first = getWorldData(2026, options);
    const second = getWorldData(2026, { ...options });
    assert.equal(second, first, "identical seed and options must reuse the exact arrays");
    assert.equal(worldDataKey(2026, options), key);
    assert.notEqual(worldDataKey(2027, options), key, "a new seed must invalidate the cache");
    assert.equal(first.pixW, first.dims.w * terrainResolutionFor(first.dims.w, first.dims.h));
    assert.equal(first.heights.length, first.pixW * first.pixH);
    assert.equal(first.moistures.length, first.heights.length);
    assert.equal(first.temperatures.length, first.heights.length);
    assert.ok(first.rivers.every(path => path.every(point => (
        point.x >= 0 && point.x < first.pixW && point.y >= 0 && point.y < first.pixH
    ))), "every carved river point must lie inside the shared grid");

    const generated = generateWorldData(2026, options);
    assert.notEqual(generated, first, "explicit generation must return independent data");
    assert.notEqual(generated.heights, first.heights);
    for (const index of [0, 123, 5000, first.heights.length - 1]) {
        assert.equal(generated.heights[index], first.heights[index], "same seed and options must recreate the same terrain");
    }
    assert.deepEqual(generated.rivers, first.rivers);
    clearWorldDataCache();
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

function hashFloat32(value) {
    let hashA = 2166136261 >>> 0;
    let hashB = 5381 >>> 0;
    const addByte = byte => {
        hashA ^= byte; hashA = Math.imul(hashA, 16777619) >>> 0;
        hashB = ((hashB << 5) + hashB + byte) >>> 0;
    };
    const addText = text => {
        addByte(255);
        for (let index = 0; index < text.length; index++) {
            const code = text.charCodeAt(index);
            addByte(code & 255); addByte((code >>> 8) & 255);
        }
    };
    addText("typed:Float32Array:" + value.length);
    for (const byte of new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) addByte(byte);
    return {
        hashA: hashA.toString(16).padStart(8, "0"),
        hashB: hashB.toString(16).padStart(8, "0"),
    };
}

function hashBytes(bytes) {
    let hashA = 2166136261 >>> 0;
    let hashB = 5381 >>> 0;
    for (const byte of bytes) {
        hashA ^= byte; hashA = Math.imul(hashA, 16777619) >>> 0;
        hashB = ((hashB << 5) + hashB + byte) >>> 0;
    }
    return {
        hashA: hashA.toString(16).padStart(8, "0"),
        hashB: hashB.toString(16).padStart(8, "0"),
    };
}

// A display-space seam test: tile boundaries are every `resolution` terrain
// samples. Compare each boundary's mean luminance step with its immediate
// neighbourhood; a boundary-specific spike would mean a tiled artifact.
function terrainSeamSpikes(image, resolution) {
    const { width, height, data } = image;
    const luminance = new Float64Array(width * height);
    for (let pixel = 0, index = 0; pixel < data.length; pixel += 4, index++) {
        luminance[index] = data[pixel] * 0.2126 + data[pixel + 1] * 0.7152 + data[pixel + 2] * 0.0722;
    }
    const columnDiff = new Float64Array(width - 1);
    const rowDiff = new Float64Array(height - 1);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width - 1; x++) {
            columnDiff[x] += Math.abs(luminance[y * width + x] - luminance[y * width + x + 1]);
        }
    }
    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height - 1; y++) {
            rowDiff[y] += Math.abs(luminance[y * width + x] - luminance[(y + 1) * width + x]);
        }
    }
    for (let x = 0; x < columnDiff.length; x++) columnDiff[x] /= height;
    for (let y = 0; y < rowDiff.length; y++) rowDiff[y] /= width;

    const spikes = [];
    const inspect = (diffs, axis) => {
        for (let index = resolution - 1; index < diffs.length; index += resolution) {
            const local = Math.max(
                diffs[index - 1] ?? 0, diffs[index + 1] ?? 0,
                diffs[index - 2] ?? 0, diffs[index + 2] ?? 0,
            );
            if (diffs[index] > local * 1.35 + 2) {
                spikes.push(axis + ":" + index + ":" + diffs[index].toFixed(3));
            }
        }
    };
    inspect(columnDiff, "column");
    inspect(rowDiff, "row");
    return spikes;
}
