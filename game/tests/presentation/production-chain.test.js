import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { spawnEntity } from "../../js/world/entities.js";
import {
    addLocalOutput, CARRIER_CAPACITY, depositGood, ensureInventory, initializeCityForRealm,
    setWarehouseProfile, getWarehouseSnapshot
} from "../../js/systems/logistics.js";
import {
    chainTagsFor, getProductionChainSnapshot, getWarehouseProfileSnapshot, warehouseProfileHint
} from "../../js/presentation/production-chain.js";

const WIDTH = 120;
const HEIGHT = 120;

function setup() {
    resetState();
    state.hasStarted = true;
    state.isPaused = false;
    state.gameOver = false;
    state.tick = 4;
    state.year = 1;
    state.dayOfYear = 0;
    state.seasonIndex = 0;
    state.worldSeed = 20261126;
    state.worldW = WIDTH;
    state.worldH = HEIGHT;
    state.terrainResolution = 1;
    state.terrainPixW = WIDTH;
    state.terrainPixH = HEIGHT;
    state.seaLevel = 0.33;
    state.heightMap = new Float32Array(WIDTH * HEIGHT).fill(0.62);
    state.moistureMap = new Float32Array(WIDTH * HEIGHT).fill(0.5);
    state.explored = Array.from({ length: WIDTH }, () => Array(HEIGHT).fill(true));
    state.resources = { wood: 200, stone: 200, gold: 100, food: 100 };
    state.incomeThisTick = { wood: 0, stone: 0, gold: 0, food: 0 };
    state.morale = 80;
    initializeCityForRealm({ seedWarehouse: false });
}

function place(type, x, y) {
    const entity = spawnEntity(x, y, type);
    assert.ok(entity, `${type} should spawn at ${x},${y}`);
    ensureInventory(entity);
    return entity;
}

function stage(chain, id) {
    return chain.stages.find(item => item.id === id);
}

test("01 five declared chains expose live stages, physical stock and bounded ready orders", () => {
    setup();
    const warehouse = place(TYPE.WAREHOUSE, 30, 30);
    const farm = place(TYPE.FARM, 40, 30);
    const mill = place(TYPE.MILL, 50, 30);
    const bakery = place(TYPE.BAKERY, 60, 30);
    assert.equal(depositGood("grain", 24, 30, 30), 24);
    assert.equal(depositGood("flour", 12, 30, 30), 12);
    assert.equal(addLocalOutput(farm, "grain", 6), 6);
    assert.equal(addLocalOutput(mill, "flour", 8), 8);
    assert.equal(addLocalOutput(bakery, "bread", 4), 4);

    const snapshot = getProductionChainSnapshot();
    assert.equal(snapshot.chains.length, 5);
    assert.deepEqual(snapshot.chains.map(chain => chain.id), ["bread", "timber", "stone", "water", "craft"]);
    const bread = snapshot.chains[0];
    assert.deepEqual(bread.stages.map(item => item.id), ["grain", "flour", "bread", "ale", "food-store"]);
    assert.equal(stage(bread, "grain").count, 1);
    assert.equal(stage(bread, "grain").ready, 1);
    assert.ok(stage(bread, "grain").stock >= 30, "field output and stored grain are counted once");
    assert.equal(stage(bread, "flour").status.startsWith("ORDER READY"), true);
    const supply = stage(bread, "flour").orders.find(order => order.kind === "supply" && order.good === "grain");
    assert.ok(supply, "the mill stage advertises the real grain supply order");
    assert.equal(supply.quantity, CARRIER_CAPACITY, "the advertised order is capped at one carrier load");
    assert.equal(supply.buildingId, mill.id);
    assert.equal(stage(bread, "bread").orders.some(order => order.good === "flour" && order.kind === "supply"), true);
    assert.equal(stage(bread, "ale").status, "NO STRUCTURE", "a missing brewery is reported, not invented");
    assert.equal(stage(bread, "food-store").focusBuildingId, warehouse.id);
    for (const chain of snapshot.chains) {
        for (const item of chain.stages) {
            assert.ok(item.orders.length <= 4, "each stage stays bounded");
            assert.ok(item.count >= 0 && item.ready >= 0 && item.stock >= 0);
        }
    }
    assert.equal(state.city.logistics.jobs.length, 0, "reading the inspector places no carrier jobs");
    assert.equal(warehouse.warehouse.reservedOut.grain || 0, 0);
});

test("02 warehouse profile board counts real stores, held kinds and goods with no accepting space", () => {
    setup();
    const warehouse = place(TYPE.WAREHOUSE, 30, 30);
    const lumber = place(TYPE.LUMBER, 40, 30);
    assert.equal(depositGood("grain", 18, 30, 30), 18);
    assert.equal(addLocalOutput(lumber, "logs", 7), 7);
    const changed = setWarehouseProfile(warehouse, "food");
    assert.equal(changed.ok, true);

    const snapshot = getWarehouseProfileSnapshot();
    assert.equal(snapshot.stores, 1);
    assert.equal(snapshot.used, 18);
    const general = snapshot.profiles.find(row => row.id === "general");
    const food = snapshot.profiles.find(row => row.id === "food");
    assert.equal(general.stores, 0);
    assert.equal(food.stores, 1);
    assert.equal(food.used, 18);
    assert.equal(food.heldGoodKinds, 1);
    assert.equal(food.accepts, 3);
    assert.ok(snapshot.stranded.some(row => row.good === "logs"), "local logs have no accepting store");
    assert.equal(snapshot.stranded.length <= 3, true);

    const row = getWarehouseSnapshot().rows.find(item => item.id === warehouse.id);
    assert.equal(warehouseProfileHint(row, "general"), "Accepts every hauled good.");
    assert.match(warehouseProfileHint(row, "stone"), /Switch blocked while holding Grain/);
    assert.match(warehouseProfileHint(row, "timber"), /Switch blocked while holding Grain/);
    assert.equal(warehouseProfileHint(row, "food"), "Grain, flour and bread only.");
    assert.equal(warehouseProfileHint(null, "food"), "");
});

test("03 declared chain tags match the five player routes without extra state", () => {
    assert.ok(chainTagsFor(TYPE.BAKERY).includes("bread"));
    assert.ok(chainTagsFor(TYPE.SAWMILL).includes("timber"));
    assert.ok(chainTagsFor(TYPE.MASON).includes("stone"));
    assert.ok(chainTagsFor(TYPE.WELL).includes("water"));
    assert.ok(chainTagsFor(TYPE.SMITHY).includes("craft"));
    assert.ok(chainTagsFor(TYPE.KEEP).includes("bread"));
    assert.deepEqual(chainTagsFor(TYPE.TENT), []);
});

test("04 both inspector snapshots are pure and stable across repeated reads", () => {
    setup();
    place(TYPE.WAREHOUSE, 30, 30);
    place(TYPE.MILL, 40, 30);
    depositGood("grain", 12, 30, 30);
    const resources = JSON.stringify(state.resources);
    const jobs = JSON.stringify(state.city.logistics.jobs);
    const firstChains = JSON.stringify(getProductionChainSnapshot());
    const firstProfiles = JSON.stringify(getWarehouseProfileSnapshot());

    assert.equal(JSON.stringify(getProductionChainSnapshot()), firstChains);
    assert.equal(JSON.stringify(getWarehouseProfileSnapshot()), firstProfiles);
    assert.equal(JSON.stringify(state.resources), resources);
    assert.equal(JSON.stringify(state.city.logistics.jobs), jobs);
});
