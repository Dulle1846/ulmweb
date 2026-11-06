import test from "node:test";
import assert from "node:assert/strict";
import {normalizeWorldOptions} from "../../js/world/world.js";
import {resetState,state} from "../../js/core/state.js";
import {canSpawnEntity} from "../../js/world/entities.js";
import {TYPE} from "../../js/core/types.js";

test("world forge options are bounded, complete and deterministic",()=>{
    assert.deepEqual(normalizeWorldOptions({
        landmass:120,ruggedness:-5,forests:37,water:"62",
        mountains:-9,rivers:101,lakes:"77",coastline:"44",snow:0,wetlands:120,aridity:35
    }),{
        landmass:100,ruggedness:0,forests:37,water:62,fertility:55,resources:50,
        mountains:0,rivers:100,lakes:77,coastline:44,snow:0,wetlands:100,aridity:35,
        size:"standard",shape:"continent",climate:"temperate"
    });
    assert.deepEqual(normalizeWorldOptions(),{
        landmass:50,ruggedness:55,forests:52,water:48,fertility:55,resources:50,
        mountains:55,rivers:50,lakes:50,coastline:50,snow:50,wetlands:50,aridity:50,
        size:"standard",shape:"continent",climate:"temperate"
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
