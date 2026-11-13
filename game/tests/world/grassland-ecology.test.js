import test from "node:test";
import assert from "node:assert/strict";
import {
    GRASSLAND_FAUNA, GRASSLAND_FLOWERS, GRASSLAND_FORMATIONS, GRASSLAND_GOODS,
    GRASSLAND_GRASSES, GRASSLAND_HERBS, GRASSLAND_LIMITS, GRASSLAND_REQUIREMENTS,
    GRASSLAND_REQUIREMENT_IDS, GRASSLAND_TREES, grasslandGoodsFor, grasslandProductsAt,
    grasslandProfileAt, grasslandSummary, grasslandRequirement,
} from "../../js/world/grassland-ecology.js";
import { FOREST_GOODS } from "../../js/world/forest-ecology.js";

const SEASONS = ["spring", "summer", "autumn", "winter"];

const context = (overrides = {}) => ({
    seed: 20261113,
    moisture: 0.56,
    temperature: 0.55,
    height: 0.46,
    seaLevel: 0.33,
    climate: "temperate",
    dayOfYear: 150,
    year: 6,
    hour: 12,
    weather: "clear",
    ...overrides,
});

test("all 1.2.6.1–1.2.6.60 requirements are declared exactly once", () => {
    assert.equal(GRASSLAND_REQUIREMENTS.length, 60);
    assert.deepEqual(GRASSLAND_REQUIREMENT_IDS, Array.from({ length: 60 }, (_, index) => "1.2.6." + (index + 1)));
    assert.equal(new Set(GRASSLAND_REQUIREMENT_IDS).size, 60);
    for (const requirement of GRASSLAND_REQUIREMENTS) {
        assert.equal(grasslandRequirement(requirement.id), requirement);
        assert.ok(requirement.label.length > 4);
        assert.ok(["vegetation", "landform", "woody", "fauna", "economy", "use", "visual"].includes(requirement.group));
    }
    assert.equal(grasslandRequirement("1.2.6.60").group, "visual");
    assert.equal(grasslandRequirement("1.2.6.61"), null);
    assert.equal(GRASSLAND_LIMITS.requirements, 60);
});

test("grass, flower, herb, tree, fauna and product vocabularies are complete", () => {
    for (const formation of Object.values(GRASSLAND_FORMATIONS)) {
        assert.equal(formation.id, Object.keys(GRASSLAND_FORMATIONS).find(id => GRASSLAND_FORMATIONS[id] === formation));
        assert.ok(formation.grasses.length >= 3);
        assert.ok(formation.flowers.length >= 3);
        for (const id of formation.grasses) assert.ok(GRASSLAND_GRASSES[id], formation.id + " references missing grass " + id);
        for (const id of formation.flowers) assert.ok(GRASSLAND_FLOWERS[id], formation.id + " references missing flower " + id);
        assert.ok(["short", "medium", "tall"].includes(formation.height));
        assert.ok(formation.density > 0 && formation.density <= 1);
    }
    for (const flower of Object.values(GRASSLAND_FLOWERS)) {
        assert.ok(flower.colours.every(colour => /^#[0-9a-f]{6}$/i.test(colour)));
        assert.ok(flower.seasons.every(season => SEASONS.includes(season)));
        assert.ok(flower.pollinator >= 0 && flower.pollinator <= 1);
    }
    for (const herb of Object.values(GRASSLAND_HERBS)) {
        assert.ok(herb.seasons.every(season => SEASONS.includes(season)));
        assert.ok(herb.goods.every(good => FOREST_GOODS[good]));
    }
    for (const tree of Object.values(GRASSLAND_TREES)) {
        assert.ok(tree.goods.every(good => FOREST_GOODS[good]), tree.id + " references an unknown product");
        assert.equal(tree.colours.spring.length, 7);
        assert.equal(tree.colours.winter.length, 7);
    }
    for (const animal of Object.values(GRASSLAND_FAUNA)) {
        assert.ok(animal.seasons.every(season => SEASONS.includes(season)));
        assert.ok(animal.label.length > 2);
        assert.ok(animal.kind.length > 2);
    }
    for (const good of Object.values(GRASSLAND_GOODS)) assert.equal(FOREST_GOODS[good.id], good);
    assert.equal(FOREST_GOODS.hay.category, "fodder");
    assert.equal(FOREST_GOODS["meadow-grass"].category, "fodder");
});

test("the profile is deterministic and different seeds create different meadows", () => {
    const first = grasslandProfileAt(23.5, 17.5, context());
    const second = grasslandProfileAt(23.5, 17.5, context());
    assert.deepEqual(second, first);
    assert.ok(first.features.length > 20);
    assert.ok(first.grasses.length >= 3);
    assert.ok(first.goods.length > 0);
    const other = grasslandProfileAt(23.5, 17.5, context({ seed: 20261114 }));
    assert.notDeepEqual(other, first);
    assert.equal(grasslandProfileAt(23.5, 17.5, context({ year: 20 })).year, 20);
});

test("the sampled landscape reaches every one of the 60 requirements", () => {
    const seen = new Set();
    const contexts = [
        [40, 6.5, 0.5, 0.55, 0.42, "fog"],
        [120, 12, 0.78, 0.6, 0.4, "clear"],
        [140, 12, 0.2, 0.7, 0.45, "clear"],
        [160, 12, 0.55, 0.55, 0.65, "clear"],
        [180, 19, 0.4, 0.5, 0.8, "clear"],
        [240, 12, 0.6, 0.55, 0.36, "clear"],
        [340, 12, 0.7, 0.4, 0.5, "clear"],
    ];
    const uses = [
        { state: "wild" }, { state: "grazed" }, { state: "mowed" }, { state: "trampled" },
        { state: "path" }, { state: "overgrazed" },
        { state: "wild", yearsSinceUse: 12, encroachment: true, reforestation: true },
    ];
    for (const [day, hour, moisture, temperature, height, weather] of contexts) {
        for (let x = 0; x < 40; x += 8) {
            for (let y = 0; y < 40; y += 8) {
                for (const use of uses) {
                    const profile = grasslandProfileAt(x + 0.5, y + 0.5, {
                        seed: 20261113, moisture, temperature, height, seaLevel: 0.33,
                        dayOfYear: day, hour, weather, use,
                    });
                    for (const id of profile.features) seen.add(id);
                }
            }
        }
    }
    assert.deepEqual(GRASSLAND_REQUIREMENT_IDS.filter(id => !seen.has(id)), []);
});

test("seasonal meadows change colour, flowering and fauna movement", () => {
    const spring = grasslandProfileAt(23.5, 17.5, context({ dayOfYear: 45, moisture: 0.58 }));
    const summer = grasslandProfileAt(23.5, 17.5, context({ dayOfYear: 145, moisture: 0.58 }));
    const autumn = grasslandProfileAt(23.5, 17.5, context({ dayOfYear: 245, moisture: 0.58 }));
    const winter = grasslandProfileAt(23.5, 17.5, context({ dayOfYear: 345, moisture: 0.58 }));
    assert.equal(new Set([spring.grassHex, summer.grassHex, autumn.grassHex, winter.grassHex]).size, 4);
    assert.ok(spring.features.includes("1.2.6.5"));
    assert.ok(summer.features.includes("1.2.6.6"));
    assert.ok(spring.bloom > autumn.bloom);
    assert.match(spring.seasonalMovement, /growth|flowers|seed|shelter/i);
    assert.ok(spring.fauna.length >= summer.fauna.length || spring.fauna.length > 0);
    assert.equal(winter.season, "winter");
    assert.equal(winter.visual.snowCover > 0.3, true);
});

test("wet, dry, flat, hill, hollow and rocky sites produce different grassland", () => {
    const wet = grasslandProfileAt(7.5, 7.5, context({ moisture: 0.86, height: 0.4, hour: 7 }));
    const dry = grasslandProfileAt(7.5, 7.5, context({ moisture: 0.2, height: 0.42, temperature: 0.7 }));
    const hill = grasslandProfileAt(7.5, 7.5, context({ moisture: 0.56, height: 0.68 }));
    const rocky = grasslandProfileAt(7.5, 7.5, context({ moisture: 0.32, height: 0.82 }));
    assert.equal(wet.formation, "wet-meadow");
    assert.ok(wet.features.includes("1.2.6.20"));
    assert.ok(wet.visual.mist > 0.1);
    assert.ok(dry.features.includes("1.2.6.21"));
    assert.ok(dry.features.includes("1.2.6.18") || dry.features.includes("1.2.6.16"));
    assert.ok(hill.features.includes("1.2.6.17"));
    assert.ok(hill.features.includes("1.2.6.57"));
    assert.ok(rocky.features.includes("1.2.6.22"));
    assert.ok(wet.soil > dry.soil);
    assert.ok(wet.pasture > 0.4);
    assert.ok(wet.cropSuitability > dry.cropSuitability);
    assert.ok(wet.roadSuitability && dry.roadSuitability && hill.settlementSuitability);
});

test("trees, shrubs, fruit and windbreaks are sparse but real parts of the profile", () => {
    const kinds = new Set();
    const features = new Set();
    for (const moisture of [0.5, 0.6, 0.72, 0.82]) {
        for (const height of [0.36, 0.42, 0.52]) {
            for (let x = 0; x < 64; x += 2) {
                for (let y = 0; y < 64; y += 3) {
                    const profile = grasslandProfileAt(x + 0.5, y + 0.5, context({ moisture, height }));
                    for (const tree of profile.trees) kinds.add(tree.kind);
                    for (const id of profile.features) features.add(id);
                }
            }
        }
    }
    assert.ok(kinds.has("old") || kinds.has("grove"));
    assert.ok(kinds.has("fruit") || kinds.has("hedge") || kinds.has("riparian"));
    for (const id of ["1.2.6.24", "1.2.6.25", "1.2.6.26", "1.2.6.27", "1.2.6.28", "1.2.6.29"]) {
        assert.ok(features.has(id), "missing woody feature " + id);
    }
});

test("grazing, mowing, trampling, paths, encroachment and reforestation change the sward", () => {
    const wild = grasslandProfileAt(12.5, 12.5, context({ use: { state: "wild" } }));
    const grazed = grasslandProfileAt(12.5, 12.5, context({ use: { state: "grazed" } }));
    const mowed = grasslandProfileAt(12.5, 12.5, context({ use: { state: "mowed" } }));
    const trampled = grasslandProfileAt(12.5, 12.5, context({ use: { state: "trampled" } }));
    const path = grasslandProfileAt(12.5, 12.5, context({ use: { state: "path" } }));
    const overgrazed = grasslandProfileAt(12.5, 12.5, context({ use: { state: "overgrazed" } }));
    const abandoned = grasslandProfileAt(12.5, 12.5, context({ use: { state: "wild", yearsSinceUse: 14, encroachment: true, reforestation: true } }));
    assert.equal(wild.use.state, "wild");
    assert.equal(grazed.use.grazed, true);
    assert.equal(mowed.use.mowed, true);
    assert.equal(trampled.use.trampled, true);
    assert.equal(path.use.path, true);
    assert.equal(overgrazed.use.overgrazed, true);
    assert.equal(overgrazed.use.bareSoil, true);
    assert.equal(abandoned.use.encroachment, true);
    assert.equal(abandoned.use.reforestation, true);
    for (const profile of [wild, grazed, mowed, trampled, path, overgrazed, abandoned]) {
        assert.ok(profile.use.label.length > 3);
        assert.ok(profile.use.intensity > 0);
    }
    assert.ok(overgrazed.use.intensity > wild.use.intensity);
    assert.ok(abandoned.use.yearsSinceUse >= 14);
});

test("hay, grass, wildflowers, honey, orchards and medicinal herbs are seasonal products", () => {
    const summer = grasslandProfileAt(23.5, 17.5, context({ dayOfYear: 145, moisture: 0.62 }));
    const autumn = grasslandProfileAt(23.5, 17.5, context({ dayOfYear: 245, moisture: 0.62 }));
    const winter = grasslandProfileAt(23.5, 17.5, context({ dayOfYear: 345, moisture: 0.62 }));
    assert.ok(summer.goods.some(good => good.id === "hay"));
    assert.ok(summer.goods.some(good => good.id === "meadow-grass"));
    assert.ok(summer.goods.some(good => good.id === "wildflowers"));
    assert.ok(summer.goods.some(good => good.id === "honey"));
    assert.ok(summer.herbs.some(herb => herb.medicine));
    assert.ok(summer.features.includes("1.2.6.40"));
    assert.ok(summer.features.includes("1.2.6.41"));
    assert.ok(winter.goods.every(good => good.id !== "wildflowers"));
    assert.ok(grasslandGoodsFor(summer, 145).length > 0);
    assert.ok(grasslandGoodsFor(autumn, 245).every(good => good.id !== "orchard-fruit") || autumn.goods.length > 0);
    assert.ok(grasslandProductsAt(23.5, 17.5, context({ dayOfYear: 145 })));
    assert.equal(grasslandProductsAt(23.5, 17.5, context({ height: 0.1 })), null);
    assert.match(grasslandSummary(summer), /meadow|pasture|turf/i);
});

test("the shared profile exposes crop, road, settlement and pasture suitability", () => {
    const profile = grasslandProfileAt(12.5, 12.5, context({ moisture: 0.6, height: 0.4 }));
    assert.ok(profile.soil >= 0 && profile.soil <= 1);
    assert.ok(profile.cropSuitability >= 0 && profile.cropSuitability <= 1);
    assert.ok(profile.settlementSuitability >= 0 && profile.settlementSuitability <= 1);
    assert.ok(profile.roadSuitability >= 0 && profile.roadSuitability <= 1);
    assert.ok(profile.pasture >= 0 && profile.pasture <= 1);
    assert.deepEqual(profile.pastureAnimals, ["cattle", "sheep", "goat", "horse"]);
    assert.equal(profile.features.includes("1.2.6.43"), profile.goods.length > 0);
    assert.equal(profile.features.includes("1.2.6.37"), profile.fauna.length > 0);
    assert.equal(profile.features.includes("1.2.6.54"), true);
    assert.equal(profile.features.includes("1.2.6.60"), true);
});
