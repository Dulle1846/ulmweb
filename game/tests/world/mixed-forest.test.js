import test from "node:test";
import assert from "node:assert/strict";
import {
    FOREST_GOODS, FOREST_PHENOLOGY, FOREST_SPECIES, FOREST_TYPES, FOREST_TYPE_IDS,
    SILVICULTURE_USES, forestLightTransmissionAt, forestMixedSummary, forestPhenologyAt,
    forestStandAt, forestSurveyAt, forestTreeForm, forestTypeIndex, pickSpecies,
} from "../../js/world/forest-ecology.js";

const MIXED_TYPES = Object.freeze([
    "mixed-oak-beech-spruce", "mixed-fir-beech-maple", "pine-broadleaf",
    "mixed-alluvial", "mixed-montane", "mixed-open", "mixed-dense",
    "mixed-ancient", "mixed-young", "mixed-ecotone",
    "coppice-with-standards", "selection-forest",
]);

const context = (overrides = {}) => ({
    seed: 20261108, moisture: 0.56, temperature: 0.55, height: 0.55,
    climate: "temperate", forests: 52, stockRatio: 1, rockLine: 0.92,
    ...overrides,
});

function collectMixed() {
    const found = new Map();
    for (const temperature of [0.44, 0.5, 0.55, 0.58, 0.62, 0.68]) {
        for (const moisture of [0.45, 0.52, 0.58, 0.66, 0.74, 0.8]) {
            for (const height of [0.55, 0.7, 0.82, 0.86]) {
                for (let y = 0; y < 48 && found.size < MIXED_TYPES.length; y += 2) {
                    for (let x = 0; x < 48; x += 2) {
                        const stand = forestStandAt(x + 0.5, y + 0.5, context({ temperature, moisture, height }));
                        if (stand.forest && FOREST_TYPES[stand.type]?.mixed) found.set(stand.type, stand);
                    }
                }
            }
        }
    }
    return found;
}

const mixed = collectMixed();
const sample = id => {
    const stand = mixed.get(id);
    assert.ok(stand, "expected reachable mixed formation " + id + "; found " + [...mixed.keys()].join(", "));
    return stand;
};

test("twenty species and thirty-nine formations preserve every existing index", () => {
    assert.equal(Object.keys(FOREST_SPECIES).length, 20);
    assert.equal(FOREST_TYPE_IDS.length, 39);
    assert.equal(forestTypeIndex("oakwood"), 1);
    assert.equal(forestTypeIndex("drought-stressed"), 27);
    assert.equal(forestTypeIndex("mixed-oak-beech-spruce"), 28);
    assert.equal(FOREST_TYPE_IDS[26], "drought-stressed");
    for (const id of MIXED_TYPES) {
        const formation = FOREST_TYPES[id];
        assert.ok(formation, id + " must exist");
        assert.equal(formation.mixed, true);
        assert.ok(Object.keys(formation.species).length >= 5, id + " needs at least five species");
        assert.ok(formation.canopyLayers >= 2, id + " needs at least two canopy layers");
        for (const use of formation.silviculture) assert.ok(SILVICULTURE_USES[use], id + " uses unknown silviculture " + use);
    }
    for (const id of ["ash", "hornbeam", "rowan", "hazel", "willow"]) {
        const species = FOREST_SPECIES[id];
        assert.ok(species, id + " must exist");
        assert.ok(FOREST_GOODS[species.wood], id + " needs a named timber");
        assert.ok(FOREST_PHENOLOGY[id], id + " needs flowering and fruiting windows");
    }
    for (const good of ["ash-keys", "hornbeam-seeds", "rowan-berries", "hazelnuts", "willow-withies", "woodruff", "valerian", "tinder-fungus", "elderberries"]) {
        assert.ok(FOREST_GOODS[good], good + " must be a real forest product");
    }
});

test("every mixed formation is reachable from climate and soil, not only the registry", () => {
    for (const id of MIXED_TYPES) sample(id);
    assert.ok(mixed.size >= MIXED_TYPES.length);
});

test("a mixed stand exposes a real mixture ratio, dominant species and distribution", () => {
    const shares = new Set();
    for (const id of MIXED_TYPES) {
        const stand = sample(id);
        const mix = stand.mixture;
        assert.equal(stand.mixed, true);
        assert.ok(mix, id + " needs a mixture object");
        assert.ok(Math.abs(mix.broadleafShare + mix.coniferShare - 1) < 1e-9, id + " shares must sum to one");
        assert.ok(mix.broadleafShare > 0, id + " must contain broadleaf trees");
        // Coppice-with-standards is deliberately a pure broadleaf working
        // wood; the other mixed formations combine both crown types.
        if (id !== "coppice-with-standards") {
            assert.ok(mix.coniferShare > 0, id + " must mix both crown types");
        }
        assert.equal(mix.dominant, stand.species[0].id);
        assert.ok(mix.dominantShare >= stand.species[1].weight / stand.species.reduce((sum, entry) => sum + entry.weight, 0));
        assert.ok(["grouped", "even", "mosaic"].includes(mix.pattern));
        assert.ok(mix.groups.length >= 2);
        assert.ok(mix.groups.every(group => group.species.length > 0 && group.share > 0));
        if (mix.pattern !== "even") {
            assert.ok(mix.tileGroup, id + " grouped/mosaic stands need a tile group");
            assert.ok(mix.tileGroup.species.length > 0);
        }
        shares.add(Math.round(mix.coniferShare * 20));
    }
    assert.ok(shares.size >= 6, "different mixtures must have different mixing ratios: " + [...shares]);
    assert.ok(mixed.get("mixed-fir-beech-maple").mixture.coniferShare > mixed.get("mixed-open").mixture.coniferShare,
        "cool mixed communities carry more conifer than open warm woods");
    assert.ok(mixed.get("mixed-alluvial").wetness > mixed.get("mixed-open").wetness,
        "wet mixed woods must differ from dry open woods");
});

test("grouped stands draw mostly from their own species group; even stands do not", () => {
    const grouped = [...mixed.values()].find(stand => stand.mixture.pattern === "grouped"
        && !stand.mixture.pureIsland && stand.mixture.tileGroup?.species.length >= 2);
    assert.ok(grouped, "a grouped mixed stand is required");
    const localIds = new Set(grouped.mixture.tileGroup.species.map(entry => entry.id));
    for (const roll of [0.01, 0.2, 0.45, 0.7]) {
        assert.ok(localIds.has(pickSpecies(grouped, roll)), "grouped roll " + roll + " left its tile group");
    }
    const even = [...mixed.values()].find(stand => stand.mixture.pattern === "even");
    assert.ok(even, "an evenly mixed stand is required");
    const picked = new Set([0.05, 0.2, 0.4, 0.6, 0.8, 0.95].map(roll => pickSpecies(even, roll)));
    assert.ok(picked.size >= 3, "an even stand must sample several species");
    assert.deepEqual(pickSpecies(grouped, 0.37), pickSpecies(grouped, 0.37), "grouped selection must replay exactly");
});

function findPureIsland(broadleaf) {
    const contexts = [
        context(),
        context({ temperature: 0.5, moisture: 0.58, height: 0.7 }),
        context({ temperature: 0.58, moisture: 0.5, height: 0.6 }),
        context({ temperature: 0.46, moisture: 0.64, height: 0.84 }),
    ];
    for (const ctx of contexts) {
        for (let y = 0; y < 120; y += 2) {
            for (let x = 0; x < 120; x += 2) {
                const stand = forestStandAt(x + 0.5, y + 0.5, ctx);
                const island = stand.mixture?.pureIsland;
                if (island?.active && island.broadleaf === broadleaf) return stand;
            }
        }
    }
    return null;
}

test("small pure broadleaf and conifer islands interrupt grouped mixed stands", () => {
    const broadleaf = findPureIsland(true);
    const conifer = findPureIsland(false);
    assert.ok(broadleaf, "a pure broadleaf island must occur in the mixed matrix");
    assert.ok(conifer, "a pure conifer island must occur in the mixed matrix");
    for (const stand of [broadleaf, conifer]) {
        const island = stand.mixture.pureIsland;
        assert.ok(island.active);
        assert.notEqual(stand.mixture.pattern, "even",
            "pure islands belong to grouped or mosaic stands, not even mixtures");
        assert.ok(FOREST_SPECIES[island.species], "the island must name a real species");
        assert.ok(stand.species.some(entry => entry.id === island.species));
        assert.equal(pickSpecies(stand, 0.01), island.species);
        assert.equal(pickSpecies(stand, 0.99), island.species);
        assert.equal(island.broadleaf, !FOREST_SPECIES[island.species].conifer);
        assert.match(forestMixedSummary(stand), /pure .* island/);
    }
    const evenStands = [...mixed.values()].filter(candidate => candidate.mixture.pattern === "even");
    assert.ok(evenStands.length >= 2, "the audit needs more than one evenly mixed formation");
    for (const even of evenStands) {
        assert.equal(even.mixture.pureIsland, null,
            "an even mixture keeps its even distribution instead of receiving a pure island");
    }
});

test("age structure, crown heights and canopy layers differ between old and young mixed woods", () => {
    const ancient = sample("mixed-ancient");
    const young = sample("mixed-young");
    assert.ok(ancient.ageStructure.ancient > ancient.ageStructure.young);
    assert.ok(young.ageStructure.young > young.ageStructure.ancient);
    assert.ok(ancient.ageStructure.uneven === true);
    assert.ok(ancient.crownHeightSpread >= young.crownHeightSpread, "old mixed woods hold a wider crown-height range");
    for (const stand of [ancient, young]) {
        assert.ok(stand.canopyLayers.length >= 2);
        for (const layer of stand.canopyLayers) {
            assert.ok(layer.low >= 0 && layer.high <= 1 && layer.high > layer.low);
            assert.ok(layer.label && layer.entries.length > 0);
        }
        const form = forestTreeForm(stand, 0.63);
        assert.ok([...stand.canopyLayers.map(layer => layer.id), "canopy"].includes(form.canopyLayer));
    }
});

test("open, dense, ecotone and ancient mixed woods produce different understories", () => {
    const open = sample("mixed-open");
    const dense = sample("mixed-dense");
    const ecotone = sample("mixed-ecotone");
    const ancient = sample("mixed-ancient");
    assert.ok(open.understory.grass > 0.25, "open mixed wood needs a real grass layer");
    assert.equal(open.understoryType, "Grass and herb layer");
    assert.ok(FOREST_TYPES["mixed-dense"].understory.bramble > FOREST_TYPES["mixed-open"].understory.bramble,
        "the dense formation must define a stronger bramble layer");
    assert.ok(dense.visibility < open.visibility);
    assert.equal(ecotone.ecotone, true);
    assert.equal(ancient.ecotone, false);
    const types = new Set([open, dense, ancient, sample("mixed-fir-beech-maple")].map(stand => stand.understoryType));
    assert.ok(types.size >= 3, "mixed woods must not share one understorey label");
});

test("flowering and fruiting windows are real and seasonally visible", () => {
    const starts = new Set();
    for (const [id, window] of Object.entries(FOREST_PHENOLOGY)) {
        assert.ok(FOREST_SPECIES[id], id + " phenology must belong to a species");
        assert.equal(window.flowering.length, 2);
        assert.equal(window.fruiting.length, 2);
        assert.ok(window.flowering[0] >= 0 && window.flowering[1] <= 400);
        assert.ok(window.fruiting[0] >= 0 && window.fruiting[1] <= 400);
        starts.add(window.fruiting[0]);
    }
    assert.ok(starts.size >= 8, "species must not all fruit on the same day");
    const open = sample("mixed-open");
    const spring = forestPhenologyAt(open, 60);
    const autumn = forestPhenologyAt(open, 260);
    assert.equal(spring.season, "spring");
    assert.ok(spring.flowering.some(entry => entry.id === "hazel"), "hazel catkins flower in early spring");
    assert.ok(autumn.fruiting.length > 0, "autumn must show a real fruit crop");
    assert.ok(autumn.fruiting.some(entry => ["oak", "hazel", "rowan", "hornbeam"].includes(entry.id)));
});

test("seasonal light transmission follows leaf cover, not one constant value", () => {
    const open = sample("mixed-open");
    const dense = sample("mixed-fir-beech-maple");
    assert.ok(open.lightTransmission.winter > open.lightTransmission.summer,
        "a deciduous mixed wood admits more light after leaf fall");
    assert.ok(dense.lightTransmission.summer < open.lightTransmission.summer,
        "a denser mixed wood must be darker in summer");
    const spring = forestLightTransmissionAt(open, 50);
    const winter = forestLightTransmissionAt(open, 350);
    assert.equal(spring.season, "spring");
    assert.equal(winter.season, "winter");
    assert.ok(winter.transmission > open.lightTransmission.summer);
    assert.ok(open.lightTransmission.winter > open.lightTransmission.spring);
});

test("mixed woods expose food plants, habitat value, wood grades and silviculture", () => {
    const stand = sample("mixed-ancient");
    assert.ok(stand.foodPlants.length >= 2, "an old mixed wood must list wildlife food plants");
    assert.ok(stand.habitat.score > 0.3 && stand.habitat.layers >= 3);
    assert.ok(stand.habitat.fauna >= 6);
    assert.equal(stand.habitat.fauna, stand.fauna.length,
        "habitat fauna is derived from the stand, not a separate per-species AI roster");
    assert.ok(["loam", "humus", "alluvial", "dry", "podzol"].includes(stand.ground.soil),
        "the ground soil profile is derived from the stand and site conditions");
    assert.ok(stand.mastCrop > 0.3, "oak/beech/hazel mast must be visible");
    assert.ok(stand.woodQuality.length >= 4);
    assert.ok(stand.woodQuality.every(entry => FOREST_SPECIES[entry.id] && entry.timber > 0));
    assert.equal(stand.ageClass, "ancient");
    assert.equal(stand.woodQuality[0].grade, "old-growth");
    assert.ok(stand.silviculture.includes("timber"));
    assert.ok(stand.silviculture.includes("protection"));
    assert.ok(stand.autumnPalette.length >= 3, "a mixed canopy needs several autumn colours");
    assert.match(forestMixedSummary(stand), /broadleaf\/conifer/);
    assert.match(forestMixedSummary(stand), /canopy layers/);
    const survey = forestSurveyAt(23.5, 17.5, context({ dayOfYear: 260, roll: 0.4 }));
    assert.ok(survey);
    assert.equal(survey.mixed, true);
    assert.ok(survey.mixSummary);
    assert.ok(survey.phenologyNow.fruiting.length > 0);
    assert.ok(survey.lightNow.transmission > 0);
});
