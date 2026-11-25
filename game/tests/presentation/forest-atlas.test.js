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
    assert.ok(first.types.some(type => type.dynamics?.composition), "present types must carry a sampled dynamics record");
    assert.equal(first.systems.length, 6, "the atlas must report every silvicultural system, including unsampled ones");
    assert.ok(first.systems.every(row => row.label && Number.isInteger(row.count)), "every system needs a visible label and count");
    assert.equal(first.systems.reduce((sum, row) => sum + row.count, 0), first.sampled,
        "system counts must come from the same bounded atlas sample");
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
    assert.equal((markup.match(/data-forest-system="/g) || []).length, 6,
        "the visible atlas must list all six silvicultural systems");
    assert.match(markup, /Waldweide/);
    assert.match(markup, /Niederwald/);
    assert.match(markup, /Mittelwald/);
    assert.match(markup, /Hochwald/);
    assert.match(markup, /Plenterwald/);
    assert.match(markup, /Dauerwald/);
    assert.match(markup, /TRANSITION EDGES/);
    assert.match(markup, /MIX/);
    assert.match(markup, /PHASE/);
    assert.match(markup, /PIONEER \/ CLIMAX/);
    assert.match(markup, /SEED BANK/);
    assert.match(markup, /MOTHER TREES|mother trees/);
    assert.match(markup, /GENETICS/);
    assert.match(markup, /COHORTS/);
    assert.match(markup, /young\/mature\/ancient · spread \d+y/);
    assert.match(markup, /REGEN/);
    assert.match(markup, /rain \d+% · germ \d+% · recruit \d+%/);
    assert.match(markup, /DEADWOOD/);
    assert.match(markup, /standing \d+% · fallen \d+% · decay \d+%/);
    assert.match(markup, /EDGE/);
    assert.match(markup, /diversity \d+% · cover \d+%/);
    assert.match(markup, /HERB/);
    assert.match(markup, /liana \d+%/);
    assert.match(markup, /SITE FIT/);
    assert.match(markup, /SYSTEM/);
    assert.match(markup, /WORKING/);
    assert.match(markup, /quality \d+%/);
    assert.match(markup, /log share \d+%/);
    assert.match(markup, /logs → planks|food \/ market|pannage \/ market/);
    assert.match(markup, /MYCORRHIZA|mycorrhiza/);
    assert.match(markup, /STRUCTURE/);
    assert.match(markup, /GAPS/);
    assert.match(markup, /REGIME/);
    assert.match(markup, /LIGHT/);
    assert.match(markup, /fire \d+% · wind \d+%/);
    assert.match(markup, /uptake \d+%/);
    assert.match(markup, /decomposition \d+%/);
    assert.match(markup, /Heart root|Deep taproot|Sinker roots|Shallow plate/);
    assert.match(markup, /retention \d+\/ha/);
    assert.match(markup, /sawlogs \d+% · firewood \d+%/);
    assert.match(markup, /gap age \d+d/);
    assert.match(markup, /medicine \d+%/);
    assert.match(markup, /long snow cover/);
    assert.match(markup, /Moss/);
    assert.match(markup, /Dune Grass/);
});

test("a realm without resource geography shows an honest empty atlas", () => {
    resetState();
    const markup = renderForestAtlasPanel();
    assert.match(markup, /No resource geography is available/);
});
