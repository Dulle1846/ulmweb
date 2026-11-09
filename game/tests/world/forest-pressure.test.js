import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { forestRegrowthFactor } from "../../js/world/forest-ecology.js";
import {
    generateResourceGeography, getResourceNodeAt, harvestForest, regrowForests,
} from "../../js/systems/resource-geography.js";
import { forestProductsAt } from "../../js/systems/forest-gathering.js";
import { forestHerdGrowth } from "../../js/systems/forest-fauna.js";

function setup(seed = 20261108) {
    resetState();
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
}

function forestTiles() {
    let normal = null;
    let compacted = null;
    for (let y = 2; y < state.worldH - 2 && (!normal || !compacted); y++) {
        for (let x = 2; x < state.worldW - 2 && (!normal || !compacted); x++) {
            const node = getResourceNodeAt(x, y);
            if (!node?.forestCapacity) continue;
            const products = forestProductsAt(x, y, 150);
            if (!products) continue;
            const tile = { x, y, node, stand: products.stand };
            if (!normal && !products.stand.ground.trail) normal = tile;
            if (!compacted && products.stand.ground.trail) compacted = tile;
        }
    }
    return [normal, compacted].filter(Boolean);
}

test("compaction is a measurable regeneration brake", () => {
    assert.equal(forestRegrowthFactor(null), 1);
    assert.equal(forestRegrowthFactor({ ground: { compaction: 0 } }), 1);
    const compacted = forestRegrowthFactor({ ground: { compaction: 0.75 } });
    const severe = forestRegrowthFactor({ ground: { compaction: 1 } });
    assert.ok(compacted < 0.65);
    assert.ok(severe < compacted);
    assert.ok(severe >= 0.35);
    const browsed = forestRegrowthFactor({ ground: { compaction: 0 }, browsingPressure: 0.8 });
    assert.ok(browsed < 1, "browsing must slow regeneration without new saved state");
});

test("hunting pressure measurably slows herd growth", () => {
    const base = { population: 12, capacity: 20, reproduction: 0.11, mortality: 0.035 };
    const calm = forestHerdGrowth({ ...base, huntingPressure: 0 });
    const hunted = forestHerdGrowth({ ...base, huntingPressure: 0.65 });
    const severe = forestHerdGrowth({ ...base, huntingPressure: 1 });
    assert.ok(calm > hunted, "moderate hunting must reduce the daily gain");
    assert.ok(hunted > severe, "severe hunting must reduce it further");
    // A slow-breeding herd on otherwise good ground can tip into decline when
    // hunting pressure is at its maximum.
    assert.ok(forestHerdGrowth({
        population: 1, capacity: 20, reproduction: 0.07, mortality: 0.05, huntingPressure: 1,
    }) < 0);
    const predated = forestHerdGrowth({ ...base, predationPressure: 0.7 });
    assert.ok(predated < calm, "predator pressure must reduce herd growth");
});

test("a compacted cut-over stand regrows slower than a normal stand", () => {
    setup();
    const tiles = forestTiles();
    assert.equal(tiles.length, 2, "the generated world should expose both trailed and untrailed forest tiles");
    const normal = tiles[0], cut = tiles[1];
    assert.equal(normal.stand.ground.trail, false);
    assert.equal(cut.stand.ground.trail, true);
    const normalFactor = forestRegrowthFactor(normal.stand);
    const cutFactor = forestRegrowthFactor(cut.stand);
    assert.ok(cutFactor < normalFactor);
    harvestForest(normal.x, normal.y, normal.node.forestStock);
    harvestForest(cut.x, cut.y, cut.node.forestStock);
    const beforeNormal = getResourceNodeAt(normal.x, normal.y).forestStock;
    const beforeCut = getResourceNodeAt(cut.x, cut.y).forestStock;
    regrowForests(400);
    const afterNormal = getResourceNodeAt(normal.x, normal.y).forestStock;
    const afterCut = getResourceNodeAt(cut.x, cut.y).forestStock;
    assert.ok(afterNormal > beforeNormal);
    assert.ok(afterCut > beforeCut);
    assert.ok(afterNormal - beforeNormal > afterCut - beforeCut, "trailed forest ground must recover less stock");
});
