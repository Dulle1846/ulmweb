import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { spawnEntity } from "../../js/world/entities.js";
import {
    initializeCityForRealm, ensureInventory, requestHaul, requestSupply, requestConstructionDelivery, getInputCapacity, getInputCapacityUsage, inputSpace, reserveInputCapacity, releaseInputCapacity, cancelJobsForEntity,
    updateLogistics, updateLogisticsMovement, serializeCity, restoreCity, validateCitySnapshot,
    evacuateBuildingInventory, setWarehouseProfile, getWarehouseProfile, depositGood, withdrawGood,
    addLocalOutput, consumeFromWarehouse, getLocalWarehouseStock, getGoodsAudit, getPhysicalStock, getAvailableOutput,
    getPhysicalStockMap, openGoodsBookForNewRealm,
    normalizeLegacyWarehouseCapacity, recordResourceMovement, MAX_LOGISTICS_JOBS, MAX_CARRIERS, JOB_PRIORITIES
} from "../../js/systems/logistics.js";
import { payForCard } from "../../js/systems/resources.js";
import { executeTrade, getTradePartners } from "../../js/systems/market.js";
import { setAuditOpening } from "../../js/systems/goods-book.js";
import { GOOD_KEYS } from "../../js/systems/city-config.js";
import { GOODS_LEDGER_LIMIT } from "../../js/systems/goods-book.js";
import { updateFields } from "../../js/systems/fields.js";
import { updateBuildingIncome } from "../../js/simulation/buildings.js";
import { updateSettlementNeeds, updateServices } from "../../js/systems/settlement.js";

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
    state.worldSeed = 20261106;
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
    // The fixture grants royal food outside the simulation. Booking it as the
    // opening balance keeps the resource audit honest for these tests.
    setAuditOpening({ food: state.resources.food });
}

function place(type, x, y) {
    const entity = spawnEntity(x, y, type);
    assert.ok(entity, `${type} should spawn at ${x},${y}`);
    ensureInventory(entity);
    return entity;
}

function advance(ticks) {
    for (let index = 0; index < ticks; index++) {
        state.tick += 1;
        if (state.tick % 2 === 0) updateLogistics();
        updateLogisticsMovement(0.2);
    }
}

function warehouseStock(warehouse, good) {
    return Number(warehouse.warehouse?.stored?.[good]) || 0;
}

function employ(building, count, offset = 4) {
    for (let index = 0; index < count; index++) {
        const worker = spawnEntity(Math.round(building.x + index - (count - 1) / 2), Math.round(building.y + offset), TYPE.VILLAGER);
        assert.ok(worker, "fixture worker should spawn");
        worker.workplace = building;
        worker.anchor = { x: building.x, y: building.y };
        worker.jobRefreshTimer = 1_000_000;
    }
}

function assertPhysicalBooks() {
    for (const entity of state.entities) {
        if (entity.dead || !entity.isBuilding()) continue;
        if (entity.warehouse) {
            for (const [good, quantity] of Object.entries(entity.warehouse.stored || {})) {
                assert.ok(Number(quantity) >= 0, `${entity.id} ${good} must not be negative`);
            }
            for (const [good, quantity] of Object.entries(entity.warehouse.reservedIn || {})) {
                assert.ok(Number(quantity) >= 0, `${entity.id} ${good} inbound reservation must not be negative`);
            }
            for (const [good, quantity] of Object.entries(entity.warehouse.reservedOut || {})) {
                assert.ok(Number(quantity) >= 0, `${entity.id} ${good} outbound reservation must not be negative`);
            }
        }
        for (const map of [entity.inventory?.input, entity.inventory?.output, entity.inventory?.reservedIn, entity.inventory?.reservedOut]) {
            for (const quantity of Object.values(map || {})) assert.ok(Number(quantity) >= 0, "local inventory must not be negative");
        }
    }
    for (const job of state.city.logistics.jobs) {
        assert.ok(Number(job.quantity) >= 0 && Number(job.delivered) >= 0, "job amounts must not be negative");
    }
}

test("01 a normal transport delivers the full reserved quantity exactly once", () => {
    setup();
    const source = place(TYPE.LUMBER, 20, 20);
    const warehouse = place(TYPE.WAREHOUSE, 30, 20);
    source.inventory.output.logs = 5;
    const job = requestHaul(source, "logs", 5);
    assert.ok(job);
    assert.equal(source.inventory.reservedOut.logs, 5);
    assert.equal(warehouse.warehouse.reservedIn.logs, 5);
    advance(60);
    assert.equal(job.status, "done");
    assert.equal(warehouseStock(warehouse, "logs"), 5);
    assert.equal(source.inventory.output.logs, 0);
    assert.equal(warehouse.warehouse.reservedIn.logs, 0);
    assert.equal(state.city.logistics.carriers.length, 0);
    assert.equal(state.city.logistics.stats.logs, 5);
    assertPhysicalBooks();
});

test("02 a partly filled destination still receives the exact reserved remainder", () => {
    setup();
    const source = place(TYPE.LUMBER, 20, 20);
    const warehouse = place(TYPE.WAREHOUSE, 30, 20);
    warehouse.warehouse.capacity = 10;
    warehouse.warehouse.stored.logs = 4;
    source.inventory.output.logs = 6;
    const job = requestHaul(source, "logs", 6);
    assert.ok(job);
    advance(60);
    assert.equal(job.status, "done");
    assert.equal(warehouseStock(warehouse, "logs"), 10);
    assert.equal(source.inventory.output.logs, 0);
    assert.equal(warehouse.warehouse.reservedIn.logs, 0);
    assertPhysicalBooks();
});

test("02b a harvest larger than one cart reserves only what the cart can pick", () => {
    setup();
    const source = place(TYPE.LUMBER, 20, 20);
    const warehouse = place(TYPE.WAREHOUSE, 30, 20);
    source.inventory.output.logs = 27;
    const job = requestHaul(source, "logs", 27);
    assert.ok(job);
    assert.equal(job.quantity, 12, "one haul must not reserve more than a cartload");
    assert.equal(source.inventory.reservedOut.logs, 12);
    advance(60);
    assert.equal(job.status, "done");
    assert.equal(warehouseStock(warehouse, "logs"), 12);
    assert.equal(source.inventory.reservedOut.logs, 0, "the picked trip must leave no reservation behind");
    assert.equal(getAvailableOutput(source, "logs"), 15, "the rest of the harvest must remain haulable");
    assertPhysicalBooks();
});

test("03 a source that loses stock cannot create phantom delivery and releases its reservations", () => {
    setup();
    const source = place(TYPE.LUMBER, 20, 20);
    const warehouse = place(TYPE.WAREHOUSE, 30, 20);
    source.inventory.output.logs = 5;
    const job = requestHaul(source, "logs", 5);
    assert.ok(job);
    source.inventory.output.logs = 0;
    advance(320);
    assert.equal(job.status, "cancelled");
    assert.equal(warehouseStock(warehouse, "logs"), 0);
    assert.equal(source.inventory.reservedOut.logs, 0);
    assert.equal(warehouse.warehouse.reservedIn.logs, 0);
    assert.equal(state.city.logistics.carriers.length, 0);
    assertPhysicalBooks();
});

test("04 a full destination retains leftover cargo instead of deleting it", () => {
    setup();
    const source = place(TYPE.LUMBER, 20, 20);
    const warehouse = place(TYPE.WAREHOUSE, 30, 20);
    source.inventory.output.logs = 5;
    const job = requestHaul(source, "logs", 5);
    assert.ok(job);
    warehouse.warehouse.stored.logs = 176;
    advance(80);
    assert.equal(warehouseStock(warehouse, "logs"), 180);
    assert.equal(job.status, "blocked");
    const carrier = state.city.logistics.carriers.find(entry => entry.id === job.carrierId);
    assert.ok(carrier?.cargo, "the unaccepted remainder must stay on the carrier");
    assert.equal(carrier.cargo.quantity, 1);
    assert.equal(warehouseStock(warehouse, "logs") + source.inventory.output.logs + carrier.cargo.quantity, 181);
    assertPhysicalBooks();
});

test("05 removing the source cancels the job without changing the destination", () => {
    setup();
    const source = place(TYPE.LUMBER, 20, 20);
    const warehouse = place(TYPE.WAREHOUSE, 30, 20);
    source.inventory.output.logs = 5;
    const job = requestHaul(source, "logs", 5);
    assert.ok(job);
    source.dead = true;
    state.buildingCollisionVersion = (state.buildingCollisionVersion || 0) + 1;
    advance(8);
    assert.equal(job.status, "cancelled");
    assert.equal(warehouseStock(warehouse, "logs"), 0);
    assert.equal(warehouse.warehouse.reservedIn.logs, 0);
    assertPhysicalBooks();
});

test("06 removing the destination releases the source reservation without destroying stock", () => {
    setup();
    const source = place(TYPE.LUMBER, 20, 20);
    const warehouse = place(TYPE.WAREHOUSE, 30, 20);
    source.inventory.output.logs = 5;
    const job = requestHaul(source, "logs", 5);
    assert.ok(job);
    warehouse.dead = true;
    state.buildingCollisionVersion = (state.buildingCollisionVersion || 0) + 1;
    advance(8);
    assert.equal(job.status, "cancelled");
    assert.equal(source.inventory.output.logs, 5);
    assert.equal(source.inventory.reservedOut.logs, 0);
    assertPhysicalBooks();
});

test("07 an unreachable store is not bound to a job and accepts the order after the route is restored", () => {
    setup();
    const source = place(TYPE.LUMBER, 20, 20);
    const warehouse = place(TYPE.WAREHOUSE, 60, 20);
    source.inventory.output.logs = 5;
    state.heightMap.fill(0.2);
    state.buildingCollisionVersion = (state.buildingCollisionVersion || 0) + 1;
    const refused = requestHaul(source, "logs", 5);
    assert.equal(refused, null);
    assert.match(state.city.logistics.lastRejection?.reason || "", /reachable/i);
    assert.equal(source.inventory.reservedOut.logs, 0);
    assert.equal(state.city.logistics.carriers.length, 0);
    state.heightMap.fill(0.62);
    state.buildingCollisionVersion = (state.buildingCollisionVersion || 0) + 1;
    const job = requestHaul(source, "logs", 5);
    assert.ok(job, "a reachable store must accept the order once the route exists");
    advance(200);
    assert.equal(job.status, "done");
    assert.equal(warehouseStock(warehouse, "logs"), 5);
    assertPhysicalBooks();
});

test("08 a missing carrier recovers picked cargo instead of deleting it", () => {
    setup();
    const source = place(TYPE.LUMBER, 20, 20);
    const warehouse = place(TYPE.WAREHOUSE, 100, 20);
    source.inventory.output.logs = 5;
    const job = requestHaul(source, "logs", 5);
    assert.ok(job);
    advance(4);
    const carrier = state.city.logistics.carriers.find(entry => entry.id === job.carrierId);
    assert.ok(carrier?.cargo, "the carrier should have picked the cargo");
    state.city.logistics.carriers = state.city.logistics.carriers.filter(entry => entry.id !== carrier.id);
    advance(8);
    assert.equal(job.status, "cancelled");
    assert.equal(warehouseStock(warehouse, "logs"), 5);
    assert.equal(source.inventory.output.logs, 0);
    assert.equal(warehouse.warehouse.reservedIn.logs, 0);
    assertPhysicalBooks();
});

test("09 a failed job request leaves no reservation behind", () => {
    setup();
    const source = place(TYPE.LUMBER, 20, 20);
    source.inventory.output.logs = 5;
    const job = requestHaul(source, "logs", 5);
    assert.equal(job, null);
    assert.equal(source.inventory.reservedOut.logs, 0);
    assert.equal(state.city.logistics.carriers.length, 0);
    assertPhysicalBooks();
});

test("10 a failed supply request leaves no destination reservation behind", () => {
    setup();
    const bakery = place(TYPE.BAKERY, 20, 20);
    const job = requestSupply(bakery, "flour", 5);
    assert.equal(job, null);
    assert.equal(bakery.inventory.reservedIn.flour, 0);
    assertPhysicalBooks();
});

test("11 a blocked delivery resumes when destination space becomes available", () => {
    setup();
    const source = place(TYPE.LUMBER, 20, 20);
    const warehouse = place(TYPE.WAREHOUSE, 30, 20);
    source.inventory.output.logs = 5;
    const job = requestHaul(source, "logs", 5);
    assert.ok(job);
    warehouse.warehouse.stored.logs = 180;
    advance(80);
    assert.equal(job.status, "blocked");
    warehouse.warehouse.stored.logs = 0;
    job.retryAt = state.tick;
    advance(20);
    assert.equal(job.status, "done");
    assert.equal(warehouseStock(warehouse, "logs"), 5);
    assertPhysicalBooks();
});

test("12 cancelling a loaded transport returns the cargo and frees the carrier", () => {
    setup();
    const source = place(TYPE.LUMBER, 20, 20);
    const warehouse = place(TYPE.WAREHOUSE, 100, 20);
    source.inventory.output.logs = 5;
    const job = requestHaul(source, "logs", 5);
    assert.ok(job);
    advance(4);
    assert.ok(job.carrierId);
    cancelJobsForEntity(source.id);
    assert.equal(job.status, "cancelled");
    assert.equal(source.inventory.output.logs, 0);
    assert.equal(warehouseStock(warehouse, "logs"), 5);
    assert.equal(state.city.logistics.carriers.length, 0);
    assertPhysicalBooks();
});

test("13 save and load during transport reconstructs reservations and finishes the job", () => {
    setup();
    const source = place(TYPE.LUMBER, 20, 20);
    const warehouse = place(TYPE.WAREHOUSE, 100, 20);
    source.inventory.output.logs = 5;
    const job = requestHaul(source, "logs", 5);
    assert.ok(job);
    advance(4);
    assert.ok(state.city.logistics.carriers.find(entry => entry.id === job.carrierId)?.cargo);
    const snapshot = serializeCity();
    assert.equal(validateCitySnapshot(snapshot), true);
    state.city.logistics.jobs = [];
    state.city.logistics.carriers = [];
    restoreCity(snapshot);
    const restored = state.city.logistics.jobs.find(entry => entry.id === job.id);
    assert.ok(restored);
    assert.equal(restored.status, "assigned");
    assert.equal(restored.picked, 5);
    advance(400);
    assert.equal(restored.status, "done");
    assert.equal(warehouseStock(warehouse, "logs"), 5);
    assertPhysicalBooks();
});

test("14 multiple simultaneous jobs complete independently and never overrun carrier limits", () => {
    setup();
    const jobs = [];
    for (let index = 0; index < 3; index++) {
        const source = place(TYPE.LUMBER, 15 + index * 20, 30);
        const warehouse = place(TYPE.WAREHOUSE, 25 + index * 20, 45);
        source.inventory.output.logs = 4 + index;
        jobs.push(requestHaul(source, "logs", 4 + index));
    }
    assert.ok(jobs.every(Boolean));
    advance(120);
    assert.ok(jobs.every(job => job.status === "done"));
    assert.equal(state.city.logistics.carriers.length, 0);
    assert.ok(state.city.logistics.carriers.length <= MAX_CARRIERS);
    assertPhysicalBooks();
});

test("15 several consumers cannot reserve the same physical warehouse stock twice", () => {
    setup();
    const warehouse = place(TYPE.WAREHOUSE, 30, 30);
    warehouse.warehouse.stored.flour = 10;
    const first = place(TYPE.BAKERY, 40, 30);
    const second = place(TYPE.BAKERY, 40, 45);
    const firstJob = requestSupply(first, "flour", 5);
    const secondJob = requestSupply(second, "flour", 5);
    const thirdJob = requestSupply(first, "flour", 5);
    assert.ok(firstJob);
    assert.ok(secondJob);
    assert.equal(thirdJob, null);
    assert.equal(warehouse.warehouse.reservedOut.flour, 10);
    assert.equal(first.inventory.reservedIn.flour, 5);
    assert.equal(second.inventory.reservedIn.flour, 5);
    advance(100);
    assert.equal(warehouseStock(warehouse, "flour"), 0);
    assert.equal(first.inventory.input.flour, 5);
    assert.equal(second.inventory.input.flour, 5);
    assertPhysicalBooks();
});

test("16 a full farm store keeps unaccepted harvest pending until space appears", () => {
    setup();
    const farm = place(TYPE.FARM, 20, 20);
    employ(farm, 4);
    state.seasonIndex = 2;
    farm.field = { stage: "ripe", growth: 100, fertility: 50, harvests: 0, lastHarvestYear: 0, sownYear: 1, pendingHarvest: 0, harvestTotal: 0 };
    farm.inventory.output.grain = 36;
    updateFields();
    assert.ok(farm.field.pendingHarvest > 0);
    assert.equal(farm.field.stage, "ripe");
    assert.equal(farm.field.harvests, 0);
    farm.inventory.output.grain = 0;
    updateFields();
    assert.equal(farm.field.pendingHarvest, 0);
    assert.equal(farm.field.stage, "harvested");
    assert.equal(farm.field.harvests, 1);
    assertPhysicalBooks();
});

test("17 production with missing inputs neither consumes nor creates output", () => {
    setup();
    const sawmill = place(TYPE.SAWMILL, 20, 20);
    employ(sawmill, 2);
    state.tick = 24;
    updateBuildingIncome();
    assert.equal(sawmill.inventory.input.logs, 0);
    assert.equal(sawmill.inventory.output.planks || 0, 0);
    assert.match(sawmill.productionReason || "", /logs/i);
    assertPhysicalBooks();
});

test("18 production pauses before consuming inputs when its output store is full", () => {
    setup();
    const sawmill = place(TYPE.SAWMILL, 20, 20);
    employ(sawmill, 2);
    sawmill.inventory.input.logs = 4;
    sawmill.inventory.output.planks = 31;
    state.tick = 24;
    updateBuildingIncome();
    assert.equal(sawmill.inventory.input.logs, 4);
    assert.equal(sawmill.inventory.output.planks, 31);
    assert.match(sawmill.productionReason || "", /output store is full/i);
    assertPhysicalBooks();
});

test("19 a warehouse rejects goods outside its configured filter", () => {
    setup();
    const source = place(TYPE.SAWMILL, 20, 20);
    const warehouse = place(TYPE.WAREHOUSE, 30, 20);
    warehouse.warehouse.filters = ["logs"];
    source.inventory.output.planks = 5;
    const job = requestHaul(source, "planks", 5);
    assert.equal(job, null);
    assert.equal(source.inventory.reservedOut.planks, 0);
    assertPhysicalBooks();
});

test("20 a multi-year production and logistics loop keeps every stock finite and non-negative", () => {
    setup();
    const warehouseA = place(TYPE.WAREHOUSE, 30, 60);
    const warehouseB = place(TYPE.WAREHOUSE, 30, 90);
    warehouseA.warehouse.capacity = 600;
    warehouseB.warehouse.capacity = 600;
    const farm = place(TYPE.FARM, 50, 60);
    const mill = place(TYPE.MILL, 70, 60);
    const bakery = place(TYPE.BAKERY, 90, 60);
    employ(farm, 4);
    employ(mill, 2);
    employ(bakery, 2);
    for (let tick = 0; tick < 1200; tick++) {
        state.dayOfYear = tick % 400;
        state.seasonIndex = Math.floor(state.dayOfYear / 100) % 4;
        updateFields();
        updateBuildingIncome();
        advance(1);
    }
    assertPhysicalBooks();
    assert.ok(state.city.logistics.jobs.length <= MAX_LOGISTICS_JOBS);
    assert.ok(state.city.logistics.carriers.length <= MAX_CARRIERS);
    assert.ok(farm.field.harvests > 0);
    assert.ok((state.economy.productionChains.flourProduced || 0) > 0);
    assert.ok((state.economy.productionChains.breadProduced || 0) > 0);
    const ledger = state.city.logistics.ledger;
    assert.ok(ledger.some(entry => entry.type === "produced"));
    assert.ok(ledger.some(entry => entry.type === "consumed"));
    assert.ok(ledger.length <= GOODS_LEDGER_LIMIT);
});

test("22 empty houses do not consume heating while an occupied house does", () => {
    setup();
    const warehouse = place(TYPE.WAREHOUSE, 42, 50);
    warehouse.warehouse.stored.firewood = 10;
    const house = place(TYPE.HOUSE, 50, 50);
    state.seasonIndex = 3;
    updateSettlementNeeds();
    assert.equal(warehouseStock(warehouse, "firewood"), 10);
    const resident = spawnEntity(house.x + 1, house.y, TYPE.VILLAGER);
    assert.ok(resident);
    resident.home = { x: house.x, y: house.y };
    resident.householdId = "house:" + house.id;
    updateSettlementNeeds();
    // One load now heats a house for forty days instead of burning two loads
    // every ten days, so a sawmill can actually keep the hearths supplied.
    assert.equal(warehouseStock(warehouse, "firewood"), 9);
    const booked = state.city.logistics.ledger.filter(entry => entry.type === "consumed" && entry.good === "firewood" && entry.houseId === house.id);
    assert.equal(booked.reduce((sum, entry) => sum + entry.quantity, 0), 1);
    assert.equal(booked[0].cause, "household-heating");
    // A repeated settlement pass in the same tick is idempotent.
    updateSettlementNeeds();
    assert.equal(warehouseStock(warehouse, "firewood"), 9);
    assertPhysicalBooks();
});

test("22b a distant store cannot heat a house", () => {
    setup();
    const warehouse = place(TYPE.WAREHOUSE, 120, 120);
    warehouse.warehouse.stored.firewood = 40;
    const house = place(TYPE.HOUSE, 20, 20);
    state.seasonIndex = 3;
    const resident = spawnEntity(house.x + 1, house.y, TYPE.VILLAGER);
    assert.ok(resident);
    resident.householdId = "house:" + house.id;
    updateSettlementNeeds();
    assert.equal(warehouseStock(warehouse, "firewood"), 40);
    assert.equal(state.city.needs.summary.warmth, 0);
    assert.equal(state.city.logistics.ledger.filter(entry => entry.good === "firewood").length, 0);
    assertPhysicalBooks();
});

test("23 demolishing a store evacuates its stock and refuses if no space remains", () => {
    setup();
    const source = place(TYPE.WAREHOUSE, 30, 30);
    const target = place(TYPE.WAREHOUSE, 40, 30);
    source.warehouse.stored.logs = 7;
    const evacuated = evacuateBuildingInventory(source);
    assert.equal(evacuated.ok, true);
    assert.equal(source.warehouse.stored.logs, 0);
    assert.equal(target.warehouse.stored.logs, 7);
    source.dead = true;
    target.dead = true;
    state.buildingCollisionVersion = (state.buildingCollisionVersion || 0) + 1;
    const isolated = place(TYPE.WAREHOUSE, 60, 60);
    isolated.warehouse.stored.logs = 3;
    const refused = evacuateBuildingInventory(isolated);
    assert.equal(refused.ok, false);
    assert.equal(isolated.warehouse.stored.logs, 3);
    assert.equal(refused.remaining.logs, 3);
    assertPhysicalBooks();
});

test("24 the bounded movement ledger records reservations, pickups and deliveries", () => {
    setup();
    const source = place(TYPE.LUMBER, 20, 20);
    const warehouse = place(TYPE.WAREHOUSE, 30, 20);
    source.inventory.output.logs = 5;
    const job = requestHaul(source, "logs", 5);
    assert.ok(job);
    assert.ok(job.priority >= JOB_PRIORITIES.haul);
    advance(60);
    const ledger = state.city.logistics.ledger;
    assert.ok(ledger.some(entry => entry.type === "reserved" && entry.jobId === job.id));
    assert.ok(ledger.some(entry => entry.type === "picked" && entry.jobId === job.id));
    assert.ok(ledger.some(entry => entry.type === "delivered" && entry.jobId === job.id && entry.quantity === 5));
    assert.ok(ledger.length <= GOODS_LEDGER_LIMIT);
    assertPhysicalBooks();
});

test("21 legacy logistics snapshots are normalized and their reservations rebuilt", () => {
    setup();
    const source = place(TYPE.LUMBER, 20, 20);
    const warehouse = place(TYPE.WAREHOUSE, 30, 20);
    source.inventory.output.logs = 5;
    const job = requestHaul(source, "logs", 5);
    assert.ok(job);
    const snapshot = serializeCity();
    snapshot.logistics.version = 1;
    for (const row of snapshot.logistics.jobs) {
        delete row.reserved;
        delete row.picked;
        delete row.delivered;
        delete row.sourceReserved;
        delete row.targetReserved;
    }
    state.city.logistics.jobs = [];
    state.city.logistics.carriers = [];
    restoreCity(snapshot);
    const restored = state.city.logistics.jobs[0];
    assert.equal(restored.reserved, restored.quantity);
    assert.equal(restored.picked, 0);
    assert.equal(source.inventory.reservedOut.logs, 5);
    assert.equal(warehouse.warehouse.reservedIn.logs, 5);
    assert.equal(serializeCity().logistics.version, 3);
    assertPhysicalBooks();
});

test("25 production records consumed inputs and produced outputs in the central ledger", () => {
    setup();
    const sawmill = place(TYPE.SAWMILL, 20, 20);
    employ(sawmill, 2);
    sawmill.inventory.input.logs = 4;
    state.tick = 24;
    updateBuildingIncome();
    const ledger = state.city.logistics.ledger;
    const consumed = ledger.filter(entry => entry.type === "consumed" && entry.good === "logs");
    const produced = ledger.filter(entry => entry.type === "produced");
    assert.equal(consumed.reduce((sum, entry) => sum + entry.quantity, 0), 2);
    assert.equal(sawmill.inventory.input.logs, 2);
    assert.ok(produced.some(entry => entry.good === "planks"));
    assert.ok(produced.every(entry => GOOD_KEYS.includes(entry.good)));
    assert.ok(consumed.every(entry => entry.from === "building:" + sawmill.id && entry.to === "recipe:Saw planks"));
    assertPhysicalBooks();
});

test("26 blocked production writes no movement into the ledger", () => {
    setup();
    const sawmill = place(TYPE.SAWMILL, 20, 20);
    employ(sawmill, 2);
    sawmill.inventory.input.logs = 4;
    sawmill.inventory.output.planks = 31;
    state.tick = 24;
    updateBuildingIncome();
    assert.equal(state.city.logistics.ledger.length, 0);
    assert.equal(sawmill.inventory.input.logs, 4);
    assertPhysicalBooks();
});

test("27 a specialised warehouse profile restricts what its store accepts", () => {
    setup();
    const warehouse = place(TYPE.WAREHOUSE, 30, 30);
    const result = setWarehouseProfile(warehouse, "timber");
    assert.equal(result.ok, true);
    assert.equal(warehouse.warehouse.profile, "timber");
    assert.deepEqual(warehouse.warehouse.filters, ["logs", "planks", "firewood"]);
    assert.equal(warehouse.warehouse.capacity, 220);
    assert.equal(getWarehouseProfile(warehouse).id, "timber");
    const sawmill = place(TYPE.SAWMILL, 40, 30);
    sawmill.inventory.output.planks = 3;
    assert.ok(requestHaul(sawmill, "planks", 3));
    assert.equal(depositGood("stoneBlocks", 4, 30, 30), 0);
    assertPhysicalBooks();
});

test("28 narrowing a profile is refused while excluded goods remain stored", () => {
    setup();
    const warehouse = place(TYPE.WAREHOUSE, 30, 30);
    warehouse.warehouse.stored.logs = 3;
    warehouse.warehouse.stored.stoneBlocks = 2;
    const refused = setWarehouseProfile(warehouse, "timber");
    assert.equal(refused.ok, false);
    assert.match(refused.reason, /stoneBlocks/);
    assert.equal(warehouse.warehouse.filters.includes("stoneBlocks"), true);
    warehouse.warehouse.stored.stoneBlocks = 0;
    const accepted = setWarehouseProfile(warehouse, "timber");
    assert.equal(accepted.ok, true);
    assert.equal(warehouse.warehouse.filters.includes("stoneBlocks"), false);
    assert.equal(warehouse.warehouse.stored.logs, 3);
    assertPhysicalBooks();
});

test("29 the royal keep cannot be narrowed to a specialised profile", () => {
    setup();
    const keep = place(TYPE.KEEP, 10, 10);
    assert.equal(getWarehouseProfile(keep).id, "general");
    const result = setWarehouseProfile(keep, "timber");
    assert.equal(result.ok, false);
    assert.equal(keep.warehouse.filters.length, GOOD_KEYS.length);
    assertPhysicalBooks();
});

test("30 legacy warehouse filters are preserved and matched to a shipped profile", () => {
    setup();
    const granary = place(TYPE.WAREHOUSE, 30, 30);
    granary.warehouse.filters = ["grain", "flour", "bread"];
    delete granary.warehouse.profile;
    ensureInventory(granary);
    assert.equal(granary.warehouse.profile, "food");
    assert.deepEqual(granary.warehouse.filters, ["grain", "flour", "bread"]);
    const custom = place(TYPE.WAREHOUSE, 50, 30);
    custom.warehouse.filters = ["water", "bread"];
    delete custom.warehouse.profile;
    ensureInventory(custom);
    assert.equal(custom.warehouse.profile, "general");
    assert.deepEqual(custom.warehouse.filters, ["water", "bread"]);
    assertPhysicalBooks();
});

test("31 a legacy snapshot without ledger or carrier ids restores and recovers picked cargo", () => {
    setup();
    const source = place(TYPE.LUMBER, 20, 20);
    const warehouse = place(TYPE.WAREHOUSE, 100, 20);
    source.inventory.output.logs = 5;
    const job = requestHaul(source, "logs", 5);
    assert.ok(job);
    advance(4);
    const snapshot = serializeCity();
    delete snapshot.logistics.ledger;
    delete snapshot.logistics.nextLedgerId;
    delete snapshot.logistics.jobs[0].carrierId;
    snapshot.logistics.carriers = [];
    restoreCity(snapshot);
    const restored = state.city.logistics.jobs[0];
    assert.equal(restored.picked, 5);
    assert.deepEqual(state.city.logistics.ledger, []);
    assert.ok(state.city.logistics.nextLedgerId >= 1);
    advance(20);
    assert.equal(restored.status, "cancelled");
    assert.equal(warehouseStock(warehouse, "logs"), 5);
    assert.equal(warehouse.warehouse.reservedIn.logs, 0);
    assertPhysicalBooks();
});

test("32 a full job queue stays bounded and rebuilds after a save round-trip", () => {
    setup();
    const warehouse = place(TYPE.WAREHOUSE, 80, 80);
    warehouse.warehouse.capacity = 400;
    const sources = [];
    for (let index = 0; index < 80; index++) {
        const well = place(TYPE.WELL, 64 + (index % 12) * 2, 62 + Math.floor(index / 12) * 2);
        well.inventory.output.water = 1;
        sources.push(well);
    }
    const jobs = sources.map(well => requestHaul(well, "water", 1)).filter(Boolean);
    assert.equal(jobs.length, MAX_LOGISTICS_JOBS);
    assert.equal(sources.reduce((sum, well) => sum + well.inventory.reservedOut.water, 0), MAX_LOGISTICS_JOBS);
    assert.equal(warehouse.warehouse.reservedIn.water, MAX_LOGISTICS_JOBS);
    const snapshot = serializeCity();
    assert.equal(snapshot.logistics.jobs.length, MAX_LOGISTICS_JOBS);
    state.city.logistics.jobs = [];
    restoreCity(snapshot);
    assert.equal(state.city.logistics.jobs.length, MAX_LOGISTICS_JOBS);
    assert.equal(warehouse.warehouse.reservedIn.water, MAX_LOGISTICS_JOBS);
    advance(200);
    assert.ok(state.city.logistics.jobs.length <= MAX_LOGISTICS_JOBS);
    assert.ok(state.city.logistics.carriers.length <= MAX_CARRIERS);
    assertPhysicalBooks();
});

test("33 damaged legacy reservations are clamped and rebuilt from live stock", () => {
    setup();
    const source = place(TYPE.LUMBER, 20, 20);
    const warehouse = place(TYPE.WAREHOUSE, 30, 20);
    source.inventory.output.logs = 5;
    source.inventory.reservedOut.logs = 999;
    warehouse.warehouse.reservedIn.logs = 999;
    warehouse.warehouse.reservedOut.logs = 999;
    const snapshot = serializeCity();
    snapshot.logistics.ledger = [];
    state.city.logistics.jobs = [];
    restoreCity(snapshot);
    assert.equal(source.inventory.reservedOut.logs, 0);
    assert.equal(warehouse.warehouse.reservedIn.logs, 0);
    assert.equal(warehouse.warehouse.reservedOut.logs, 0);
    assertPhysicalBooks();
});

test("34 manual store withdrawals are recorded in the central ledger", () => {
    setup();
    const warehouse = place(TYPE.WAREHOUSE, 30, 30);
    warehouse.warehouse.stored.firewood = 6;
    assert.equal(withdrawGood("firewood", 2, 30, 30), 2);
    const entry = state.city.logistics.ledger.at(-1);
    assert.equal(entry.type, "withdrawn");
    assert.equal(entry.good, "firewood");
    assert.equal(entry.quantity, 2);
    assert.equal(warehouse.warehouse.stored.firewood, 4);
    assertPhysicalBooks();
});

test("36 the goods audit reconciles production, transport and consumption", () => {
    setup();
    const source = place(TYPE.LUMBER, 20, 20);
    const warehouse = place(TYPE.WAREHOUSE, 30, 20);
    assert.equal(addLocalOutput(source, "logs", 6), 6);
    assert.equal(getPhysicalStock("logs"), 6);
    const job = requestHaul(source, "logs", 6);
    assert.ok(job);
    advance(60);
    assert.equal(warehouseStock(warehouse, "logs"), 6);
    assert.equal(getPhysicalStock("logs"), 6);
    assert.equal(consumeFromWarehouse(warehouse, "logs", 2, { cause: "test-consumption", key: "test:consume:1" }), 2);
    assert.equal(getPhysicalStock("logs"), 4);
    const row = getGoodsAudit().rows.find(entry => entry.good === "logs");
    assert.equal(row.opening, 0);
    assert.equal(row.produced, 6);
    assert.equal(row.consumed, 2);
    assert.equal(row.physical, 4);
    assert.equal(row.balanced, true);
    assertPhysicalBooks();
});

test("37 a keyed consumption is booked once and never moves stock twice", () => {
    setup();
    const warehouse = place(TYPE.WAREHOUSE, 30, 30);
    warehouse.warehouse.stored.firewood = 6;
    assert.equal(consumeFromWarehouse(warehouse, "firewood", 2, { cause: "test", key: "heat:test:1" }), 2);
    assert.equal(consumeFromWarehouse(warehouse, "firewood", 2, { cause: "test", key: "heat:test:1" }), 2);
    assert.equal(warehouseStock(warehouse, "firewood"), 4);
    assert.equal(state.city.logistics.ledger.filter(entry => entry.key === "heat:test:1").length, 1);
    assertPhysicalBooks();
});

test("38 royal food uses the resource scope of the same book", () => {
    setup();
    state.resources.food -= 12.5;
    recordResourceMovement("food", -12.5, "test-household-food");
    const row = getGoodsAudit().rows.find(entry => entry.good === "food");
    assert.equal(row.scope, "resource");
    assert.equal(row.consumed, 12.5);
    assert.equal(row.physical, state.resources.food);
    assert.equal(row.balanced, true);
    const entry = state.city.logistics.ledger.find(item => item.good === "food");
    assert.equal(entry.scope, "resource");
    assert.equal(entry.cause, "test-household-food");
});

test("39 a legacy save without an audit receives an opening balance", () => {
    setup();
    const warehouse = place(TYPE.WAREHOUSE, 30, 30);
    warehouse.warehouse.stored.planks = 12;
    const snapshot = serializeCity();
    delete snapshot.logistics.audit;
    snapshot.logistics.ledger = [];
    restoreCity(snapshot);
    const row = getGoodsAudit().rows.find(entry => entry.good === "planks");
    assert.equal(row.opening, 12);
    assert.equal(row.physical, 12);
    assert.equal(row.balanced, true);
});

test("40 an overfull legacy store keeps every good and raises its capacity", () => {
    setup();
    const warehouse = place(TYPE.WAREHOUSE, 30, 30);
    warehouse.warehouse.capacity = 10;
    warehouse.warehouse.stored.logs = 25;
    const snapshot = serializeCity();
    assert.equal(normalizeLegacyWarehouseCapacity(), 1);
    assert.equal(warehouse.warehouse.capacity, 25);
    assert.equal(warehouse.warehouse.stored.logs, 25);
    restoreCity(snapshot);
    assert.ok(warehouse.warehouse.capacity >= 25);
    assert.equal(warehouse.warehouse.stored.logs, 25);
});

test("41 a reachable alternative store is chosen when the nearest is cut off", () => {
    setup();
    const source = place(TYPE.LUMBER, 20, 20);
    const cutOff = place(TYPE.WAREHOUSE, 30, 20);
    const reachable = place(TYPE.WAREHOUSE, 20, 42);
    for (let y = 0; y < HEIGHT; y++) for (const x of [26, 27]) state.heightMap[x + y * WIDTH] = 0.1;
    state.buildingCollisionVersion = (state.buildingCollisionVersion || 0) + 1;
    source.inventory.output.logs = 2;
    const job = requestHaul(source, "logs", 2);
    assert.ok(job, "the order must use the reachable store");
    assert.equal(job.to.id, reachable.id);
    advance(120);
    assert.equal(job.status, "done");
    assert.equal(warehouseStock(reachable, "logs"), 2);
    assert.equal(warehouseStock(cutOff, "logs"), 0);
    assertPhysicalBooks();
});

test("42 a well is only supplied by water inside its service radius", () => {
    setup();
    const well = place(TYPE.WELL, 30, 30);
    employ(well, 1);
    const house = place(TYPE.HOUSE, 32, 30);
    const remote = place(TYPE.WAREHOUSE, 110, 110);
    remote.warehouse.stored.water = 20;
    updateServices();
    assert.equal(state.city.services.byHouse[house.id].water, false);
    const near = place(TYPE.WAREHOUSE, 34, 30);
    near.warehouse.stored.water = 5;
    updateServices();
    assert.equal(state.city.services.byHouse[house.id].water, true);
    assert.equal(getLocalWarehouseStock("water", house.x, house.y, 8), 5);
});

test("43 a full delivery queue reports its rejection instead of failing silently", () => {
    setup();
    for (let index = 0; index < 4; index++) place(TYPE.WAREHOUSE, 20 + index * 12, 20);
    const sources = [];
    for (let index = 0; index < MAX_LOGISTICS_JOBS; index++) {
        const source = place(TYPE.LUMBER, 12 + (index % 10) * 10, 96 + Math.floor(index / 10) * 8);
        source.inventory.output.logs = 2;
        sources.push(source);
    }
    let accepted = 0;
    for (const source of sources) if (requestHaul(source, "logs", 2)) accepted++;
    assert.equal(accepted, MAX_LOGISTICS_JOBS);
    const overflow = place(TYPE.LUMBER, 20, 70);
    overflow.inventory.output.logs = 2;
    assert.equal(requestHaul(overflow, "logs", 2), null);
    assert.match(state.city.logistics.lastRejection.reason, /queue is full/i);
    assert.ok(state.city.logistics.stats.queueRejected >= 1);
});

test("44 maximum load stays bounded and auditable", () => {
    setup();
    for (let index = 0; index < 12; index++) place(TYPE.WAREHOUSE, 20 + index * 10, 60);
    const sources = [];
    for (let index = 0; index < MAX_LOGISTICS_JOBS; index++) {
        const source = place(TYPE.LUMBER, 12 + (index % 12) * 10, 96 + Math.floor(index / 12) * 8);
        sources.push(source);
        assert.equal(addLocalOutput(source, "logs", 2), 2);
    }
    for (const source of sources) assert.ok(requestHaul(source, "logs", 2));
    assert.equal(state.city.logistics.jobs.filter(job => job.status !== "done" && job.status !== "cancelled").length, MAX_LOGISTICS_JOBS);
    const started = performance.now();
    advance(240);
    const elapsed = performance.now() - started;
    console.log("maximum-load logistics: " + MAX_LOGISTICS_JOBS + " orders, 12 stores, 240 ticks in " + Math.round(elapsed) + " ms");
    assert.ok(elapsed < 5000, "240 ticks at maximum load must stay bounded; actual " + Math.round(elapsed) + " ms");
    assert.ok(state.city.logistics.carriers.length <= MAX_CARRIERS);
    assert.ok(state.city.logistics.jobs.filter(job => ["pending", "assigned", "blocked"].includes(job.status)).length <= MAX_LOGISTICS_JOBS);
    const logs = getGoodsAudit().rows.find(row => row.good === "logs");
    assert.equal(logs.balanced, true, "logs must reconcile after maximum load: " + JSON.stringify(logs));
    assert.ok(logs.produced >= MAX_LOGISTICS_JOBS * 2);
    assertPhysicalBooks();
});

test("45 a new realm opens its goods book with the starting stores", () => {
    resetState();
    state.tick = 0;
    state.resources = { wood: 180, stone: 95, gold: 75, food: 120 };
    state.entities = [];
    initializeCityForRealm({ seedWarehouse: false });
    openGoodsBookForNewRealm();
    const audit = getGoodsAudit();
    const food = audit.rows.find(row => row.good === "food");
    assert.equal(food.opening, 120);
    assert.equal(food.physical, 120);
    assert.equal(food.difference, 0);
    assert.equal(audit.balanced, true);
});

test("46 bread delivered to a granary is booked as consumed when it becomes royal food", () => {
    setup();
    const bakery = place(TYPE.BAKERY, 20, 20);
    const granary = place(TYPE.WAREHOUSE, 30, 20);
    granary.warehouse.filters = ["grain", "flour", "bread"];
    bakery.inventory.output.bread = 4;
    setAuditOpening(getPhysicalStockMap());
    const foodBefore = state.resources.food;
    const job = requestHaul(bakery, "bread", 3);
    assert.ok(job);
    advance(80);
    assert.equal(job.status, "done");
    assert.equal(state.resources.food, foodBefore + 3);
    const bread = getGoodsAudit().rows.find(row => row.good === "bread");
    assert.equal(bread.consumed, 3);
    assert.equal(bread.physical, 1);
    assert.equal(bread.balanced, true);
    const food = getGoodsAudit().rows.find(row => row.good === "food");
    assert.equal(food.produced, 3, "bread delivered to the granary must book its food output");
    assert.equal(food.balanced, true, "bread conversion must reconcile royal food: " + JSON.stringify(food));
});

test("47 card food costs are booked as consumption", () => {
    resetState();
    state.resources = { wood: 0, stone: 0, gold: 0, food: 50 };
    setAuditOpening({ food: 50 });
    assert.equal(payForCard({ id: "test-card", cost: { food: 10 } }), true);
    assert.equal(state.incomeThisTick.food, -10, "card spending must reach the tick ledger");
    const food = getGoodsAudit().rows.find(row => row.good === "food");
    assert.equal(food.physical, 40);
    assert.equal(food.consumed, 10);
    assert.equal(food.balanced, true);
});

test("48 market food trades are booked on both sides", () => {
    resetState();
    state.resources = { wood: 0, stone: 0, gold: 100, food: 50 };
    setAuditOpening({ food: 50 });
    const partner = getTradePartners()[0];
    assert.equal(executeTrade(partner.id, "food", "sell", 5).ok, true);
    assert.equal(state.incomeThisTick.food, -5, "selling food must reach the tick ledger");
    assert.equal(getGoodsAudit().rows.find(row => row.good === "food").balanced, true);
    assert.equal(executeTrade(partner.id, "food", "buy", 5).ok, true);
    assert.equal(state.incomeThisTick.food, 0, "buying food must offset the sale in the tick ledger");
    const food = getGoodsAudit().rows.find(row => row.good === "food");
    assert.equal(food.physical, 50);
    assert.equal(food.produced, 5);
    assert.equal(food.consumed, 5);
    assert.equal(food.balanced, true);
});

test("49 two construction sites cannot reserve more stone blocks than the store holds", () => {
    setup();
    const warehouse = place(TYPE.WAREHOUSE, 30, 30);
    warehouse.warehouse.stored.stoneBlocks = 10;
    const firstSite = place(TYPE.HOUSE, 40, 30);
    const secondSite = place(TYPE.HOUSE, 40, 45);
    firstSite.construction = { stage: 0, progress: 0 };
    secondSite.construction = { stage: 0, progress: 0 };
    const first = requestConstructionDelivery(firstSite, "stoneBlocks", 8);
    const second = requestConstructionDelivery(secondSite, "stoneBlocks", 8);
    assert.ok(first, "the first construction delivery should reserve");
    assert.ok(second, "the second delivery should receive only the remaining stock");
    assert.equal(first.quantity, 8);
    assert.equal(second.quantity, 2);
    assert.equal(warehouse.warehouse.reservedOut.stoneBlocks, 10, "source reservations must not exceed physical stock");
    assertPhysicalBooks();
});

test("50 a real supply job uses free mill input capacity and releases it on cancellation", () => {
    setup();
    const warehouse = place(TYPE.WAREHOUSE, 30, 30);
    warehouse.warehouse.stored.grain = 20;
    const mill = place(TYPE.MILL, 40, 30);
    const capacity = getInputCapacity(TYPE.MILL);
    mill.inventory.input.grain = capacity - 10;

    // The mill consumes grain only. A second supply for flour is not a real
    // recipe at this building, so the test proves that rejection explicitly
    // instead of writing a fake reservation by hand.
    const first = requestSupply(mill, "grain", 8);
    assert.ok(first, "a real supply order must reserve the free input capacity");
    assert.equal(first.quantity, 8);
    assert.equal(first.status, "pending");
    assert.equal(state.city.logistics.jobs.filter(job => job.id === first.id).length, 1, "the job must be queued exactly once");
    assert.equal(mill.inventory.reservedIn.grain, 8);
    assert.equal(warehouse.warehouse.reservedOut.grain, 8);
    assert.equal(inputSpace(mill), 2, "the job must consume the shared input space");
    assert.equal(requestSupply(mill, "flour", 8), null, "a mill has no flour input recipe");
    assert.equal(mill.inventory.reservedIn.flour, 0);
    assert.equal(warehouse.warehouse.reservedOut.flour, 0);
    assertPhysicalBooks();

    cancelJobsForEntity(warehouse.id);
    assert.equal(first.status, "cancelled");
    assert.equal(mill.inventory.reservedIn.grain, 0, "cancelling must release the destination reservation");
    assert.equal(warehouse.warehouse.reservedOut.grain, 0, "cancelling must release the source reservation");
    assert.equal(inputSpace(mill), 10, "the full free capacity must be restored");

    const replacement = requestSupply(mill, "grain", 8);
    assert.ok(replacement, "a fresh job must be accepted after cancellation");
    assert.equal(replacement.quantity, 8);
    assert.equal(mill.inventory.reservedIn.grain, 8);
    assert.equal(warehouse.warehouse.reservedOut.grain, 8);
    assert.equal(inputSpace(mill), 2);
    cancelJobsForEntity(warehouse.id);
    assert.equal(replacement.status, "cancelled");
    assert.equal(inputSpace(mill), 10);
    assertPhysicalBooks();
});

test("50b shared input capacity reserves two different goods without exceeding the limit", () => {
    setup();
    const mill = place(TYPE.MILL, 40, 30);
    const capacity = 10;

    // Physical occupancy and reservations use the same shared limit, regardless
    // of the good name. A small physically occupied input also proves that the
    // free-space calculation is not based on reservations alone.
    mill.inventory.input.grain = 3;
    assert.equal(getInputCapacityUsage(mill, capacity).free, 7);
    mill.inventory.input.grain = 0;

    assert.equal(reserveInputCapacity(mill, "grain", 8, capacity), 8);
    assert.equal(mill.inventory.reservedIn.grain, 8);
    assert.equal(reserveInputCapacity(mill, "flour", 8, capacity), 2,
        "the second, different good may only receive the remaining capacity");
    assert.equal(mill.inventory.reservedIn.flour, 2);
    let usage = getInputCapacityUsage(mill, capacity);
    assert.equal(usage.occupied, 10);
    assert.equal(usage.free, 0);
    assert.ok(usage.occupied <= capacity, "physical stock plus reservations must never exceed capacity");

    const physical = Object.values(mill.inventory.input).reduce((sum, value) => sum + Number(value || 0), 0);
    assert.ok(physical + usage.reserved <= capacity);

    // Invalid requests must neither reserve nor consume capacity.
    for (const invalid of [-1, -8, 0, NaN, Infinity, -Infinity, 1.5, true, "8", null]) {
        assert.equal(reserveInputCapacity(mill, "grain", invalid, capacity), 0,
            "only a positive safe integer amount may reserve capacity");
    }
    assert.equal(getInputCapacityUsage(mill, capacity).occupied, 10);

    assert.equal(releaseInputCapacity(mill, "grain", 8), 8);
    assert.equal(mill.inventory.reservedIn.grain, 0);
    assert.equal(mill.inventory.reservedIn.flour, 2, "cancelling the first reservation must not touch the second");
    usage = getInputCapacityUsage(mill, capacity);
    assert.equal(usage.free, 8);
    assert.equal(releaseInputCapacity(mill, "flour", 2), 2);
    assert.equal(mill.inventory.reservedIn.flour, 0);
    assert.equal(getInputCapacityUsage(mill, capacity).free, 10);
    assertPhysicalBooks();
});

test("51 producers cannot reserve more inbound warehouse space than remains", () => {
    setup();
    const warehouse = place(TYPE.WAREHOUSE, 30, 30);
    warehouse.warehouse.capacity = 10;
    warehouse.warehouse.stored.logs = 8;
    const sources = [
        place(TYPE.LUMBER, 20, 20),
        place(TYPE.LUMBER, 20, 40),
        place(TYPE.LUMBER, 20, 60)
    ];
    for (const source of sources) source.inventory.output.logs = 1;
    const first = requestHaul(sources[0], "logs", 1);
    const second = requestHaul(sources[1], "logs", 1);
    const third = requestHaul(sources[2], "logs", 1);
    assert.ok(first);
    assert.ok(second);
    assert.equal(third, null, "a producer must not receive space already reserved by another job");
    assert.equal(warehouse.warehouse.reservedIn.logs, 2);
    assert.equal(warehouse.warehouse.stored.logs, 8);
    assert.equal(sources[0].inventory.reservedOut.logs, 1);
    assert.equal(sources[1].inventory.reservedOut.logs, 1);
    assert.equal(sources[2].inventory.reservedOut.logs, 0);
    assertPhysicalBooks();
});
