import test from "node:test";
import assert from "node:assert/strict";
import { consumeSimulationTime } from "../../js/core/simulation-clock.js";

test("1x processes one logical tick after one tick interval", () => {
    const result = consumeSimulationTime(0, 333, 1, 333);
    assert.equal(result.steps, 1);
    assert.equal(result.remainderMs, 0);
});

test("2x processes one logical tick in half the wall-clock time", () => {
    const result = consumeSimulationTime(0, 166.5, 2, 333);
    assert.equal(result.steps, 1);
    assert.equal(result.remainderMs, 0);
});

test("4x processes one logical tick in one quarter of the wall-clock time", () => {
    const result = consumeSimulationTime(0, 83.25, 4, 333);
    assert.equal(result.steps, 1);
    assert.equal(result.remainderMs, 0);
});

test("fractional progress is retained for the next frame", () => {
    const result = consumeSimulationTime(120, 100, 2, 333);
    assert.equal(result.steps, 0);
    assert.equal(result.remainderMs, 320);
});

test("large frame delays are capped to prevent unbounded catch-up", () => {
    const result = consumeSimulationTime(0, 1000, 4, 333);
    assert.equal(result.acceptedFrameMs, 100);
    assert.equal(result.steps, 1);
    assert.equal(result.remainderMs, 67);
});

test("non-finite values are rejected", () => {
    assert.throws(
        () => consumeSimulationTime(0, Number.NaN, 1, 333),
        TypeError
    );
});

test("negative or zero-range values are rejected", () => {
    assert.throws(() => consumeSimulationTime(-1, 16, 1, 333), RangeError);
    assert.throws(() => consumeSimulationTime(0, 16, 0, 333), RangeError);
    assert.throws(() => consumeSimulationTime(0, 16, 1, 0), RangeError);
});
