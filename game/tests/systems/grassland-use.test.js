import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { grasslandUseAt, resetGrasslandUseCache } from "../../js/systems/grassland-use.js";

const building = (type, id, x, y) => ({
    id, type, x, y, dead: false,
    construction: { stage: 3, progress: 100 },
    isBuilding: () => true,
});

function setup(entities = [], year = 12) {
    resetState();
    resetGrasslandUseCache();
    state.entities = entities;
    state.year = year;
}

test("stables turn nearby meadow into grazed pasture", () => {
    setup([building(TYPE.STABLE, "stable", 10, 10)]);
    const use = grasslandUseAt(10, 10);
    assert.equal(use.state, "grazed");
    assert.equal(use.grazed, true);
    assert.equal(use.overgrazed, false);
    assert.ok(use.livestock.includes("cattle"));
    assert.match(use.label, /grazed/);
});

test("two close stables produce real overgrazing and bare soil", () => {
    setup([building(TYPE.STABLE, "stable-a", 10, 10), building(TYPE.STABLE, "stable-b", 11, 11)]);
    const use = grasslandUseAt(10, 10);
    assert.equal(use.state, "overgrazed");
    assert.equal(use.overgrazed, true);
    assert.equal(use.bareSoil, true);
    assert.ok(use.grazingPressure >= 0.8);
    assert.match(use.label, /damaged/);
});

test("farms mow a nearby meadow instead of grazing it", () => {
    setup([building(TYPE.FARM, "farm", 10, 10)]);
    const use = grasslandUseAt(11, 13);
    assert.equal(use.state, "mowed");
    assert.equal(use.mowed, true);
    assert.equal(use.grazed, false);
    assert.ok(use.mowingPressure > 0);
});

test("roads create paths and trampled ground", () => {
    setup([]);
    state.roads = { version: 1, revision: 4, tiles: { "10:10": { type: "dirt" } } };
    resetGrasslandUseCache();
    const use = grasslandUseAt(10, 10);
    assert.equal(use.path, true);
    assert.equal(use.trampled, true);
    assert.equal(use.bareSoil, true);
});

test("unmanaged ground becomes wild, then scrub and young woodland", () => {
    setup([], 14);
    const wild = grasslandUseAt(50, 50);
    assert.equal(wild.state, "wild");
    assert.equal(wild.wild, true);
    assert.ok(wild.yearsSinceUse >= 13);
    assert.equal(wild.encroachment, wild.yearsSinceUse >= 3 && wild.encroachment);
    assert.equal(wild.reforestation, wild.yearsSinceUse >= 9 && wild.reforestation);
});

test("the cache is invalidated when the built realm changes", () => {
    setup([], 4);
    const before = grasslandUseAt(10, 10);
    assert.equal(before.state, "wild");
    state.entities = [building(TYPE.STABLE, "stable", 10, 10)];
    const after = grasslandUseAt(10, 10);
    assert.equal(after.state, "grazed");
});
