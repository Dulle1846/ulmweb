import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { WORLD_W, WORLD_H } from "../../js/core/config.js";
import { spawnEntity } from "../../js/world/entities.js";
import { generateResourceGeography } from "../../js/systems/resource-geography.js";
import { initializeCityForRealm, ensureInventory, MAX_CARRIERS } from "../../js/systems/logistics.js";
import { initializeSettlementForRealm } from "../../js/systems/settlement.js";
import { updateSimulation } from "../../js/simulation/simulation.js";
import { updateLogisticsMovement } from "../../js/systems/logistics.js";

const YEARS = 5;
const TICKS_PER_YEAR = 400;
const WIDTH = WORLD_W;
const HEIGHT = WORLD_H;

function paintHeight(x0, y0, x1, y1, height) {
    for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) state.heightMap[y * WIDTH + x] = height;
    }
}

function createCityWorld() {
    resetState();
    state.hasStarted = true;
    state.isPaused = false;
    state.gameOver = false;
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
    state.resources = { wood: 1000, stone: 1000, gold: 2000, food: 4000 };
    state.incomeThisTick = { wood: 0, stone: 0, gold: 0, food: 0 };
    state.morale = 85;

    // Resource-bearing terrain near the extraction buildings and a pond at
    // the eastern edge for the well. Everything else stays dry farmland.
    paintHeight(45, 25, 105, 38, 0.94);   // stone highlands
    paintHeight(45, 92, 105, 112, 0.82);  // managed forest
    paintHeight(128, 112, 140, 124, 0.22); // water
    generateResourceGeography(state.worldSeed);
}

function place(type, x, y) {
    const building = spawnEntity(x, y, type);
    assert.ok(building, `${type} should spawn at ${x},${y}`);
    return building;
}

function employ(building, count, houses, cursor) {
    for (let index = 0; index < count; index++) {
        const home = houses[cursor.index++ % houses.length];
        const worker = spawnEntity(
            Math.round(building.x + index - (count - 1) / 2),
            Math.round(building.y + 4),
            TYPE.VILLAGER
        );
        assert.ok(worker, `worker for ${building.type} should spawn`);
        worker.workplace = building;
        worker.anchor = { x: building.x, y: building.y };
        worker.home = { x: home.x, y: home.y };
        worker.householdId = `house:${home.id}`;
        // Keep the deliberately complete chain fully staffed. The villagers
        // still run their normal routines; only automatic reassignment is
        // postponed beyond this test horizon.
        worker.jobRefreshTimer = 1_000_000;
    }
}

test("a full city sustains several production chains and logistics across five years", () => {
    createCityWorld();

    const houses = [];
    for (let index = 0; index < 8; index++) {
        houses.push(place(TYPE.STONE_HOUSE, 10 + (index % 2) * 8, 45 + Math.floor(index / 2) * 15));
    }

    const warehouses = [
        place(TYPE.WAREHOUSE, 30, 50),
        place(TYPE.WAREHOUSE, 30, 80),
        place(TYPE.WAREHOUSE, 30, 110),
    ];

    const farms = [place(TYPE.FARM, 55, 50), place(TYPE.FARM, 75, 50)];
    const mill = place(TYPE.MILL, 95, 50);
    const bakery = place(TYPE.BAKERY, 115, 50);
    const lumberCamps = [place(TYPE.LUMBER, 55, 105), place(TYPE.LUMBER, 75, 105)];
    const sawmill = place(TYPE.SAWMILL, 95, 105);
    const quarry = place(TYPE.QUARRY, 55, 30);
    const mason = place(TYPE.MASON, 95, 30);
    const well = place(TYPE.WELL, 124, 116);
    const services = [
        place(TYPE.TAVERN, 125, 80),
        place(TYPE.TEMPLE, 125, 70),
        place(TYPE.CLINIC, 125, 90),
        place(TYPE.MARKET, 125, 60),
        place(TYPE.FORESTER, 115, 105),
    ];

    initializeCityForRealm({ seedWarehouse: false });
    initializeSettlementForRealm();
    for (const warehouse of warehouses) {
        ensureInventory(warehouse);
        // The test focuses on chain throughput and carriers; a deliberately
        // broad depot keeps the five-year run from ending on a storage cap.
        warehouse.warehouse.capacity = 2400;
    }

    const cursor = { index: 0 };
    for (const warehouse of warehouses) employ(warehouse, 2, houses, cursor);
    for (const farm of farms) employ(farm, 4, houses, cursor);
    employ(mill, 2, houses, cursor);
    employ(bakery, 2, houses, cursor);
    for (const lumber of lumberCamps) employ(lumber, 3, houses, cursor);
    employ(sawmill, 2, houses, cursor);
    employ(quarry, 4, houses, cursor);
    employ(mason, 2, houses, cursor);
    employ(well, 1, houses, cursor);
    employ(services[0], 2, houses, cursor);
    employ(services[1], 2, houses, cursor);
    employ(services[2], 2, houses, cursor);
    employ(services[3], 2, houses, cursor);
    employ(services[4], 2, houses, cursor);

    const warehouseDeliveries = new Set();
    for (let tick = 0; tick < YEARS * TICKS_PER_YEAR; tick++) {
        updateSimulation();
        updateLogisticsMovement(0.2);
        for (const job of state.city.logistics.jobs) {
            if (job.status === "done" && job.kind === "haul" && job.to?.kind === "warehouse") {
                warehouseDeliveries.add(job.good);
            }
        }
    }

    assert.equal(state.tick, YEARS * TICKS_PER_YEAR, "the city must run for the full horizon");
    assert.equal(state.year, YEARS + 1, "five 400-day years must have elapsed");
    assert.equal(state.gameOver, false, "the fully staffed city must remain viable");
    assert.ok(state.entities.length >= 60, "the city must retain its buildings and residents");
    assert.ok(state.entities.every(entity => Number.isFinite(entity.x) && Number.isFinite(entity.y)), "entity coordinates must remain finite");
    assert.ok(state.entities.every(entity => entity.x >= 0 && entity.y >= 0 && entity.x < WIDTH && entity.y < HEIGHT), "entities must stay inside the world");
    assert.ok(state.city.logistics.carriers.length <= MAX_CARRIERS, "the carrier fleet must stay within its bound");
    assert.ok(state.city.logistics.carriers.every(carrier => Number.isFinite(carrier.x) && Number.isFinite(carrier.y)), "carriers must keep valid positions");

    const production = state.economy.productionChains;
    const stats = state.city.logistics.stats;
    assert.ok(production.logsHarvested > 0, "lumber camps must harvest timber");
    assert.ok(production.stoneExtracted > 0, "the quarry must extract stone");
    assert.ok(production.planksProduced > 0, "the sawmill must produce planks");
    assert.ok(production.flourProduced > 0, "the mill must produce flour");
    assert.ok(production.breadProduced > 0, "the bakery must produce bread");
    assert.ok(production.waterDrawn > 0, "the well must draw water");
    assert.ok(farms.every(farm => farm.field.harvests > 0), "both farms must complete a seasonal harvest");
    assert.ok(stats.breadDelivered > 0, "bread must reach the warehouse and become royal food");
    assert.ok(warehouseDeliveries.has("grain"), "grain must be hauled into a warehouse");
    assert.ok(warehouseDeliveries.has("flour"), "flour must be hauled into a warehouse");
    assert.ok(warehouseDeliveries.has("bread"), "bread must be hauled into a warehouse");
    assert.ok(warehouseDeliveries.has("logs"), "logs must be hauled into a warehouse");
    assert.ok(warehouseDeliveries.has("planks"), "planks must be hauled into a warehouse");
    assert.ok(warehouseDeliveries.has("stoneBlocks"), "stone blocks must be hauled into a warehouse");
    assert.ok(warehouseDeliveries.has("cutStone"), "cut stone must be hauled into a warehouse");
    assert.ok(warehouseDeliveries.has("water"), "water must be hauled into a warehouse");
    assert.ok(state.city.logistics.jobs.filter(job => job.status === "done").length >= 20, "the city must complete a substantial logistics workload");
});
