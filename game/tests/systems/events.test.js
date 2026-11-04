import test,{beforeEach} from "node:test";
import assert from "node:assert/strict";
import {resetState,state} from "../../js/core/state.js";
import {triggerRandomEvent,resolveEventChoice,addLog} from "../../js/systems/events.js";

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
