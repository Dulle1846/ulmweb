import test,{beforeEach} from "node:test";
import assert from "node:assert/strict";
import {resetState,state} from "../js/core/state.js";
import {TYPE} from "../js/core/types.js";
import {spawnEntity} from "../js/world/entities.js";
import {canAccommodateVillagers,getHousingSnapshot,getHouseholdSnapshot,normalizeHouseholdAssignments,updatePopulation} from "../js/systems/population.js";

beforeEach(()=>{
    resetState();
    state.year=2;
    state.tick=400;
    state.morale=72;
    state.resources.food=100;
});

test("housing capacity follows four residents per living house",()=>{
    spawnEntity(40,40,TYPE.HOUSE);
    spawnEntity(42,40,TYPE.HOUSE);
    for(let index=0;index<7;index++)spawnEntity(40+index,42,TYPE.VILLAGER);
    const housing=getHousingSnapshot();
    assert.equal(housing.houses,2);
    assert.equal(housing.population,7);
    assert.equal(housing.capacity,8);
    assert.equal(housing.available,1);
    assert.equal(canAccommodateVillagers(1),true);
    assert.equal(canAccommodateVillagers(2),false);
    assert.equal(canAccommodateVillagers(-1),false);
    assert.equal(canAccommodateVillagers(NaN),false);
});

test("a supported settlement gains one resident at most once per year",()=>{
    const house=spawnEntity(40,40,TYPE.HOUSE);
    for(let index=0;index<3;index++)spawnEntity(41+index,40,TYPE.VILLAGER);
    const newcomer=updatePopulation();
    assert.ok(newcomer);
    assert.equal(newcomer.type,TYPE.VILLAGER);
    assert.deepEqual(newcomer.home,{x:house.x,y:house.y});
    assert.equal(getHousingSnapshot().population,4);
    assert.equal(state.economy.populationGrowth,1);
    assert.equal(state.economy.lastGrowthYear,2);
    assert.equal(updatePopulation(),null);
    assert.equal(getHousingSnapshot().population,4);
});

test("overcrowding prevents yearly growth without exceeding housing capacity",()=>{
    spawnEntity(40,40,TYPE.HOUSE);
    for(let index=0;index<4;index++)spawnEntity(41+index,40,TYPE.VILLAGER);
    assert.equal(updatePopulation(),null);
    assert.equal(getHousingSnapshot().population,4);
    assert.equal(state.economy.populationGrowth,0);
});

test("food shortage and low morale prevent household growth",()=>{
    spawnEntity(40,40,TYPE.HOUSE);
    spawnEntity(41,40,TYPE.VILLAGER);
    state.resources.food=0;
    assert.equal(updatePopulation(),null);
    assert.equal(state.economy.populationGrowth,0);
    state.year=3;
    state.morale=20;
    state.resources.food=100;
    assert.equal(updatePopulation(),null);
    assert.equal(state.economy.populationGrowth,0);
});

test("legacy workplace-based home anchors are migrated into balanced households",()=>{
    const first=spawnEntity(40,40,TYPE.HOUSE);
    const second=spawnEntity(50,40,TYPE.HOUSE);
    for(let index=0;index<7;index++){
        const villager=spawnEntity(40+index,43,TYPE.VILLAGER);
        villager.home={x:35,y:35};
        villager.anchor={x:35,y:35};
    }
    const snapshot=normalizeHouseholdAssignments();
    assert.equal(snapshot.households,2);
    assert.equal(snapshot.housed,7);
    assert.equal(snapshot.unhoused,0);
    assert.deepEqual(snapshot.homes.map(home=>home.residents).sort((a,b)=>b-a),[4,3]);
    for(const villager of state.entities.filter(entity=>entity.type===TYPE.VILLAGER)){
        assert.ok([first,second].some(house=>villager.home.x===house.x&&villager.home.y===house.y));
        assert.equal(villager.householdId,`house:${villager.home.x}:${villager.home.y}`);
        assert.deepEqual(villager.anchor,villager.home);
    }
});

test("new residents join the least occupied household with available capacity",()=>{
    const first=spawnEntity(40,40,TYPE.HOUSE);
    const second=spawnEntity(50,40,TYPE.HOUSE);
    for(let index=0;index<4;index++){
        const villager=spawnEntity(40+index,43,TYPE.VILLAGER);
        villager.home={x:first.x,y:first.y};
    }
    for(let index=0;index<2;index++){
        const villager=spawnEntity(50+index,43,TYPE.VILLAGER);
        villager.home={x:second.x,y:second.y};
    }
    const newcomer=updatePopulation();
    assert.ok(newcomer);
    assert.deepEqual(newcomer.home,{x:second.x,y:second.y});
    assert.equal(getHouseholdSnapshot().homes.find(home=>home.x===second.x&&home.y===second.y).residents,3);
});
