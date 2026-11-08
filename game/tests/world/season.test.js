import test from "node:test";
import assert from "node:assert/strict";
import { seasonIndexAt, seasonalState, seasonPhase, wrapDay } from "../../js/world/season.js";

test("the calendar wraps at 400 days and keeps four 100-day seasons", () => {
    assert.equal(wrapDay(0), 0);
    assert.equal(wrapDay(399), 399);
    assert.equal(wrapDay(400), 0);
    assert.equal(wrapDay(-1), 399);
    assert.equal(seasonIndexAt(0), 0);
    assert.equal(seasonIndexAt(99), 0);
    assert.equal(seasonIndexAt(100), 1);
    assert.equal(seasonIndexAt(250), 2);
    assert.equal(seasonIndexAt(399), 3);
    assert.equal(seasonPhase(250), 2.5);
});

test("summer never carries snow cover", () => {
    for (let day = 100; day < 200; day++) {
        assert.equal(seasonalState(day).snowCover, 0, "day " + day + " must stay snow free");
    }
});

test("snow accumulates through late autumn, peaks in winter and melts in spring", () => {
    assert.equal(seasonalState(250).snowCover, 0);
    assert.ok(seasonalState(280).snowCover > 0, "late autumn needs the first cover");
    assert.ok(seasonalState(320).snowCover > 0.99, "deep winter must be fully covered");
    assert.ok(seasonalState(0).snowCover > 0.5, "spring starts with snow still on the ground");
    assert.ok(seasonalState(20).snowCover < seasonalState(0).snowCover, "spring must melt");
    assert.equal(seasonalState(50).snowCover, 0);
    assert.equal(seasonalState(60).snowCover, 0);
});

test("leaves turn in autumn and the tint is gone before spring", () => {
    assert.equal(seasonalState(180).foliageTurn, 0);
    assert.ok(seasonalState(250).foliageTurn > 0.4);
    assert.ok(seasonalState(300).foliageTurn > 0.8);
    assert.ok(seasonalState(350).foliageTurn < 0.4, "midwinter must not still read as autumn");
    assert.equal(seasonalState(40).foliageTurn, 0);
});

test("spring green-up follows the melt and fades into summer", () => {
    assert.ok(seasonalState(0).greenUp > 0.4);
    assert.ok(seasonalState(30).greenUp > 0.9);
    assert.ok(seasonalState(150).greenUp < 0.2);
    assert.equal(seasonalState(250).greenUp, 0);
});

test("all seasonal curves change gradually from day to day", () => {
    const keys = ["snowCover", "foliageTurn", "greenUp", "warmth"];
    for (let day = 0; day < 400; day++) {
        const now = seasonalState(day);
        const next = seasonalState((day + 1) % 400);
        for (const key of keys) {
            const delta = Math.abs(next[key] - now[key]);
            assert.ok(delta < 0.05, key + " jumped " + delta.toFixed(3) + " between day " + day + " and " + (day + 1));
        }
    }
});
