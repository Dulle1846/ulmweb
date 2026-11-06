import test from "node:test";
import assert from "node:assert/strict";
import {
    validateSaveSnapshot, normalizeSaveSnapshot, SaveValidationError, SAVE_SCHEMA_VERSION
} from "../../js/core/save-validation.js";

const RESOURCE_KEYS = ["wood", "stone", "gold", "food"];
const VALID_RESOURCES = { wood: 10, stone: 5, gold: 4, food: 3 };

function validSnapshot(overrides = {}) {
    return {
        saveSchemaVersion: SAVE_SCHEMA_VERSION,
        worldSeed: 123456,
        entities: [],
        resources: { ...VALID_RESOURCES },
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
            if (expected.phase) assert.equal(expected.phase, error.phase);
            return true;
        }
    );
}

test("validation is side-effect free and normalization returns a new snapshot", () => {
    const snapshot = validSnapshot({
        resources: { wood: "15", stone: 0, gold: "2.5", food: 7 },
        incomeThisTick: { wood: "-1.5", stone: 0, gold: 2, food: 0 }
    });
    assert.equal(validateSaveSnapshot(snapshot), true);
    assert.equal(snapshot.resources.wood, "15", "validation must not normalize the input");
    assert.equal(snapshot.resources.gold, "2.5");
    assert.equal(snapshot.incomeThisTick.wood, "-1.5");

    const normalized = normalizeSaveSnapshot(snapshot);
    assert.notEqual(normalized, snapshot);
    assert.notEqual(normalized.resources, snapshot.resources);
    assert.notEqual(normalized.incomeThisTick, snapshot.incomeThisTick);
    assert.equal(normalized.resources.wood, 15);
    assert.equal(normalized.resources.gold, 2.5);
    assert.equal(normalized.incomeThisTick.wood, -1.5);
    assert.equal(snapshot.resources.wood, "15", "normalization must not touch the source map");
});

test("a snapshot without optional resource maps remains compatible", () => {
    const snapshot = validSnapshot({ resources: undefined, incomeThisTick: undefined });
    assert.equal(validateSaveSnapshot(snapshot), true);
    const normalized = normalizeSaveSnapshot(snapshot);
    assert.equal(normalized.resources, undefined);
    assert.equal(normalized.incomeThisTick, undefined);
});

test("every resource rejects negative numbers and negative numeric strings", () => {
    for (const key of RESOURCE_KEYS) {
        for (const value of [-1, "-1"]) {
            const resources = { ...VALID_RESOURCES, [key]: value };
            rejects(validSnapshot({ resources }), {
                code: "INVALID_RESOURCE_VALUE", field: key, phase: "resources"
            });
        }
    }
});

test("every resource rejects NaN and both infinities", () => {
    for (const key of RESOURCE_KEYS) {
        for (const value of [NaN, Infinity, -Infinity]) {
            const resources = { ...VALID_RESOURCES, [key]: value };
            rejects(validSnapshot({ resources }), {
                code: "INVALID_RESOURCE_VALUE", field: key, phase: "resources"
            });
        }
    }
});

test("every resource rejects null, booleans, empty and malformed strings", () => {
    for (const key of RESOURCE_KEYS) {
        for (const value of [null, true, false, "", " ", "15 wood", "1e3", "+15", ".5", "15.", {}, []]) {
            const resources = { ...VALID_RESOURCES, [key]: value };
            rejects(validSnapshot({ resources }), {
                code: "INVALID_RESOURCE_VALUE", field: key, phase: "resources"
            });
        }
    }
});

test("every resource rejects values outside the safe number range", () => {
    for (const key of RESOURCE_KEYS) {
        for (const value of [Number.MAX_SAFE_INTEGER + 1, String(Number.MAX_SAFE_INTEGER + 1)]) {
            const resources = { ...VALID_RESOURCES, [key]: value };
            rejects(validSnapshot({ resources }), {
                code: "RESOURCE_OUT_OF_RANGE", field: key, phase: "resources"
            });
        }
    }
});

test("every resource accepts and normalizes valid numeric strings and decimals", () => {
    for (const key of RESOURCE_KEYS) {
        for (const [value, expected] of [["12", 12], ["2.5", 2.5], [0, 0], [0.25, 0.25]]) {
            const snapshot = validSnapshot({ resources: { ...VALID_RESOURCES, [key]: value } });
            assert.equal(validateSaveSnapshot(snapshot), true);
            assert.equal(normalizeSaveSnapshot(snapshot).resources[key], expected);
        }
    }
});

test("unknown resource keys are rejected and missing optional keys keep their zero fallback", () => {
    rejects(validSnapshot({ resources: { ...VALID_RESOURCES, silver: 9 } }), {
        code: "UNKNOWN_RESOURCE_KEY", field: "resources.silver", phase: "resources"
    });
    const snapshot = validSnapshot({ resources: { wood: 1 } });
    assert.equal(validateSaveSnapshot(snapshot), true);
    const normalized = normalizeSaveSnapshot(snapshot);
    assert.equal(normalized.resources.wood, 1);
    assert.equal(normalized.resources.stone, undefined);
    assert.equal(normalized.resources.gold, undefined);
    assert.equal(normalized.resources.food, undefined);
});

test("a resource map must be a plain object", () => {
    for (const value of [null, [], "resources", 4]) {
        rejects(validSnapshot({ resources: value }), { code: "INVALID_RESOURCE_MAP", phase: "resources" });
    }
});

test("invalid normalization never partially mutates the source snapshot", () => {
    const snapshot = validSnapshot({
        resources: { wood: "15", stone: -1, gold: "2.5", food: 3 }
    });
    assert.throws(() => normalizeSaveSnapshot(snapshot), SaveValidationError);
    assert.equal(snapshot.resources.wood, "15");
    assert.equal(snapshot.resources.gold, "2.5");
    assert.equal(snapshot.resources.stone, -1);
});

test("unknown income keys are rejected and missing optional income keys remain absent", () => {
    rejects(validSnapshot({ incomeThisTick: { ...VALID_RESOURCES, silver: 0 } }), {
        code: "UNKNOWN_RESOURCE_KEY", field: "incomeThisTick.silver", phase: "resources"
    });
    const snapshot = validSnapshot({ incomeThisTick: { wood: -1 } });
    assert.equal(validateSaveSnapshot(snapshot), true);
    const normalized = normalizeSaveSnapshot(snapshot);
    assert.equal(normalized.incomeThisTick.wood, -1);
    assert.equal(normalized.incomeThisTick.stone, undefined);
    assert.equal(normalized.incomeThisTick.gold, undefined);
    assert.equal(normalized.incomeThisTick.food, undefined);
});

test("incomeThisTick accepts legitimate negative net values and normalizes valid strings", () => {
    const snapshot = validSnapshot({ incomeThisTick: { wood: "-2", stone: -0.5, gold: 0, food: 0 } });
    assert.equal(validateSaveSnapshot(snapshot), true);
    const normalized = normalizeSaveSnapshot(snapshot);
    assert.equal(normalized.incomeThisTick.wood, -2);
    assert.equal(normalized.incomeThisTick.stone, -0.5);
});

test("invalid incomeThisTick values are rejected for every resource", () => {
    for (const key of RESOURCE_KEYS) {
        for (const value of [NaN, Infinity, -Infinity, null, "", "bad", Number.MAX_SAFE_INTEGER + 1]) {
            const incomeThisTick = { wood: 0, stone: 0, gold: 0, food: 0, [key]: value };
            rejects(validSnapshot({ incomeThisTick }), {
                code: value === Number.MAX_SAFE_INTEGER + 1 ? "RESOURCE_OUT_OF_RANGE" : "INVALID_RESOURCE_VALUE",
                field: "incomeThisTick." + key,
                phase: "resources"
            });
        }
    }
});

test("newer save schemas are rejected with a typed error", () => {
    rejects(validSnapshot({ saveSchemaVersion: SAVE_SCHEMA_VERSION + 1 }), {
        code: "NEWER_SAVE_VERSION", field: "saveSchemaVersion", phase: "structure"
    });
});
