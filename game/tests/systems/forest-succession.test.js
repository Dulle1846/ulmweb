import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import {
    coniferDisturbanceKind, coniferDisturbanceWeights, spreadRiskFactor,
    ensureForestSuccession, forestFireMayEnter, forestFirebreakAt,
    forestSuccessionAt, forestSuccessionChronicle, forestSuccessionStats,
    forestDisturbanceKindFor, resetForestSuccession,
    restoreForestSuccession, serializeForestSuccession, suppressForestDisturbance,
    suppressNearestForestDisturbance, updateForestSuccession,
    validateForestSuccessionSnapshot, buildNearestForestFirebreak,
    controlledBurnNearestForestTile, reforestNearestForestTile,
    toggleNearestWetlandDrainage, forestStewardshipAt,
} from "../../js/systems/forest-succession.js";
import { forestBiodiversityFor, forestFloodPressureFor } from "../../js/world/forest-model.js";
import {
    forestStandAt, forestSuccessionStage, FOREST_SUCCESSION_PROFILES,
} from "../../js/world/forest-ecology.js";
import { generateResourceGeography, getResourceNodeAt } from "../../js/systems/resource-geography.js";
import { REGIONAL_FOREST_TYPES } from "../../js/world/regional-forests.js";

function setup(seed = 20261108) {
    resetState();
    resetForestSuccession();
    state.worldSeed = seed;
    state.worldW = 64;
    state.worldH = 64;
    state.terrainResolution = 2;
    state.terrainPixW = 128;
    state.terrainPixH = 128;
    state.worldOptions = { landmass: 50, ruggedness: 55, forests: 70, water: 48, climate: "temperate" };
    state.heightMap = new Float32Array(128 * 128).fill(0.62);
    state.moistureMap = new Float32Array(128 * 128).fill(0.68);
    state.temperatureMap = new Float32Array(128 * 128).fill(0.55);
    generateResourceGeography(seed);
    return ensureForestSuccession();
}

function setupWet(seed = 20261109) {
    resetState();
    resetForestSuccession();
    state.worldSeed = seed;
    state.worldW = 48;
    state.worldH = 48;
    state.terrainResolution = 2;
    state.terrainPixW = 96;
    state.terrainPixH = 96;
    state.worldOptions = { landmass: 60, ruggedness: 30, forests: 82, water: 72, climate: "swamp" };
    state.heightMap = new Float32Array(96 * 96).fill(0.42);
    state.moistureMap = new Float32Array(96 * 96).fill(0.9);
    state.temperatureMap = new Float32Array(96 * 96).fill(0.62);
    state.weather = "rain";
    state.seasonIndex = 0;
    generateResourceGeography(seed);
    return ensureForestSuccession();
}

function firstRecord(model) {
    const [key, record] = Object.entries(model?.tiles || {})[0] || [];
    assert.ok(key && record, "the test realm must contain at least one disturbance");
    return { key, record };
}

function standContext(overrides = {}) {
    return {
        seed: 20261108, moisture: 0.68, temperature: 0.55, height: 0.62,
        climate: "temperate", forests: 70, stockRatio: 1, rockLine: 0.92,
        ...overrides,
    };
}

test("conifer disturbance selection follows fire, pest, monoculture and snow pressure", () => {
    const base = {
        coniferShare: 0.7, fireRisk: 0.18, pestRisk: 0.16,
        monoculture: 0, snowPotential: 0.25,
    };
    const summer = coniferDisturbanceWeights(base, 1);
    const winter = coniferDisturbanceWeights(base, 3);
    const dry = coniferDisturbanceWeights({ ...base, fireRisk: 0.92 }, 1);
    const infested = coniferDisturbanceWeights({ ...base, pestRisk: 0.9 }, 1);
    const pure = coniferDisturbanceWeights({ ...base, monoculture: 1 }, 1);

    assert.ok(dry.burned > summer.burned, "fire risk must raise the burned weight");
    assert.ok(infested["bark-beetle"] > summer["bark-beetle"], "pest risk must raise the bark-beetle weight");
    assert.ok(pure["bark-beetle"] > summer["bark-beetle"], "monoculture must raise the bark-beetle weight");
    assert.ok(winter.snowbreak > summer.snowbreak, "snow potential must matter most in winter");
    assert.ok(winter.burned < summer.burned, "winter must damp the fire path");
    const exposed = coniferDisturbanceWeights({ ...base, windExposure: 0.9 }, 1, "storm");
    const calm = coniferDisturbanceWeights({ ...base, windExposure: 0.1 }, 1, "clear");
    assert.ok(exposed.windthrow > calm.windthrow, "storms and exposure must raise windthrow");
    assert.ok(coniferDisturbanceWeights({ ...base, windExposure: 0.9 }, 1, "rain").burned
        < coniferDisturbanceWeights({ ...base, windExposure: 0.9 }, 1, "clear").burned,
    "wet weather must damp the fire path");
    for (const weight of Object.values(summer)) assert.ok(Number.isFinite(weight) && weight > 0);

    assert.equal(coniferDisturbanceKind({ ...base, fireRisk: 0.92 }, 1, 0), "burned");
    assert.equal(coniferDisturbanceKind({ ...base, pestRisk: 0.9 }, 1, 0.6), "bark-beetle");
    assert.equal(coniferDisturbanceKind({
        ...base, fireRisk: 0, pestRisk: 0, monoculture: 0, snowPotential: 1,
    }, 3, 0.5), "snowbreak");
});

test("a wet floodplain can start a real flood event and the flood profile advances", () => {
    const floodplain = REGIONAL_FOREST_TYPES.find(type => type.key === "ash-elm-floodplain")
        || REGIONAL_FOREST_TYPES.find(type => /floodplain|alluvial|carr/.test(type.key));
    assert.ok(floodplain, "the regional catalogue must contain a wet floodplain type");
    const wet = {
        regionalType: floodplain, regionalTypeId: floodplain.id,
        regionalEffects: { ...(floodplain.effects || {}), flood: 0.9 },
        moisture: 0.86, wetness: 0.9, height: 0.34, ground: { pools: 0.4 },
        fireRisk: 0.05, pestRisk: 0.05, snowPotential: 0.05, windExposure: 0.05,
    };
    assert.equal(forestDisturbanceKindFor(wet, { season: 0, weather: "rain", roll: 0 }), "flooded");
    assert.equal(forestDisturbanceKindFor(wet, { season: 0, weather: "rain", roll: 0.5 }), "flooded");
    assert.notEqual(forestDisturbanceKindFor({ ...wet, wetness: 0.1, moisture: 0.15, regionalEffects: { flood: 0 } }, {
        season: 2, weather: "clear", roll: 0,
    }), "flooded");
    assert.equal(forestSuccessionStage("flooded", 0).formation, "flooded");
    const model = setup();
    const stats = forestSuccessionStats();
    assert.equal(stats.available, true);
    assert.ok(stats.active >= 0);
    assert.ok(Object.keys(model.tiles).length >= stats.active);
});

test("a wet realm eventually starts a flood event on a real flooded tile", () => {
    const model = setupWet();
    for (let index = 0; index < 40; index++) updateForestSuccession(30);
    const floods = Object.entries(model.tiles).filter(([, record]) => record.kind === "flooded");
    assert.ok(floods.length > 0, "the wet realm must produce at least one flood event");
    const [key, record] = floods[0];
    const [x, y] = key.split(":").map(Number);
    const live = forestSuccessionAt(x, y);
    assert.ok(live);
    assert.match(live.label, /Flood/);
    assert.ok(record.age >= 0);
    assert.ok(forestSuccessionStats().byKind.flooded >= 1);
});

test("disturbance spread follows the receiving stand's pressure", () => {
    const quiet = { fireRisk: 0.1, pestRisk: 0.1, monoculture: 0, snowPotential: 0.15 };
    const dry = { fireRisk: 0.9, pestRisk: 0.1, monoculture: 0, snowPotential: 0.15 };
    const infested = { fireRisk: 0.1, pestRisk: 0.9, monoculture: 0.9, snowPotential: 0.15 };
    const snowy = { fireRisk: 0.1, pestRisk: 0.1, monoculture: 0, snowPotential: 0.9 };
    assert.ok(spreadRiskFactor("burned", dry) > spreadRiskFactor("burned", quiet));
    assert.ok(spreadRiskFactor("bark-beetle", infested) > spreadRiskFactor("bark-beetle", quiet));
    assert.ok(spreadRiskFactor("snowbreak", snowy) > spreadRiskFactor("snowbreak", quiet));
    assert.equal(spreadRiskFactor("windthrow", quiet), 1);
    assert.ok(spreadRiskFactor("windthrow", { conifer: true, windExposure: 0.9 })
        > spreadRiskFactor("windthrow", { conifer: true, windExposure: 0.1 }));
});

test("stage thresholds preserve fresh, regrowth, young and recovered states", () => {
    assert.equal(forestSuccessionStage("burned", 0).id, "fresh");
    assert.equal(forestSuccessionStage("burned", 80).id, "regrowth");
    assert.equal(forestSuccessionStage("burned", 180).id, "young");
    assert.equal(forestSuccessionStage("burned", 360).id, "recovering");
    assert.equal(forestSuccessionStage("burned", 520).id, "recovered");
    assert.equal(forestSuccessionStage("windthrow", 60).id, "regrowth");
    assert.equal(forestSuccessionStage("diseased", 100).id, "regrowth");
    assert.equal(forestSuccessionStage("unknown", 2), null);
    assert.ok(FOREST_SUCCESSION_PROFILES.burned.recoveredDays > FOREST_SUCCESSION_PROFILES.burned.youngDays);
});

test("a seeded world exposes initial disturbances and a live succession lookup", () => {
    const model = setup();
    assert.ok(model);
    const { key, record } = firstRecord(model);
    assert.equal(record.age, 0);
    const [x, y] = key.split(":").map(Number);
    const lookup = forestSuccessionAt(x, y);
    assert.ok(lookup);
    assert.equal(lookup.stage, "fresh");
    assert.match(lookup.label, /Burn|Wind|Disease|Bark|Beetle|Snow|Drought/);
    const node = getResourceNodeAt(x, y);
    assert.equal(node.forestSuccession.kind, record.kind);
    assert.equal(node.forestDisturbance, record.kind);
    assert.equal(node.forestSuccessionStage, "fresh");
});

test("stand generation overrides the seeded formation and returns to the original wood", () => {
    const fresh = forestStandAt(23.5, 17.5, standContext({
        succession: { kind: "burned", age: 10 },
    }));
    assert.equal(fresh.forest, true);
    assert.equal(fresh.disturbance, "burned");
    assert.equal(fresh.succession.stage, "fresh");
    assert.match(fresh.label, /Burn/);

    const regrowth = forestStandAt(23.5, 17.5, standContext({
        succession: { kind: "burned", age: 120 },
    }));
    assert.equal(regrowth.type, "regenerating");
    assert.equal(regrowth.disturbance, "burned");
    assert.equal(regrowth.succession.stage, "regrowth");
    assert.equal(regrowth.ageClass, "young");

    const recovered = forestStandAt(23.5, 17.5, standContext({
        succession: { kind: "burned", age: 520 },
    }));
    assert.equal(recovered.succession.stage, "recovered");
    assert.equal(recovered.succession.label, null);
    assert.equal(recovered.disturbance, null);
    assert.ok(!["burned", "windthrow", "diseased", "regenerating", "cutover"].includes(recovered.type));
});

test("elapsed days advance one disturbance into regrowth and a durable recovery", () => {
    const model = setup();
    const { key, record } = firstRecord(model);
    const profile = FOREST_SUCCESSION_PROFILES[record.kind];
    for (let i = 0; i < 10 && state.forestSuccession.tiles[key]?.age < profile.freshDays + 1; i++) {
        updateForestSuccession(30);
    }
    const advanced = forestSuccessionAt(...key.split(":").map(Number));
    assert.ok(advanced);
    assert.equal(advanced.stage, "regrowth");
    for (let i = 0; i < 30 && state.forestSuccession.tiles[key]?.age < profile.recoveredDays; i++) {
        updateForestSuccession(30);
    }
    const recovered = forestSuccessionAt(...key.split(":").map(Number));
    assert.ok(recovered);
    assert.equal(recovered.stage, "recovered");
    assert.equal(recovered.recovered, true);
    assert.equal(recovered.label, null);
    assert.equal(state.forestSuccession.tiles[key].age, profile.recoveredDays);
    assert.equal(state.forestSuccession.activeKeys.includes(key), false,
        "a recovered record must leave the daily work list");
    const [x, y] = key.split(":").map(Number);
    const node = getResourceNodeAt(x, y);
    assert.equal(node.forestSuccessionStage, "recovered");
    assert.equal(node.forestDisturbance, null);
});

test("a new event lowers real stock and is recorded in bounded history", () => {
    const model = setup();
    for (let i = 0; i < 6 && !model.history.length; i++) updateForestSuccession(30);
    assert.equal(model.history.length, 1);
    const event = model.history[0];
    assert.ok(event.stockAfter < event.stockBefore);
    assert.equal(state.resourceGeography.forestStock[event.y * state.worldW + event.x], event.stockAfter);
    assert.ok(model.events >= 1);
});

test("fire, storm and disease spread to neighbouring stands and stay bounded", () => {
    const model = setup();
    for (let i = 0; i < 50; i++) updateForestSuccession(12);
    assert.ok(model.spreadings > 0, "a long campaign should spread at least one disturbance");
    assert.ok(model.spreadHistory.length > 0);
    assert.ok(model.spreadHistory.length <= 24);
    for (const entry of model.spreadHistory) {
        assert.ok(["burned", "windthrow", "diseased", "bark-beetle", "snowbreak", "drought-stressed", "flooded"].includes(entry.kind));
        assert.notEqual(entry.to.join(":"), entry.from.join(":"));
        assert.ok(entry.stockAfter < entry.stockBefore);
        assert.equal(Math.max(Math.abs(entry.to[0] - entry.from[0]), Math.abs(entry.to[1] - entry.from[1])), 1);
    }
});

test("a control party contains a disturbance and costs real resources", () => {
    const model = setup();
    state.resources.wood = 100;
    state.resources.food = 100;
    state.resources.gold = 100;
    const key = Object.keys(model.tiles).find(key => {
        const [x, y] = key.split(":").map(Number);
        return forestSuccessionAt(x, y)?.stage === "fresh";
    });
    assert.ok(key);
    const [x, y] = key.split(":").map(Number);
    const record = model.tiles[key];
    const costs = record.kind === "burned" ? { food: 6, wood: 4 }
        : record.kind === "windthrow" ? { wood: 8 } : { gold: 6 };
    const result = suppressForestDisturbance(x, y);
    assert.equal(result.ok, true);
    assert.equal(result.containedUntil, model.day + 90);
    assert.deepEqual(result.cost, costs);
    assert.equal(forestSuccessionAt(x, y).contained, true);
    for (const [resource, amount] of Object.entries(costs)) {
        assert.equal(state.resources[resource], 100 - amount);
    }
    assert.equal(model.suppressed, 1);
    for (let i = 0; i < 3; i++) updateForestSuccession(30);
    assert.equal(forestSuccessionAt(x, y)?.contained, false);
});

test("control fails without resources and can find the nearest disturbance", () => {
    const model = setup();
    state.resources.wood = 0;
    state.resources.food = 0;
    state.resources.gold = 0;
    const [x, y] = Object.keys(model.tiles)[0].split(":").map(Number);
    const denied = suppressForestDisturbance(x, y);
    assert.equal(denied.ok, false);
    assert.match(denied.reason, /Not enough/);
    assert.equal(suppressNearestForestDisturbance(-50, -50, 4).ok, false);
    state.resources.wood = 100;
    state.resources.food = 100;
    state.resources.gold = 100;
    const nearest = suppressNearestForestDisturbance(x, y, 8);
    assert.equal(nearest.ok, true);
    assert.ok(Math.abs(nearest.x - x) + Math.abs(nearest.y - y) <= 8);
});

test("spread and control state survives a save and an older snapshot", () => {
    const model = setup();
    for (let i = 0; i < 12; i++) updateForestSuccession(30);
    state.resources.wood = 100;
    state.resources.food = 100;
    state.resources.gold = 100;
    const key = Object.keys(model.tiles).find(key => {
        const [x, y] = key.split(":").map(Number);
        const entry = forestSuccessionAt(x, y);
        return entry && !entry.recovered;
    });
    assert.ok(key);
    assert.equal(suppressForestDisturbance(...key.split(":").map(Number)).ok, true);
    const snapshot = serializeForestSuccession();
    assert.ok(snapshot.spreadHistory.length > 0);
    assert.ok(snapshot.tiles[key].containedUntil > 0);
    resetForestSuccession();
    restoreForestSuccession(snapshot);
    assert.equal(state.forestSuccession.spreadings, snapshot.spreadings);
    assert.equal(state.forestSuccession.spreadHistory.length, snapshot.spreadHistory.length);
    assert.equal(state.forestSuccession.tiles[key].containedUntil, snapshot.tiles[key].containedUntil);
    assert.ok(state.forestSuccession.activeKeys.includes(key),
        "restore must rebuild the active work list");

    const legacy = {
        version: 1, seed: 7, day: 0, events: 0, lastEventDay: 0, daysSinceEvent: 0,
        tiles: { "4:4": { kind: "burned", age: 0 } }, history: [],
    };
    resetForestSuccession();
    assert.equal(restoreForestSuccession(legacy), 1);
    updateForestSuccession(12);
    assert.ok(Array.isArray(state.forestSuccession.spreadHistory));
});

test("regime severity and refugia change disturbance spread", () => {
    const base = {
        coniferShare: 0.7, fireRisk: 0.5, pestRisk: 0.3,
        monoculture: 0.2, snowPotential: 0.2, windExposure: 0.6,
    };
    const severe = coniferDisturbanceWeights({
        ...base, dynamics: { hazard: { regime: { severity: 1, refugia: 0 } } },
    }, 1);
    const calm = coniferDisturbanceWeights({
        ...base, dynamics: { hazard: { regime: { severity: 0, refugia: 0 } } },
    }, 1);
    assert.ok(severe.burned > calm.burned, "a severe fire regime must raise the burn path");
    assert.ok(severe.windthrow > calm.windthrow, "a severe regime must raise the wind path");
    const dry = { fireRisk: 0.9, pestRisk: 0.1, monoculture: 0, snowPotential: 0.1 };
    const sheltered = {
        ...dry, dynamics: { hazard: { regime: { refugia: 1 } } },
    };
    assert.ok(spreadRiskFactor("burned", sheltered) < spreadRiskFactor("burned", dry),
        "a real refugium must resist a crossing fire");
});

test("player forestry orders act on the real stand, stores and region chronicle", () => {
    const model = setupWet(20261121);
    state.resources = { wood: 500, stone: 500, gold: 500, food: 500 };
    const geo = state.resourceGeography;
    let centre = null;
    for (let y = 3; y < 45 && !centre; y++) {
        for (let x = 3; x < 45; x++) {
            const node = getResourceNodeAt(x, y);
            if (!node?.forestCapacity || node.forestStock < node.forestCapacity * 0.8) continue;
            centre = { x, y, node };
            break;
        }
    }
    assert.ok(centre, "the wetland fixture needs a stocked forest tile");
    const ci = centre.y * state.worldW + centre.x;
    geo.forestStock[ci] = Math.max(1, Math.floor(geo.forestCapacity[ci] * 0.12));
    const beforePlanting = geo.forestStock[ci];
    const goldBefore = state.resources.gold, foodBefore = state.resources.food;
    const planted = reforestNearestForestTile(centre.x, centre.y, 6);
    assert.equal(planted.ok, true, planted.reason);
    assert.equal(planted.action, "reforest");
    assert.ok(planted.tiles >= 1);
    assert.ok(geo.forestStock[ci] > beforePlanting, "reforestation must add real stand stock");
    assert.equal(state.resources.gold, goldBefore - 8);
    assert.equal(state.resources.food, foodBefore - 5);
    assert.ok(forestSuccessionStats().planted >= planted.planted);

    const breakResult = buildNearestForestFirebreak(centre.x, centre.y, 6);
    assert.equal(breakResult.ok, true, breakResult.reason);
    assert.equal(breakResult.action, "firebreak");
    assert.ok(forestFirebreakAt(breakResult.x, breakResult.y) > model.day,
        "the firebreak must be saved as a real protected strip");
    assert.equal(forestFireMayEnter(breakResult.x, breakResult.y), false,
        "the same gate used by ignition and spread must reject the protected tile");

    let burnTarget = null;
    for (let y = 2; y < 46 && !burnTarget; y++) {
        for (let x = 2; x < 46; x++) {
            if (forestFirebreakAt(x, y)) continue;
            const node = getResourceNodeAt(x, y);
            if (!node?.forestCapacity || node.forestStock < node.forestCapacity * 0.55) continue;
            if (node.forestAge === "young") continue;
            if (forestSuccessionAt(x, y)?.recovered === false) continue;
            burnTarget = { x, y, stock: node.forestStock };
            break;
        }
    }
    assert.ok(burnTarget, "the fixture needs a mature unbroken stand for a controlled burn");
    state.resources.wood = 500;
    const woodBefore = state.resources.wood;
    const burned = controlledBurnNearestForestTile(burnTarget.x, burnTarget.y, 6);
    assert.equal(burned.ok, true, burned.reason);
    assert.equal(burned.action, "burn");
    assert.ok(burned.stockAfter < burned.stockBefore, "a controlled burn must consume real stock");
    assert.ok(state.resources.wood > woodBefore, "salvage from the burn must reach the stores");
    const burnedKey = burned.x + ":" + burned.y;
    assert.equal(model.tiles[burnedKey].kind, "burned");
    assert.equal(forestSuccessionAt(burned.x, burned.y).stage, "fresh");

    let wet = null;
    for (let y = 2; y < 46 && !wet; y++) {
        for (let x = 2; x < 46; x++) {
            const node = getResourceNodeAt(x, y);
            if (node?.forestCapacity && node.forestWetness >= 0.52) {
                wet = { x, y, node };
                break;
            }
        }
    }
    assert.ok(wet, "the wetland fixture needs a wet stand");
    const beforeFlood = forestFloodPressureFor(wet.node.forestStand, { season: 0, weather: "rain" });
    const beforeBio = forestBiodiversityFor(wet.node.forestStand);
    const drained = toggleNearestWetlandDrainage(wet.x, wet.y, 6);
    assert.equal(drained.ok, true, drained.reason);
    assert.equal(drained.action, "drain");
    const drainedNode = getResourceNodeAt(drained.x, drained.y);
    assert.equal(drainedNode.forestDrained, true);
    assert.equal(drainedNode.forestStand.drainage, 1);
    assert.ok(drainedNode.forestWetness < wet.node.forestWetness, "drainage must lower the water table");
    const afterFlood = forestFloodPressureFor(drainedNode.forestStand, { season: 0, weather: "rain" });
    const afterBio = forestBiodiversityFor(drainedNode.forestStand);
    assert.ok(afterFlood.pressure < beforeFlood.pressure, "drainage must lower real flood pressure");
    assert.ok(afterBio.index < beforeBio.index, "drainage must lower habitat biodiversity");
    assert.equal(forestStewardshipAt(drained.x, drained.y).drained, true);

    const restored = toggleNearestWetlandDrainage(drained.x, drained.y, 1);
    assert.equal(restored.ok, true, restored.reason);
    assert.equal(restored.action, "restore");
    assert.equal(getResourceNodeAt(drained.x, drained.y).forestDrained, false);
    assert.equal(toggleNearestWetlandDrainage(drained.x, drained.y, 1).action, "drain",
        "the wetland decision must be reversible again");

    const stats = forestSuccessionStats();
    assert.ok(stats.firebreaks >= breakResult.tiles);
    assert.equal(stats.drained, 1);
    assert.ok(stats.stewardshipActions >= 6);
    assert.ok(stats.regions[breakResult.typeId]?.area >= 1);
    const chronicle = forestSuccessionChronicle();
    for (const kind of ["reforest", "firebreak", "burn", "drain", "restore"]) {
        assert.ok(chronicle.entries.some(entry => entry.kind === kind), "the chronicle must show " + kind);
    }
    assert.ok(chronicle.byRegion[breakResult.typeId].length > 0);
});

test("stewardship decisions survive version 2 saves and version 1 snapshots still load", () => {
    const model = setupWet(20261122);
    state.resources = { wood: 500, stone: 500, gold: 500, food: 500 };
    const breakResult = buildNearestForestFirebreak(20, 20, 8);
    assert.equal(breakResult.ok, true, breakResult.reason);
    const drainResult = toggleNearestWetlandDrainage(20, 20, 8);
    assert.equal(drainResult.ok, true, drainResult.reason);
    const snapshot = serializeForestSuccession();
    assert.equal(snapshot.version, 2);
    assert.ok(Object.keys(snapshot.breaks).length >= 1);
    assert.ok(Object.keys(snapshot.drainage).length >= 1);
    assert.ok(snapshot.stewardshipHistory.length >= 2);
    assert.equal(validateForestSuccessionSnapshot(snapshot), true);
    resetForestSuccession();
    assert.ok(restoreForestSuccession(snapshot) >= 1);
    assert.ok(forestFirebreakAt(breakResult.x, breakResult.y) > 0);
    assert.equal(forestStewardshipAt(drainResult.x, drainResult.y).drained, true);
    assert.equal(state.forestSuccession.stewardshipHistory.length, snapshot.stewardshipHistory.length);
    assert.equal(state.forestSuccession.planted, snapshot.planted);

    const legacy = {
        version: 1, seed: 7, day: 0, events: 0, lastEventDay: 0, daysSinceEvent: 0,
        tiles: { "4:4": { kind: "burned", age: 0 } }, history: [],
    };
    resetForestSuccession();
    assert.equal(restoreForestSuccession(legacy), 1);
    assert.equal(state.forestSuccession.version, 2);
    assert.deepEqual(state.forestSuccession.breaks, {});
    assert.deepEqual(state.forestSuccession.drainage, {});
    assert.equal(forestSuccessionStats().active, 1, "a version 1 snapshot must keep its forest disturbance");
});

test("succession saves validate and restore without inventing tiles", () => {
    const model = setup();
    const snapshot = serializeForestSuccession();
    assert.ok(snapshot);
    assert.equal(validateForestSuccessionSnapshot(snapshot), true);
    const count = Object.keys(snapshot.tiles).length;
    resetForestSuccession();
    assert.equal(restoreForestSuccession(snapshot), count);
    assert.equal(Object.keys(state.forestSuccession.tiles).length, count);
    assert.throws(() => validateForestSuccessionSnapshot({ version: 1, seed: 1, tiles: { "1:1": { kind: "unknown", age: 0 } } }), /tile/);
    assert.throws(() => validateForestSuccessionSnapshot({ version: 1, seed: 1, tiles: [], history: [] }), /tile map/);
});
