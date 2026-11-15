import test from "node:test";
import assert from "node:assert/strict";
import {
    VOLCANO_FAUNA, VOLCANO_FLOWERS, VOLCANO_FORMATIONS, VOLCANO_GOODS, VOLCANO_GRASSES,
    VOLCANO_LIMITS, VOLCANO_MOSSES, VOLCANO_REQUIREMENTS, VOLCANO_REQUIREMENT_IDS,
    VOLCANO_SHRUBS, VOLCANO_TREES, isVolcanoSite, volcanoGoodsFor, volcanoPotentialAt,
    volcanoProductsAt, volcanoProfileAt, volcanoRequirement, volcanoRequirementAudit, volcanoSummary,
} from "../../js/world/volcano-ecology.js";
import { FOREST_GOODS } from "../../js/world/forest-ecology.js";
import { forestDeliveryChannel } from "../../js/systems/forest-gathering.js";
import { drawVolcano, drawVolcanoTree } from "../../js/presentation/rendering/volcano-render.js";

const SEASONS = ["spring", "summer", "autumn", "winter"];
const BASE = Object.freeze({
    seed: 20261313, seaLevel: 0.33, climate: "volcanic",
    temperature: 0.7, year: 7, use: { state: "wild" },
    hour: 8, weather: "clear", wind: 1.1,
});

const context = overrides => ({ ...BASE, ...overrides });

function surveyProfiles() {
    const profiles = [];
    for (const year of [1, 3, 8]) {
        for (const dayOfYear of [60, 140, 240, 330]) {
            for (let y = 0; y < 48; y++) {
                for (let x = 0; x < 48; x++) {
                    profiles.push(volcanoProfileAt(x + 0.5, y + 0.5, context({
                        year,
                        height: 0.352 + (y % 32) * 0.019,
                        moisture: 0.24 + (x % 9) * 0.07,
                        dayOfYear,
                    })));
                }
            }
        }
    }
    return profiles;
}

test("all 1.2.13.1–1.2.13.73 requirements are declared exactly once", () => {
    assert.equal(VOLCANO_REQUIREMENTS.length, 73);
    assert.deepEqual(VOLCANO_REQUIREMENT_IDS,
        Array.from({ length: 73 }, (_, index) => "1.2.13." + (index + 1)));
    assert.equal(new Set(VOLCANO_REQUIREMENT_IDS).size, 73);
    const groups = ["landform", "rock", "climate", "hazard", "water", "vegetation", "fauna", "economy", "succession"];
    for (const requirement of VOLCANO_REQUIREMENTS) {
        assert.equal(volcanoRequirement(requirement.id), requirement);
        assert.ok(requirement.label.length > 4);
        assert.ok(groups.includes(requirement.group), requirement.id + " has an unknown group");
    }
    assert.equal(volcanoRequirement("1.2.13.73").group, "succession");
    assert.equal(volcanoRequirement("1.2.13.74"), null);
    assert.equal(VOLCANO_LIMITS.requirements, 73);
});

test("all ten volcanic formations and their species vocabulary are complete", () => {
    assert.equal(Object.keys(VOLCANO_FORMATIONS).length, 10);
    for (const [id, formation] of Object.entries(VOLCANO_FORMATIONS)) {
        assert.equal(formation.id, id);
        assert.ok(formation.label.length > 3);
        assert.ok(formation.note.length > 12);
        for (const tree of formation.trees) assert.ok(VOLCANO_TREES[tree], id + " references missing tree " + tree);
        for (const shrub of formation.shrubs) assert.ok(VOLCANO_SHRUBS[shrub], id + " references missing shrub " + shrub);
        for (const grass of formation.grasses) assert.ok(VOLCANO_GRASSES[grass], id + " references missing grass " + grass);
        for (const flower of formation.flowers) assert.ok(VOLCANO_FLOWERS[flower], id + " references missing flower " + flower);
        for (const moss of formation.mosses) assert.ok(VOLCANO_MOSSES[moss], id + " references missing moss " + moss);
    }
    for (const tree of Object.values(VOLCANO_TREES)) {
        assert.ok(tree.heightMeters >= 6);
        assert.ok(SEASONS.every(season => /^#[0-9a-f]{6}$/i.test(tree.colours[season])));
        for (const good of tree.goods) assert.ok(FOREST_GOODS[good], tree.id + " references missing good " + good);
    }
    for (const animal of Object.values(VOLCANO_FAUNA)) {
        assert.ok(animal.seasons.every(season => SEASONS.includes(season)));
        assert.ok(animal.kind.length > 2);
        assert.ok(animal.label.length > 2);
    }
    assert.equal(VOLCANO_LIMITS.trees, Object.keys(VOLCANO_TREES).length);
    assert.equal(VOLCANO_LIMITS.formations, 10);
});

test("every volcanic good reaches the shared ledger and a delivery channel", () => {
    for (const good of Object.values(VOLCANO_GOODS)) {
        assert.equal(FOREST_GOODS[good.id], good, good.id + " is missing from the shared catalogue");
        assert.ok(forestDeliveryChannel(good.id), good.id + " has no delivery channel");
    }
});

test("the volcanic profile is deterministic, bounded and seasonally variable", () => {
    const first = volcanoProfileAt(12.5, 9.5, context({ height: 0.72, moisture: 0.42, dayOfYear: 140 }));
    const second = volcanoProfileAt(12.5, 9.5, context({ height: 0.72, moisture: 0.42, dayOfYear: 140 }));
    assert.deepEqual(second, first);
    assert.equal(first.volcanic, true);
    assert.equal(first.biome, "volcanic");
    assert.ok(first.features.length >= 30);
    assert.match(first.grassHex, /^#[0-9a-f]{6}$/i);
    assert.match(first.groundHex, /^#[0-9a-f]{6}$/i);
    assert.match(first.visual.lavaHex, /^#[0-9a-f]{6}$/i);
    assert.equal(first.year, 7);
    assert.ok(first.climate.cycleYears >= 5 && first.climate.cycleYears <= 19);

    const winter = volcanoProfileAt(12.5, 9.5, context({ height: 0.72, moisture: 0.42, dayOfYear: 330 }));
    assert.notDeepEqual(winter, first);
    for (const profile of [first, winter]) {
        for (const group of ["landform", "soil", "water", "climate", "vegetation", "economy", "hazards", "visual"]) {
            for (const [key, value] of Object.entries(profile[group])) {
                if (typeof value !== "number") continue;
                if (["cycleYears", "yearsSinceEruption", "temperature", "ageYears", "waterLineM", "stageRank"].includes(key)) continue;
                assert.ok(Number.isFinite(value), `${group}.${key} must be finite`);
                assert.ok(value >= 0 && value <= 1, `${group}.${key} must be bounded, got ${value}`);
            }
        }
        assert.ok(profile.fauna.length <= VOLCANO_LIMITS.maxFauna);
        assert.ok(profile.vegetation.flowers.length <= VOLCANO_LIMITS.maxFlowers);
        assert.ok(profile.goods.length <= VOLCANO_LIMITS.maxGoods);
        assert.equal(new Set(profile.features).size, profile.features.length);
        assert.ok(profile.features.every(id => VOLCANO_REQUIREMENT_IDS.includes(id)));
    }
    assert.notDeepEqual(volcanoProfileAt(12.5, 9.5, context({ seed: 20261314, height: 0.72 })), first);
});

test("the multi-year survey reaches every natural requirement and all ten formations", () => {
    const seen = new Set();
    const formations = new Set();
    for (const profile of surveyProfiles()) {
        formations.add(profile.formation);
        for (const id of profile.features) seen.add(id);
    }
    const natural = VOLCANO_REQUIREMENT_IDS.filter(id => !["1.2.13.66"].includes(id));
    assert.deepEqual(natural.filter(id => !seen.has(id)), []);
    assert.deepEqual(Object.keys(VOLCANO_FORMATIONS).filter(id => !formations.has(id)), []);
    assert.equal(formations.size, 10);

    // Destruction is not passive scenery: it appears when an active eruption
    // actually threatens a settlement or infrastructure on the same tile.
    const threatened = volcanoProfileAt(10.5, 0.5, context({
        year: 1, dayOfYear: 140, height: 0.352, moisture: 0.24, use: { settlement: true },
    }));
    assert.ok(threatened.hazards.destruction > 0.5);
    assert.ok(threatened.features.includes("1.2.13.66"));
    const wild = volcanoProfileAt(10.5, 0.5, context({
        year: 1, dayOfYear: 140, height: 0.352, moisture: 0.24, use: {},
    }));
    assert.equal(wild.features.includes("1.2.13.66"), false);
});

test("feature flags are evidence from the tile, not a formation checklist", () => {
    const profiles = surveyProfiles();
    const forest = profiles.find(profile => profile.vegetation.trees.length > 0);
    const bare = profiles.find(profile => profile.vegetation.stage === "bare");
    assert.ok(forest && bare);
    assert.equal(forest.features.includes("1.2.13.39"), true);
    assert.equal(bare.features.includes("1.2.13.39"), false);
    const cave = profiles.find(profile => profile.landform.cave);
    const noCave = profiles.find(profile => !profile.landform.cave);
    assert.ok(cave && noCave);
    assert.equal(cave.features.includes("1.2.13.47"), true);
    assert.equal(noCave.features.includes("1.2.13.47"), false);
    const reptile = profiles.find(profile => profile.fauna.some(entry => entry.group === "reptile"));
    assert.ok(reptile, "the survey must observe a reptile on warm volcanic ground");
    assert.equal(reptile.features.includes("1.2.13.43"), true);
    const audit = volcanoRequirementAudit(forest);
    assert.equal(audit.length, 73);
    assert.ok(audit.some(entry => entry.present));
});

test("volcanic ground is its own climate and exposes real products", () => {
    const ctx = context({ height: 0.62, moisture: 0.42 });
    assert.ok(volcanoPotentialAt(1.5, 1.5, ctx) > 0.24);
    assert.equal(isVolcanoSite(1.5, 1.5, ctx), true);
    for (const climate of ["temperate", "taiga", "tundra", "savanna", "tropical", "arid", "mediterranean", "swamp", "mountain"]) {
        assert.equal(volcanoPotentialAt(1.5, 1.5, { ...ctx, climate }), 0, climate + " must not generate volcanic profiles");
        assert.equal(isVolcanoSite(1.5, 1.5, { ...ctx, climate }), false);
    }
    assert.equal(volcanoPotentialAt(1.5, 1.5, { ...ctx, height: 0.32 }), 0);
    const products = volcanoProductsAt(1.5, 1.5, ctx);
    assert.ok(products);
    assert.equal(products.x, 1);
    assert.equal(products.y, 1);
    assert.ok(products.goods.length > 0);
    assert.equal(volcanoGoodsFor(products.profile, 140).length, products.goods.length);
    assert.match(volcanoSummary(products.profile), /·/);
    assert.equal(volcanoProductsAt(1.5, 1.5, { ...ctx, climate: "temperate" }), null);
});

test("the volcanic renderer draws landforms, hazards, flora and works within caps", () => {
    let calls = 0;
    const ctx = new Proxy({}, {
        get: () => () => { calls += 1; },
        set: () => true,
    });
    const profile = volcanoProfileAt(10.5, 10.5, context({
        height: 0.78, moisture: 0.5, dayOfYear: 330,
        use: {
            state: "wild", lavaQuarry: true, obsidianQuarry: true, pumiceQuarry: true,
            sulfurMine: true, metalMine: true, mineralWorks: true, geothermalPlant: true,
            fertileTerrace: true, craterExpedition: true, observatory: true, road: true,
        },
    }));
    drawVolcano(ctx, 12, 18, 48, profile, 0.2, 0.5, 0.7, 1234, 1);
    assert.ok(calls > 40, "expected a detailed volcanic tile, got " + calls + " canvas calls");
    const treeProfile = surveyProfiles().find(item => item.trees.length);
    assert.ok(treeProfile, "a tree-bearing volcanic tile must exist");
    calls = 0;
    drawVolcanoTree(ctx, 12, 18, 48, treeProfile.trees[0], treeProfile, 0.4);
    assert.ok(calls > 8);
});
