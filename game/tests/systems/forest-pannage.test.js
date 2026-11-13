import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { restoreForestGathering, serializeForestGathering } from "../../js/systems/forest-gathering.js";
import {
    feedStableFromMast, pannageSummary, updateForestPannage, validatePannage,
    PANNAGE_LIMITS,
} from "../../js/systems/forest-pannage.js";

function setup() {
    resetState();
    restoreForestGathering({
        version: 1,
        stock: { acorns: 4, beechnuts: 2, chestnuts: 1 },
        totalGathered: { acorns: 4, beechnuts: 2, chestnuts: 1 },
        quality: {},
        history: [],
        lastGather: {},
    });
    const stable = {
        id: "stable-test", type: TYPE.STABLE, x: 10, y: 10, dead: false,
        construction: { stage: 3, progress: 100 },
        isBuilding: () => true,
    };
    state.entities = [stable];
    return stable;
}

test("mast becomes a real pannage reserve on a concrete stable", () => {
    const stable = setup();
    const result = feedStableFromMast(stable, 6);
    assert.equal(result.ok, true);
    assert.equal(result.fed, 6);
    assert.equal(result.days, 6);
    assert.equal(state.forestGathering.stock.acorns, 0);
    assert.equal(state.forestGathering.stock.beechnuts, 0);
    assert.equal(state.forestGathering.stock.chestnuts, 1);
    assert.match(pannageSummary(stable), /6 days/);
    assert.equal(validatePannage(stable.pannage), true);
});

test("pannage is consumed day by day and cannot exceed its bounded reserve", () => {
    const stable = setup();
    assert.equal(feedStableFromMast(stable, 40).fed, 7);
    assert.equal(stable.pannage.days, 7);
    assert.equal(updateForestPannage(2), 2);
    assert.equal(stable.pannage.days, 5);
    assert.equal(feedStableFromMast(stable, 4).ok, false);
    assert.throws(() => validatePannage({ version: 1, days: PANNAGE_LIMITS.maxDays + 1 }), /oversized/);
    assert.equal(serializeForestGathering().stock.acorns || 0, 0);
});

test("hay and meadow grass feed a stable when mast is exhausted", () => {
    const stable = setup();
    restoreForestGathering({
        version: 1,
        stock: { hay: 2, "meadow-grass": 1 },
        totalGathered: { hay: 2, "meadow-grass": 1 },
        quality: {},
        history: [],
        lastGather: {},
    });
    const result = feedStableFromMast(stable, 6);
    assert.equal(result.ok, true);
    assert.equal(result.fed, 3);
    assert.equal(result.days, 3);
    assert.equal(state.forestGathering.stock.hay, 0);
    assert.equal(state.forestGathering.stock["meadow-grass"], 0);
    assert.match(pannageSummary(stable), /3 days/);
});
