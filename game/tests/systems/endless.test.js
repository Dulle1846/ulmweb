import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import {
    ENDLESS_AGE_YEARS,
    ENDLESS_HISTORY_LIMIT,
    ENDLESS_MORALE_RESET,
    createEndlessState,
    endlessAgeForYear,
    getEndlessSnapshot,
    holdEndlessKeep,
    isEndlessEnabled,
    normalizeEndlessState,
    recoverEndlessMorale,
    updateEndlessRealm,
    updateEndlessRelief
} from "../../js/systems/endless.js";

function realmAt(year = 1, tick = 0) {
    resetState();
    state.hasStarted = true;
    state.year = year;
    state.tick = tick;
    state.morale = 72;
    state.endless = createEndlessState({ enabled: true });
    return state.endless;
}

test("endless realms are enabled by default and start in the first age", () => {
    resetState();
    assert.equal(isEndlessEnabled(), true);
    const snapshot = getEndlessSnapshot();
    assert.equal(snapshot.enabled, true);
    assert.equal(snapshot.age, 1);
    assert.equal(snapshot.nextAgeYear, ENDLESS_AGE_YEARS + 1);
    assert.match(snapshot.label, /ENDLESS · AGE 1/);
});

test("endless ages advance every twenty-five years, including skipped ages", () => {
    const endless = realmAt(1);
    state.year = 26;
    state.tick = 10_000;
    assert.equal(updateEndlessRealm(), 2);
    assert.equal(endless.age, 2);
    assert.equal(endless.ageStartedYear, 26);
    assert.equal(updateEndlessRealm(), null, "the same age must be a no-op");
    state.year = 76;
    assert.equal(updateEndlessRealm(), 4);
    assert.equal(endless.age, 4);
    assert.equal(endless.history.length, 3, "ages two through four must be recorded");
    assert.ok(endless.history.every(entry => entry.kind === "age"));
});

test("ages are derived from the calendar instead of trusting a stale save", () => {
    state.year = 51;
    const endless = normalizeEndlessState({ version: 1, enabled: false, age: 1, bestYear: 2, history: [] }, 51);
    assert.equal(endless.enabled, false);
    assert.equal(endless.age, 3);
    assert.equal(endless.ageStartedYear, 51);
    assert.equal(endless.bestYear, 51);
    assert.equal(endlessAgeForYear(1), 1);
    assert.equal(endlessAgeForYear(26), 2);
    assert.equal(endlessAgeForYear(10_001), 401);
});

test("a morale collapse is recovered without a terminal game over", () => {
    const endless = realmAt(3, 900);
    state.morale = 4;
    state.politics.legitimacy = 50;
    assert.equal(recoverEndlessMorale(), true);
    assert.equal(state.gameOver, false);
    assert.equal(state.morale, ENDLESS_MORALE_RESET);
    assert.equal(state.politics.legitimacy, 47);
    assert.equal(endless.collapses, 1);
    assert.equal(endless.rescues, 1);
    assert.equal(endless.history[0].kind, "rescue");

    state.morale = 4;
    assert.equal(recoverEndlessMorale(), false, "the cooldown must stop daily rescue spam");
    assert.equal(endless.rescues, 1);
    state.tick = 1_300;
    assert.equal(recoverEndlessMorale(), true);
    assert.equal(endless.rescues, 2);
});

test("endless relief restores a household, essential production and stores before extinction", () => {
    const endless = realmAt(2, 800);
    state.city = { needs: { summary: { firewoodStock: 10 } } };
    state.resources.food = 0;
    state.resources.wood = 0;
    state.resources.stone = 0;
    state.entities = [{ type: TYPE.KEEP, x: 80, y: 80, dead: false, hp: 100, maxHp: 100, isBuilding: () => true }];

    assert.equal(updateEndlessRelief(), true);
    assert.equal(endless.reliefs, 1);
    assert.equal(endless.lastReliefTick, 800);
    assert.equal(endless.history[0].kind, "relief");
    assert.ok(state.resources.food >= 320);
    assert.ok(state.resources.wood >= 200);
    assert.ok(state.entities.filter(entity => !entity.dead && entity.type === TYPE.VILLAGER).length >= 6);
    assert.ok(state.entities.some(entity => !entity.dead && entity.type === TYPE.FARM));
    assert.ok(state.entities.some(entity => !entity.dead && entity.type === TYPE.BAKERY));
    assert.ok(state.entities.some(entity => !entity.dead && entity.type === TYPE.SAWMILL));

    assert.equal(updateEndlessRelief(), false, "the two-year cooldown must bound relief");
    assert.equal(endless.reliefs, 1);
});

test("classic realms never receive endless relief", () => {
    resetState();
    state.hasStarted = true;
    state.tick = 800;
    state.endless = createEndlessState({ enabled: false });
    state.entities = [{ type: TYPE.KEEP, x: 80, y: 80, dead: false }];
    assert.equal(updateEndlessRelief(), false);
    assert.equal(state.endless.reliefs, 0);
});

test("a keep at zero health is held instead of ending the realm", () => {
    const endless = realmAt(2);
    const keep = { type: 999, hp: 0, maxHp: 240, dead: true };
    assert.equal(holdEndlessKeep(keep), true);
    assert.equal(keep.dead, false);
    assert.equal(keep.hp, 84);
    assert.equal(endless.keepHolds, 1);
    assert.equal(endless.history[0].kind, "keep");
});

test("classic realms keep the original finite-defeat behaviour", () => {
    resetState();
    state.endless = createEndlessState({ enabled: false });
    state.tick = 900;
    state.morale = 4;
    assert.equal(isEndlessEnabled(), false);
    assert.equal(recoverEndlessMorale(), false);
    assert.equal(holdEndlessKeep({ hp: 0, maxHp: 100, dead: true }), false);
    assert.equal(getEndlessSnapshot().label, "CLASSIC REALM · FINITE DEFEAT");
});

test("malformed endless saves normalize to a bounded, recoverable state", () => {
    resetState();
    state.year = 12;
    const endless = normalizeEndlessState({
        version: 99,
        enabled: true,
        age: -8,
        bestYear: "not-a-year",
        collapses: -4,
        rescues: 1e12,
        keepHolds: 2.7,
        lastRescueTick: -9,
        reliefs: -4,
        lastReliefTick: -9,
        history: [
            { kind: "rescue", age: 1, year: 2, tick: 10 },
            { kind: "unknown", age: 1, year: 2, tick: 10 },
            null,
            "not-an-entry"
        ]
    }, 12);
    assert.equal(endless.age, 1);
    assert.equal(endless.bestYear, 12);
    assert.equal(endless.collapses, 0);
    assert.equal(endless.keepHolds, 2);
    assert.equal(endless.lastRescueTick, 0);
    assert.equal(endless.reliefs, 0);
    assert.equal(endless.lastReliefTick, 0);
    assert.equal(endless.history.length, 1);
    assert.equal(endless.history[0].kind, "rescue");
});

test("endless history stays bounded across thousands of ages", () => {
    const endless = realmAt(1);
    state.year = 1 + ENDLESS_AGE_YEARS * 500;
    updateEndlessRealm();
    assert.equal(endless.age, 501);
    assert.equal(endless.history.length, ENDLESS_HISTORY_LIMIT);
    assert.equal(endless.history[0].kind, "age");
});
