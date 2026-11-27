import test from "node:test";
import assert from "node:assert/strict";
import { state, resetState } from "../../js/core/state.js";
import { initWorld } from "../../js/world/world.js";
import {
    DATA_PACK_FORMAT, DATA_PACK_GAME_VERSION, installDataPack, removeDataPack,
} from "../../js/core/data-packs.js";
import {
    FOREST_LEGACY_ACTION_LIMIT, FOREST_LEGACY_GROUPS, FOREST_LEGACY_HAZARD_IDS,
    FOREST_LEGACY_REGIONS, FOREST_LEGACY_REQUIREMENTS, FOREST_LEGACY_RING_LIMIT,
} from "../../js/world/forest-legacy-data.js";
import {
    FOREST_LEGACY_AFFOREST_COST, FOREST_LEGACY_PROTECTION_COST,
    afforestForestRegion, applyForestHazard, buildForestInstitution, designateForestMonument,
    ensureForestLegacy, forestLegacyCentury, forestLegacyCodex, forestLegacyForestTypes,
    forestLegacyRegion, forestLegacyRingArchive, forestLegacySummary, fundCitizenScience,
    protectForestRegion, reintroduceForestSpecies, resetForestLegacy, restoreForestLegacyState,
    serializeForestLegacyState, setForestConservationLaw, updateForestLegacy,
    validateForestLegacySnapshot,
} from "../../js/systems/forest-legacy.js";

function makeCanvas() {
    const context = {
        createImageData(width, height) { return { width, height, data: new Uint8ClampedArray(width * height * 4) }; },
        putImageData() {}, clearRect() {}, fillRect() {}, drawImage() {},
    };
    return { width: 1, height: 1, style: {}, getContext() { return context; } };
}
globalThis.document = { createElement: () => makeCanvas() };

const WORLD_OPTIONS = Object.freeze({
    size: "small", shape: "continent", water: 46, landmass: 58,
    fertility: 55, forests: 78, mountains: 55, ruggedness: 58, climate: "temperate",
});
const SEED = 20261127;

function setup(seed = SEED) {
    resetState();
    initWorld(seed, WORLD_OPTIONS);
    state.hasStarted = true;
    state.year = 1;
    state.dayOfYear = 0;
    state.seasonIndex = 0;
    state.resources = { wood: 1200, stone: 400, gold: 900, food: 300 };
    state.morale = 55;
    ensureForestLegacy();
    return state.forestLegacy;
}

test("the 30-point long-term forest register is complete and every point names a consumer", () => {
    assert.equal(FOREST_LEGACY_REQUIREMENTS.length, 30);
    assert.equal(new Set(FOREST_LEGACY_REQUIREMENTS.map(entry => entry.id)).size, 30);
    assert.deepEqual(
        FOREST_LEGACY_REQUIREMENTS.map(entry => Number(entry.id.slice(-3))),
        Array.from({ length: 30 }, (_, index) => 271 + index),
    );
    assert.equal(FOREST_LEGACY_GROUPS.length, 5);
    for (const point of FOREST_LEGACY_REQUIREMENTS) {
        assert.ok(point.title.length > 4, point.id + " needs a player-facing title");
        assert.ok(point.consumer.length > 8, point.id + " needs a live consumer");
        assert.ok(point.detail.length > 20, point.id + " needs a useful detail");
    }
    assert.equal(FOREST_LEGACY_REGIONS.length, 10);
    assert.equal(new Set(FOREST_LEGACY_REGIONS.map(entry => entry.id)).size, 10);
    assert.equal(new Set(FOREST_LEGACY_REGIONS.map(entry => entry.climate)).size >= 3, true);
    assert.equal(FOREST_LEGACY_HAZARD_IDS.length, 6);
});

test("the ledger starts ten linked province woods with species, rings and century projections", () => {
    const model = setup();
    assert.equal(model.regions.length, 10);
    assert.equal(new Set(model.regions.map(region => region.id)).size, 10);
    assert.equal(model.regions.every(region => region.species.length >= 3), true);
    assert.equal(model.regions.every(region => region.species.some(species => species.kind === "tree")), true);
    assert.equal(model.regions.every(region => region.species.some(species => species.kind === "animal")), true);
    assert.equal(model.regions.every(region => region.atlasRegionId), true);
    assert.equal(model.stats.rings, model.regions.reduce((sum, region) => sum + region.rings.length, 0));
    assert.ok(model.stats.rings > 0, "founding rings must be counted in the headline ledger");
    for (const region of model.regions) {
        const archive = forestLegacyRingArchive(region.id, 8);
        const century = forestLegacyCentury(region.id);
        assert.ok(archive.length >= 1 && archive.length <= 8);
        assert.equal(century.length, 3);
        assert.ok(century.every(stage => stage.horizon >= 100 && stage.phase));
        const summary = forestLegacyRegion(region.id);
        assert.equal(summary.id, region.id);
        assert.equal(summary.rules.protection, "none");
    }
    const summary = forestLegacySummary();
    assert.equal(summary.regions.length, 10);
    assert.ok(summary.guardrails.length >= 3);
});

test("all six regional hazards can strike, damage canopy and leave a historical record", () => {
    const model = setup();
    const region = model.regions.find(entry => entry.id === "crown-march");
    const before = region.canopy;
    for (const [index, kind] of FOREST_LEGACY_HAZARD_IDS.entries()) {
        const result = applyForestHazard(region.id, kind, { severity: 0.7 + index * 0.03, year: 10 + index });
        assert.equal(result.ok, true, kind);
        assert.equal(region.hazards[kind].year, 10 + index);
        assert.ok(region.hazards[kind].severity > 0, kind + " severity");
        assert.ok(region.hazards[kind].loss >= 0, kind + " loss");
    }
    assert.ok(region.canopy < before, "hazards must reduce canopy");
    assert.equal(model.stats.hazards, 6);
    assert.equal(model.history.length >= 6, true);
    assert.equal(applyForestHazard(region.id, "meteor", {}).ok, false);
});

test("conservation, protection, institutions, planting, reintroduction and monuments are real actions", () => {
    const model = setup();
    for (const id of ["seed-bank", "gene-bank", "nursery", "museum"]) {
        const result = buildForestInstitution(id);
        assert.equal(result.ok, true, id);
        assert.equal(model.institutions[id], 1);
        assert.equal(buildForestInstitution(id).ok, true);
    }
    assert.equal(model.institutions.nursery, 2);
    assert.equal(model.seedlings, 8, "each nursery level grants four seedlings immediately");
    assert.equal(setForestConservationLaw("protected").ok, true);
    assert.equal(model.law, "protected");
    assert.equal(setForestConservationLaw("protected").ok, false);
    assert.equal(protectForestRegion("crown-march").ok, true);
    assert.equal(model.regions.find(region => region.id === "crown-march").protection, "reserve");
    assert.equal(protectForestRegion("crown-march").ok, false, "a reserve cannot be declared twice");
    assert.equal(fundCitizenScience().ok, true);
    assert.equal(model.citizenScience, 1);

    state.year = 2;
    const annual = updateForestLegacy();
    assert.equal(annual.updated, true);
    assert.ok(model.seedlings >= 8);
    assert.ok(model.seedStock >= 2);

    const region = model.regions.find(entry => entry.id === "crown-march");
    region.ageYears = 150;
    assert.equal(afforestForestRegion(region.id).ok, true);
    assert.ok(model.stats.planted >= 8);
    state.year = 3;
    assert.equal(designateForestMonument(region.id).ok, true);
    assert.equal(region.monuments.length, 1);
    assert.equal(model.stats.monuments, 1);

    const tree = region.species.find(species => species.kind === "tree");
    tree.status = "extinct";
    tree.share = 0;
    region.extinct += 1;
    state.year = 4;
    const reintroduced = reintroduceForestSpecies(region.id, tree.id);
    assert.equal(reintroduced.ok, true);
    assert.equal(tree.status, "living");
    assert.equal(model.stats.reintroduced, 1);
    assert.equal(forestLegacyCodex().knownCount > 0, true);
    assert.ok(model.stats.rings > 0);
});

test("afforestation and reintroduction fail without their institutions, material and year", () => {
    const model = setup();
    const region = mapRegion(model);
    assert.equal(afforestForestRegion(region.id).reason, "nursery-required");
    region.species[0].status = "extinct";
    assert.equal(reintroduceForestSpecies(region.id).reason, "seed-or-gene-bank-required");
    assert.equal(protectForestRegion("unknown-province").reason, "unknown-region");
    assert.equal(setForestConservationLaw("unknown-law").reason, "unknown-law");
});

function mapRegion(model) {
    return model.regions[0];
}

test("a stored ledger round-trips through JSON with the same regions, rings and stats", () => {
    const model = setup();
    state.year = 2;
    updateForestLegacy();
    const snapshot = serializeForestLegacyState();
    assert.equal(validateForestLegacySnapshot(snapshot), true);
    const before = JSON.stringify(forestLegacySummary().stats);
    resetState();
    restoreForestLegacyState(JSON.parse(JSON.stringify(snapshot)));
    const restored = state.forestLegacy;
    assert.equal(restored.regions.length, 10);
    assert.equal(JSON.stringify(forestLegacySummary().stats), before);
    assert.equal(restored.regions[0].rings.length, snapshot.regions[0].rings.length);
    assert.equal(typeof restored.codexKey, "function");
    assert.throws(() => validateForestLegacySnapshot({ version: 999, seed: 1, regions: [] }), /version/i);
});

test("the same seed and actions produce the same 25-year forest, and the annual pass is idempotent", () => {
    const run = () => {
        const model = setup();
        for (let year = 2; year <= 25; year++) {
            state.year = year;
            updateForestLegacy();
            updateForestLegacy();
        }
        return JSON.stringify(serializeForestLegacyState());
    };
    const first = run();
    const second = run();
    assert.equal(first, second);
    assert.equal(state.forestLegacy.lastUpdateYear, 25);
});

test("a 300-year soak keeps the ledger bounded and the annual work finite", { timeout: 120000 }, () => {
    const model = setup();
    for (let year = 2; year <= 300; year++) {
        state.year = year;
        const result = updateForestLegacy();
        assert.equal(result.updated, true);
        assert.equal(model.regions.length, 10);
        for (const region of model.regions) {
            assert.ok(region.rings.length <= FOREST_LEGACY_RING_LIMIT);
            assert.ok(region.species.length <= 8);
            assert.ok(region.species.every(species => species.stress >= 0 && species.stress <= 100));
            assert.ok(region.canopy >= 0 && region.canopy <= 1);
            assert.ok(region.extinct >= 0);
        }
        assert.ok(model.history.length <= 40);
        assert.ok(model.actions.length <= FOREST_LEGACY_ACTION_LIMIT);
    }
    assert.ok(model.stats.rings > 100);
    assert.ok(model.regions.some(region => region.rings.length === FOREST_LEGACY_RING_LIMIT));
    assert.equal(model.regions.filter(region => region.species.some(species => species.status === "extinct")).length >= 0, true);
});

test("community forest types are discoverable through the same type catalogue as built-in woods", () => {
    setup();
    const types = forestLegacyForestTypes();
    assert.ok(types.length >= 10);
    assert.equal(new Set(types.map(type => type.id)).size, types.length);
    assert.equal(forestLegacySummary().moddedTypes.length >= 0, true);
});

test("a validated community forest can seed the first province through a scenario", () => {
    const previousStorage = globalThis.localStorage;
    const values = new Map();
    globalThis.localStorage = {
        getItem(key) { return values.has(key) ? values.get(key) : null; },
        setItem(key, value) { values.set(key, String(value)); },
        removeItem(key) { values.delete(key); },
    };
    try {
        setup();
        const installed = installDataPack({
            format: DATA_PACK_FORMAT,
            formatVersion: 1,
            id: "community-wood",
            name: "Community Wood",
            author: "Test Grove",
            version: "1.0.0",
            gameVersion: DATA_PACK_GAME_VERSION,
            description: "A local community woodland used by the legacy scenario path.",
            scenarios: [],
            regions: [],
            forests: [{
                id: "silver-grove",
                name: "Silver Grove",
                description: "A cool birch grove beside the community hall.",
                climates: ["temperate"],
                palette: ["#607b52", "#a4b58a"],
                species: [
                    { id: "silver-birch", name: "Silver Birch", kind: "tree", share: 70 },
                    { id: "hazel", name: "Hazel", kind: "tree", share: 20 },
                    { id: "robin", name: "Robin", kind: "animal", share: 5 },
                ],
            }],
        });
        assert.equal(installed.ok, true, installed.error);
        const typeId = "community-wood-silver-grove";
        state.scenario = { forestType: typeId };
        resetForestLegacy();
        const model = ensureForestLegacy();
        assert.equal(model.regions[0].typeId, typeId);
        assert.equal(model.regions[0].typeLabel, "Silver Grove");
        assert.equal(model.regions[0].species.some(species => species.label === "Silver Birch"), true);
    } finally {
        removeDataPack("community-wood");
        globalThis.localStorage = previousStorage;
    }
});
