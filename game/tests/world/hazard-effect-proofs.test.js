// 1.2.20 — executable, falsifiable effect proofs.
//
// Every catalogue row is run through the real simulator path and must produce a
// measurable state delta. The negative-control run neutralizes exactly one row
// at a time through the production seam; the same proof must then collapse to
// zero. A proof that still moves after its row is neutralized is not evidence
// for that row. The numbers are printed by the tests so a release report can
// quote how many points were checked and how many failed under neutralization.
import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import {
    HAZARD_CATALOG, HAZARD_EFFECTS, REGIONAL_BUNDLES
} from "../../js/world/hazard-data.js";
import { HAZARD_EVIDENCE } from "../../js/world/hazard-evidence.js";
import {
    applyHazardForProof, applyMagicForProof, createEnvironmentalHazardState,
    getHazardExposureRelief, getHazardMitigation, getHazardProfile,
    setHazardProofRoll, updateEnvironmentalHazardYear
} from "../../js/systems/environmental-hazards.js";
import {
    getHazardSimulationEffects, invalidateHazardModifierCache
} from "../../js/systems/hazard-modifiers.js";
import { getHazardScarSnapshot } from "../../js/systems/hazard-scars.js";
import {
    clearHazardProofNeutralized, isHazardProofNeutralized,
    setHazardProofNeutralized
} from "../../js/systems/hazard-proof.js";
import {
    damageHazardHerds, ensureForestFauna, resetForestFauna
} from "../../js/systems/forest-fauna.js";
import { generateResourceGeography } from "../../js/systems/resource-geography.js";

const SEED = 20261122;
const PROOFS = [];
const primitiveFields = new Set(["outbreak", "illness", "injury", "food", "wood", "water",
    "work", "morale", "field", "pasture", "trade", "herd", "ash", "destroy", "permanent", "odd"]);

function fixture({ climate = "temperate", season = 1, herds = true } = {}) {
    resetState();
    resetForestFauna();
    state.worldSeed = SEED;
    state.worldW = 48;
    state.worldH = 48;
    state.terrainResolution = 2;
    state.terrainPixW = 96;
    state.terrainPixH = 96;
    state.worldOptions = { size: "standard", shape: "continent", climate, landmass: 55, ruggedness: 50, forests: 70, water: 45 };
    state.heightMap = new Float32Array(96 * 96).fill(0.66);
    state.moistureMap = new Float32Array(96 * 96).fill(0.7);
    state.temperatureMap = new Float32Array(96 * 96).fill(0.58);
    state.resources = { wood: 1200, stone: 1000, gold: 1500, food: 900 };
    state.incomeThisTick = { wood: 0, stone: 0, gold: 0, food: 0 };
    state.roads = { version: 1, revision: 0, tiles: {} };
    state.entities = [];
    state.year = 5;
    state.seasonIndex = season;
    state.dayOfYear = season * 100 + 20;
    state.tick = 900;
    state.weather = "clear";
    state.morale = 80;
    state.hasStarted = true;
    state.gameOver = false;
    state.eventLog = [];
    state.research = { completed: [] };
    state.diplomacy = { relations: { Arden: { relation: 40 }, Kestrel: { relation: 25 }, Vale: { relation: 10 } } };
    state.health = {
        outbreakActive: false, disease: "none", severity: 0, containment: 0,
        cases: 0, recovered: 0, outbreaks: 0, herbalDoses: 8, herbalTreated: 0,
        lastUpdateTick: 0, startedAtTick: 0, healers: [], medicine: 0,
        sanitation: { score: 0 }
    };
    state.environmentalHazards = createEnvironmentalHazardState();
    for (let index = 0; index < 90; index++) {
        state.entities.push({
            id: "resident-" + index, type: TYPE.VILLAGER, x: 6 + index % 30, y: 8 + Math.floor(index / 30),
            hp: 35, maxHp: 35, dead: false, person: { name: "Resident " + index },
            isBuilding() { return false; }
        });
    }
    for (let index = 0; index < 30; index++) {
        state.entities.push({
            id: "farm-" + index, type: TYPE.FARM, x: 8 + (index % 10) * 3, y: 20 + Math.floor(index / 10) * 3,
            hp: 90, maxHp: 90, dead: false, isBuilding() { return true; },
            field: { stage: "growing", growth: 80, fertility: 60, maxFertility: 60, resting: false, lastReason: "Growing" }
        });
    }
    for (let index = 0; index < 30; index++) {
        state.entities.push({
            id: "house-" + index, type: TYPE.HOUSE, x: 8 + (index % 10) * 3, y: 32 + Math.floor(index / 10) * 3,
            hp: 100, maxHp: 100, dead: false, isBuilding() { return true; }
        });
    }
    for (let index = 0; index < 40; index++) {
        state.roads.tiles[index + ":2"] = { type: "dirt", builtAtTick: 0, condition: 100 };
    }
    generateResourceGeography(SEED);
    if (herds) ensureForestFauna();
    invalidateHazardModifierCache();
    return state.environmentalHazards;
}

function sumMap(values) {
    return Object.values(values || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
}

function measure() {
    const entry = state.environmentalHazards;
    const farms = state.entities.filter(entity => entity.type === TYPE.FARM && !entity.dead);
    const herds = state.forestFauna?.herds || [];
    const villagers = state.entities.filter(entity => entity.type === TYPE.VILLAGER && !entity.dead);
    const diseases = entry.diseases.reduce((sum, disease) => sum + (Number(disease.cases) || 0) + (disease.active ? 1 : 0), 0);
    return {
        resources: sumMap(state.resources),
        morale: state.morale,
        sanitation: Number(state.health?.sanitation?.score) || 0,
        outbreak: state.health?.outbreakActive ? 1 : 0,
        diseases,
        illness: villagers.filter(entity => Number(entity.illnessUntilTick) > state.tick).length,
        hp: villagers.reduce((sum, entity) => sum + (Number(entity.hp) || 0), 0),
        fields: farms.reduce((sum, entity) => sum + (Number(entity.field?.growth) || 0) + (Number(entity.field?.fertility) || 0), 0),
        herds: herds.reduce((sum, herd) => sum + (Number(herd.population) || 0), 0),
        buildings: state.entities.filter(entity => entity.isBuilding?.() && entity.dead).length,
        roads: Object.keys(state.roads?.tiles || {}).length,
        losses: sumMap(entry.losses),
        modifiers: sumMap(entry.modifiers),
        magic: sumMap(entry.magic),
        scars: getHazardScarSnapshot().terrainTiles + getHazardScarSnapshot().counts.corruption,
        chronic: (Number(entry.chronic.droughtYears) || 0) + (Number(entry.chronic.droughtLevel) || 0) * 10
            + (entry.chronic.plagueSpread?.length || 0) + (entry.chronic.epizooticRegions?.length || 0)
            + (entry.chronic.wildfireZones?.length || 0) + (Number(entry.chronic.floodScars) || 0)
            + (Number(entry.chronic.volcanicYears) || 0) + (Number(entry.chronic.climateDrift) || 0) * 0.01
            + (Number(entry.chronic.economicDrag) || 0) * 10,
        history: entry.history?.length || 0
    };
}

function delta(before, after) {
    return Object.keys(before).reduce((sum, key) => sum + Math.abs((Number(after[key]) || 0) - (Number(before[key]) || 0)), 0);
}

function eventBudget() {
    return { casualty: false, outbreak: false, destroyed: false, food: 0, morale: 0, stockpile: false, relief: false };
}

function eventProof(row) {
    return () => {
        const entry = fixture({ climate: row.climates[0] || "temperate" });
        setHazardProofRoll(0);
        const before = measure();
        applyHazardForProof(entry, row, 1, eventBudget());
        const after = measure();
        setHazardProofRoll(null);
        return { delta: delta(before, after), detail: row.mechanic };
    };
}

function bundleProof(row) {
    return () => {
        fixture({ climate: row.climates[0] || "temperate" });
        state.health.sanitation.score = 0;
        const profile = getHazardProfile();
        return { delta: Math.max(0, profile.exposure - 1), detail: "exposure " + profile.exposure };
    };
}

function rawEffectProof(spec, key, setup) {
    return () => {
        const entry = fixture();
        setup(entry);
        invalidateHazardModifierCache();
        const value = Number(getHazardSimulationEffects().raw[key]) || 0;
        return { delta: value, detail: key + "=" + value };
    };
}

function exposureEffectProof(spec, key) {
    return () => {
        const entry = fixture();
        const mitigation = { clothing: 0, medical: 0, well: 0, irrigation: 0, dam: 0, avalanche: 0,
            drainage: 0, roads: 0, warehouse: 0, research: 0, units: 0, siting: 0 };
        // Isolate one protection channel so the proof measures this row, not
        // the other channel that happens to share the same risk formula.
        if (key === "illness") mitigation.clothing = 1;
        if (key === "outbreak") mitigation.medical = 1;
        const relief = getHazardExposureRelief("hazard:cold", mitigation, entry.modifiers);
        return { delta: Math.max(0, 1 - relief[key]), detail: "relief " + relief[key] };
    };
}

function fieldEffectProof(spec, hazardMechanic) {
    return () => {
        const row = HAZARD_CATALOG.find(candidate => candidate.mechanic === hazardMechanic);
        const entry = fixture({ climate: row.climates[0] || "temperate" });
        setHazardProofRoll(0);
        const before = measure();
        applyHazardForProof(entry, row, 1, eventBudget());
        const after = measure();
        setHazardProofRoll(null);
        return { delta: Math.abs(after.fields - before.fields), detail: "fields " + before.fields + "→" + after.fields };
    };
}

function herdEffectProof() {
    const row = HAZARD_CATALOG.find(candidate => candidate.mechanic === "hazard:epizootic");
    return () => {
        const entry = fixture({ climate: "savanna" });
        setHazardProofRoll(0);
        const before = measure();
        applyHazardForProof(entry, row, 1, eventBudget());
        const after = measure();
        setHazardProofRoll(null);
        return { delta: Math.abs(after.herds - before.herds), detail: "herds " + before.herds + "→" + after.herds };
    };
}

function lossEffectProof() {
    const row = HAZARD_CATALOG.find(candidate => candidate.mechanic === "hazard:drought");
    return () => {
        const entry = fixture({ climate: "arid" });
        setHazardProofRoll(0);
        const before = measure();
        applyHazardForProof(entry, row, 1, eventBudget());
        const after = measure();
        setHazardProofRoll(null);
        return { delta: after.losses - before.losses, detail: "losses " + before.losses + "→" + after.losses };
    };
}

const WORK_BUILDING = {
    "work:clothing": [TYPE.BATHHOUSE],
    "work:medical": [TYPE.CLINIC],
    "work:well": [TYPE.WELL],
    "work:irrigation": [TYPE.MILL, TYPE.FARM],
    "work:dam": [TYPE.DAM],
    "work:avalanche": [TYPE.AVALANCHE_BARRIER],
    "work:drainage": [TYPE.DRAINAGE],
    "work:roads": [],
    "work:warehouse": [TYPE.WAREHOUSE],
    "work:research": [TYPE.SCHOOL],
    "work:units": [TYPE.BARRACKS],
    "work:siting": [TYPE.KEEP]
};

function workProof(row, field) {
    return () => {
        const entry = fixture();
        state.entities = state.entities.filter(entity => entity.type === TYPE.VILLAGER || entity.type === TYPE.FARM);
        state.roads.tiles = {};
        if (row.mechanic === "work:roads") {
            for (let index = 0; index < 40; index++) state.roads.tiles[index + ":1"] = { type: "dirt", condition: 100 };
        } else {
            for (const type of WORK_BUILDING[row.mechanic]) {
                state.entities.push({ id: "proof-" + type, type, x: 20, y: 20, hp: 120, maxHp: 120, dead: false, isBuilding() { return true; } });
            }
        }
        invalidateHazardModifierCache();
        const value = getHazardMitigation()[field];
        return { delta: value, detail: field + "=" + value };
    };
}

function eventById(mechanic, climate = "temperate") {
    const row = HAZARD_CATALOG.find(candidate => candidate.mechanic === mechanic);
    return { row, climate: row?.climates[0] || climate };
}

function annualProof(spec, setup, read) {
    return () => {
        const entry = fixture();
        entry.lastYear = 0;
        state.year = 6;
        setHazardProofRoll(0);
        setup(entry, state);
        const before = read(entry, state);
        updateEnvironmentalHazardYear();
        const after = read(entry, state);
        setHazardProofRoll(null);
        return { delta: Math.abs(after - before), detail: spec + " " + before + "→" + after };
    };
}

function magicProof(mechanic, read) {
    return () => {
        const entry = fixture({ climate: "enchanted" });
        const row = HAZARD_CATALOG.find(candidate => candidate.mechanic === mechanic);
        const before = read(entry, state);
        applyMagicForProof(row, 1, entry);
        const after = read(entry, state);
        return { delta: Math.abs(after - before), detail: mechanic + " " + before + "→" + after };
    };
}

function specOf(mechanic) {
    return HAZARD_CATALOG.find(row => row.mechanic === mechanic)?.spec;
}

function register(group, spec, run, mechanic = null) {
    const row = HAZARD_CATALOG.find(candidate => candidate.spec === spec);
    assert.ok(row, "proof spec must exist in the catalogue: " + spec);
    PROOFS.push({ group, spec, mechanic: mechanic || row.mechanic, run });
}

// 42 events: every row's real application must move world state.
for (const row of HAZARD_CATALOG.filter(candidate => candidate.mechanic.startsWith("hazard:"))) {
    assert.ok(Object.keys(HAZARD_EFFECTS[row.mechanic] || {}).every(key => primitiveFields.has(key)));
    register("event", row.spec, eventProof(row));
}

// 9 regional bundles: exposure must be greater than neutral.
for (const row of HAZARD_CATALOG.filter(candidate => candidate.mechanic.startsWith("bundle:"))) {
    assert.ok(REGIONAL_BUNDLES[row.mechanic]);
    register("bundle", row.spec, bundleProof(row));
}

// 19 effects: modifier fields, targeted relief, loss ledger and field/herd primitives.
const RAW_EFFECTS = {
    "effect:disease-risk": "diseaseRisk",
    "effect:resistance": "resistance",
    "effect:needs": "needs",
    "effect:movement": "movement",
    "effect:work": "work",
    "effect:adaptation": "adaptation",
    "effect:morale": "morale",
    "effect:pasture-loss": "pasture",
    "effect:trade-damage": "trade",
    "effect:extraction": "extraction"
};
for (const [spec, key] of Object.entries(RAW_EFFECTS)) {
    register("effect", specOf(spec), rawEffectProof(spec, key, entry => {
        entry.modifiers[key] = 0.8;
        entry.modifiers.adaptation = 0.8;
        entry.modifiers.morale = 0.8;
    }));
}
for (const [spec, key] of [["effect:clothing", "illness"], ["effect:medical", "outbreak"]]) {
    register("effect", specOf(spec), exposureEffectProof(spec, key), spec);
}
register("effect", specOf("effect:losses"), lossEffectProof(), "effect:losses");
register("effect", specOf("effect:herd-plague"), herdEffectProof(), "effect:herd-plague");
for (const [spec, mechanic] of [
    ["effect:crop-failure", "hazard:drought"],
    ["effect:frost-damage", "hazard:frost"],
    ["effect:flood-damage", "hazard:flood"],
    ["effect:crop-disease", "hazard:plant-disease"],
    ["effect:crop-pest", "hazard:pest"]
]) {
    register("effect", specOf(spec), fieldEffectProof(spec, mechanic), spec);
}

// 12 works: each protection field must be non-zero only while the work exists.
for (const row of HAZARD_CATALOG.filter(candidate => candidate.mechanic.startsWith("work:"))) {
    const field = row.mechanic.slice("work:".length);
    register("work", row.spec, workProof(row, field));
}

// 9 chronic processes: annual state must move in the named direction.
register("chronic", "1.2.20.84", () => {
    fixture({ climate: "snow", season: 0 });
    const summer = getHazardProfile().hazards.map(row => row.mechanic).sort().join("|");
    state.seasonIndex = 2;
    const winter = getHazardProfile().hazards.map(row => row.mechanic).sort().join("|");
    return { delta: summer === winter ? 0 : 1, detail: "summer vs winter profile" };
});
register("chronic", "1.2.20.85", annualProof("drought-years", (entry, realm) => {
    entry.chronic.droughtYears = 1;
    entry.active = [{ id: "drought", mechanic: "hazard:drought", label: "Drought", category: "weather", spec: "1.2.20.5", severity: 1, startedYear: realm.year, effects: {} }];
    realm.resources.food = 500;
}, (entry) => entry.chronic.droughtYears));
register("chronic", "1.2.20.86", annualProof("plague-trade", (entry, realm) => {
    realm.health.outbreakActive = true;
    realm.health.disease = "swamp fever";
    entry.chronic.plagueSpread = [];
}, (entry) => entry.chronic.plagueSpread.length));
register("chronic", "1.2.20.87", annualProof("epizootic-regions", (entry) => {
    entry.active = [{ id: "epizootic", mechanic: "hazard:epizootic", label: "Animal plague", category: "flora", spec: "1.2.20.30", severity: 1, startedYear: state.year, effects: {} }];
}, () => (state.forestFauna?.herds || []).reduce((sum, herd) => sum + (Number(herd.population) || 0), 0)));
register("chronic", "1.2.20.88", annualProof("wildfire", (entry, realm) => {
    realm.seasonIndex = 1;
    entry.active = [{ id: "heatwave", mechanic: "hazard:heatwave", label: "Heatwave", category: "weather", spec: "1.2.20.4", severity: 1, startedYear: realm.year, effects: {} }];
}, (entry) => entry.chronic.wildfireZones.length));
register("chronic", "1.2.20.89", annualProof("flood-scars", (entry, realm) => {
    realm.worldW = 48; realm.worldH = 48;
    entry.active = [{ id: "flood", mechanic: "hazard:flood", label: "Flood", category: "weather", spec: "1.2.20.9", severity: 1, startedYear: realm.year, effects: {} }];
}, (entry) => entry.chronic.floodScars));
register("chronic", "1.2.20.90", annualProof("volcanic-region", (entry, realm) => {
    entry.active = [{ id: "eruption", mechanic: "hazard:eruption", label: "Volcanic eruption", category: "geology", spec: "1.2.20.17", severity: 1, startedYear: realm.year, effects: {} }];
}, (entry) => entry.chronic.volcanicYears * 100 + entry.scars.lava.length));
register("chronic", "1.2.20.91", annualProof("climate-trend", (entry, realm) => {
    entry.chronic.climateDrift = 0;
    entry.active = [{ id: "drought", mechanic: "hazard:drought", label: "Drought", category: "weather", spec: "1.2.20.5", severity: 1, startedYear: realm.year, effects: {} }];
}, (entry) => entry.chronic.climateDrift));
register("chronic", "1.2.20.92", annualProof("long-term-economy", (entry, realm) => {
    entry.chronic.economicDrag = 0.8;
    realm.resources.gold = 500;
}, () => (state.resources.gold)));

// 11 magic rows: each real burden must move its own saved field or the health/rare state.
register("magic", "1.2.20.52", magicProof("magic:burden", entry => entry.magic.fog + entry.magic.cursed));
register("magic", "1.2.20.93", magicProof("magic:corruption", entry => entry.magic.corruption + entry.scars.corruption.length));
register("magic", "1.2.20.94", magicProof("magic:cursed", entry => entry.magic.cursed));
register("magic", "1.2.20.95", magicProof("magic:fog", entry => entry.magic.fog));
register("magic", "1.2.20.96", magicProof("magic:unnatural-weather", entry => entry.magic.unnaturalWeather));
register("magic", "1.2.20.97", annualProof("magic-disease", (entry) => {
    entry.magic.magicDisease = 0.8;
    state.health.outbreakActive = false;
}, () => (state.health?.outbreakActive ? 1 : 0)));
register("magic", "1.2.20.98", magicProof("magic:animal-shift", entry => entry.magic.animalShift));
register("magic", "1.2.20.99", magicProof("magic:spread", entry => entry.magic.corruption + entry.scars.corruption.length));
register("magic", "1.2.20.100", magicProof("magic:forbidden", entry => entry.magic.forbidden));
register("magic", "1.2.20.101", magicProof("magic:wards", entry => entry.magic.wards));
register("magic", "1.2.20.102", annualProof("magic-rare", (entry) => {
    entry.magic.rareYears = 8;
    entry.rare = null;
    // Keep the ordinary decadal rare roll out of this proof; only the charged
    // magic row may start the chain.
    setHazardProofRoll(1);
}, (entry) => (entry.rare?.chainId ? 1 : 0)));

function runProof(proof) {
    clearHazardProofNeutralized();
    const result = proof.run();
    clearHazardProofNeutralized();
    return result;
}

test("1.2.20 all 102 catalogue points produce measured state deltas", () => {
    assert.equal(PROOFS.length, 102, "the proof table must cover every catalogue row");
    const seen = new Set();
    const failures = [];
    for (const proof of PROOFS) {
        assert.ok(!seen.has(proof.spec), "duplicate proof " + proof.spec);
        seen.add(proof.spec);
        const evidence = HAZARD_EVIDENCE[proof.spec];
        assert.ok(evidence && evidence.surfaces.length > 0, "proof needs a visible surface for " + proof.spec);
        assert.equal(evidence.passive, false, "an executable proof cannot be marked passive: " + proof.spec);
        assert.equal(evidence.executableProof, "1.2.20 all 102 catalogue points produce measured state deltas");
        try {
            const result = runProof(proof);
            if (!(result.delta > 0)) failures.push(proof.spec + " (" + proof.group + "): " + result.detail);
        } catch (error) {
            failures.push(proof.spec + " (" + proof.group + "): " + error.message);
        } finally {
            setHazardProofRoll(null);
            clearHazardProofNeutralized();
        }
    }
    console.log("HAZARD PROOF PASS " + (PROOFS.length - failures.length) + "/" + PROOFS.length);
    console.log("HAZARD ACTIVE/PASSIVE " + PROOFS.length + "/0");
    assert.deepEqual(failures, []);
});

test("1.2.20 all 102 proofs fail when their own effect is neutralized", () => {
    const checked = PROOFS.length;
    const failures = [];
    for (const proof of PROOFS) {
        setHazardProofNeutralized([proof.spec, proof.mechanic]);
        let moved = false;
        let detail = "";
        try {
            const result = proof.run();
            moved = result.delta > 0;
            detail = result.detail;
        } catch (error) {
            detail = error.message;
        } finally {
            setHazardProofRoll(null);
            clearHazardProofNeutralized();
        }
        if (moved) failures.push(proof.spec + " (" + proof.group + "): still moved " + detail);
    }
    console.log("HAZARD NEUTRALIZATION FAILURES " + failures.length + "/" + checked);
    assert.deepEqual(failures, []);
});
