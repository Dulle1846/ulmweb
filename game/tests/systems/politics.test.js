import test from "node:test";
import assert from "node:assert/strict";
import {resetState,state} from "../../js/core/state.js";
import {applyPoliticalEffects,updatePolitics,getPoliticalSnapshot,normalizePoliticalState} from "../../js/systems/politics.js";

test("political state starts with distinct support among four social factions",()=>{
    resetState();
    const politics=getPoliticalSnapshot();
    assert.equal(politics.legitimacy,65);
    assert.equal(politics.factions.commons,68);
    assert.equal(politics.factions.nobility,58);
    assert.equal(politics.factions.guilds,55);
    assert.equal(politics.factions.clergy,62);
    assert.equal(politics.settlements,0);
});

test("royal decisions change legitimacy and individual faction support within safe bounds",()=>{
    resetState();
    applyPoliticalEffects({legitimacy:50,commons:-100,nobility:12,guilds:-4,clergy:3});
    const politics=getPoliticalSnapshot();
    assert.equal(politics.legitimacy,100);
    assert.equal(politics.factions.commons,0);
    assert.equal(politics.factions.nobility,70);
    assert.equal(politics.factions.guilds,51);
    assert.equal(politics.factions.clergy,65);
    assert.equal(politics.settlements,1);
});

test("food shortages, unpaid obligations and unemployment undermine legitimacy",()=>{
    resetState();
    const before=getPoliticalSnapshot();
    const after=updatePolitics(
        {foodShortage:10,unpaidWages:5,unpaidUpkeep:2},
        {population:10,unemployed:8}
    );
    assert.ok(after.legitimacy<before.legitimacy);
    assert.ok(after.factions.commons<before.factions.commons);
    assert.ok(after.factions.guilds<before.factions.guilds);
    assert.ok(after.factions.nobility<before.factions.nobility);
});

test("well-provisioned full employment gradually strengthens the realm",()=>{
    resetState();
    const before=getPoliticalSnapshot();
    const after=updatePolitics(
        {foodShortage:0,unpaidWages:0,unpaidUpkeep:0},
        {population:10,unemployed:0}
    );
    assert.ok(after.legitimacy>before.legitimacy);
    assert.ok(after.factions.commons>before.factions.commons);
    assert.ok(after.factions.nobility>before.factions.nobility);
    assert.ok(after.factions.guilds>before.factions.guilds);
    assert.ok(after.factions.clergy>before.factions.clergy);
});

test("a long healthy peace restores every faction instead of two one-way ratchets",()=>{
    resetState();
    state.politics={legitimacy:100,factions:{commons:0,nobility:0,guilds:0,clergy:0},settlements:0};
    for(let index=0;index<400;index++){
        updatePolitics(
            {foodShortage:0,unpaidWages:0,unpaidUpkeep:0,debt:0},
            {population:74,unemployed:0}
        );
    }
    const politics=getPoliticalSnapshot();
    assert.ok(politics.factions.commons>10);
    assert.ok(politics.factions.nobility>10);
    assert.ok(politics.factions.guilds>10);
    assert.ok(politics.factions.clergy>10);
});

test("legacy and malformed faction data is normalized without losing settlement history",()=>{
    resetState();
    state.politics={legitimacy:"invalid",factions:{commons:150,nobility:undefined,guilds:-20},settlements:250};
    const politics=normalizePoliticalState();
    assert.equal(politics.legitimacy,0);
    assert.equal(politics.factions.commons,100);
    assert.equal(politics.factions.nobility,58);
    assert.equal(politics.factions.guilds,0);
    assert.equal(politics.factions.clergy,62);
    assert.equal(politics.settlements,250);
});
