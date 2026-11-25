import test from "node:test";
import assert from "node:assert/strict";
import { initWorld } from "../../js/world/world.js";
import { state } from "../../js/core/state.js";
import {
    FOREST_GOODS, FOREST_SPECIES, forestGoodsFor, forestRegrowthFactor, forestStandAt, pickSpecies,
} from "../../js/world/forest-ecology.js";
import {
    FOREST_DYNAMICS_SPECIES_IDS, FOREST_MANAGEMENT_SYSTEMS, FOREST_PHASES,
    forestDynamicsFor, speciesDynamicsTraits,
} from "../../js/world/forest-dynamics.js";
import { getResourceNodeAt } from "../../js/systems/resource-geography.js";

const SEED = 20261123;
const WORLD_OPTIONS = Object.freeze({
    size: "small", shape: "continent", water: 46, landmass: 58,
    fertility: 55, forests: 70, mountains: 55, ruggedness: 58,
});

const entries = (...pairs) => pairs.map(([id, weight]) => ({ id, weight }));
const baseContext = (overrides = {}) => ({
    species: entries(["oak", 0.5], ["beech", 0.3], ["birch", 0.2]),
    speciesDiversity: 0.7,
    evenness: 0.7,
    dominantShare: 0.5,
    ageClass: "mature",
    canopy: 0.7,
    density: 0.7,
    moisture: 0.55,
    temperature: 0.55,
    height: 0.5,
    deadwood: 0.2,
    litter: 0.4,
    humus: 0.4,
    moss: 0.2,
    shrub: 0.2,
    bramble: 0.1,
    berry: 0.1,
    sapling: 0.2,
    herb: 0.2,
    grass: 0.2,
    flowers: 0.2,
    broadleafShare: 1,
    coniferShare: 0,
    stockRatio: 1,
    formationId: "oakwood",
    ...overrides,
});

let cachedWorld = null;
function world() {
    if (cachedWorld) return cachedWorld;
    globalThis.document = {
        createElement: () => ({
            width: 1, height: 1, style: {},
            getContext: () => ({
                createImageData: (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
                putImageData() {}, clearRect() {}, fillRect() {}, drawImage() {},
            }),
        }),
    };
    initWorld(SEED, { ...WORLD_OPTIONS, climate: "temperate" });
    const nodes = [];
    const systems = new Set();
    const phases = new Set();
    const mixtures = new Set();
    for (let y = 0; y < state.worldH; y += 2) {
        for (let x = 0; x < state.worldW; x += 2) {
            const node = getResourceNodeAt(x, y);
            if (!node?.forestCapacity || !node.forestDynamics) continue;
            nodes.push(node);
            systems.add(node.forestDynamics.silviculture.system);
            phases.add(node.forestDynamics.age.phase);
            mixtures.add(node.forestDynamics.composition.mixtureClass);
        }
    }
    cachedWorld = { nodes, systems, phases, mixtures };
    return cachedWorld;
}

test("every forest species has an explicit ecology row on every axis", () => {
    const speciesKeys = Object.keys(FOREST_SPECIES).sort();
    assert.equal(FOREST_DYNAMICS_SPECIES_IDS.length, speciesKeys.length);
    assert.deepEqual([...FOREST_DYNAMICS_SPECIES_IDS].sort(), speciesKeys);
    const axes = ["pioneer", "shade", "drought", "wet", "disease", "fire", "wind", "root",
        "litter", "mycorrhiza", "coppice", "graze", "longevity", "cold"];
    for (const id of speciesKeys) {
        const traits = speciesDynamicsTraits(id);
        for (const axis of axes) {
            assert.ok(Number.isFinite(traits[axis]) && traits[axis] >= 0 && traits[axis] <= 1,
                `${id}.${axis} must be an explicit 0..1 trait`);
        }
    }
    assert.deepEqual(speciesDynamicsTraits("not-a-tree"), speciesDynamicsTraits("not-a-tree"));
    assert.equal(FOREST_PHASES.length, 6);
    assert.deepEqual(FOREST_PHASES, ["pioneer", "thicket", "pole", "mature", "old-growth", "climax"]);
});

test("regional species sets, pure islands and mixture degrees are real", () => {
    const data = world();
    assert.ok(data.nodes.length > 100);
    const regional = data.nodes.find(node =>
        node.forestStand.regionalType?.species
        && node.forestStand.species.some(entry => Object.hasOwn(node.forestStand.regionalType.species, entry.id)));
    assert.ok(regional, "the realm must contain regional species on forest tiles");
    const regionalKeys = Object.keys(regional.forestStand.regionalType.species);
    const actualKeys = regional.forestStand.species.map(entry => entry.id);
    assert.ok(regionalKeys.some(id => actualKeys.includes(id)), "regional tree keys must reach the stand species");
    assert.ok(regional.forestDynamics.composition.regionalShare > 0.4,
        "the regional set must own a meaningful share of the canopy");
    assert.deepEqual(regional.forestSpecies, actualKeys);
    assert.ok(regional.forestSpecies.length >= 5);

    assert.ok(data.mixtures.has("pure"));
    assert.ok(data.mixtures.has("dominant"));
    assert.ok(data.mixtures.has("even"));
    const pureNode = data.nodes.find(node => node.forestDynamics.composition.mixtureClass === "pure");
    assert.ok(pureNode.forestStand.pureIsland?.active);
    assert.equal(pureNode.forestDynamics.composition.pureIsland, pureNode.forestStand.pureIsland.species);
    assert.ok(pureNode.forestDynamics.composition.purity >= 0.8);
    assert.equal(pickSpecies(pureNode.forestStand, 0.01), pureNode.forestStand.pureIsland.species);
    assert.equal(pickSpecies(pureNode.forestStand, 0.99), pureNode.forestStand.pureIsland.species);
    const evenNode = data.nodes.find(node => node.forestDynamics.composition.mixtureClass === "even");
    assert.ok(evenNode.forestDynamics.composition.speciesCount >= 4);
    assert.ok(evenNode.forestDynamics.composition.purity < 0.78);
    const dominantNode = data.nodes.find(node => node.forestDynamics.composition.mixtureClass === "dominant");
    assert.ok(dominantNode.forestDynamics.composition.purity >= 0.58);
    assert.ok(dominantNode.forestDynamics.composition.dominant);
});

test("age classes, pioneer and climax shares, phases and deadwood are distinct", () => {
    const data = world();
    for (const phase of ["pioneer", "thicket", "pole", "mature", "old-growth", "climax"]) {
        assert.ok(data.phases.has(phase), "missing succession phase " + phase);
    }
    const byAge = { young: [], mature: [], ancient: [] };
    for (const node of data.nodes) {
        const stand = node.forestStand;
        const dynamics = node.forestDynamics;
        assert.equal(dynamics.age.class, stand.ageClass);
        assert.ok(FOREST_PHASES.includes(dynamics.age.phase));
        assert.ok(dynamics.age.rotationYears > 0);
        assert.ok(stand.deadwood >= 0 && stand.deadwood <= 1);
        assert.equal(stand.structure.deadwood, stand.deadwood);
        if (byAge[stand.ageClass]) byAge[stand.ageClass].push(stand.deadwood);
    }
    const mean = list => list.reduce((sum, value) => sum + value, 0) / Math.max(1, list.length);
    assert.ok(mean(byAge.ancient) > mean(byAge.mature));
    assert.ok(mean(byAge.mature) >= mean(byAge.young));
    const pioneer = data.nodes.filter(node => node.forestDynamics.age.phase === "pioneer");
    const climax = data.nodes.filter(node => node.forestDynamics.age.phase === "climax");
    assert.ok(pioneer.length > 0 && climax.length > 0);
    assert.ok(pioneer.some(node => node.forestStand.species.some(entry => entry.id === "birch" || entry.id === "rowan")),
        "disturbed young stands must carry pioneer trees");
    assert.ok(climax.every(node => node.forestDynamics.composition.climaxShare > node.forestDynamics.composition.pioneerShare));
    const oldGrowth = data.nodes.find(node => node.forestDynamics.age.phase === "old-growth");
    assert.ok(oldGrowth.forestDynamics.composition.climaxShare >= 0.4);
    assert.ok(oldGrowth.forestStand.deadwood >= 0.15);
});

test("seed bank, mother trees and genetic breadth drive natural regeneration", () => {
    const green = forestDynamicsFor(baseContext());
    const burned = forestDynamicsFor(baseContext({ disturbance: "burned", ageClass: "young", canopy: 0.3 }));
    const young = forestDynamicsFor(baseContext({ ageClass: "young", canopy: 0.45 }));
    const ancient = forestDynamicsFor(baseContext({ ageClass: "ancient", canopy: 0.86, deadwood: 0.7 }));
    const pure = forestDynamicsFor(baseContext({ pureIsland: { active: true, species: "oak" } }));
    const burnedPine = forestDynamicsFor(baseContext({
        species: [{ id: "pine", weight: 1 }], coniferShare: 1, broadleafShare: 0,
        moisture: 0.3, disturbance: "burned", ageClass: "young", canopy: 0.25,
    }));
    const burnedOak = forestDynamicsFor(baseContext({
        species: [{ id: "oak", weight: 1 }], coniferShare: 0, broadleafShare: 1,
        moisture: 0.3, disturbance: "burned", ageClass: "young", canopy: 0.25,
    }));
    assert.ok(burned.regeneration.seedBank > green.regeneration.seedBank);
    assert.ok(burnedPine.regeneration.seedBank > burnedOak.regeneration.seedBank,
        "the fire trait must raise the post-burn seed bank of a fire-adapted pine");
    assert.ok(burned.regeneration.seedBank >= 0 && burned.regeneration.seedBank <= 1);
    assert.ok(ancient.regeneration.motherTrees > young.regeneration.motherTrees);
    assert.ok(ancient.regeneration.motherTreesPerHa > young.regeneration.motherTreesPerHa);
    assert.ok(ancient.regeneration.seedQuality > young.regeneration.seedQuality);
    assert.ok(pure.regeneration.geneticDiversity < green.regeneration.geneticDiversity);
    assert.ok(pure.regeneration.inbreedingRisk > green.regeneration.inbreedingRisk);
    for (const dynamics of [green, burned, young, ancient, pure]) {
        assert.ok(dynamics.regeneration.naturalRegeneration >= 0 && dynamics.regeneration.naturalRegeneration <= 1);
        assert.ok(dynamics.regeneration.factor >= 0.64 && dynamics.regeneration.factor <= 1.4);
        assert.ok(dynamics.regeneration.motherTrees >= 0 && dynamics.regeneration.motherTrees <= 1);
    }
    assert.ok(forestRegrowthFactor({ ground: { compaction: 0 }, dynamics: { regeneration: { factor: 1.25 } } }) > 1);
    assert.ok(forestRegrowthFactor({ ground: { compaction: 0 }, dynamics: { regeneration: { factor: 0.7 } } }) < 1);
});

test("disease resistance and site fit distinguish species and sites", () => {
    const one = (id, overrides = {}) => forestDynamicsFor(baseContext({
        species: [{ id, weight: 1 }], speciesDiversity: 0, evenness: 0, dominantShare: 1, ...overrides,
    }));
    const oak = one("oak");
    const elm = one("elm");
    const dryPine = one("pine", { moisture: 0.1, coniferShare: 1, broadleafShare: 0 });
    const dryAlder = one("alder", { moisture: 0.1 });
    const wetAlder = one("alder", { moisture: 0.95 });
    const wetPine = one("pine", { moisture: 0.95, coniferShare: 1, broadleafShare: 0 });
    assert.ok(oak.health.diseaseResistance > elm.health.diseaseResistance);
    assert.ok(elm.health.pestFactor > oak.health.pestFactor);
    assert.ok(dryPine.health.siteFitness > dryAlder.health.siteFitness);
    assert.ok(wetAlder.health.siteFitness > wetPine.health.siteFitness);
    for (const dynamics of [oak, elm, dryPine, dryAlder, wetAlder, wetPine]) {
        assert.ok(dynamics.health.siteFitness >= 0 && dynamics.health.siteFitness <= 1);
        assert.ok(dynamics.health.diseaseResistance >= 0 && dynamics.health.diseaseResistance <= 1);
        assert.ok(dynamics.health.droughtStress >= 0 && dynamics.health.droughtStress <= 1);
        assert.ok(dynamics.health.wetStress >= 0 && dynamics.health.wetStress <= 1);
    }
});

test("succession stages and regional disturbance regimes follow the site", () => {
    const stagePhase = stage => forestDynamicsFor(baseContext({ succession: { stage, age: 4 } })).age.phase;
    assert.equal(stagePhase("fresh"), "pioneer");
    assert.equal(stagePhase("young"), "thicket");
    assert.equal(stagePhase("recovering"), "pole");
    const ancient = forestDynamicsFor(baseContext({ ageClass: "ancient", canopy: 0.86, deadwood: 0.7 }));
    assert.equal(ancient.age.phase, "climax");
    const dryPine = forestDynamicsFor(baseContext({
        species: [{ id: "pine", weight: 1 }], coniferShare: 1, broadleafShare: 0,
        moisture: 0.1, temperature: 0.75, height: 0.5, deadwood: 0.4, litter: 0.6,
    }));
    const wetAlder = forestDynamicsFor(baseContext({
        species: [{ id: "alder", weight: 1 }], moisture: 0.95, temperature: 0.5,
    }));
    const coldSpruce = forestDynamicsFor(baseContext({
        species: [{ id: "spruce", weight: 1 }], coniferShare: 1, broadleafShare: 0,
        moisture: 0.5, temperature: 0.1, height: 0.85, deadwood: 0.5,
    }));
    assert.ok(dryPine.hazard.regime.fire > wetAlder.hazard.regime.fire);
    assert.ok(coldSpruce.hazard.regime.ice > dryPine.hazard.regime.ice);
    for (const dynamics of [dryPine, wetAlder, coldSpruce, ancient]) {
        const regime = dynamics.hazard.regime;
        for (const key of ["fire", "wind", "ice", "water"]) {
            assert.ok(regime[key] >= 0 && regime[key] <= 1);
        }
        assert.ok(["fire", "wind", "ice", "water"].includes(regime.dominant));
        assert.ok(regime.label.length > 3);
        assert.ok(regime.rotationYears > 0);
    }
});

test("all six silvicultural systems classify, rotate and alter management", () => {
    const system = overrides => forestDynamicsFor(baseContext(overrides)).silviculture;
    const high = system({});
    const coppice = system({ formationId: "mixed-young", silviculture: ["coppice"], ageClass: "young", canopy: 0.6 });
    const standards = system({ formationId: "coppice-with-standards", silviculture: ["coppice", "mast"], canopy: 0.5 });
    const selection = system({ formationId: "selection-forest", silviculture: ["selection-felling"], ageClass: "ancient", deadwood: 0.6, canopy: 0.8 });
    const continuous = system({ formationId: "mixed-dense", ageClass: "ancient", deadwood: 0.5, canopy: 0.85 });
    const pasture = system({ formationId: "mixed-open", silviculture: ["grazing"], ageClass: "young", canopy: 0.4 });
    assert.equal(high.system, "high-forest");
    assert.equal(coppice.system, "coppice");
    assert.equal(standards.system, "coppice-with-standards");
    assert.equal(selection.system, "selection");
    assert.equal(continuous.system, "continuous-cover");
    assert.equal(pasture.system, "wood-pasture");
    assert.deepEqual(new Set([high, coppice, standards, selection, continuous, pasture].map(row => row.label)),
        new Set(Object.values(FOREST_MANAGEMENT_SYSTEMS).map(row => row.label)));
    for (const row of [high, coppice, standards, selection, continuous, pasture]) {
        assert.ok(row.rotationYears > 0);
        assert.ok(row.timberFactor > 0.7 && row.timberFactor <= 1.1);
        assert.ok(row.regenerationFactor > 0.6 && row.regenerationFactor <= 1.2);
        assert.ok(row.browsePressure >= 0 && row.browsePressure <= 1);
    }
    assert.equal(coppice.coppice, true);
    assert.equal(standards.coppice, true);
    assert.equal(selection.selection, true);
    assert.equal(selection.continuousCover, true);
    assert.equal(continuous.continuousCover, true);
    assert.equal(pasture.woodPasture, true);
    assert.ok(pasture.browsePressure > high.browsePressure);
    assert.ok(continuous.regenerationFactor > high.regenerationFactor);
    // The swamp-carr formation carries coppice as a real silvicultural use on
    // the map, not only as a synthetic classification branch.
    const swamp = forestStandAt(0.5, 0.5, {
        seed: 20261140, climate: "swamp", moisture: 0.92, temperature: 0.58,
        height: 0.28, forests: 70, stockRatio: 1, rockLine: 0.92,
    });
    assert.equal(swamp.type, "swamp-carr");
    assert.equal(swamp.dynamics.silviculture.system, "coppice");
});

test("edges, gaps, lianas, epiphytes and the herb layer form real structure", () => {
    const wet = forestDynamicsFor(baseContext({
        moisture: 0.85, ageClass: "ancient", canopy: 0.44, edge: true, clearing: 0.5,
        herb: 0.8, grass: 0.6, flowers: 0.6, moss: 0.7, shrub: 0.6, bramble: 0.3, berry: 0.3,
        sapling: 0.5, deadwood: 0.5,
    }));
    const dry = forestDynamicsFor(baseContext({ moisture: 0.2, edge: false, clearing: 0 }));
    const youngGap = forestDynamicsFor(baseContext({ ageClass: "young", canopy: 0.4, clearing: 0.5 }));
    const ancientGap = forestDynamicsFor(baseContext({ ageClass: "ancient", canopy: 0.4, clearing: 0.5 }));
    const tropical = forestDynamicsFor(baseContext({
        moisture: 0.85, temperature: 0.8, tropical: { features: { "1.2.4.13": 0.9, "1.2.4.14": 0.8 } },
    }));
    assert.ok(wet.structure.lianaCover > dry.structure.lianaCover);
    assert.ok(wet.structure.epiphyteCover > dry.structure.epiphyteCover);
    assert.ok(tropical.structure.lianaCover > wet.structure.lianaCover);
    assert.ok(tropical.structure.epiphyteCover > wet.structure.epiphyteCover);
    assert.ok(wet.structure.herbLayer > 0.4);
    assert.ok(wet.structure.medicinalHerbs > 0.2);
    assert.ok(wet.structure.canopyGap >= 0.3);
    assert.ok(wet.structure.edgeDiversity > 0.5);
    assert.ok(wet.structure.layers >= 4);
    assert.equal(wet.structure.lightWoodland, true);
    assert.ok(wet.structure.gapAge > 0, "a real canopy gap must have a gap age");
    assert.ok(ancientGap.structure.gapAge > youngGap.structure.gapAge,
        "an old wood's gap must be older than a young stand's gap");
    assert.ok(wet.structure.medicinalHerbs > dry.structure.medicinalHerbs);
    assert.ok(wet.goods.boost.herbs > dry.goods.boost.herbs,
        "medicinal herbs must feed the herb gathering yield, not only a label");
    assert.ok(wet.structure.understoryLabel.length > 4);
    assert.ok(wet.structure.lianaCover >= 0 && wet.structure.lianaCover <= 1);
    assert.ok(wet.structure.epiphyteCover >= 0 && wet.structure.epiphyteCover <= 1);

    const products = forestGoodsFor({
        goods: ["timber"], productivity: 1, regionalEffects: { forage: 1 }, dynamics: wet,
    }, 150);
    assert.ok(products.some(good => good.id === "herbs"));
    assert.ok(products.some(good => good.id === "moss" || good.id === "lichen" || good.id === "mushrooms"));
});

test("roots, litter, humus and mycorrhiza are species-specific soil processes", () => {
    const one = (id, overrides = {}) => forestDynamicsFor(baseContext({
        species: [{ id, weight: 1 }], speciesDiversity: 0, evenness: 0, dominantShare: 1, ...overrides,
    }));
    const pine = one("pine", { coniferShare: 1, broadleafShare: 0, moisture: 0.3 });
    const birch = one("birch", { moisture: 0.55 });
    const oak = one("oak");
    const spruce = one("spruce", { coniferShare: 1, broadleafShare: 0 });
    const ancient = one("oak", { ageClass: "ancient", deadwood: 0.7, humus: 0.7, moss: 0.5 });
    const disturbed = one("oak", { ageClass: "young", disturbance: "burned", humus: 0.2 });
    assert.ok(pine.soil.rootDepth > birch.soil.rootDepth);
    assert.ok(birch.soil.waterUptake < pine.soil.waterUptake || birch.soil.waterUptake < oak.soil.waterUptake,
        "water uptake must vary with species and site, not sit at one value");
    assert.ok(oak.soil.litterQuality > spruce.soil.litterQuality);
    assert.ok(oak.soil.decomposition > spruce.soil.decomposition);
    assert.ok(oak.goods.boost.mushrooms > spruce.goods.boost.mushrooms,
        "decomposition must feed mushroom yield, not only a label");
    assert.equal(spruce.soil.humusForm, "Mor");
    assert.equal(oak.soil.humusForm, "Mull");
    assert.ok(ancient.soil.mycorrhiza > disturbed.soil.mycorrhiza);
    assert.ok(ancient.soil.mycorrhizaLabel.length > 4);
    assert.ok(disturbed.soil.mycorrhiza >= 0 && disturbed.soil.mycorrhiza <= 1);
    for (const dynamics of [pine, birch, oak, spruce, ancient, disturbed]) {
        assert.ok(dynamics.soil.rootDepth >= 0 && dynamics.soil.rootDepth <= 1);
        assert.ok(dynamics.soil.waterUptake >= 0 && dynamics.soil.waterUptake <= 1);
        assert.ok(dynamics.soil.decomposition >= 0 && dynamics.soil.decomposition <= 1);
        assert.ok(["Mull", "Moder", "Mor"].includes(dynamics.soil.humusForm));
    }
});

test("cohorts, deadwood classes, regeneration niche and treatment depth are real", () => {
    const young = forestDynamicsFor(baseContext({
        ageClass: "young", canopy: 0.5, ageStructure: { young: 0.68, mature: 0.30, ancient: 0.02, uneven: true },
    }));
    const ancient = forestDynamicsFor(baseContext({
        ageClass: "ancient", canopy: 0.86, deadwood: 0.72, logs: 0.7, stumps: 0.4,
        ageStructure: { young: 0.05, mature: 0.32, ancient: 0.63, uneven: true },
    }));
    const compacted = forestDynamicsFor(baseContext({ compaction: 0.85 }));
    const browsed = forestDynamicsFor(baseContext({ browsingPressure: 0.85, formationId: "mixed-open", canopy: 0.45 }));
    const coppice = forestDynamicsFor(baseContext({
        formationId: "mixed-young", silviculture: ["coppice"], ageClass: "young", canopy: 0.55,
    }));
    const high = forestDynamicsFor(baseContext());
    const standards = forestDynamicsFor(baseContext({
        formationId: "coppice-with-standards", silviculture: ["coppice", "mast"], canopy: 0.55,
    }));
    const selection = forestDynamicsFor(baseContext({
        formationId: "selection-forest", silviculture: ["selection-felling"], ageClass: "ancient", canopy: 0.8,
    }));
    const pine = forestDynamicsFor(baseContext({
        species: [{ id: "pine", weight: 1 }], speciesDiversity: 0, evenness: 0, dominantShare: 1,
        coniferShare: 1, broadleafShare: 0, moisture: 0.3,
    }));
    const spruce = forestDynamicsFor(baseContext({
        species: [{ id: "spruce", weight: 1 }], speciesDiversity: 0, evenness: 0, dominantShare: 1,
        coniferShare: 1, broadleafShare: 0, moisture: 0.5,
    }));
    const oak = forestDynamicsFor(baseContext({
        species: [{ id: "oak", weight: 1 }], speciesDiversity: 0, evenness: 0, dominantShare: 1,
    }));
    const birch = forestDynamicsFor(baseContext({
        species: [{ id: "birch", weight: 1 }], speciesDiversity: 0, evenness: 0, dominantShare: 1,
        broadleafShare: 1, coniferShare: 0,
    }));
    const wetEdge = forestDynamicsFor(baseContext({
        moisture: 0.86, ageClass: "ancient", canopy: 0.42, edge: true, clearing: 0.55,
        herb: 0.8, grass: 0.6, flowers: 0.7, moss: 0.7, shrub: 0.7, bramble: 0.4, berry: 0.4,
        sapling: 0.6, deadwood: 0.5, logs: 0.5, stumps: 0.3,
    }));

    const cohortSum = ancient.age.cohorts.young + ancient.age.cohorts.mature + ancient.age.cohorts.ancient;
    assert.ok(Math.abs(cohortSum - 1) < 1e-9, "age cohorts must normalise to one stand");
    assert.ok(ancient.age.cohorts.ancient > young.age.cohorts.ancient);
    assert.ok(young.age.cohorts.young > ancient.age.cohorts.young);
    assert.equal(ancient.age.uneven, true);
    assert.ok(ancient.age.spreadYears > young.age.spreadYears);
    assert.equal(ancient.age.dominantCohort, "ancient");

    assert.ok(ancient.composition.cohorts.length >= 3);
    assert.ok(ancient.composition.cohorts.every(cohort =>
        cohort.share > 0 && ["pioneer", "matrix", "climax"].includes(cohort.role)
        && ["young", "mature", "ancient"].includes(cohort.age)
        && cohort.seedSource.length > 3));
    assert.ok(ancient.composition.cohorts.some(cohort => cohort.role === "climax"));
    assert.ok(ancient.composition.provenance.regional + ancient.composition.provenance.local > 0.99);

    const deadwood = ancient.structure.deadwoodProfile;
    assert.ok(Math.abs(deadwood.total - ancient.structure.deadwood) < 1e-9);
    assert.ok(Math.abs(deadwood.standing + deadwood.fallen + deadwood.stumps - deadwood.total) < 1e-9,
        "standing, fallen and stump deadwood must add up to the stand deadwood");
    assert.ok(ancient.structure.deadwoodProfile.habitat > high.structure.deadwoodProfile.habitat);
    assert.ok(deadwood.cavityTreesPerHa > 0);
    assert.ok(ancient.goods.boost.mushrooms >= high.goods.boost.mushrooms);

    assert.ok(compacted.regeneration.germination < high.regeneration.germination,
        "compaction must brake germination, not only the old regrowth label");
    assert.ok(compacted.regeneration.seedlingBank < high.regeneration.seedlingBank);
    assert.ok(browsed.regeneration.browseBrake > high.regeneration.browseBrake);
    assert.ok(browsed.regeneration.saplingRecruitment <= high.regeneration.saplingRecruitment);
    assert.ok(ancient.regeneration.seedRain > 0 && ancient.regeneration.germination > 0);
    assert.ok(ancient.regeneration.buriedSeedYears > 0);
    assert.ok(ancient.regeneration.motherTreesBySpecies.length >= 1);
    assert.ok(ancient.regeneration.seedBankViability >= 0 && ancient.regeneration.seedBankViability <= 1);

    assert.ok(ancient.hazard.regime.severity >= 0 && ancient.hazard.regime.severity <= 1);
    assert.ok(ancient.hazard.regime.patchSizeHa > 0);
    assert.ok(ancient.hazard.regime.refugia >= 0 && ancient.hazard.regime.refugia <= 1);
    assert.equal(ancient.hazard.regime.returnIntervalYears, ancient.hazard.regime.rotationYears);

    assert.ok(coppice.silviculture.stoolsPerHa > high.silviculture.stoolsPerHa);
    assert.ok(standards.silviculture.standardsPerHa > coppice.silviculture.standardsPerHa);
    assert.ok(selection.silviculture.retentionTreesPerHa > high.silviculture.retentionTreesPerHa);
    for (const treatment of [coppice, high, standards, selection]) {
        assert.ok(treatment.silviculture.rotationProgress >= 0 && treatment.silviculture.rotationProgress <= 1);
        assert.ok(treatment.silviculture.harvestIntensity >= 0 && treatment.silviculture.harvestIntensity <= 1);
        assert.ok(treatment.silviculture.canopyTarget > 0 && treatment.silviculture.canopyTarget <= 1);
        assert.ok(treatment.silviculture.ageToRotationYears >= 0);
        assert.ok(treatment.silviculture.timberFactor > 0.7 && treatment.silviculture.timberFactor <= 1.1);
    }

    assert.notEqual(pine.soil.rootingType, birch.soil.rootingType);
    assert.equal(spruce.soil.mycorrhizaType, "Ectomycorrhizal");
    assert.ok(oak.soil.litterProfile.broadleaf > 0.9);
    assert.ok(spruce.soil.litterProfile.needle > 0.9);
    assert.ok(Math.abs(oak.soil.litterProfile.broadleaf + oak.soil.litterProfile.needle - 1) < 1e-9);
    assert.ok(oak.soil.humusDepthCm > 0 && oak.soil.litterProfile.depthCm >= 0);
    assert.ok(oak.soil.networkReachM > 0);

    assert.ok(wetEdge.structure.edgeProfile.active);
    assert.ok(wetEdge.structure.edgeProfile.widthM > 0);
    assert.ok(wetEdge.structure.edgeProfile.mantleCover > 0.5);
    assert.equal(wetEdge.structure.gapProfile.origin, "cutting");
    assert.ok(["small", "medium", "large"].includes(wetEdge.structure.gapProfile.sizeClass));
    assert.ok(wetEdge.structure.lianaProfile.types.includes("Ivy") || wetEdge.structure.lianaProfile.types.includes("Honeysuckle"));
    assert.ok(wetEdge.structure.epiphyteProfile.groups.includes("Moss"));
    assert.ok(wetEdge.structure.herbProfile.food > 0 && wetEdge.structure.herbProfile.medicine > 0);
    assert.ok(wetEdge.structure.understoryProfile.label.length > 4);
});

test("stand, node, regrowth and products consume the same dynamics record", () => {
    const data = world();
    for (const system of ["high-forest", "continuous-cover", "wood-pasture", "selection", "coppice", "coppice-with-standards"]) {
        assert.ok(data.systems.has(system), "the generated realm must expose " + system);
    }
    const plantation = forestDynamicsFor(baseContext({
        formationId: "mixed-young", silviculture: ["coppice", "grazing"], ageClass: "young", canopy: 0.5,
    }));
    assert.equal(plantation.silviculture.system, "coppice",
        "a young coppiced plantation must not be swallowed by the wood-pasture branch");
    for (const system of data.systems) assert.ok(FOREST_MANAGEMENT_SYSTEMS[system]);
    const node = data.nodes[0];
    const stand = node.forestStand;
    assert.equal(node.forestDynamics, stand.dynamics);
    assert.equal(node.forestMixtureClass, stand.dynamics.composition.mixtureClass);
    assert.equal(node.forestPhase, stand.dynamics.age.phase);
    assert.equal(node.forestSeedBank, stand.dynamics.regeneration.seedBank);
    assert.equal(node.forestMotherTrees, stand.dynamics.regeneration.motherTrees);
    assert.equal(node.forestGeneticDiversity, stand.dynamics.regeneration.geneticDiversity);
    assert.equal(node.forestDiseaseResistance, stand.dynamics.health.diseaseResistance);
    assert.equal(node.forestSiteFitness, stand.dynamics.health.siteFitness);
    assert.equal(node.forestSilviculturalSystem, stand.dynamics.silviculture.system);
    assert.equal(node.forestRegenerationFactor, stand.dynamics.regeneration.factor);
    assert.equal(node.forestRootDepth, stand.dynamics.soil.rootDepth);
    assert.equal(node.forestHumusForm, stand.dynamics.soil.humusForm);
    assert.equal(node.forestMycorrhiza, stand.dynamics.soil.mycorrhiza);
    assert.equal(node.forestLianaCover, stand.dynamics.structure.lianaCover);
    assert.equal(node.forestEpiphyteCover, stand.dynamics.structure.epiphyteCover);
    assert.equal(node.forestHerbLayer, stand.dynamics.structure.herbLayer);
    assert.equal(node.forestMedicinalHerbs, stand.dynamics.structure.medicinalHerbs);
    assert.equal(node.forestGapAge, stand.dynamics.structure.gapAge);
    assert.equal(node.forestLightWoodland, stand.dynamics.structure.lightWoodland);
    assert.equal(node.forestWaterUptake, stand.dynamics.soil.waterUptake);
    assert.equal(node.forestDecomposition, stand.dynamics.soil.decomposition);
    assert.equal(node.forestRegime, stand.dynamics.hazard.regime.label);
    assert.equal(node.forestRegimeFire, stand.dynamics.hazard.regime.fire);
    assert.equal(node.forestRegimeWind, stand.dynamics.hazard.regime.wind);
    assert.equal(stand.structure.deadwoodProfile, stand.dynamics.structure.deadwoodProfile);
    assert.equal(stand.structure.gapProfile, stand.dynamics.structure.gapProfile);
    assert.equal(stand.structure.edgeProfile, stand.dynamics.structure.edgeProfile);
    assert.equal(stand.structure.lianaProfile, stand.dynamics.structure.lianaProfile);
    assert.equal(stand.structure.epiphyteProfile, stand.dynamics.structure.epiphyteProfile);
    assert.equal(stand.structure.understoryProfile, stand.dynamics.structure.understoryProfile);
    assert.equal(stand.structure.herbProfile, stand.dynamics.structure.herbProfile);
    assert.equal(stand.structure.rootingType, stand.dynamics.soil.rootingType);
    assert.equal(stand.structure.mycorrhizaType, stand.dynamics.soil.mycorrhizaType);
    assert.ok(node.forestFireRisk >= 0 && node.forestFireRisk <= 1);
    assert.ok(node.forestPestRisk >= 0 && node.forestPestRisk <= 1);
    assert.ok(node.forestWindExposure >= 0 && node.forestWindExposure <= 1);
    assert.ok(node.forestBrowsingPressure >= 0 && node.forestBrowsingPressure <= 1);

    const repeat = forestStandAt(stand.x + 0.5, stand.y + 0.5, {
        seed: SEED, climate: "temperate", moisture: stand.moisture, temperature: stand.temperature,
        height: stand.height, forests: 70,
        stockRatio: node.forestCapacity ? node.forestStock / node.forestCapacity : 1,
        rockLine: 0.92, succession: node.forestSuccession,
    });
    assert.deepEqual(repeat.dynamics, stand.dynamics, "the dynamics record must replay deterministically");
    const factor = forestRegrowthFactor(stand);
    assert.ok(factor >= 0.3 && factor <= 1.58);
    assert.equal(forestRegrowthFactor({ ground: { compaction: 0 } }), 1);
    assert.ok(forestRegrowthFactor({ ground: { compaction: 0 }, dynamics: { regeneration: { factor: 1.3 } } })
        > forestRegrowthFactor({ ground: { compaction: 0 }, dynamics: { regeneration: { factor: 0.7 } } }));
    assert.ok(FOREST_GOODS[node.forestGoods[0]]);
});

test("detailed ecology resolves into a working wood with real harvest and habitat value", () => {
    const ancientOak = forestDynamicsFor(baseContext({
        species: entries(["oak", 0.6], ["beech", 0.4]),
        ageClass: "ancient", canopy: 0.86, deadwood: 0.75, litter: 0.7,
        humus: 0.8, moss: 0.5, shrub: 0.5, herb: 0.55, flowers: 0.5,
        formationId: "oakwood",
    }));
    const youngBirch = forestDynamicsFor(baseContext({
        species: entries(["birch", 1]), ageClass: "young", canopy: 0.42,
        deadwood: 0.05, litter: 0.2, herb: 0.15, flowers: 0.1,
        formationId: "birchwood",
    }));
    const coppice = forestDynamicsFor(baseContext({
        species: entries(["alder", 0.7], ["willow", 0.3]),
        ageClass: "mature", canopy: 0.7, deadwood: 0.25, litter: 0.5,
        formationId: "swamp-carr", silviculture: ["coppice", "firewood"],
    }));
    const highForest = forestDynamicsFor(baseContext({
        species: entries(["oak", 0.7], ["beech", 0.3]),
        ageClass: "mature", canopy: 0.8, deadwood: 0.2, litter: 0.4,
        formationId: "oakwood", silviculture: ["timber"],
    }));
    assert.ok(ancientOak.working.timber.sawlog > youngBirch.working.timber.sawlog,
        "mature/ancient cohorts and timber quality must raise the sawlog share");
    assert.ok(highForest.working.timber.sawlog > coppice.working.timber.sawlog,
        "high forest must send more of the cut to sawlogs than coppice");
    assert.ok(coppice.working.timber.firewood > highForest.working.timber.firewood,
        "coppice and its stools must raise the firewood share");
    assert.ok(ancientOak.working.forage.mast > youngBirch.working.forage.mast,
        "mast-bearing mature cohorts and mother trees must feed pannage");
    assert.ok(ancientOak.working.forage.mushrooms > youngBirch.working.forage.mushrooms,
        "mycorrhiza, litter and deadwood decay must feed the mushroom crop");
    assert.ok(ancientOak.working.habitat.score > youngBirch.working.habitat.score,
        "deadwood, cavities and layered structure must raise habitat value");
    assert.ok(ancientOak.working.water.retention > youngBirch.working.water.retention,
        "humus, litter depth and rooting must raise water retention");
    assert.ok(ancientOak.working.products.includes("sawlogs"));
    assert.ok(coppice.working.products.includes("firewood"));
    for (const dynamics of [ancientOak, youngBirch, coppice, highForest]) {
        const working = dynamics.working;
        for (const value of Object.values(working.timber)) assert.ok(value >= 0 && value <= 1.2);
        for (const value of Object.values(working.forage)) assert.ok(value >= 0 && value <= 1);
        assert.ok(working.timber.logShare >= 0.24 && working.timber.logShare <= 0.92);
        assert.ok(working.habitat.score >= 0 && working.habitat.score <= 1);
        assert.ok(working.water.retention >= 0 && working.water.retention <= 1);
    }
    const node = world().nodes.find(entry => entry.forestDynamics?.working);
    assert.ok(node, "every real forest node must expose the working wood");
    assert.equal(node.forestWorking, node.forestDynamics.working);
});
