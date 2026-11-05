import test from "node:test";
import assert from "node:assert/strict";
import {resetState,state} from "../../js/core/state.js";
import {getGovernmentSnapshot,setTaxRate,setGovernmentStructure,enactDecree} from "../../js/systems/government.js";
import {calculateDailyLedger} from "../../js/systems/economy.js";

test("government defaults are normalized and bounded",()=>{
    resetState();
    const government=getGovernmentSnapshot();
    assert.equal(government.taxRate,0.025);
    assert.equal(government.form,"feudal_monarchy");
    assert.equal(government.crownAuthority,55);
    assert.equal(government.councilInfluence,35);
    state.government={taxRate:9,crownAuthority:-20,councilInfluence:100,form:"invalid"};
    const normalized=getGovernmentSnapshot();
    assert.equal(normalized.taxRate,0.05);
    assert.equal(normalized.crownAuthority,20);
    assert.equal(normalized.councilInfluence,80);
    assert.equal(normalized.form,"feudal_monarchy");
});

test("royal tax ordinance changes the actual financial ledger and political support",()=>{
    resetState();
    const before=calculateDailyLedger({population:10,employed:8,buildings:2,foodAvailable:100,goldAvailable:100});
    const result=setTaxRate(0.04);
    const after=calculateDailyLedger({population:10,employed:8,buildings:2,foodAvailable:100,goldAvailable:100,taxRate:getGovernmentSnapshot().taxRate});
    assert.equal(result.ok,true);
    assert.ok(after.taxesCollected>before.taxesCollected);
    assert.equal(getGovernmentSnapshot().taxRate,0.04);
    assert.ok(state.politics.factions.commons<68);
});

test("government charter and decrees have bounded, persistent consequences",()=>{
    resetState();
    const charter=setGovernmentStructure({form:"council_monarchy",crownAuthority:70,councilInfluence:60});
    assert.equal(charter.form,"council_monarchy");
    assert.equal(charter.crownAuthority,70);
    state.resources={gold:30,food:30,wood:30};
    const morale=state.morale;
    const first=enactDecree("royal_feast");
    assert.equal(first.ok,true);
    assert.equal(state.resources.gold,22);
    assert.equal(state.resources.food,18);
    assert.ok(state.morale>morale);
    assert.equal(getGovernmentSnapshot().decrees.length,1);
    assert.equal(enactDecree("public_works").reason,"council-cooldown");
});

test("decrees cannot spend resources that the realm does not possess",()=>{
    resetState();
    state.resources={gold:1,food:0,wood:0};
    const result=enactDecree("public_works");
    assert.equal(result.ok,false);
    assert.equal(result.reason,"insufficient-gold");
    assert.equal(state.resources.gold,1);
});


test("constitutional form and council influence continuously shape estate support",()=>{
    resetState();
    state.government={...state.government,form:"feudal_monarchy",councilInfluence:35,crownAuthority:55};
    const feudal=(await import("../../js/systems/politics.js")).updatePolitics(
        {foodShortage:0,unpaidWages:0,unpaidUpkeep:0},{population:10,unemployed:0}
    );
    resetState();
    state.government={...state.government,form:"council_monarchy",councilInfluence:70,crownAuthority:55};
    const council=(await import("../../js/systems/politics.js")).updatePolitics(
        {foodShortage:0,unpaidWages:0,unpaidUpkeep:0},{population:10,unemployed:0}
    );
    assert.ok(council.factions.commons>feudal.factions.commons);
    assert.ok(council.factions.guilds>feudal.factions.guilds);
    assert.ok(council.factions.nobility<feudal.factions.nobility);
});
