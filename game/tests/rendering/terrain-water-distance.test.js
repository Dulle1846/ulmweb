import test from "node:test";
import assert from "node:assert/strict";
import { buildWaterDistance } from "../../js/presentation/rendering/terrain-webgl.js";

function splitField(width, height) {
    const heights = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            heights[y * width + x] = x < 12 ? 0.20 : 0.80;
        }
    }
    return heights;
}

function sample(bytes, width, x, y) {
    return bytes[y * width + x];
}

test("shore distance is expressed in world tiles, not fixed four-sample units", () => {
    const width = 32;
    const height = 16;
    const heights = splitField(width, height);
    const four = buildWaterDistance(heights, width, height, 0.50, 4);
    const two = buildWaterDistance(heights, width, height, 0.50, 2);

    // The first land column is one sample from water. At resolution 4 that is
    // a quarter tile; at resolution 2 it is half a tile, so it must encode a
    // larger distance from the 128 shoreline marker.
    assert.ok(sample(four, width, 12, 8) < sample(two, width, 12, 8),
        "a coarser grid must not shrink the physical shore band");
    assert.notDeepEqual(four, two, "the encoded field must depend on resolution");
});

test("shore distance defaults to the legacy four-sample layout", () => {
    const width = 24;
    const height = 12;
    const heights = splitField(width, height);
    assert.deepEqual(
        buildWaterDistance(heights, width, height, 0.50),
        buildWaterDistance(heights, width, height, 0.50, 4),
    );
});

test("shore distance stays bounded and deterministic", () => {
    const width = 40;
    const height = 24;
    const heights = splitField(width, height);
    const first = buildWaterDistance(heights, width, height, 0.50, 3);
    const second = buildWaterDistance(heights, width, height, 0.50, 3);
    assert.deepEqual(first, second);
    for (const value of first) assert.ok(Number.isInteger(value) && value >= 0 && value <= 255);
});
