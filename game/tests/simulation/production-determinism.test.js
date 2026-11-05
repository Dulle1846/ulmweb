import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { spawnEntity } from "../../js/world/entities.js";
import { updateBuildingIncome } from "../../js/simulation/buildings.js";

function runProduction(seed) {
    resetState();
    state.worldSeed = seed;
    state.tick = 18;
    state.resources = { wood: 0, stone: 0, gold: 0, food: 0 };
    const lumber = spawnEntity(20, 20, TYPE.LUMBER);
    for (let index = 0; index < 3; index++) {
        const worker = spawnEntity(18 + index, 20, TYPE.VILLAGER);
        worker.workplace = lumber;
    }
    updateBuildingIncome();
    return {
        wood: state.resources.wood,
        productionDraws: state.randomStreams.production || 0
    };
}

test("lumber output is reproducible for the same realm seed", () => {
    const first = runProduction(20261105);
    assert.deepEqual(runProduction(20261105), first);
    assert.deepEqual(runProduction(20261105), first);
    assert.equal(first.productionDraws, 1);
});
