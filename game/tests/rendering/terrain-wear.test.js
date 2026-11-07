import test from "node:test";
import assert from "node:assert/strict";
import {
    advanceWearField, buildWearTargets, createWearField, encodeWearField,
    stampWearSpot, wearGridSize, WEAR_DEFAULTS,
} from "../../js/presentation/rendering/terrain-wear.js";

test("the wear grid follows the world size and clamps bad input", () => {
    assert.deepEqual(wearGridSize(160, 120, 2), { columns: 320, rows: 240, scale: 2 });
    const fallback = wearGridSize(10, 10, "nonsense");
    assert.equal(fallback.scale, WEAR_DEFAULTS.scale);
    assert.equal(fallback.columns, 20);
    assert.ok(wearGridSize(0.2, 0.2).columns >= 1);
});

test("a spot is strongest in its centre and absent outside its radius", () => {
    const columns = 24;
    const rows = 24;
    const targets = createWearField(columns, rows);
    stampWearSpot(targets, columns, rows, 12, 12, 6, 0.8);
    assert.ok(targets[12 * columns + 12] > 0.6, "centre " + targets[12 * columns + 12]);
    assert.equal(targets[0], 0);
    assert.equal(targets[columns - 1], 0);
    const edgeDistance = targets[12 * columns + 17];
    assert.ok(edgeDistance < targets[12 * columns + 12], "wear fades towards the rim");
});

test("roads and buildings stamp trodden ground deterministically", () => {
    const columns = 40;
    const rows = 40;
    const sources = {
        roads: [{ x: 4, y: 5 }, { x: 6, y: 5 }],
        buildings: [{ x: 12, y: 12, radius: 2.2, strength: 0.5, field: true }],
    };
    const first = buildWearTargets(createWearField(columns, rows), columns, rows, sources, 2);
    const second = buildWearTargets(createWearField(columns, rows), columns, rows, sources, 2);
    assert.deepEqual([...first], [...second]);
    assert.ok(first[Math.round(5.5 * 2) * columns + Math.round(4.5 * 2)] > 0.3, "road tiles leave wear");
    assert.ok(first[12 * 2 * columns + 12 * 2] > 0.3, "buildings leave wear");
    assert.equal(first[0], 0);
});

test("wear builds up towards its source and recovers much more slowly", () => {
    const field = new Float32Array([0, 0, 0]);
    const targets = new Float32Array([0.6, 0.3, 0]);
    const built = advanceWearField(field, targets, 1);
    assert.ok(Math.abs(field[0] - 0.3) < 1e-5, "one second of rise: " + field[0]);
    assert.ok(built > 0);
    advanceWearField(field, targets, 1);
    assert.ok(Math.abs(field[0] - 0.6) < 1e-5, "wear must stop at its source, got " + field[0]);
    assert.equal(field[2], 0, "ground without a source stays clean");

    // Removing the source fades the ground instead of wiping it instantly.
    const cleared = buildWearTargets(createWearField(3, 1), 3, 1, { roads: [], buildings: [] }, 1);
    advanceWearField(field, cleared, 1);
    assert.ok(field[0] > 0.55, "wear must recover slowly, got " + field[0]);
    assert.ok(field[0] < 0.6, "wear must still shrink, got " + field[0]);
});

test("encoding writes opaque single-channel wear bytes", () => {
    const bytes = new Uint8Array(3 * 4);
    encodeWearField(new Float32Array([0, 0.5, 1]), bytes);
    assert.deepEqual([...bytes], [0, 0, 0, 255, 128, 128, 128, 255, 255, 255, 255, 255]);
    assert.throws(() => encodeWearField(new Float32Array([0.2]), new Uint8Array(2)), /four bytes per cell/);
});
