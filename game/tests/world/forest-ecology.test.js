import test from "node:test";
import assert from "node:assert/strict";
import {
    FOREST_GOODS, FOREST_SPECIES, FOREST_TYPES, FOREST_TYPE_IDS,
    forestFaunaFor, forestGoodsFor, forestMicrofaunaAt, forestMixLabel, forestPotentialAt, forestStandAt, forestTreeCopies,
    forestSnowDepthAt, forestSurveyAt, forestTypeFromIndex, forestTypeIndex,
    forestAgeScale, forestTreeForm, pickAgeClass, pickSpecies,
} from "../../js/world/forest-ecology.js";
import { foliageState, treeTiming } from "../../js/presentation/rendering/seasonal-foliage.js";

const standContext = (overrides = {}) => ({
    seed: 20261108, moisture: 0.62, temperature: 0.55, height: 0.5,
    climate: "temperate", forests: 52, stockRatio: 1, rockLine: 0.92,
    ...overrides,
});

test("forest species, formations and goods form a complete shared vocabulary", () => {
    assert.equal(FOREST_TYPE_IDS.length, 27);
    assert.deepEqual(Object.keys(FOREST_TYPES), FOREST_TYPE_IDS);
    for (const [id, species] of Object.entries(FOREST_SPECIES)) {
        assert.equal(species.id, id);
        assert.match(species.bark, /^#[0-9a-f]{6}$/i);
        assert.match(species.barkLight, /^#[0-9a-f]{6}$/i);
        assert.equal(species.summer.length, 2);
        assert.equal(species.autumn.length, 2);
        assert.ok(species.height > 0 && species.crown > 0 && species.trunk > 0);
        assert.ok(species.goods.length > 0);
    }
    for (const id of FOREST_TYPE_IDS) {
        const formation = FOREST_TYPES[id];
        assert.equal(formation.id, id);
        assert.ok(Object.keys(formation.species).length >= 5);
        for (const speciesId of Object.keys(formation.species)) {
            assert.ok(FOREST_SPECIES[speciesId], id + " references unknown species " + speciesId);
        }
        for (const good of formation.goods) assert.ok(FOREST_GOODS[good], id + " references unknown good " + good);
        assert.ok(formation.fauna.length > 0);
    }
    for (const id of FOREST_TYPE_IDS) {
        assert.equal(forestTypeFromIndex(forestTypeIndex(id)), id);
    }
    assert.equal(forestTypeFromIndex(0), null);
    assert.equal(forestTypeFromIndex(99), null);
});

test("the cheap forest gate matches the full stand on every sampled site", () => {
    for (const moisture of [0.1, 0.3, 0.35, 0.48, 0.62, 0.8, 0.95]) {
        for (const temperature of [0.2, 0.55, 0.8]) {
            for (const height of [0.2, 0.5, 0.8, 0.92, 0.96]) {
                for (let x = 0; x < 32; x += 7) {
                    const context = standContext({ moisture, temperature, height, seed: 101 });
                    const stand = forestStandAt(x + 0.5, 7.5, context);
                    const potential = forestPotentialAt({ moisture, temperature, height, forests: 52, rockLine: 0.92 });
                    assert.equal(potential, stand.forest, "gate mismatch at " + [moisture, temperature, height, x].join("/"));
                }
            }
        }
    }
});

test("dense and ancient stands get overlapping tree copies, open woods do not", () => {
    assert.equal(forestTreeCopies({ forest: false }), 0);
    assert.equal(forestTreeCopies({ forest: true, canopy: 0.3 }), 1);
    assert.equal(forestTreeCopies({ forest: true, canopy: 0.6 }), 2);
    assert.equal(forestTreeCopies({ forest: true, canopy: 0.8, ageClass: "ancient" }), 3);
    assert.equal(forestTreeCopies({ forest: true, canopy: 0.8, clearing: 0.4 }), 1);
});

test("forest stand generation is deterministic for the same seed and tile", () => {
    const first = forestStandAt(23.5, 17.5, standContext());
    const second = forestStandAt(23.5, 17.5, standContext());
    assert.deepEqual(second, first);
    assert.equal(first.forest, true);
    assert.ok(first.treeChance > 0);
    assert.ok(first.species.length >= 5);
    assert.ok(first.fauna.length > 0);
    assert.match(forestMixLabel(first), /·/);
    const otherSeed = forestStandAt(23.5, 17.5, standContext({ seed: 20261109 }));
    assert.notDeepEqual(otherSeed, first);
});

test("rock, water and dry open ground are not forest", () => {
    const rock = forestStandAt(4.5, 4.5, standContext({ height: 0.95, moisture: 0.9 }));
    assert.equal(rock.forest, false);
    assert.equal(rock.treeChance, 0);
    const dry = forestStandAt(4.5, 4.5, standContext({ moisture: 0.12 }));
    assert.equal(dry.forest, false);
    assert.equal(dry.treeChance, 0);
});

test("every broadleaf formation is reachable from documented site conditions", () => {
    const formations = new Set();
    for (const moisture of [0.35, 0.48, 0.53, 0.58, 0.66, 0.8]) {
        for (const temperature of [0.35, 0.55, 0.72]) {
            for (const height of [0.44, 0.54, 0.7, 0.9]) {
                for (let x = 0; x < 48; x += 5) {
                    for (let y = 0; y < 48; y += 7) {
                        const stand = forestStandAt(x + 0.5, y + 0.5, standContext({ moisture, temperature, height }));
                        if (stand.forest) formations.add(stand.type);
                    }
                }
            }
        }
    }
    for (const id of ["oakwood", "beechwood", "birchwood", "maplewood", "chestnut-grove",
        "linden-elm", "alluvial", "hillside", "mixed"]) {
        assert.ok(formations.has(id), "expected reachable formation " + id + " in " + [...formations]);
    }
});

test("age structure includes young, mature and ancient trees", () => {
    const maturePicks = new Set();
    for (const roll of [0.05, 0.3, 0.5, 0.8, 0.95]) maturePicks.add(pickAgeClass(FOREST_TYPES.beechwood, roll));
    assert.deepEqual([...maturePicks].sort(), ["ancient", "mature", "young"]);

    const ancient = forestStandAt(12.5, 12.5, standContext({ moisture: 0.55, seed: 9 }));
    const ancientPicks = new Set([0.1, 0.5, 0.9].map(roll => pickAgeClass({ ...ancient, ageClass: "ancient" }, roll)));
    assert.deepEqual([...ancientPicks].sort(), ["ancient", "mature"]);

    const young = pickAgeClass({ ...ancient, ageClass: "young" }, 0.1);
    assert.equal(young, "young");
    assert.ok(forestStandAt(3.5, 3.5, standContext()).ageScale > 0);
});

test("per-tree form varies inside one age class without becoming saved state", () => {
    const stand = forestStandAt(23.5, 17.5, standContext({ moisture: 0.55 }));
    assert.equal(stand.forest, true);
    const first = forestTreeForm(stand, 0.17);
    const second = forestTreeForm(stand, 0.83);
    assert.equal(first.ageScale, forestAgeScale(first.ageClass));
    assert.notEqual(first.heightScale, second.heightScale);
    assert.notEqual(first.trunkScale, second.trunkScale);
    assert.notEqual(first.lean, second.lean);
    assert.ok(first.heightScale >= 0.82 && first.heightScale <= 1.16);
    assert.ok(first.lean >= -1.3 && first.lean <= 1.3);
    assert.deepEqual(forestTreeForm(stand, 0.17), first, "the same tree roll must replay exactly");
    assert.equal(forestTreeForm({ forest: false }, 0.5).ageScale, 1);
    assert.equal(forestAgeScale("ancient"), 1.26);
});

test("diversity, sight, wetness and wind exposure are derived stand properties", () => {
    const stands = [];
    for (const moisture of [0.4, 0.58, 0.8]) {
        for (const temperature of [0.3, 0.55, 0.75]) {
            for (const height of [0.45, 0.7, 0.9]) {
                for (let x = 0; x < 40; x += 8) {
                    const stand = forestStandAt(x + 0.5, 7.5, standContext({ moisture, temperature, height }));
                    if (stand.forest) stands.push(stand);
                }
            }
        }
    }
    assert.ok(stands.length > 10);
    for (const stand of stands) {
        assert.ok(stand.speciesDiversity >= 0 && stand.speciesDiversity <= 1);
        assert.ok(stand.monoculture >= 0 && stand.monoculture <= 1);
        assert.ok(stand.sightRadius >= 2 && stand.sightRadius <= 10);
        assert.ok(stand.wetness >= 0 && stand.wetness <= 1);
        assert.ok(stand.windExposure >= 0 && stand.windExposure <= 1);
        assert.ok(stand.deadwood >= 0 && stand.deadwood <= 1);
        assert.equal(Number.isFinite(stand.structure.sapling), true);
    }
    assert.ok(stands.some(stand => stand.speciesDiversity > 0.55), "mixed stands need visible diversity");
    assert.ok(stands.some(stand => stand.windExposure > 0.35), "exposed high stands need wind exposure");
});

test("disturbance history produces fire, windthrow, disease and cutting", () => {
    const seen = new Set();
    for (let y = 0; y < 100; y++) {
        for (let x = 0; x < 100; x++) {
            const stand = forestStandAt(x + 0.5, y + 0.5, standContext({ moisture: 0.62 }));
            if (stand.forest) seen.add(stand.type);
        }
    }
    for (const id of ["burned", "windthrow", "diseased", "ancient", "regenerating"]) {
        assert.ok(seen.has(id), "expected disturbance formation " + id + " in " + [...seen]);
    }
    const cut = forestStandAt(23.5, 17.5, standContext({ stockRatio: 0.05 }));
    assert.equal(cut.type, "cutover");
    assert.equal(cut.disturbance, "cutover");
    const burned = forestStandAt(23.5, 17.5, standContext({ moisture: 0.62 }));
    assert.ok(["burned", "windthrow", "diseased", "ancient", "regenerating", "cutover", "oakwood", "beechwood",
        "maplewood", "linden-elm", "birchwood", "mixed", "chestnut-grove", "alluvial", "hillside"].includes(burned.type));
});

test("species composition selects every declared species with a valid roll", () => {
    for (const id of FOREST_TYPE_IDS) {
        const species = Object.entries(FOREST_TYPES[id].species).map(([speciesId, weight]) => ({ id: speciesId, weight }));
        const stand = { ...forestStandAt(23.5, 17.5, standContext()), species };
        const total = species.reduce((sum, entry) => sum + entry.weight, 0);
        let cursor = 0;
        const picked = new Set();
        for (const entry of species) {
            picked.add(pickSpecies(stand, (cursor + entry.weight * 0.5) / total));
            cursor += entry.weight;
        }
        for (const speciesId of Object.keys(FOREST_TYPES[id].species)) {
            assert.ok(picked.has(speciesId), id + " did not select " + speciesId);
        }
        for (const speciesId of picked) assert.ok(FOREST_SPECIES[speciesId]);
    }
});

test("new broadleaf species keep distinct seasonal leaf timings", () => {
    const drops = new Set();
    for (const species of ["oak", "beech", "birch", "maple", "chestnut", "linden", "elm", "alder"]) {
        const summer = foliageState(150, { seed: 0.5, species });
        const winter = foliageState(350, { seed: 0.5, species });
        assert.equal(summer.leaf, 1, species + " should be in full leaf in summer");
        if (species === "oak" || species === "beech") {
            assert.ok(winter.leaf >= 0.4, species + " is marcescent and keeps some winter leaves");
            assert.equal(winter.holding, true);
        } else {
            assert.ok(winter.leaf < 0.5, species + " should lose most of its leaves by midwinter");
        }
        const timing = treeTiming(0.5, species);
        drops.add(timing.dropStart);
    }
    assert.ok(drops.size >= 6, "species leaf fall should not share one timing");
});

test("seasonal forest goods and fauna follow the year", () => {
    const stand = forestStandAt(23.5, 17.5, standContext({ moisture: 0.42, temperature: 0.55 }));
    assert.equal(stand.forest, true);
    assert.equal(stand.type, "oakwood");
    const spring = forestGoodsFor(stand, 50);
    const autumn = forestGoodsFor(stand, 250);
    const winter = forestGoodsFor(stand, 350);
    assert.ok(spring.some(good => good.id === "herbs"));
    assert.ok(autumn.some(good => good.id === "acorns"));
    assert.ok(autumn.some(good => good.id === "mushrooms"));
    assert.ok(winter.every(good => !["berries", "linden-flower"].includes(good.id)));
    assert.ok(winter.some(good => good.id === "timber" || good.id === "firewood"));
    assert.ok(stand.goods.includes("hides"), "hunting-capable oakwood should expose hides");
    assert.ok(stand.goods.includes("beeswax"), "honey-bearing broadleaf woods should expose beeswax");
    assert.ok(["alluvial", "dry", "humus", "loam"].includes(stand.ground.soil));
    assert.ok(stand.ground.compaction >= 0 && stand.ground.compaction <= 1);
    assert.ok(stand.ground.huntingPressure >= 0 && stand.ground.huntingPressure <= 1);

    const winterFauna = [];
    for (const roll of [0.1, 0.35, 0.6, 0.85]) {
        winterFauna.push(...forestFaunaFor(stand, 350, "temperate", roll));
    }
    assert.ok(winterFauna.length > 0);
    for (const animal of winterFauna) {
        assert.ok(!["songbird", "butterfly", "ant", "bee"].includes(animal.id), "winter should not show " + animal.id);
        assert.ok(animal.label && animal.activity);
    }
    const summerFauna = [];
    for (const roll of [0.05, 0.25, 0.5, 0.75, 0.95]) {
        summerFauna.push(...forestFaunaFor(stand, 150, "temperate", roll));
    }
    assert.ok(summerFauna.some(animal => ["songbird", "butterfly", "bee"].includes(animal.id)));
});

test("every species names its own timber and a leaf silhouette", () => {
    const woods = new Set();
    const shapes = new Set();
    for (const [id, species] of Object.entries(FOREST_SPECIES)) {
        assert.ok(FOREST_GOODS[species.wood], id + " timber must be a known good");
        assert.equal(FOREST_GOODS[species.wood].category, "wood");
        assert.ok(!woods.has(species.wood), "species timber must be distinct");
        woods.add(species.wood);
        assert.ok(species.leafShape && typeof species.leafShape === "string");
        shapes.add(species.leafShape);
    }
    assert.equal(woods.size, Object.keys(FOREST_SPECIES).length);
    assert.ok(shapes.size >= 6, "leaf silhouettes should differ by species");
    for (const id of ["chanterelle", "porcini", "wild-garlic", "wood-sorrel", "wild-strawberry", "sloes", "crab-apples"]) {
        assert.ok(FOREST_GOODS[id], "expected forest good " + id);
    }
    const autumn = forestGoodsFor({
        goods: ["chanterelle", "porcini", "sloes", "crab-apples", "wild-garlic", "timber"],
        productivity: 0.9,
    }, 250);
    for (const id of ["chanterelle", "porcini", "sloes", "crab-apples"]) {
        assert.ok(autumn.some(good => good.id === id), "autumn should offer " + id);
    }
    assert.ok(!autumn.some(good => good.id === "wild-garlic"), "wild garlic is a spring green");
});

test("the dominant species contributes its timber to the stand ledger", () => {
    let checked = 0;
    for (let y = 0; y < 40; y += 4) {
        for (let x = 0; x < 40; x += 6) {
            const stand = forestStandAt(x + 0.5, y + 0.5, standContext({ moisture: 0.55 }));
            if (!stand.forest) continue;
            checked++;
            assert.ok(stand.goods.includes(FOREST_SPECIES[stand.dominantSpecies].wood));
            assert.ok(forestGoodsFor(stand, 250).some(good => good.id === FOREST_SPECIES[stand.dominantSpecies].wood),
                "species timber must reach the all-season gather list");
            assert.ok(forestGoodsFor(stand, 350).some(good => good.category === "wood"), "wood stays workable in winter");
        }
    }
    assert.ok(checked > 10);
});

test("a linden/elm stand is labelled by its dominant linden or elm share", () => {
    let found = 0;
    for (const moisture of [0.35, 0.48, 0.53, 0.58, 0.66, 0.8]) {
        for (const height of [0.44, 0.54, 0.7, 0.9]) {
            for (let x = 0; x < 48; x += 5) {
                for (let y = 0; y < 48; y += 7) {
                    const stand = forestStandAt(x + 0.5, y + 0.5, standContext({ moisture, height }));
                    if (!stand.forest || stand.type !== "linden-elm") continue;
                    found++;
                    assert.ok(["linden", "elm"].includes(stand.subtype));
                    assert.equal(stand.label, stand.subtype === "elm" ? "Elm Stand" : "Linden Stand");
                }
            }
        }
    }
    assert.ok(found > 0, "the sampled realm should contain a linden/elm stand");
});

test("microfauna follows deadwood, flowers and season", () => {
    const stand = forestStandAt(0.5, 0.5, standContext({ moisture: 0.66 }));
    assert.equal(stand.forest, true);
    const summer = forestMicrofaunaAt(stand, 150);
    const winter = forestMicrofaunaAt(stand, 350);
    assert.ok(summer.length > 0 && summer.length <= 5);
    assert.ok(winter.length > 0 && winter.length <= 5);
    for (const entry of summer) {
        assert.ok(entry.label && ["insect", "small"].includes(entry.group));
        assert.ok(entry.count >= 1 && entry.count <= 6);
    }
    assert.ok(!winter.some(entry => ["ant", "butterfly", "bee"].includes(entry.id)), "winter hides flying insects");
    const deadwood = forestMicrofaunaAt({ ...stand, ageClass: "ancient", ground: { ...stand.ground, logs: 0.9 } }, 150);
    const beetle = deadwood.find(entry => entry.id === "beetle");
    assert.ok(beetle && beetle.count > (summer.find(entry => entry.id === "beetle")?.count || 0));
    assert.deepEqual(forestMicrofaunaAt({ forest: false }, 150), []);
});

test("forest survey exposes a complete tile profile and rejects open ground", () => {
    const survey = forestSurveyAt(23.5, 17.5, { ...standContext(), dayOfYear: 250, roll: 0.4 });
    assert.ok(survey);
    assert.equal(survey.forest, true);
    assert.ok(survey.label);
    assert.ok(survey.goods.some(good => good.id === "timber"));
    assert.ok(survey.fauna.length > 0);
    assert.equal(survey.goods[0].abundance >= survey.goods[survey.goods.length - 1].abundance, true);
    assert.ok(survey.snowDepth >= 0 && survey.snowDepth <= 1);
    assert.ok(survey.snowDepthCm >= 0 && survey.snowDepthCm <= 140);
    assert.ok(survey.exposure >= 0 && survey.exposure <= 1);
    assert.ok(survey.fireRisk >= 0 && survey.fireRisk <= 1);
    assert.ok(survey.pestRisk >= 0 && survey.pestRisk <= 1);
    assert.ok(survey.structure.herb >= 0 && survey.structure.herb <= 1);
    assert.ok(survey.structure.deadwood >= 0 && survey.structure.deadwood <= 1);
    assert.ok(survey.browsingPressure >= 0 && survey.browsingPressure <= 1);
    assert.ok(survey.predatorPressure >= 0 && survey.predatorPressure <= 1);
    assert.ok(survey.speciesDiversity >= 0 && survey.speciesDiversity <= 1);
    assert.ok(survey.sightRadius >= 2 && survey.sightRadius <= 10);
    assert.ok(survey.windExposure >= 0 && survey.windExposure <= 1);
    assert.ok(survey.wetness >= 0 && survey.wetness <= 1);
    assert.ok(survey.deadwood >= 0 && survey.deadwood <= 1);
    assert.ok([true, false].includes(survey.treeline));
    const deep = forestSnowDepthAt({ forest: true, snowPotential: 0.9 }, 350);
    const shallow = forestSnowDepthAt({ forest: true, snowPotential: 0.2 }, 350);
    assert.ok(deep.cm > shallow.cm, "exposed high ground holds a deeper snow pack");
    assert.equal(forestSurveyAt(4.5, 4.5, { ...standContext(), moisture: 0.1 }), null);
});
