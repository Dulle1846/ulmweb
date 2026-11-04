import test,{beforeEach} from "node:test";
import assert from "node:assert/strict";
import {resetState,state} from "../../js/core/state.js";
import {TYPE} from "../../js/core/types.js";
import {spawnEntity} from "../../js/world/entities.js";
import {triggerRandomEvent,resolveEventChoice,checkRandomEvents,addLog,EVENT_VARIANT_COUNT} from "../../js/systems/events.js";

beforeEach(()=>{
    resetState();
    state.resources={wood:500,stone:500,gold:500,food:500};
    state.statistics={totalTrades:0,totalBuildingsBuilt:0,totalUnitsRecruited:0,totalEventsResolved:0};
});
test("event log entries receive stable ids, ticks and bounded history",()=>{
    for(let i=0;i<105;i++)addLog("entry "+i);
    assert.equal(state.eventLog.length,100);
    assert.equal(state.eventLog[0].text,"entry 104");
    assert.ok(state.eventLog[0].id>state.eventLog[1].id);
});
test("random realm issues expose choices and resolve into persistent consequences",()=>{
    const issue=triggerRandomEvent();
    assert.ok(issue);
    assert.ok(issue.choices.length>=2);
    const title=issue.title;
    assert.equal(resolveEventChoice(0),true);
    assert.equal(state.activeEvent,null);
    assert.equal(state.statistics.totalEventsResolved,1);
    assert.ok(state.eventLog.some(entry=>entry.text.startsWith(title.toUpperCase()+":")));
});
test("an issue remains unresolved when a choice cannot be paid",()=>{
    const issue=triggerRandomEvent();
    state.resources={wood:0,stone:0,gold:0,food:0};
    const costlyIndex=issue.choices.findIndex(choice=>Object.values(choice.effects?.resources||{}).some(amount=>amount<0));
    if(costlyIndex>=0) {
        assert.equal(resolveEventChoice(costlyIndex),false);
        assert.equal(state.activeEvent.id,issue.id);
    }
});

test("the emergent issue generator combines over twenty thousand narrative variants",()=>{
    assert.ok(EVENT_VARIANT_COUNT>=100000);
});

test("a multi-stage chronicle is scheduled, advanced and archived after its final choice",()=>{
    spawnEntity(10,10,TYPE.HOUSE);
    const originalRandom=Math.random;
    Math.random=()=>0;
    try{
        state.activeEvent={
            id:"test-migration",
            family:"migration",
            title:"A test migration",
            threadStart:"migration",
            choices:[{label:"Begin the chronicle",effects:{}}]
        };
        assert.equal(resolveEventChoice(0),true);
        assert.equal(state.hiddenRealm.activeThreads.length,1);

        for(let expectedStage=0;expectedStage<3;expectedStage++){
            const thread=state.hiddenRealm.activeThreads[0];
            assert.ok(thread);
            state.tick=thread.nextAtTick;
            checkRandomEvents();
            assert.equal(state.activeEvent.thread.id,"migration");
            assert.equal(state.activeEvent.thread.stage,expectedStage);
            assert.equal(resolveEventChoice(0),true);
        }

        assert.equal(state.hiddenRealm.activeThreads.length,0);
        assert.equal(state.hiddenRealm.completedThreads[0].id,"migration");
        assert.equal(state.statistics.totalEventsResolved,4);
    }finally{
        Math.random=originalRandom;
    }
});

test("migration choices cannot add residents when the realm has no vacant housing",()=>{
    state.resources.food=100;
    state.activeEvent={
        id:"housing-test",
        family:"migration",
        title:"A family seeks shelter",
        choices:[{
            label:"Welcome the family",
            effects:{resources:{food:-8},villagers:2}
        }]
    };
    assert.equal(resolveEventChoice(0),false);
    assert.equal(state.resources.food,100);
    assert.equal(state.entities.filter(entity=>entity.type===TYPE.VILLAGER&&!entity.dead).length,0);
    assert.ok(state.activeEvent);
});

test("a resolved discovery can secure a related card for the next draw",()=>{
    state.cardRewardQueue=[];
    state.activeEvent={
        id:"reward-test",family:"discovery",title:"A hidden seam",
        choices:[{label:"Claim the discovery",effects:{cardReward:"gold-mines"}}]
    };
    assert.equal(resolveEventChoice(0),true);
    assert.equal(state.cardRewardQueue.length,1);
    assert.equal(state.cardRewardQueue[0].category,"gold-mines");
    assert.ok(state.eventLog.some(entry=>entry.text.includes("GOLD MINES")));
});
test("event variants exceed one hundred thousand combinations",()=>{
    assert.ok(EVENT_VARIANT_COUNT>=100000);
});
