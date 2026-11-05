import test from "node:test";
import assert from "node:assert/strict";
import {resetState,state} from "../../js/core/state.js";
import {Entity,TYPE} from "../../js/core/types.js";
import {ensurePersonProfile} from "../../js/systems/people.js";
import {arrangeRoyalMarriage,createRoyalHeir,getRoyalHouseholdSnapshot,updateRoyalSuccession} from "../../js/systems/royal-household.js";
import {recordNaturalDeath} from "../../js/systems/mortality.js";

function setupRoyalHouse(){
    resetState();
    state.worldSeed=123;
    state.resources.food=100;
    const house=new Entity(10,10,TYPE.HOUSE);house.id="royal-house";state.entities.push(house);
    const king=new Entity(10,10,TYPE.KNIGHT);king.id="king-1";king.personId=king.id;king.isKing=true;
    ensurePersonProfile(king,{role:"king"});king.person.species="human";king.person.sex="female";king.person.ageYears=30;king.person.lifeStage="adult";king.person.familyName="Crown";king.person.name="Queen Aster";state.entities.push(king);
    const consort=new Entity(10,10,TYPE.VILLAGER);consort.id="consort-1";consort.personId=consort.id;consort.home={x:10,y:10};consort.householdId="house:10:10";
    ensurePersonProfile(consort);consort.person.species="human";consort.person.sex="male";consort.person.ageYears=32;consort.person.lifeStage="adult";consort.person.familyName="Vale";consort.person.name="Lord Rowan";state.entities.push(consort);
    return {king,consort,house};
}

test("royal marriage is explicit, reciprocal and rejects an ineligible candidate",()=>{
    const {king,consort}=setupRoyalHouse();
    const result=arrangeRoyalMarriage(consort.personId);
    assert.equal(result.ok,true);
    assert.equal(king.person.kinship.partners[0].personId,consort.personId);
    assert.equal(consort.person.kinship.partners[0].personId,king.personId);
    assert.equal(consort.person.kinship.partners[0].status,"married");
});

test("royal heir creation links both parents and enforces the birth cooldown",()=>{
    const {king,consort}=setupRoyalHouse();
    assert.equal(arrangeRoyalMarriage(consort.personId).ok,true);
    const result=createRoyalHeir(consort.personId);
    assert.equal(result.ok,true);
    assert.equal(result.person.role,"royal-heir");
    assert.deepEqual(result.child.person.kinship.parents.map(item=>item.personId).sort(),[king.personId,consort.personId].sort());
    assert.equal(createRoyalHeir(consort.personId).reason,"royal-birth-cooldown");
    const snapshot=getRoyalHouseholdSnapshot();
    assert.equal(snapshot.children.length,1);
    assert.equal(snapshot.succession.status,"minor-heir");
});

test("a deceased monarch is succeeded by the royal consort as regent until the heir matures",()=>{
    const {king,consort}=setupRoyalHouse();
    arrangeRoyalMarriage(consort.personId);
    const birth=createRoyalHeir(consort.personId);
    assert.equal(birth.ok,true);
    const heir=birth.child;
    recordNaturalDeath(king,"old age");
    assert.equal(consort.isKing,true);
    assert.equal(state.royalDynasty.regency.heirId,heir.personId);
    heir.person.ageYears=20;heir.person.lifeStage="adult";
    const succession=updateRoyalSuccession();
    assert.equal(succession.type,"majority");
    assert.equal(heir.isKing,true);
    assert.equal(consort.isKing,false);
    assert.equal(state.royalDynasty.regency,null);
});
