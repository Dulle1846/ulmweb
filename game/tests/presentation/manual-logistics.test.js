import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { spawnEntity } from "../../js/world/entities.js";
import {
    initializeCityForRealm, ensureInventory, depositGood, addLocalOutput,
    cancelJobsForEntity, getInputCapacityUsage, CARRIER_CAPACITY, MAX_LOGISTICS_JOBS
} from "../../js/systems/logistics.js";
import { RECIPES, REGIONAL_TIMBER_KEYS } from "../../js/systems/city-config.js";
import { getManualLogisticsSnapshot, placeManualOrder } from "../../js/presentation/manual-logistics.js";

const WIDTH = 160;
const HEIGHT = 160;

function setup() {
    resetState();
    state.hasStarted = true;
    state.isPaused = false;
    state.gameOver = false;
    state.tick = 2;
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
    state.statistics = { ...(state.statistics || {}), totalHarvests: 0 };
    state.morale = 80;
    initializeCityForRealm({ seedWarehouse: false });
}

function place(type, x, y) {
    const entity = spawnEntity(x, y, type);
    assert.ok(entity, `${type} should spawn at ${x},${y}`);
    ensureInventory(entity);
    return entity;
}

function assertPhysicalBooks() {
    for (const entity of state.entities) {
        if (entity.dead || !entity.isBuilding?.()) continue;
        for (const map of [entity.inventory?.input, entity.inventory?.output, entity.inventory?.reservedIn, entity.inventory?.reservedOut]) {
            for (const quantity of Object.values(map || {})) assert.ok(Number(quantity) >= 0, "local inventory must not be negative");
        }
        for (const map of [entity.warehouse?.stored, entity.warehouse?.reservedIn, entity.warehouse?.reservedOut]) {
            for (const quantity of Object.values(map || {})) assert.ok(Number(quantity) >= 0, "warehouse inventory must not be negative");
        }
    }
    for (const job of state.city.logistics.jobs) {
        assert.ok(Number(job.quantity) >= 0 && Number(job.delivered || 0) >= 0, "job amounts must not be negative");
    }
}

test("01 manual orders advertise only real recipe goods and one cart at a time", () => {
    setup();
    const warehouse = place(TYPE.WAREHOUSE, 30, 30);
    const mill = place(TYPE.MILL, 40, 30);
    assert.equal(depositGood("grain", 30, 40, 30), 30);
    assert.equal(addLocalOutput(mill, "flour", 5), 5);

    const fresh = getManualLogisticsSnapshot(mill, { warehouseFree: 100 });
    assert.deepEqual(fresh.orders.map(order => order.kind + ":" + order.good), ["supply:grain", "haul:flour"]);
    assert.equal(fresh.orders.find(order => order.good === "flour" && order.kind === "supply"), undefined, "a mill has no flour input recipe");
    assert.equal(fresh.orders.find(order => order.good === "grain" && order.kind === "haul"), undefined, "a mill has no grain output recipe");
    const supply = fresh.orders.find(order => order.kind === "supply");
    const haul = fresh.orders.find(order => order.kind === "haul");
    assert.equal(supply.quantity, CARRIER_CAPACITY, "a larger store must still advertise one carrier load");
    assert.equal(supply.ok, true);
    assert.equal(haul.quantity, 5, "the haul must advertise the real unreserved local stock");
    assert.equal(haul.ok, true);

    const supplyOrder = placeManualOrder(mill, "supply", "grain", 99);
    assert.equal(supplyOrder.ok, true);
    assert.equal(supplyOrder.job.quantity, CARRIER_CAPACITY);
    assert.equal(mill.inventory.reservedIn.grain, CARRIER_CAPACITY);
    assert.equal(warehouse.warehouse.reservedOut.grain, CARRIER_CAPACITY);
    const haulOrder = placeManualOrder(mill, "haul", "flour", 5);
    assert.equal(haulOrder.ok, true);
    assert.equal(mill.inventory.reservedOut.flour, 5);

    const busy = getManualLogisticsSnapshot(mill, { warehouseFree: 100 });
    assert.equal(busy.orders.find(order => order.kind === "supply").ok, false, "an active order must disable its button");
    assert.match(busy.orders.find(order => order.kind === "supply").reason, /already has grain on order/);
    assert.equal(busy.orders.find(order => order.kind === "haul").ok, false);
    assert.equal(placeManualOrder(mill, "supply", "grain", 12).ok, false, "the click must not create a second job");
    assert.equal(state.city.logistics.jobs.filter(job => job.to?.id === mill.id && job.good === "grain").length, 1);
    assertPhysicalBooks();

    cancelJobsForEntity(warehouse.id);
    assert.equal(mill.inventory.reservedIn.grain, 0, "cancelling must release the destination reservation");
    assert.equal(mill.inventory.reservedOut.flour, 0, "cancelling must release the source reservation");
    assert.equal(warehouse.warehouse.reservedOut.grain, 0);
    assert.equal(getInputCapacityUsage(mill).free, RECIPES[TYPE.MILL].inputCapacity);
    assert.equal(getManualLogisticsSnapshot(mill, { warehouseFree: 100 }).orders.every(order => order.ok), true);
    assertPhysicalBooks();
});

test("02 a sawmill offers its declared regional timber alternatives, not every good", () => {
    setup();
    place(TYPE.WAREHOUSE, 30, 30);
    const sawmill = place(TYPE.SAWMILL, 40, 30);
    assert.equal(depositGood("logs", 12, 40, 30), 12);
    assert.equal(addLocalOutput(sawmill, "planks", 4), 4);
    assert.equal(addLocalOutput(sawmill, "firewood", 2), 2);

    const snapshot = getManualLogisticsSnapshot(sawmill, { warehouseFree: 100 });
    const keys = snapshot.orders.map(order => order.kind + ":" + order.good);
    assert.ok(keys.includes("supply:logs"), "the declared logs input must be offered");
    assert.ok(REGIONAL_TIMBER_KEYS.some(good => keys.includes("supply:" + good)), "regional timber alternatives are declared by the same recipe");
    assert.ok(keys.includes("haul:planks") && keys.includes("haul:firewood"));
    assert.equal(keys.includes("supply:flour"), false);
    assert.equal(keys.includes("haul:logs"), false);
    assertPhysicalBooks();
});

test("03 the carrier queue cap disables every new order without changing the job list", () => {
    setup();
    place(TYPE.WAREHOUSE, 30, 30);
    const mill = place(TYPE.MILL, 40, 30);
    assert.equal(depositGood("grain", 12, 40, 30), 12);
    const before = state.city.logistics.jobs.length;
    for (let index = 0; index < MAX_LOGISTICS_JOBS; index++) {
        state.city.logistics.jobs.push({
            id: "queue-filler-" + index, kind: "haul", good: "logs", quantity: 1,
            from: { kind: "building", id: "filler-source" }, to: { kind: "warehouse", id: "filler-target" },
            status: "pending", createdTick: state.tick, retryAt: state.tick,
            attempts: 0, picked: 0, delivered: 0
        });
    }
    const snapshot = getManualLogisticsSnapshot(mill, { warehouseFree: 100 });
    assert.equal(snapshot.activeJobs, MAX_LOGISTICS_JOBS);
    assert.equal(snapshot.queueFull, true);
    assert.equal(snapshot.orders.every(order => !order.ok && /queue is full/.test(order.reason)), true);
    assert.equal(placeManualOrder(mill, "supply", "grain", 12).ok, false);
    assert.equal(state.city.logistics.jobs.length, before + MAX_LOGISTICS_JOBS, "the disabled button must not create a job");
    assert.equal(mill.inventory.reservedIn.grain, 0);
    assertPhysicalBooks();
    state.city.logistics.jobs = state.city.logistics.jobs.filter(job => !String(job.id).startsWith("queue-filler-"));
});

test("04 a real simulation rejection remains visible when a filtered store cannot supply the order", () => {
    setup();
    const warehouse = place(TYPE.WAREHOUSE, 30, 30);
    const mill = place(TYPE.MILL, 40, 30);
    assert.equal(depositGood("grain", 12, 40, 30), 12);
    // The read model sees physical grain anywhere; the simulation still has to
    // find a reachable warehouse whose profile accepts grain. Removing the
    // filter turns an apparently ready button into the existing real rejection.
    warehouse.warehouse.filters = warehouse.warehouse.filters.filter(good => good !== "grain");
    const snapshot = getManualLogisticsSnapshot(mill, { warehouseFree: 100 });
    assert.equal(snapshot.orders.find(order => order.kind === "supply").ok, true);
    assert.equal(placeManualOrder(mill, "supply", "grain", 12).ok, false);
    assert.deepEqual(state.city.logistics.lastRejection, {
        reason: "No reachable store holds grain", kind: "supply", good: "grain", tick: state.tick
    });
    assert.equal(mill.inventory.reservedIn.grain, 0, "a rejected order must leave no reservation behind");
    assert.equal(warehouse.warehouse.reservedOut.grain, 0);
    assertPhysicalBooks();
});
