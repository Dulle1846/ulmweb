import test from "node:test";
import assert from "node:assert/strict";
import {resetState} from "../../js/core/state.js";
import {TYPE} from "../../js/core/types.js";
import {spawnEntity,canSpawnEntity} from "../../js/world/entities.js";

test("batch capacity checks reserve enough room for every requested mobile entity",()=>{
    resetState();
    for(let index=0;index<418;index++)assert.ok(spawnEntity(index%100,Math.floor(index/100),TYPE.VILLAGER));
    assert.equal(canSpawnEntity(TYPE.VILLAGER,2),true);
    assert.equal(canSpawnEntity(TYPE.VILLAGER,3),false);
    assert.ok(spawnEntity(120,120,TYPE.VILLAGER));
    assert.equal(canSpawnEntity(TYPE.VILLAGER,2),false);
});
