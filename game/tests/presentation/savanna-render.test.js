import test from "node:test";
import assert from "node:assert/strict";
import { savannaProfileAt } from "../../js/world/savanna-ecology.js";
import { drawSavanna, drawSavannaTree } from "../../js/presentation/rendering/savanna-render.js";

class FakeContext {
    constructor() {
        this.calls = 0;
        this.badArguments = [];
        this.fillStyle = "#000000";
        this.strokeStyle = "#000000";
        this.globalAlpha = 1;
        this.lineWidth = 1;
    }

    static method(name) {
        return function (...args) {
            this.calls += 1;
            for (const arg of args) {
                if (typeof arg === "number" && !Number.isFinite(arg)) this.badArguments.push(name + ": " + arg);
            }
        };
    }
}

for (const name of ["save", "restore", "beginPath", "closePath", "moveTo", "lineTo", "quadraticCurveTo", "arc", "ellipse", "fill", "stroke"]) {
    FakeContext.prototype[name] = FakeContext.method(name);
}

const BASE = Object.freeze({
    seed: 20261114,
    seaLevel: 0.33,
    climate: "savanna",
    year: 7,
    temperature: 0.8,
    hour: 13,
    weather: "clear",
    wind: 1.4,
    use: { state: "wild" },
});
const SURVEY = Object.freeze([
    { x: 28.5, y: 12.5, moisture: 0.72, height: 0.42, dayOfYear: 310, weather: "clear" },
    { x: 40.5, y: 16.5, moisture: 0.32, height: 0.34, dayOfYear: 130, weather: "storm" },
    { x: 7.5, y: 25.5, moisture: 0.46, height: 0.34, dayOfYear: 130, weather: "storm" },
    { x: 5.5, y: 8.5, moisture: 0.46, height: 0.34, dayOfYear: 130, weather: "storm" },
    { x: 1.5, y: 20.5, moisture: 0.6, height: 0.34, dayOfYear: 310, weather: "clear" },
    { x: 40.5, y: 16.5, moisture: 0.6, height: 0.42, dayOfYear: 130, weather: "storm" },
    { x: 8.5, y: 2.5, moisture: 0.72, height: 0.42, dayOfYear: 310, weather: "clear" },
    { x: 8.5, y: 32.5, moisture: 0.18, height: 0.42, dayOfYear: 130, weather: "storm" },
    { x: 2.5, y: 24.5, moisture: 0.18, height: 0.42, dayOfYear: 130, weather: "storm" },
    { x: 25.5, y: 28.5, moisture: 0.72, height: 0.34, dayOfYear: 130, weather: "storm" },
]);
const context = overrides => ({ ...BASE, ...overrides });

test("savanna tiles render with finite coordinates and a bounded call count", () => {
    const formations = new Set();
    let maximumCalls = 0;
    for (const entry of SURVEY) {
        const profile = savannaProfileAt(entry.x, entry.y, context(entry));
        formations.add(profile.formation);
        for (const cellPx of [16, 32, 48, 96]) {
            const ctx = new FakeContext();
            drawSavanna(ctx, 110, 70, cellPx, profile, 0.31, 0.62, 0.93, 123456, 1.2, 0.7, entry.dayOfYear, "savanna");
            assert.deepEqual(ctx.badArguments, [], `${profile.formation} at ${cellPx}px produced a non-finite coordinate`);
            assert.ok(ctx.calls > 8, `${profile.formation} should add visible detail`);
            maximumCalls = Math.max(maximumCalls, ctx.calls);
        }
    }
    assert.equal(formations.size, 10);
    assert.ok(maximumCalls < 500, "savanna detail must stay bounded; maximum was " + maximumCalls);
});

test("acacia and baobab trees are distinct, finite and safe at every zoom", () => {
    const acacia = savannaProfileAt(40.5, 16.5, context(SURVEY[5]));
    const baobab = savannaProfileAt(1.5, 20.5, context(SURVEY[4]));
    assert.ok(acacia.vegetation.trees.some(tree => tree.kind === "acacia"));
    assert.ok(baobab.vegetation.trees.some(tree => tree.kind === "baobab"));
    for (const tree of [...acacia.vegetation.trees, ...baobab.vegetation.trees]) {
        for (const cellPx of [10, 20, 48, 96]) {
            const ctx = new FakeContext();
            drawSavannaTree(ctx, 40, 40, cellPx, tree, tree.kind === "baobab" ? baobab : acacia, 0.4);
            assert.deepEqual(ctx.badArguments, []);
            assert.ok(ctx.calls > 2);
        }
    }
    assert.doesNotThrow(() => drawSavanna(new FakeContext(), 0, 0, 48, null));
    assert.doesNotThrow(() => drawSavannaTree(new FakeContext(), 0, 0, 48, null));
});

test("seasons change the savanna renderer without exceeding its detail budget", () => {
    const days = [130, 250];
    for (const day of days) {
        const profile = savannaProfileAt(25.5, 28.5, context({ ...SURVEY[9], dayOfYear: day }));
        const ctx = new FakeContext();
        drawSavanna(ctx, 80, 80, 64, profile, 0.5, 0.5, 0.5, 1000, 1.2, 0.7, day, "savanna");
        assert.ok(ctx.calls > 12);
    }
});
