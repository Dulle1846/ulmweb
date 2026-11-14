import test from "node:test";
import assert from "node:assert/strict";
import {
    TAIGA_FAUNA, TAIGA_FLOWERS, TAIGA_FORMATIONS, TAIGA_GOODS,
    TAIGA_LIMITS, TAIGA_REQUIREMENTS, TAIGA_REQUIREMENT_IDS,
    TAIGA_SHRUBS, TAIGA_TREES, isTaigaSite, taigaGoodsFor, taigaOpenAt,
    taigaPotentialAt, taigaProductsAt, taigaProfileAt, taigaRequirement,
    taigaSummary,
} from "../../js/world/taiga-ecology.js";
import { CLIMATES } from "../../js/world/terrain-model.js";
import { FOREST_GOODS, forestStandAt } from "../../js/world/forest-ecology.js";
import { forestDeliveryChannel } from "../../js/systems/forest-gathering.js";
import { seasonalState } from "../../js/world/season.js";

const SEASONS = ["spring", "summer", "autumn", "winter"];
const BASE = Object.freeze({
    seed: 20261116,
    seaLevel: 0.33,
    climate: "taiga",
    temperature: 0.26,
    year: 7,
    hour: 12,
    weather: "clear",
    wind: 1.2,
    use: { state: "wild" },
});
const MODS = Object.freeze([
    { moisture: 0.6, height: 0.5, dayOfYear: 140, temperature: 0.26, weather: "storm" },
    { moisture: 0.8, height: 0.75, dayOfYear: 140, temperature: 0.22, weather: "storm" },
    { moisture: 0.3, height: 0.7, dayOfYear: 140, temperature: 0.2, weather: "clear" },
    { moisture: 0.6, height: 0.85, dayOfYear: 140, temperature: 0.2, weather: "clear" },
    { moisture: 0.65, height: 0.42, dayOfYear: 340, temperature: 0.2, weather: "snow" },
]);
const context = overrides => ({ ...BASE, ...overrides });

// Scan the deterministic climate, not hand-placed demo props. The union must
// reach every formation and every one of the 56 requirements.
const SURVEY = [];
for (let y = 0; y < 48; y++) {
    for (let x = 0; x < 48; x++) {
        for (const mod of MODS) SURVEY.push({ x: x + 0.5, y: y + 0.5, mod });
    }
}

const found = (() => {
    const formations = new Map();
    const features = new Set();
    for (const entry of SURVEY) {
        const profile = taigaProfileAt(entry.x, entry.y, context(entry.mod));
        if (!formations.has(profile.formation)) formations.set(profile.formation, profile);
        for (const id of profile.features) features.add(id);
    }
    return { formations, features };
})();

test("all 1.2.10.1–1.2.10.56 requirements are declared exactly once", () => {
    assert.equal(TAIGA_REQUIREMENTS.length, 56);
    assert.deepEqual(TAIGA_REQUIREMENT_IDS, Array.from({ length: 56 }, (_, index) => "1.2.10." + (index + 1)));
    assert.equal(new Set(TAIGA_REQUIREMENT_IDS).size, 56);
    const groups = ["vegetation", "soil", "water", "landform", "climate", "fauna", "economy", "hazard"];
    for (const requirement of TAIGA_REQUIREMENTS) {
        assert.equal(taigaRequirement(requirement.id), requirement);
        assert.ok(requirement.label.length > 2);
        assert.ok(groups.includes(requirement.group), requirement.id + " has an unknown group");
    }
    assert.equal(taigaRequirement("1.2.10.1").key, "spruce-forests");
    assert.equal(taigaRequirement("1.2.10.56").group, "economy");
    assert.equal(taigaRequirement("1.2.10.57"), null);
    assert.equal(TAIGA_LIMITS.requirements, 56);
});

test("taiga climate, formations, flora, fauna and goods form a complete vocabulary", () => {
    assert.ok(CLIMATES.some(entry => entry.id === "taiga"));
    assert.equal(Object.keys(TAIGA_FORMATIONS).length, 10);
    assert.equal(Object.keys(TAIGA_TREES).length, 10);
    assert.equal(Object.keys(TAIGA_SHRUBS).length, 8);
    for (const [id, formation] of Object.entries(TAIGA_FORMATIONS)) {
        assert.equal(formation.id, id);
        assert.ok(formation.label.length > 3);
        assert.ok(formation.note.length > 12);
        for (const tree of formation.trees) assert.ok(TAIGA_TREES[tree], id + " references missing tree " + tree);
        for (const shrub of formation.shrubs) assert.ok(TAIGA_SHRUBS[shrub], id + " references missing shrub " + shrub);
        for (const grass of formation.grasses) assert.ok(grass.length > 3);
        for (const lichen of formation.lichens) assert.ok(lichen.length > 3);
    }
    for (const tree of Object.values(TAIGA_TREES)) {
        assert.ok(tree.heightMeters >= 2, tree.id + " must be a real boreal tree");
        assert.ok(SEASONS.every(season => /^#[0-9a-f]{6}$/i.test(tree.colours[season])));
        for (const good of tree.goods) assert.ok(FOREST_GOODS[good], tree.id + " references missing good " + good);
    }
    for (const shrub of Object.values(TAIGA_SHRUBS)) {
        assert.ok(shrub.colours.every(colour => /^#[0-9a-f]{6}$/i.test(colour)));
        for (const good of shrub.goods) assert.ok(FOREST_GOODS[good], shrub.id + " references missing good " + good);
    }
    for (const flower of Object.values(TAIGA_FLOWERS)) {
        assert.ok(flower.colours.every(colour => /^#[0-9a-f]{6}$/i.test(colour)));
        assert.ok(flower.seasons.every(season => SEASONS.includes(season)));
    }
    for (const animal of Object.values(TAIGA_FAUNA)) {
        assert.ok(animal.seasons.every(season => SEASONS.includes(season)));
        assert.ok(animal.kind.length > 2);
        assert.ok(animal.label.length > 2);
    }
    const channels = {
        "taiga-herb": "medicine", "bear-fat": "medicine", "lake-fish": "food",
        "larch-cones": "gold", "birch-bark": "gold",
    };
    for (const good of Object.values(TAIGA_GOODS)) {
        assert.equal(FOREST_GOODS[good.id], good);
        assert.equal(forestDeliveryChannel(good.id), channels[good.id], good.id + " has the wrong delivery channel");
    }
});

test("the taiga profile is deterministic and every exposed number is bounded", () => {
    const first = taigaProfileAt(10.5, 10.5, context({ moisture: 0.62, height: 0.5 }));
    const second = taigaProfileAt(10.5, 10.5, context({ moisture: 0.62, height: 0.5 }));
    assert.deepEqual(second, first);
    assert.equal(first.taiga, true);
    assert.equal(first.biome, "taiga");
    assert.ok(first.features.length > 30);
    assert.match(first.grassHex, /^#[0-9a-f]{6}$/i);
    assert.match(first.groundHex, /^#[0-9a-f]{6}$/i);
    assert.equal(taigaProfileAt(10.5, 10.5, context({ moisture: 0.62, height: 0.5, year: 20 })).year, 20);
    const other = taigaProfileAt(10.5, 10.5, context({ moisture: 0.62, height: 0.5, seed: 20261117 }));
    assert.notDeepEqual(other, first);
    for (const profile of [first, other]) {
        for (const group of ["hazards", "soil", "economy", "water", "landform", "visual"]) {
            for (const [key, value] of Object.entries(profile[group])) {
                if (typeof value !== "number") continue;
                assert.ok(Number.isFinite(value), `${group}.${key} must be finite`);
                if (["snowDepthCm", "growingSeasonDays", "winterDays", "depthCm", "aboveSea", "phase", "wind", "sunlight"].includes(key)) continue;
                if (key.endsWith("Hex")) continue;
                assert.ok(value >= 0 && value <= 1, `${group}.${key} must be bounded, got ${value}`);
            }
        }
        assert.ok(profile.fauna.length <= TAIGA_LIMITS.maxFauna);
        assert.ok(profile.vegetation.flowers.length <= TAIGA_LIMITS.maxFlowers);
        assert.ok(profile.goods.length <= TAIGA_LIMITS.maxGoods);
        assert.equal(new Set(profile.features).size, profile.features.length);
        assert.ok(profile.features.every(id => TAIGA_REQUIREMENT_IDS.includes(id)));
    }
});

test("the deterministic taiga survey reaches all 56 requirements and all ten formations", () => {
    assert.equal(found.formations.size, 10);
    assert.deepEqual(TAIGA_REQUIREMENT_IDS.filter(id => !found.features.has(id)), []);
});

test("taiga is the dedicated boreal climate and nobody else inherits it", () => {
    for (const climate of ["temperate", "northern", "tundra", "savanna", "tropical", "arid"]) {
        assert.equal(taigaPotentialAt(1, 1, context({ climate })), 0);
    }
    assert.equal(taigaPotentialAt(1, 1, context({ height: 0.1 })), 0);
    assert.ok(taigaPotentialAt(1, 1, context()) > 0.5);
    assert.ok(isTaigaSite(1, 1, context()));
    const open = [];
    const closed = [];
    for (let y = 0; y < 24; y++) {
        for (let x = 0; x < 24; x++) {
            const point = context({ moisture: x / 24 * 0.7 + 0.2, height: y / 24 * 0.5 + 0.4 });
            if (taigaOpenAt(x + 0.5, y + 0.5, point)) open.push([x, y]);
            else closed.push([x, y]);
        }
    }
    assert.ok(open.length > 0, "a taiga world needs lakes, bogs, ecotones or clearings");
    assert.ok(closed.length > 0, "a taiga world needs closed forest");
    assert.equal(taigaOpenAt(1, 1, context({ climate: "tundra" })), false);
});

test("the taiga year is long, snowy and has a short intense summer", () => {
    const summer = taigaProfileAt(10.5, 10.5, context({ moisture: 0.62, height: 0.5, dayOfYear: 140 }));
    const winter = taigaProfileAt(10.5, 10.5, context({ moisture: 0.62, height: 0.5, dayOfYear: 340 }));
    const spring = taigaProfileAt(10.5, 10.5, context({ moisture: 0.62, height: 0.5, dayOfYear: 40 }));
    assert.equal(summer.season, "summer");
    assert.ok(summer.visual.snowCover < 0.05);
    assert.ok(summer.economy.growingSeasonDays < 135);
    assert.ok(summer.economy.summerIntensity > 0.7);
    assert.ok(summer.hazards.insects > 0.4);
    assert.ok(summer.hazards.fireRisk > 0.42);
    assert.equal(winter.season, "winter");
    assert.ok(winter.visual.snowCover > 0.8);
    assert.ok(winter.economy.winterDays >= 190);
    assert.ok(winter.economy.snowfall > 0.6);
    assert.ok(winter.hazards.frost > 0.55);
    assert.ok(spring.visual.snowCover > 0.05 && spring.visual.snowCover < 0.8);
    const seasonal = seasonalState(140, "taiga");
    assert.equal(seasonal.climate, "taiga");
    assert.ok(seasonal.snowCover < 0.05);
    assert.ok(seasonalState(340, "taiga").snowCover > 0.8);
    const lake = taigaProfileAt(12.5, 12.5, context({ moisture: 0.94, height: 0.38, dayOfYear: 340 }));
    assert.ok(lake.water.ice || lake.water.lake < 0.2);
});

test("taiga products use the shared ledger and respect the seasonal window", () => {
    const summer = taigaProfileAt(10.5, 10.5, context({ moisture: 0.62, height: 0.5, dayOfYear: 140 }));
    const winter = taigaProfileAt(10.5, 10.5, context({ moisture: 0.62, height: 0.5, dayOfYear: 340 }));
    assert.ok(summer.goods.every(good => FOREST_GOODS[good.id]));
    assert.ok(taigaGoodsFor(summer, 140).length > 0);
    assert.ok(taigaGoodsFor(winter, 340).every(good => good.id !== "lake-fish" && good.id !== "mushrooms"));
    assert.equal(taigaProductsAt(0.5, 0.5, context({ height: 0.1 })), null);
    const products = taigaProductsAt(10.5, 10.5, context({ moisture: 0.62, height: 0.5 }));
    assert.ok(products);
    assert.ok(products.goods.every(good => FOREST_GOODS[good.id]));
    assert.match(taigaSummary(products.profile), /taiga|spruce|pine|larch|birch|forest|lake|bog/i);
});

test("moose, reindeer, bears, cats, foxes, hares, birds, beaver, otter and summer insects are present", () => {
    const profiles = [...found.formations.values()];
    const fauna = [...found.formations.values()].flatMap(profile => profile.fauna);
    assert.ok(fauna.some(animal => animal.id === "moose" || animal.id === "reindeer"));
    assert.ok(fauna.some(animal => animal.id === "bear"));
    assert.ok(fauna.some(animal => animal.id === "wolf" || animal.id === "lynx"));
    assert.ok(fauna.some(animal => animal.id === "fox"));
    assert.ok(fauna.some(animal => animal.id === "hare" || animal.group === "rodent"));
    assert.ok(fauna.some(animal => animal.id === "owl" || animal.id === "crossbill" || animal.id === "capercaillie"));
    assert.ok(fauna.some(animal => animal.id === "beaver" || animal.id === "otter"));
    const summerProfiles = SURVEY.filter(entry => entry.mod.dayOfYear === 140)
        .map(entry => taigaProfileAt(entry.x, entry.y, context(entry.mod)));
    assert.ok(summerProfiles.some(profile => profile.fauna.some(animal => animal.group === "insect")));
    assert.ok(profiles.some(profile => profile.features.includes("1.2.10.26")));
    assert.ok(profiles.some(profile => profile.features.includes("1.2.10.31")));
    assert.ok(profiles.some(profile => profile.features.includes("1.2.10.45")));
    assert.ok(profiles.some(profile => profile.features.includes("1.2.10.47")));
});

test("taiga forest stands use the shared stand model but keep a boreal identity", () => {
    let taigaStands = 0;
    let coniferStands = 0;
    for (let y = 0; y < 40; y++) {
        for (let x = 0; x < 40; x++) {
            const stand = forestStandAt(x + 0.5, y + 0.5, context({
                moisture: 0.6, temperature: 0.26, height: 0.5, climate: "taiga", forests: 70, stockRatio: 1, rockLine: 0.92,
            }));
            if (!stand.forest) continue;
            assert.ok(stand.type === "taiga-spruce" || stand.type === "taiga-pine"
                || stand.type === "taiga-larch" || stand.type === "taiga-birch"
                || stand.type === "taiga-mixed" || stand.type === "snowbreak"
                || stand.type === "windthrow" || stand.type === "burned"
                || stand.type === "bark-beetle" || stand.type === "disease" || stand.type === "diseased",
                "unexpected taiga stand " + stand.type);
            if (stand.coniferShare > 0.4) coniferStands++;
            assert.ok(stand.snowPotential > 0);
            taigaStands++;
        }
    }
    assert.ok(taigaStands > 100);
    assert.ok(coniferStands > 20);
});
