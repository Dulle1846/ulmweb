import test from "node:test";
import assert from "node:assert/strict";
import {
    queuePresentationEffect,
    queueFloater,
    drainPresentationEffects
} from "../../js/core/presentation-effects.js";

test("presentation requests are stored as plain data", () => {
    drainPresentationEffects();
    queueFloater(12, 24, "BUILT!", "#a3e635");
    assert.deepEqual(drainPresentationEffects(), [{
        type: "floater",
        x: 12,
        y: 24,
        text: "BUILT!",
        color: "#a3e635"
    }]);
});

test("draining presentation requests empties the queue", () => {
    drainPresentationEffects();
    queuePresentationEffect({ type: "custom-test", value: 1 });
    assert.equal(drainPresentationEffects().length, 1);
    assert.deepEqual(drainPresentationEffects(), []);
});

test("invalid presentation requests are rejected", () => {
    assert.throws(() => queuePresentationEffect(null), TypeError);
    assert.throws(() => queuePresentationEffect({}), TypeError);
});
