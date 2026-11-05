import test from "node:test";
import assert from "node:assert/strict";
import { consumeSimulationTime } from "../../js/core/simulation-clock.js";
import { BASE_TICK_INTERVAL } from "../../js/core/config.js";

function processFrames(frameTimes, speed) {
    let accumulatorMs = 0;
    let totalSteps = 0;
    for (const elapsedMs of frameTimes) {
        const result = consumeSimulationTime(accumulatorMs, elapsedMs, speed, BASE_TICK_INTERVAL);
        accumulatorMs = result.remainderMs;
        totalSteps += result.steps;
    }
    return { totalSteps, accumulatorMs };
}

test("the default realm day is deliberately slower: 750 ms at 1x", () => {
    assert.equal(BASE_TICK_INTERVAL, 750);
    assert.deepEqual(processFrames([100,100,100,100,100,100,100,50], 1), { totalSteps: 1, accumulatorMs: 0 });
});

test("2x advances one realm day in half the wall-clock time", () => {
    assert.deepEqual(processFrames([100,100,100,75], 2), { totalSteps: 1, accumulatorMs: 0 });
});

test("4x advances one realm day in one quarter of the wall-clock time", () => {
    assert.deepEqual(processFrames([100,87.5], 4), { totalSteps: 1, accumulatorMs: 0 });
});

test("0.5x advances one realm day in twice the default wall-clock time", () => {
    assert.deepEqual(processFrames(Array(15).fill(100), 0.5), { totalSteps: 1, accumulatorMs: 0 });
});

test("fractional progress is retained for the next frame", () => {
    const result = consumeSimulationTime(300, 100, 4, BASE_TICK_INTERVAL);
    assert.equal(result.steps, 0);
    assert.equal(result.remainderMs, 700);
});

test("large frame delays are capped to prevent unbounded catch-up", () => {
    const result = consumeSimulationTime(400, 1000, 4, BASE_TICK_INTERVAL);
    assert.equal(result.acceptedFrameMs, 100);
    assert.equal(result.steps, 1);
    assert.equal(result.remainderMs, 50);
});

test("non-finite values are rejected", () => {
    assert.throws(() => consumeSimulationTime(0, Number.NaN, 1, BASE_TICK_INTERVAL), TypeError);
});

test("negative or zero-range values are rejected", () => {
    assert.throws(() => consumeSimulationTime(-1, 16, 1, BASE_TICK_INTERVAL), RangeError);
    assert.throws(() => consumeSimulationTime(0, 16, 0, BASE_TICK_INTERVAL), RangeError);
    assert.throws(() => consumeSimulationTime(0, 16, 1, 0), RangeError);
});
