import test from "node:test";
import assert from "node:assert/strict";
import {
    DESERT_FAUNA, DESERT_FLOWERS, DESERT_FORMATIONS, DESERT_GOODS,
    DESERT_GRASSES, DESERT_HERBS, DESERT_LIMITS, DESERT_PALMS,
    DESERT_REQUIREMENTS, DESERT_REQUIREMENT_IDS, DESERT_SANDS,
    DESERT_SHRUBS, DESERT_SUCCULENTS, desertGoodsFor, desertPotentialAt,
    desertProductsAt, desertProfileAt, desertRequirement, desertSummary,
    isDesertSite,
} from "../../js/world/desert-ecology.js";
import { FOREST_GOODS } from "../../js/world/forest-ecology.js";
import { forestDeliveryChannel } from "../../js/systems/forest-gathering.js";

const SEASONS = ["spring", "summer", "autumn", "winter"];
const BASE = Object.freeze({
    seed: 20261113,
    seaLevel: 0.33,
    climate: "arid",
    aridity: 82,
    year: 7,
    use: { state: "wild" },
});
const context = (overrides = {}) => ({
    ...BASE,
    moisture: 0.42,
    temperature: 0.68,
    height: 0.4,
    dayOfYear: 140,
    hour: 2,
    weather: "clear",
    wind: 1.1,
    ...overrides,
});

// These ten deterministic tiles are a compact ecological survey. Between them
// they reach every one of the 75 requirements, all ten formations, all four
// sand colours and all five dune types.
const SURVEY = Object.freeze([
    { x: 8.5, y: 7.5, formation: "dry-basin", overrides: { moisture: 0.42, temperature: 0.68, height: 0.4, dayOfYear: 140, hour: 2, weather: "storm", wind: 2 } },
    { x: 0.5, y: 9.5, formation: "mountain-desert", overrides: { moisture: 0.03, temperature: 0.42, height: 0.74, dayOfYear: 40, hour: 2, weather: "rain" } },
    { x: 0.5, y: 9.5, formation: "cold-desert", overrides: { moisture: 0.26, temperature: 0.2, height: 0.34, dayOfYear: 40, hour: 2 } },
    { x: 7.5, y: 0.5, formation: "gravel-desert", overrides: { moisture: 0.03, temperature: 0.52, height: 0.34, dayOfYear: 40, hour: 2 } },
    { x: 8.5, y: 8.5, formation: "sand-sea", overrides: { moisture: 0.03, temperature: 0.52, height: 0.5, dayOfYear: 40, hour: 2 } },
    { x: 0.5, y: 5.5, formation: "semi-desert", overrides: { moisture: 0.42, temperature: 0.68, height: 0.34, dayOfYear: 40, hour: 2 } },
    { x: 0.5, y: 8.5, formation: "dune-field", overrides: { moisture: 0.34, temperature: 0.52, height: 0.5, dayOfYear: 40, hour: 2 } },
    { x: 7.5, y: 0.5, formation: "pebble-plain", overrides: { moisture: 0.18, temperature: 0.52, height: 0.34, dayOfYear: 40, hour: 2 } },
    { x: 0.5, y: 0.5, formation: "rock-desert", overrides: { moisture: 0.02, temperature: 0.55, height: 0.65, dayOfYear: 140, hour: 13 } },
    { x: 0.5, y: 32.5, formation: "salt-flat", overrides: { moisture: 0.02, temperature: 0.55, height: 0.45, dayOfYear: 140, hour: 13 } },
]);

const surveyProfile = entry => desertProfileAt(entry.x, entry.y, context(entry.overrides));

test("all 1.2.8.1–1.2.8.75 requirements are declared exactly once", () => {
    assert.equal(DESERT_REQUIREMENTS.length, 75);
    assert.deepEqual(DESERT_REQUIREMENT_IDS, Array.from({ length: 75 }, (_, index) => "1.2.8." + (index + 1)));
    assert.equal(new Set(DESERT_REQUIREMENT_IDS).size, 75);
    const groups = ["landform", "visual", "vegetation", "water", "settlement", "fauna", "economy", "climate", "strategy"];
    for (const requirement of DESERT_REQUIREMENTS) {
        assert.equal(desertRequirement(requirement.id), requirement);
        assert.ok(requirement.label.length > 4);
        assert.ok(groups.includes(requirement.group), requirement.id + " has an unknown group");
    }
    assert.equal(desertRequirement("1.2.8.1").key, "sand-desert");
    assert.equal(desertRequirement("1.2.8.75").group, "economy");
    assert.equal(desertRequirement("1.2.8.76"), null);
    assert.equal(DESERT_LIMITS.requirements, 75);
});

test("all desert formations, flora, fauna, palms and goods form a complete vocabulary", () => {
    assert.equal(Object.keys(DESERT_FORMATIONS).length, 10);
    assert.equal(Object.keys(DESERT_SANDS).length, 4);
    assert.equal(DESERT_LIMITS.duneTypes, 5);
    for (const [id, formation] of Object.entries(DESERT_FORMATIONS)) {
        assert.equal(formation.id, id);
        assert.ok(formation.label.length > 3);
        assert.ok(formation.note.length > 8);
        for (const plant of formation.plants) assert.ok(DESERT_GRASSES[plant], id + " references missing grass " + plant);
        for (const shrub of formation.shrubs) assert.ok(DESERT_SHRUBS[shrub], id + " references missing shrub " + shrub);
        for (const palm of formation.palms) assert.ok(DESERT_PALMS[palm], id + " references missing palm " + palm);
    }
    for (const grass of Object.values(DESERT_GRASSES)) {
        assert.ok(grass.colours.every(colour => /^#[0-9a-f]{6}$/i.test(colour)));
        assert.equal(grass.deepRoot, true);
    }
    for (const shrub of Object.values(DESERT_SHRUBS)) {
        assert.ok(shrub.colours.every(colour => /^#[0-9a-f]{6}$/i.test(colour)));
        assert.equal(shrub.deepRoot, true);
        for (const good of shrub.goods) assert.ok(FOREST_GOODS[good], shrub.id + " references unknown good " + good);
    }
    for (const succulent of Object.values(DESERT_SUCCULENTS)) {
        assert.ok(succulent.colours.every(colour => /^#[0-9a-f]{6}$/i.test(colour)));
        for (const good of succulent.goods) assert.ok(FOREST_GOODS[good]);
    }
    for (const flower of Object.values(DESERT_FLOWERS)) {
        assert.ok(flower.colours.every(colour => /^#[0-9a-f]{6}$/i.test(colour)));
        assert.ok(flower.seasons.every(season => SEASONS.includes(season)));
        assert.equal(typeof flower.rainOnly, "boolean");
    }
    for (const herb of Object.values(DESERT_HERBS)) {
        assert.ok(herb.seasons.every(season => SEASONS.includes(season)));
        assert.match(herb.colour, /^#[0-9a-f]{6}$/i);
    }
    for (const palm of Object.values(DESERT_PALMS)) {
        assert.ok(SEASONS.every(season => /^#[0-9a-f]{6}$/i.test(palm.colours[season])));
        for (const good of palm.goods) assert.ok(FOREST_GOODS[good]);
    }
    for (const animal of Object.values(DESERT_FAUNA)) {
        assert.ok(animal.seasons.every(season => SEASONS.includes(season)));
        assert.ok(animal.kind.length > 2);
        assert.ok(animal.label.length > 2);
    }
    for (const good of Object.values(DESERT_GOODS)) {
        assert.equal(FOREST_GOODS[good.id], good);
        const channel = forestDeliveryChannel(good.id);
        assert.ok(channel, good.id + " has no delivery channel");
        assert.equal(channel, good.id === "dates" ? "food" : good.category === "medicine" ? "medicine" : "gold");
    }
    assert.equal(FOREST_GOODS["desert-sand"].category, "material");
    assert.equal(FOREST_GOODS.dates.category, "gather");
    assert.equal(FOREST_GOODS["desert-herb"].category, "medicine");
});

test("the desert profile is deterministic and every exposed value is bounded", () => {
    const first = surveyProfile(SURVEY[0]);
    const second = surveyProfile(SURVEY[0]);
    assert.deepEqual(second, first);
    assert.equal(first.desert, true);
    assert.equal(first.biome, "desert");
    assert.ok(first.features.length > 40);
    assert.match(first.grassHex, /^#[0-9a-f]{6}$/i);
    assert.match(first.groundHex, /^#[0-9a-f]{6}$/i);
    assert.equal(desertProfileAt(8.5, 7.5, context({ ...SURVEY[0].overrides, year: 20 })).year, 20);
    const other = desertProfileAt(8.5, 7.5, context({ ...SURVEY[0].overrides, seed: 20261114 }));
    assert.notDeepEqual(other, first);
    for (const profile of [first, other]) {
        for (const group of ["hazards", "soil", "economy", "materials", "water"]) {
            for (const [key, value] of Object.entries(profile[group])) {
                if (typeof value !== "number") continue;
                assert.ok(Number.isFinite(value), `${group}.${key} must be finite`);
                assert.ok(value >= 0 && value <= 1, `${group}.${key} must be bounded`);
            }
        }
        for (const [key, value] of Object.entries(profile.visual)) {
            if (typeof value !== "number" || key === "phase" || key === "wind") continue;
            assert.ok(Number.isFinite(value) && value >= 0 && value <= 1, `visual.${key} must be bounded`);
        }
        assert.ok(profile.fauna.length <= DESERT_LIMITS.maxFauna);
        assert.ok(profile.vegetation.flowers.length <= DESERT_LIMITS.maxFlowers);
        assert.ok(profile.goods.length <= DESERT_LIMITS.maxGoods);
        assert.equal(new Set(profile.features).size, profile.features.length);
        assert.ok(profile.features.every(id => DESERT_REQUIREMENT_IDS.includes(id)));
    }
});

test("the ten-tile survey reaches every one of the 75 requirements", () => {
    const seen = new Set();
    const formations = new Set();
    const sandColours = new Set();
    const duneTypes = new Set();
    for (const entry of SURVEY) {
        const profile = surveyProfile(entry);
        assert.equal(profile.formation, entry.formation);
        assert.equal(isDesertSite(entry.x, entry.y, context(entry.overrides)), true);
        formations.add(profile.formation);
        sandColours.add(profile.sand.colour);
        for (const dune of profile.dunes.types) duneTypes.add(dune);
        for (const id of profile.features) seen.add(id);
    }
    assert.deepEqual(DESERT_REQUIREMENT_IDS.filter(id => !seen.has(id)), []);
    assert.equal(formations.size, 10);
    assert.equal(sandColours.size, 4);
    assert.deepEqual([...duneTypes].sort(), ["crescent-dunes", "great-dunes", "linear-ridges", "small-hills", "wind-scour"]);
});

test("deserts remain dry, open and climatically bounded", () => {
    assert.equal(desertPotentialAt(1, 1, context({ climate: "temperate", aridity: 20 })), 0);
    assert.equal(desertPotentialAt(1, 1, context({ height: 0.1 })), 0);
    assert.ok(desertPotentialAt(1, 1, context()) > 0);
    assert.ok(desertPotentialAt(1, 1, context({ climate: "mediterranean", aridity: 60 })) > 0);
    const dry = desertProfileAt(0.5, 8.5, context({ moisture: 0.16, temperature: 0.6, height: 0.46 }));
    assert.equal(dry.water.oasis, false);
    assert.equal(dry.water.waterhole, false);
    assert.equal(dry.settlement.fields, false);
    assert.ok(dry.hazards.waterScarcity > 0.4);
    assert.ok(dry.features.includes("1.2.8.68"));
    assert.ok(dry.features.includes("1.2.8.70"));
});

test("oases provide water, fertile soil, fields, orchards and caravan land", () => {
    const oasis = surveyProfile(SURVEY[0]);
    assert.equal(oasis.water.oasis, true);
    assert.equal(oasis.water.spring, true);
    assert.equal(oasis.water.waterhole, true);
    assert.equal(oasis.settlement.fields, true);
    assert.equal(oasis.settlement.orchards, true);
    assert.equal(oasis.settlement.suitable, true);
    assert.ok(oasis.soil.fertile > 0.4);
    assert.ok(oasis.economy.agriculture > 0.3);
    assert.ok(oasis.goods.some(good => good.id === "dates"));
    assert.ok(oasis.vegetation.palms.length > 0);
    for (const id of ["1.2.8.35", "1.2.8.36", "1.2.8.37", "1.2.8.38", "1.2.8.39", "1.2.8.40", "1.2.8.41", "1.2.8.42", "1.2.8.43", "1.2.8.71", "1.2.8.72", "1.2.8.73"]) {
        assert.ok(oasis.features.includes(id), "oasis is missing " + id);
    }
    const products = desertProductsAt(SURVEY[0].x, SURVEY[0].y, context(SURVEY[0].overrides));
    assert.ok(products);
    assert.ok(products.goods.every(good => FOREST_GOODS[good.id]));
    assert.match(desertSummary(oasis), /sand|desert/i);
});

test("rare rain, night cooling, heat, dust and storms are real hazards", () => {
    const springRain = desertProfileAt(0.5, 5.5, context({ moisture: 0.42, temperature: 0.68, height: 0.34, dayOfYear: 40, hour: 2, weather: "rain" }));
    const summer = desertProfileAt(0.5, 5.5, context({ moisture: 0.42, temperature: 0.68, height: 0.34, dayOfYear: 140, hour: 13, weather: "clear" }));
    const winter = desertProfileAt(0.5, 5.5, context({ moisture: 0.42, temperature: 0.68, height: 0.34, dayOfYear: 340, hour: 2, weather: "clear" }));
    const storm = surveyProfile(SURVEY[0]);
    assert.ok(springRain.vegetation.bloom > 0.1);
    assert.ok(springRain.vegetation.flowers.length > 0);
    assert.ok(springRain.features.includes("1.2.8.30"));
    assert.ok(springRain.features.includes("1.2.8.64"));
    assert.ok(springRain.features.includes("1.2.8.65"));
    assert.ok(summer.hazards.heat > 0.4);
    assert.ok(summer.features.includes("1.2.8.60"));
    assert.ok(winter.hazards.nightCold > 0.3);
    assert.ok(winter.features.includes("1.2.8.61"));
    assert.ok(storm.hazards.sandstorm > 0.3);
    assert.ok(storm.hazards.dust > 0.2);
    assert.ok(storm.features.includes("1.2.8.62"));
    assert.ok(storm.features.includes("1.2.8.67"));
    assert.ok(storm.features.includes("1.2.8.66"));
    assert.ok(springRain.fauna.some(animal => animal.nocturnal));
    assert.ok(springRain.features.includes("1.2.8.50"));
    assert.ok(springRain.fauna.some(animal => animal.waterIndependent));
    assert.ok(springRain.features.includes("1.2.8.51"));
    const livestock = desertProfileAt(0.5, 7.5, context({ moisture: 0.42, temperature: 0.68, height: 0.34, dayOfYear: 140, hour: 2, use: { state: "path" } }));
    assert.ok(livestock.fauna.some(animal => animal.group === "livestock"));
    assert.ok(livestock.features.includes("1.2.8.49"));
});

test("desert goods are seasonal and reuse the shared ledger", () => {
    const summerProfile = surveyProfile(SURVEY[0]);
    const winterProfile = desertProfileAt(SURVEY[0].x, SURVEY[0].y, context({ ...SURVEY[0].overrides, dayOfYear: 340 }));
    assert.ok(summerProfile.goods.some(good => good.id === "dates"));
    assert.ok(desertGoodsFor(summerProfile, 140).some(good => good.id === "dates"));
    assert.ok(desertGoodsFor(winterProfile, 340).every(good => good.id !== "dates"));
    assert.equal(desertProductsAt(0.5, 0.5, context({ height: 0.1 })), null);
    const products = desertProductsAt(SURVEY[0].x, SURVEY[0].y, context(SURVEY[0].overrides));
    assert.ok(products);
    assert.ok(products.goods.every(good => FOREST_GOODS[good.id]));
    assert.ok(products.goods.some(good => ["desert-herb", "desert-resin", "dates", "desert-sand", "desert-stone"].includes(good.id)));
});
