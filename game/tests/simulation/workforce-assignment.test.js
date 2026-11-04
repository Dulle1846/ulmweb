import test from "node:test";
import assert from "node:assert/strict";
import {resetState,state} from "../../js/core/state.js";
import {TYPE} from "../../js/core/types.js";
import {WORLD_W,WORLD_H} from "../../js/core/config.js";
import {spawnEntity} from "../../js/world/entities.js";
import {updateVillagers} from "../../js/simulation/villagers.js";

test("villagers never overfill a workplace beyond its staffing capacity",()=>{
    resetState();
    state.terrainResolution=1;
    state.terrainPixW=WORLD_W;
    state.terrainPixH=WORLD_H;
    state.heightMap=new Float32Array(WORLD_W*WORLD_H).fill(0.5);
    state.isPaused=false;
    state.gameOver=false;
    const farm=spawnEntity(80,80,TYPE.FARM);
    const villagers=Array.from({length:5},(_,index)=>{
        const villager=spawnEntity(81+index,80,TYPE.VILLAGER);
        villager.jobRefreshTimer=0;
        villager.routineTimer=1000;
        return villager;
    });

    updateVillagers();

    const assigned=villagers.filter(villager=>villager.workplace===farm);
    assert.equal(assigned.length,4);
    assert.equal(villagers.filter(villager=>villager.workplace===null).length,1);
});

test("a villager is released from a destroyed workplace on reassignment",()=>{
    resetState();
    state.isPaused=false;
    state.gameOver=false;
    const farm=spawnEntity(80,80,TYPE.FARM);
    const villager=spawnEntity(81,80,TYPE.VILLAGER);
    villager.workplace=farm;
    villager.jobRefreshTimer=0;
    villager.routineTimer=1000;
    farm.dead=true;

    updateVillagers();

    assert.equal(villager.workplace,null);
    assert.equal(villager.job,"wanderer");
});
