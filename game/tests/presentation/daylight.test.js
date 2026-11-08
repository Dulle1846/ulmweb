import test from "node:test";
import assert from "node:assert/strict";
import {
    daylightState, drawDaylightOverlay, forestMistFactor, formatTimeOfDay,
    normalizeTimeOfDay, solarVector,
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

test("the solar vector carries the daily azimuth and the seasonal height", () => {
    const dawn = solarVector(6, "summer");
    const noon = solarVector(12, "summer");
    const dusk = solarVector(18, "summer");
    assert.ok(dawn.shadowX < 0, "morning shadows fall away from an eastern sun");
    assert.ok(dusk.shadowX > 0, "evening shadows fall away from a western sun");
    assert.ok(noon.shadowY < 0, "noon shadows point north of a southern sun");
    assert.ok(dawn.elevation < noon.elevation && dusk.elevation < noon.elevation);
    assert.ok(solarVector(12, "winter").elevation < solarVector(12, "summer").elevation);
    for (const hour of [0, 6, 12, 18, 23.5]) {
        const sun = solarVector(hour, "autumn");
        assert.ok(Math.abs(Math.hypot(...sun.direction) - 1) < 1e-6, "the solar direction is a unit vector");
        assert.ok(sun.step >= 0.55 && sun.step <= 3);
        assert.equal(sun.hour, normalizeTimeOfDay(hour));
    }
});

test("morning mist follows moisture, season and weather", () => {
    assert.ok(forestMistFactor(7.2, 0.75, "autumn", "clear") > 0.4);
    assert.equal(forestMistFactor(12, 0.75, "autumn", "clear"), 0);
    assert.equal(forestMistFactor(2, 0.75, "autumn", "clear"), 0);
    assert.ok(forestMistFactor(7.2, 0.9, "autumn", "clear") > forestMistFactor(7.2, 0.3, "autumn", "clear"));
    assert.ok(forestMistFactor(7.2, 0.6, "autumn", "fog") > forestMistFactor(7.2, 0.6, "autumn", "clear"));
    assert.ok(forestMistFactor(7.2, 0.6, "autumn", "clear") > forestMistFactor(7.2, 0.6, "summer", "clear"));
    assert.equal(forestMistFactor("bad", 0.75), 0);
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
