import test from "node:test";
import assert from "node:assert/strict";
import {
    isSteppeSite, STEPPE_FAUNA, STEPPE_FLOWERS, STEPPE_FORMATIONS, STEPPE_GOODS,
    STEPPE_GRASSES, STEPPE_HERBS, STEPPE_LIMITS, STEPPE_REQUIREMENTS,
    STEPPE_REQUIREMENT_IDS, STEPPE_SHRUBS, STEPPE_TREES, steppeGoodsFor,
    steppePotentialAt, steppeProductsAt, steppeProfileAt, steppeRequirement,
    steppeSummary,
} from "../../js/world/steppe-ecology.js";
import { FOREST_GOODS } from "../../js/world/forest-ecology.js";

const SEASONS = ["spring", "summer", "autumn", "winter"];
const context = (overrides = {}) => ({
    seed: 20261113,
    moisture: 0.28,
    temperature: 0.72,
    height: 0.42,
    seaLevel: 0.33,
    climate: "arid",
    aridity: 78,
    dayOfYear: 150,
    year: 6,
    hour: 13,
    weather: "clear",
    wind: 1.1,
    use: { state: "wild" },
    ...overrides,
});

test("all 1.2.7.1–1.2.7.56 requirements are declared exactly once", () => {
    assert.equal(STEPPE_REQUIREMENTS.length, 56);
    assert.deepEqual(STEPPE_REQUIREMENT_IDS, Array.from({ length: 56 }, (_, index) => "1.2.7." + (index + 1)));
    assert.equal(new Set(STEPPE_REQUIREMENT_IDS).size, 56);
    const groups = ["vegetation", "landform", "climate", "fauna", "economy", "strategy", "hazard"];
    for (const requirement of STEPPE_REQUIREMENTS) {
        assert.equal(steppeRequirement(requirement.id), requirement);
        assert.ok(requirement.label.length > 4);
        assert.ok(groups.includes(requirement.group), requirement.id + " has an unknown group");
    }
    assert.equal(steppeRequirement("1.2.7.56").group, "hazard");
    assert.equal(steppeRequirement("1.2.7.57"), null);
    assert.equal(STEPPE_LIMITS.requirements, 56);
});

test("steppe formations, flora, fauna and products form a complete vocabulary", () => {
    for (const formation of Object.values(STEPPE_FORMATIONS)) {
        assert.equal(formation.id, Object.keys(STEPPE_FORMATIONS).find(id => STEPPE_FORMATIONS[id] === formation));
        assert.ok(formation.grasses.length >= 2);
        assert.ok(formation.shrubs.length >= 1);
        assert.ok(formation.flowers.length >= 1);
        assert.ok(["short", "medium", "tall"].includes(formation.height));
        assert.ok(formation.density > 0 && formation.density <= 1);
        for (const id of formation.grasses) assert.ok(STEPPE_GRASSES[id], formation.id + " references missing grass " + id);
        for (const id of formation.shrubs) assert.ok(STEPPE_SHRUBS[id], formation.id + " references missing shrub " + id);
        for (const id of formation.flowers) assert.ok(STEPPE_FLOWERS[id], formation.id + " references missing flower " + id);
        for (const id of formation.trees || []) assert.ok(STEPPE_TREES[id], formation.id + " references missing tree " + id);
    }
    for (const flower of Object.values(STEPPE_FLOWERS)) {
        assert.ok(flower.colours.every(colour => /^#[0-9a-f]{6}$/i.test(colour)));
        assert.ok(flower.seasons.every(season => SEASONS.includes(season)));
        assert.ok(flower.pollinator >= 0 && flower.pollinator <= 1);
    }
    for (const herb of Object.values(STEPPE_HERBS)) {
        assert.ok(herb.seasons.every(season => SEASONS.includes(season)));
        assert.ok(herb.colour.startsWith("#"));
    }
    for (const shrub of Object.values(STEPPE_SHRUBS)) {
        assert.ok(shrub.colours.every(colour => /^#[0-9a-f]{6}$/i.test(colour)));
        for (const good of shrub.goods || []) assert.ok(FOREST_GOODS[good], shrub.id + " references unknown good " + good);
    }
    for (const tree of Object.values(STEPPE_TREES)) {
        assert.ok(tree.goods.every(good => FOREST_GOODS[good]), tree.id + " references an unknown product");
        for (const season of SEASONS) assert.equal(tree.colours[season].length, 7);
    }
    for (const animal of Object.values(STEPPE_FAUNA)) {
        assert.ok(animal.seasons.every(season => SEASONS.includes(season)));
        assert.ok(animal.kind.length > 2);
        assert.ok(animal.label.length > 2);
    }
    for (const good of Object.values(STEPPE_GOODS)) assert.equal(FOREST_GOODS[good.id], good);
    assert.equal(FOREST_GOODS["steppe-grass"].category, "fodder");
    assert.equal(FOREST_GOODS.wool.category, "gather");
    assert.ok(FOREST_GOODS.salt);
});

test("the profile is deterministic and every exposed value is bounded", () => {
    const first = steppeProfileAt(23.5, 17.5, context());
    const second = steppeProfileAt(23.5, 17.5, context());
    assert.deepEqual(second, first);
    assert.ok(first.features.length > 20);
    assert.ok(first.grassHex.startsWith("#"));
    assert.ok(first.groundHex.startsWith("#"));
    assert.equal(steppeProfileAt(23.5, 17.5, context({ year: 20 })).year, 20);
    const other = steppeProfileAt(23.5, 17.5, context({ seed: 20261114, moisture: 0.36 }));
    assert.notDeepEqual(other, first);
    for (const profile of [first, other]) {
        for (const key of ["moisture", "temperature", "height", "pasture", "pastureArea", "nomadism", "horseBreeding", "sightlines", "cover", "cropSuitability"]) {
            assert.ok(Number.isFinite(profile[key]), key + " must be finite");
            assert.ok(profile[key] >= 0 && profile[key] <= 1, key + " must be bounded");
        }
        for (const hazard of Object.values(profile.hazards)) {
            assert.ok(Number.isFinite(hazard) && hazard >= 0 && hazard <= 1);
        }
        for (const value of Object.values(profile.soil)) {
            assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
        }
        assert.ok(profile.fauna.length <= STEPPE_LIMITS.maxFauna);
        assert.ok(profile.flowers.length <= STEPPE_LIMITS.maxFlowers);
        assert.ok(profile.goods.length <= STEPPE_LIMITS.maxGoods);
    }
});

test("the sampled landscape reaches every one of the 56 requirements", () => {
    const seen = new Set();
    const uses = [
        { state: "wild" }, { state: "grazed" }, { state: "overgrazed" },
        { state: "trampled" }, { state: "mowed" }, { state: "path" },
    ];
    for (const day of [20, 160, 260, 360]) {
        for (let x = 4; x < 72; x += 8) {
            for (let y = 4; y < 72; y += 8) {
                for (const use of uses) {
                    const base = context({
                        moisture: 0.19 + ((x * 7 + y * 13) % 23) / 100,
                        temperature: 0.64 + ((x + y) % 13) / 60,
                        height: 0.36 + ((x * 3 + y * 5) % 27) / 100,
                        dayOfYear: day,
                        use,
                    });
                    if (!isSteppeSite(x + 0.5, y + 0.5, base)) continue;
                    const profile = steppeProfileAt(x + 0.5, y + 0.5, base);
                    for (const id of profile.features) seen.add(id);
                }
            }
        }
    }
    assert.deepEqual(STEPPE_REQUIREMENT_IDS.filter(id => !seen.has(id)), []);
});

test("steppe is an arid, open formation rather than a wet meadow", () => {
    const steppe = steppeProfileAt(14.5, 12.5, context({ moisture: 0.24 }));
    const temperate = steppeProfileAt(14.5, 12.5, context({ climate: "temperate", aridity: 30 }));
    assert.ok(isSteppeSite(14.5, 12.5, context({ moisture: 0.24 })));
    assert.equal(isSteppeSite(14.5, 12.5, context({ climate: "temperate", aridity: 20 })), false);
    assert.equal(isSteppeSite(14.5, 12.5, context({ height: 0.2 })), false);
    assert.equal(temperate.climate, "temperate");
    assert.ok(steppe.landform.plain || steppe.landform.hill);
    assert.ok(steppe.sightlines > 0.35);
    assert.ok(steppe.visual.haze >= 0);
    assert.ok(steppe.soil.bare > 0.2);
    assert.ok(steppe.crops.includes("millet"));
});

test("the steppe changes through spring, summer, autumn and winter", () => {
    const spring = steppeProfileAt(31.5, 21.5, context({ dayOfYear: 20, moisture: 0.36 }));
    const summer = steppeProfileAt(31.5, 21.5, context({ dayOfYear: 150, moisture: 0.36 }));
    const autumn = steppeProfileAt(31.5, 21.5, context({ dayOfYear: 250, moisture: 0.36 }));
    const winter = steppeProfileAt(31.5, 21.5, context({ dayOfYear: 350, moisture: 0.36 }));
    assert.equal(spring.season, "spring");
    assert.equal(summer.season, "summer");
    assert.equal(autumn.season, "autumn");
    assert.equal(winter.season, "winter");
    assert.ok(spring.features.includes("1.2.7.22"));
    assert.ok(spring.bloom > autumn.bloom);
    assert.ok(summer.features.includes("1.2.7.23"));
    assert.ok(winter.visual.snowCover > 0.3);
    assert.ok(winter.features.includes("1.2.7.24"));
    assert.ok(new Set([spring.grassHex, summer.grassHex, autumn.grassHex, winter.grassHex]).size === 4);
    assert.match(spring.seasonalMovement, /growth|water|seed|shelter/i);
});

test("salt, sand, black earth, hills and hollows make distinct ground", () => {
    const salt = steppeProfileAt(9.5, 9.5, context({ moisture: 0.14, height: 0.38 }));
    const fertile = steppeProfileAt(9.5, 9.5, context({ moisture: 0.46, height: 0.4 }));
    const hill = steppeProfileAt(9.5, 9.5, context({ moisture: 0.3, height: 0.66 }));
    assert.ok(salt.soil.salt > 0.3);
    assert.ok(salt.features.includes("1.2.7.15"));
    assert.ok(fertile.soil.chernozem > 0.2);
    assert.ok(fertile.cropSuitability > salt.cropSuitability);
    assert.ok(hill.landform.hill);
    assert.ok(hill.sightlines > 0.4);
    assert.ok(hill.features.includes("1.2.7.12"));
    assert.ok(salt.groundHex !== fertile.groundHex || salt.grassHex !== fertile.grassHex);
});

test("wildlife, herds, pasture, horse breeding and hazards are linked", () => {
    const profile = steppeProfileAt(12.5, 12.5, context({ moisture: 0.34, use: { state: "wild" } }));
    assert.ok(profile.pasture > 0.2);
    assert.ok(profile.horseBreeding > 0.2);
    assert.ok(profile.fauna.some(animal => animal.migratory), "a herd must be present");
    assert.ok(profile.features.includes("1.2.7.25"));
    assert.ok(profile.features.includes("1.2.7.32"));
    assert.ok(profile.hazards.waterScarcity > 0.2);
    const overgrazed = steppeProfileAt(12.5, 12.5, context({ moisture: 0.34, use: { state: "overgrazed" } }));
    assert.ok(overgrazed.hazards.overgrazing > profile.hazards.overgrazing);
    assert.ok(overgrazed.hazards.soilDegradation > 0);
    assert.ok(overgrazed.features.includes("1.2.7.53"));
});

test("steppe products use the shared forest-goods ledger and seasonal availability", () => {
    const summer = steppeProfileAt(23.5, 17.5, context({ dayOfYear: 150, moisture: 0.42 }));
    const winter = steppeProfileAt(23.5, 17.5, context({ dayOfYear: 350, moisture: 0.42 }));
    assert.ok(summer.goods.some(good => good.id === "steppe-grass"));
    assert.ok(summer.goods.some(good => good.id === "hay") || summer.pasture < 0.42);
    assert.ok(steppeGoodsFor(summer, 150).length > 0);
    assert.ok(steppeGoodsFor(winter, 350).every(good => good.id !== "wildflowers"));
    assert.equal(steppeProductsAt(23.5, 17.5, context({ height: 0.1 })), null);
    const products = steppeProductsAt(23.5, 17.5, context({ dayOfYear: 150 }));
    assert.ok(products);
    assert.ok(products.goods.every(good => FOREST_GOODS[good.id]));
    assert.match(steppeSummary(summer), /steppe|pasture|grazed|cover/i);
});

test("the steppe potential rejects forests, sea and cool wet climates", () => {
    assert.equal(steppePotentialAt(1, 1, context({ climate: "temperate", aridity: 20 })), 0);
    assert.equal(steppePotentialAt(1, 1, context({ height: 0.1 })), 0);
    assert.ok(steppePotentialAt(1, 1, context()) > 0);
    assert.ok(steppePotentialAt(1, 1, context({ climate: "mediterranean", aridity: 60 })) > 0);
});
