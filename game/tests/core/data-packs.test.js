import test from "node:test";
import assert from "node:assert/strict";
import {
    DATA_PACK_FORMAT, DATA_PACK_GAME_VERSION, DATA_PACK_LIMIT, DATA_PACK_MAX_BYTES,
    getDataPackRegionLabel, getDataPackScenarios, getDataPackSummary, installDataPack,
    parseDataPackText, readDataPackLibrary, removeDataPack, validateDataPack
} from "../../js/core/data-packs.js";

function memoryStorage() {
    const values = new Map();
    return {
        getItem(key) { return values.has(key) ? values.get(key) : null; },
        setItem(key, value) { values.set(key, String(value)); },
        removeItem(key) { values.delete(key); },
        values
    };
}

function scenario(id = "long-thaw") {
    return {
        id,
        name: "The Long Thaw",
        description: "A late spring opens the northern road before the granary is ready.",
        difficulty: "NORMAL",
        recommendedClimate: "northern",
        startDay: 0,
        resources: { food: 90, wood: 150, stone: 80, gold: 70 },
        morale: 60,
        legitimacy: 55,
        objective: { type: "food", target: 120, deadlineYear: 2, deadlineDay: 0 },
        reward: { food: 30, morale: 2 },
        failure: { morale: -3 }
    };
}

function pack(overrides = {}) {
    return {
        format: DATA_PACK_FORMAT,
        formatVersion: 1,
        id: "northern-lore",
        name: "Northern Lore",
        author: "Open Hearth",
        version: "1.0.0",
        gameVersion: DATA_PACK_GAME_VERSION,
        description: "A small local content pack for the northern frontier.",
        scenarios: [scenario()],
        regions: [{ id: "northmere-pines", name: "Vane Pines" }],
        ...overrides
    };
}

test("a data pack validates into namespaced scenarios and known province labels", () => {
    const normalized = validateDataPack(pack());
    assert.equal(normalized.id, "northern-lore");
    assert.equal(normalized.scenarios.length, 1);
    assert.equal(normalized.scenarios[0].id, "northern-lore-long-thaw");
    assert.equal(normalized.scenarios[0].objective.target, 120);
    assert.equal(normalized.regions[0].name, "Vane Pines");
    const storage = memoryStorage();
    const installed = installDataPack(pack(), storage);
    assert.equal(installed.ok, true);
    const scenarios = getDataPackScenarios(storage);
    assert.equal(scenarios.length, 1);
    assert.equal(scenarios[0].id, "northern-lore-long-thaw");
    assert.equal(scenarios[0].packName, "Northern Lore");
    assert.equal(getDataPackRegionLabel("northmere-pines", storage), "Vane Pines");
    assert.equal(getDataPackRegionLabel("crown-heartland", storage), null);
    assert.deepEqual(getDataPackSummary(storage).map(row => row.name), ["Northern Lore"]);
    assert.equal(readDataPackLibrary(storage).length, 1);
});

test("a pack is parsed from bounded JSON text and rejected when malformed", () => {
    const parsed = parseDataPackText(JSON.stringify(pack()));
    assert.equal(parsed.id, "northern-lore");
    assert.throws(() => parseDataPackText("{bad json"), /valid JSON/);
    assert.throws(() => parseDataPackText("x".repeat(DATA_PACK_MAX_BYTES + 1)), /larger than/);
});

test("pack manifests reject foreign fields, markup, future versions and unknown provinces", () => {
    assert.throws(() => validateDataPack(pack({ format: "other" })), /not a Kings/);
    assert.throws(() => validateDataPack(pack({ script: "alert(1)" })), /Unknown data-pack field/);
    assert.throws(() => validateDataPack(pack({ name: "<script>alert(1)</script>" })), /markup|characters/);
    assert.throws(() => validateDataPack(pack({ gameVersion: "3.99.0" })), /newer game version/);
    assert.throws(() => validateDataPack(pack({ gameVersion: "4.0.0" })), /major game version/);
    assert.throws(() => validateDataPack(pack({ regions: [{ id: "moon-base", name: "Moon Base" }] })), /unknown province/);
    assert.throws(() => validateDataPack(pack({ scenarios: [scenario(), scenario()] })), /same id/);
    assert.throws(() => validateDataPack(pack({ scenarios: [], regions: [] })), /at least one/);
    const unsafe = pack();
    unsafe.scenarios[0].code = "run()";
    assert.throws(() => validateDataPack(unsafe), /forbidden key/);
    const extraRegion = pack();
    extraRegion.regions[0].colour = "red";
    assert.throws(() => validateDataPack(extraRegion), /unknown field 'colour'/);
    const extraStore = pack();
    extraStore.scenarios[0].resources.seed = 10;
    assert.throws(() => validateDataPack(extraStore), /unknown field 'seed'/);
    const extraObjective = pack();
    extraObjective.scenarios[0].objective.script = "run()";
    assert.throws(() => validateDataPack(extraObjective), /forbidden key/);
});

test("installing a pack replaces its id, enforces the local limit and removal is lossless for saves", () => {
    const storage = memoryStorage();
    assert.equal(installDataPack(pack(), storage).ok, true);
    assert.equal(installDataPack(pack({ name: "Northern Lore Revised" }), storage).ok, true);
    assert.equal(readDataPackLibrary(storage).length, 1);
    assert.equal(readDataPackLibrary(storage)[0].name, "Northern Lore Revised");
    for (const id of ["second-pack", "third-pack"]) {
        const result = installDataPack(pack({ id, name: id.replace("-", " "), scenarios: [scenario(id + "-story")] }), storage);
        assert.equal(result.ok, true);
    }
    const fourth = installDataPack(pack({ id: "fourth-pack", name: "Fourth Pack", scenarios: [scenario("fourth-story")] }), storage);
    assert.equal(fourth.ok, false);
    assert.match(fourth.error, /At most 3/);
    removeDataPack("second-pack", storage);
    assert.deepEqual(readDataPackLibrary(storage).map(row => row.id), ["northern-lore", "third-pack"]);
    assert.equal(getDataPackScenarios(storage).length, 2);
});

test("installed scenarios stay bounded and can fill the total scenario limit", () => {
    const storage = memoryStorage();
    for (let packIndex = 0; packIndex < 2; packIndex++) {
        const scenarios = Array.from({ length: 6 }, (_, index) => scenario("story-" + packIndex + "-" + index));
        const result = installDataPack(pack({
            id: "pack-" + packIndex,
            name: "Pack " + packIndex,
            scenarios
        }), storage);
        assert.equal(result.ok, true);
    }
    const extra = installDataPack(pack({
        id: "extra-pack",
        name: "Extra Pack",
        scenarios: [scenario("extra-story")]
    }), storage);
    assert.equal(extra.ok, false);
    assert.match(extra.error, /at most 12 scenarios/);
});
