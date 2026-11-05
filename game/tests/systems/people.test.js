import test from "node:test";
import assert from "node:assert/strict";
import {resetState,state} from "../../js/core/state.js";
import {TYPE} from "../../js/core/types.js";
import {spawnEntity,initStartingKingdom} from "../../js/world/entities.js";
import {ensurePersonProfile,normalizePersonProfile,addPersonMemory,PERSON_SPECIES,createEventParticipants,recordPersonEventOutcome} from "../../js/systems/people.js";
test("new residents receive persistent names, fantasy species, traits and needs",()=>{resetState();state.worldSeed=4401;const resident=spawnEntity(3,4,TYPE.VILLAGER);const person=ensurePersonProfile(resident);assert.ok(person.name.includes(" "));assert.ok(PERSON_SPECIES[person.species]);assert.equal(person.id,resident.id);assert.equal(Object.keys(person.traits).length,10);assert.equal(Object.keys(person.needs).length,5);assert.ok(Object.values(person.traits).every(v=>v>=0&&v<=100));});
test("king receives an individual person record when the starting realm is founded",()=>{resetState();state.worldSeed=12;initStartingKingdom();const king=state.entities.find(entity=>entity.isKing);assert.ok(king.person);assert.equal(king.person.role,"king");assert.equal(king.personId,king.id);});
test("person memory is bounded and rejects empty entries",()=>{resetState();state.worldSeed=2;const resident=spawnEntity(1,1,TYPE.VILLAGER);for(let i=0;i<30;i++)addPersonMemory(resident,{text:"Memory "+i,tick:i,importance:i});assert.equal(resident.person.memories.length,24);assert.equal(addPersonMemory(resident,{text:""}),false);assert.equal(resident.person.memories[0].text,"Memory 29");});
test("legacy person records are normalized and malformed fields are bounded",()=>{resetState();const entity={id:"legacy-1",personId:"legacy-1"};const person=normalizePersonProfile({id:"spoofed",name:"X".repeat(500),species:"unknown",ageYears:9999,traits:{ambition:900,greed:-5},needs:{food:NaN},memories:Array(100).fill({text:"x"})},entity);assert.equal(person.id,"legacy-1");assert.equal(person.species,"human");assert.equal(person.ageYears,1000);assert.equal(person.traits.ambition,100);assert.equal(person.traits.greed,0);assert.equal(person.memories.length,24);});

test("event participants receive durable memories and directed relationships with the king",()=>{
    resetState();state.worldSeed=771;state.tick=40;initStartingKingdom();
    const resident=state.entities.find(entity=>entity.type===TYPE.VILLAGER&&!entity.dead);
    const king=state.entities.find(entity=>entity.isKing);
    const issue={id:"issue-relationship-1",family:"taxation",title:"A disputed royal levy",participants:[
        {personId:resident.personId,role:"affected"},{personId:king.personId,role:"decision-maker"}
    ]};
    const outcome=recordPersonEventOutcome(issue,{label:"Reduce the levy"},{politics:{commons:4},morale:2},state.tick);
    assert.equal(outcome.memories,2);
    const subjectMemory=resident.person.memories.find(item=>item.id==="event:issue-relationship-1:"+resident.personId);
    const kingMemory=king.person.memories.find(item=>item.id==="event:issue-relationship-1:"+king.personId);
    assert.match(subjectMemory.text,/disputed royal levy/);
    assert.match(kingMemory.text,/Reduce the levy/);
    const towardKing=resident.person.relationships.find(item=>item.targetId===king.personId);
    const towardResident=king.person.relationships.find(item=>item.targetId===resident.personId);
    assert.ok(towardKing.trust>50);
    assert.ok(towardResident);
    const repeat=recordPersonEventOutcome(issue,{label:"Reduce the levy"},{politics:{commons:4},morale:2},state.tick);
    assert.equal(repeat.memories,0);
    assert.equal(resident.person.memories.length,1);
    assert.equal(towardKing.interactions,1);
});
test("event participants are selected from stable person ids and bounded to three actors",()=>{
    resetState();state.worldSeed=881;initStartingKingdom();
    const participants=createEventParticipants("succession");
    assert.ok(participants.length<=3);
    assert.ok(participants.some(item=>item.role==="decision-maker"));
    assert.equal(new Set(participants.map(item=>item.personId)).size,participants.length);
    assert.ok(participants.every(item=>state.entities.some(entity=>entity.personId===item.personId)));
});
