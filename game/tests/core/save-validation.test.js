import test from "node:test";
import assert from "node:assert/strict";
import { validateSaveSnapshot, SaveValidationError, SAVE_SCHEMA_VERSION } from "../../js/core/save-validation.js";

function validSnapshot(overrides = {}) {
    return {
        saveSchemaVersion: SAVE_SCHEMA_VERSION,
        worldSeed: 123456,
        entities: [],
        resources: { wood: 10, stone: 5, gold: 4, food: 3 },
        ...overrides
    };
}

function rejects(snapshot, expected = {}) {
    assert.throws(
        () => validateSaveSnapshot(snapshot),
        error => {
            assert.ok(error instanceof SaveValidationError, "validation must use the typed save error");
            if (expected.code) assert.equal(error.code, expected.code);
            if (expected.field) assert.equal(error.field, expected.field);
            if (expected.phase) assert.equal(error.phase, expected.phase);
            return true;
        }
    );
}

test("valid save resources are accepted and numeric strings normalize in place", () => {
    const snapshot = validSnapshot({
        resources: { wood: "15", stone: 0, gold: "2.5", food: 7 },
        incomeThisTick: { wood: "-1.5", stone: 0, gold: 2, food: 0 }
    });
    assert.equal(validateSaveSnapshot(snapshot), true);
    assert.equal(snapshot.resources.wood, 15);
    assert.equal(snapshot.resources.gold, 2.5);
    assert.equal(snapshot.incomeThisTick.wood, -1.5);
});

test("a snapshot without optional resource maps remains compatible", () => {
    const snapshot = validSnapshot({ resources: undefined, incomeThisTick: undefined });
    assert.equal(validateSaveSnapshot(snapshot), true);
});

test("negative resource numbers are rejected without clamping them to zero", () => {
    rejects(validSnapshot({ resources: { wood: -1, stone: 5, gold: 4, food: 3 } }), {
        code: "INVALID_RESOURCE_VALUE", field: "wood", phase: "resources"
    });
});

test("negative numeric strings are rejected", () => {
    const snapshot = validSnapshot({ resources: { wood: "-50", stone: 5, gold: 4, food: 3 } });
    rejects(snapshot, { code: "INVALID_RESOURCE_VALUE", field: "wood", phase: "resources" });
    assert.equal(snapshot.resources.wood, "-50", "rejected values must not be silently replaced");
});

test("NaN and infinities are rejected for every resource", () => {
    for (const value of [NaN, Infinity, -Infinity]) {
        rejects(validSnapshot({ resources: { wood: value, stone: 5, gold: 4, food: 3 } }), {
            code: "INVALID_RESOURCE_VALUE", field: "wood", phase: "resources"
        });
    }
});

test("malformed, empty and non-numeric resource strings are rejected", () => {
    for (const value of ["", " ", "15 wood", "1e3", "+15", ".5", "15.", null, true, {}, []]) {
        rejects(validSnapshot({ resources: { wood: value, stone: 5, gold: 4, food: 3 } }), {
            code: "INVALID_RESOURCE_VALUE", field: "wood", phase: "resources"
        });
    }
});

test("out-of-range and unknown resource values are rejected", () => {
    rejects(validSnapshot({ resources: { wood: Number.MAX_SAFE_INTEGER + 1, stone: 5, gold: 4, food: 3 } }), {
        code: "RESOURCE_OUT_OF_RANGE", field: "wood", phase: "resources"
    });
    rejects(validSnapshot({ resources: { wood: 1, stone: 5, gold: 4, food: 3, silver: 9 } }), {
        code: "UNKNOWN_RESOURCE_KEY", field: "resources.silver", phase: "resources"
    });
});

test("a resource map must be a plain object", () => {
    for (const value of [null, [], "resources", 4]) {
        rejects(validSnapshot({ resources: value }), { code: "INVALID_RESOURCE_MAP", phase: "resources" });
    }
});

test("incomeThisTick accepts legitimate negative net values but rejects invalid numbers", () => {
    assert.equal(validateSaveSnapshot(validSnapshot({ incomeThisTick: { wood: -2, stone: 0, gold: 0, food: 0 } })), true);
    rejects(validSnapshot({ incomeThisTick: { wood: NaN, stone: 0, gold: 0, food: 0 } }), {
        code: "INVALID_RESOURCE_VALUE", field: "incomeThisTick.wood", phase: "resources"
    });
});

test("newer save schemas are rejected with a typed error", () => {
    rejects(validSnapshot({ saveSchemaVersion: SAVE_SCHEMA_VERSION + 1 }), {
        code: "NEWER_SAVE_VERSION", field: "saveSchemaVersion", phase: "structure"
    });
});
