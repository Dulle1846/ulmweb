import test from "node:test";
import assert from "node:assert/strict";
import { state, resetState } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { ensureInventory } from "../../js/systems/logistics.js";
import { runGrandConsumer, updateGrandConsumers } from "../../js/systems/grand-consumers.js";

function plainBuilding(type, id) {
    return {
        id, type, x: 10, y: 10, dead: false,
        construction: { stage: 3, progress: 100 },
        hp: 200, maxHp: 200,
        isBuilding() { return true; },
    };
}

test("the shipyard turns real naval stores into a fleet and a trade bonus", () => {
    resetState();
    state.hasStarted = true;
    state.tick = 60;
    state.resources = { wood: 0, stone: 0, gold: 0, food: 0 };
    state.military = { ships: 0 };
    const shipyard = plainBuilding(TYPE.SHIPYARD, "shipyard-1");
    ensureInventory(shipyard);
    Object.assign(shipyard.inventory.input, { shipTimber: 2, pitch: 1, tar: 1, charcoal: 1, potash: 1 });
    state.entities = [shipyard];
    const result = runGrandConsumer(shipyard, { force: true });
    assert.equal(result.ok, true, result.reason);
    assert.equal(state.military.ships, 1);
    assert.equal(shipyard.inventory.input.shipTimber, 0);
    assert.equal(shipyard.inventory.input.pitch, 0);
    assert.equal(result.ships, 1);
    assert.equal(updateGrandConsumers(), false, "the daily runtime is tick-guarded");
});

test("the paper mill consumes paper, potash and charcoal into the research reserve", () => {
    resetState();
    state.hasStarted = true;
    state.tick = 60;
    state.economy = {};
    state.research = { reserve: 0 };
    const mill = plainBuilding(TYPE.PAPER_MILL, "paper-mill-1");
    ensureInventory(mill);
    Object.assign(mill.inventory.input, { paper: 2, potash: 1, charcoal: 1 });
    state.entities = [mill];
    const result = runGrandConsumer(mill, { force: true });
    assert.equal(result.ok, true, result.reason);
    assert.ok(state.research.reserve >= 8);
    assert.equal(mill.inventory.input.paper, 0);
    assert.equal(mill.inventory.input.potash, 0);
});

test("a starved grand consumer consumes nothing and reports its shortage", () => {
    resetState();
    state.hasStarted = true;
    state.tick = 60;
    state.economy = {};
    const mill = plainBuilding(TYPE.PAPER_MILL, "paper-mill-starved");
    ensureInventory(mill);
    mill.inventory.input.paper = 1;
    state.entities = [mill];
    const result = runGrandConsumer(mill, { force: true });
    assert.equal(result.ok, false);
    assert.match(result.reason, /Waiting for/);
    assert.equal(mill.inventory.input.paper, 1);
});
