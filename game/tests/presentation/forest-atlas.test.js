import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { generateResourceGeography } from "../../js/systems/resource-geography.js";
import {
    forestAtlasSurvey, renderForestAtlasPanel, invalidateForestAtlasSurvey,
} from "../../js/presentation/forest-atlas-panel.js";
import { REGIONAL_FOREST_TYPES } from "../../js/world/regional-forests.js";

function setup(seed = 20261123) {
    resetState();
    state.hasStarted = true;
    state.worldSeed = seed;
    state.worldW = 48;
    state.worldH = 48;
    state.terrainResolution = 2;
    state.terrainPixW = 96;
    state.terrainPixH = 96;
    state.worldOptions = { landmass: 50, ruggedness: 55, forests: 70, water: 48, climate: "temperate" };
    state.heightMap = new Float32Array(96 * 96).fill(0.7);
    state.moistureMap = new Float32Array(96 * 96).fill(0.8);
    state.temperatureMap = new Float32Array(96 * 96).fill(0.55);
    state.year = 3;
    state.tick = 48;
    generateResourceGeography(seed);
    invalidateForestAtlasSurvey();
}

test("the atlas surveys a bounded, deterministic sample of the realm's forest tiles", () => {
    setup();
    const first = forestAtlasSurvey(60);
    assert.equal(first.available, true);
    assert.ok(first.forestTiles > 0, "the fixture realm must contain forest");
    assert.ok(first.sampled > 0);
    assert.ok(first.sampled <= 60, "the survey must respect its sample budget");
    const counted = Object.values(first.counts).reduce((sum, value) => sum + value, 0);
    assert.equal(counted, first.sampled);
    assert.equal(first.types.length, 60);
    assert.ok(first.present >= 1);
    assert.ok(Number.isInteger(first.transitionSamples) && first.transitionSamples >= 0);
    assert.equal(first.types.reduce((sum, type) => sum + type.transitionCount, 0), first.transitionSamples);
    assert.equal(forestAtlasSurvey(60), first, "a cached survey is reused inside the same window");
});

test("the rendered atlas lists all 60 types, their effects and their signature timber", () => {
    setup();
    const markup = renderForestAtlasPanel();
    const cards = markup.match(/data-forest-type="/g) || [];
    assert.equal(cards.length, REGIONAL_FOREST_TYPES.length);
    assert.match(markup, /Sixty regional woodlands/);
    assert.match(markup, /CATALOGUED/);
    assert.match(markup, /SURVEYED/);
    assert.match(markup, /Redwood Timber/);
    assert.match(markup, /Mangrove Timber/);
    assert.match(markup, /Ordinary log chain/);
    assert.match(markup, /Timber/);
    assert.match(markup, /Regrowth/);
    assert.match(markup, /Wildlife/);
    assert.match(markup, /Forage/);
    assert.match(markup, /SIGNATURE/);
    assert.match(markup, /bounty/);
    assert.match(markup, /TRANSITION EDGES/);
    assert.match(markup, /long snow cover/);
    assert.match(markup, /Moss/);
    assert.match(markup, /Dune Grass/);
});

test("a realm without resource geography shows an honest empty atlas", () => {
    resetState();
    const markup = renderForestAtlasPanel();
    assert.match(markup, /No resource geography is available/);
});
