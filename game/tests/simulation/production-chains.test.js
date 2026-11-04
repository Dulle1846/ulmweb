import test from "node:test";
import assert from "node:assert/strict";
import {resetState,state} from "../../js/core/state.js";
import {TYPE} from "../../js/core/types.js";
import {spawnEntity} from "../../js/world/entities.js";
import {updateBuildingIncome} from "../../js/simulation/buildings.js";

function prepare(tick){
    resetState();
    state.tick=tick;state.seasonIndex=0;
    state.resources={wood:20,stone:20,gold:0,food:20};
    state.incomeThisTick={wood:0,stone:0,gold:0,food:0};
    state.morale=70;
}

test("a staffed mill consumes timber and increases nearby farm output",()=>{
    prepare(18);
    const farm=spawnEntity(80,80,TYPE.FARM);
    const mill=spawnEntity(84,80,TYPE.MILL);
    for(let i=0;i<4;i++)spawnEntity(81+i,80,TYPE.VILLAGER).workplace=farm;
    for(let i=0;i<2;i++)spawnEntity(84+i,81,TYPE.VILLAGER).workplace=mill;
    updateBuildingIncome();
    assert.equal(state.resources.food,28);
    assert.equal(state.resources.wood,19.5);
    assert.equal(state.economy.productionChains.millWoodConsumed,0.5);
    assert.equal(state.economy.productionChains.millBonusFood,3);
});

test("a mill cannot boost production without timber to fuel it",()=>{
    prepare(18);
    state.resources.wood=0;
    const farm=spawnEntity(80,80,TYPE.FARM);
    const mill=spawnEntity(84,80,TYPE.MILL);
    for(let i=0;i<4;i++)spawnEntity(81+i,80,TYPE.VILLAGER).workplace=farm;
    for(let i=0;i<2;i++)spawnEntity(84+i,81,TYPE.VILLAGER).workplace=mill;
    updateBuildingIncome();
    assert.equal(state.resources.food,25);
    assert.equal(state.economy.productionChains.millBonusFood,0);
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
