import test from "node:test";
import assert from "node:assert/strict";
import {
    TUNDRA_FAUNA, TUNDRA_FLOWERS, TUNDRA_FORMATIONS, TUNDRA_GOODS,
    TUNDRA_GRASSES, TUNDRA_HERBS, TUNDRA_LICHENS, TUNDRA_LIMITS,
    TUNDRA_REQUIREMENTS, TUNDRA_REQUIREMENT_IDS, TUNDRA_SHRUBS,
    TUNDRA_TREES, isTundraSite, tundraGoodsFor, tundraPotentialAt,
    tundraProductsAt, tundraProfileAt, tundraRequirement, tundraSummary,
} from "../../js/world/tundra-ecology.js";
import { FOREST_GOODS } from "../../js/world/forest-ecology.js";
import { forestDeliveryChannel } from "../../js/systems/forest-gathering.js";
import { seasonalState } from "../../js/world/season.js";

const SEASONS = ["spring", "summer", "autumn", "winter"];
const BASE = Object.freeze({
    seed: 20261113,
    seaLevel: 0.33,
    climate: "tundra",
    year: 7,
    use: { state: "wild" },
    hour: 12,
    weather: "clear",
    wind: 1.1,
});
const MODS = Object.freeze([
    { moisture: 0.55, temperature: 0.22, height: 0.42, dayOfYear: 140, hour: 12 },
    { moisture: 0.78, temperature: 0.19, height: 0.38, dayOfYear: 140, hour: 12 },
    { moisture: 0.25, temperature: 0.16, height: 0.54, dayOfYear: 140, hour: 12 },
    { moisture: 0.6, temperature: 0.2, height: 0.4, dayOfYear: 40, hour: 2 },
    { moisture: 0.5, temperature: 0.2, height: 0.4, dayOfYear: 340, hour: 2 },
    { moisture: 0.72, temperature: 0.18, height: 0.36, dayOfYear: 300, hour: 12 },
    { moisture: 0.35, temperature: 0.14, height: 0.62, dayOfYear: 140, hour: 12 },
    { moisture: 0.82, temperature: 0.22, height: 0.35, dayOfYear: 180, hour: 12 },
    { moisture: 0.45, temperature: 0.2, height: 0.47, dayOfYear: 220, hour: 12, weather: "storm", wind: 2 },
    { moisture: 0.62, temperature: 0.18, height: 0.52, dayOfYear: 120, hour: 12 },
    { moisture: 0.9, temperature: 0.2, height: 0.335, dayOfYear: 60, hour: 2 },
    { moisture: 0.3, temperature: 0.16, height: 0.5, dayOfYear: 60, hour: 2 },
]);

// Ten deterministic tiles chosen by the ecology itself: one for every
// formation, together reaching every 1.2.9 requirement without hand-placed
// demo props.
const SURVEY = Object.freeze([
    { x: 19.5, y: 18.5, formation: "moss-tundra", overrides: MODS[6] },
    { x: 39.5, y: 0.5, formation: "lichen-tundra", overrides: MODS[6] },
    { x: 15.5, y: 25.5, formation: "dwarf-shrub-tundra", overrides: MODS[11] },
    { x: 27.5, y: 18.5, formation: "willow-thicket", overrides: MODS[3] },
    { x: 27.5, y: 7.5, formation: "berry-heath", overrides: MODS[6] },
    { x: 25.5, y: 8.5, formation: "sedge-wetland", overrides: MODS[1] },
    { x: 38.5, y: 37.5, formation: "frost-polygon", overrides: MODS[6] },
    { x: 3.5, y: 9.5, formation: "rocky-tundra", overrides: MODS[6] },
    { x: 1.5, y: 9.5, formation: "coastal-tundra", overrides: { ...MODS[10], height: 0.34 } },
    { x: 31.5, y: 0.5, formation: "snowfield-tundra", overrides: MODS[5] },
]);

const context = overrides => ({ ...BASE, ...overrides });
const surveyProfile = entry => tundraProfileAt(entry.x, entry.y, context(entry.overrides));

test("all 1.2.9.1–1.2.9.48 requirements are declared exactly once", () => {
    assert.equal(TUNDRA_REQUIREMENTS.length, 48);
    assert.deepEqual(TUNDRA_REQUIREMENT_IDS, Array.from({ length: 48 }, (_, index) => "1.2.9." + (index + 1)));
    assert.equal(new Set(TUNDRA_REQUIREMENT_IDS).size, 48);
    const groups = ["vegetation", "soil", "water", "landform", "climate", "visual", "fauna", "economy", "hazard"];
    for (const requirement of TUNDRA_REQUIREMENTS) {
        assert.equal(tundraRequirement(requirement.id), requirement);
        assert.ok(requirement.label.length > 4);
        assert.ok(groups.includes(requirement.group), requirement.id + " has an unknown group");
    }
    assert.equal(tundraRequirement("1.2.9.1").key, "moose-lichen");
    assert.equal(tundraRequirement("1.2.9.48").group, "economy");
    assert.equal(tundraRequirement("1.2.9.49"), null);
    assert.equal(TUNDRA_LIMITS.requirements, 48);
});

test("all tundra formations, flora, fauna and goods form a complete vocabulary", () => {
    assert.equal(Object.keys(TUNDRA_FORMATIONS).length, 10);
    assert.equal(Object.keys(TUNDRA_LICHENS).length, 4);
    assert.equal(Object.keys(TUNDRA_GRASSES).length, 4);
    assert.equal(Object.keys(TUNDRA_SHRUBS).length, 5);
    assert.equal(Object.keys(TUNDRA_TREES).length, 3);
    for (const [id, formation] of Object.entries(TUNDRA_FORMATIONS)) {
        assert.equal(formation.id, id);
        assert.ok(formation.label.length > 3);
        assert.ok(formation.note.length > 8);
        for (const lichen of formation.lichens) assert.ok(TUNDRA_LICHENS[lichen], id + " references missing lichen " + lichen);
        for (const grass of formation.grasses) assert.ok(TUNDRA_GRASSES[grass], id + " references missing grass " + grass);
        for (const shrub of formation.shrubs) assert.ok(TUNDRA_SHRUBS[shrub], id + " references missing shrub " + shrub);
    }
    for (const lichen of Object.values(TUNDRA_LICHENS)) {
        assert.ok(lichen.colours.every(colour => /^#[0-9a-f]{6}$/i.test(colour)));
        for (const good of lichen.goods) assert.ok(FOREST_GOODS[good]);
    }
    for (const grass of Object.values(TUNDRA_GRASSES)) {
        assert.ok(grass.colours.every(colour => /^#[0-9a-f]{6}$/i.test(colour)));
        for (const good of grass.goods) assert.ok(FOREST_GOODS[good]);
    }
    for (const shrub of Object.values(TUNDRA_SHRUBS)) {
        assert.ok(shrub.colours.every(colour => /^#[0-9a-f]{6}$/i.test(colour)));
        for (const good of shrub.goods) assert.ok(FOREST_GOODS[good]);
    }
    for (const tree of Object.values(TUNDRA_TREES)) {
        assert.ok(tree.heightMeters < 3, tree.id + " must stay below the tall-tree line");
        assert.ok(SEASONS.every(season => /^#[0-9a-f]{6}$/i.test(tree.colours[season])));
        for (const good of tree.goods) assert.ok(FOREST_GOODS[good]);
    }
    for (const flower of Object.values(TUNDRA_FLOWERS)) {
        assert.ok(flower.colours.every(colour => /^#[0-9a-f]{6}$/i.test(colour)));
        assert.ok(flower.seasons.every(season => SEASONS.includes(season)));
    }
    for (const herb of Object.values(TUNDRA_HERBS)) {
        assert.ok(herb.seasons.every(season => SEASONS.includes(season)));
        assert.match(herb.colour, /^#[0-9a-f]{6}$/i);
    }
    for (const animal of Object.values(TUNDRA_FAUNA)) {
        assert.ok(animal.seasons.every(season => SEASONS.includes(season)));
        assert.ok(animal.kind.length > 2);
        assert.ok(animal.label.length > 2);
    }
    for (const good of Object.values(TUNDRA_GOODS)) {
        assert.equal(FOREST_GOODS[good.id], good);
        const channel = forestDeliveryChannel(good.id);
        assert.ok(channel, good.id + " has no delivery channel");
        assert.equal(channel, good.category === "medicine" ? "medicine"
            : ["cloudberry", "crowberry", "arctic-char"].includes(good.id) ? "food" : "gold");
    }
});

test("the tundra profile is deterministic and every exposed number is bounded", () => {
    const first = surveyProfile(SURVEY[0]);
    const second = surveyProfile(SURVEY[0]);
    assert.deepEqual(second, first);
    assert.equal(first.tundra, true);
    assert.equal(first.biome, "tundra");
    assert.ok(first.features.length > 30);
    assert.match(first.grassHex, /^#[0-9a-f]{6}$/i);
    assert.match(first.groundHex, /^#[0-9a-f]{6}$/i);
    assert.equal(tundraProfileAt(SURVEY[0].x, SURVEY[0].y, context({ ...SURVEY[0].overrides, year: 20 })).year, 20);
    const other = tundraProfileAt(SURVEY[0].x, SURVEY[0].y, context({ ...SURVEY[0].overrides, seed: 20261114 }));
    assert.notDeepEqual(other, first);
    for (const profile of [first, other]) {
        for (const group of ["hazards", "soil", "economy", "materials", "water", "landform"]) {
            for (const [key, value] of Object.entries(profile[group])) {
                if (typeof value !== "number") continue;
                assert.ok(Number.isFinite(value), `${group}.${key} must be finite`);
                if (key === "thawDepthCm" || key === "growingSeasonDays" || key === "polygonCount") continue;
                assert.ok(value >= 0 && value <= 1, `${group}.${key} must be bounded`);
            }
        }
        for (const [key, value] of Object.entries(profile.visual)) {
            if (typeof value !== "number" || key === "phase" || key === "wind") continue;
            assert.ok(Number.isFinite(value) && value >= 0 && value <= 1, `visual.${key} must be bounded`);
        }
        assert.ok(profile.fauna.length <= TUNDRA_LIMITS.maxFauna);
        assert.ok(profile.vegetation.flowers.length <= TUNDRA_LIMITS.maxFlowers);
        assert.ok(profile.goods.length <= TUNDRA_LIMITS.maxGoods);
        assert.equal(new Set(profile.features).size, profile.features.length);
        assert.ok(profile.features.every(id => TUNDRA_REQUIREMENT_IDS.includes(id)));
    }
});

test("the ten-tile survey reaches every one of the 48 requirements and all ten formations", () => {
    const seen = new Set();
    const formations = new Set();
    for (const entry of SURVEY) {
        const profile = surveyProfile(entry);
        assert.equal(profile.formation, entry.formation);
        assert.equal(isTundraSite(entry.x, entry.y, context(entry.overrides)), true);
        formations.add(profile.formation);
        for (const id of profile.features) seen.add(id);
    }
    assert.deepEqual(TUNDRA_REQUIREMENT_IDS.filter(id => !seen.has(id)), []);
    assert.equal(formations.size, 10);
});

test("the tundra is the dedicated cold climate and nowhere else", () => {
    assert.equal(tundraPotentialAt(1, 1, context({ climate: "temperate" })), 0);
    assert.equal(tundraPotentialAt(1, 1, context({ climate: "northern" })), 0);
    assert.equal(tundraPotentialAt(1, 1, context({ height: 0.1 })), 0);
    assert.ok(tundraPotentialAt(1, 1, context()) > 0.5);
    assert.ok(isTundraSite(1, 1, context()));
    const low = tundraProfileAt(1, 1, context({ height: 0.4, moisture: 0.55 }));
    assert.ok(low.landform.stability >= 0 && low.landform.stability <= 1);
    assert.ok(low.soil.permafrost > 0.4);
    assert.ok(low.economy.growingSeasonDays < 120);
    assert.ok(low.economy.buildingMaterials < 0.5);
    assert.ok(low.hazards.hypothermia > 0.3);
});

test("seasonal tundra keeps snow outside summer and thaws only a shallow active layer", () => {
    const summer = tundraProfileAt(20.5, 4.5, context({ ...MODS[0], dayOfYear: 140 }));
    const winter = tundraProfileAt(20.5, 4.5, context({ ...MODS[0], dayOfYear: 340 }));
    const spring = tundraProfileAt(20.5, 4.5, context({ ...MODS[3], dayOfYear: 40 }));
    assert.equal(summer.season, "summer");
    assert.ok(summer.visual.snowCover < 0.1);
    assert.ok(summer.soil.activeLayer > winter.soil.activeLayer);
    assert.equal(winter.season, "winter");
    assert.ok(winter.visual.snowCover > 0.8);
    assert.ok(winter.features.includes("1.2.9.23"));
    assert.ok(spring.vegetation.bloom > 0.15);
    assert.ok(spring.features.includes("1.2.9.20"));
    const seasonal = seasonalState(140, "tundra");
    assert.equal(seasonal.climate, "tundra");
    assert.ok(seasonal.snowCover < 0.1);
    assert.ok(seasonalState(340, "tundra").snowCover > 0.8);
    // The active layer is a summer feature, not a permanent thaw.
    assert.ok(summer.soil.activeLayer > 0.15);
    assert.ok(winter.soil.activeLayer < summer.soil.activeLayer);
});

test("tundra products use the shared ledger and respect the seasonal window", () => {
    const summer = surveyProfile(SURVEY[1]);
    const winter = tundraProfileAt(SURVEY[1].x, SURVEY[1].y, context({ ...SURVEY[1].overrides, dayOfYear: 340 }));
    assert.ok(summer.goods.every(good => FOREST_GOODS[good.id]));
    assert.ok(tundraGoodsFor(summer, 140).length > 0);
    assert.ok(tundraGoodsFor(winter, 340).every(good => good.id !== "cloudberry"));
    assert.equal(tundraProductsAt(0.5, 0.5, context({ height: 0.1 })), null);
    const products = tundraProductsAt(SURVEY[1].x, SURVEY[1].y, context(SURVEY[1].overrides));
    assert.ok(products);
    assert.ok(products.goods.every(good => FOREST_GOODS[good.id]));
    assert.match(tundraSummary(products.profile), /tundra|moss|lichen|frost|snow/i);
});

test("reindeer, foxes, ptarmigan, rodents, wolves, migrants, insects and herds are present", () => {
    const profiles = SURVEY.map(surveyProfile);
    const fauna = profiles.flatMap(profile => profile.fauna);
    const spring = tundraProfileAt(SURVEY[5].x, SURVEY[5].y, context({ ...SURVEY[5].overrides, dayOfYear: 40 }));
    assert.ok(fauna.some(animal => animal.id === "reindeer"));
    assert.ok(fauna.some(animal => animal.id === "arctic-fox"));
    assert.ok(fauna.some(animal => animal.groundBird));
    assert.ok(fauna.some(animal => animal.group === "rodent"));
    assert.ok(fauna.some(animal => animal.id === "wolf" || animal.id === "wolverine"));
    assert.ok(fauna.some(animal => animal.migratoryBird));
    assert.ok(fauna.some(animal => animal.herd));
    assert.ok(fauna.some(animal => animal.group === "insect"));
    assert.ok(spring.vegetation.bloom > 0.15);
    assert.ok(spring.features.includes("1.2.9.20"));
    assert.ok(profiles.some(profile => profile.features.includes("1.2.9.32")));
    assert.ok(profiles.some(profile => profile.features.includes("1.2.9.30")));
});
