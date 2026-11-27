import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { generateResourceGeography } from "../../js/systems/resource-geography.js";
import {
    createForestAtlasSurveyBuilder, forestAtlasSurvey, renderForestAtlasPanel, invalidateForestAtlasSurvey,
} from "../../js/presentation/forest-atlas-panel.js";
import { REGIONAL_FOREST_TYPES } from "../../js/world/regional-forests.js";
import { getResourceNodeAt } from "../../js/systems/resource-geography.js";
import {
    controlledBurnNearestForestTile, forestSuccessionChronicle,
    forestSuccessionStats,
} from "../../js/systems/forest-succession.js";

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
    assert.ok(first.types.some(type => type.model?.typeId), "present types must carry the shared forest model record");
    assert.ok(first.types.filter(type => type.model).every(type => type.model.requirementIds.length === 30));
    assert.equal(first.systems.length, 6, "the atlas must report every silvicultural system, including unsampled ones");
    assert.ok(first.systems.every(row => row.label && Number.isInteger(row.count)), "every system needs a visible label and count");
    assert.equal(first.systems.reduce((sum, row) => sum + row.count, 0), first.sampled,
        "system counts must come from the same bounded atlas sample");
    assert.equal(forestAtlasSurvey(60), first, "a cached survey is reused inside the same window");
});

test("the streamed survey completes the same sample as the synchronous helper", () => {
    setup();
    const expected = forestAtlasSurvey(60);
    invalidateForestAtlasSurvey();
    const builder = createForestAtlasSurveyBuilder(60);
    let steps = 0;
    while (!builder.done() && steps < 10000) {
        assert.equal(builder.value(), null, "an incomplete stream must never publish a partial survey");
        builder.advance();
        steps++;
    }
    assert.ok(builder.done(), "the stream must finish without a hard-coded step cap");
    assert.ok(steps < 10000);
    // Wall-clock diagnostics are allowed to differ; every player-visible and
    // simulation-visible reading must stay identical.
    const stable = survey => ({
        available: survey.available, forestTiles: survey.forestTiles, sampled: survey.sampled,
        counts: survey.counts, transitions: survey.transitions,
        transitionSamples: survey.transitionSamples, present: survey.present,
        types: survey.types, regions: survey.regions, chronicle: survey.chronicle,
        succession: survey.succession, systems: survey.systems, climate: survey.climate,
        season: survey.season, cache: survey.cache,
        chunk: survey.chunk ? { ...survey.chunk, elapsedMs: null } : null,
        // Telemetry counters are live process readings, not survey results:
        // the second build observes model cache hits earned by the first one.
        telemetry: null
    });
    assert.deepEqual(stable(builder.value()), stable(expected), "streaming must preserve every deterministic survey reading");
    assert.equal(forestAtlasSurvey(60), builder.value(), "the completed stream becomes the normal cache entry");
});

test("the rendered atlas lists all 60 types, their effects and their signature timber", () => {
    setup();
    const markup = renderForestAtlasPanel();
    const cards = markup.match(/data-forest-type="/g) || [];
    assert.equal(cards.length, REGIONAL_FOREST_TYPES.length);
    assert.match(markup, /data-fauna-guide="30"/);
    assert.equal((markup.match(/data-fauna-point="/g) || []).length, 30,
        "the field guide must render all thirty fauna points exactly once");
    assert.match(markup, /FAUNA, ECOLOGY AND FOOD WEBS/i);
    assert.match(markup, /Regionale Hirscharten/);
    assert.match(markup, /Wanderkorridore/);
    assert.match(markup, /FIELD GUIDE · 30 POINTS/);
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
    assert.match(markup, /data-forest-model="1\.2\.23\.1\.\d{3}"/);
    assert.match(markup, /MODEL<\/small><strong>ID \d{3} · \d+% region/);
    assert.match(markup, /SOIL \/ WATER/);
    assert.match(markup, /DISTURBANCE/);
    assert.match(markup, /PERFORMANCE/);
    assert.match(markup, /LOD detail · \d+ trees\/chunk/);
    assert.match(markup, /WATER/);
    assert.match(markup, /flood pressure \d+% · retention \d+%/);
    assert.match(markup, /EROSION/);
    assert.match(markup, /risk \d+% · mitigation \d+%/);
    assert.match(markup, /RECOVERY/);
    assert.match(markup, /seed bank \d+% · mother trees \d+%/);
    assert.match(markup, /HABITAT/);
    assert.match(markup, /biodiversity \d+%/);
    assert.match(markup, /data-forest-process="\d+"/);
    assert.match(markup, /LIVE ECOLOGY PULSE/);
    assert.match(markup, /CHUNK \/ LOD/);
    assert.match(markup, /data-forest-model-telemetry="\d+"/);
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
    for (const label of ["WILDLIFE", "PREDATORS", "WATER FAUNA", "INSECTS", "DEADWOOD LIFE", "CYCLE", "CORRIDOR", "HARVEST"]) {
        assert.match(markup, new RegExp(label), "the atlas must expose " + label);
    }
    assert.match(markup, /browse \d{1,2} · boar \d+/);
    assert.match(markup, /health \d{1,3}%/);
    assert.match(markup, /pollinators \d{1,3}%/);
    assert.match(markup, /CORRIDOR<\/small><strong>\d{1,3}%/);
    assert.match(markup, /migration \d{1,3}%/);
    assert.match(markup, /parasites \d{1,3}%/);
    for (const match of markup.matchAll(/\b(browse|health|water|pollinators|pests|hare|lynx|corridor) (\d+)/g)) {
        assert.ok(Number(match[2]) <= 100,
            "fauna " + match[1] + " must render as a percent, not " + match[2]);
    }
});

test("the atlas exposes region history and the live stewardship registers", () => {
    setup(20261125);
    state.resources = { wood: 500, stone: 500, gold: 500, food: 500 };
    let target = null;
    for (let y = 2; y < 46 && !target; y++) {
        for (let x = 2; x < 46; x++) {
            const node = getResourceNodeAt(x, y);
            if (!node?.forestCapacity || node.forestStock < node.forestCapacity * 0.55) continue;
            target = { x, y, node };
            break;
        }
    }
    assert.ok(target, "the atlas fixture needs a mature forest stand");
    const burn = controlledBurnNearestForestTile(target.x, target.y, 6);
    assert.equal(burn.ok, true, burn.reason);
    invalidateForestAtlasSurvey();
    const survey = forestAtlasSurvey(60);
    assert.ok(survey.regions.length >= survey.present,
        "every present regional forest type needs one region history row, including unsampled history");
    const region = survey.regions.find(row => row.id === burn.typeId);
    assert.ok(region, "the burned region must be present in the survey");
    assert.ok(region.sample.biodiversity >= 0 && region.sample.flood >= 0);
    assert.ok(region.history.some(entry => entry.kind === "burn"),
        "the controlled burn must be grouped into its own region history");
    assert.ok(forestSuccessionChronicle().entries.some(entry => entry.kind === "burn"));
    assert.ok(forestSuccessionStats().stewardshipActions >= 1);
    const markup = renderForestAtlasPanel();
    assert.match(markup, /FOREST STEWARDSHIP &amp; REGION HISTORY/);
    assert.match(markup, /PLAYER ORDERS/);
    assert.match(markup, /FIREBREAKS/);
    assert.match(markup, /DRAINED SITES/);
    assert.match(markup, /No disturbance event|Controlled burn/);
    assert.equal((markup.match(/data-forest-region="/g) || []).length, survey.regions.length);
    assert.match(markup, /data-forest-stewardship="\d+"/);
    assert.match(markup, /data-forest-firebreaks="\d+"/);
    assert.match(markup, /data-forest-drained="\d+"/);

    // A single protected tile and a single replant must read as player prose,
    // not as the old "1 TILES / 1 UNITS" debug wording.
    state.forestSuccession.breaks["0:0"] = state.forestSuccession.day + 30;
    state.forestSuccession.planted = 1;
    invalidateForestAtlasSurvey();
    const singular = renderForestAtlasPanel();
    assert.match(singular, /data-forest-firebreaks="1"/);
    assert.match(singular, /<small>FIREBREAKS<\/small><strong>1 TILE<\/strong>/);
    assert.match(singular, /<small>REPLANTED<\/small><strong>1 UNIT<\/strong>/);
});

test("a realm without resource geography shows an honest empty atlas", () => {
    resetState();
    const markup = renderForestAtlasPanel();
    assert.match(markup, /No resource geography is available/);
});
