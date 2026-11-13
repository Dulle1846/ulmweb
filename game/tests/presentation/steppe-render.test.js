import test from "node:test";
import assert from "node:assert/strict";
import { drawSteppe } from "../../js/presentation/rendering/steppe-render.js";
import { steppeProfileAt } from "../../js/world/steppe-ecology.js";

function fakeContext() {
    const calls = { fill: 0, stroke: 0, ellipse: 0, arc: 0, save: 0, restore: 0 };
    const ctx = {
        calls,
        globalAlpha: 1,
        fillStyle: "",
        strokeStyle: "",
        lineWidth: 1,
        save() { calls.save++; },
        restore() { calls.restore++; },
        beginPath() {},
        moveTo() {},
        lineTo() {},
        quadraticCurveTo() {},
        ellipse() { calls.ellipse++; },
        arc() { calls.arc++; },
        fill() { calls.fill++; },
        stroke() { calls.stroke++; },
    };
    return ctx;
}

const context = {
    seed: 20261113, moisture: 0.3, temperature: 0.72, height: 0.42,
    seaLevel: 0.33, climate: "arid", aridity: 78, dayOfYear: 150,
    year: 6, hour: 13, weather: "clear", wind: 1.1, use: { state: "wild" },
};

test("the steppe renderer draws its ground, flora, dust and fauna without unbounded work", () => {
    const profile = steppeProfileAt(12.5, 9.5, context);
    const ctx = fakeContext();
    drawSteppe(ctx, 120, 90, 42, profile, 0.7, 0.4, 0.95, 1200, 1.1, 0.7, 150, "arid");
    assert.equal(ctx.calls.save, 1);
    assert.equal(ctx.calls.restore, 1);
    assert.ok(ctx.calls.fill > 10);
    assert.ok(ctx.calls.stroke > 4);
    assert.ok(ctx.calls.ellipse >= 4);
});

test("winter steppe renders snow and keeps every rotation deterministic", () => {
    const winter = steppeProfileAt(12.5, 9.5, { ...context, dayOfYear: 350, moisture: 0.34 });
    const first = fakeContext();
    const second = fakeContext();
    drawSteppe(first, 120, 90, 42, winter, 0.2, 0.7, 0.8, 900, 1, 0.4, 350, "arid");
    drawSteppe(second, 120, 90, 42, winter, 0.2, 0.7, 0.8, 900, 1, 0.4, 350, "arid");
    assert.ok(winter.visual.snowCover > 0.3);
    assert.equal(first.calls.fill, second.calls.fill);
    assert.equal(first.calls.stroke, second.calls.stroke);
});

test("the renderer tolerates a missing profile and a minimal context", () => {
    const ctx = fakeContext();
    drawSteppe(ctx, 0, 0, 20, null);
    assert.equal(ctx.calls.save, 0);
    const profile = steppeProfileAt(3.5, 4.5, context);
    drawSteppe(ctx, 10, 10, 20, profile);
    assert.equal(ctx.calls.save, 1);
    assert.equal(ctx.calls.restore, 1);
});
