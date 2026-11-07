import test from "node:test";
import assert from "node:assert/strict";
import { buildHeightOcclusion } from "../../js/presentation/rendering/terrain-ao.js";

function field(width, height, value = 0) {
    const data = new Float32Array(width * height);
    data.fill(value);
    return data;
}

function pixel(bytes, width, x, y) {
    return bytes[y * width + x];
}

test("flat ground reads as fully open sky", () => {
    const width = 12;
    const height = 9;
    const bytes = buildHeightOcclusion(field(width, height, 0.5), width, height);
    assert.equal(bytes.length, width * height);
    for (const value of bytes) assert.equal(value, 255);
});

test("a hollow is occluded while its rim stays open", () => {
    const width = 21;
    const height = 21;
    const heights = field(width, height, 0.10);
    const center = 10;
    // Raise everything outside a three-tile radius into a bowl rim.
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const distance = Math.hypot(x - center, y - center);
            if (distance > 4) heights[y * width + x] = 0.60;
        }
    }
    const bytes = buildHeightOcclusion(heights, width, height);
    const floor = pixel(bytes, width, center, center);
    const rim = pixel(bytes, width, 1, 1);
    assert.ok(floor < 150, "the hollow floor must be shaded, got " + floor);
    assert.ok(rim > 240, "the open rim must stay bright, got " + rim);
    assert.ok(floor < rim);
});

test("a ridge stays brighter than the slope behind it", () => {
    const width = 17;
    const height = 17;
    const heights = field(width, height, 0.20);
    // A ridge wall rising along +x.
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (x > 10) heights[y * width + x] = 0.85;
        }
    }
    const bytes = buildHeightOcclusion(heights, width, height);
    const inFront = pixel(bytes, width, 9, 8);
    const ridgeTop = pixel(bytes, width, 12, 8);
    assert.ok(inFront < ridgeTop, "the foot of a wall must be darker than its top");
    assert.ok(pixel(bytes, width, 2, 8) > inFront, "open ground must stay brighter than a wall foot");
});

test("occlusion is deterministic and bounded", () => {
    const width = 32;
    const height = 24;
    const heights = new Float32Array(width * height);
    for (let index = 0; index < heights.length; index++) {
        heights[index] = (Math.sin(index * 0.37) * 0.5 + 0.5) * 0.8;
    }
    const first = buildHeightOcclusion(heights, width, height);
    const second = buildHeightOcclusion(heights, width, height);
    assert.deepEqual([...first], [...second]);
    for (const value of first) {
        assert.ok(Number.isInteger(value) && value >= 0 && value <= 255);
    }
    assert.throws(() => buildHeightOcclusion(null, 4, 4), /height field/);
    assert.throws(() => buildHeightOcclusion(heights, 0, 4), /height field/);
});
