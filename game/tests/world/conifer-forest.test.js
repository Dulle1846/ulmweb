import test from "node:test";
import assert from "node:assert/strict";
import {
    FOREST_GOODS, FOREST_SPECIES, FOREST_SUCCESSION_PROFILES, FOREST_TYPES,
    forestFaunaFor, forestGoodsFor, forestMicrofaunaAt, forestStandAt, forestSuccessionStage,
} from "../../js/world/forest-ecology.js";
import { foliageState } from "../../js/presentation/rendering/seasonal-foliage.js";

const CONIFERS = ["spruce", "fir", "pine", "larch", "juniper"];
const CONIFER_TYPES = [
    "sprucewood", "firwood", "pinewood", "larchwood", "pine-heath",
    "wet-conifer", "mountain-conifer", "subalpine-scrub", "mixed-conifer",
    "bark-beetle", "snowbreak", "drought-stressed",
];
const context = (overrides = {}) => ({
    seed: 20261109, moisture: 0.56, temperature: 0.55, height: 0.55,
    climate: "temperate", forests: 64, stockRatio: 1, rockLine: 0.92,
    ...overrides,
});

function findConiferStand(predicate = () => true) {
    for (const temperature of [0.3, 0.36, 0.44, 0.55]) {
        for (const moisture of [0.4, 0.5, 0.62, 0.76]) {
            for (const height of [0.5, 0.7, 0.84, 0.91]) {
                for (let y = 0; y < 72; y += 3) {
                    for (let x = 0; x < 72; x += 3) {
                        const stand = forestStandAt(x + 0.5, y + 0.5, context({ temperature, moisture, height }));
                        if (stand.forest && stand.conifer && predicate(stand)) return stand;
                    }
                }
            }
        }
    }
    return null;
}

test("five conifer species and twelve conifer formations share the ecosystem vocabulary", () => {
    assert.equal(Object.keys(FOREST_SPECIES).length, 13);
    for (const id of CONIFERS) {
        const species = FOREST_SPECIES[id];
        assert.ok(species, id + " must exist");
        assert.equal(species.conifer, true);
        assert.equal(species.leafShape, "needle");
        assert.ok(species.crownShape && species.tiers >= 3);
        assert.ok(FOREST_GOODS[species.wood], id + " needs a named timber good");
    }
    assert.equal(new Set(CONIFERS.map(id => FOREST_SPECIES[id].wood)).size, CONIFERS.length);
    assert.equal(Object.keys(FOREST_TYPES).length, 27);
    for (const id of CONIFER_TYPES) {
        assert.ok(FOREST_TYPES[id], id + " must exist");
        assert.equal(FOREST_TYPES[id].conifer, true);
        assert.ok(FOREST_TYPES[id].needleLitter > 0);
    }
    for (const good of ["spruce-cones", "fir-cones", "pine-cones", "resin", "juniper-berries", "blueberries", "lingonberries", "lichen"]) {
        assert.ok(FOREST_GOODS[good], good + " must be a real forest product");
    }
});

test("every conifer formation is reachable from cold, high or dry site conditions", () => {
    const found = new Set();
    for (const temperature of [0.3, 0.36, 0.44, 0.5, 0.55]) {
        for (const moisture of [0.4, 0.5, 0.62, 0.76]) {
            for (const height of [0.5, 0.7, 0.84, 0.91]) {
                for (let y = 0; y < 48; y += 4) {
                    for (let x = 0; x < 48; x += 4) {
                        const stand = forestStandAt(x + 0.5, y + 0.5, context({ temperature, moisture, height }));
                        if (stand.forest && stand.conifer) found.add(stand.type);
                    }
                }
            }
        }
    }
    for (const id of CONIFER_TYPES) {
        assert.ok(found.has(id), "expected reachable conifer formation " + id + "; found " + [...found].join(", "));
    }
});

test("cold highland transition belts keep mixed conifer stands reachable", () => {
    let mixed = null;
    for (let y = 0; y < 64 && !mixed; y += 3) {
        for (let x = 0; x < 64; x += 3) {
            const stand = forestStandAt(x + 0.5, y + 0.5, context({
                temperature: 0.38, moisture: 0.5, height: 0.84,
            }));
            if (stand.forest && stand.type === "mixed-conifer") {
                mixed = stand;
                break;
            }
        }
    }
    assert.ok(mixed, "a cold highland transition belt must generate mixed-conifer");
    assert.equal(mixed.conifer, true);
    assert.ok(mixed.coniferShare > 0.9);
    assert.ok(mixed.species.length >= 4);
});

test("a conifer stand exposes needle litter, podzol, conifer products and specialist fauna", () => {
    const stand = findConiferStand(entry => entry.type === "sprucewood");
    assert.ok(stand, "a sprucewood must be reachable");
    assert.ok(stand.coniferShare >= 0.4);
    assert.ok(stand.ground.needles > 0.3);
    assert.equal(stand.ground.soil, "podzol");
    assert.ok(stand.ground.lichen > 0);
    assert.ok(stand.goods.includes("spruce-timber"));
    assert.ok(stand.goods.includes("resin"));
    assert.ok(stand.visibility >= 0);
    assert.ok(stand.lightShaft >= 0);
    const summerFauna = [];
    for (const roll of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        summerFauna.push(...forestFaunaFor(stand, 160, "temperate", roll));
    }
    assert.ok(stand.fauna.includes("crossbill"), "the sprucewood habitat must list crossbills");
    assert.ok(summerFauna.length > 0);
    const micro = forestMicrofaunaAt(stand, 160, "temperate", 0.5);
    assert.ok(micro.some(entry => entry.id === "bark-beetle"));
});

test("larch loses its needles while spruce, fir, pine and juniper stay evergreen", () => {
    const summer = foliageState(150, { seed: 0.4, species: "larch" });
    const autumn = foliageState(275, { seed: 0.4, species: "larch" });
    const winter = foliageState(350, { seed: 0.4, species: "larch" });
    assert.equal(summer.leaf, 1);
    assert.ok(autumn.turn > 0.1);
    assert.ok(winter.leaf < 0.35);
    for (const species of ["spruce", "fir", "pine", "juniper"]) {
        for (const day of [0, 150, 275, 350]) {
            const sample = foliageState(day, { seed: 0.4, species });
            assert.equal(sample.leaf, 1, species + " must keep its needles on day " + day);
            assert.equal(sample.evergreen, true);
        }
    }
    assert.ok(foliageState(350, { species: "spruce" }).snow > 0.5);
    assert.ok(foliageState(350, { species: "spruce" }).snow > foliageState(350, { species: "larch" }).snow);
});

test("conifer products follow the season and keep timber available in winter", () => {
    const stand = findConiferStand(entry => entry.type === "pinewood" || entry.type === "larchwood");
    assert.ok(stand);
    const summer = forestGoodsFor(stand, 160);
    const autumn = forestGoodsFor(stand, 260);
    const winter = forestGoodsFor(stand, 350);
    assert.ok(summer.some(good => good.id === "resin"));
    assert.ok(autumn.some(good => ["spruce-cones", "fir-cones", "pine-cones", "juniper-berries"].includes(good.id)));
    assert.ok(winter.some(good => good.category === "wood"));
    assert.ok(winter.every(good => !["blueberries", "lingonberries"].includes(good.id)));
});

test("bark beetle, snowbreak and drought have durable succession profiles", () => {
    for (const kind of ["bark-beetle", "snowbreak", "drought-stressed"]) {
        assert.ok(FOREST_SUCCESSION_PROFILES[kind], kind + " needs a succession profile");
        assert.equal(forestSuccessionStage(kind, 0).id, "fresh");
        assert.equal(forestSuccessionStage(kind, FOREST_SUCCESSION_PROFILES[kind].freshDays).id, "regrowth");
        assert.equal(forestSuccessionStage(kind, FOREST_SUCCESSION_PROFILES[kind].recoveredDays).id, "recovered");
    }
    assert.ok(CONIFER_TYPES.includes("bark-beetle"));
    assert.ok(CONIFER_TYPES.includes("snowbreak"));
    assert.ok(CONIFER_TYPES.includes("drought-stressed"));
});
