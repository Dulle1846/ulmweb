import test from "node:test";
import assert from "node:assert/strict";
import {resetState,state} from "../../js/core/state.js";
import {TYPE} from "../../js/core/types.js";
import {spawnEntity} from "../../js/world/entities.js";
import {updateBuildingIncome} from "../../js/simulation/buildings.js";

test("a gold mine creates recurring gold income without research unlocks",()=>{
    resetState();
    state.tick=18;
    state.seasonIndex=0;
    state.resources.gold=0;
    state.incomeThisTick={wood:0,stone:0,gold:0,food:0};
    spawnEntity(80,80,TYPE.GOLDMINE);
    updateBuildingIncome();
    assert.equal(state.resources.gold,2);
    assert.equal(state.incomeThisTick.gold,2);
});
