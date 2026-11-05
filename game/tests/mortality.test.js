import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../js/core/state.js";
import { TYPE } from "../js/core/types.js";
import { spawnEntity } from "../js/world/entities.js";
import { ensurePersonProfile, normalizePersonMemorial } from "../js/systems/people.js";
import { linkParentChild, getFamilySnapshot } from "../js/systems/families.js";
import { recordNaturalDeath, updateMortality, MAX_NATURAL_DEATHS_PER_YEAR } from "../js/systems/mortality.js";

beforeEach(()=>{
    resetState(); state.worldSeed=8282; state.year=30; state.tick=12000;
    state.morale=70; state.resources.food=500;
});

function createPerson(x,age=30,species="human"){
    const entity=spawnEntity(x,40,TYPE.VILLAGER);
    const person=ensurePersonProfile(entity);
    Object.assign(person,{species,ageYears:age,lifeStage:age>=speciesLife(species)*0.72?"elder":"adult",bornAtYear:Math.max(1,state.year-age)});
    entity.hp=entity.maxHp||100;
    return entity;
}
function speciesLife(species){return ({human:82,elf:420,dwarf:260,orc:95,goblin:65,halfling:110,gnome:180,dragonkin:150,fae:300,revenant:999})[species]||82;}

test("a death creates a persistent memorial and notifies surviving family",()=>{
    const parent=createPerson(40,82);
    const child=createPerson(41,25);
    assert.equal(linkParentChild(parent.personId,child.personId).ok,true);
    const death=recordNaturalDeath(parent,"old age");
    assert.ok(death);
    assert.equal(parent.dead,true);
    assert.equal(state.personArchive.length,1);
    assert.equal(state.personArchive[0].personId,parent.personId);
    assert.ok(state.personArchive[0].person.memories.some(memory=>memory.type==="death"));
    assert.ok(child.person.memories.some(memory=>memory.type==="loss"&&memory.text.includes(parent.person.name)));
    state.entities=state.entities.filter(entity=>entity!==parent);
    assert.equal(getFamilySnapshot(parent.personId).children[0].personId,child.personId);
    assert.equal(getFamilySnapshot(child.personId).parents[0].personId,parent.personId);
    assert.equal(recordNaturalDeath(parent,"old age"),null);
});

test("mortality is species-aware, excludes the king and caps annual deaths",()=>{
    const old=[];
    for(let index=0;index<20;index++)old.push(createPerson(10+index,110,"human"));
    const king=spawnEntity(50,40,TYPE.KNIGHT);
    king.isKing=true;
    const kingPerson=ensurePersonProfile(king);
    Object.assign(kingPerson,{species:"human",ageYears:110,lifeStage:"elder"});
    const deaths=updateMortality();
    assert.ok(deaths.length>0);
    assert.ok(deaths.length<=MAX_NATURAL_DEATHS_PER_YEAR);
    assert.equal(king.dead,false);
    assert.equal(state.personArchive.length,deaths.length);
    assert.equal(state.economy.deaths,deaths.length);
    assert.deepEqual(updateMortality(),[]);
});

test("young adults do not die from old-age mortality",()=>{
    const young=createPerson(40,24,"human");
    assert.deepEqual(updateMortality(),[]);
    assert.equal(young.dead,false);
    assert.equal(state.personArchive.length,0);
});

test("natural mortality replays deterministically from the same world seed",()=>{
    function run(){
        resetState(); state.worldSeed=9191; state.year=40; state.tick=16000;
        for(let index=0;index<20;index++)createPerson(10+index,115,"human");
        return updateMortality().map(entry=>({id:entry.personId,name:entry.name,cause:entry.cause}));
    }
    assert.deepEqual(run(),run());
});

test("legacy memorial records are normalized and retain stable identities",()=>{
    resetState(); state.year=50;
    const memorial=normalizePersonMemorial({
        personId:"old-person-1",
        person:{id:"old-person-1",name:"Elder Oak",species:"human",ageYears:90,memories:[],relationships:[],kinship:{parents:[],children:[],partners:[]}},
        deathYear:48,deathTick:19000,cause:"old age"
    });
    assert.equal(memorial.personId,"old-person-1");
    assert.equal(memorial.person.name,"Elder Oak");
    assert.equal(memorial.deathYear,48);
    assert.ok(["female","male"].includes(memorial.person.sex));
});
