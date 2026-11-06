import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { spawnEntity } from "../../js/world/entities.js";
import { initializeCityForRealm, ensureInventory, getInventorySummary } from "../../js/systems/logistics.js";
import { updateFields } from "../../js/systems/fields.js";
import { updateBuildingIncome } from "../../js/simulation/buildings.js";
import { updateLogistics, updateLogisticsMovement } from "../../js/systems/logistics.js";

const WIDTH = 160;
const HEIGHT = 160;

function createDryWorld() {
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
    state.explored = Array.from({ length: WIDTH }, () => Array(HEIGHT).fill(true));
    state.resources = { wood: 0, stone: 0, gold: 0, food: 0 };
    state.incomeThisTick = { wood: 0, stone: 0, gold: 0, food: 0 };
    state.morale = 80;
}

function employ(building, count, offset = 4) {
    for (let index = 0; index < count; index++) {
        const worker = spawnEntity(
            Math.round(building.x + index - (count - 1) / 2),
            Math.round(building.y + offset),
            TYPE.VILLAGER
        );
        assert.ok(worker, "fixture worker should spawn");
        worker.workplace = building;
        worker.anchor = { x: building.x, y: building.y };
    }
}

test("a full grain-to-bread chain is carried into the warehouse over time", () => {
    createDryWorld();

    const warehouse = spawnEntity(30, 80, TYPE.WAREHOUSE);
    const farm = spawnEntity(50, 80, TYPE.FARM);
    const mill = spawnEntity(70, 80, TYPE.MILL);
    const bakery = spawnEntity(90, 80, TYPE.BAKERY);
    assert.ok(warehouse && farm && mill && bakery, "all chain buildings should spawn");

    employ(farm, 4);
    employ(mill, 2);
    employ(bakery, 2);
    initializeCityForRealm({ seedWarehouse: false });
    ensureInventory(warehouse);
    ensureInventory(farm);
    ensureInventory(mill);
    ensureInventory(bakery);

    let deliveredAtTick = null;
    for (let tick = 1; tick <= 2400; tick++) {
        state.tick = tick;
        state.dayOfYear = (tick - 1) % 400;
        state.seasonIndex = Math.floor(state.dayOfYear / 100) % 4;
        updateFields();
        updateBuildingIncome();
        updateLogistics();
        updateLogisticsMovement(0.2);
        if ((state.city.logistics.stats.breadDelivered || 0) > 0) {
            deliveredAtTick = tick;
            break;
        }
    }

    assert.ok(deliveredAtTick, "bread should reach the warehouse within the simulation window");
    assert.ok(deliveredAtTick > 200, "the chain must run through a real seasonal harvest");
    assert.ok(farm.field.harvests >= 1, "the farm must harvest at least one seasonal crop");

    const stored = getInventorySummary(warehouse).stored;
    assert.ok((state.city.logistics.stats.grain || 0) > 0, "grain must be hauled to the warehouse");
    assert.ok((state.city.logistics.stats.flour || 0) > 0, "flour must be hauled to the warehouse");
    assert.ok((state.city.logistics.stats.breadDelivered || 0) > 0, "bread delivery must be recorded");
    assert.ok(state.resources.food >= state.city.logistics.stats.breadDelivered, "delivered bread must become royal food");
    assert.equal(stored.bread || 0, 0, "bread is converted to food on warehouse arrival, never duplicated as stored bread");
    assert.ok((state.economy.productionChains.flourProduced || 0) > 0, "the mill must actually produce flour");
    assert.ok((state.economy.productionChains.breadProduced || 0) > 0, "the bakery must actually produce bread");

    const breadJob = state.city.logistics.jobs.find(job =>
        job.kind === "haul" && job.good === "bread" && job.to?.id === warehouse.id && job.status === "done"
    );
    assert.ok(breadJob, "the completed bread haul must point at the warehouse");
    assert.equal(
        state.city.logistics.carriers.some(carrier => carrier.id === breadJob.carrierId),
        false,
        "the bread carrier must be released after delivery"
    );
});
