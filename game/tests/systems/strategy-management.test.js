import test from "node:test";
import assert from "node:assert/strict";
import {resetState,state} from "../../js/core/state.js";
import {TYPE} from "../../js/core/types.js";
import {initStartingKingdom,spawnEntity} from "../../js/world/entities.js";
import {ensurePersonProfile} from "../../js/systems/people.js";
import {getFamilySnapshot} from "../../js/systems/families.js";
import {normalizeGovernment,setGovernmentForm,enactPolicy,getPoliticalSnapshot} from "../../js/systems/government.js";
import {getRoyalHouse,appointRoyalConsort,createRoyalChild,designateHeir,updateRoyalSuccession} from "../../js/systems/royal-dynasty.js";
import {summonDragon,updateCreatures,getCreatureSnapshot} from "../../js/systems/creatures.js";

function startRealm(){
 resetState();state.worldSeed=31105;state.year=4;state.resources={wood:180,stone:95,gold:100,food:120};initStartingKingdom();
 const king=state.entities.find(e=>e.isKing);
 const consort=state.entities.find(e=>e.type===TYPE.VILLAGER);
 const person=ensurePersonProfile(consort);person.species="human";person.ageYears=30;person.lifeStage="adult";
 return {king,consort};
}

test("government normalization bounds malformed settings and keeps a supported constitution",()=>{
 resetState();state.government={form:"unknown",taxRate:999,councilSeats:0,history:"bad"};
 const g=normalizeGovernment();
 assert.equal(g.form,"feudal");assert.equal(g.taxRate,35);assert.equal(g.councilSeats,3);assert.deepEqual(g.history,[]);
});

test("changing government costs treasury and changes political support",()=>{
 resetState();state.resources.gold=30;const before=getPoliticalSnapshot();
 const result=setGovernmentForm("council");
 assert.equal(result.ok,true);assert.equal(state.resources.gold,10);assert.equal(state.government.form,"council");
 assert.ok(result.politics.factions.guilds>before.factions.guilds);
 assert.equal(setGovernmentForm("council").reason,"already-in-force");
 assert.equal(setGovernmentForm("elective").reason,"insufficient-gold");
});

test("a royal decree charges its exact costs and only one policy can be enacted per year",()=>{
 resetState();state.resources={wood:30,stone:0,gold:30,food:40};state.year=7;
 const result=enactPolicy("bread");
 assert.equal(result.ok,true);assert.equal(state.resources.gold,18);assert.equal(state.resources.food,22);assert.equal(state.morale,74);
 assert.equal(enactPolicy("charter").reason,"one-decree-per-year");
 state.year++;assert.equal(enactPolicy("charter").ok,true);
});

test("royal marriage creates a real family link and royal child becomes the designated heir",()=>{
 const {king,consort}=startRealm();
 assert.equal(appointRoyalConsort(consort.personId).ok,true);
 const result=createRoyalChild();assert.equal(result.ok,true);
 const child=result.child;
 assert.equal(child.isRoyalFamily,true);assert.equal(child.type,TYPE.KNIGHT);assert.equal(child.person.ageYears,0);
 const family=getFamilySnapshot(king.personId);
 assert.ok(family.children.some(link=>link.personId===child.personId));
 assert.ok(getFamilySnapshot(consort.personId).children.some(link=>link.personId===child.personId));
 assert.equal(getRoyalHouse().heir.personId,child.personId);
 assert.equal(designateHeir("not-a-child").reason,"not-a-living-royal-child");
});

test("succession transfers the crown to the living designated heir after the sovereign dies",()=>{
 const {king,consort}=startRealm();appointRoyalConsort(consort.personId);
 const child=createRoyalChild().child;king.dead=true;
 state.personArchive.push({personId:king.personId,isKing:true,person:JSON.parse(JSON.stringify(king.person))});
 const result=updateRoyalSuccession();
 assert.equal(result.changed,true);assert.equal(result.king,child);assert.equal(child.isKing,true);assert.equal(child.person.role,"king");
 assert.equal(state.entities.filter(e=>e.isKing&&!e.dead).length,1);
});

test("a dragon is a persistent friendly entity with age, hunger, bond and a bounded memorial",()=>{
 const {king}=startRealm();const result=summonDragon();assert.equal(result.ok,true);
 const dragon=result.dragon;assert.equal(dragon.type,TYPE.DRAGON);assert.equal(dragon.isDragon,true);
 assert.equal(state.resources.gold,45);assert.equal(state.resources.food,85);
 state.year++;updateCreatures();
 assert.equal(dragon.creature.ageYears,1);assert.ok(dragon.creature.bond>18);assert.equal(dragon.creature.hunger,0);
 dragon.creature.health=5;dragon.creature.hunger=80;state.resources.food=0;state.year++;updateCreatures();
 assert.equal(dragon.dead,true);assert.equal(getCreatureSnapshot().living.length,0);assert.equal(getCreatureSnapshot().archive.length,1);
 assert.equal(getCreatureSnapshot().archive[0].name,dragon.creature.name);
 assert.ok(king&&!king.dead);
});

test("dragon summoning rejects unaffordable or over-capacity requests without charging resources",()=>{
 const {king}=startRealm();state.resources.gold=0;const before={...state.resources};
 assert.equal(summonDragon().reason,"dragon-cost");assert.deepEqual(state.resources,before);
 state.resources.gold=500;
 for(let i=0;i<3;i++)assert.equal(summonDragon().ok,true);
 const after={...state.resources};assert.equal(summonDragon().reason,"dragon-limit");assert.deepEqual(state.resources,after);
 assert.ok(king);
});
