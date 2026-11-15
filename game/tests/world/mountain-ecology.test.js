import test from "node:test";
import assert from "node:assert/strict";
import {
    MOUNTAIN_FAUNA, MOUNTAIN_FLOWERS, MOUNTAIN_FORMATIONS, MOUNTAIN_GOODS, MOUNTAIN_GRASSES,
    MOUNTAIN_LIMITS, MOUNTAIN_MOSSES, MOUNTAIN_REQUIREMENTS, MOUNTAIN_REQUIREMENT_IDS,
    MOUNTAIN_SHRUBS, MOUNTAIN_TREES, isMountainSite, mountainGoodsFor, mountainPotentialAt,
    mountainProductsAt, mountainProfileAt, mountainRequirement, mountainSummary,
} from "../../js/world/mountain-ecology.js";
import { FOREST_GOODS } from "../../js/world/forest-ecology.js";
import { forestDeliveryChannel } from "../../js/systems/forest-gathering.js";
import { drawMountain, drawMountainTree } from "../../js/presentation/rendering/mountain-render.js";

const SEASONS = ["spring", "summer", "autumn", "winter"];
const BASE = Object.freeze({
    seed: 20261212, seaLevel: 0.33, climate: "mountain",
    temperature: 0.4, year: 7, use: { state: "wild" },
    hour: 8, weather: "clear", wind: 1.1,
});

const context = overrides => ({ ...BASE, ...overrides });

function surveyProfiles() {
    const profiles = [];
    for (const dayOfYear of [60, 140, 240, 330]) {
        for (let y = 0; y < 48; y++) {
            for (let x = 0; x < 48; x++) {
                profiles.push(mountainProfileAt(x + 0.5, y + 0.5, context({
                    height: 0.345 + (y % 34) * 0.019,
                    moisture: 0.28 + (x % 9) * 0.07,
                    dayOfYear,
                })));
            }
        }
    }
    return profiles;
}

test("all 1.2.12.1–1.2.12.77 requirements are declared exactly once", () => {
    assert.equal(MOUNTAIN_REQUIREMENTS.length, 77);
    assert.deepEqual(MOUNTAIN_REQUIREMENT_IDS,
        Array.from({ length: 77 }, (_, index) => "1.2.12." + (index + 1)));
    assert.equal(new Set(MOUNTAIN_REQUIREMENT_IDS).size, 77);
    const groups = ["landform", "vegetation", "climate", "rock", "water", "fauna", "economy", "hazard"];
    for (const requirement of MOUNTAIN_REQUIREMENTS) {
        assert.equal(mountainRequirement(requirement.id), requirement);
        assert.ok(requirement.label.length > 4);
        assert.ok(groups.includes(requirement.group), requirement.id + " has an unknown group");
    }
    assert.equal(mountainRequirement("1.2.12.77").group, "economy");
    assert.equal(mountainRequirement("1.2.12.78"), null);
    assert.equal(MOUNTAIN_LIMITS.requirements, 77);
});

test("all ten mountain formations and their flora are complete", () => {
    assert.equal(Object.keys(MOUNTAIN_FORMATIONS).length, 10);
    for (const [id, formation] of Object.entries(MOUNTAIN_FORMATIONS)) {
        assert.equal(formation.id, id);
        assert.ok(formation.label.length > 3);
        assert.ok(formation.note.length > 12);
        for (const tree of formation.trees) assert.ok(MOUNTAIN_TREES[tree], id + " references missing tree " + tree);
        for (const shrub of formation.shrubs) assert.ok(MOUNTAIN_SHRUBS[shrub], id + " references missing shrub " + shrub);
        for (const grass of formation.grasses) assert.ok(MOUNTAIN_GRASSES[grass], id + " references missing grass " + grass);
        for (const flower of formation.flowers) assert.ok(MOUNTAIN_FLOWERS[flower], id + " references missing flower " + flower);
        for (const moss of formation.mosses) assert.ok(MOUNTAIN_MOSSES[moss], id + " references missing moss " + moss);
    }
    for (const tree of Object.values(MOUNTAIN_TREES)) {
        assert.ok(tree.heightMeters >= 6);
        assert.ok(SEASONS.every(season => /^#[0-9a-f]{6}$/i.test(tree.colours[season])));
        for (const good of tree.goods) assert.ok(FOREST_GOODS[good], tree.id + " references missing good " + good);
    }
    for (const animal of Object.values(MOUNTAIN_FAUNA)) {
        assert.ok(animal.seasons.every(season => SEASONS.includes(season)));
        assert.ok(animal.kind.length > 2);
        assert.ok(animal.label.length > 2);
    }
    assert.equal(MOUNTAIN_LIMITS.trees, Object.keys(MOUNTAIN_TREES).length);
    assert.equal(MOUNTAIN_LIMITS.formations, 10);
});

test("every new mountain good reaches the shared ledger and a delivery channel", () => {
    for (const good of Object.values(MOUNTAIN_GOODS)) {
        assert.equal(FOREST_GOODS[good.id], good);
        assert.ok(forestDeliveryChannel(good.id), good.id + " has no delivery channel");
    }
});

test("the mountain profile is deterministic, bounded and seasonally variable", () => {
    const first = mountainProfileAt(12.5, 9.5, context({ height: 0.7, moisture: 0.55, dayOfYear: 140 }));
    const second = mountainProfileAt(12.5, 9.5, context({ height: 0.7, moisture: 0.55, dayOfYear: 140 }));
    assert.deepEqual(second, first);
    assert.equal(first.mountain, true);
    assert.equal(first.biome, "mountain");
    assert.ok(first.features.length >= 30);
    assert.match(first.grassHex, /^#[0-9a-f]{6}$/i);
    assert.match(first.groundHex, /^#[0-9a-f]{6}$/i);
    assert.match(first.visual.snowHex, /^#[0-9a-f]{6}$/i);
    assert.equal(first.year, 7);

    const winter = mountainProfileAt(12.5, 9.5, context({ height: 0.7, moisture: 0.55, dayOfYear: 330 }));
    assert.ok(winter.climate.snow >= first.climate.snow);
    assert.ok(winter.water.avalanche >= first.water.avalanche);

    for (const profile of [first, winter]) {
        for (const group of ["landform", "soil", "water", "climate", "vegetation", "economy", "hazards", "visual"]) {
            for (const [key, value] of Object.entries(profile[group])) {
                if (typeof value !== "number") continue;
                if (["altitudeM", "waterLineM"].includes(key)) continue;
                assert.ok(Number.isFinite(value), `${group}.${key} must be finite`);
                assert.ok(value >= 0 && value <= 1, `${group}.${key} must be bounded, got ${value}`);
            }
        }
        assert.ok(profile.fauna.length <= MOUNTAIN_LIMITS.maxFauna);
        assert.ok(profile.vegetation.flowers.length <= MOUNTAIN_LIMITS.maxFlowers);
        assert.ok(profile.goods.length <= MOUNTAIN_LIMITS.maxGoods);
        assert.equal(new Set(profile.features).size, profile.features.length);
        assert.ok(profile.features.every(id => MOUNTAIN_REQUIREMENT_IDS.includes(id)));
    }
    assert.notDeepEqual(mountainProfileAt(12.5, 9.5, context({ seed: 20261213, height: 0.7 })), first);
});

test("the four-season survey reaches all 77 requirements and all ten formations", () => {
    const seen = new Set();
    const formations = new Set();
    for (const profile of surveyProfiles()) {
        formations.add(profile.formation);
        for (const id of profile.features) seen.add(id);
    }
    assert.deepEqual(MOUNTAIN_REQUIREMENT_IDS.filter(id => !seen.has(id)), []);
    assert.deepEqual(Object.keys(MOUNTAIN_FORMATIONS).filter(id => !formations.has(id)), []);
    assert.equal(formations.size, 10);
});

test("mountains are the dedicated mountain climate and expose real products", () => {
    const ctx = context({ height: 0.62, moisture: 0.55 });
    assert.ok(mountainPotentialAt(1.5, 1.5, ctx) > 0.24);
    assert.equal(isMountainSite(1.5, 1.5, ctx), true);
    for (const climate of ["temperate", "taiga", "tundra", "savanna", "tropical", "arid", "mediterranean", "swamp"]) {
        assert.equal(mountainPotentialAt(1.5, 1.5, { ...ctx, climate }), 0, climate + " must not generate mountain profiles");
        assert.equal(isMountainSite(1.5, 1.5, { ...ctx, climate }), false);
    }
    assert.equal(mountainPotentialAt(1.5, 1.5, { ...ctx, height: 0.32 }), 0);
    const products = mountainProductsAt(1.5, 1.5, ctx);
    assert.ok(products);
    assert.equal(products.x, 1);
    assert.equal(products.y, 1);
    assert.ok(products.goods.length > 0);
    assert.equal(mountainGoodsFor(products.profile, 140).length, products.goods.length);
    assert.match(mountainSummary(products.profile), /·/);
    assert.equal(mountainProductsAt(1.5, 1.5, { ...ctx, climate: "temperate" }), null);
});

test("the mountain renderer draws rock, snow, water and works within caps", () => {
    let calls = 0;
    const ctx = new Proxy({}, {
        get: () => () => { calls += 1; },
        set: () => true,
    });
    const profile = mountainProfileAt(10.5, 10.5, context({
        height: 0.75, moisture: 0.58, dayOfYear: 330,
        use: { state: "wild", mine: true, quarry: true, road: true, fortress: true, aqueduct: true },
    }));
    drawMountain(ctx, 12, 18, 48, profile, 0.2, 0.5, 0.7, 1234, 1, 0.7, 330, "mountain");
    assert.ok(calls > 40);
    assert.ok(profile.visual.windSway >= 0);
    const treeProfile = surveyProfiles().find(item => item.trees.length);
    assert.ok(treeProfile, "a tree-bearing mountain tile must exist");
    calls = 0;
    drawMountainTree(ctx, 12, 18, 48, treeProfile.trees[0], treeProfile, 0.4);
    assert.ok(calls > 8);
});
