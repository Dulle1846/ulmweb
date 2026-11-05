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
    const farm=new Entity(4,4,TYPE.FARM);
    state.entities=[resident(1),resident(2),farm];
    state.entities[0].workplace=farm;
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

test("infection does not jump between separate households",()=>{
    setup();
    state.entities[1].householdId="house:2:2";
    startOutbreak({severity:3});
    const original=Math.random;
    Math.random=()=>0;
    try{
        state.tick=20;
        updateHealth();
        assert.equal(getHealthSnapshot().sick,1);
    }finally{Math.random=original;}
});
test("health transmission is processed at most once per simulation interval",()=>{
    setup();
    state.entities.push(resident(3));
    startOutbreak({severity:3});
    const original=Math.random;
    Math.random=()=>0;
    try{
        state.tick=20;
        updateHealth();
        const firstCases=getHealthSnapshot().cases;
        updateHealth();
        assert.equal(getHealthSnapshot().cases,firstCases);
    }finally{Math.random=original;}
});

test("starting treatment applies the intended containment exactly once",()=>{
    setup();
    const result=applyHealthEffects({outbreak:true,severity:2,containment:2});
    assert.equal(result.containment,2);
});
test("an escalation during an active outbreak does not count as a new outbreak",()=>{
    setup();
    startOutbreak({severity:1});
    const first=getHealthSnapshot();
    const result=startOutbreak({severity:3,containment:1,disease:"red-fever"});
    assert.equal(result.outbreaks,first.outbreaks);
    assert.equal(result.cases,first.cases);
    assert.equal(result.severity,3);
});

test("treatment can reduce severity while opening an outbreak",()=>{
    setup();
    const result=applyHealthEffects({outbreak:true,severity:3,containment:1,treatment:2});
    assert.equal(result.severity,1);
    assert.equal(result.containment,1);
});

test("a new outbreak can begin after the prior outbreak has no active cases",()=>{
    setup();
    startOutbreak({severity:1});
    delete state.entities[0].illnessUntilTick;
    const result=startOutbreak({severity:2,disease:"red-fever"});
    assert.equal(result.outbreaks,2);
    assert.equal(result.cases,2);
    assert.equal(result.disease,"red-fever");
});
