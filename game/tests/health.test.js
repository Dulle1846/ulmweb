import test from "node:test";
import assert from "node:assert/strict";
import { state,resetState } from "../js/core/state.js";
import { Entity,TYPE } from "../js/core/types.js";
import { startOutbreak,updateHealth,getHealthSnapshot,applyHealthEffects } from "../js/systems/health.js";
import { getWorkforceSnapshot } from "../js/systems/economy.js";

function resident(x,householdId="house:1:1"){
    const person=new Entity(x,1,TYPE.VILLAGER);
    person.home={x:1,y:1};
    person.householdId=householdId;
    return person;
}
function setup(){
    resetState();
    state.hasStarted=true;
    state.morale=80;
    state.entities=[resident(1),resident(2)];
}
test("an outbreak seeds a resident and exposes a measurable public-health state",()=>{
    setup();
    const snapshot=startOutbreak({severity:2,containment:1,disease:"red-fever"});
    assert.equal(snapshot.active,true);
    assert.equal(snapshot.sick,1);
    assert.equal(snapshot.cases,1);
    assert.equal(snapshot.severity,2);
    assert.equal(snapshot.disease,"red-fever");
});
test("infection spreads within a household and reduces effective workforce",()=>{
    setup();
    startOutbreak({severity:3});
    const original=Math.random;
    Math.random=()=>0;
    try{
        state.tick=20;
        updateHealth();
        assert.equal(getHealthSnapshot().sick,2);
        assert.equal(getHealthSnapshot().cases,2);
        assert.equal(getWorkforceSnapshot().employed,0);
    }finally{Math.random=original;}
});
test("recovered residents clear their illness and an empty outbreak closes",()=>{
    setup();
    startOutbreak({severity:1});
    state.tick=120;
    const result=updateHealth();
    assert.equal(result.sick,0);
    assert.equal(result.active,false);
    assert.equal(result.recovered,1);
    assert.equal(state.entities[0].illnessUntilTick,undefined);
});
test("treatment reduces disease severity and containment is bounded",()=>{
    setup();
    startOutbreak({severity:3});
    const result=applyHealthEffects({treatment:2,containment:9});
    assert.equal(result.severity,1);
    assert.equal(result.containment,3);
});
