import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../js/core/state.js";
import { TYPE } from "../js/core/types.js";
import { spawnEntity } from "../js/world/entities.js";
import { ensurePersonProfile } from "../js/systems/people.js";
import { setPartnership, endPartnership } from "../js/systems/families.js";
import { createChildFromParents, updateBirths } from "../js/systems/births.js";
import { getHousingSnapshot } from "../js/systems/population.js";

let parents, house;
beforeEach(() => {
    resetState(); state.worldSeed=7272; state.year=12; state.tick=4400;
    state.morale=80; state.resources.food=300;
    house=spawnEntity(40,40,TYPE.HOUSE);
    parents=[spawnEntity(39,40,TYPE.VILLAGER),spawnEntity(41,40,TYPE.VILLAGER)];
    for(const parent of parents){
        parent.home={x:house.x,y:house.y}; parent.anchor={x:house.x,y:house.y};
        parent.householdId="house:"+house.x+":"+house.y;
        const person=ensurePersonProfile(parent);
        Object.assign(person,{species:"human",ageYears:28,lifeStage:"adult",familyName:"Oakenshield",name:person.firstName+" Oakenshield"});
    }
    ensurePersonProfile(parents[0]).sex="female";
    ensurePersonProfile(parents[1]).sex="male";
    for(const parent of parents){
        const person=ensurePersonProfile(parent);
        person.familyName="Oakenshield";
        person.name=person.firstName+" Oakenshield";
    }
    assert.equal(setPartnership(parents[0].personId,parents[1].personId,{status:"married",sinceYear:8}).ok,true);
});

test("a child is a real resident with two explicit biological parents and inherited family name",()=>{
    const result=createChildFromParents(parents[0].personId,parents[1].personId);
    assert.equal(result.ok,true);
    const child=result.child;
    assert.equal(child.type,TYPE.VILLAGER); assert.equal(child.person.ageYears,0);
    assert.equal(child.person.lifeStage,"young"); assert.equal(child.person.species,"human");
    assert.equal(child.person.familyName,"Oakenshield"); assert.equal(child.person.bornAtYear,12);
    assert.deepEqual(child.person.kinship.parents.map(link=>link.personId).sort(),parents.map(parent=>parent.personId).sort());
    for(const parent of parents){
        assert.ok(parent.person.kinship.children.some(link=>link.personId===child.personId));
        assert.ok(parent.person.memories.some(memory=>memory.type==="family"&&memory.text.includes(child.person.name)));
    }
    assert.equal(child.person.memories[0].type,"birth");
    assert.equal(getHousingSnapshot().population,3); assert.equal(state.economy.births,1);
});

test("birth is rejected for separated partners and never inferred from co-residence",()=>{
    endPartnership(parents[0].personId,parents[1].personId,{status:"separated"});
    const result=createChildFromParents(parents[0].personId,parents[1].personId);
    assert.equal(result.ok,false); assert.equal(result.reason,"parents-not-eligible");
});

test("birth requires matching species, compatible sex and adult life stages",()=>{
    const second=ensurePersonProfile(parents[1]);
    second.sex="female";
    assert.equal(createChildFromParents(parents[0].personId,parents[1].personId).reason,"parents-not-eligible");
    second.sex="male"; second.species="elf";
    assert.equal(createChildFromParents(parents[0].personId,parents[1].personId).reason,"parents-not-eligible");
    second.species="human"; second.ageYears=15; second.lifeStage="young";
    assert.equal(createChildFromParents(parents[0].personId,parents[1].personId).reason,"parents-not-eligible");
});

test("birth respects household capacity, food reserve and morale",()=>{
    for(let index=0;index<2;index++){
        const extra=spawnEntity(42+index,40,TYPE.VILLAGER);
        extra.home={x:house.x,y:house.y};
    }
    assert.equal(createChildFromParents(parents[0].personId,parents[1].personId).reason,"no-household-capacity");
    state.resources.food=0;
    assert.equal(createChildFromParents(parents[0].personId,parents[1].personId).reason,"settlement-conditions");
    state.resources.food=300; state.morale=20;
    assert.equal(createChildFromParents(parents[0].personId,parents[1].personId).reason,"settlement-conditions");
});

test("birth cooldown prevents repeated children in consecutive years",()=>{
    assert.equal(createChildFromParents(parents[0].personId,parents[1].personId).ok,true);
    state.year=13;
    assert.equal(createChildFromParents(parents[0].personId,parents[1].personId).reason,"birth-cooldown");
    state.year=15;
    assert.equal(createChildFromParents(parents[0].personId,parents[1].personId).ok,true);
});

test("autonomous birth checks run at most once per realm year",()=>{
    const a=ensurePersonProfile(parents[0]),b=ensurePersonProfile(parents[1]);
    a.kinship.partners[0].status="separated"; b.kinship.partners[0].status="separated";
    assert.equal(updateBirths(),null); assert.equal(state.economy.lastBirthCheckYear,12);
    a.kinship.partners[0].status="married"; b.kinship.partners[0].status="married";
    assert.equal(updateBirths(),null); assert.equal(state.economy.lastBirthCheckYear,12);
    state.year=13; assert.equal(updateBirths(),null); assert.equal(state.economy.lastBirthCheckYear,13);
});


test("autonomous scheduler eventually creates a deterministic birth for an eligible partnership",()=>{
    let child=null;
    for(let seed=1;seed<=500&&!child;seed++){
        state.worldSeed=seed;
        state.randomStreams={};
        state.economy.lastBirthCheckYear=1;
        child=updateBirths();
    }
    assert.ok(child);
    assert.equal(child.person.ageYears,0);
    assert.equal(child.person.kinship.parents.length,2);
    assert.equal(state.economy.births,1);
    assert.equal(state.economy.lastGrowthYear,12);
});

test("birth refuses to exceed the global entity cap",()=>{
    for(let index=0;index<897;index++)spawnEntity(100+index,100,TYPE.HOUSE);
    assert.equal(state.entities.length,900);
    const result=createChildFromParents(parents[0].personId,parents[1].personId);
    assert.equal(result.ok,false);
    assert.equal(result.reason,"entity-capacity");
    assert.equal(state.entities.length,900);
});
