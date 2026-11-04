import test from "node:test";
import assert from "node:assert/strict";
import {
    ZOOM_PRESETS,
    clampZoom,
    resolveZoomLevel,
    interpolateZoom,
    cameraOffsetForAnchor
} from "../../js/core/zoom-model.js";

const thresholds = { district: 0.14, rooftops: 0.55, interiors: 1.55 };

test("four zoom bands map to landscape, districts, rooftops and interiors", () => {
    assert.equal(resolveZoomLevel(0.08, thresholds), 1);
    assert.equal(resolveZoomLevel(0.3, thresholds), 2);
    assert.equal(resolveZoomLevel(1, thresholds), 3);
    assert.equal(resolveZoomLevel(2.4, thresholds), 4);
});

test("zoom band boundaries are stable and deterministic", () => {
    assert.equal(resolveZoomLevel(0.14, thresholds), 2);
    assert.equal(resolveZoomLevel(0.55, thresholds), 3);
    assert.equal(resolveZoomLevel(1.55, thresholds), 4);
});

test("zoom presets address all four visual scales", () => {
    assert.equal(ZOOM_PRESETS.length, 4);
    assert.deepEqual(ZOOM_PRESETS.map(value => resolveZoomLevel(value, thresholds)), [1, 2, 3, 4]);
});

test("zoom is clamped to configured minimum and maximum", () => {
    assert.equal(clampZoom(0.001, 0.055, 4.2), 0.055);
    assert.equal(clampZoom(9, 0.055, 4.2), 4.2);
    assert.equal(clampZoom(1, 0.055, 4.2), 1);
});

test("zoom interpolation approaches target and does not overshoot", () => {
    const first = interpolateZoom(1, 3, 1 / 60);
    assert.ok(first > 1 && first < 3);
    assert.equal(interpolateZoom(3, 3, 1 / 60), 3);
});

test("zoom interpolation is time-based and bounded after a stalled frame", () => {
    const regular = interpolateZoom(1, 2, 1 / 60);
    const stalled = interpolateZoom(1, 2, 5);
    assert.ok(stalled > regular);
    assert.ok(stalled < 2);
});

test("cursor anchor camera offset maps the world point to the cursor", () => {
    const world = 37.25;
    const cursor = 412;
    const offset = cameraOffsetForAnchor(world, cursor, 48, 1.75);
    assert.equal(world * 48 * 1.75 - offset, cursor);
});

test("invalid zoom inputs are rejected", () => {
    assert.throws(() => clampZoom(1, 0, 4), RangeError);
    assert.throws(() => resolveZoomLevel(Number.NaN, thresholds), RangeError);
    assert.throws(() => resolveZoomLevel(1, { district: 1, rooftops: 0.5, interiors: 2 }), RangeError);
    assert.throws(() => interpolateZoom(1, 2, -1), RangeError);
});
