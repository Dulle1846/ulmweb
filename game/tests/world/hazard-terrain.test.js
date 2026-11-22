import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { createEnvironmentalHazardState, getHazardTerrainShield, restoreEnvironmentalHazardState, serializeEnvironmentalHazardState, shouldHazardTerrainConvert } from "../../js/systems/environmental-hazards.js";
import { TYPE } from "../../js/core/types.js";
import {
    getHazardMoistureOffsetAt, getHazardScarSnapshot, getHazardTerrainAt,
    isHazardTileBlocked, recordFloodScar, recordLavaScar, recordWildfireScar
} from "../../js/systems/hazard-scars.js";
import {
    generateResourceGeography, getResourceNodeAt, restoreResourceGeography,
    serializeResourceGeography
} from "../../js/systems/resource-geography.js";
import { getRoadAt } from "../../js/systems/roads.js";

const SEED = 20261122;

function setup() {
    resetState();
    state.worldSeed = SEED;
    state.worldW = 64;
    state.worldH = 64;
    state.terrainResolution = 2;
    state.terrainPixW = 128;
    state.terrainPixH = 128;
    state.seaLevel = 0.33;
    state.worldOptions = {
        size: "standard", shape: "continent", climate: "temperate",
        landmass: 50, ruggedness: 55, forests: 70, water: 48, fertility: 60, resources: 60
    };
    state.heightMap = new Float32Array(128 * 128).fill(0.82);
    for (let y = 0; y < 128; y++) {
        for (let x = 112; x < 128; x++) state.heightMap[y * 128 + x] = 0.96;
    }
    state.moistureMap = new Float32Array(128 * 128).fill(0.8);
    state.temperatureMap = new Float32Array(128 * 128).fill(0.6);
    state.roads = { version: 1, revision: 0, tiles: {} };
    state.entities = [];
    state.year = 4;
    state.seasonIndex = 1;
    state.tick = 900;
    state.environmentalHazards = createEnvironmentalHazardState();
    generateResourceGeography(SEED);
    return state.environmentalHazards;
}

function findForest() {
    for (let y = 4; y < 60; y++) {
        for (let x = 4; x < 60; x++) {
            const node = getResourceNodeAt(x, y);
            if (node?.forestCapacity > 0) return { x, y, node };
        }
    }
    return null;
}

function findStone() {
    for (let y = 4; y < 60; y++) {
        for (let x = 4; x < 60; x++) {
            const node = getResourceNodeAt(x, y);
            if (node?.stoneCapacity > 0) return { x, y, node };
        }
    }
    return null;
}

test("lava permanently converts a tile, destroys its node and blocks movement", () => {
    const entry = setup();
    const node = findForest();
    assert.ok(node, "fixture needs a forest node");
    const record = recordLavaScar(entry, node.x, node.y, { spread: 2 });
    assert.ok(record.mark, "the centre must be marked");
    assert.ok(record.marks.length >= 3, "the flow must convert more than one tile");
    assert.equal(getHazardTerrainAt(node.x, node.y)?.kind, "lava");
    assert.equal(isHazardTileBlocked(node.x, node.y), true);
    const after = getResourceNodeAt(node.x, node.y);
    assert.equal(after.forestCapacity, 0, "lava must destroy the forest node");
    assert.equal(after.forestStock, 0);
    assert.equal(after.stoneCapacity, 0, "lava must destroy any stone node");
    assert.ok(getHazardScarSnapshot().counts.lava >= 3);
    assert.ok(getHazardScarSnapshot().terrainTiles >= 3);
    assert.ok(getHazardMoistureOffsetAt(node.x, node.y) < 0, "basalt is drier than the original ground");
});

test("wildfire changes vegetation without making the tile impassable", () => {
    const entry = setup();
    const node = findForest();
    assert.ok(node, "fixture needs a forest node");
    const before = getResourceNodeAt(node.x, node.y);
    const record = recordWildfireScar(entry, node.x, node.y, { spread: 2 });
    assert.ok(record.marks.length >= 3);
    assert.equal(getHazardTerrainAt(node.x, node.y)?.kind, "burnt");
    assert.equal(isHazardTileBlocked(node.x, node.y), false, "burnt ground remains walkable");
    const after = getResourceNodeAt(node.x, node.y);
    assert.equal(after.forestStock, 0, "the burn removes standing timber and forage");
    assert.ok(after.forestCapacity < before.forestCapacity, "the burn permanently lowers the stand's capacity");
    assert.ok(getHazardMoistureOffsetAt(node.x, node.y) < 0);
});

test("flood raises moisture, converts resource tiles and cuts a real road", () => {
    const entry = setup();
    const node = findForest();
    assert.ok(node, "fixture needs a forest node");
    state.roads.tiles[node.x + ":" + node.y] = { type: "dirt", builtAtTick: 0, condition: 100 };
    const before = getResourceNodeAt(node.x, node.y);
    const record = recordFloodScar(entry, node.x, node.y, { spread: 2 });
    assert.ok(record.marks.length >= 3);
    assert.equal(getHazardTerrainAt(node.x, node.y)?.kind, "flooded");
    assert.equal(isHazardTileBlocked(node.x, node.y), true, "fresh floodwater is impassable");
    assert.ok(getHazardMoistureOffsetAt(node.x, node.y) > 0, "the tile must become wetter");
    const after = getResourceNodeAt(node.x, node.y);
    assert.ok(after.forestCapacity < before.forestCapacity);
    assert.equal(after.forestStock, 0);
    assert.equal(after.waterAccess, true);

    // A 3.39-era snapshot has marks but no capacity deltas. Restoring it must
    // cut the saved road and convert the node without corrupting the tile.
    const legacyHazard = JSON.parse(JSON.stringify(serializeEnvironmentalHazardState()));
    restoreEnvironmentalHazardState(legacyHazard);
    assert.equal(getRoadAt(node.x, node.y), null, "the road crossed by the flood must be destroyed");
    assert.equal(getHazardTerrainAt(node.x, node.y)?.kind, "flooded");
    assert.equal(getResourceNodeAt(node.x, node.y).forestStock, 0);
});

test("real protection works measurably raise the conversion shield", () => {
    setup();
    assert.equal(getHazardTerrainShield("wildfire"), 0);
    assert.equal(shouldHazardTerrainConvert("wildfire", 0.1), true);
    for (let i = 0; i < 2; i++) {
        state.entities.push({ id: "firebreak-" + i, type: TYPE.FIREBREAK, x: 8 + i, y: 8, dead: false, isBuilding: () => true });
    }
    assert.ok(getHazardTerrainShield("wildfire") > 0.5);
    assert.equal(shouldHazardTerrainConvert("wildfire", 0.1), false, "a strong firebreak line stops the conversion roll");
    assert.equal(shouldHazardTerrainConvert("wildfire", 0.9), true, "protection is a shield, not immunity");

    state.entities.push({ id: "dam", type: TYPE.DAM, x: 20, y: 20, dead: false, isBuilding: () => true });
    state.entities.push({ id: "drain", type: TYPE.DRAINAGE, x: 22, y: 20, dead: false, isBuilding: () => true });
    assert.ok(getHazardTerrainShield("flood") > 0.2, "dams and drainage must shield flood conversion");
});

test("a new save round-trips terrain, capacity damage, nodes and blockades exactly", () => {
    const entry = setup();
    const forest = findForest();
    const stone = findStone();
    assert.ok(forest && stone, "fixture needs forest and stone nodes");
    recordLavaScar(entry, forest.x, forest.y, { spread: 1 });
    recordFloodScar(entry, stone.x, stone.y, { spread: 1 });
    recordWildfireScar(entry, forest.x + 3, forest.y, { spread: 1 });
    const hazardSnapshot = JSON.parse(JSON.stringify(serializeEnvironmentalHazardState()));
    const geographySnapshot = JSON.parse(JSON.stringify(serializeResourceGeography()));
    assert.ok(geographySnapshot.forestCapacity.length > 0, "damage must be written as a capacity delta");
    const blocked = [forest.x, forest.y, isHazardTileBlocked(forest.x, forest.y)];
    const forestAfter = getResourceNodeAt(forest.x, forest.y);
    const stoneAfter = getResourceNodeAt(stone.x, stone.y);

    resetState();
    setup();
    restoreResourceGeography(geographySnapshot);
    restoreEnvironmentalHazardState(hazardSnapshot);

    assert.deepEqual(serializeEnvironmentalHazardState(), hazardSnapshot);
    assert.deepEqual(serializeResourceGeography(), geographySnapshot);
    assert.equal(getHazardTerrainAt(forest.x, forest.y)?.kind, "lava");
    assert.equal(isHazardTileBlocked(blocked[0], blocked[1]), blocked[2]);
    assert.equal(getResourceNodeAt(forest.x, forest.y).forestCapacity, forestAfter.forestCapacity);
    assert.equal(getResourceNodeAt(forest.x, forest.y).forestStock, forestAfter.forestStock);
    assert.equal(getResourceNodeAt(stone.x, stone.y).forestCapacity, stoneAfter.forestCapacity);
    assert.equal(getResourceNodeAt(stone.x, stone.y).forestStock, stoneAfter.forestStock);
});
