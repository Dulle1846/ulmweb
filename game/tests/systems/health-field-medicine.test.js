import test from "node:test";
import assert from "node:assert/strict";
import { Entity, TYPE } from "../../js/core/types.js";
import { resetState, state } from "../../js/core/state.js";
import {
    FIELD_MEDICINE_LIMIT, getFieldMedicineRelief, getHealthSnapshot,
    getMortalityContext, normalizeHealthState, startOutbreak, updateHealth
} from "../../js/systems/health.js";

function resident(x, householdId = "field-house") {
    const person = new Entity(x, 1, TYPE.VILLAGER);
    person.householdId = householdId;
    return person;
}

function setup({ year = 2, tick = 1, treated = 0, seen = 0, medicine = 0, population = 2 } = {}) {
    resetState();
    state.year = year;
    state.tick = tick;
    state.hasStarted = true;
    state.entities = Array.from({ length: population }, (_, index) => resident(index + 1));
    state.health = normalizeHealthState({
        outbreakActive: true,
        disease: "field-fever",
        severity: 1,
        lastYear: year - 1,
        herbalTreated: treated,
        fieldTreatedSeen: seen,
        fieldMedicine: medicine
    });
    return state;
}

test("the annual audit remembers treated cases and then lets practice decay", () => {
    setup({ treated: 4, seen: 0 });
    updateHealth();
    assert.equal(state.health.fieldTreatedLastYear, 4);
    assert.equal(state.health.fieldTreatedSeen, 4);
    assert.equal(state.health.fieldMedicine, 8,
        "two residents with four treated cases should reach the annual gain cap");

    state.year = 3;
    state.health.lastYear = 2;
    updateHealth();
    assert.equal(state.health.fieldTreatedLastYear, 0);
    assert.equal(state.health.fieldMedicine, 5.76,
        "practice left untended must fade by the annual decay factor");
});

test("field medicine lowers outbreak risk, illness mortality and new outbreak severity", () => {
    setup({ medicine: FIELD_MEDICINE_LIMIT, population: 1 });
    const relief = getFieldMedicineRelief();
    assert.ok(relief.outbreakRiskFactor < 1);
    assert.ok(relief.mortalityRelief < 1);
    assert.equal(relief.severityRelief, 1);

    const context = getMortalityContext();
    assert.equal(context.fieldMedicineMemory, FIELD_MEDICINE_LIMIT);
    assert.equal(context.fieldMedicineRelief, relief.mortalityRelief);

    state.health.outbreakActive = false;
    state.health.severity = 0;
    startOutbreak({ severity: 3 });
    assert.equal(getHealthSnapshot().severity, 2,
        "high field practice should make a new severe outbreak one step milder");
});

test("a fresh snapshot exposes usable field-medicine numbers and the player's stock", () => {
    setup();
    state.forestGathering = { stock: { herbs: 2, lichen: 3 } };
    const snapshot = getHealthSnapshot();
    assert.equal(snapshot.fieldMedicine, 0);
    assert.equal(snapshot.fieldTreatedLastYear, 0);
    assert.equal(snapshot.fieldStock, 5);
    assert.equal(snapshot.fieldOutbreakReduction, 0);
    assert.equal(snapshot.fieldMortalityReduction, 0);
    assert.equal(snapshot.fieldSeverityRelief, 0);
});

test("legacy saves normalize to a neutral memory instead of replaying old treatments", () => {
    const legacy = normalizeHealthState({ herbalTreated: 12, herbalDoses: 8, lastYear: 4 });
    assert.equal(legacy.herbalTreated, 12);
    assert.equal(legacy.fieldTreatedSeen, 12);
    assert.equal(legacy.fieldMedicine, 0);
    assert.equal(legacy.fieldTreatedLastYear, 0);
});

test("field-medicine state survives a save-style normalization round-trip", () => {
    const saved = normalizeHealthState({
        herbalTreated: 9,
        fieldTreatedSeen: 7,
        fieldTreatedLastYear: 2,
        fieldMedicine: 13.5,
        history: [{
            year: 4, population: 3, sanitation: 40, sick: 1, cases: 2,
            outbreak: "field-fever", healers: 1, medicineStock: 2, medicinePrice: 2.3,
            fieldMedicine: 13.5, fieldTreated: 2
        }]
    });
    const restored = normalizeHealthState(JSON.parse(JSON.stringify(saved)));
    assert.equal(restored.fieldMedicine, 13.5);
    assert.equal(restored.fieldTreatedSeen, 7);
    assert.equal(restored.fieldTreatedLastYear, 2);
    assert.equal(restored.history[0].fieldMedicine, 13.5);
    assert.equal(restored.history[0].fieldTreated, 2);
});
