import test from "node:test";
import assert from "node:assert/strict";
import {
    BENCHMARK_MIN_FRAMES,
    BENCHMARK_RENDERERS,
    BENCHMARK_SCALES,
    buildBenchmarkPlan,
    findBenchmarkWinner,
    summarizeBenchmarkSamples,
} from "../../js/app/performance-benchmark.js";

test("benchmark plan covers every renderer and render scale", () => {
    const plan = buildBenchmarkPlan();
    assert.equal(plan.length, BENCHMARK_RENDERERS.length * BENCHMARK_SCALES.length);
    assert.deepEqual(plan.slice(0, 4).map(row => [row.renderer, row.scaleLabel]), [
        ["auto", 100],
        ["auto", 85],
        ["auto", 70],
        ["auto", 50],
    ]);
    assert.deepEqual(plan.slice(-4).map(row => [row.renderer, row.scaleLabel]), [
        ["canvas", 100],
        ["canvas", 85],
        ["canvas", 70],
        ["canvas", 50],
    ]);
    assert.ok(BENCHMARK_MIN_FRAMES >= 20,"a single slow frame must not decide a row");
});

test("benchmark statistics use rendered-frame intervals and draw time", () => {
    const result = summarizeBenchmarkSamples([16, 16, 17], [4, 6, 8]);
    assert.equal(result.samples, 3);
    assert.ok(Math.abs(result.fps - 61.224489795918366) < 1e-9);
    assert.equal(result.frameMs, 49 / 3);
    assert.equal(result.p95FrameMs, 17);
    assert.equal(result.drawMs, 6);
});

test("invalid samples do not produce invented performance values", () => {
    const result = summarizeBenchmarkSamples([0, -4, Number.NaN], []);
    assert.equal(result.samples, 0);
    assert.equal(result.fps, 0);
    assert.equal(result.frameMs, 0);
    assert.equal(result.drawMs, 0);
});

test("the benchmark winner breaks an FPS tie with the lower draw cost", () => {
    const slowDraw = { fps: 60, drawMs: 4 };
    const fastDraw = { fps: 60, drawMs: 1 };
    const lowerFps = { fps: 55, drawMs: 0.5 };
    assert.equal(findBenchmarkWinner([slowDraw, fastDraw, lowerFps]), fastDraw);
    assert.equal(findBenchmarkWinner([]), null);
});
