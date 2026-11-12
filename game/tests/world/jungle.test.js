import test from "node:test";
import assert from "node:assert/strict";
import { FOREST_FAUNA, FOREST_GOODS, forestSightBlock, forestStandAt, forestSurveyAt } from "../../js/world/forest-ecology.js";
import {
    JUNGLE_FAUNA, JUNGLE_FAUNA_GROUPS, JUNGLE_GOOD_IDS, JUNGLE_POINTS,
    JUNGLE_RESOURCE_GROUPS, jungleProfileFor, jungleTacticsFromStand,
} from "../../js/world/jungle-ecology.js";
import { TROPICAL_FORMATION_IDS, TROPICAL_GOODS } from "../../js/world/tropical-ecology.js";

const context = (overrides = {}) => ({
    seed: 20261111, moisture: 0.86, temperature: 0.86, height: 0.45,
    climate: "tropical", forests: 78, stockRatio: 1, rockLine: 0.92,
    ...overrides,
});

function sampleProfiles() {
    const result = [];
    for (const formationId of TROPICAL_FORMATION_IDS) {
        for (const height of [0.32, 0.48, 0.78]) {
            for (const moisture of [0.62, 0.86, 0.96]) {
                for (let index = 0; index < 12; index++) {
                    result.push(jungleProfileFor({
                        seed: 20261111, x: 3 + index * 7, y: 9 + index * 3,
                        formationId, height, moisture,
                        clearing: index % 4 === 0 ? 0.28 : 0,
                        ageClass: formationId === "tropical-ancient" ? "ancient" : "mature",
                        species: ["mahogany", "bamboo", "palm", "cacao"],
                    }));
                }
            }
        }
    }
    return result;
}

const profiles = sampleProfiles();

test("1.2.5 exposes all 55 points with stable ids and real values", () => {
    assert.equal(JUNGLE_POINTS.length, 55);
    assert.equal(new Set(JUNGLE_POINTS.map(entry => entry.id)).size, 55);
    assert.deepEqual(JUNGLE_POINTS.map(entry => entry.id),
        Array.from({ length: 55 }, (_, index) => "1.2.5." + (index + 1)));
    for (const profile of profiles) {
        assert.equal(profile.points.length, 55);
        for (const point of JUNGLE_POINTS) {
            const value = profile.features[point.id];
            assert.ok(Number.isFinite(value), point.id + " must be finite");
            assert.ok(value >= 0 && value <= 1, point.id + " must be a share");
        }
    }
    const maxima = Object.fromEntries(JUNGLE_POINTS.map(entry => [entry.id, 0]));
    for (const profile of profiles) {
        for (const point of JUNGLE_POINTS) maxima[point.id] = Math.max(maxima[point.id], profile.features[point.id]);
    }
    for (const point of JUNGLE_POINTS) {
        assert.ok(maxima[point.id] > 0.2, point.id + " must be represented in real jungle profiles");
    }
});

test("jungle layers, walls, passages and hidden landscape are deterministic", () => {
    const first = jungleProfileFor({
        seed: 20261111, x: 18, y: 22, formationId: "tropical-ancient",
        moisture: 0.9, height: 0.6, canopy: 0.94, density: 0.94,
        species: ["mahogany", "bamboo", "palm"],
    });
    const second = jungleProfileFor({
        seed: 20261111, x: 18, y: 22, formationId: "tropical-ancient",
        moisture: 0.9, height: 0.6, canopy: 0.94, density: 0.94,
        species: ["mahogany", "bamboo", "palm"],
    });
    assert.deepEqual(first, second);
    assert.equal(first.layers.length, 7);
    assert.ok(first.layers[0].lowMeters < first.layers[6].lowMeters);
    assert.ok(first.layers.every(layer => layer.heightMeters > 0 && layer.density >= 0 && layer.density <= 1));
    assert.ok(first.features["1.2.5.7"] > 0.5, "stratified heights must exist");
    assert.ok(first.features["1.2.5.14"] > 0.3, "dense walls must exist");
    assert.ok(first.features["1.2.5.48"] > 0.3, "movement cost must be real");
    assert.ok(first.features["1.2.5.49"] > 0.3, "sight restriction must be real");
    assert.ok(first.navigation.movementFactor >= 1);
    assert.ok(first.navigation.sightRadiusTiles >= 2);
    assert.ok(first.navigation.ambushChance >= 0);
    assert.ok(first.navigation.supplyFactor > 0 && first.navigation.supplyFactor <= 1);
    assert.ok(first.navigation.guerrillaBonus >= 0);
    assert.ok(["closed jungle", "old-growth jungle", "ravine jungle", "bamboo wall", "flooded jungle",
        "rock outcrop jungle", "hidden glade"].includes(first.type));
});

test("hidden glades, viewpoints and rock passages open real terrain", () => {
    let glade = null;
    let rockPassage = null;
    for (let y = 0; y < 80 && (!glade || !rockPassage); y++) {
        for (let x = 0; x < 120; x++) {
            const profile = jungleProfileFor({
                seed: 20261111, x, y, formationId: "tropical-ancient",
                moisture: 0.9, height: 0.62, canopy: 0.94, density: 0.94,
                ageClass: "ancient", species: ["mahogany", "bamboo", "palm"],
            });
            if (!glade && profile.landscape.hiddenGlade && !profile.landscape.clearing) glade = profile;
            if (!rockPassage && profile.landscape.rockPassage) rockPassage = profile;
        }
    }
    assert.ok(glade, "the sample must contain a hidden glade");
    assert.equal(glade.landscape.openPath, true, "a hidden glade must break the undergrowth wall");
    assert.ok(glade.navigation.sightRadiusTiles >= 4, "a hidden glade must restore local sight");
    assert.ok(glade.features["1.2.5.12"] > 0.6, "a hidden glade must carry its derived strength");
    assert.ok(rockPassage, "the sample must contain a rock-plant passage");
    assert.equal(rockPassage.landscape.passage, true, "a rock passage must be traversable");
    assert.ok(rockPassage.features["1.2.5.30"] > 0.6, "a rock passage must carry its derived strength");
    assert.ok(rockPassage.navigation.defenceBonus >= 0.5, "rock and vegetation must give real cover");
    assert.ok(rockPassage.landscape.viewpoint, "an elevated rock outcrop must act as a viewpoint");
    const sightStand = {
        forest: true, density: 0.94, canopy: 0.94, coniferShare: 0,
        clearing: 0, groundShade: 0, visibility: 0.2,
        sightRadius: glade.navigation.sightRadiusTiles, jungle: glade,
    };
    assert.equal(forestSightBlock(sightStand), 0, "a hidden glade must break the line-of-sight wall");
});

test("every jungle resource group resolves through the shared tropical goods register", () => {
    assert.equal(JUNGLE_GOOD_IDS.length, new Set(JUNGLE_GOOD_IDS).size);
    for (const id of JUNGLE_GOOD_IDS) {
        assert.ok(TROPICAL_GOODS[id], id + " must exist in the shared register");
        assert.ok(FOREST_GOODS[id], id + " must be reachable through the forest goods ledger");
    }
    for (const [group, ids] of Object.entries(JUNGLE_RESOURCE_GROUPS)) {
        assert.ok(ids.length >= 3, group + " needs real choices");
        for (const id of ids) assert.ok(TROPICAL_GOODS[id], group + " contains unknown " + id);
    }
    const found = new Set();
    for (const profile of profiles) {
        for (const entries of Object.values(profile.resources)) {
            for (const entry of entries) found.add(entry.id);
        }
    }
    for (const id of ["mahogany-timber", "brazil-nuts", "rattan", "quinine-bark", "curare",
        "vanilla", "game", "orchids", "luminous-fungus"]) {
        assert.ok(found.has(id), id + " must be reachable in a jungle profile");
    }
});

test("jungle fauna covers predators, reptiles, primates, birds, insects, amphibians and camouflage", () => {
    for (const group of ["predator", "reptile", "primate", "bird", "insect", "amphibian", "large"]) {
        assert.ok(JUNGLE_FAUNA_GROUPS.includes(group), group + " group is required");
        assert.ok(JUNGLE_FAUNA.some(entry => entry.group === group), group + " needs a species");
    }
    assert.ok(JUNGLE_FAUNA.some(entry => entry.camouflage > 0.9), "camouflaged animals are required");
    assert.ok(JUNGLE_FAUNA.some(entry => entry.rare > 0.7 && entry.danger > 0.6), "rare dangerous animals are required");
    for (const entry of JUNGLE_FAUNA) {
        assert.ok(FOREST_FAUNA[entry.id], entry.id + " must be registered in the shared fauna catalogue");
    }
    const fauna = new Set(profiles.flatMap(profile => profile.fauna.map(entry => entry.id)));
    for (const id of ["jaguar", "anaconda", "howler-monkey", "toucan", "bullet-ant", "poison-dart-frog",
        "leaf-mimic-frog", "bushmaster", "giant-otter"]) {
        assert.ok(fauna.has(id), id + " must occur in jungle habitat");
    }
});

test("forest stands carry the jungle profile and use it for sight, goods and fauna", () => {
    const stand = forestStandAt(18.5, 22.5, context());
    assert.ok(stand.forest && stand.tropical && stand.jungle);
    assert.equal(stand.jungle.points.length, 55);
    assert.equal(jungleTacticsFromStand(stand), stand.jungle.navigation);
    assert.ok(stand.sightRadius >= 2 && stand.sightRadius <= stand.jungle.navigation.sightRadiusTiles);
    assert.ok(stand.visibility >= 0 && stand.visibility <= 1);
    const survey = forestSurveyAt(18.5, 22.5, context());
    assert.ok(survey.jungle);
    assert.equal(survey.snowDepthCm, 0);
    assert.ok(Array.isArray(survey.fauna));
    assert.ok(survey.goods.length > 0);
});
