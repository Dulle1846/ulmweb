import test from "node:test";
import assert from "node:assert/strict";
import {
    FOREST_MODEL_REQUIREMENTS, FOREST_MODEL_VERSION, FOREST_MODEL_SAVE_VERSION,
    FOREST_RNG_STREAMS, FOREST_MODDING_SCHEMA,
    forestTypeIdFor, forestTypeIdFromLegacy, forestRegionalWeightsFor,
    forestLimitsFor, forestClimateEnvelopeFor, forestSoilFor, forestMoistureIndexFor,
    forestDisturbanceMatrixFor, forestSuccessionMatrixFor, forestSpeciesPoolFor,
    forestLodFor, forestChunkBudgetFor, forestChunkKeyFor, precomputeForestChunk,
    forestAnnualCadenceFor, forestPhenologyFor, forestRegionSeedFor,
    forestFloodPressureFor,
    forestModelSaveMeta, migrateForestModelSave, validateForestModelSave,
    validateForestTypeDefinition, validateForestModelCatalog,
    forestModelTelemetrySnapshot, resetForestModelTelemetry,
    forestModelCacheStats, clearForestModelCaches,
    buildForestSpatialIndex, queryForestSpatialIndex,
    forestNeighboursFor, forestNeighbourOrderFor, forestFireSpreadFor,
    forestWindthrowFor, forestWaterFlowFor, forestErosionFor,
    forestRegenerationFor, forestBiodiversityFor, forestRngSeedFor,
    forestModelFor, forestModelSummaryFor,
} from "../../js/world/forest-model.js";
import { REGIONAL_FOREST_TYPES } from "../../js/world/regional-forests.js";
import {
    FOREST_DISTURBANCE_KINDS, FOREST_SUCCESSION_PROFILES, FOREST_TYPES,
} from "../../js/world/forest-ecology.js";

const TYPE = REGIONAL_FOREST_TYPES.find(type => type.key === "temperate-broadleaf") || REGIONAL_FOREST_TYPES[0];
const CONIFER = REGIONAL_FOREST_TYPES.find(type => type.key === "spruce-fir") || TYPE;

function stand(overrides = {}) {
    const type = overrides.regionalType || TYPE;
    return {
        forest: true,
        x: 12,
        y: 8,
        seed: 4711,
        climate: "temperate",
        height: 0.52,
        moisture: 0.56,
        temperature: 0.55,
        wetness: 0.34,
        canopy: 0.82,
        density: 0.86,
        stockRatio: 0.92,
        fireRisk: 0.2,
        windExposure: 0.36,
        snowPotential: 0.18,
        pestRisk: 0.16,
        speciesDiversity: 0.58,
        deadwood: 0.3,
        ageClass: "mature",
        standAge: 180,
        regionalType: type,
        regionalTypeId: type.id,
        regionalEffects: type.effects,
        ground: { soil: "loam", humus: 0.5, sourSoil: 0.2, litter: 0.42, pools: 0.05, roots: 0.5, compaction: 0.2 },
        structure: { herb: 0.52, shrub: 0.44, sapling: 0.36, canopy: 0.9, deadwood: 0.34 },
        dynamics: { regeneration: { seedBank: 0.72, motherTreesPerHa: 26, factor: 1 } },
        phenology: [
            { id: "oak", label: "Oak", flowering: [100, 160], fruiting: [240, 310] },
            { id: "beech", label: "Beech", flowering: [120, 170], fruiting: [260, 320] },
        ],
        succession: null,
        faunaEcology: { speciesRichness: 8 },
        ...overrides,
    };
}

test("the 30 data-model points are one contiguous, exported manifest", () => {
    assert.equal(FOREST_MODEL_REQUIREMENTS.length, 30);
    assert.deepEqual(
        FOREST_MODEL_REQUIREMENTS.map(entry => entry.id),
        Array.from({ length: 30 }, (_, index) => `1.2.23.1.${121 + index}`),
    );
    assert.equal(new Set(FOREST_MODEL_REQUIREMENTS.map(entry => entry.key)).size, 30);
    for (const entry of FOREST_MODEL_REQUIREMENTS) {
        assert.ok(entry.label.length > 10, `${entry.id} needs a player-facing label`);
        assert.equal(entry.tests[0], "tests/world/forest-model.test.js");
        assert.equal(entry.evidence[0].file, "js/world/forest-model.js");
    }
});

test("stable type ids cover the catalog, legacy indices and mod namespaces", () => {
    assert.equal(new Set(REGIONAL_FOREST_TYPES.map(type => type.id)).size, 60);
    assert.equal(forestTypeIdFor(TYPE), TYPE.id);
    assert.equal(forestTypeIdFor(TYPE.key), TYPE.id);
    assert.equal(forestTypeIdFor("1.2.23.1.001"), "1.2.23.1.001");
    assert.equal(forestTypeIdFromLegacy(1), REGIONAL_FOREST_TYPES[0].id);
    assert.equal(forestTypeIdFromLegacy(REGIONAL_FOREST_TYPES.length), REGIONAL_FOREST_TYPES.at(-1).id);
    assert.equal(forestTypeIdFor("not-a-forest"), null);
    assert.equal(validateForestModelCatalog().ok, true);
    assert.equal(validateForestModelCatalog().count, 60);
});

test("regional weights are normalised, height-sensitive and cached", () => {
    const low = forestRegionalWeightsFor({ climate: "temperate", height: 0.2, temperature: 0.6, moisture: 0.5 });
    const high = forestRegionalWeightsFor({ climate: "temperate", height: 0.85, temperature: 0.3, moisture: 0.5 });
    const total = low.types.reduce((sum, entry) => sum + entry.share, 0);
    assert.ok(Math.abs(total - 1) < 1e-9, "all regional shares must add to one");
    assert.equal(low.types[0].share, Math.max(...low.types.map(entry => entry.share)));
    assert.ok(low.types.length <= 60);
    assert.equal(forestRegionalWeightsFor({ climate: "temperate", height: 0.2, temperature: 0.6, moisture: 0.5 }), low,
        "identical envelopes reuse the cached distribution");
    assert.notEqual(low.types[0].id, high.types[0].id, "a different altitude band must rank a different woodland");
});

test("climate envelopes and height limits are shared by type and species", () => {
    const limits = forestLimitsFor(TYPE);
    const envelope = forestClimateEnvelopeFor(TYPE);
    assert.deepEqual(limits.height, TYPE.height);
    assert.deepEqual(limits.temperature, TYPE.temp);
    assert.deepEqual(limits.moisture, TYPE.moisture);
    assert.ok(limits.species.oak, "oak must expose its own altitude envelope");
    assert.ok(limits.species.oak.height[0] <= TYPE.height[0] + 1);
    assert.ok(limits.species.oak.height[1] >= TYPE.height[1] - 1);
    assert.ok(envelope.frost[0] <= envelope.temperature[0]);
    assert.deepEqual(envelope.precipitation, TYPE.moisture);
    assert.equal(forestLimitsFor(TYPE), limits, "limits are cached per type");
});

test("soil matrix reports nutrients, pH and water storage; moisture names floodplain, mire and dry woods", () => {
    const loam = forestSoilFor(stand());
    const sand = forestSoilFor(stand({ ground: { soil: "dry", humus: 0.12, sourSoil: 0.5, litter: 0.1 } }));
    assert.ok(loam.nutrients > sand.nutrients);
    assert.ok(loam.waterCapacity > sand.waterCapacity);
    assert.ok(loam.pH >= 4.2 && loam.pH <= 7.4);
    assert.equal(loam.matrix.length, 3);
    const floodplain = forestMoistureIndexFor(stand({
        regionalType: REGIONAL_FOREST_TYPES.find(type => type.key === "ash-elm-floodplain") || TYPE,
        moisture: 0.82, wetness: 0.8, ground: { pools: 0.4 },
    }));
    const dry = forestMoistureIndexFor(stand({
        regionalType: REGIONAL_FOREST_TYPES.find(type => type.key === "thornscrub") || TYPE,
        moisture: 0.18, wetness: 0.1,
    }));
    assert.equal(floodplain.habitat, "floodplain");
    assert.ok(floodplain.index > dry.index);
    assert.equal(dry.dry, true);
});

test("flood pressure is a real water reading and the flood formation is reachable", () => {
    const floodplain = REGIONAL_FOREST_TYPES.find(type => type.key === "ash-elm-floodplain")
        || REGIONAL_FOREST_TYPES.find(type => /floodplain|alluvial|carr/.test(type.key)) || TYPE;
    const wetStand = stand({
        regionalType: floodplain, regionalTypeId: floodplain.id,
        regionalEffects: { ...(floodplain.effects || {}), flood: 0.9 },
        moisture: 0.86, wetness: 0.9, ground: { pools: 0.4, soil: "alluvial" },
    });
    const wet = forestFloodPressureFor(wetStand, { season: 0, weather: "rain" });
    const dry = forestFloodPressureFor(stand({ moisture: 0.2, wetness: 0.1, regionalEffects: { flood: 0 } }), {
        season: 2, weather: "clear",
    });
    assert.ok(wet.pressure > dry.pressure, "a wet floodplain in spring rain must carry the higher flood pressure");
    assert.equal(wet.floodplain, true);
    assert.ok(forestDisturbanceMatrixFor(wetStand).flood > forestDisturbanceMatrixFor(stand({ wetness: 0.1 })).flood);
    assert.ok(FOREST_TYPES.flooded, "the flood formation must exist");
    assert.ok(FOREST_DISTURBANCE_KINDS.includes("flooded"));
    assert.ok(FOREST_SUCCESSION_PROFILES.flooded.recoveredDays > FOREST_SUCCESSION_PROFILES.flooded.freshDays);
});

test("disturbance and succession matrices expose the shared stage thresholds", () => {
    const wet = forestDisturbanceMatrixFor(stand({ moisture: 0.82, wetness: 0.86, regionalEffects: { flood: 0.9 } }));
    const dry = forestDisturbanceMatrixFor(stand({ moisture: 0.2, wetness: 0.12, regionalEffects: { flood: 0 } }));
    assert.ok(wet.flood > dry.flood);
    assert.ok(wet.returnYears >= 8);
    assert.ok(["fire", "wind", "ice", "flood", "disease"].includes(wet.dominant));
    const fresh = forestSuccessionMatrixFor(stand({ succession: { kind: "burned", age: 30 } }));
    const recovered = forestSuccessionMatrixFor(stand({ succession: { kind: "burned", age: 900 } }));
    assert.equal(fresh.stage, "fresh");
    assert.equal(fresh.transitions.length, 4);
    assert.equal(fresh.transitions[0].to, "regrowth");
    assert.equal(recovered.stage, "recovered");
    assert.equal(recovered.kind, "burned");
});

test("the regional species pool separates trees, animals and understorey plants", () => {
    const pool = forestSpeciesPoolFor(TYPE);
    assert.ok(pool.treeCount >= 3);
    assert.ok(pool.animalCount >= 3);
    assert.ok(pool.plantCount >= 1);
    assert.equal(pool.richness, pool.treeCount + pool.animalCount + pool.plantCount);
    assert.ok(pool.trees.every(entry => entry.weight > 0));
    assert.ok(pool.plants.every(id => !/timber|wood|log|plank|firewood|charcoal/.test(id)));
    assert.equal(forestSpeciesPoolFor(TYPE), pool, "species pools are cached by type");
});

test("LOD, chunk precompute, work budget and telemetry stay bounded", () => {
    assert.equal(forestLodFor(1).tier, "detail");
    assert.equal(forestLodFor(0.6).tier, "canopy");
    assert.equal(forestLodFor(0.3).tier, "mass");
    assert.equal(forestLodFor(0).tier, "impostor");
    assert.ok(forestLodFor(0).maxTrees < forestLodFor(1).maxTrees);
    const budget = forestChunkBudgetFor(1);
    assert.equal(budget.maxStands, 16);
    assert.equal(budget.maxTypes, 8);
    assert.equal(budget.withinBudget, true);
    assert.equal(forestChunkKeyFor(12, 8), "0:0");
    assert.equal(forestChunkKeyFor(16, 31), "1:1");
    resetForestModelTelemetry();
    clearForestModelCaches();
    const chunk = precomputeForestChunk({
        chunkX: 0, chunkY: 0, seed: 99, climate: "temperate", day: 10, zoom: 1,
        standAt: () => stand(),
    });
    assert.equal(chunk.sampled, 16);
    assert.equal(chunk.stands, 16);
    assert.equal(chunk.typeId, TYPE.id);
    assert.equal(chunk.withinBudget, true);
    assert.ok(Number.isFinite(chunk.elapsedMs) && chunk.elapsedMs >= 0);
    const again = precomputeForestChunk({
        chunkX: 0, chunkY: 0, seed: 99, climate: "temperate", day: 10, zoom: 1,
        standAt: () => stand(),
    });
    assert.equal(again, chunk);
    const telemetry = forestModelTelemetrySnapshot();
    assert.equal(telemetry.chunksBuilt, 1);
    assert.equal(telemetry.cacheHits, 1);
    assert.equal(telemetry.cacheMisses, 1);
    assert.ok(telemetry.samples.length <= 8);
    assert.ok(forestModelCacheStats().chunks <= 64);
});

test("annual cadence, seasonal phenology and deterministic region/RNG seeds", () => {
    const spring = forestAnnualCadenceFor(0);
    const next = forestAnnualCadenceFor(400);
    assert.equal(spring.due, true);
    assert.equal(spring.year, 0);
    assert.equal(next.due, true);
    assert.equal(next.year, 1);
    assert.equal(forestAnnualCadenceFor(150).phase, "summer");
    const flowering = forestPhenologyFor(stand(), 120, "temperate");
    const fruiting = forestPhenologyFor(stand(), 270, "temperate");
    const winter = forestPhenologyFor(stand(), 330, "temperate");
    assert.ok(flowering.floweringCount >= 1);
    assert.ok(fruiting.fruitingCount >= 1);
    assert.equal(winter.leaf, "bare");
    assert.equal(forestRegionSeedFor(1, 4, 9, TYPE.id), forestRegionSeedFor(1, 4, 9, TYPE.id));
    assert.notEqual(forestRegionSeedFor(1, 4, 9, TYPE.id), forestRegionSeedFor(1, 5, 9, TYPE.id));
    assert.equal(forestRngSeedFor("vegetation", 1, 4, 9), forestRngSeedFor("vegetation", 1, 4, 9));
    assert.notEqual(forestRngSeedFor("vegetation", 1, 4, 9), forestRngSeedFor("animals", 1, 4, 9));
    assert.equal(FOREST_RNG_STREAMS.vegetation, "forest-vegetation");
});

test("save metadata migrates legacy indices without losing a woodland", () => {
    assert.equal(FOREST_MODEL_SAVE_VERSION, 1);
    assert.equal(FOREST_MODEL_VERSION, 1);
    assert.equal(forestModelSaveMeta().typeIds, 60);
    const migrated = migrateForestModelSave({ version: 0, forestKind: [1, 2, 2, 60, 0] });
    assert.equal(migrated.version, 1);
    assert.deepEqual(migrated.typeIds, [REGIONAL_FOREST_TYPES[0].id, REGIONAL_FOREST_TYPES[1].id, REGIONAL_FOREST_TYPES[59].id]);
    assert.equal(migrated.lost, 0);
    assert.equal(validateForestModelSave(migrated), true);
    assert.throws(() => validateForestModelSave({ version: 99, typeIds: [] }), /version/i);
    assert.throws(() => validateForestModelSave({ version: 1, typeIds: ["missing"] }), /Unknown forest type/i);
});

test("the modding schema validates the catalog and rejects broken weights", () => {
    for (const type of REGIONAL_FOREST_TYPES) {
        assert.equal(validateForestTypeDefinition(type).ok, true, `${type.id} must satisfy the schema`);
    }
    const custom = {
        ...TYPE, id: "mod:test-wood", key: "test-wood", label: "Test Wood",
        species: { oak: 0.6, beech: 0.4 },
    };
    assert.equal(validateForestTypeDefinition(custom).ok, true);
    const broken = { ...custom, species: { oak: -0.1, beech: 0 } };
    assert.equal(validateForestTypeDefinition(broken).ok, false);
    assert.ok(validateForestTypeDefinition(broken).errors.length >= 1);
    assert.equal(FOREST_MODDING_SCHEMA.version, FOREST_MODEL_VERSION);
});

test("spatial indices and neighbourhood order keep fire spread inside the map", () => {
    const index = buildForestSpatialIndex([
        { id: "a", x: 1, y: 1 }, { id: "b", x: 1.5, y: 2 }, { id: "c", x: 9, y: 9 },
    ], { cellSize: 4 });
    assert.equal(index.size, 3);
    assert.deepEqual(queryForestSpatialIndex(index, 1, 1, 2).map(entry => entry.item.id), ["a", "b"]);
    assert.equal(queryForestSpatialIndex(index, 20, 20, 2).length, 0);
    assert.equal(forestNeighboursFor(0, 0, 10, 10).length, 3);
    assert.equal(forestNeighboursFor(5, 5, 10, 10).length, 8);
    assert.equal(forestNeighboursFor(9, 9, 10, 10).length, 3);
    const order = forestNeighbourOrderFor({ x: 5, y: 5, width: 10, height: 10, wind: "storm", seed: 7 });
    assert.equal(order[0].id, "e", "a storm wind orders the eastern neighbour first");
    assert.equal(order.length, 8);
    const fire = forestFireSpreadFor({
        x: 5, y: 5, width: 10, height: 10, wind: "storm", season: "summer", seed: 7,
        standAt: () => stand({ fireRisk: 0.5 }),
    });
    assert.equal(fire.length, 8);
    assert.equal(fire[0].id, "e");
    assert.ok(fire[0].risk > fire.at(-1).risk);
});

test("windthrow, water flow, erosion, regeneration and biodiversity read the same stand", () => {
    const young = forestWindthrowFor(stand({ standAge: 20, windExposure: 0.6 }), 20);
    const old = forestWindthrowFor(stand({ standAge: 380, windExposure: 0.6 }), 380);
    assert.ok(old.risk > young.risk);
    assert.ok(["n", "ne", "e", "se", "s", "sw", "w", "nw"].includes(old.direction));
    assert.ok(old.salvage >= 0);
    const floodplain = forestWaterFlowFor(stand({
        regionalType: REGIONAL_FOREST_TYPES.find(type => type.key === "ash-elm-floodplain") || TYPE,
        wetness: 0.86, moisture: 0.84, height: 0.35, regionalEffects: { flood: 0.9 },
    }));
    assert.equal(floodplain.floodplain, true);
    assert.ok(floodplain.flow > 0.45);
    const mature = stand({ canopy: 0.95, dynamics: { regeneration: { seedBank: 0.92, motherTreesPerHa: 32, factor: 1.2 } } });
    const cutover = stand({
        canopy: 0.08, deadwood: 0.05, speciesDiversity: 0.1,
        succession: { kind: "burned", age: 20 },
        dynamics: { regeneration: { seedBank: 0.08, motherTreesPerHa: 1, factor: 0.5 } },
        ground: { soil: "dry", humus: 0.05, sourSoil: 0.4, litter: 0.05, compaction: 0.7 },
    });
    assert.ok(forestErosionFor(cutover).risk > forestErosionFor(mature).risk);
    assert.ok(forestRegenerationFor(cutover).yearsToCanopy > forestRegenerationFor(mature).yearsToCanopy);
    const ancient = stand({
        ageClass: "ancient", speciesDiversity: 0.92, deadwood: 0.82,
        structure: { herb: 0.7, shrub: 0.6, sapling: 0.5, canopy: 0.95, deadwood: 0.8 },
        faunaEcology: { speciesRichness: 14 },
    });
    const monoculture = stand({
        ageClass: "young", speciesDiversity: 0.08, deadwood: 0.05,
        structure: { herb: 0.15, shrub: 0.1, sapling: 0.1, canopy: 0.4, deadwood: 0.05 },
        faunaEcology: { speciesRichness: 1 },
    });
    assert.ok(forestBiodiversityFor(ancient).index > forestBiodiversityFor(monoculture).index);
    assert.ok(forestBiodiversityFor(ancient).percent > 50);
});

test("one bounded read model exposes all thirty requirements without NaN", () => {
    const model = forestModelFor(stand(), { day: 120, climate: "temperate", zoom: 1, seed: 4711 });
    assert.equal(model.typeId, TYPE.id);
    assert.equal(model.requirementIds.length, 30);
    assert.equal(model.requirementIds[0], "1.2.23.1.121");
    assert.equal(model.requirementIds.at(-1), "1.2.23.1.150");
    assert.ok(model.distribution.share > 0 && model.distribution.share <= 1);
    assert.ok(model.soil.pH >= 4.2 && model.soil.pH <= 7.4);
    assert.ok(model.moisture.index >= 0 && model.moisture.index <= 1);
    assert.ok(model.disturbance.returnYears >= 8);
    assert.equal(model.succession.stage, "undisturbed");
    assert.ok(model.species.treeCount >= 3);
    assert.ok(model.lod.maxTrees > 0);
    assert.equal(model.chunk.key, "0:0");
    assert.equal(model.cadence.phase, "summer");
    assert.ok(model.biodiversity.percent >= 0 && model.biodiversity.percent <= 100);
    assert.ok(model.erosion.risk >= 0 && model.erosion.risk <= 1);
    assert.ok(model.regeneration.yearsToCanopy >= 6);
    assert.ok(model.windthrow.risk >= 0 && model.windthrow.risk <= 1);
    assert.ok(model.water.flow >= 0 && model.water.flow <= 1);
    assert.equal(new Set([model.rng.vegetation, model.rng.animals, model.rng.events]).size, 3);
    assert.equal(model.rng.streams.vegetation, "forest-vegetation");
    assert.equal(model.rng.streams.animals, "forest-animals");
    assert.equal(model.rng.streams.events, "forest-events");
    const summary = forestModelSummaryFor(model);
    assert.match(summary, /^\d{3} · \d+% region/);
    assert.doesNotMatch(summary, /undefined|NaN/);
    const json = JSON.stringify(model);
    assert.doesNotMatch(json, /"NaN"|null,"NaN"/);
});
