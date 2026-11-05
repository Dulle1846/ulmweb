import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../js/core/state.js";
import { TYPE } from "../js/core/types.js";
import { ROUTINE } from "../js/core/config.js";
import { spawnEntity } from "../js/world/entities.js";
import { ensurePersonProfile } from "../js/systems/people.js";
import { updatePersonalAgency } from "../js/systems/agency.js";

let resident;
beforeEach(()=>{
    resetState(); state.worldSeed=4411; state.year=2; state.tick=800;
    state.resources.food=0; state.morale=80;
    resident=spawnEntity(40,40,TYPE.VILLAGER);
    const person=ensurePersonProfile(resident);
    person.lastNeedsYear=1;
    person.needs={food:20,rest:20,safety:70,belonging:20,purpose:20};
    person.goals=["family"];
});

test("yearly needs react to food scarcity and select the most urgent personal goal",()=>{
    const result=updatePersonalAgency();
    assert.equal(result.updated,1);
    assert.equal(resident.person.needs.food,11);
    assert.equal(resident.person.activeGoal.id,"secure_food");
    assert.ok(resident.person.goalHistory.length===0);
    assert.ok(resident.person.memories.some(memory=>memory.type==="goal"&&memory.text.includes("secure food")));
});

test("personal agency is idempotent within a realm year",()=>{
    updatePersonalAgency();
    const snapshot=JSON.stringify(resident.person.needs);
    const memoryCount=resident.person.memories.length;
    assert.deepEqual(updatePersonalAgency(),{updated:0,goalChanges:0});
    assert.equal(JSON.stringify(resident.person.needs),snapshot);
    assert.equal(resident.person.memories.length,memoryCount);
});

test("rest, safety, belonging and purpose respond to actual state",()=>{
    state.resources.food=500; state.morale=20;
    resident.routinePhase=ROUTINE.RESTING;
    resident.job="farmer";
    resident.person.lastNeedsYear=1;
    resident.person.needs={food:50,rest:20,safety:50,belonging:20,purpose:20};
    resident.person.relationships=[{targetId:"friend",targetName:"Friend",kind:"friend",trust:70,respect:70,affinity:80,interactions:2,lastInteractionTick:790}];
    const before={...resident.person.needs};
    updatePersonalAgency();
    assert.ok(resident.person.needs.food>before.food);
    assert.ok(resident.person.needs.rest>before.rest);
    assert.ok(resident.person.needs.belonging>before.belonging);
    assert.ok(resident.person.needs.purpose>before.purpose);
    assert.ok(resident.person.needs.safety<before.safety);
});

test("goal history and memories remain bounded during repeated goal changes",()=>{
    for(let year=2;year<30;year++){
        state.year=year; state.tick=year*400;
        resident.person.lastNeedsYear=year-1;
        const keys=["food","rest","safety","belonging","purpose"];
        resident.person.needs={food:80,rest:80,safety:80,belonging:80,purpose:80};
        resident.person.needs[keys[year%keys.length]]=5;
        updatePersonalAgency();
    }
    assert.ok(resident.person.goalHistory.length<=12);
    assert.ok(resident.person.memories.length<=24);
});

test("personal agency updates named non-villager profiles too",()=>{
    const king=spawnEntity(42,40,TYPE.KNIGHT);
    king.isKing=true;
    const profile=ensurePersonProfile(king);
    profile.lastNeedsYear=1;
    const result=updatePersonalAgency();
    assert.equal(result.updated,2);
    assert.ok(profile.activeGoal);
});
