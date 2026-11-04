import test from "node:test";
import assert from "node:assert/strict";
import { EVENT_CHAINS } from "../js/systems/event-chains.js";

test("authored story arcs have multiple stages and meaningful choices", () => {
    assert.ok(Object.keys(EVENT_CHAINS).length >= 8);
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
    for(const id of ["migration","crime","ruins","diplomacy","plague","rebellion","guild","succession"]){
        assert.equal(EVENT_CHAINS[id].length,3,id+" should have three stages");
    }
});
