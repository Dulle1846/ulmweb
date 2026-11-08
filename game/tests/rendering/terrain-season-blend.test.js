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

test("palettes are anchored at mid-season and ease across boundaries", () => {
    const spring = terrainPaletteFor("temperate", 0);
    const summer = terrainPaletteFor("temperate", 1);
    const springPeak = terrainPaletteForPhase("temperate", 0.5);
    const boundary = terrainPaletteForPhase("temperate", 1);

    assert.deepEqual(springPeak.meadow, spring.meadow, "day 50 must be full spring");
    assert.deepEqual(terrainPaletteForPhase("temperate", 1.5).meadow, summer.meadow, "day 150 must be full summer");

    let differs = 0;
    for (let channel = 0; channel < 3; channel++) {
        const low = Math.min(spring.meadow[channel], summer.meadow[channel]);
        const high = Math.max(spring.meadow[channel], summer.meadow[channel]);
        assert.ok(boundary.meadow[channel] >= low - 1e-6 && boundary.meadow[channel] <= high + 1e-6);
        differs += Math.abs(boundary.meadow[channel] - spring.meadow[channel]);
    }
    assert.ok(differs > 3, "the spring/summer boundary must sit visibly between both seasons");
});

test("snow cover starts in late autumn, peaks in winter and melts in spring", () => {
    assert.equal(terrainPaletteForPhase("temperate", 1.5).snowBias, 0, "summer has no ground snow");
    assert.equal(terrainPaletteForPhase("temperate", 2.3).snowBias, 0, "early autumn stays bare");
    assert.ok(terrainPaletteForPhase("temperate", 2.9).snowBias > 0.02, "late autumn gets the first cover");
    assert.ok(terrainPaletteForPhase("temperate", 3.4).snowBias > 0.25, "deep winter is fully covered");
    assert.ok(terrainPaletteForPhase("temperate", 0.05).snowBias > 0.10, "spring keeps a melting cover");
    assert.equal(terrainPaletteForPhase("temperate", 0.6).snowBias, 0, "late spring is snow free");
});

test("autumn litter and spring green-up follow their own curves", () => {
    const summer = terrainShaderPaletteForPhase("temperate", 1.5);
    const autumn = terrainShaderPaletteForPhase("temperate", 2.5);
    const winter = terrainShaderPaletteForPhase("temperate", 3.5);
    const spring = terrainShaderPaletteForPhase("temperate", 0.25);

    assert.equal(summer.autumn, 0);
    assert.ok(autumn.autumn > 0.6);
    assert.ok(autumn.winter < 0.05);
    assert.ok(winter.winter > 0.95);
    assert.ok(winter.autumn < 0.3);
    assert.ok(spring.spring > 0.5);
    assert.equal(spring.autumn, 0);
});

test("the whole palette changes gradually across the year", () => {
    let previous = terrainPaletteForPhase("temperate", 0);
    let previousBias = previous.snowBias;
    for (let step = 1; step <= 80; step++) {
        const phase = step * 0.05;
        const current = terrainPaletteForPhase("temperate", phase);
        let delta = 0;
        for (let channel = 0; channel < 3; channel++) {
            delta += Math.abs(current.meadow[channel] - previous.meadow[channel]);
        }
        assert.ok(delta < 24, "palette jumped " + delta.toFixed(1) + " at phase " + phase.toFixed(2));
        assert.ok(Math.abs(current.snowBias - previousBias) < 0.06);
        previous = current;
        previousBias = current.snowBias;
    }
});
