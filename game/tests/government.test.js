import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../js/core/state.js";
import { TAX_POLICIES, normalizeGovernment, getGovernmentSnapshot, setTaxPolicy, holdRoyalAudience } from "../js/systems/government.js";
import { calculateDailyLedger } from "../js/systems/economy.js";

beforeEach(() => {
    resetState();
    state.year = 8;
    state.resources.gold = 80;
});

test("government defaults to a normalized standard tax policy", () => {
    const government = normalizeGovernment();
    assert.equal(government.taxPolicy, "standard");
    assert.equal(getGovernmentSnapshot().taxMultiplier, 1);
    assert.equal(getGovernmentSnapshot().audienceAvailable, true);
});

test("tax policies change actual treasury calculations and faction support", () => {
    const standard = calculateDailyLedger({ population: 20, employed: 10, buildings: 2, foodAvailable: 100, goldAvailable: 100 });
    const heavy = setTaxPolicy("heavy");
    assert.equal(heavy.ok, true);
    assert.equal(getGovernmentSnapshot().taxMultiplier, TAX_POLICIES.heavy.multiplier);
    const heavyLedger = calculateDailyLedger({
        population: 20, employed: 10, buildings: 2, foodAvailable: 100, goldAvailable: 100,
        taxMultiplier: getGovernmentSnapshot().taxMultiplier
    });
    assert.ok(heavyLedger.taxesCollected > standard.taxesCollected);
    assert.ok(state.politics.factions.commons < 68);
    assert.ok(state.politics.factions.nobility > 58);
});

test("light taxes lower treasury income and improve commoner and guild support", () => {
    setTaxPolicy("light");
    const ledger = calculateDailyLedger({
        population: 20, employed: 10, buildings: 2, foodAvailable: 100, goldAvailable: 100,
        taxMultiplier: getGovernmentSnapshot().taxMultiplier
    });
    assert.equal(getGovernmentSnapshot().taxMultiplier, 0.75);
    assert.equal(ledger.taxesCollected, 3.75);
    assert.ok(state.politics.factions.commons > 68);
    assert.ok(state.politics.factions.guilds > 55);
});

test("invalid tax policy cannot mutate government", () => {
    assert.equal(setTaxPolicy("absolute-chaos").ok, false);
    assert.equal(getGovernmentSnapshot().taxPolicy, "standard");
});

test("royal audience spends gold, strengthens the weakest faction and respects cooldown", () => {
    state.politics.factions = { commons: 70, nobility: 45, guilds: 60, clergy: 62 };
    const beforeGold = state.resources.gold;
    const result = holdRoyalAudience();
    assert.deepEqual(result, { ok: true, weakestFaction: "nobility", cost: 12 });
    assert.equal(state.resources.gold, beforeGold - 12);
    assert.ok(state.politics.legitimacy > 65);
    assert.ok(state.politics.factions.nobility > 45);
    assert.equal(holdRoyalAudience().reason, "audience-cooldown");
    state.year += 2;
    assert.equal(holdRoyalAudience().ok, true);
});

test("royal audience refuses to spend treasury below its cost", () => {
    state.resources.gold = 11;
    assert.equal(holdRoyalAudience().reason, "insufficient-gold");
    assert.equal(state.resources.gold, 11);
});

test("legacy government state is bounded and unknown policies fall back safely", () => {
    const government = normalizeGovernment({ taxPolicy: "unknown", lastAudienceYear: -50, decreesIssued: 99999999 });
    assert.equal(government.taxPolicy, "standard");
    assert.equal(government.lastAudienceYear, 0);
    assert.equal(government.decreesIssued, 1000000);
});
