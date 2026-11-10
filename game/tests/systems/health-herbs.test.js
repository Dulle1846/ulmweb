import test from "node:test";
import assert from "node:assert/strict";
import { TYPE } from "../../js/core/types.js";
import { resetState, state } from "../../js/core/state.js";
import {
    applyHerbalRemedy, getHealthSnapshot, updateHealth, HEALTH_INTERVAL,
} from "../../js/systems/health.js";

function setup({ herbs = 3, lichen = 0, tick = 20 } = {}) {
    resetState();
    state.tick = tick;
    state.dayOfYear = 140;
    state.entities = [{
        id: 1, type: TYPE.VILLAGER, x: 2, y: 2, householdId: "test-household",
        illnessStartedTick: 0, illnessUntilTick: 120, illnessSeverity: 2,
    }];
    state.health = {
        outbreakActive: true, disease: "common-fever", severity: 2,
        containment: 0, cases: 1, recovered: 0, outbreaks: 1,
        lastUpdateTick: 0, startedAtTick: 0,
    };
    state.forestGathering = {
        version: 1, stock: { herbs, lichen }, totalGathered: {}, quality: {}, history: [], lastGather: {},
    };
    return state.entities[0];
}

test("stored herbs measurably shorten illness and reduce severity", () => {
    const patient = setup({ herbs: 3 });
    const before = patient.illnessUntilTick;
    const result = applyHerbalRemedy(2);
    assert.equal(result.ok, true);
    assert.equal(result.used[0].id, "herbs");
    assert.equal(result.used[0].amount, 2);
    assert.ok(result.reliefTicks >= 20);
    assert.ok(patient.illnessUntilTick <= before - 20,
        "two medicinal units must remove a measurable amount of illness time");
    assert.ok(state.health.severity < 2);
    assert.equal(state.forestGathering.stock.herbs, 1);
    assert.equal(getHealthSnapshot().herbalDoses, 2);
    assert.equal(getHealthSnapshot().herbalTreated, 1);
});

test("the daily health update consumes medicine instead of leaving it as trade stock", () => {
    const patient = setup({ herbs: 2, tick: HEALTH_INTERVAL });
    const before = patient.illnessUntilTick;
    updateHealth();
    assert.ok(patient.illnessUntilTick < before);
    assert.equal(state.forestGathering.stock.herbs, 0,
        "the public health pass must remove the doses it used");
    assert.equal(state.health.herbalDoses, 2);
    assert.ok(state.health.severity < 2);
    const noMedicine = setup({ herbs: 0, tick: HEALTH_INTERVAL });
    noMedicine.illnessUntilTick = 120;
    updateHealth();
    assert.equal(noMedicine.illnessUntilTick, 120,
        "without a remedy the untreated illness duration must remain unchanged");
});

test("lichen is a weaker fallback medicine and never creates stock", () => {
    const patient = setup({ herbs: 0, lichen: 2 });
    const before = patient.illnessUntilTick;
    const result = applyHerbalRemedy(2);
    assert.equal(result.ok, true);
    assert.equal(result.used[0].id, "lichen");
    assert.ok(patient.illnessUntilTick < before);
    assert.equal(state.forestGathering.stock.lichen, 0);
    assert.equal(applyHerbalRemedy(2).ok, false, "an empty store cannot heal anyone");
});
