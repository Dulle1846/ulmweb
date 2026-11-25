import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EVENT_CHAINS } from "../js/systems/event-chains.js";

test("authored story arcs have multiple stages and meaningful choices", () => {
    assert.ok(Object.keys(EVENT_CHAINS).length >= 13);
    for (const [id, stages] of Object.entries(EVENT_CHAINS)) {
        assert.ok(id.length > 0);
        assert.ok(stages.length >= 3);
        for (const stage of stages) {
            assert.ok(stage.title.length > 0);
            assert.ok(stage.description.length > 20);
            assert.ok(stage.choices.length >= 2);
            for (const choice of stage.choices) {
                assert.ok(choice.label.length > 0);
                assert.ok(choice.description.length > 10);
                for (const amount of Object.values(choice.effects.resources || {})) {
                    assert.ok(Number.isFinite(amount));
                }
            }
        }
    }
});

test("the long-form chronicle library covers civic, health and succession crises",()=>{
    for(const id of ["migration","crime","ruins","diplomacy","plague","rebellion","guild","succession","shortage","flood","fire","wildlife","fishing"]){
        assert.equal(EVENT_CHAINS[id].length,3,id+" should have three stages");
    }
});

test("plague chronicle decisions affect health and political factions at every stage",()=>{
    assert.equal(EVENT_CHAINS.plague[0].choices[0].effects.cardReward,"infirmaries");
    assert.equal(EVENT_CHAINS.plague[2].choices[0].effects.cardReward,"infirmaries");
    for(const stage of EVENT_CHAINS.plague){
        for(const choice of stage.choices){
            assert.ok(choice.effects.health&&typeof choice.effects.health==="object");
            assert.ok(choice.effects.politics&&typeof choice.effects.politics==="object");
            for(const value of Object.values(choice.effects.politics))assert.ok(Number.isFinite(value));
        }
    }
});

test("new shortage, flood and fire arcs link their decisions to cards and systemic consequences",()=>{
    assert.equal(EVENT_CHAINS.shortage.length,3);
    assert.equal(EVENT_CHAINS.shortage[0].choices[0].effects.cardReward,"warehouses");
    assert.ok(EVENT_CHAINS.flood[1].choices.every(choice=>choice.effects.health));
    assert.equal(EVENT_CHAINS.flood[2].choices[0].effects.cardReward,undefined);
    assert.equal(EVENT_CHAINS.fire[0].choices[0].effects.cardReward,undefined);
    assert.equal(EVENT_CHAINS.fire[2].choices[0].effects.cardReward,"watchtowers");
    for(const id of ["shortage","flood","fire"]){
        for(const stage of EVENT_CHAINS[id]){
            for(const choice of stage.choices){
                for(const value of Object.values(choice.effects.politics||{}))assert.ok(Number.isFinite(value));
            }
        }
    }
});

test("wildlife and fishing chronicles connect choices to resources, politics and cards",()=>{
    for(const id of ["wildlife","fishing"]){
        assert.equal(EVENT_CHAINS[id].length,3,id+" should have three stages");
        for(const stage of EVENT_CHAINS[id]){
            assert.ok(stage.choices.every(choice=>choice.effects.resources&&choice.effects.politics));
        }
    }
    assert.equal(EVENT_CHAINS.wildlife[0].choices[0].effects.cardReward,"deer");
    assert.equal(EVENT_CHAINS.wildlife[2].choices[0].effects.cardReward,"deer");
    assert.equal(EVENT_CHAINS.fishing[0].choices[0].effects.cardReward,"river-weirs");
    assert.equal(EVENT_CHAINS.fishing[2].choices[0].effects.cardReward,"river-weirs");
});

test("the harvest, discovery, storm and frontier chronicles have three stages and real consequences",()=>{
    const ids=["harvest","discovery","storm","taxation","border","faith","invention","monster"];
    for(const id of ids){
        assert.equal(EVENT_CHAINS[id].length,3,id+" should have three stages");
        for(const stage of EVENT_CHAINS[id]){
            assert.ok(stage.description.length>20);
            assert.equal(stage.choices.length,2,id+" stage should offer two real decisions");
            for(const choice of stage.choices){
                assert.ok(choice.description.length>10);
                assert.ok(choice.effects.politics&&Object.keys(choice.effects.politics).length>0);
                for(const value of Object.values(choice.effects.politics))assert.ok(Number.isFinite(value));
                for(const key of ["tension","prosperity","mystery"]){
                    assert.ok(Number.isFinite(choice.effects.hidden?.[key]||0),id+" must record hidden consequences");
                }
            }
        }
    }
    const rewards={harvest:"warehouses",discovery:"gold-mines",storm:"blacksmiths",taxation:"warehouses",border:"border-rangers",faith:"reliquaries",invention:"clockmakers",monster:"griffins"};
    for(const [id,card] of Object.entries(rewards)){
        assert.equal(EVENT_CHAINS[id][2].choices[0].effects.cardReward,card,id+" should end with a real card reward");
        assert.equal(EVENT_CHAINS[id][2].choices[1].effects.cardReward,undefined,id+" alternate ending must stay distinct");
    }
});

test("every new chronicle is anchored to an event family that can actually generate it",()=>{
    const source=readFileSync(new URL("../js/systems/events.js",import.meta.url),"utf8");
    for(const id of ["harvest","discovery","storm","taxation","border","faith","invention","monster"]){
        assert.match(source,new RegExp('^\\s*\\["'+id+'",',"m"),id+" must be a live event family");
        assert.ok(EVENT_CHAINS[id],id+" must have an authored chain");
    }
});
