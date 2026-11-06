import test from "node:test";
import assert from "node:assert/strict";
import {normalizeWorldOptions} from "../../js/world/world.js";
import {resetState,state} from "../../js/core/state.js";
import {canSpawnEntity} from "../../js/world/entities.js";
import {TYPE} from "../../js/core/types.js";

test("world forge options are bounded, complete and deterministic",()=>{
    assert.deepEqual(normalizeWorldOptions({landmass:120,ruggedness:-5,forests:37,water:"62"}),{
        size:"standard",shape:"continent",climate:"temperate",
        landmass:100,ruggedness:0,forests:37,water:62,fertility:55,resources:50
    });
    assert.deepEqual(normalizeWorldOptions(),{
        size:"standard",shape:"continent",climate:"temperate",
        landmass:50,ruggedness:55,forests:52,water:48,fertility:55,resources:50
    });
});
test("entity population limits protect the simulation from runaway spawning",()=>{
    resetState();
    state.entities=Array.from({length:900},()=>({type:TYPE.HOUSE,dead:false}));
    assert.equal(canSpawnEntity(TYPE.HOUSE),false);
    resetState();
    state.entities=Array.from({length:420},()=>({type:TYPE.VILLAGER,dead:false}));
    assert.equal(canSpawnEntity(TYPE.VILLAGER),false);
    assert.equal(canSpawnEntity(TYPE.HOUSE),true);
});
