import test from "node:test";
import assert from "node:assert/strict";
import {
    SWAMP_FAUNA, SWAMP_FLOWERS, SWAMP_FORMATIONS, SWAMP_GOODS, SWAMP_GRASSES,
    SWAMP_HERBS, SWAMP_LIMITS, SWAMP_MOSSES, SWAMP_REEDS, SWAMP_REQUIREMENTS,
    SWAMP_REQUIREMENT_IDS, SWAMP_SEDGES, SWAMP_SHRUBS, SWAMP_TREES,
    SWAMP_WATER_PLANTS, isSwampSite, swampGoodsFor, swampPotentialAt,
    swampProductsAt, swampProfileAt, swampRequirement, swampSummary,
} from "../../js/world/swamp-ecology.js";
import { FOREST_GOODS } from "../../js/world/forest-ecology.js";
import { forestDeliveryChannel } from "../../js/systems/forest-gathering.js";
import { drawSwamp, drawSwampTree } from "../../js/presentation/rendering/swamp-render.js";

const SEASONS = ["spring", "summer", "autumn", "winter"];
const BASE = Object.freeze({
    seed: 20261115,
    seaLevel: 0.33,
    climate: "swamp",
    temperature: 0.5,
    year: 9,
    use: { state: "wild" },
    hour: 7,
    weather: "fog",
    wind: 1.2,
});

const context = overrides => ({ ...BASE, ...overrides });

// A deterministic two-season survey. The wetland changes formation with the
// spring flood and the summer draw-down, so both halves are required to reach
// the shallow pools and the seasonal hollows.
function surveyProfiles() {
    const profiles = [];
    for (const dayOfYear of [60, 120]) {
        for (let y = 0; y < 50; y++) {
            for (let x = 0; x < 50; x++) {
                profiles.push(swampProfileAt(x + 0.5, y + 0.5, context({
                    height: 0.334 + (y % 9) * 0.004,
                    moisture: 0.7 + (x % 8) * 0.03,
                    dayOfYear,
                })));
            }
        }
    }
    return profiles;
}

test("all 1.2.11.1–1.2.11.81 requirements are declared exactly once", () => {
    assert.equal(SWAMP_REQUIREMENTS.length, 81);
    assert.deepEqual(SWAMP_REQUIREMENT_IDS,
        Array.from({ length: 81 }, (_, index) => "1.2.11." + (index + 1)));
    assert.equal(new Set(SWAMP_REQUIREMENT_IDS).size, 81);
    const groups = ["vegetation", "soil", "water", "landform", "climate", "visual", "fauna", "economy", "hazard"];
    for (const requirement of SWAMP_REQUIREMENTS) {
        assert.equal(swampRequirement(requirement.id), requirement);
        assert.ok(requirement.label.length > 4);
        assert.ok(groups.includes(requirement.group), requirement.id + " has an unknown group");
    }
    assert.equal(swampRequirement("1.2.11.1").key, "shallow-water-swamps");
    assert.equal(swampRequirement("1.2.11.81").group, "visual");
    assert.equal(swampRequirement("1.2.11.82"), null);
    assert.equal(SWAMP_LIMITS.requirements, 81);
});

test("all ten wetland formations and their flora, fauna and goods are complete", () => {
    assert.equal(Object.keys(SWAMP_FORMATIONS).length, 10);
    for (const [id, formation] of Object.entries(SWAMP_FORMATIONS)) {
        assert.equal(formation.id, id);
        assert.ok(formation.label.length > 3);
        assert.ok(formation.note.length > 12);
        for (const reed of formation.reeds) assert.ok(SWAMP_REEDS[reed], id + " references missing reed " + reed);
        for (const sedge of formation.sedges) assert.ok(SWAMP_SEDGES[sedge], id + " references missing sedge " + sedge);
        for (const moss of formation.mosses) assert.ok(SWAMP_MOSSES[moss], id + " references missing moss " + moss);
        for (const plant of formation.waterPlants) assert.ok(SWAMP_WATER_PLANTS[plant], id + " references missing water plant " + plant);
        for (const grass of formation.grasses) assert.ok(SWAMP_GRASSES[grass], id + " references missing grass " + grass);
        for (const shrub of formation.shrubs) assert.ok(SWAMP_SHRUBS[shrub], id + " references missing shrub " + shrub);
        for (const tree of formation.trees) assert.ok(SWAMP_TREES[tree], id + " references missing tree " + tree);
        for (const herb of formation.herbs) assert.ok(SWAMP_HERBS[herb], id + " references missing herb " + herb);
        for (const flower of formation.flowers) assert.ok(SWAMP_FLOWERS[flower], id + " references missing flower " + flower);
    }
    for (const tree of Object.values(SWAMP_TREES)) {
        assert.ok(tree.heightMeters >= 6);
        assert.ok(SEASONS.every(season => /^#[0-9a-f]{6}$/i.test(tree.colours[season])));
        for (const good of tree.goods) assert.ok(FOREST_GOODS[good], tree.id + " references missing good " + good);
    }
    for (const shrub of Object.values(SWAMP_SHRUBS)) {
        assert.ok(shrub.colours.every(colour => /^#[0-9a-f]{6}$/i.test(colour)));
        for (const good of shrub.goods) assert.ok(FOREST_GOODS[good]);
    }
    for (const reed of Object.values(SWAMP_REEDS)) {
        assert.ok(reed.colours.every(colour => /^#[0-9a-f]{6}$/i.test(colour)));
        for (const good of reed.goods) assert.ok(FOREST_GOODS[good]);
    }
    for (const animal of Object.values(SWAMP_FAUNA)) {
        assert.ok(animal.seasons.every(season => SEASONS.includes(season)));
        assert.ok(animal.kind.length > 2);
        assert.ok(animal.label.length > 2);
    }
    assert.equal(Object.keys(SWAMP_TREES).length, SWAMP_LIMITS.trees);
    assert.equal(Object.keys(SWAMP_REEDS).length, SWAMP_LIMITS.reeds);
    assert.equal(Object.keys(SWAMP_SEDGES).length, SWAMP_LIMITS.sedges);
    assert.equal(Object.keys(SWAMP_MOSSES).length, SWAMP_LIMITS.mosses);
});

test("every wetland good reaches the shared ledger and a delivery channel", () => {
    const expected = {
        "bog-cranberry": "food", "bog-bean": "medicine", "bog-herb": "medicine",
        sphagnum: "medicine", "bog-orchid": "gold", "water-lily": "food",
        "cattail-flour": "food", waterfowl: "food", "marsh-fish": "food",
        "alder-timber": "wood", "willow-timber": "wood", "bog-oak-timber": "wood",
        "mangrove-timber": "wood", "reed-matting": "gold", "bog-cotton": "gold",
        "swamp-mud": "gold",
    };
    for (const good of Object.values(SWAMP_GOODS)) {
        assert.equal(FOREST_GOODS[good.id], good);
        assert.equal(forestDeliveryChannel(good.id), expected[good.id], good.id + " has the wrong channel");
    }
});

test("the wetland profile is deterministic, bounded and seasonally variable", () => {
    const first = swampProfileAt(12.5, 9.5, context({ dayOfYear: 60, height: 0.35, moisture: 0.8 }));
    const second = swampProfileAt(12.5, 9.5, context({ dayOfYear: 60, height: 0.35, moisture: 0.8 }));
    assert.deepEqual(second, first);
    assert.equal(first.swamp, true);
    assert.equal(first.biome, "swamp");
    assert.ok(first.features.length >= 30);
    assert.match(first.grassHex, /^#[0-9a-f]{6}$/i);
    assert.match(first.groundHex, /^#[0-9a-f]{6}$/i);
    assert.match(first.visual.waterHex, /^#[0-9a-f]{6}$/i);
    assert.equal(first.year, 9);

    const dry = swampProfileAt(12.5, 9.5, context({ dayOfYear: 220, height: 0.35, moisture: 0.8 }));
    assert.ok(first.water.waterLevel > dry.water.waterLevel, "spring flood must stand above the summer draw-down");
    assert.ok(first.water.seasonalPulse > dry.water.seasonalPulse);

    for (const profile of [first, dry]) {
        for (const group of ["hazards", "soil", "economy", "water", "landform", "visual"]) {
            for (const [key, value] of Object.entries(profile[group])) {
                if (typeof value !== "number") continue;
                if (key === "phase" || key === "wind" || key === "aboveSea" || key === "depthCm"
                    || key === "peatDepthCm" || key === "waterTable") continue;
                if (key.endsWith("Hex")) continue;
                assert.ok(Number.isFinite(value), `${group}.${key} must be finite`);
                assert.ok(value >= 0 && value <= 1, `${group}.${key} must be bounded, got ${value}`);
            }
        }
        assert.ok(profile.fauna.length <= SWAMP_LIMITS.maxFauna);
        assert.ok(profile.vegetation.flowers.length <= SWAMP_LIMITS.maxFlowers);
        assert.ok(profile.goods.length <= SWAMP_LIMITS.maxGoods);
        assert.equal(new Set(profile.features).size, profile.features.length);
        assert.ok(profile.features.every(id => SWAMP_REQUIREMENT_IDS.includes(id)));
    }
    assert.notDeepEqual(swampProfileAt(12.5, 9.5, context({ seed: 20261116, dayOfYear: 60 })), first);
});

test("the two-season survey reaches all 81 requirements and all ten formations", () => {
    const seen = new Set();
    const formations = new Set();
    for (const profile of surveyProfiles()) {
        formations.add(profile.formation);
        for (const id of profile.features) seen.add(id);
    }
    assert.deepEqual(SWAMP_REQUIREMENT_IDS.filter(id => !seen.has(id)), []);
    assert.deepEqual(Object.keys(SWAMP_FORMATIONS).filter(id => !formations.has(id)), []);
    assert.equal(formations.size, 10);
});

test("wetland is the dedicated swamp climate and nowhere else", () => {
    const ctx = context({ height: 0.35, moisture: 0.8 });
    assert.ok(swampPotentialAt(1.5, 1.5, ctx) > 0.24);
    assert.equal(isSwampSite(1.5, 1.5, ctx), true);
    for (const climate of ["temperate", "taiga", "tundra", "savanna", "tropical", "arid", "mediterranean"]) {
        assert.equal(swampPotentialAt(1.5, 1.5, { ...ctx, climate }), 0, climate + " must not generate wetland");
        assert.equal(isSwampSite(1.5, 1.5, { ...ctx, climate }), false);
    }
    assert.equal(swampPotentialAt(1.5, 1.5, { ...ctx, height: 0.31 }), 0);
    const products = swampProductsAt(1.5, 1.5, ctx);
    assert.ok(products);
    assert.equal(products.x, 1);
    assert.equal(products.y, 1);
    assert.ok(products.goods.length > 0);
    assert.equal(swampGoodsFor(products.profile, 60).length, products.goods.length);
    assert.match(swampSummary(products.profile), /·/);
    assert.equal(swampProductsAt(1.5, 1.5, { ...ctx, climate: "temperate" }), null);
});

test("the wetland renderer draws reeds, water, mist and fauna without unbounded work", () => {
    let calls = 0;
    const ctx = new Proxy({}, {
        get: () => () => { calls += 1; },
        set: () => true,
    });
    const wet = swampProfileAt(10.5, 10.5, context({ dayOfYear: 60, height: 0.35, moisture: 0.8 }));
    drawSwamp(ctx, 12, 18, 48, wet, 0.2, 0.5, 0.7, 1234, 1, 0.7, 60, "swamp");
    assert.ok(calls > 40);
    assert.ok(Number.isFinite(wet.visual.windSway));
    assert.ok(Number.isFinite(wet.visual.reedSway));

    // The density layer can open a channel or expose a mudflat. Both are real
    // wetland states and must keep the renderer's bounded call contract.
    const channeled = {
        ...wet,
        water: { ...wet.water, standingWater: true, depth: 0.42, reflection: 0.3 },
        vegetation: { ...wet.vegetation, densityOverlay: { channel: true, openWater: false, structure: { mud: 0.2 } } },
    };
    calls = 0;
    drawSwamp(ctx, 12, 18, 48, channeled, 0.2, 0.5, 0.7, 1234, 1, 0.7, 60, "swamp");
    assert.ok(calls > 40);
    const muddy = {
        ...wet,
        vegetation: { ...wet.vegetation, densityOverlay: { channel: false, openWater: false, structure: { mud: 0.6 } } },
    };
    calls = 0;
    drawSwamp(ctx, 12, 18, 48, muddy, 0.2, 0.5, 0.7, 1234, 1, 0.7, 60, "swamp");
    assert.ok(calls > 40);

    // Use a real tree-bearing tile from the deterministic survey so the carr
    // branch is exercised as well.
    const carr = surveyProfiles().find(profile => profile.trees.length);
    assert.ok(carr, "a tree-bearing wetland tile must exist");
    calls = 0;
    drawSwampTree(ctx, 12, 18, 48, carr.trees[0], carr, 0.4);
    assert.ok(calls > 8);
});
