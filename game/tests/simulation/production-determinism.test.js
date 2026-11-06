import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { spawnEntity } from "../../js/world/entities.js";
import { updateBuildingIncome } from "../../js/simulation/buildings.js";
import { ensureInventory, initializeCityForRealm, getInventorySummary } from "../../js/systems/logistics.js";

function runProduction(seed) {
    resetState();
    state.worldSeed = seed;
    state.tick = 24;
    state.resources = { wood: 100, stone: 100, gold: 0, food: 0 };
    initializeCityForRealm({seedWarehouse:false});
    const sawmill = spawnEntity(20, 20, TYPE.SAWMILL);
    ensureInventory(sawmill);
    sawmill.inventory.input.logs = 4;
    for (let index = 0; index < 2; index++) {
        const worker = spawnEntity(18 + index, 20, TYPE.VILLAGER);
        worker.workplace = sawmill;
    }
    updateBuildingIncome();
    return {
        planks: getInventorySummary(sawmill).output.planks || 0,
        logs: getInventorySummary(sawmill).input.logs || 0
    };
}

test("sawmill output is reproducible for the same realm seed", () => {
    const first = runProduction(20261105);
    assert.ok(first.planks > 0);
    assert.ok(first.logs < 4);
    assert.deepEqual(runProduction(20261105), first);
    assert.deepEqual(runProduction(20261105), first);
});
