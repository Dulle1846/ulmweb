import test from "node:test";
import assert from "node:assert/strict";
import {resetState,state} from "../../js/core/state.js";
import {TYPE} from "../../js/core/types.js";
import {spawnEntity} from "../../js/world/entities.js";
import {updateBuildingIncome} from "../../js/simulation/buildings.js";
import {ensureInventory,getInventorySummary,initializeCityForRealm} from "../../js/systems/logistics.js";

function prepare(tick){
    resetState();
    state.tick=tick;state.seasonIndex=0;
    state.resources={wood:20,stone:20,gold:0,food:20};
    state.incomeThisTick={wood:0,stone:0,gold:0,food:0};
    state.morale=70;
}

test("a staffed sawmill consumes logs and produces planks in its local store",()=>{
    prepare(24);
    initializeCityForRealm({seedWarehouse:false});
    const sawmill=spawnEntity(84,80,TYPE.SAWMILL);
    ensureInventory(sawmill);
    sawmill.inventory.input.logs=4;
    for(let i=0;i<2;i++)spawnEntity(84+i,81,TYPE.VILLAGER).workplace=sawmill;
    updateBuildingIncome();
    const summary=getInventorySummary(sawmill);
    assert.ok(summary.output.planks>0);
    assert.ok(summary.input.logs<4);
    assert.equal(state.economy.productionChains.planksProduced,summary.output.planks);
});

test("a sawmill without logs cannot create planks from nothing",()=>{
    prepare(24);
    initializeCityForRealm({seedWarehouse:false});
    const sawmill=spawnEntity(84,80,TYPE.SAWMILL);
    for(let i=0;i<2;i++)spawnEntity(84+i,81,TYPE.VILLAGER).workplace=sawmill;
    updateBuildingIncome();
    const summary=getInventorySummary(sawmill);
    assert.equal(summary.output.planks||0,0);
    assert.equal(sawmill.productionReason,"No logs in reachable stores");
});

test("a staffed tavern converts provisions into gold and morale",()=>{
    prepare(55);
    const tavern=spawnEntity(80,80,TYPE.TAVERN);
    for(let i=0;i<2;i++)spawnEntity(81+i,80,TYPE.VILLAGER).workplace=tavern;
    updateBuildingIncome();
    assert.equal(state.resources.food,19);
    assert.equal(state.resources.gold,3);
    assert.equal(state.morale,70.6);
    assert.equal(state.economy.productionChains.tavernFoodConsumed,1);
    assert.equal(state.economy.productionChains.tavernGoldProduced,3);
});

test("a tavern with no provisions cannot create gold from nothing",()=>{
    prepare(55);
    state.resources.food=0;
    const tavern=spawnEntity(80,80,TYPE.TAVERN);
    for(let i=0;i<2;i++)spawnEntity(81+i,80,TYPE.VILLAGER).workplace=tavern;
    updateBuildingIncome();
    assert.equal(state.resources.gold,0);
    assert.equal(state.resources.food,0);
    assert.equal(state.morale,70);
    assert.equal(state.economy.productionChains.tavernGoldProduced,0);
});

test("partial legacy production ledgers are normalized before accumulation",()=>{
    prepare(18);
    state.economy={productionChains:{millWoodConsumed:"not-a-number",millBonusFood:-4}};
    updateBuildingIncome();
    assert.equal(state.economy.productionChains.millWoodConsumed,0);
    assert.equal(state.economy.productionChains.millBonusFood,0);
    assert.equal(state.economy.productionChains.tavernFoodConsumed,0);
    assert.equal(state.economy.productionChains.tavernGoldProduced,0);
});
