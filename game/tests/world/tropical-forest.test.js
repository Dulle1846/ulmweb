import test from "node:test";
import assert from "node:assert/strict";
import {
    FOREST_GOODS, FOREST_SPECIES, FOREST_TYPE_IDS, FOREST_TYPES,
    forestFaunaFor, forestGoodsFor, forestSnowDepthAt, forestStandAt, forestSurveyAt,
} from "../../js/world/forest-ecology.js";
import {
    TROPICAL_FORMATION_IDS, TROPICAL_FORMATIONS, TROPICAL_GOODS, TROPICAL_POINTS,
    TROPICAL_SPECIES_IDS, tropicalProfileFor,
} from "../../js/world/tropical-ecology.js";
import { CLIMATES, initNoise, normalizeWorldOptions, sampleMoisture, sampleTemperature, TERRAIN_PALETTES } from "../../js/world/terrain-model.js";
import { seasonalState } from "../../js/world/season.js";
import { terrainPaletteForPhase, terrainShaderPaletteForPhase } from "../../js/presentation/rendering/terrain-palette.js";
import { weatherWeights } from "../../js/world/weather.js";

const context = (overrides = {}) => ({
    seed: 20261111, moisture: 0.84, temperature: 0.86, height: 0.44,
    climate: "tropical", forests: 78, stockRatio: 1, rockLine: 0.92,
    ...overrides,
});

function collectTropical() {
    const found = new Map();
    for (const height of [0.3, 0.42, 0.55, 0.66, 0.8, 0.88]) {
        for (const moisture of [0.58, 0.68, 0.76, 0.84, 0.92]) {
            for (let y = 0; y < 96 && found.size < TROPICAL_FORMATION_IDS.length; y += 3) {
                for (let x = 0; x < 96; x += 3) {
                    const stand = forestStandAt(x + 0.5, y + 0.5, context({ height, moisture }));
                    if (stand.forest && TROPICAL_FORMATIONS[stand.type]) found.set(stand.type, stand);
                }
            }
        }
    }
    return found;
}

const tropical = collectTropical();
const sample = id => {
    const stand = tropical.get(id);
    assert.ok(stand, "expected reachable tropical formation " + id + "; found " + [...tropical.keys()].join(", "));
    return stand;
};

test("tropical climate is a full climate, not a palette alias", () => {
    assert.ok(CLIMATES.some(entry => entry.id === "tropical"));
    assert.ok(TERRAIN_PALETTES.tropical);
    const state = seasonalState(350, "tropical");
    assert.equal(state.snowCover, 0);
    assert.equal(state.foliageTurn, 0);
    assert.equal(state.evergreenCanopy, true);
    const weather = weatherWeights(350, "tropical");
    assert.equal(weather.snow, 0);
    assert.ok(weather.rain > weather.clear);
    initNoise(9182);
    const tropicalOptions = normalizeWorldOptions({ climate: "tropical" });
    const temperateOptions = normalizeWorldOptions({ climate: "temperate" });
    const wet = sampleMoisture(33, 44, tropicalOptions);
    const temperate = sampleMoisture(33, 44, temperateOptions);
    assert.ok(wet > temperate, "tropical moisture baseline must be humid");
    const hot = sampleTemperature(33, 44, 64, 64, 0.42, 0.3, tropicalOptions);
    const cool = sampleTemperature(33, 44, 64, 64, 0.42, 0.3, temperateOptions);
    assert.ok(hot > cool);
});

test("thirty-three species and fifty-one formations preserve every existing index", () => {
    assert.equal(Object.keys(FOREST_SPECIES).length, 33);
    assert.equal(FOREST_TYPE_IDS.length, 51);
    assert.equal(FOREST_TYPE_IDS[38], "selection-forest");
    TROPICAL_FORMATION_IDS.forEach((id, index) => {
        assert.equal(FOREST_TYPE_IDS[39 + index], id);
        assert.equal(FOREST_TYPES[id].tropical, true);
    });
    assert.equal(TROPICAL_SPECIES_IDS.length, 13);
});

test("all twelve tropical formations are reachable and distinct", () => {
    for (const id of TROPICAL_FORMATION_IDS) {
        const stand = sample(id);
        assert.equal(stand.type, id);
        assert.ok(stand.forest && stand.tropical, id + " must carry a tropical profile");
        assert.ok(Object.keys(FOREST_TYPES[id].species).length >= 6, id + " needs a real species mix");
    }
    assert.ok(tropical.size >= 12);
});

test("all 65 required rainforest points are present with real values", () => {
    assert.equal(TROPICAL_POINTS.length, 65);
    assert.equal(new Set(TROPICAL_POINTS.map(point => point.id)).size, 65);
    assert.deepEqual(TROPICAL_POINTS.map(point => point.id),
        Array.from({ length: 65 }, (_, index) => "1.2.4." + (index + 1)));
    const profiles = TROPICAL_FORMATION_IDS.map(id => sample(id).tropical);
    for (const profile of profiles) {
        assert.equal(profile.points.length, 65);
        for (const point of TROPICAL_POINTS) {
            const value = profile.features[point.id];
            assert.ok(Number.isFinite(value), point.id + " must be finite");
            assert.ok(value >= 0 && value <= 1, point.id + " must be a real share");
        }
    }
    const fallow = sample("tropical-plantation").tropical;
    assert.ok(fallow.features["1.2.4.64"] >= 0.4, "abandoned land must record clearance");
    assert.ok(fallow.features["1.2.4.65"] > 0.5, "abandoned land must record regrowth");
    const deep = sample("tropical-ancient").tropical;
    assert.ok(deep.features["1.2.4.2"] > 0.35, "ancient forest must expose buttresses");
    assert.ok(deep.features["1.2.4.8"] > 0.7, "ancient forest must hold rare old trees");
    assert.ok(deep.features["1.2.4.14"] > 0.6, "epiphytes must be abundant");
    assert.ok(deep.features["1.2.4.38"] > 0.35, "big cats must have habitat");
});

test("tropical structure exposes strata, plants, soil, water and land use", () => {
    const stand = sample("tropical-emergent");
    const t = stand.tropical;
    assert.ok(t.canopyStrata.emergent > 0 && t.canopyStrata.lower > 0 && t.canopyStrata.upper > 0);
    assert.ok(t.buttress.maxFlare > 0.5);
    assert.ok(t.barkTypes.length >= 3);
    assert.ok(t.leafSizes.length >= 2);
    assert.ok(t.plants.some(plant => plant.id === "liana"));
    assert.ok(t.plants.some(plant => plant.id === "giant-fern"));
    assert.ok(t.plants.some(plant => plant.id === "orchid"));
    assert.ok(t.plants.some(plant => plant.id === "pitcher"));
    assert.ok(t.soil.weathered > 0 && t.soil.dark > 0 && t.soil.surfaceRoots > 0);
    assert.ok(t.water.heavyRain > 0.5 && t.water.humidity > 0.5);
    assert.ok(Object.keys(t.hazard).length >= 8);
    assert.ok(t.hazard.disease > 0 && t.hazard.spoilage > 0 && t.hazard.movement > 0);
    assert.ok("settlement" in t.landUse && "agriculture" in t.landUse && "riverTrade" in t.landUse);
    assert.ok(t.landUse.hunting && t.landUse.gathering);
});

test("tropical goods, fauna, hazards and snow respect the shared contracts", () => {
    for (const id of TROPICAL_SPECIES_IDS) {
        const species = FOREST_SPECIES[id];
        assert.ok(species, id + " must be registered");
        assert.equal(species.tropical, true);
        assert.ok(FOREST_GOODS[species.wood], id + " needs a named timber");
    }
    for (const good of ["mahogany-timber", "brazil-nuts", "vanilla", "quinine-bark", "natural-rubber", "stingless-bee-honey", "orchids", "giant-waterlily", "poison-dart-frog"]) {
        assert.ok(TROPICAL_GOODS[good], good + " must be a tropical product");
    }
    const stand = sample("tropical-emergent");
    const summer = forestGoodsFor(stand, 150, "tropical");
    const winter = forestGoodsFor(stand, 350, "tropical");
    assert.ok(summer.length > 4);
    assert.ok(winter.length > 4, "tropical products stay available in the rainy season");
    assert.ok(summer.some(good => ["brazil-nuts", "vanilla", "orchids", "stingless-bee-honey"].includes(good.id)));
    const fauna = forestFaunaFor(stand, 150, "tropical", 0.2);
    assert.ok(fauna.length >= 2);
    assert.ok(fauna.every(entry => entry.label && entry.group));
    assert.equal(forestSnowDepthAt(stand, 350, "tropical").cm, 0);
    const survey = forestSurveyAt(18.5, 22.5, context());
    assert.ok(survey.tropical);
    assert.equal(survey.snowDepthCm, 0);
    assert.equal(survey.mixSummary.includes("broadleaf"), true);
});

test("tropical stand generation is deterministic and save-neutral", () => {
    const first = forestStandAt(31.5, 41.5, context());
    const second = forestStandAt(31.5, 41.5, context());
    assert.equal(JSON.stringify(first), JSON.stringify(second));
    assert.equal(first.tropical.features["1.2.4.1"], second.tropical.features["1.2.4.1"]);
    const profile = tropicalProfileFor({ x: 31, y: 41, seed: 7, species: ["mahogany", "kapok"], formationId: "tropical-canopy" });
    assert.equal(profile.features["1.2.4.44"] > 0.5, true);
    assert.equal(profile.climate, "tropical");
});

test("tropical terrain palette keeps the full shader contract through the year", () => {
    for (const phase of [0, 0.5, 1.25, 2.5, 3.75]) {
        const palette = terrainPaletteForPhase("tropical", phase);
        for (const key of ["meadow", "lush", "dry", "earth", "forest", "rock", "sand", "snow", "swamp", "waterDeep", "waterShallow", "foam"]) {
            assert.ok(Array.isArray(palette[key]), "tropical palette must carry " + key);
        }
        assert.equal(palette.snowBias, 0);
        assert.equal(palette.autumn, 0);
        assert.equal(palette.winter, 0);
        assert.ok(Number.isFinite(palette.spring));
        assert.ok(Number.isFinite(palette.summer));
    }
    const shader = terrainShaderPaletteForPhase("tropical", 2.5);
    for (const [key, value] of Object.entries(shader)) {
        if (typeof value === "number") assert.ok(Number.isFinite(value), "shader scalar " + key);
        else assert.ok(value.every(Number.isFinite), "shader colour " + key);
    }
});
