import test from "node:test";
import assert from "node:assert/strict";
import {resetState,state} from "../../js/core/state.js";
import {TYPE} from "../../js/core/types.js";
import {initStartingKingdom} from "../../js/world/entities.js";
import {ensurePersonProfile} from "../../js/systems/people.js";
import {getFamilySnapshot} from "../../js/systems/families.js";
import {normalizeRoyalState,getRoyalHouse,appointRoyalConsort} from "../../js/systems/royal-dynasty.js";
import {createDiplomacyState,updateDiplomacy,declareWar} from "../../js/systems/diplomacy.js";
import {getForeignMarriageSnapshot,marryForeignRealm} from "../../js/systems/royal-marriage.js";

function startRealm(){
 resetState();state.worldSeed=31105;state.year=7;state.resources={wood:180,stone:95,gold:100,food:120};
 initStartingKingdom();
 state.diplomacy=createDiplomacyState();
 const king=state.entities.find(entity=>!entity.dead&&entity.isKing);
 const resident=state.entities.find(entity=>!entity.dead&&entity.type===TYPE.VILLAGER&&!entity.isKing);
 const person=ensurePersonProfile(resident);person.species="human";person.ageYears=30;person.lifeStage="adult";
 return {king,resident};
}

test("the four neighbouring courts expose authored royal matches with dowries and thresholds",()=>{
 const {king}=startRealm();
 const snapshot=getForeignMarriageSnapshot();
 assert.ok(king);
 assert.equal(snapshot.candidates.length,4);
 assert.equal(snapshot.available,4);
 const northmere=snapshot.candidates.find(candidate=>candidate.realmId==="northmere");
 assert.equal(northmere.name,"Lady Elowen Vane");
 assert.equal(northmere.house,"House Vane");
 assert.equal(northmere.species,"human");
 assert.deepEqual(northmere.dowry,{gold:35,wood:30});
 assert.equal(northmere.available,true);
});

test("a foreign marriage creates a real consort, pays the dowry and strengthens the court",()=>{
 const {king}=startRealm();
 const gold=state.resources.gold,wood=state.resources.wood;
 const result=marryForeignRealm("northmere");
 assert.equal(result.ok,true);
 assert.equal(state.royal.foreignMarriage.realmId,"northmere");
 assert.equal(state.royal.consortId,result.spouse.personId);
 assert.equal(result.spouse.isRoyalFamily,true);
 assert.equal(result.spouse.person.name,"Lady Elowen Vane");
 assert.equal(result.spouse.person.familyName,"Vane");
 assert.equal(result.spouse.person.role,"royal-consort");
 assert.equal(result.spouse.person.ageYears,27);
 assert.equal(state.resources.gold,gold+35);
 assert.equal(state.resources.wood,wood+30);
 const realm=state.diplomacy.realms.find(item=>item.id==="northmere");
 assert.equal(realm.relation,66);
 assert.equal(realm.trust,64);
 assert.ok(getFamilySnapshot(king.personId).partners.some(link=>link.personId===result.spouse.personId));
 assert.equal(getRoyalHouse().consort.personId,result.spouse.personId);
 assert.equal(marryForeignRealm("goldcoast").reason,"royal-marriage-already-sealed");
});

test("the marriage bond blocks war with its court and adds annual relation and trust",()=>{
 const {king}=startRealm();
 assert.equal(marryForeignRealm("northmere").ok,true);
 assert.equal(declareWar("northmere").reason,"royal-marriage-binds-the-crown");
 assert.equal(declareWar("ironvale").ok,true);
 const realm=state.diplomacy.realms.find(item=>item.id==="northmere");
 const relation=realm.relation,trust=realm.trust;
 state.year=8;
 updateDiplomacy();
 assert.ok(realm.relation>relation);
 assert.ok(realm.trust>trust);
 assert.ok(king);
});

test("a dead foreign consort ends the war block but leaves the historical record",()=>{
 const {king}=startRealm();
 const result=marryForeignRealm("northmere");
 result.spouse.dead=true;
 assert.equal(declareWar("northmere").ok,true);
 assert.ok(state.royal.foreignMarriage);
 assert.ok(king);
});

test("a later local marriage clears a stale foreign bond",()=>{
 const {king,resident}=startRealm();
 const result=marryForeignRealm("northmere");
 result.spouse.dead=true;
 const local=appointRoyalConsort(resident.personId);
 assert.equal(local.ok,true);
 assert.equal(state.royal.foreignMarriage,null);
 assert.ok(king);
});

test("foreign marriage normalization rejects unknown realms and bounds saved dowries",()=>{
 resetState();
 state.royal.foreignMarriage={realmId:"unknown",name:"Impostor"};
 normalizeRoyalState();
 assert.equal(state.royal.foreignMarriage,null);
 state.royal.foreignMarriage={
  realmId:"northmere",candidateId:"forged",name:"A Very Long Name",house:"House Test",
  species:"elf",sex:"male",sinceYear:9,dowry:{gold:12,food:-1,stone:99999}
 };
 normalizeRoyalState();
 assert.equal(state.royal.foreignMarriage.realmId,"northmere");
 assert.equal(state.royal.foreignMarriage.species,"human");
 assert.equal(state.royal.foreignMarriage.sex,"male");
 assert.equal(state.royal.foreignMarriage.sinceYear,9);
 assert.deepEqual(state.royal.foreignMarriage.dowry,{gold:12,stone:1000});
});
