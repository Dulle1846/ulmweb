import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { AMBITIONS, canChooseCrownEra, chooseCrownEra, getAmbitionSnapshot, getCrownEraSnapshot, normalizeAmbitions, updateAmbitions } from "../../js/systems/ambitions.js";

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

test("the second crown is unavailable until all royal ambitions are complete", () => {
    foundedFixture();
    assert.equal(getCrownEraSnapshot(), null);
    assert.equal(canChooseCrownEra("common-weal"), false);
    assert.equal(chooseCrownEra("common-weal"), null);
    assert.equal(state.ambitions.era, null);

    allAmbitionsFixture();
    assert.equal(canChooseCrownEra("common-weal"), true);
    assert.equal(canChooseCrownEra("not-an-era"), false);
});

test("choosing an era applies its reward once and persists the era", () => {
    allAmbitionsFixture();
    state.tick = 80;
    const before = {
        food: state.resources.food,
        gold: state.resources.gold,
        morale: state.morale,
        politics: { ...state.politics.factions },
        legitimacy: state.politics.legitimacy
    };
    const era = chooseCrownEra("common-weal");
    assert.equal(era.id, "common-weal");
    assert.equal(era.title, "The Common Weal");
    assert.equal(state.ambitions.era.id, "common-weal");
    assert.equal(state.ambitions.era.chosenTick, 80);
    assert.equal(state.resources.food, before.food + 120);
    assert.equal(state.resources.gold, before.gold + 40);
    assert.equal(state.morale, before.morale + 4);
    assert.equal(state.politics.factions.commons, before.politics.commons + 6);
    assert.equal(state.politics.factions.guilds, before.politics.guilds + 2);
    assert.equal(state.politics.legitimacy, before.legitimacy + 2);
    assert.equal(state.hiddenRealm.prosperity, 4);
    assert.equal(state.hiddenRealm.tension, -3);
    assert.ok(era.eventBias.harvest > 1);

    const snapshot = getAmbitionSnapshot();
    assert.equal(snapshot.era, "common-weal");
    assert.match(snapshot.description, /Common Weal/);
    assert.equal(chooseCrownEra("guild-compact"), null, "a second era choice must be rejected");
});

test("crown era state migrates safely and unknown eras are discarded", () => {
    allAmbitionsFixture();
    state.tick = 80;
    chooseCrownEra("guild-compact");
    const restored = normalizeAmbitions(JSON.parse(JSON.stringify(state.ambitions)));
    assert.equal(restored.era.id, "guild-compact");
    assert.equal(restored.era.chosenTick, 80);
    assert.equal(restored.era.chosenYear, 1);
    assert.equal(restored.era.agenda.stage, 0);
    assert.equal(restored.era.agenda.total, undefined, "the stored agenda stays compact; the snapshot adds presentation fields");
    assert.equal(normalizeAmbitions({ era: { id: "ghost-era" } }).era, null);
    assert.equal(normalizeAmbitions({}).era, null);
});

test("old saves without an era agenda gain a clean first stage", () => {
    allAmbitionsFixture();
    const oldEra = { id: "common-weal", chosenTick: 60, chosenYear: 4 };
    const normalized = normalizeAmbitions({ completed: state.ambitions.completed, era: oldEra });
    assert.equal(normalized.era.agenda.stage, 0);
    assert.equal(normalized.era.agenda.complete, false);
    assert.equal(normalized.era.agenda.modifiers.foodDemandFactor, 1);
    assert.ok(Number.isFinite(normalized.era.agenda.baseline));
    assert.ok(Number.isFinite(normalized.era.agenda.target));
});

test("an era agenda stage completes once and feeds persistent modifiers forward", () => {
    allAmbitionsFixture();
    state.tick = 80;
    chooseCrownEra("common-weal");
    const first = getCrownEraSnapshot();
    assert.equal(first.agenda.stage, 0);
    assert.equal(first.agenda.total, 3);
    assert.equal(getAmbitionSnapshot().agenda, true);
    assert.equal(getAmbitionSnapshot().stageIndex, 0);

    state.resources.food = first.agenda.target + 10;
    state.tick = 100;
    const completed = updateAmbitions();
    assert.ok(completed.includes("era-agenda:common-granary"));

    const after = getCrownEraSnapshot();
    assert.equal(after.agenda.stage, 1);
    assert.equal(after.agenda.modifiers.foodDemandFactor, 0.97);
    assert.ok(after.agenda.target - after.agenda.value <= 5, "the second stage must use its own housing baseline, not the food value");
    assert.match(after.agenda.progressLabel, /housing$/);
    assert.equal(after.agenda.completed.length, 1);
    assert.equal(after.agenda.completed[0].id, "common-granary");
    assert.equal(getAmbitionSnapshot().stageIndex, 1);

    const restored = normalizeAmbitions(JSON.parse(JSON.stringify(state.ambitions)));
    assert.equal(restored.era.agenda.stage, 1);
    assert.equal(restored.era.agenda.modifiers.foodDemandFactor, 0.97);
    assert.equal(restored.era.agenda.completed[0].id, "common-granary");
});

test("common weal progresses through housing and population to agenda completion", () => {
    allAmbitionsFixture();
    state.tick = 80;
    chooseCrownEra("common-weal");
    let snapshot = getCrownEraSnapshot();
    state.resources.food = snapshot.agenda.target + 1;
    state.tick = 100;
    updateAmbitions();

    snapshot = getCrownEraSnapshot();
    assert.equal(snapshot.agenda.stage, 1);
    assert.equal(snapshot.agenda.id, "common-hearths");
    state.entities.push({ dead: false, type: TYPE.HOUSE, construction: { stage: 3 } });
    state.tick = 120;
    updateAmbitions();

    snapshot = getCrownEraSnapshot();
    assert.equal(snapshot.agenda.stage, 2);
    assert.equal(snapshot.agenda.title, "Every Hearth Filled");
    for (let index = 0; index < 4; index++) state.entities.push({ dead: false, type: TYPE.VILLAGER });
    state.tick = 140;
    updateAmbitions();

    snapshot = getCrownEraSnapshot();
    assert.equal(snapshot.agenda.complete, true);
    assert.equal(snapshot.agenda.completed.length, 3);
    assert.equal(snapshot.agenda.modifiers.foodDemandFactor, 0.9506);
    assert.equal(snapshot.agenda.modifiers.migrationFactor, 1.12);
});

test("guild compact progresses through taxes and treasury to agenda completion", () => {
    allAmbitionsFixture();
    state.tick = 80;
    chooseCrownEra("guild-compact");
    let snapshot = getCrownEraSnapshot();
    state.resources.gold = snapshot.agenda.target + 1;
    state.tick = 100;
    updateAmbitions();

    snapshot = getCrownEraSnapshot();
    assert.equal(snapshot.agenda.stage, 1);
    assert.match(snapshot.agenda.progressLabel, /taxes$/);
    state.economy.taxesCollected = snapshot.agenda.target + 1;
    state.tick = 120;
    updateAmbitions();

    snapshot = getCrownEraSnapshot();
    assert.equal(snapshot.agenda.stage, 2);
    assert.equal(snapshot.agenda.modifiers.taxEfficiency, 1.03);
    assert.equal(snapshot.agenda.modifiers.tradeFactor, 1.05);
    assert.match(snapshot.agenda.progressLabel, /gold$/);
    state.resources.gold = snapshot.agenda.target + 1;
    state.tick = 140;
    updateAmbitions();

    snapshot = getCrownEraSnapshot();
    assert.equal(snapshot.agenda.complete, true);
    assert.equal(snapshot.agenda.modifiers.taxEfficiency, 1.0609);
    assert.ok(Math.abs(snapshot.agenda.modifiers.tradeFactor - 1.0815) < 1e-9);
});

test("royal ascendancy changes the rebellion event modifier without a resource reward", () => {
    allAmbitionsFixture();
    state.tick = 80;
    chooseCrownEra("royal-ascendancy");
    let snapshot = getCrownEraSnapshot();
    state.politics.legitimacy = snapshot.agenda.target;
    state.tick = 100;
    updateAmbitions();

    snapshot = getCrownEraSnapshot();
    assert.equal(snapshot.agenda.stage, 1);
    state.resources.gold = snapshot.agenda.target + 1;
    state.tick = 120;
    updateAmbitions();

    snapshot = getCrownEraSnapshot();
    assert.equal(snapshot.agenda.stage, 2);
    assert.equal(snapshot.agenda.modifiers.unrestFactor, 0.9);
    assert.equal(state.politics.legitimacy, 87, "the first two stage rewards raise legitimacy");
    state.economy.taxesCollected = snapshot.agenda.target + 1;
    state.tick = 140;
    updateAmbitions();

    snapshot = getCrownEraSnapshot();
    assert.equal(snapshot.agenda.complete, true);
    assert.equal(snapshot.agenda.modifiers.unrestFactor, 0.9);
    assert.equal(snapshot.agenda.modifiers.tradeFactor, 1.02);
});
