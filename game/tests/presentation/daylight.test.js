import test from "node:test";
import assert from "node:assert/strict";
import {
    daylightState, drawDaylightOverlay, formatTimeOfDay, normalizeTimeOfDay,
} from "../../js/presentation/rendering/daylight.js";

test("noon is the uninstrumented default", () => {
    const noon = daylightState(12, "summer");
    assert.equal(noon.phase, "day");
    assert.equal(noon.alpha, 0);
    assert.ok(noon.daylight > 0.99);
    assert.equal(formatTimeOfDay(12), "12:00");
});

test("dawn, dusk and night have distinct regulated light", () => {
    const dawn = daylightState(6, "summer");
    const dusk = daylightState(18, "summer");
    const night = daylightState(23, "summer");
    assert.equal(dawn.phase, "dawn");
    assert.equal(dusk.phase, "dusk");
    assert.equal(night.phase, "night");
    assert.ok(dawn.alpha > 0 && dusk.alpha > 0);
    assert.ok(night.alpha > dawn.alpha);
    assert.ok(night.night > 0.9);
});

test("time of day wraps deterministically", () => {
    assert.equal(normalizeTimeOfDay(24), 0);
    assert.equal(normalizeTimeOfDay(-1), 23);
    assert.equal(normalizeTimeOfDay("bad"), 12);
    assert.equal(formatTimeOfDay(6.5), "06:30");
    assert.equal(daylightState(0).phase, "night");
});

test("winter nights are deeper than summer nights", () => {
    const summer = daylightState(23, "summer");
    const winter = daylightState(23, "winter");
    assert.ok(winter.alpha > summer.alpha);
});

test("the overlay is a no-op at noon and paints at night", () => {
    const calls = [];
    const ctx = {
        save() {}, restore() {},
        createLinearGradient() { return { addColorStop() {} }; },
        fillRect(...args) { calls.push(args); },
    };
    const canvas = { width: 800, height: 600 };
    assert.equal(drawDaylightOverlay(ctx, canvas, 12, "summer"), false);
    assert.equal(calls.length, 0);
    assert.equal(drawDaylightOverlay(ctx, canvas, 23, "summer"), true);
    assert.deepEqual(calls[0], [0, 0, 800, 600]);
    assert.equal(drawDaylightOverlay(ctx, canvas, 6, "summer"), true);
    assert.equal(calls.length, 2);
});
