import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import {
    buildHazardForecast, chooseHazardPlan, chooseRareEvent, createDiseaseRecord,
    fundHazardInsurance, getHazardResponseSnapshot, normalizeHazardResponse,
    resettleHazardGround, selectRareChain, sendHazardAid, setHazardQuarantine,
    takeHazardLoan, trainHazardCrew, advanceHazardDiseases, settleHazardMigrants
} from "../../js/systems/hazard-response.js";
import {
    getHazardScarSnapshot, isHazardTileBlocked, recordLavaScar, recordLostGround,
    recordFloodScar
} from "../../js/systems/hazard-scars.js";
import { createEnvironmentalHazardState, getHazardMitigation, normalizeEnvironmentalHazardState } from "../../js/systems/environmental-hazards.js";
import { getHazardSimulationEffects, invalidateHazardModifierCache } from "../../js/systems/hazard-modifiers.js";

const SEED = 20261122;

function prepareRealm() {
    resetState();
    state.worldSeed = SEED;
    state.worldW = 48;
    state.worldH = 48;
    state.terrainResolution = 1;
    state.terrainPixW = 48;
    state.terrainPixH = 48;
    state.worldOptions = { size: "standard", climate: "temperate" };
    state.resources = { wood: 220, stone: 180, gold: 220, food: 180 };
    state.seasonIndex = 1;
    state.year = 4;
    state.tick = 900;
    state.hasStarted = true;
    state.morale = 68;
    state.health = {
        outbreakActive: true, disease: "existing fever", severity: 1, containment: 20,
        cases: 2, recovered: 0, outbreaks: 1, herbalDoses: 0, herbalTreated: 0,
        lastUpdateTick: 0, startedAtTick: 0, healers: [], medicine: 0,
        sanitation: { score: 52 }
    };
    state.research = { completed: [] };
    state.roads = { version: 1, revision: 0, tiles: {} };
    state.entities = [];
    state.diplomacy = { realms: [] };
    state.environmentalHazards = createEnvironmentalHazardState();
    return state.environmentalHazards;
}

function addBuilding(type) {
    const entity = {
        id: "building-" + type + "-" + state.entities.length,
        type, x: 20, y: 20, hp: 100, maxHp: 100, dead: false,
        isBuilding() { return true; }
    };
    state.entities.push(entity);
    return entity;
}

test("1.2.20 protection works are real buildings that raise the protection survey", () => {
    prepareRealm();
    for (const type of [TYPE.DAM, TYPE.AVALANCHE_BARRIER, TYPE.DRAINAGE, TYPE.WEATHER_HOUSE,
        TYPE.QUARANTINE, TYPE.GRANARY, TYPE.WARD]) {
        addBuilding(type);
    }
    const mitigation = getHazardMitigation();
    assert.ok(mitigation.dam > 0);
    assert.ok(mitigation.avalanche > 0);
    assert.ok(mitigation.drainage > 0);
    assert.ok(mitigation.warehouse > 0);
    assert.ok(mitigation.medical > 0);
    assert.ok(mitigation.clothing > 0);
    assert.ok(mitigation.wards > 0);
    assert.ok(mitigation.score > 0);
});

test("1.2.20 forecast is deterministic, bounded and shows an uncertainty band", () => {
    const entry = prepareRealm();
    entry.mitigation = getHazardMitigation();
    const first = buildHazardForecast(entry);
    const second = buildHazardForecast(entry);
    assert.deepEqual(first, second);
    assert.ok(first.confidence >= 0 && first.confidence <= 1);
    assert.ok(first.risks.length <= 4);
    for (const risk of first.risks) {
        assert.ok(risk.risk >= 0 && risk.risk <= 1);
        assert.ok(risk.low <= risk.risk && risk.high >= risk.risk);
    }
});

test("1.2.20 a plan spends real stores and becomes this season's readiness", () => {
    const entry = prepareRealm();
    const wood = state.resources.wood;
    const result = chooseHazardPlan("stockpile");
    assert.equal(result.ok, true);
    assert.ok(state.resources.wood < wood);
    assert.equal(entry.response.plan, "stockpile");
    assert.equal(entry.response.stockpile, 2);
    assert.equal(chooseHazardPlan("evacuate").ok, false, "only one plan per season");
    const locked = getHazardResponseSnapshot();
    assert.equal(locked.plan, "stockpile");
    assert.equal(locked.forecast.risks.length > 0, true);
});

test("1.2.20 disease records carry contagion and quarantine slows the ledger", () => {
    const entry = prepareRealm();
    entry.diseases = [createDiseaseRecord("hazard:water-disease", "Water fever", 0.8, "hazard")];
    const disease = entry.diseases[0];
    assert.ok(disease.contagion > 0 && disease.lethality > 0 && disease.duration > 0);
    assert.equal(disease.water, true);
    const quarantine = setHazardQuarantine(true);
    assert.equal(quarantine.ok, true);
    advanceHazardDiseases(entry, []);
    assert.ok(entry.diseases[0].cases >= 1);
    assert.ok(entry.diseases[0].vector);
    assert.ok(entry.diseases[0].deaths >= 0);
});

test("1.2.20 lava, lost ground and floodwater are real movement blockers", () => {
    const entry = prepareRealm();
    recordLavaScar(entry, 4, 4);
    recordLostGround(entry, 5, 5);
    recordFloodScar(entry, 6, 6);
    assert.equal(isHazardTileBlocked(4, 4), true);
    assert.equal(isHazardTileBlocked(5, 5), true);
    assert.equal(isHazardTileBlocked(6, 6), true);
    assert.equal(isHazardTileBlocked(7, 7), false);
    const scars = getHazardScarSnapshot();
    assert.equal(scars.counts.lava, 1);
    assert.equal(scars.counts.lost, 1);
    assert.equal(scars.counts.flooded, 1);
});

test("1.2.20 rare events select a chain and a real decision resolves it", () => {
    const entry = prepareRealm();
    const chain = selectRareChain(entry, 0);
    assert.equal(chain.id, "harvest-curse");
    assert.ok(entry.rare.chainId === "harvest-curse");
    assert.ok(entry.rare.endsYear > state.year);
    const food = state.resources.food;
    const result = chooseRareEvent("tithe");
    assert.equal(result.ok, true);
    assert.equal(result.resolved, true);
    assert.ok(state.resources.food < food);
    assert.equal(entry.rare.resolved, true);
    assert.equal(entry.rare.choice, "tithe");
});

test("1.2.20 crews, insurance, loans and resettlement have real costs and effects", () => {
    const entry = prepareRealm();
    const beforeUnits = getHazardMitigation().units;
    const crew = trainHazardCrew("fire");
    assert.equal(crew.ok, true);
    assert.ok(getHazardMitigation().units > beforeUnits);
    assert.equal(entry.response.crews.fire, 1);

    const fund = fundHazardInsurance();
    assert.equal(fund.ok, true);
    assert.equal(entry.response.insurance, 20);
    const loan = takeHazardLoan();
    assert.equal(loan.ok, true);
    assert.equal(entry.response.loan.principal, 72);

    recordLostGround(entry, 9, 9);
    const resettle = resettleHazardGround();
    assert.equal(resettle.ok, true);
    assert.equal(entry.response.resettled, 1);
    assert.equal(entry.scars.lost.length, 0);
});

test("1.2.20 a partner outbreak can be answered with aid and changes the relation", () => {
    const entry = prepareRealm();
    entry.partners = [{ id: "northmere", name: "Northmere Guild", relation: 40, outbreak: true }];
    state.diplomacy = { realms: [{ id: "northmere", relation: 40 }] };
    const food = state.resources.food;
    const result = sendHazardAid("northmere");
    assert.equal(result.ok, true);
    assert.ok(state.resources.food < food);
    assert.equal(entry.partners[0].outbreak, false);
    assert.equal(entry.partners[0].relation, 45);
});

test("1.2.20 refugees become real residents when homes and stores exist", () => {
    const entry = prepareRealm();
    addBuilding(TYPE.HOUSE);
    entry.response.migrants = 2;
    const before = state.entities.filter(entity => entity.type === TYPE.VILLAGER).length;
    const settled = settleHazardMigrants(entry, []);
    assert.equal(settled, 2);
    assert.equal(entry.response.arrivals, 2);
    assert.equal(entry.response.migrants, 0);
    const villagers = state.entities.filter(entity => entity.type === TYPE.VILLAGER);
    assert.equal(villagers.length, before + 2);
    assert.equal(villagers.filter(entity => entity.civicOrigin === "hazard-arrival").length, 2);
    assert.ok(villagers.filter(entity => entity.civicOrigin === "hazard-arrival")
        .every(entity => entity.householdId && entity.home), "arrivals receive a real household");
});

test("1.2.20 a partner crisis raises caravan terms and aid resolves the crisis", () => {
    const entry = prepareRealm();
    entry.partners = [{
        id: "northmere", name: "Northmere Guild", relation: 40,
        crisis: "drought", refugees: 1, tradePenalty: 0.05, request: true
    }];
    invalidateHazardModifierCache();
    assert.ok(getHazardSimulationEffects().tradeBuy > 1, "a partner crisis must affect trade");
    const food = state.resources.food;
    const result = sendHazardAid("northmere");
    assert.equal(result.ok, true);
    assert.ok(state.resources.food < food);
    assert.equal(entry.partners[0].crisis, "none");
    assert.equal(entry.partners[0].tradePenalty, 0);
});

test("1.2.20 unnatural weather and changed animal populations are real burdens", () => {
    const entry = prepareRealm();
    entry.magic.unnaturalWeather = 0.8;
    entry.magic.animalShift = 0.8;
    invalidateHazardModifierCache();
    const effects = getHazardSimulationEffects();
    assert.ok(effects.raw.movement > 0, "unnatural weather must slow movement");
    assert.ok(effects.pasture < 1, "changed animal populations must reduce pasture");
});

test("1.2.20 the expanded hazard state normalises and round-trips without losing new fields", () => {
    const entry = prepareRealm();
    chooseHazardPlan("relief");
    trainHazardCrew("medical");
    setHazardQuarantine(true);
    const saved = JSON.parse(JSON.stringify(normalizeEnvironmentalHazardState(entry)));
    const restored = normalizeEnvironmentalHazardState(saved);
    assert.equal(restored.response.plan, "relief");
    assert.equal(restored.response.crews.medical, 1);
    assert.equal(restored.response.quarantine.active, true);
    assert.deepEqual(JSON.parse(JSON.stringify(restored)), saved);
});
