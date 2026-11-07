import test from "node:test";
import assert from "node:assert/strict";
import {
    terrainSeasonPhase, seasonWeights, terrainPaletteFor, terrainPaletteForPhase, terrainShaderPaletteForPhase,
} from "../../js/presentation/rendering/terrain-palette.js";

test("the season phase follows the realm calendar", () => {
    assert.equal(terrainSeasonPhase(0), 0);
    assert.equal(terrainSeasonPhase(100), 1);
    assert.equal(terrainSeasonPhase(150), 1.5);
    assert.equal(terrainSeasonPhase(399), 3.99);
    assert.equal(terrainSeasonPhase(400), 0);
    assert.equal(terrainSeasonPhase(undefined, 2), 2);
});

test("season weights stay normalised and share the boundary", () => {
    for (const phase of [0, 0.25, 0.5, 0.99, 1, 1.5, 2.5, 3.5, 3.99]) {
        const weights = seasonWeights(phase);
        const total = weights.reduce((sum, value) => sum + value, 0);
        assert.ok(Math.abs(total - 1) < 1e-9, "phase " + phase + " summed to " + total);
        for (const weight of weights) assert.ok(weight >= 0 && weight <= 1);
    }
    const boundary = seasonWeights(1.5);
    assert.ok(Math.abs(boundary[1] - 0.5) < 1e-9);
    assert.ok(Math.abs(boundary[2] - 0.5) < 1e-9);
    assert.equal(seasonWeights(1)[1], 1);
});

test("palettes blend between neighbouring seasons", () => {
    const spring = terrainPaletteFor("temperate", 0);
    const summer = terrainPaletteFor("temperate", 1);
    const middle = terrainPaletteForPhase("temperate", 0.5);
    for (let channel = 0; channel < 3; channel++) {
        const low = Math.min(spring.meadow[channel], summer.meadow[channel]);
        const high = Math.max(spring.meadow[channel], summer.meadow[channel]);
        assert.ok(middle.meadow[channel] >= low - 1e-6 && middle.meadow[channel] <= high + 1e-6);
    }
    assert.ok(Math.abs(middle.meadow[0] - spring.meadow[0]) > 1, "the midpoint must sit between both seasons");
});

test("snow cover fades across the winter boundary instead of snapping", () => {
    assert.equal(terrainPaletteForPhase("temperate", 0).snowBias, 0);
    assert.ok(terrainPaletteForPhase("temperate", 2.98).snowBias > 0);
    assert.ok(Math.abs(terrainPaletteForPhase("temperate", 3).snowBias - 0.28) < 1e-9);
    assert.ok(terrainPaletteForPhase("temperate", 3.02).snowBias > 0);
    const shader = terrainShaderPaletteForPhase("temperate", 2.5);
    assert.ok(Math.abs(shader.autumn - 0.5) < 1e-9);
    assert.ok(Math.abs(shader.winter - 0.5) < 1e-9);
    assert.ok(Math.abs(shader.spring) < 1e-9);
});
