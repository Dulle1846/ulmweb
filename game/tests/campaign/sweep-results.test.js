import assert from "node:assert/strict";
import test from "node:test";

import { evaluateCampaignSweep } from "./sweep-results.mjs";

const SEEDS = [20261106, 20261143, 20261152];

function result(seed, orders, maxOrdersPerPhase = orders ? 1 : 0, ok = true) {
    return {
        seed,
        ok,
        requirements: { allComplete: ok, noStalls: true, notOver: true },
        diagnostics: { fuelBackfill: { orders, phases: orders, extensions: 0, maxOrdersPerPhase } },
    };
}

test("a documented sweep passes when every seed is green and one seed has real fuel evidence", () => {
    const evaluation = evaluateCampaignSweep([
        result(20261106, 0),
        result(20261143, 0),
        result(20261152, 2),
    ], SEEDS);
    assert.equal(evaluation.ok, true);
    assert.equal(evaluation.allCampaignRequirementsTrue, true);
    assert.equal(evaluation.fuelBackfillOrders, 2);
    assert.equal(evaluation.fuelBackfillPhases, 2);
    assert.equal(evaluation.maxOrdersPerPhase, 1);
    assert.deepEqual(evaluation.failures, []);
});

test("one failed real requirement fails the whole sweep even with fuel evidence", () => {
    const failed = result(20261152, 2);
    failed.requirements.morale = false;
    failed.ok = false;
    const evaluation = evaluateCampaignSweep([result(20261106, 0), failed], SEEDS);
    assert.equal(evaluation.ok, false);
    assert.match(evaluation.failures.join("\n"), /seed 20261152: campaign requirements failed \(morale\)/);
});

test("a sweep without real illness-to-fuel-backfill orders fails", () => {
    const evaluation = evaluateCampaignSweep([result(20261106, 0), result(20261143, 0)], SEEDS);
    assert.equal(evaluation.ok, false);
    assert.match(evaluation.failures.join("\n"), /no real illness-to-fuel-backfill orders/);
});

test("more than one order for the same worker phase fails", () => {
    const evaluation = evaluateCampaignSweep([result(20261152, 2, 2)], SEEDS);
    assert.equal(evaluation.ok, false);
    assert.match(evaluation.failures.join("\n"), /invalid fuel-backfill evidence/);
});
