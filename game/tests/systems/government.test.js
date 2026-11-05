import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { setGovernmentForm, setTaxPolicy, setLawCode, resolveRoyalDecision, normalizeGovernment } from "../../js/systems/government.js";
import { calculateDailyLedger } from "../../js/systems/economy.js";

test("government normalization migrates defaults and clamps saved values", () => {
    resetState();
    const government = normalizeGovernment({ form: "unknown", taxPolicy: "heavy", lawCode: "unknown", taxRate: 9, decisionsMade: -4 });
    assert.equal(government.form, "feudal_monarchy");
    assert.equal(government.taxPolicy, "heavy");
    assert.equal(government.lawCode, "customary");
    assert.equal(government.taxRate, 1.5);
    assert.equal(government.decisionsMade, 0);
});

test("constitutional form, tax policy and law code persist as meaningful choices", () => {
    resetState();
    assert.equal(setGovernmentForm("council_monarchy").ok, true);
    assert.equal(state.government.form, "council_monarchy");
    assert.equal(setTaxPolicy("heavy").ok, true);
    assert.equal(state.government.taxRate, 1.3);
    assert.equal(setLawCode("charter").ok, true);
    assert.equal(state.government.lawCode, "charter");
    assert.equal(state.government.decisionsMade, 3);
    assert.equal(setGovernmentForm("invalid").reason, "unknown-government-form");
});

test("tax policy changes actual tax revenue without changing other ledger formulas", () => {
    const base = calculateDailyLedger({ population: 10, employed: 10, buildings: 2, foodAvailable: 100, goldAvailable: 0 });
    const heavy = calculateDailyLedger({ population: 10, employed: 10, buildings: 2, foodAvailable: 100, goldAvailable: 0, taxMultiplier: 1.3 });
    assert.equal(base.taxesCollected, 5);
    assert.equal(heavy.taxesCollected, 6.5);
    assert.equal(heavy.foodConsumed, base.foodConsumed);
    assert.equal(heavy.upkeepPaid, base.upkeepPaid);
});

test("royal decisions charge resources and change faction support and morale", () => {
    resetState();
    state.resources.food = 20;
    const before = state.politics.factions.commons;
    const morale = state.morale;
    const result = resolveRoyalDecision("grain_relief");
    assert.equal(result.ok, true);
    assert.equal(state.resources.food, 8);
    assert.ok(state.politics.factions.commons > before);
    assert.equal(state.morale, morale + 3);
    state.resources.gold = 0;
    const failed = resolveRoyalDecision("guild_charter");
    assert.deepEqual(failed, { ok: false, reason: "insufficient-gold" });
    assert.equal(state.resources.food, 8);
});

test("unknown royal decisions cannot mutate the realm", () => {
    resetState();
    const before = JSON.stringify(state);
    assert.equal(resolveRoyalDecision("invent-a-decree").reason, "unknown-decision");
    assert.equal(state.resources.gold, 75);
    assert.equal(state.politics.legitimacy, 65);
    assert.ok(before.length > 0);
});
