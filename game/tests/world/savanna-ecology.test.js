import test from "node:test";
import assert from "node:assert/strict";
import {
    SAVANNA_FAUNA, SAVANNA_FLOWERS, SAVANNA_FORMATIONS, SAVANNA_GOODS,
    SAVANNA_GRASSES, SAVANNA_HERBS, SAVANNA_LIMITS, SAVANNA_REQUIREMENTS,
    SAVANNA_REQUIREMENT_IDS, SAVANNA_SHRUBS, SAVANNA_TREES,
    isSavannaSite, savannaGoodsFor, savannaPotentialAt, savannaProductsAt,
    savannaProfileAt, savannaRequirement, savannaSummary,
} from "../../js/world/savanna-ecology.js";
import { FOREST_GOODS } from "../../js/world/forest-ecology.js";
import { forestDeliveryChannel } from "../../js/systems/forest-gathering.js";
import { seasonalState } from "../../js/world/season.js";

const SEASONS = ["spring", "summer", "autumn", "winter"];
const BASE = Object.freeze({
    seed: 20261114,
    seaLevel: 0.33,
    climate: "savanna",
    temperature: 0.8,
    year: 7,
    use: { state: "wild" },
    hour: 13,
    weather: "clear",
    wind: 1.4,
});

// Ten deterministic tiles selected by the ecology itself: one for every
// formation. Together they reach every 1.2.10 requirement without demo props.
const SURVEY = Object.freeze([
    { x: 28.5, y: 12.5, formation: "thorn-scrub", moisture: 0.72, height: 0.42, dayOfYear: 310, weather: "clear" },
    { x: 40.5, y: 16.5, formation: "riparian-corridor", moisture: 0.32, height: 0.34, dayOfYear: 130, weather: "storm" },
    { x: 7.5, y: 25.5, formation: "grass-plains", moisture: 0.46, height: 0.34, dayOfYear: 130, weather: "storm" },
    { x: 5.5, y: 8.5, formation: "dry-riverbed", moisture: 0.46, height: 0.34, dayOfYear: 130, weather: "storm" },
    { x: 1.5, y: 20.5, formation: "baobab-grove", moisture: 0.6, height: 0.34, dayOfYear: 310, weather: "clear" },
    { x: 40.5, y: 16.5, formation: "acacia-savanna", moisture: 0.6, height: 0.42, dayOfYear: 130, weather: "storm" },
    { x: 8.5, y: 2.5, formation: "burned-grassland", moisture: 0.72, height: 0.42, dayOfYear: 310, weather: "clear" },
    { x: 8.5, y: 32.5, formation: "termite-mound-field", moisture: 0.18, height: 0.42, dayOfYear: 130, weather: "storm" },
    { x: 2.5, y: 24.5, formation: "rocky-kopje", moisture: 0.18, height: 0.42, dayOfYear: 130, weather: "storm" },
    { x: 25.5, y: 28.5, formation: "seasonal-pan", moisture: 0.72, height: 0.34, dayOfYear: 130, weather: "storm" },
]);

const context = overrides => ({ ...BASE, ...overrides });
const surveyProfile = entry => savannaProfileAt(entry.x, entry.y, context(entry));

test("all 1.2.10.1–1.2.10.48 requirements are declared exactly once", () => {
    assert.equal(SAVANNA_REQUIREMENTS.length, 48);
    assert.deepEqual(SAVANNA_REQUIREMENT_IDS, Array.from({ length: 48 }, (_, index) => "1.2.10." + (index + 1)));
    assert.equal(new Set(SAVANNA_REQUIREMENT_IDS).size, 48);
    const groups = ["vegetation", "soil", "water", "landform", "climate", "visual", "fauna", "economy", "hazard"];
    for (const requirement of SAVANNA_REQUIREMENTS) {
        assert.equal(savannaRequirement(requirement.id), requirement);
        assert.ok(requirement.label.length > 4);
        assert.ok(groups.includes(requirement.group), requirement.id + " has an unknown group");
    }
    assert.equal(savannaRequirement("1.2.10.1").key, "tall-grasses");
    assert.equal(savannaRequirement("1.2.10.48").group, "hazard");
    assert.equal(savannaRequirement("1.2.10.49"), null);
    assert.equal(SAVANNA_LIMITS.requirements, 48);
});

test("all savanna formations, flora, fauna and goods form a complete vocabulary", () => {
    assert.equal(Object.keys(SAVANNA_FORMATIONS).length, 10);
    assert.equal(Object.keys(SAVANNA_GRASSES).length, 5);
    assert.equal(Object.keys(SAVANNA_SHRUBS).length, 4);
    assert.equal(Object.keys(SAVANNA_TREES).length, 6);
    for (const [id, formation] of Object.entries(SAVANNA_FORMATIONS)) {
        assert.equal(formation.id, id);
        assert.ok(formation.label.length > 3);
        assert.ok(formation.note.length > 12);
        for (const grass of formation.grasses) assert.ok(SAVANNA_GRASSES[grass], id + " references missing grass " + grass);
        for (const shrub of formation.shrubs) assert.ok(SAVANNA_SHRUBS[shrub], id + " references missing shrub " + shrub);
        for (const tree of formation.trees) assert.ok(SAVANNA_TREES[tree], id + " references missing tree " + tree);
    }
    for (const grass of Object.values(SAVANNA_GRASSES)) {
        assert.ok(grass.colours.every(colour => /^#[0-9a-f]{6}$/i.test(colour)));
        for (const good of grass.goods) assert.ok(FOREST_GOODS[good]);
    }
    for (const shrub of Object.values(SAVANNA_SHRUBS)) {
        assert.ok(shrub.colours.every(colour => /^#[0-9a-f]{6}$/i.test(colour)));
        for (const good of shrub.goods) assert.ok(FOREST_GOODS[good]);
    }
    for (const tree of Object.values(SAVANNA_TREES)) {
        assert.ok(tree.heightMeters >= 6, tree.id + " must be a real savanna tree");
        assert.ok(SEASONS.every(season => /^#[0-9a-f]{6}$/i.test(tree.colours[season])));
        for (const good of tree.goods) assert.ok(FOREST_GOODS[good]);
    }
    for (const flower of Object.values(SAVANNA_FLOWERS)) {
        assert.ok(flower.colours.every(colour => /^#[0-9a-f]{6}$/i.test(colour)));
        assert.ok(flower.seasons.every(season => SEASONS.includes(season)));
    }
    for (const herb of Object.values(SAVANNA_HERBS)) {
        assert.ok(herb.seasons.every(season => SEASONS.includes(season)));
        assert.match(herb.colour, /^#[0-9a-f]{6}$/i);
    }
    for (const animal of Object.values(SAVANNA_FAUNA)) {
        assert.ok(animal.seasons.every(season => SEASONS.includes(season)));
        assert.ok(animal.kind.length > 2);
        assert.ok(animal.label.length > 2);
    }
    const channels = {
        "marula-fruit": "food", "baobab-fruit": "food", sorghum: "food", millet: "food",
        "gum-arabic": "gold", "baobab-fibre": "gold", "savanna-salt": "gold",
        "thorn-branches": "gold", ivory: "gold", charcoal: "gold", "termite-earth": "gold",
        "savanna-herb": "medicine",
        "thatching-grass": "gold",
        meat: "food",
        "acacia-timber": "wood", "camelthorn-timber": "wood", "marula-timber": "wood",
        "fever-tree-timber": "wood", "baobab-timber": "wood",
    };
    for (const good of Object.values(SAVANNA_GOODS)) {
        assert.equal(FOREST_GOODS[good.id], good);
        assert.equal(forestDeliveryChannel(good.id), channels[good.id], good.id + " has the wrong delivery channel");
    }
});

test("the savanna profile is deterministic and every exposed number is bounded", () => {
    const first = surveyProfile(SURVEY[0]);
    const second = surveyProfile(SURVEY[0]);
    assert.deepEqual(second, first);
    assert.equal(first.savanna, true);
    assert.equal(first.biome, "savanna");
    assert.ok(first.features.length > 30);
    assert.match(first.grassHex, /^#[0-9a-f]{6}$/i);
    assert.match(first.groundHex, /^#[0-9a-f]{6}$/i);
    assert.equal(savannaProfileAt(SURVEY[0].x, SURVEY[0].y, context({ ...SURVEY[0], year: 20 })).year, 20);
    const other = savannaProfileAt(SURVEY[0].x, SURVEY[0].y, context({ ...SURVEY[0], seed: 20261115 }));
    assert.notDeepEqual(other, first);
    for (const profile of [first, other]) {
        for (const group of ["hazards", "soil", "economy", "water", "landform", "visual"]) {
            for (const [key, value] of Object.entries(profile[group])) {
                if (typeof value !== "number") continue;
                if (key === "phase" || key === "wind" || key === "aboveSea" || key === "waterDepthCm" || key === "moundCount") continue;
                if (key.endsWith("Hex")) continue;
                assert.ok(Number.isFinite(value), `${group}.${key} must be finite`);
                assert.ok(value >= 0 && value <= 1, `${group}.${key} must be bounded, got ${value}`);
            }
        }
        assert.ok(profile.fauna.length <= SAVANNA_LIMITS.maxFauna);
        assert.ok(profile.vegetation.flowers.length <= SAVANNA_LIMITS.maxFlowers);
        assert.ok(profile.goods.length <= SAVANNA_LIMITS.maxGoods);
        assert.equal(new Set(profile.features).size, profile.features.length);
        assert.ok(profile.features.every(id => SAVANNA_REQUIREMENT_IDS.includes(id)));
    }
});

test("the ten-tile survey reaches every one of the 48 requirements and all ten formations", () => {
    const seen = new Set();
    const formations = new Set();
    for (const entry of SURVEY) {
        const profile = surveyProfile(entry);
        assert.equal(profile.formation, entry.formation);
        assert.equal(isSavannaSite(entry.x, entry.y, context(entry)), true);
        formations.add(profile.formation);
        for (const id of profile.features) seen.add(id);
    }
    assert.deepEqual(SAVANNA_REQUIREMENT_IDS.filter(id => !seen.has(id)), []);
    assert.equal(formations.size, 10);
});

test("savanna is the dedicated hot-grassland climate and nowhere else", () => {
    assert.equal(savannaPotentialAt(1, 1, context({ climate: "temperate" })), 0);
    assert.equal(savannaPotentialAt(1, 1, context({ climate: "tropical" })), 0);
    assert.equal(savannaPotentialAt(1, 1, context({ climate: "arid" })), 0);
    assert.equal(savannaPotentialAt(1, 1, context({ height: 0.1 })), 0);
    assert.ok(savannaPotentialAt(1, 1, context()) > 0.5);
    assert.ok(isSavannaSite(1, 1, context()));
    const low = savannaProfileAt(1, 1, context({ height: 0.38, moisture: 0.5 }));
    assert.ok(low.economy.livestock > 0.25);
    assert.ok(low.economy.agriculture > 0.1);
    assert.ok(low.water.wetSeason >= 0 && low.water.wetSeason <= 1);
    assert.ok(low.hazards.heatRisk > 0.2);
});

test("the wet and dry seasons are a real pulse, not a recolour", () => {
    const wet = savannaProfileAt(20.5, 4.5, context({ moisture: 0.62, height: 0.4, dayOfYear: 120 }));
    const dry = savannaProfileAt(20.5, 4.5, context({ moisture: 0.62, height: 0.4, dayOfYear: 250 }));
    assert.equal(wet.season, "summer");
    assert.equal(dry.season, "autumn");
    assert.ok(wet.water.wetSeason > dry.water.wetSeason + 0.25);
    assert.ok(dry.water.drySeason > wet.water.drySeason + 0.25);
    assert.ok(wet.vegetation.greenFlush > dry.vegetation.greenFlush);
    assert.ok(dry.hazards.fireRisk > wet.hazards.fireRisk);
    assert.ok(dry.hazards.droughtRisk > wet.hazards.droughtRisk);
    const seasonalWet = seasonalState(120, "savanna");
    const seasonalDry = seasonalState(250, "savanna");
    assert.equal(seasonalWet.climate, "savanna");
    assert.equal(seasonalWet.snowCover, 0);
    assert.ok(seasonalWet.greenUp > seasonalDry.greenUp);
});

test("savanna products use the shared ledger and respect the seasonal window", () => {
    const wet = surveyProfile(SURVEY[7]);
    const winter = savannaProfileAt(SURVEY[7].x, SURVEY[7].y, context({ ...SURVEY[7], dayOfYear: 320 }));
    assert.ok(wet.goods.every(good => FOREST_GOODS[good.id]));
    assert.ok(savannaGoodsFor(wet, 130).some(good => good.id === "marula-fruit"));
    assert.ok(savannaGoodsFor(winter, 320).every(good => good.id !== "marula-fruit"));
    assert.equal(savannaProductsAt(0.5, 0.5, context({ height: 0.1 })), null);
    const products = savannaProductsAt(SURVEY[5].x, SURVEY[5].y, context(SURVEY[5]));
    assert.ok(products);
    assert.ok(products.goods.every(good => FOREST_GOODS[good.id]));
    assert.match(savannaSummary(products.profile), /savanna|acacia|grass|pan|water/i);
});

test("elephants, giraffes, antelope, zebra, cats, hyenas, vultures, ground birds and termites are present", () => {
    const profiles = SURVEY.map(surveyProfile);
    const fauna = profiles.flatMap(profile => profile.fauna);
    assert.ok(fauna.some(animal => animal.id === "elephant"));
    assert.ok(fauna.some(animal => animal.id === "giraffe"));
    assert.ok(fauna.some(animal => animal.id === "impala" || animal.id === "gazelle"));
    assert.ok(fauna.some(animal => animal.id === "zebra"));
    assert.ok(fauna.some(animal => animal.id === "lion" || animal.id === "cheetah"));
    assert.ok(fauna.some(animal => animal.id === "hyena"));
    assert.ok(fauna.some(animal => animal.id === "vulture"));
    assert.ok(fauna.some(animal => animal.groundBird));
    assert.ok(fauna.some(animal => animal.id === "termite"));
    assert.ok(fauna.some(animal => animal.herd));
    assert.ok(fauna.some(animal => animal.migratory));
    assert.ok(profiles.some(profile => profile.features.includes("1.2.10.31")));
    assert.ok(profiles.some(profile => profile.features.includes("1.2.10.32")));
});
