import test from "node:test";
import assert from "node:assert/strict";
import { TAIGA_FORMATIONS, TAIGA_TREES, taigaProfileAt } from "../../js/world/taiga-ecology.js";
import { drawTaiga, drawTaigaIce, drawTaigaTree } from "../../js/presentation/rendering/taiga-render.js";

const BASE = {
    seed: 20261116, seaLevel: 0.33, climate: "taiga", temperature: 0.26,
    year: 7, hour: 12, weather: "clear", wind: 1.2, use: { state: "wild" },
};
const MODS = [
    { moisture: 0.6, height: 0.5, dayOfYear: 140, temperature: 0.26, weather: "storm" },
    { moisture: 0.8, height: 0.75, dayOfYear: 140, temperature: 0.22, weather: "storm" },
    { moisture: 0.3, height: 0.7, dayOfYear: 140, temperature: 0.2, weather: "clear" },
    { moisture: 0.6, height: 0.85, dayOfYear: 140, temperature: 0.2, weather: "clear" },
    { moisture: 0.65, height: 0.42, dayOfYear: 340, temperature: 0.2, weather: "snow" },
];

function makeContext() {
    const calls = { fill: 0, stroke: 0, fillRect: 0, ellipse: 0, arc: 0, lineTo: 0, moveTo: 0, save: 0, restore: 0, translate: 0, rotate: 0, beginPath: 0, closePath: 0, quadraticCurveTo: 0, bezierCurveTo: 0, roundRect: 0, fillText: 0 };
    const ctx = { calls, fillStyle: "", strokeStyle: "", lineWidth: 1, globalAlpha: 1, lineCap: "round" };
    for (const name of Object.keys(calls)) {
        ctx[name] = (...args) => {
            for (const value of args) if (typeof value === "number") assert.ok(Number.isFinite(value), name + " received a non-finite coordinate");
            calls[name]++;
        };
    }
    return ctx;
}

function collect() {
    const formations = new Map();
    for (let y = 0; y < 48; y++) {
        for (let x = 0; x < 48; x++) {
            for (const mod of MODS) {
                const profile = taigaProfileAt(x + 0.5, y + 0.5, { ...BASE, ...mod });
                if (!formations.has(profile.formation)) formations.set(profile.formation, profile);
            }
        }
    }
    return formations;
}

const formations = collect();

test("all ten taiga formations render with bounded draw calls", () => {
    assert.equal(formations.size, 10);
    for (const [id, profile] of formations) {
        for (const cellPx of [5, 12, 34]) {
            const ctx = makeContext();
            drawTaiga(ctx, 40, 40, cellPx, profile, 0.11, 0.53, 0.87, 1234, 1.4, 1.2, profile.dayOfYear, "taiga");
            assert.ok(ctx.calls.fill + ctx.calls.fillRect + ctx.calls.ellipse < 500, id + " rendered too many primitives");
            assert.ok(ctx.calls.fill > 0, id + " rendered nothing");
        }
    }
});

test("taiga trees and saplings render for every shared tree variant", () => {
    const profile = formations.get("mixed-taiga");
    assert.ok(profile);
    for (const [kind, definition] of Object.entries(TAIGA_TREES)) {
        const ctx = makeContext();
        const tree = { kind, height: definition.heightMeters + 3, variant: 0.62, shade: 0.5 };
        drawTaigaTree(ctx, 40, 40, 20, tree, profile, 0.37);
        assert.ok(ctx.calls.fill + ctx.calls.stroke > 0, kind + " rendered nothing");
    }
    const ctx = makeContext();
    assert.doesNotThrow(() => drawTaigaTree(ctx, 40, 40, 20, { kind: "spruce", height: 0, variant: 0 }, null, 0));
    assert.doesNotThrow(() => drawTaiga(null, 0, 0, 10, null, 0, 0, 0, 0, 1, 1, 0, "taiga"));
});

test("winter snow and deadwood render without overflowing the tile", () => {
    const profile = formations.get("spruce-forest");
    assert.ok(profile);
    const winter = taigaProfileAt(10.5, 10.5, { ...BASE, moisture: 0.62, height: 0.5, dayOfYear: 340 });
    for (const p of [profile, winter]) {
        const ctx = makeContext();
        drawTaiga(ctx, 40, 40, 28, p, 0.77, 0.31, 0.92, 4444, 2, 0.7, p.dayOfYear, "taiga");
        assert.ok(ctx.calls.fill > 0);
        assert.ok(ctx.calls.fillRect + ctx.calls.fill + ctx.calls.ellipse < 650);
    }
    assert.ok(winter.visual.snowCover > profile.visual.snowCover);
});

test("winter ice fills a water tile with bounded, finite marks", () => {
    const ctx = makeContext();
    drawTaigaIce(ctx, 12, 18, 36, 0.71, 0.81);
    assert.ok(ctx.calls.fillRect >= 2);
    assert.ok(ctx.calls.stroke >= 1);
    assert.ok(ctx.calls.lineTo >= 2);
    assert.doesNotThrow(() => drawTaigaIce(null, 0, 0, 10));
});
