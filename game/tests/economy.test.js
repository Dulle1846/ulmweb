import test from "node:test";
import assert from "node:assert/strict";
import { calculateDailyLedger } from "../js/systems/economy.js";

test("daily ledger balances food, taxes, wages and upkeep", () => {
    const ledger = calculateDailyLedger({
        population: 10, employed: 8, buildings: 12, foodAvailable: 20, goldAvailable: 10
    });
    assert.ok(Math.abs(ledger.foodDemand - 8) < 1e-9);
    assert.ok(Math.abs(ledger.foodConsumed - 8) < 1e-9);
    assert.equal(ledger.taxesCollected, 4);
    assert.ok(Math.abs(ledger.wagesPaid - 2.4) < 1e-9);
    assert.ok(Math.abs(ledger.upkeepPaid - 0.72) < 1e-9);
    assert.ok(Math.abs(ledger.netGold - 0.88) < 1e-9);
    assert.equal(ledger.unemployed, 2);
});

test("food shortage is capped by available stock and reported", () => {
    const ledger = calculateDailyLedger({
        population: 10, employed: 0, buildings: 0, foodAvailable: 1, goldAvailable: 0
    });
    assert.equal(ledger.foodConsumed, 1);
    assert.ok(Math.abs(ledger.foodShortage - 7) < 1e-9);
});

test("unpaid wages and upkeep never create negative treasury payments", () => {
    const ledger = calculateDailyLedger({
        population: 20, employed: 20, buildings: 100, foodAvailable: 0, goldAvailable: 0
    });
    assert.ok(ledger.wagesPaid >= 0);
    assert.ok(ledger.upkeepPaid >= 0);
    assert.ok(Math.abs(ledger.wagesPaid + ledger.upkeepPaid - ledger.taxesCollected) < 1e-9);
    assert.ok(ledger.unpaidWages > 0 || ledger.unpaidUpkeep > 0);
});
