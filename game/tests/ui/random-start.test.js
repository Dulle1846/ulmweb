import test from "node:test";
import assert from "node:assert/strict";
import { buildRandomStart } from "../../js/app/start-randomizer.js";
import {
    CULTURES, RELIGIONS, TRADITIONS, LEGAL_TRADITIONS,
    LEGITIMACY_DOCTRINES, FOUNDING_PROFILES, BANNERS, EMBLEMS
} from "../../js/systems/identity.js";
import { GOVERNMENT_FORMS } from "../../js/systems/government.js";
import { WORLD_SIZES, WORLD_SHAPES, CLIMATES } from "../../js/world/terrain-model.js";

function seeded(seed) {
    let value = seed >>> 0;
    return () => {
        value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
        return value / 4294967296;
    };
}

test("a random start fills every existing identity, government and world choice", () => {
    const choices = buildRandomStart({ random: seeded(7), seed: 20261117, playerName: "Random Audit" });
    assert.equal(choices.seed, 20261117);
    assert.equal(choices.playerName, "Random Audit");
    assert.ok(Object.hasOwn(CULTURES, choices.identity.culture));
    assert.ok(Object.hasOwn(RELIGIONS, choices.identity.religion));
    assert.ok(Object.hasOwn(TRADITIONS, choices.identity.tradition));
    assert.ok(Object.hasOwn(LEGAL_TRADITIONS, choices.identity.law));
    assert.ok(Object.hasOwn(LEGITIMACY_DOCTRINES, choices.identity.legitimacy));
    assert.ok(Object.hasOwn(FOUNDING_PROFILES, choices.identity.startProfile));
    assert.ok(BANNERS.includes(choices.identity.banner));
    assert.ok(EMBLEMS.includes(choices.identity.emblem));
    assert.ok(Object.hasOwn(GOVERNMENT_FORMS, choices.government));
    assert.ok(Object.hasOwn(WORLD_SIZES, choices.worldOptions.size));
    assert.ok(WORLD_SHAPES.some(shape => shape.id === choices.worldOptions.shape));
    assert.ok(CLIMATES.some(climate => climate.id === choices.worldOptions.climate));
    assert.ok(choices.identity.kingdomName.length > 0);
    assert.match(choices.identity.dynastyName, /^House /);
    assert.ok(choices.identity.rulerTitle.length > 0);
    assert.ok(choices.identity.background.length > 0);
    assert.equal(typeof choices.endless, "boolean");
});

test("every random geography slider stays inside the playable range", () => {
    const choices = buildRandomStart({ random: seeded(19), seed: 4 });
    for (const key of ["landmass", "ruggedness", "forests", "water", "fertility", "resources", "mountains", "rivers", "lakes", "coastline", "snow", "wetlands", "aridity"]) {
        assert.ok(Number.isInteger(choices.worldOptions[key]));
        assert.ok(choices.worldOptions[key] >= 25 && choices.worldOptions[key] <= 80, key + " out of range");
    }
});

test("identical random input is deterministic and a blank player name is generated", () => {
    const first = buildRandomStart({ random: seeded(31), seed: 99 });
    const replay = buildRandomStart({ random: seeded(31), seed: 99 });
    assert.deepEqual(first, replay);
    assert.ok(first.playerName.length > 0);
    assert.equal(first.seed, 99);
});

test("a generated seed is positive and stays in the safe range", () => {
    const choices = buildRandomStart({ random: seeded(43) });
    assert.ok(Number.isSafeInteger(choices.seed));
    assert.ok(choices.seed > 0);
    assert.ok(choices.seed <= 2_147_483_000);
});
