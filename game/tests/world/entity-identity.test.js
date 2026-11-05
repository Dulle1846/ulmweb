import test from "node:test";
import assert from "node:assert/strict";
import {resetState,state} from "../../js/core/state.js";
import {TYPE} from "../../js/core/types.js";
import {spawnEntity} from "../../js/world/entities.js";
test("entities receive stable seed-scoped IDs",()=>{resetState();state.worldSeed=314159;const a=spawnEntity(1,1,TYPE.VILLAGER),b=spawnEntity(2,2,TYPE.VILLAGER);assert.match(a.id,/^e[0-9a-z]+-[0-9a-z]+$/);assert.equal(a.personId,a.id);assert.notEqual(a.id,b.id);assert.equal(state.nextEntityId,3);});
test("identity allocation replays for a new realm with the same seed",()=>{resetState();state.worldSeed=2026;const first=spawnEntity(1,1,TYPE.VILLAGER).id;resetState();state.worldSeed=2026;assert.equal(spawnEntity(1,1,TYPE.VILLAGER).id,first);});
