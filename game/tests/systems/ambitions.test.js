import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { AMBITIONS, getAmbitionSnapshot, normalizeAmbitions, updateAmbitions } from "../../js/systems/ambitions.js";

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

function allAmbitionsFixture() {
    foundedFixture();
    state.tick = 60;
    state.ambitions = normalizeAmbitions({
        completed: Object.fromEntries(AMBITIONS.map(ambition => [ambition.id, 10])),
        lastEvaluatedTick: 40
    });
    return state.ambitions.eternal;
}

test("eternal deeds stay dormant until the royal ladder is complete", () => {
    foundedFixture();
    const snapshot = getAmbitionSnapshot();
    assert.equal(snapshot.eternal, undefined);
    assert.equal(state.ambitions.eternal.active, null);
    assert.equal(state.ambitions.eternal.count, 0);
});

test("eternal deeds continue the chronicle after all thirteen ambitions", () => {
    allAmbitionsFixture();
    const snapshot = getAmbitionSnapshot();
    assert.equal(snapshot.allComplete, true);
    assert.equal(snapshot.completedCount, 13);
    assert.equal(snapshot.total, 13);
    assert.equal(snapshot.eternal, true);
    assert.equal(snapshot.eternalCount, 0);
    assert.match(snapshot.eternalLabel, /ETERNAL DEED/);
    assert.ok(snapshot.title.length > 0);
    assert.match(snapshot.description, /chronicle continues/);
    assert.ok(snapshot.progress >= 0 && snapshot.progress <= 1);
    assert.ok(snapshot.rewardText.length > 0);
    const active = state.ambitions.eternal.active;
    assert.ok(active);
    assert.ok(active.target > active.baseline);
});

test("eternal deed progress is bounded and reads the issued target", () => {
    const eternal = allAmbitionsFixture();
    eternal.active = { deedId: "crown-chest", baseline: 1000, target: 1400, startedTick: 60, generation: 0 };
    state.resources.gold = 1200;
    const half = getAmbitionSnapshot();
    assert.equal(half.id, "eternal:crown-chest");
    assert.equal(half.progress, 0.5);
    assert.match(half.progressLabel, /1,200/);
    state.resources.gold = 2000;
    assert.equal(getAmbitionSnapshot().progress, 1);
});

test("an eternal deed pays exactly once and immediately issues the next", () => {
    const eternal = allAmbitionsFixture();
    const gold = state.resources.gold;
    const stone = state.resources.stone;
    eternal.active = { deedId: "crown-chest", baseline: gold, target: gold + 30, startedTick: 60, generation: eternal.serial++ };
    state.resources.gold = gold + 30;
    state.tick = 80;

    const completed = updateAmbitions();
    assert.deepEqual(completed, ["eternal:crown-chest"]);
    assert.equal(eternal.count, 1);
    assert.equal(state.resources.gold, gold + 30, "the crown chest does not pay gold");
    assert.equal(state.resources.stone, stone + 40);
    assert.ok(state.legacy?.prestige >= 2);
    assert.equal(eternal.history.length, 1);
    assert.equal(eternal.lastCompleted.deedId, "crown-chest");
    assert.ok(eternal.active);
    assert.ok(eternal.active.target > eternal.active.baseline);
    assert.notEqual(eternal.active.deedId, "crown-chest", "the next deed should be a different family");

    const goldAfter = state.resources.gold;
    const stoneAfter = state.resources.stone;
    state.tick = 100;
    updateAmbitions();
    assert.equal(eternal.count, 1, "the next deed must not complete instantly");
    assert.equal(state.resources.gold, goldAfter);
    assert.equal(state.resources.stone, stoneAfter);
});

test("a stalled eternal deed is set aside instead of blocking the chronicle", () => {
    const eternal = allAmbitionsFixture();
    state.year = 4;
    eternal.active = {
        deedId: "crown-chest", baseline: 1000, target: 2000,
        startedTick: 20, startedYear: 1, lastProgressYear: 1, bestValue: 1000, generation: eternal.serial++
    };
    state.resources.gold = 1000;
    state.tick = 80;
    const result = updateAmbitions();
    assert.deepEqual(result, ["eternal-set-aside:crown-chest"]);
    assert.equal(eternal.count, 0, "a set-aside deed is never counted or paid");
    assert.ok(eternal.active, "a new deed must be issued immediately");
    assert.ok(eternal.active.target > eternal.active.baseline);
});

test("a deed that keeps progressing is not set aside", () => {
    const eternal = allAmbitionsFixture();
    state.year = 4;
    eternal.active = {
        deedId: "crown-chest", baseline: 1000, target: 2000,
        startedTick: 20, startedYear: 1, lastProgressYear: 1, bestValue: 1000, generation: eternal.serial++
    };
    state.resources.gold = 1400;
    state.tick = 80;
    assert.deepEqual(updateAmbitions(), []);
    assert.equal(eternal.active.deedId, "crown-chest");
    assert.equal(eternal.active.lastProgressYear, 4);
});

test("the eternal chronicle keeps issuing and paying deed after deed", () => {
    const eternal = allAmbitionsFixture();
    for (let index = 1; index <= 3; index++) {
        const gold = state.resources.gold;
        const stone = state.resources.stone;
        eternal.active = { deedId: "crown-chest", baseline: gold, target: gold + 30, startedTick: state.tick, generation: eternal.serial++ };
        state.resources.gold = gold + 30;
        state.tick = 60 + index * 20;
        assert.deepEqual(updateAmbitions(), ["eternal:crown-chest"]);
        assert.equal(eternal.count, index);
        assert.equal(eternal.history.length, index);
        assert.equal(eternal.history[0].count, index);
        assert.ok(state.resources.stone >= stone + 40);
    }
    assert.equal(state.legacy.prestige, 6, "three deeds pay the base prestige every time");
    assert.ok(eternal.active);
    assert.ok(eternal.active.target > eternal.active.baseline);
});

test("eternal deed state survives a save round trip", () => {
    const eternal = allAmbitionsFixture();
    getAmbitionSnapshot();
    eternal.active = { deedId: "crown-chest", baseline: 500, target: 530, startedTick: 60, generation: 4 };
    state.resources.gold = 530;
    state.tick = 80;
    updateAmbitions();

    const restored = normalizeAmbitions(JSON.parse(JSON.stringify(state.ambitions)));
    assert.equal(restored.eternal.count, 1);
    assert.equal(restored.eternal.history.length, 1);
    assert.equal(restored.eternal.lastCompleted.deedId, "crown-chest");
    assert.ok(restored.eternal.active);
    assert.equal(restored.eternal.active.deedId, state.ambitions.eternal.active.deedId);
    assert.equal(restored.eternal.active.target, state.ambitions.eternal.active.target);
    assert.equal(restored.eternal.active.baseline, state.ambitions.eternal.active.baseline);
});

test("old saves gain eternal defaults and malformed deeds are discarded", () => {
    const legacy = normalizeAmbitions({ completed: {}, lastEvaluatedTick: 3 });
    assert.deepEqual(legacy.eternal, { count: 0, serial: 0, active: null, lastCompleted: null, history: [] });

    const normalized = normalizeAmbitions({
        completed: {},
        lastEvaluatedTick: 0,
        eternal: {
            count: 4,
            serial: 2,
            active: { deedId: "not-a-deed", baseline: 0, target: 10 },
            lastCompleted: { deedId: "crown-chest", year: 9, tick: 10, count: 4, title: "A Treasury for the Ages" },
            history: [{ deedId: "ghost-deed", count: 1 }, { deedId: "crown-chest", count: 4, year: 9, tick: 10, title: "A Treasury for the Ages" }]
        }
    });
    assert.equal(normalized.eternal.count, 4);
    assert.equal(normalized.eternal.active, null);
    assert.equal(normalized.eternal.serial, 4, "the serial can never fall below the completed count");
    assert.equal(normalized.eternal.history.length, 1);
    assert.equal(normalized.eternal.history[0].deedId, "crown-chest");
});
