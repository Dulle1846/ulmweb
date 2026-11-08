import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { spawnEntity } from "../../js/world/entities.js";
import {
    generateResourceGeography, getResourceNodeAt, harvestForest,
} from "../../js/systems/resource-geography.js";
import { foresterRangeSummary, updateFields } from "../../js/systems/fields.js";
import { updateBuildingIncome } from "../../js/simulation/buildings.js";

function setup() {
    resetState();
    state.hasStarted = true;
    state.isPaused = false;
    state.gameOver = false;
    state.tick = 0;
    state.year = 1;
    state.dayOfYear = 0;
    state.seasonIndex = 0;
    state.worldSeed = 20261108;
    state.worldW = 48;
    state.worldH = 48;
    state.terrainResolution = 2;
    state.terrainPixW = 96;
    state.terrainPixH = 96;
    state.worldOptions = { landmass: 50, ruggedness: 55, forests: 70, water: 48, climate: "temperate" };
    state.heightMap = new Float32Array(96 * 96).fill(0.7);
    state.moistureMap = new Float32Array(96 * 96).fill(0.8);
    state.temperatureMap = new Float32Array(96 * 96).fill(0.55);
    state.resources = { wood: 200, stone: 200, gold: 100, food: 100 };
    generateResourceGeography(state.worldSeed);
}

function forestSite() {
    for (let y = 8; y < 40; y++) {
        for (let x = 8; x < 40; x++) {
            let trees = 0;
            for (let oy = -5; oy <= 5; oy++) {
                for (let ox = -5; ox <= 5; ox++) {
                    if (getResourceNodeAt(x + ox, y + oy)?.forestCapacity > 0) trees++;
                }
            }
            if (trees >= 6) return { x, y };
        }
    }
    throw new Error("fixture needs a forest site with at least six nearby stands");
}

function nearbyForest(site) {
    const tiles = [];
    for (let oy = -5; oy <= 5; oy++) {
        for (let ox = -5; ox <= 5; ox++) {
            const node = getResourceNodeAt(site.x + ox, site.y + oy);
            if (node?.forestCapacity > 0) tiles.push({ ...node });
        }
    }
    return tiles;
}

function employ(forester, count, site) {
    for (let index = 0; index < count; index++) {
        const worker = spawnEntity(site.x + index, site.y + 2, TYPE.VILLAGER);
        assert.ok(worker, "fixture worker should spawn");
        worker.workplace = forester;
        worker.anchor = { x: site.x, y: site.y };
        worker.jobRefreshTimer = 1_000_000;
    }
}

test("a staffed forester repairs the most depleted stands and reports its range", () => {
    setup();
    const site = forestSite();
    const forester = spawnEntity(site.x, site.y, TYPE.FORESTER);
    assert.ok(forester, "the forester should spawn on a forest site");
    employ(forester, 2, site);

    const targets = nearbyForest(site)
        .filter(node => node.x !== site.x || node.y !== site.y)
        .slice(0, 2);
    assert.equal(targets.length, 2, "the fixture needs two spare forest stands");
    for (const tile of targets) {
        assert.equal(harvestForest(tile.x, tile.y, tile.forestCapacity), tile.forestCapacity);
        assert.equal(getResourceNodeAt(tile.x, tile.y).forestStock, 0);
    }

    const before = foresterRangeSummary(forester);
    assert.ok(before.tiles >= 6);
    assert.ok(before.capacity > before.stock);
    assert.equal(before.depleted, 2);
    assert.equal(before.restorable, 2);

    updateFields();
    for (const tile of targets) {
        assert.equal(getResourceNodeAt(tile.x, tile.y).forestStock, 1, "both cut-over stands should receive a sapling");
    }
    assert.equal(forester.foresterPlanted, 2);
    assert.equal(forester.foresterReason, "Planting saplings");

    const after = foresterRangeSummary(forester);
    assert.equal(after.depleted, 0);
    assert.equal(after.restorable, 2, "the repaired stands still need to grow to capacity");

    // The Forester's catalogue entry is a site:"forest" recipe with batch 0.
    // It must not overwrite the live stewardship status with a false depletion.
    state.tick = 6;
    updateBuildingIncome();
    assert.equal(forester.productionReason, "Planting saplings");

    // One sapling per stand per tick is deliberate: keep tending until both
    // cut-over stands are full, without exceeding their capacity.
    for (let tick = 0; tick < 200; tick++) updateFields();
    const grown = foresterRangeSummary(forester);
    assert.equal(grown.depleted, 0);
    assert.equal(grown.restorable, 0);
    assert.ok(forester.foresterPlanted > 2);
    assert.equal(forester.foresterReason, "Forest is fully grown");
});
