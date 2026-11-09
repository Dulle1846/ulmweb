import test from "node:test";
import assert from "node:assert/strict";
import {
    forestLineOfSightBlocked, forestSightBlock, forestStandAt,
} from "../../js/world/forest-ecology.js";

const context = (overrides = {}) => ({
    seed: 20261109, moisture: 0.56, temperature: 0.55, height: 0.55,
    climate: "temperate", forests: 64, stockRatio: 1, rockLine: 0.92,
    ...overrides,
});

function findStand(predicate) {
    for (const temperature of [0.3, 0.36, 0.44, 0.55]) {
        for (const moisture of [0.4, 0.5, 0.62, 0.76]) {
            for (const height of [0.5, 0.7, 0.84, 0.91]) {
                for (let y = 0; y < 72; y += 3) {
                    for (let x = 0; x < 72; x += 3) {
                        const stand = forestStandAt(x + 0.5, y + 0.5, context({ temperature, moisture, height }));
                        if (stand.forest && predicate(stand)) return stand;
                    }
                }
            }
        }
    }
    return null;
}

test("dense conifer cover produces a sight block while open pine does not", () => {
    const dense = findStand(stand => stand.conifer && stand.density >= 0.6 && stand.groundShade >= 0.75);
    const open = findStand(stand => stand.type === "pinewood" && stand.density <= 0.5);
    assert.ok(dense, "a dense conifer stand is required");
    assert.ok(open, "an open pine stand is required");
    assert.ok(forestSightBlock(dense) > 0.15);
    assert.equal(forestSightBlock(open), 0);
});

test("the same line is blocked through dense cover and open through air", () => {
    const blocked = (x, y) => (x === 3 && y === 0 ? 0.42 : 0);
    const open = () => 0;
    assert.equal(forestLineOfSightBlocked(0.5, 0.5, 6.5, 0.5, blocked), true);
    assert.equal(forestLineOfSightBlocked(0.5, 0.5, 6.5, 0.5, open), false);
    assert.equal(forestLineOfSightBlocked(0.5, 0.5, 1.5, 0.5, blocked), false,
        "a target inside the readable near field is never cut off");
});

test("the line test skips the target tile and stays bounded", () => {
    const behind = (x, y) => (x === 5 ? 0.5 : 0);
    assert.equal(forestLineOfSightBlocked(0.5, 0.5, 5.5, 0.5, behind), false,
        "a target standing in the last tile must not be hidden by its own tile");
    assert.equal(forestLineOfSightBlocked(0.5, 0.5, 8.5, 0.5, behind), true);
    assert.equal(forestLineOfSightBlocked(0.5, 0.5, 6.5, 0.5, null), false);
});
