import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { migrateSaveSnapshot } from "../../js/core/save-migrations.js";
import { SAVE_SCHEMA_VERSION } from "../../js/core/save-validation.js";
import {
    cleanseHazardCorruption, createEnvironmentalHazardState, getHazardMitigation,
    getHazardProfile, getHazardSnapshot, normalizeEnvironmentalHazardState,
    prepareForHazardSeason, restoreEnvironmentalHazardState,
    serializeEnvironmentalHazardState, treatHazardCasualties,
    updateEnvironmentalHazardYear, updateEnvironmentalHazards,
    validateEnvironmentalHazardState
} from "../../js/systems/environmental-hazards.js";
import {
    HAZARD_CATALOG, HAZARD_CLIMATES, HAZARD_EFFECTS, HAZARD_MECHANICS,
    HAZARD_LIMITS, REGIONAL_BUNDLES, hazardRowsForClimate
} from "../../js/world/hazard-data.js";
import { getHazardModifiers, getHazardWorkFactor } from "../../js/systems/hazard-modifiers.js";

const SEED = 20261122;

function prepareRealm({ climate = "temperate", season = 1, residents = 6, farms = 3 } = {}) {
    resetState();
    state.worldSeed = SEED;
    state.worldW = 48;
    state.worldH = 48;
    state.terrainResolution = 1;
    state.terrainPixW = 48;
    state.terrainPixH = 48;
    state.seaLevel = 0.33;
    state.worldOptions = { size: "standard", shape: "continent", climate, landmass: 50, ruggedness: 55, forests: 52, water: 48, fertility: 55, resources: 50 };
    state.heightMap = new Float32Array(48 * 48).fill(0.55);
    state.moistureMap = new Float32Array(48 * 48).fill(0.5);
    state.temperatureMap = new Float32Array(48 * 48).fill(0.6);
    state.resources = { wood: 120, stone: 90, gold: 80, food: 140 };
    state.dayOfYear = season * 100 + 10;
    state.seasonIndex = season;
    state.year = 3;
    state.tick = 900;
    state.hasStarted = true;
    state.isPaused = false;
    state.gameOver = false;
    state.weather = "clear";
    state.morale = 70;
    state.eventLog = [];
    state.entities = [];
    state.health = { outbreakActive: false, disease: "none", severity: 0, containment: 0, cases: 0, recovered: 0, outbreaks: 0, herbalDoses: 4, herbalTreated: 0, lastUpdateTick: 0, startedAtTick: 0, healers: [], medicine: 0, sanitation: { score: 40 } };
    state.roads = { version: 1, revision: 0, tiles: {} };
    state.research = { completed: [] };
    state.diplomacy = { relations: { Arden: { relation: 40 }, Kestrel: { relation: 20 }, Vale: { relation: -5 } } };
    for (let index = 0; index < residents; index++) {
        state.entities.push({
            id: "villager-" + index, type: TYPE.VILLAGER, x: 10 + index, y: 12, hp: 35, maxHp: 35,
            dead: false, person: { name: "Resident " + index }, isBuilding() { return false; }
        });
    }
    for (let index = 0; index < farms; index++) {
        state.entities.push({
            id: "farm-" + index, type: TYPE.FARM, x: 16 + index * 2, y: 18, hp: 90, maxHp: 90,
            dead: false, isBuilding() { return true; },
            field: { stage: "growing", growth: 80, fertility: 60, maxFertility: 60, resting: false, lastReason: "Growing" }
        });
    }
    state.environmentalHazards = createEnvironmentalHazardState();
    return state;
}

function addBuilding(type, id, extra = {}) {
    const entity = {
        id, type, x: 20 + state.entities.length, y: 22, hp: 120, maxHp: 120, dead: false,
        isBuilding() { return true; }, ...extra
    };
    state.entities.push(entity);
    return entity;
}

test("1.2.20 catalogue covers all 102 requirements with implemented mechanics", () => {
    assert.equal(HAZARD_CATALOG.length, 102);
    const specs = new Set();
    const ids = new Set();
    for (let index = 0; index < HAZARD_CATALOG.length; index++) {
        const row = HAZARD_CATALOG[index];
        assert.equal(row.spec, "1.2.20." + (index + 1), "spec ids stay in order");
        assert.ok(!specs.has(row.spec), "duplicate spec " + row.spec);
        assert.ok(!ids.has(row.id), "duplicate id " + row.id);
        specs.add(row.spec);
        ids.add(row.id);
        assert.ok(HAZARD_MECHANICS.includes(row.mechanic), "missing mechanic for " + row.spec + ": " + row.mechanic);
        assert.ok(row.climates.every(climate => HAZARD_CLIMATES.includes(climate)), "unknown climate on " + row.spec);
        assert.ok(row.label.length > 2);
    }
    // Every mechanic is either a rolling hazard with real numbers, or a
    // modifier/work/chronic/magic rule the engine evaluates.
    for (const mechanic of HAZARD_MECHANICS) {
        assert.ok(HAZARD_CATALOG.some(row => row.mechanic === mechanic), "unused mechanic " + mechanic);
    }
    for (const [mechanic] of Object.entries(HAZARD_EFFECTS)) {
        assert.ok(HAZARD_MECHANICS.includes(mechanic), "effect without mechanic " + mechanic);
    }
    for (const bundle of Object.values(REGIONAL_BUNDLES)) {
        for (const key of bundle.hazards) {
            assert.ok(HAZARD_EFFECTS["hazard:" + key], "bundle references unknown hazard " + key);
        }
    }
});

test("1.2.20 every climate receives its own hazard set", () => {
    for (const climate of HAZARD_CLIMATES) {
        const rows = hazardRowsForClimate(climate);
        assert.ok(rows.length >= 4, climate + " has too few hazards");
    }
    const arid = hazardRowsForClimate("arid").map(row => row.id);
    const snow = hazardRowsForClimate("snow").map(row => row.id);
    assert.ok(arid.includes("extreme-heat"));
    assert.ok(!arid.includes("extreme-cold"));
    assert.ok(snow.includes("extreme-cold"));
    assert.ok(!snow.includes("extreme-heat"));
});

test("1.2.20 seasonal pass is deterministic and bounded", () => {
    prepareRealm({ climate: "arid", season: 1 });
    const first = updateEnvironmentalHazards({ force: true });
    const snapshotA = JSON.stringify(serializeEnvironmentalHazardState());
    resetState();
    prepareRealm({ climate: "arid", season: 1 });
    const second = updateEnvironmentalHazards({ force: true });
    assert.deepEqual(second.active.map(hazard => hazard.mechanic), first.active.map(hazard => hazard.mechanic));
    assert.equal(JSON.stringify(serializeEnvironmentalHazardState()), snapshotA);
    assert.ok(first.active.length <= 6);
    const repeat = updateEnvironmentalHazards();
    assert.equal(repeat.skipped, true, "the same season must not roll twice");
});

test("1.2.20 hazards cost health, stores and morale", () => {
    let hurt = false;
    for (let seed = 1; seed <= 40 && !hurt; seed++) {
        resetState();
        prepareRealm({ climate: "arid", season: 1 });
        state.worldSeed = seed;
        const food = state.resources.food;
        const morale = state.morale;
        updateEnvironmentalHazards({ force: true });
        const ill = state.entities.some(entity => Number(entity.illnessUntilTick) > state.tick);
        hurt = state.resources.food < food || state.morale < morale || ill;
    }
    assert.ok(hurt, "an extreme season must produce a real loss");
});

test("1.2.20 drought and frost damage real fields", () => {
    let damaged = false;
    for (let seed = 1; seed <= 40 && !damaged; seed++) {
        resetState();
        prepareRealm({ climate: "arid", season: 1 });
        state.worldSeed = seed;
        const before = state.entities.filter(entity => entity.type === TYPE.FARM).map(entity => entity.field.growth);
        updateEnvironmentalHazards({ force: true });
        const after = state.entities.filter(entity => entity.type === TYPE.FARM).map(entity => entity.field.growth);
        damaged = after.some((value, index) => value < before[index]);
    }
    assert.ok(damaged, "a field hazard must reduce growth");
});

test("1.2.20 protection works raise readiness and lower severity", () => {
    prepareRealm({ climate: "snow", season: 3 });
    const before = getHazardMitigation();
    addBuilding(TYPE.WELL, "well-1");
    addBuilding(TYPE.CLINIC, "clinic-1");
    addBuilding(TYPE.WAREHOUSE, "store-1");
    addBuilding(TYPE.BATHHOUSE, "bath-1");
    addBuilding(TYPE.SCHOOL, "school-1");
    const after = getHazardMitigation();
    assert.ok(after.score > before.score, "real works must raise the score");
    assert.ok(after.well > 0 && after.medical > 0 && after.warehouse > 0);
    const profile = getHazardProfile();
    assert.ok(profile.mitigation.score > 0);
    assert.ok(profile.hazards.length > 0);
});

test("1.2.20 structural damage hits a real building but never the keep", () => {
    let destroyed = null;
    for (let seed = 1; seed <= 60 && !destroyed; seed++) {
        resetState();
        prepareRealm({ climate: "volcanic", season: 1 });
        state.worldSeed = seed;
        addBuilding(TYPE.KEEP, "keep-1", { x: 2, y: 2 });
        addBuilding(TYPE.HOUSE, "house-1", { x: 40, y: 40 });
        updateEnvironmentalHazards({ force: true });
        const house = state.entities.find(entity => entity.id === "house-1");
        const keep = state.entities.find(entity => entity.id === "keep-1");
        assert.equal(keep.dead, false, "the keep is protected");
        // A farm is a structure too; any non-protected building is a valid loss.
        const lost = state.entities.find(entity => entity.dead && entity.id !== "keep-1");
        if (house.dead) destroyed = house;
        else if (lost) destroyed = lost;
    }
    assert.ok(destroyed, "a destructive hazard must be reachable");
    assert.equal(destroyed.destroyedBy.startsWith("hazard-"), true);
});

test("1.2.20 annual pass compounds drought, plague and fire", () => {
    prepareRealm({ climate: "arid", season: 1 });
    updateEnvironmentalHazards({ force: true });
    // Force the chronic branch by making the drought the active hazard.
    const entry = state.environmentalHazards;
    entry.active = [{ id: "drought", mechanic: "hazard:drought", label: "Drought", category: "weather", spec: "1.2.20.5", severity: 0.8, startedYear: 3, effects: {} }];
    entry.lastYear = 0;
    state.health.outbreakActive = true;
    state.health.disease = "swamp fever";
    const result = updateEnvironmentalHazardYear();
    assert.equal(result.skipped, false);
    assert.ok(state.environmentalHazards.chronic.droughtYears >= 1);
    assert.ok(state.environmentalHazards.chronic.plagueSpread.length >= 1, "an outbreak reaches trade partners");
    assert.ok(state.environmentalHazards.chronic.floodScars >= 0);
    assert.ok(state.environmentalHazards.history.length >= 1);
});

test("1.2.20 wildfire zones and scars survive the year", () => {
    prepareRealm({ climate: "taiga", season: 1 });
    updateEnvironmentalHazards({ force: true });
    const entry = state.environmentalHazards;
    entry.active = [{ id: "heatwave", mechanic: "hazard:heatwave", label: "Heatwave", category: "weather", spec: "1.2.20.4", severity: 0.9, startedYear: 3, effects: {} }];
    entry.lastYear = 0;
    updateEnvironmentalHazardYear();
    assert.ok(state.environmentalHazards.chronic.wildfireZones.length >= 1);
    assert.ok(state.environmentalHazards.chronic.burntTiles > 0);
});

test("1.2.20 arcane burden grows, spreads and can be cleansed", () => {
    prepareRealm({ climate: "enchanted", season: 3 });
    updateEnvironmentalHazards({ force: true });
    const entry = state.environmentalHazards;
    entry.magic.corruption = 0.5;
    entry.lastYear = 0;
    updateEnvironmentalHazardYear();
    assert.ok(entry.magic.corruption > 0);

    const before = entry.magic.corruption;
    const cleanse = cleanseHazardCorruption();
    assert.equal(cleanse.ok, true);
    assert.ok(state.environmentalHazards.magic.corruption < before);
    assert.ok(state.resources.stone < 90 && state.resources.gold < 80);
    assert.equal(cleanseHazardCorruption().ok, true, "a second cleansing is allowed while taint remains");
    const again = cleanseHazardCorruption();
    assert.equal(again.ok, false, "cleansing is a real, limited action");
});

test("1.2.20 preparation and treatment are real, limited actions", () => {
    prepareRealm({ climate: "savanna", season: 1 });
    const wood = state.resources.wood;
    const prepared = prepareForHazardSeason();
    assert.equal(prepared.ok, true);
    assert.ok(state.resources.wood < wood);
    assert.equal(prepareForHazardSeason().ok, false, "one preparation per season");

    state.entities[0].illnessUntilTick = state.tick + 100;
    // `herbalDoses` is a ledger of doses already given, not a store. It must
    // never be treated as medicine that can be spent again.
    state.health.herbalDoses = 4;
    state.health.medicineStock = 0;
    assert.equal(treatHazardCasualties().ok, false, "a used-dose counter is not a medicine store");
    state.health.medicineStock = 2;
    const treated = treatHazardCasualties();
    assert.equal(treated.ok, true);
    assert.ok(treated.treated >= 1);
    assert.equal(state.health.medicineStock, 2 - treated.treated, "treatment must spend the real medicine store");
    assert.equal(state.health.herbalDoses, 4 + treated.treated, "the dose ledger must grow by the doses given");
    state.health.medicineStock = 0;
    state.health.herbalDoses = 0;
    assert.equal(treatHazardCasualties().ok, false);
});

test("1.2.20 treatment can draw on gathered medicinal goods", () => {
    prepareRealm({ climate: "tropical", season: 2 });
    state.entities[0].illnessUntilTick = state.tick + 100;
    state.health.medicineStock = 0;
    state.forestGathering = { stock: { herbs: 1, lichen: 1 } };
    const beforeDoses = state.health.herbalDoses;
    const treated = treatHazardCasualties();
    assert.equal(treated.ok, true);
    assert.equal(state.health.medicineStock, 0);
    assert.equal(state.health.herbalDoses, beforeDoses + treated.treated);
    assert.equal((state.forestGathering.stock.herbs || 0) + (state.forestGathering.stock.lichen || 0), 2 - treated.treated,
        "gathered remedies must be spent after the brewed store is empty");
});

test("1.2.20 state normalises hostile input and survives a save round trip", () => {
    prepareRealm({ climate: "swamp", season: 2 });
    updateEnvironmentalHazards({ force: true });
    updateEnvironmentalHazardYear();
    const saved = JSON.parse(JSON.stringify(serializeEnvironmentalHazardState()));
    const restored = restoreEnvironmentalHazardState(saved);
    assert.equal(JSON.stringify(serializeEnvironmentalHazardState()), JSON.stringify(saved));
    assert.ok(restored.version >= 1);

    const hostile = normalizeEnvironmentalHazardState({
        year: -4, season: 99, active: [{ mechanic: "not-a-hazard" }, null], history: "nope",
        modifiers: { work: 9 }, chain: [1, 2, 3], magic: { corruption: 4 }
    });
    assert.equal(hostile.year, 0);
    assert.equal(hostile.season, -1);
    assert.equal(hostile.active.length, 0);
    assert.equal(hostile.modifiers.work, 1);
    assert.equal(hostile.magic.corruption, 1);
    assert.ok(validateEnvironmentalHazardState(hostile).ok);
});

test("1.2.20 migration 12 to 13 gives old realms a quiet hazard state", () => {
    assert.equal(SAVE_SCHEMA_VERSION, 13);
    const snapshot = { saveSchemaVersion: 12, kingdomName: "Eldria" };
    migrateSaveSnapshot(snapshot);
    assert.equal(snapshot.saveSchemaVersion, 13);
    assert.equal(snapshot.environmentalHazards, null);
    const restored = restoreEnvironmentalHazardState(snapshot.environmentalHazards);
    assert.equal(restored.active.length, 0);
});

test("1.2.20 snapshot exposes every surface the panel draws", () => {
    prepareRealm({ climate: "coastal", season: 2 });
    updateEnvironmentalHazards({ force: true });
    const snapshot = getHazardSnapshot();
    assert.equal(snapshot.available, true);
    assert.equal(snapshot.catalog.total, 102);
    assert.equal(snapshot.catalog.mechanics, HAZARD_MECHANICS.length);
    assert.ok(snapshot.profile.hazards.length > 0);
    assert.ok(snapshot.mitigation && snapshot.chronic && snapshot.magic && snapshot.losses);
    for (const hazard of snapshot.active) {
        assert.ok(hazard.label && hazard.spec.startsWith("1.2.20."));
        assert.ok(hazard.severity >= 0 && hazard.severity <= 1);
    }
});

test("1.2.20 exposure fouls the water but never declares a plague by itself", () => {
    for (let seed = 1; seed <= 30; seed++) {
        resetState();
        prepareRealm({ climate: "arid", season: 1 });
        state.worldSeed = seed;
        state.health.sanitation.score = 47;
        updateEnvironmentalHazards({ force: true });
        assert.ok(state.health.sanitation.score >= HAZARD_LIMITS.sanitationFloor,
            "seed " + seed + " pushed sanitation below the hazard floor");
        assert.equal(state.health.outbreakActive, false,
            "seed " + seed + " must not let a hazard declare an outbreak on its own");
    }
});

test("1.2.20 a rolled hazard leaves operative modifiers behind", () => {
    let found = false;
    for (let seed = 1; seed <= 40 && !found; seed++) {
        prepareRealm({ climate: "arid", season: 1 });
        state.worldSeed = seed;
        updateEnvironmentalHazards({ force: true });
        const pressure = state.environmentalHazards.active.filter(hazard => hazard.category !== "regional");
        if (!pressure.length) continue;
        found = true;
        const modifiers = getHazardModifiers();
        assert.ok(Object.values(modifiers).some(value => value > 0),
            "the season must write a non-neutral modifier block");
        assert.ok(getHazardWorkFactor() < 1,
            "the written block must reach the production multiplier");
    }
    assert.ok(found, "the fixture must produce at least one rolled hazard");
});

test("1.2.20 the crown and noble households are never hazard casualties", () => {
    for (let seed = 1; seed <= 30; seed++) {
        resetState();
        prepareRealm({ climate: "volcanic", season: 4, residents: 2 });
        state.worldSeed = seed;
        state.nobility = { houses: [{ id: "house-1", members: ["villager-0"] }] };
        state.royal = { kingId: "villager-1" };
        updateEnvironmentalHazards({ force: true });
        for (const entity of state.entities) {
            assert.ok(!(Number(entity.illnessUntilTick) > state.tick),
                "seed " + seed + " wounded a shielded resident: " + entity.id);
        }
    }
});
