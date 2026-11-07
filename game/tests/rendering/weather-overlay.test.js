import test from "node:test";
import assert from "node:assert/strict";
import { weatherKind, weatherParticles, drawWeatherOverlay } from "../../js/presentation/rendering/weather-overlay.js";
import { state } from "../../js/core/state.js";

function fakeContext() {
    const calls = [];
    const target = { globalAlpha: 1, fillStyle: "", strokeStyle: "", lineWidth: 1 };
    const ctx = new Proxy(target, {
        get(object, key) {
            if (key in object) return object[key];
            return (...args) => { calls.push([String(key), ...args]); };
        },
        set(object, key, value) { object[key] = value; return true; },
    });
    return { ctx, calls };
}

test("only snow and rain produce an overlay", () => {
    assert.equal(weatherKind("snow"), "snow");
    assert.equal(weatherKind("RAIN"), "rain");
    assert.equal(weatherKind("clear"), "clear");
    assert.equal(weatherKind(undefined), "clear");
});

test("particles stay inside the frame and move over time", () => {
    const first = weatherParticles(12.5, "snow", 40);
    const second = weatherParticles(12.5, "snow", 40);
    assert.deepEqual(first, second);
    for (const particle of first) {
        assert.ok(particle.x >= 0 && particle.x < 1);
        assert.ok(particle.y >= 0 && particle.y < 1);
        assert.ok(particle.size > 0);
    }
    const later = weatherParticles(13.5, "snow", 40);
    assert.notDeepEqual(first.map(p => p.y), later.map(p => p.y), "flakes must fall");
});

test("the overlay draws snow and rain and leaves clear skies alone", () => {
    const original = state.weather;
    try {
        const clear = fakeContext();
        state.weather = "clear";
        assert.equal(drawWeatherOverlay(clear.ctx, { width: 800, height: 600 }, 1), false);
        assert.equal(clear.calls.length, 0);

        const snow = fakeContext();
        state.weather = "snow";
        assert.equal(drawWeatherOverlay(snow.ctx, { width: 800, height: 600 }, 1), true);
        assert.ok(snow.calls.some(([name]) => name === "fillRect"), "snow needs the cold veil");
        assert.ok(snow.calls.filter(([name]) => name === "arc").length > 20, "snow needs flakes");

        const rain = fakeContext();
        state.weather = "rain";
        assert.equal(drawWeatherOverlay(rain.ctx, { width: 640, height: 480 }, 1), true);
        assert.ok(rain.calls.filter(([name]) => name === "stroke").length > 20, "rain needs streaks");
    } finally {
        state.weather = original;
    }
});
