import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { spawnEntity } from "../../js/world/entities.js";
import {
    BUILDING_FORMS, buildingFormFor, clearBuildingFormCache,
} from "../../js/world/building-forms.js";

const WIDTH = 64;
const HEIGHT = 64;

function setup(climate = "temperate", height = 0.5, moisture = 0.55, temperature = 0.55) {
    resetState();
    state.hasStarted = true;
    state.worldSeed = 20261123;
    state.worldW = WIDTH;
    state.worldH = HEIGHT;
    state.terrainResolution = 1;
    state.terrainPixW = WIDTH;
    state.terrainPixH = HEIGHT;
    state.heightMap = new Float32Array(WIDTH * HEIGHT).fill(height);
    state.moistureMap = new Float32Array(WIDTH * HEIGHT).fill(moisture);
    state.temperatureMap = new Float32Array(WIDTH * HEIGHT).fill(temperature);
    state.worldOptions = { climate, forests: 55 };
    clearBuildingFormCache();
}

function house(x = 20, y = 20, type = TYPE.HOUSE) {
    const entity = spawnEntity(x, y, type);
    assert.ok(entity);
    return entity;
}

test("every housing and timber structure receives one bounded regional form", () => {
    setup("temperate");
    for (const type of [TYPE.HOUSE, TYPE.STONE_HOUSE, TYPE.WEATHER_HOUSE, TYPE.LUMBER, TYPE.SAWMILL, TYPE.FORESTER, TYPE.WAREHOUSE]) {
        const form = buildingFormFor(house(20 + type, 20, type));
        assert.ok(form, type + " should have a regional form");
        assert.ok(BUILDING_FORMS[form.id], "form id must name a catalogued form");
        assert.ok(form.insulation >= 0.9 && form.insulation <= 1.12, "insulation stays bounded");
        assert.equal(form.warmthPercent, Math.round((form.insulation - 1) * 100));
    }
    assert.equal(buildingFormFor(house(30, 30, TYPE.WALL)), null, "monuments keep their authored silhouette");
});

test("the climate picks the construction tradition", () => {
    setup("taiga");
    assert.equal(buildingFormFor(house()).id, "log-house");
    setup("savanna");
    assert.equal(buildingFormFor(house()).id, "thatch-house");
    setup("swamp");
    assert.equal(buildingFormFor(house()).id, "stilt-house");
    setup("tundra");
    assert.equal(buildingFormFor(house()).id, "turf-house");
    setup("tropical", 0.2, 0.8, 0.75);
    assert.equal(buildingFormFor(house()).id, "stilt-house");
    setup("mountain", 0.8, 0.5, 0.4);
    assert.equal(buildingFormFor(house()).id, "stone-foot");
    setup("temperate", 0.8, 0.5, 0.55);
    assert.equal(buildingFormFor(house()).id, "stone-foot", "a high temperate site builds on stone");
});

test("the same building, seed and site always produce the same form", () => {
    setup("temperate");
    const entity = house(24, 24);
    const before = buildingFormFor(entity);
    clearBuildingFormCache();
    const after = buildingFormFor(entity);
    assert.equal(after.id, before.id);
    assert.equal(after.warmthPercent, before.warmthPercent);
    // A cached read is the same object and never allocates a new form.
    assert.equal(buildingFormFor(entity), after);
});

test("turf and stone forms insulate better than stilt houses", () => {
    assert.ok(BUILDING_FORMS["turf-house"].insulation > BUILDING_FORMS["stilt-house"].insulation);
    assert.ok(BUILDING_FORMS["stone-foot"].insulation > BUILDING_FORMS["plank-house"].insulation);
    assert.ok(BUILDING_FORMS["log-house"].insulation > BUILDING_FORMS["thatch-house"].insulation);
});
