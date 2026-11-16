import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import {
    TRANSITION_DYNAMICS, TRANSITION_GAMEPLAY, TRANSITION_LANDSCAPES, TRANSITION_PAIRS, TRANSITION_REQUIREMENTS,
    getTransitionSurvey, transitionAt, transitionEventWeight, transitionForestStand, transitionGameplayFor,
    transitionGameplayAt, transitionGrassProfile, transitionMovementFactorAt, transitionTint,
    __internals
} from "../../js/world/transition-biomes.js";

const SIZE = 96;
const SEED = 20261170;

function setup() {
    resetState();
    state.hasStarted = true;
    state.worldSeed = SEED;
    state.worldW = SIZE;
    state.worldH = SIZE;
    state.seaLevel = 0.33;
    state.terrainResolution = 1;
    state.terrainPixW = SIZE;
    state.terrainPixH = SIZE;
    state.heightMap = new Float32Array(SIZE * SIZE).fill(0.55);
    state.moistureMap = new Float32Array(SIZE * SIZE).fill(0.44);
    state.temperatureMap = new Float32Array(SIZE * SIZE).fill(0.56);
    state.worldOptions = { climate: "temperate" };
    state.year = 1;
    state.resourceGeography = null;
    state.forestSuccession = null;
    state.specialBiomeMap = null;
    state.specialBiomes = null;
    return state;
}

function at(height, moisture, temperature, climate = "temperate", x = 40, y = 40) {
    return transitionAt(x, y, {
        height, moisture, temperature, climate, seaLevel: state.seaLevel,
        seed: SEED, year: state.year
    });
}

test("the 1.2.17 manifest contains exactly the fifty requested points", () => {
    assert.equal(TRANSITION_REQUIREMENTS.length, 50);
    assert.deepEqual(TRANSITION_REQUIREMENTS.map(entry => entry.id), Array.from({ length: 50 }, (_, index) => "1.2.17." + (index + 1)));
    assert.equal(new Set(TRANSITION_REQUIREMENTS.map(entry => entry.key)).size, 50);
    assert.equal(TRANSITION_PAIRS.length, 15);
    assert.deepEqual(TRANSITION_PAIRS.map(pair => pair.requirement), Array.from({ length: 15 }, (_, index) => index + 1));
    assert.deepEqual(Object.values(TRANSITION_LANDSCAPES).map(entry => entry.requirement), Array.from({ length: 10 }, (_, index) => 25 + index));
    assert.deepEqual(Object.values(TRANSITION_DYNAMICS).map(entry => entry.requirement), Array.from({ length: 8 }, (_, index) => 43 + index));
    for (const entry of TRANSITION_REQUIREMENTS) {
        assert.ok(entry.label.length > 2, entry.id);
        assert.ok(entry.labelDe.length > 2, entry.id);
    }
    assert.match(TRANSITION_REQUIREMENTS[0].labelDe, /Wald-Grasland/);
    assert.match(TRANSITION_REQUIREMENTS[49].labelDe, /Sonderbiome/);
});

test("all fifteen requested edge pairs are reachable with natural terrain samples", () => {
    setup();
    const samples = {
        "wood-grassland": [0.55, 0.44, 0.56],
        "grassland-steppe": [0.55, 0.40, 0.62],
        "steppe-semi-desert": [0.55, 0.34, 0.66],
        "semi-desert-desert": [0.55, 0.24, 0.82],
        "broadleaf-mixed": [0.55, 0.60, 0.55],
        "mixed-conifer": [0.55, 0.60, 0.42],
        "conifer-taiga": [0.55, 0.60, 0.38],
        "taiga-tundra": [0.55, 0.55, 0.27],
        "forest-mountain": [0.78, 0.55, 0.50],
        "mountain-snow": [0.95, 0.50, 0.30],
        "grassland-wetland": [0.35, 0.74, 0.55],
        "wetland-river": [0.35, 0.62, 0.55],
        "coast-forest": [0.37, 0.50, 0.55],
        "coast-dune": [0.34, 0.30, 0.70],
        "volcano-mountain": [0.68, 0.60, 0.70, "volcanic"]
    };
    for (const [id, values] of Object.entries(samples)) {
        const sample = at(...values);
        assert.ok(sample, "missing sample for " + id);
        assert.equal(sample.pair.id, id, `expected ${id}, got ${sample.pair.id}`);
        assert.ok(sample.requirements.includes(sample.pair.requirement));
        assert.ok(sample.requirements.includes(16));
        assert.ok(sample.requirements.includes(24));
    }
});

test("widths and stages vary organically instead of forming one straight border", () => {
    setup();
    const widths = new Set();
    const stages = new Set();
    const strengths = new Set();
    for (let offset = 0; offset < 30; offset++) {
        const sample = transitionAt(20 + offset, 40 + (offset % 5), {
            height: 0.55, moisture: 0.44, temperature: 0.56,
            climate: "temperate", seed: SEED, year: 1
        });
        assert.ok(sample);
        widths.add(sample.width);
        stages.add(sample.stageBand);
        strengths.add(sample.strength);
    }
    assert.ok(widths.size > 8, "transition width must vary across the seam");
    assert.ok(stages.size >= 2, "at least two intermediate stages must appear");
    assert.ok(strengths.size > 8, "strength must not be a hard switch");
    const a = at(0.55, 0.44, 0.56, "temperate", 20, 40);
    const b = at(0.55, 0.44, 0.56, "temperate", 21, 40);
    assert.notEqual(a.id, b.id);
});

test("grass and forest profiles receive the intermediate vegetation mix", () => {
    setup();
    const transition = at(0.55, 0.44, 0.56);
    assert.ok(transition);
    const grass = transitionGrassProfile({
        x: 40, y: 40, season: "summer", grassHex: "#71854f",
        sward: { density: 0.8, height: "tall", tall: true },
        visual: { phase: 0.2, windSway: 0.6 },
        treeChance: 0.05,
        shrubPatches: 0.1,
        trees: [{ kind: "hedge", scale: 1, crown: 0.7, colours: { summer: "#557744" } }]
    }, transition);
    assert.ok(grass.sward.density >= 0 && grass.sward.density <= 1);
    assert.ok(grass.treeChance >= 0.05);
    assert.ok(grass.shrubPatches > 0.1);
    assert.notEqual(grass.grassHex, "#71854f");
    assert.equal(grass.trees.length, 2);
    assert.equal(grass.trees[1].role, "ecotone-island");
    assert.ok(grass.sward.short || grass.sward.medium || grass.sward.tall);

    const stand = transitionForestStand({
        density: 0.8, canopy: 0.8, treeChance: 0.7, clearing: 0.05,
        understory: { grass: 0.1, shrub: 0.1, herb: 0.1, fern: 0.4 }
    }, transition);
    assert.equal(stand.ecotone, transition);
    assert.ok(stand.understory.grass > 0.1);
    assert.ok(stand.understory.shrub > 0.1);
    assert.ok(stand.treeChance >= 0 && stand.treeChance <= 1);
});

test("all ten named transition landscapes are reachable", () => {
    const cases = [
        ["woodland-steppe", "wood-grassland", 0.50, 0.60, 0.30, 0.50, 0],
        ["humid-grassland", "wood-grassland", 0.64, 0.52, 0.30, 0.50, 0],
        ["dry-open-woodland", "wood-grassland", 0.45, 0.58, 0.30, 0.35, 0],
        ["bush-steppe", "grassland-steppe", 0.38, 0.62, 0.30, 0.20, 0],
        ["woodland-tundra", "taiga-tundra", 0.50, 0.27, 0.30, 0.40, 0],
        ["mountain-forest-line", "forest-mountain", 0.50, 0.50, 0.70, 0.50, 0],
        ["coastal-forest", "coast-forest", 0.50, 0.50, 0.06, 0.60, 0],
        ["floodplain", "wetland-river", 0.60, 0.50, 0.04, 0.50, 0.50],
        ["savanna-edge", "grassland-steppe", 0.50, 0.70, 0.30, 0.20, 0],
        ["bog-forest-mosaic", "grassland-wetland", 0.75, 0.50, 0.05, 0.50, 0.50]
    ];
    for (const [expected, pair, moisture, temperature, elevation, forest, wet] of cases) {
        const landscape = __internals.landscapeFor(pair, moisture, temperature, elevation, forest, wet);
        assert.equal(landscape?.id, expected, pair);
        assert.ok(landscape.requirement >= 25 && landscape.requirement <= 34);
    }
});

test("fire, logging, grazing, drought and the rare atlas move the seam", () => {
    setup();
    state.resourceGeography = {
        forestCapacity: new Float32Array(SIZE * SIZE).fill(100),
        forestStock: new Float32Array(SIZE * SIZE).fill(20)
    };
    state.forestSuccession = { tiles: { "40:40": { kind: "burned", age: 1 } } };
    const burned = at(0.55, 0.44, 0.56);
    assert.equal(burned.burned, true);
    assert.ok(burned.logging > 0.2);
    assert.ok(burned.requirements.includes(47));
    assert.ok(burned.requirements.includes(48));
    assert.ok(burned.treeDensity < 0.7);

    state.forestSuccession = null;
    const grazed = transitionAt(40, 40, {
        height: 0.55, moisture: 0.44, temperature: 0.56,
        climate: "temperate", seed: SEED, year: 1, use: { overgrazed: true }
    });
    assert.equal(grazed.grazing, 1);
    assert.equal(grazed.grassHeight, "short");
    assert.ok(grazed.requirements.includes(49));

    state.year = 120;
    const late = at(0.55, 0.44, 0.56);
    assert.ok(late.requirements.includes(43));
    assert.ok(late.stage >= 0 && late.stage <= 1);

    state.specialBiomeMap = new Uint8Array(SIZE * SIZE);
    state.specialBiomeMap[40 * SIZE + 45] = 1;
    state.specialBiomes = { regions: [{ id: "test-region", x: 45, y: 40, radius: 4, transition: 2 }] };
    state.year = 1;
    const earlyMagic = at(0.55, 0.44, 0.56);
    state.year = 120;
    const magic = at(0.55, 0.44, 0.56);
    assert.ok(magic.magic > 0.1);
    assert.ok(magic.magic > earlyMagic.magic);
    assert.ok(magic.requirements.includes(50));
});

test("packed terrain tints are pure, deterministic and exclude water", () => {
    setup();
    const first = transitionTint(0.55, 0.44, 0.56, 12, 9, "temperate", 0.33, SEED);
    const second = transitionTint(0.55, 0.44, 0.56, 12, 9, "temperate", 0.33, SEED);
    assert.ok(first > 0);
    assert.equal(first, second);
    assert.equal(transitionTint(0.2, 0.5, 0.5, 12, 9, "temperate", 0.33, SEED), 0);
    const alpha = first >>> 24;
    assert.ok(alpha >= 8 && alpha <= 96);
    assert.doesNotThrow(() => transitionTint(0.55, 0.44, 0.56, 12, 9, "mountain", 0.33, SEED));
});

test("the survey is bounded, reports the manifest and names an active edge", () => {
    setup();
    const survey = getTransitionSurvey();
    assert.equal(survey.manifestCount, 50);
    assert.equal(survey.pairCount, 15);
    assert.equal(survey.landscapeCount, 10);
    assert.equal(survey.pairs.length, 15);
    assert.equal(survey.active, true);
    assert.ok(survey.sample);
    assert.ok(survey.requirements.length >= 18);
    assert.match(survey.label, /Woodland|Grassland|Steppe|Forest|Coast|Mountain|Taiga|Tundra|Wetland|Volcanic|Desert|Semi/);
    const exact = getTransitionSurvey(40.5, 40.5, { exact: true });
    assert.equal(exact.tile.x, 40);
    assert.equal(exact.tile.y, 40);
    assert.ok(exact.sample);
    assert.ok(exact.gameplay);
    assert.equal(exact.gameplay.pair, exact.sample.pair.id);
});

test("the core helpers are deterministic for a fixed seed and input", () => {
    const first = __internals.pickPair(0.44, 0.56, 0.30, "temperate", SEED, 256, 256);
    const second = __internals.pickPair(0.44, 0.56, 0.30, "temperate", SEED, 256, 256);
    assert.deepEqual(first, second);
    assert.equal(first.pair.id, "wood-grassland");
    assert.equal(__internals.climateDrift(1, "temperate").warming, 0);
    assert.ok(__internals.climateDrift(120, "temperate").warming > 0);
});

test("the named ecotone drives farm, forest, forage, settlement and movement values", () => {
    setup();
    const base = at(0.55, 0.44, 0.56);
    assert.ok(base);
    const wood = transitionGameplayFor(base);
    assert.equal(wood.pair, "wood-grassland");
    assert.ok(wood.farm > 0);
    assert.ok(wood.forest > 0);
    assert.ok(wood.forage > 0);
    assert.ok(wood.settlement > 0.5 && wood.settlement <= 1);
    assert.ok(wood.movement >= 0.68 && wood.movement <= 1.08);
    assert.ok(wood.tags.includes("meadow"));

    const flood = transitionGameplayFor({
        ...base,
        pair: TRANSITION_PAIRS.find(pair => pair.id === "wetland-river"),
        landscape: TRANSITION_LANDSCAPES.floodplain,
        wet: 0.9, drought: 0, stage: 0.5, treeDensity: 0.4
    });
    const dry = transitionGameplayFor({
        ...base,
        pair: TRANSITION_PAIRS.find(pair => pair.id === "grassland-steppe"),
        landscape: TRANSITION_LANDSCAPES["bush-steppe"],
        wet: 0, drought: 0.85, stage: 0.5, treeDensity: 0.25
    });
    assert.ok(flood.farm > dry.farm, "floodplain must out-yield dry bush steppe");
    assert.ok(flood.forage > dry.forage);
    assert.ok(flood.movement < dry.movement, "wet ground must cost movement");
    assert.ok(flood.settlement < dry.settlement, "bog/flood ground is worse for households");
    assert.ok(flood.tags.includes("floodplain"));
    assert.ok(dry.tags.includes("dry"));
});

test("event weighting and the movement cache expose the same ecotone", () => {
    setup();
    const base = at(0.55, 0.44, 0.56);
    const wet = transitionGameplayFor({
        ...base, pair: TRANSITION_PAIRS.find(pair => pair.id === "wetland-river"),
        landscape: TRANSITION_LANDSCAPES.floodplain, wet: 0.9, drought: 0
    });
    const dry = transitionGameplayFor({
        ...base, pair: TRANSITION_PAIRS.find(pair => pair.id === "grassland-steppe"),
        landscape: TRANSITION_LANDSCAPES["bush-steppe"], wet: 0, drought: 0.8
    });
    assert.ok(transitionEventWeight("flood", wet) > transitionEventWeight("harvest", wet));
    assert.ok(transitionEventWeight("fire", dry) > transitionEventWeight("fishing", dry));
    assert.equal(transitionEventWeight("harvest", null), 1);
    const first = transitionMovementFactorAt(40, 40);
    const second = transitionMovementFactorAt(40, 40);
    assert.equal(first, second);
    assert.ok(first >= 0.68 && first <= 1.08);
    assert.ok(Object.keys(TRANSITION_GAMEPLAY).length === 15);
    const gameplay = transitionGameplayAt(40.5, 40.5);
    assert.ok(gameplay && gameplay.label.length > 3);
});
