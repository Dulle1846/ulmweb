import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { getAmbitionSnapshot, normalizeAmbitions, updateAmbitions } from "../../js/systems/ambitions.js";

function foundedFixture() {
    resetState();
    state.hasStarted = true;
    state.isPaused = false;
    state.tick = 20;
    state.year = 1;
    state.morale = 72;
    state.resources = { wood: 180, stone: 95, gold: 75, food: 220 };
    state.statistics = { totalTrades: 0, totalBuildingsBuilt: 0, totalUnitsRecruited: 0, totalEventsResolved: 0, totalRoadTilesBuilt: 0 };
}

test("the first ambition completes once and pays its reward only once", () => {
    foundedFixture();
    const before = getAmbitionSnapshot();
    assert.equal(before.id, "full-larder");
    assert.equal(before.completedCount, 0);

    const completed = updateAmbitions();
    assert.deepEqual(completed, ["full-larder"]);
    assert.equal(state.ambitions.completed["full-larder"], 20);
    assert.equal(state.resources.gold, 100);

    state.tick = 40;
    updateAmbitions();
    assert.equal(state.ambitions.completed["full-larder"], 20, "completion tick must not move");
    assert.equal(state.resources.gold, 100, "reward must not be paid twice");
    assert.notEqual(getAmbitionSnapshot().id, "full-larder");
});

test("ambition snapshots expose a bounded progress value and a future goal", () => {
    foundedFixture();
    state.resources.food = 110;
    const snapshot = getAmbitionSnapshot();
    assert.ok(snapshot.progress >= 0 && snapshot.progress <= 1);
    assert.match(snapshot.progressLabel, /food/);
    assert.equal(snapshot.completedCount, 0);
});

test("ambition saves discard unknown ids and malformed values", () => {
    const normalized = normalizeAmbitions({
        completed: { "full-larder": 12, "unknown-goal": 4, "room-to-grow": -5 },
        lastEvaluatedTick: 99.8
    });
    assert.deepEqual(Object.keys(normalized.completed).sort(), ["full-larder", "room-to-grow"]);
    assert.equal(normalized.completed["room-to-grow"], 0);
    assert.equal(normalized.lastEvaluatedTick, 99);
});
