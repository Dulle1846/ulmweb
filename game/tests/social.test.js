import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../js/core/state.js";
import { TYPE } from "../js/core/types.js";
import { spawnEntity } from "../js/world/entities.js";
import { ensurePersonProfile } from "../js/systems/people.js";
import { linkParentChild } from "../js/systems/families.js";
import { updateSocialLife, MAX_SOCIAL_PAIRS_PER_YEAR } from "../js/systems/social.js";

let first, second, house;
function preparePair() {
    resetState(); state.worldSeed=991; state.year=2; state.tick=400;
    house=spawnEntity(40,40,TYPE.HOUSE);
    first=spawnEntity(39,40,TYPE.VILLAGER);
    second=spawnEntity(41,40,TYPE.VILLAGER);
    for(const [entity,sex] of [[first,"female"],[second,"male"]]){
        entity.householdId="house:40:40";
        entity.home={x:house.x,y:house.y};
        const person=ensurePersonProfile(entity);
        Object.assign(person,{species:"human",sex,ageYears:28,lifeStage:"adult"});
        Object.assign(person.traits,{sociability:100,compassion:100,patience:100,distrust:0});
    }
}
beforeEach(preparePair);

test("shared household creates a social encounter, never an automatic family link",()=>{
    const result=updateSocialLife();
    assert.equal(result.interactions,1);
    assert.equal(result.partnerships.length,0);
    assert.equal(first.person.relationships[0].targetId,second.personId);
    assert.equal(second.person.relationships[0].targetId,first.personId);
    assert.deepEqual(first.person.kinship.parents,[]);
    assert.deepEqual(first.person.kinship.partners,[]);
});

test("social scheduler is idempotent within a realm year",()=>{
    assert.equal(updateSocialLife().interactions,1);
    const interactions=first.person.relationships[0].interactions;
    assert.deepEqual(updateSocialLife(),{interactions:0,partnerships:[]});
    assert.equal(first.person.relationships[0].interactions,interactions);
});

test("repeated compatible encounters can autonomously form a persistent partnership",()=>{
    let formed=false;
    for(let year=2;year<500&&!formed;year++){
        state.year=year;
        state.tick=year*400;
        state.economy.lastSocialYear=year-1;
        const result=updateSocialLife();
        formed=result.partnerships.length>0;
    }
    assert.equal(formed,true);
    assert.ok(first.person.kinship.partners.some(link=>link.personId===second.personId&&link.status==="partner"));
    assert.ok(second.person.kinship.partners.some(link=>link.personId===first.personId&&link.status==="partner"));
    assert.ok(first.person.memories.some(memory=>memory.text.includes(second.person.name)));
    assert.ok(second.person.memories.some(memory=>memory.text.includes(first.person.name)));
});

test("close family members can develop social ties but never an autonomous partnership",()=>{
    assert.equal(linkParentChild(first.personId,second.personId).ok,true);
    let formed=false;
    for(let year=2;year<500&&!formed;year++){
        state.year=year; state.tick=year*400; state.economy.lastSocialYear=year-1;
        formed=updateSocialLife().partnerships.length>0;
    }
    assert.equal(formed,false);
    assert.equal(first.person.kinship.partners.length,0);
    assert.equal(second.person.kinship.partners.length,0);
});

test("social work is capped even when one workplace contains many residents",()=>{
    resetState(); state.worldSeed=992; state.year=2;
    const workplace={id:"workshop-1",dead:false};
    for(let index=0;index<20;index++){
        const resident=spawnEntity(30+index,40,TYPE.VILLAGER);
        resident.workplace=workplace;
    }
    const result=updateSocialLife();
    assert.equal(result.interactions,MAX_SOCIAL_PAIRS_PER_YEAR);
    assert.ok(result.interactions<=120);
});


test("the yearly interaction cap prioritizes residents with the lowest belonging satisfaction",()=>{
    resetState(); state.worldSeed=993; state.year=2;
    const workplace={id:"priority-workshop",dead:false};
    const residents=[];
    for(let index=0;index<20;index++){
        const resident=spawnEntity(60+index,60,TYPE.VILLAGER);
        resident.workplace=workplace;
        ensurePersonProfile(resident).needs.belonging=index===0?0:100;
        residents.push(resident);
    }
    updateSocialLife();
    assert.ok(residents[0].person.relationships.length>0);
});
