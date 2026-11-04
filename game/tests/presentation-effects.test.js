import test from "node:test";
import assert from "node:assert/strict";
import {resetState,state} from "../js/core/state.js";
import {
    MAX_PENDING_PRESENTATION_EFFECTS,
    queueParticle,
    queueMessage,
    drainPresentationEffects
} from "../js/core/presentation-effects.js";
import {createParticle,createFloater} from "../js/presentation/rendering/particles.js";

test("transient presentation requests remain bounded and preserve important messages",()=>{
    resetState();
    for(let index=0;index<MAX_PENDING_PRESENTATION_EFFECTS;index++){
        queueParticle(index,0,"#ffffff",20);
    }
    queueMessage("THE CROWN SPEAKS","A royal decree has arrived",0);
    assert.equal(state.pendingPresentationEffects.length,MAX_PENDING_PRESENTATION_EFFECTS);
    assert.equal(state.pendingPresentationEffects.filter(effect=>effect.type==="particle").length,MAX_PENDING_PRESENTATION_EFFECTS-1);
    assert.ok(state.pendingPresentationEffects.some(effect=>effect.type==="message"&&effect.title==="THE CROWN SPEAKS"));
    queueParticle(0,0,"#ffffff",20);
    assert.equal(state.pendingPresentationEffects.length,MAX_PENDING_PRESENTATION_EFFECTS);
    assert.ok(state.pendingPresentationEffects.some(effect=>effect.type==="message"&&effect.title==="THE CROWN SPEAKS"));
});

test("draining presentation requests empties the transient queue",()=>{
    resetState();
    queueParticle(1,2,"#fff",10);
    queueMessage("A MESSAGE","A subtitle",100);
    const drained=drainPresentationEffects();
    assert.equal(drained.length,2);
    assert.equal(state.pendingPresentationEffects.length,0);
});

test("particle and floater collections have hard upper bounds",()=>{
    resetState();
    for(let index=0;index<500;index++)createParticle(index,0,"#fff",50);
    for(let index=0;index<150;index++)createFloater(index,0,"+1");
    assert.equal(state.particles.length,350);
    assert.equal(state.floaters.length,100);
});
