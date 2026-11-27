import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { initStartingKingdom } from "../../js/world/entities.js";
import { callNobleLevy, getNobilitySnapshot, normalizeNobilityState, updateNobility } from "../../js/systems/nobility.js";
import {
    FEUD_ARBITRATION_COST,
    FEUD_INFLAME_COST,
    FEUD_MEDIATION_COST,
    FEUD_SETTLEMENT_COSTS,
    arbitrateFeud,
    getNobleFeudSnapshot,
    ignoreFeud,
    inflameFeud,
    mediateFeud,
    settleFeudWithTerms,
    updateNobleFeuds
} from "../../js/systems/noble-feuds.js";
import {
    NOBLE_FEUD_STAGES,
    createNobleFeud,
    nobleFeudPenalty,
    normalizeNobleFeud,
    normalizeNobleFeuds,
    validateNobleFeud
} from "../../js/systems/noble-state.js";

function startRealm(seed = 20261114) {
    resetState();
    state.hasStarted = true;
    state.worldSeed = seed;
    state.year = 2;
    state.resources = { wood: 200, stone: 100, gold: 200, food: 200 };
    state.incomeThisTick = { wood: 0, stone: 0, gold: 0, food: 0 };
    initStartingKingdom();
}

function firstActiveFeud() {
    return state.nobility.feuds.find(feud => feud.status === "active");
}

test("noble feuds arise deterministically from real houses and bounded causes", () => {
    startRealm();
    updateNobility();
    const first = updateNobleFeuds();
    assert.ok(first.active >= 1);
    const feud = firstActiveFeud();
    assert.equal(feud.status, "active");
    assert.equal(feud.houses.length, 2);
    assert.ok(feud.cause.length > 4);
    assert.ok(feud.severity >= 1 && feud.severity <= 5);
    assert.ok(Number(feud.startedYear) >= 2);
    assert.ok(state.nobility.feuds.length <= 8);

    startRealm();
    updateNobility();
    const second = updateNobleFeuds();
    assert.deepEqual(
        second.feuds.map(entry => ({ id: entry.id, houses: entry.houses.map(house => house.id), cause: entry.cause, severity: entry.severity })),
        first.feuds.map(entry => ({ id: entry.id, houses: entry.houses.map(house => house.id), cause: entry.cause, severity: entry.severity }))
    );
});

test("feuds escalate over time and reduce real dues, levy and defence contributions", () => {
    startRealm();
    updateNobility();
    const before = getNobilitySnapshot();
    const houses = before.houses.slice(0, 2);
    state.nobility.feuds = [{
        id: "feud-test",
        houses: houses.map(house => house.id),
        cause: "a disputed inheritance",
        severity: 5,
        status: "active",
        startedYear: 2,
        lastEscalationYear: 2,
        settledYear: 0,
        ignoredYear: 0,
        mediatorId: null,
        history: []
    }];
    state.nobility.feudPenalty = 0.18;
    const affected = getNobilitySnapshot();
    const firstAfter = affected.houses.find(house => house.id === houses[0].id);
    assert.ok(firstAfter.dues < houses[0].dues, "an active feud reduces the tax contribution");
    assert.ok(firstAfter.levyActive < houses[0].levyActive, "an active feud reduces the available levy");
    assert.ok(affected.defenseBonus < before.defenseBonus, "an active feud reduces the defence contribution");
    assert.equal(callNobleLevy(houses[0].id).reason, "feud-blocks-the-levy");

    const feud = firstActiveFeud();
    feud.severity = 1;
    feud.lastEscalationYear = 2;
    state.politics.legitimacy = 40;
    state.year = 3;
    updateNobleFeuds();
    assert.equal(feud.severity, 2);
    assert.ok(feud.lastEscalationYear >= 3);
});

test("mediation spends gold, reduces severity and finally settles and remembers the feud", () => {
    startRealm();
    updateNobility();
    updateNobleFeuds();
    const feud = firstActiveFeud();
    feud.severity = 5;
    feud.lastEscalationYear = state.year;
    state.resources.gold = 100;
    const before = getNobilitySnapshot();
    const result = mediateFeud(feud.id);
    assert.equal(result.ok, true);
    assert.equal(state.resources.gold, 100 - FEUD_MEDIATION_COST);
    assert.equal(feud.severity, 3);
    assert.ok(getNobilitySnapshot().houses.find(house => house.id === feud.houses[0]).loyalty > before.houses.find(house => house.id === feud.houses[0]).loyalty);

    assert.equal(mediateFeud(feud.id).ok, true);
    assert.equal(feud.severity, 1);
    assert.equal(mediateFeud(feud.id).ok, true);
    assert.equal(feud.status, "settled");
    assert.equal(getNobleFeudSnapshot().active, 0);
    assert.match(feud.history[0].summary, /Mediation ended the feud|crown paid/);
    assert.ok(state.nobility.feuds.length <= 8);
});

test("inflaming and ignoring a feud cost the crown and change its severity", () => {
    startRealm();
    updateNobility();
    updateNobleFeuds();
    const feud = firstActiveFeud();
    feud.severity = 1;
    state.resources.gold = 50;
    const beforeGold = state.resources.gold;
    const beforeLegitimacy = Number(state.politics.legitimacy);
    const inflamed = inflameFeud(feud.id);
    assert.equal(inflamed.ok, true);
    assert.equal(state.resources.gold, beforeGold - FEUD_INFLAME_COST);
    assert.equal(feud.severity, 2);
    assert.ok(Number(state.politics.legitimacy) < beforeLegitimacy);
    const ignored = ignoreFeud(feud.id);
    assert.equal(ignored.ok, true);
    assert.equal(feud.severity, 3);
    assert.equal(feud.ignoredYear, state.year);
});

test("settled feud memory is bounded and legacy noble saves normalize without the new fields", () => {
    const old = normalizeNobilityState({
        version: 1,
        houses: [{ id: "house-old", familyName: "Old", loyalty: 55, history: [] }],
        defenseBonus: 1.1
    });
    assert.equal(old.feuds.length, 0);
    assert.equal(old.houses[0].host, null);
    assert.deepEqual(old.hostHistory, []);
    assert.equal(old.hostDefenseBonus, 0);

    const bounded = normalizeNobleFeuds(Array.from({ length: 12 }, (_, index) => ({
        id: "feud-" + index,
        houses: ["house-a", "house-b"],
        cause: "a disputed inheritance",
        severity: 2,
        status: index % 2 ? "settled" : "active",
        startedYear: 2,
        lastEscalationYear: 2,
        settledYear: index % 2 ? 8 : 0
    })));
    assert.equal(bounded.length, 8);
    assert.ok(bounded.every(feud => feud.houses.length === 2));
});

test("a grievance becomes a blood feud and blocks the levy until the crown acts", () => {
    startRealm();
    updateNobility();
    updateNobleFeuds();
    const feud = firstActiveFeud();
    feud.severity = 3;
    feud.stage = "grievance";
    feud.stageYear = state.year;
    feud.lastEscalationYear = state.year;
    state.politics.legitimacy = 40;
    state.year = 3;
    updateNobleFeuds();
    assert.equal(feud.stage, "blood-feud");
    assert.equal(feud.severity, 4);
    assert.equal(feud.bloodFeudYear, 3);
    assert.equal(callNobleLevy(feud.houses[0]).reason, "feud-blocks-the-levy");
    const snapshot = getNobleFeudSnapshot();
    assert.equal(snapshot.bloodFeuds, 1);
    assert.ok(snapshot.penalty >= 0.18, "blood feuds cost more than a plain grievance");
    assert.ok(feud.history.some(row => row.kind === "stage-bloodfeud"));
});

test("arbitration spends gold, sets a deadline and compensation closes the chain", () => {
    startRealm();
    updateNobility();
    updateNobleFeuds();
    const feud = firstActiveFeud();
    feud.severity = 4;
    feud.stage = "blood-feud";
    feud.lastEscalationYear = state.year;
    state.resources.gold = 100;
    const firstLoyalty = Number(state.nobility.houses.find(house => house.id === feud.houses[0]).loyalty);
    const legitimacy = Number(state.politics.legitimacy);
    const arbitrated = arbitrateFeud(feud.id);
    assert.equal(arbitrated.ok, true);
    assert.equal(feud.stage, "arbitration");
    assert.equal(feud.severity, 2);
    assert.equal(feud.arbitratedYear, state.year);
    assert.equal(state.resources.gold, 100 - FEUD_ARBITRATION_COST);
    assert.ok(state.nobility.houses.find(house => house.id === feud.houses[0]).loyalty > firstLoyalty);
    assert.equal(getNobleFeudSnapshot().arbitration, 1);

    const settled = settleFeudWithTerms(feud.id, "compensation");
    assert.equal(settled.ok, true);
    assert.equal(feud.status, "settled");
    assert.equal(feud.settlement, "compensation");
    assert.equal(state.resources.gold, 100 - FEUD_ARBITRATION_COST - FEUD_SETTLEMENT_COSTS.compensation.gold);
    assert.ok(Number(state.politics.legitimacy) > legitimacy);
    assert.equal(getNobleFeudSnapshot().compensated, 1);
    assert.equal(getNobleFeudSnapshot().active, 0);
});

test("estate-charter settlement spends timber and grants the house a real charter", () => {
    startRealm();
    updateNobility();
    updateNobleFeuds();
    const feud = firstActiveFeud();
    feud.severity = 3;
    feud.lastEscalationYear = state.year;
    state.resources.gold = 100;
    state.resources.wood = 20;
    const house = state.nobility.houses.find(entry => entry.id === feud.houses[0]);
    house.charter = false;
    assert.equal(arbitrateFeud(feud.id).ok, true);
    assert.equal(settleFeudWithTerms(feud.id, "charter").ok, true);
    assert.equal(house.charter, true);
    assert.equal(state.resources.wood, 20 - FEUD_SETTLEMENT_COSTS.charter.wood);
    assert.equal(getNobleFeudSnapshot().charteredSettlements, 1);
});

test("an unanswered arbitration deadline collapses back into a blood feud", () => {
    startRealm();
    updateNobility();
    updateNobleFeuds();
    const feud = firstActiveFeud();
    feud.stage = "arbitration";
    feud.stageYear = 2;
    feud.arbitratedYear = 2;
    feud.severity = 1;
    feud.lastEscalationYear = 2;
    state.politics.legitimacy = 80;
    state.year = 5;
    updateNobleFeuds();
    assert.equal(feud.stage, "blood-feud");
    assert.equal(feud.severity, 2);
    assert.ok(feud.history.some(row => /arbitration deadline/i.test(row.summary)));
});

test("feud chain fields normalize and validate without a schema bump", () => {
    const source = createNobleFeud({
        id: "feud-chain-test",
        houses: ["house-a", "house-b"],
        cause: "a broken marriage pact",
        year: 4
    });
    source.stage = "blood-feud";
    source.stageYear = 6;
    source.bloodFeudYear = 6;
    source.history = Array.from({ length: 20 }, (_, index) => ({
        year: 4 + index, kind: "stagebloodfeud", summary: "The chain advanced."
    }));
    const restored = normalizeNobleFeud(JSON.parse(JSON.stringify(source)));
    assert.equal(restored.stage, "blood-feud");
    assert.equal(restored.bloodFeudYear, 6);
    assert.equal(restored.history.length, 12);
    assert.equal(restored.settlement, "");
    assert.equal(NOBLE_FEUD_STAGES.length, 3);
    assert.equal(validateNobleFeud(restored), true);
    assert.throws(() => validateNobleFeud({ stage: "mythic-war" }), /invalid noble-feud stage/);
    assert.throws(() => validateNobleFeud({ settlement: "tribute" }), /invalid noble-feud settlement/);
});

test("nobility save normalization keeps the shared stage-scaled feud penalty", () => {
    const bloodFeud = createNobleFeud({
        id: "feud-penalty-test", houses: ["house-a", "house-b"],
        cause: "a contested border toll", year: 4, severity: 4, stage: "blood-feud"
    });
    const normalized = normalizeNobilityState({ houses: [], feuds: [bloodFeud] });
    assert.equal(normalized.feudPenalty, nobleFeudPenalty(bloodFeud));
    assert.ok(normalized.feudPenalty > 4 * 0.036, "a blood feud must stay costlier after save/load");
    assert.equal(normalized.activeFeuds, 1);
});
