import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../js/core/state.js";
import { TYPE } from "../js/core/types.js";
import { ROUTINE } from "../js/core/config.js";
import { spawnEntity } from "../js/world/entities.js";
import { updateVillagers } from "../js/simulation/villagers.js";

function simulate(seed) {
    resetState();
    state.worldSeed=seed;
    state.dayOfYear=1;
    const villager=spawnEntity(40,40,TYPE.VILLAGER);
    villager.home={x:40,y:40};
    villager.anchor={x:40,y:40};
    villager.jobRefreshTimer=0;
    villager.routineTimer=0;
    villager.routinePhase=ROUTINE.ON_BREAK;
    updateVillagers();
    return {
        jobRefreshTimer:villager.jobRefreshTimer,
        routineTimer:villager.routineTimer,
        targetX:villager.targetX,
        targetY:villager.targetY,
        stream:state.randomStreams.villagers
    };
}

test("villager job and daily routine choices replay from the world seed",()=>{
    assert.deepEqual(simulate(445566),simulate(445566));
});

test("villager routine choices use an independent deterministic stream",()=>{
    const first=simulate(445566);
    const second=simulate(445567);
    assert.notDeepEqual(first,second);
});
