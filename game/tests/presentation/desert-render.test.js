import test from "node:test";
import assert from "node:assert/strict";
import { desertProfileAt } from "../../js/world/desert-ecology.js";
import { drawDesert, drawDesertTree } from "../../js/presentation/rendering/desert-render.js";

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

for (const name of ["save", "restore", "beginPath", "closePath", "moveTo", "lineTo", "quadraticCurveTo", "bezierCurveTo", "arc", "ellipse", "rect", "fill", "stroke", "fillRect", "strokeRect", "clip"]) {
    FakeContext.prototype[name] = FakeContext.method(name);
}

const BASE = Object.freeze({
    seed: 20261113,
    seaLevel: 0.33,
    climate: "arid",
    aridity: 82,
    year: 7,
    dayOfYear: 140,
    hour: 13,
    weather: "clear",
    wind: 1.1,
    use: { state: "wild" },
});
const context = overrides => ({
    ...BASE,
    moisture: 0.42,
    temperature: 0.68,
    height: 0.4,
    ...overrides,
});
const SURVEY = Object.freeze([
    { x: 8.5, y: 7.5, overrides: { moisture: 0.42, temperature: 0.68, height: 0.4, hour: 2, weather: "storm", wind: 2 } },
    { x: 0.5, y: 9.5, overrides: { moisture: 0.03, temperature: 0.42, height: 0.74, dayOfYear: 40, hour: 2, weather: "rain" } },
    { x: 0.5, y: 9.5, overrides: { moisture: 0.26, temperature: 0.2, height: 0.34, dayOfYear: 40, hour: 2 } },
    { x: 7.5, y: 0.5, overrides: { moisture: 0.03, temperature: 0.52, height: 0.34, dayOfYear: 40, hour: 2 } },
    { x: 8.5, y: 8.5, overrides: { moisture: 0.03, temperature: 0.52, height: 0.5, dayOfYear: 40, hour: 2 } },
    { x: 0.5, y: 5.5, overrides: { moisture: 0.42, temperature: 0.68, height: 0.34, dayOfYear: 40, hour: 2 } },
    { x: 0.5, y: 8.5, overrides: { moisture: 0.34, temperature: 0.52, height: 0.5, dayOfYear: 40, hour: 2 } },
    { x: 7.5, y: 0.5, overrides: { moisture: 0.18, temperature: 0.52, height: 0.34, dayOfYear: 40, hour: 2 } },
    { x: 0.5, y: 0.5, overrides: { moisture: 0.02, temperature: 0.55, height: 0.65 } },
    { x: 0.5, y: 32.5, overrides: { moisture: 0.02, temperature: 0.55, height: 0.45 } },
]);

test("every desert formation renders with finite coordinates and a bounded call count", () => {
    const formations = new Set();
    let maximumCalls = 0;
    for (const entry of SURVEY) {
        const profile = desertProfileAt(entry.x, entry.y, context(entry.overrides));
        formations.add(profile.formation);
        for (const cellPx of [18, 32, 48, 96]) {
            const ctx = new FakeContext();
            drawDesert(ctx, 120, 80, cellPx, profile, 0.31, 0.62, 0.93, 123456, 1.2, 0.7, 140, "arid");
            assert.deepEqual(ctx.badArguments, [], `${profile.formation} at ${cellPx}px produced a non-finite coordinate`);
            assert.ok(ctx.calls > 8, `${profile.formation} should add visible detail`);
            maximumCalls = Math.max(maximumCalls, ctx.calls);
        }
    }
    assert.equal(formations.size, 10);
    assert.ok(maximumCalls < 650, "desert detail must stay bounded; maximum was " + maximumCalls);
});

test("palm trees and empty inputs are safe at every zoom", () => {
    const profile = desertProfileAt(8.5, 7.5, context({ hour: 2, weather: "storm", wind: 2 }));
    assert.ok(profile.vegetation.palms.length > 0);
    for (const cellPx of [12, 24, 48, 96]) {
        const ctx = new FakeContext();
        drawDesertTree(ctx, 40, 40, cellPx, profile.vegetation.palms[0], profile, 0.4);
        assert.deepEqual(ctx.badArguments, []);
        assert.ok(ctx.calls > 2);
    }
    assert.doesNotThrow(() => drawDesert(new FakeContext(), 0, 0, 48, null));
    assert.doesNotThrow(() => drawDesertTree(new FakeContext(), 0, 0, 48, null));
});
