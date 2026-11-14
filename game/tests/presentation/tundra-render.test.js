import test from "node:test";
import assert from "node:assert/strict";
import { tundraProfileAt } from "../../js/world/tundra-ecology.js";
import { drawTundra, drawTundraTree } from "../../js/presentation/rendering/tundra-render.js";

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
    seed: 20261113,
    seaLevel: 0.33,
    climate: "tundra",
    year: 7,
    dayOfYear: 140,
    hour: 12,
    weather: "clear",
    wind: 1.1,
    use: { state: "wild" },
});
const context = overrides => ({
    ...BASE,
    moisture: 0.55,
    temperature: 0.22,
    height: 0.42,
    ...overrides,
});
const MODS = Object.freeze([
    { moisture: 0.55, temperature: 0.22, height: 0.42, dayOfYear: 140, hour: 12 },
    { moisture: 0.78, temperature: 0.19, height: 0.38, dayOfYear: 140, hour: 12 },
    { moisture: 0.25, temperature: 0.16, height: 0.54, dayOfYear: 140, hour: 12 },
    { moisture: 0.6, temperature: 0.2, height: 0.4, dayOfYear: 40, hour: 2 },
    { moisture: 0.5, temperature: 0.2, height: 0.4, dayOfYear: 340, hour: 2 },
    { moisture: 0.72, temperature: 0.18, height: 0.36, dayOfYear: 300, hour: 12 },
    { moisture: 0.35, temperature: 0.14, height: 0.62, dayOfYear: 140, hour: 12 },
    { moisture: 0.82, temperature: 0.22, height: 0.35, dayOfYear: 180, hour: 12 },
    { moisture: 0.45, temperature: 0.2, height: 0.47, dayOfYear: 220, hour: 12, weather: "storm", wind: 2 },
    { moisture: 0.62, temperature: 0.18, height: 0.52, dayOfYear: 120, hour: 12 },
    { moisture: 0.9, temperature: 0.2, height: 0.34, dayOfYear: 60, hour: 2 },
    { moisture: 0.3, temperature: 0.16, height: 0.5, dayOfYear: 60, hour: 2 },
]);
const SURVEY = Object.freeze([
    { x: 19.5, y: 18.5, overrides: MODS[6] },
    { x: 39.5, y: 0.5, overrides: MODS[6] },
    { x: 15.5, y: 25.5, overrides: MODS[11] },
    { x: 27.5, y: 18.5, overrides: MODS[3] },
    { x: 27.5, y: 7.5, overrides: MODS[6] },
    { x: 25.5, y: 8.5, overrides: MODS[1] },
    { x: 38.5, y: 37.5, overrides: MODS[6] },
    { x: 3.5, y: 9.5, overrides: MODS[6] },
    { x: 1.5, y: 9.5, overrides: MODS[10] },
    { x: 31.5, y: 0.5, overrides: MODS[5] },
]);

test("tundra tiles render with finite coordinates and a bounded call count", () => {
    const formations = new Set();
    let maximumCalls = 0;
    for (const entry of SURVEY) {
        const profile = tundraProfileAt(entry.x, entry.y, context(entry.overrides));
        formations.add(profile.formation);
        for (const cellPx of [16, 32, 48, 96]) {
            const ctx = new FakeContext();
            drawTundra(ctx, 110, 70, cellPx, profile, 0.31, 0.62, 0.93, 123456, 1.2, 0.7, 140, "tundra");
            assert.deepEqual(ctx.badArguments, [], `${profile.formation} at ${cellPx}px produced a non-finite coordinate`);
            assert.ok(ctx.calls > 8, `${profile.formation} should add visible detail`);
            maximumCalls = Math.max(maximumCalls, ctx.calls);
        }
    }
    assert.equal(formations.size, 10);
    assert.ok(maximumCalls < 500, "tundra detail must stay bounded; maximum was " + maximumCalls);
});

test("tiny tundra trees and empty inputs are safe at every zoom", () => {
    const profile = tundraProfileAt(27.5, 18.5, context({ moisture: 0.6, temperature: 0.2, height: 0.4, dayOfYear: 40, hour: 2 }));
    assert.ok(profile.vegetation.trees.length > 0);
    for (const cellPx of [10, 20, 48, 96]) {
        const ctx = new FakeContext();
        drawTundraTree(ctx, 40, 40, cellPx, profile.vegetation.trees[0], profile, 0.4);
        assert.deepEqual(ctx.badArguments, []);
        assert.ok(ctx.calls > 2);
    }
    assert.doesNotThrow(() => drawTundra(new FakeContext(), 0, 0, 48, null));
    assert.doesNotThrow(() => drawTundraTree(new FakeContext(), 0, 0, 48, null));
});
