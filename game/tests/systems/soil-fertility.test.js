import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { spawnEntity } from "../../js/world/entities.js";
import { initializeCityForRealm } from "../../js/systems/logistics.js";
import { updateFields, prepareFieldsForSave, restoreFields, getFieldSnapshot } from "../../js/systems/fields.js";

function foundedFixture() {
    resetState();
    state.hasStarted = true;
    state.tick = 24;
    state.year = 1;
    state.seasonIndex = 0;
    state.resources = { wood: 200, stone: 200, gold: 100, food: 100 };
    state.worldW = 160; state.worldH = 160; state.seaLevel = 0.33;
    state.terrainResolution = 1; state.terrainPixW = 160; state.terrainPixH = 160;
    state.heightMap = new Float32Array(160 * 160).fill(0.6);
    state.explored = Array.from({ length: 160 }, () => Array(160).fill(false));
    initializeCityForRealm({ seedWarehouse: false });
    const size = 160 * 160;
    state.resourceGeography = {
        version: 1,
        forestStock: new Uint16Array(size), forestCapacity: new Uint16Array(size),
        forestKind: new Uint8Array(size), forestAge: new Uint8Array(size),
        stoneStock: new Uint16Array(size), stoneCapacity: new Uint16Array(size),
        fertility: new Uint8Array(size).fill(60), waterAccess: new Uint8Array(size)
    };
}

function addWorkers(farm, count = 2) {
    for (let index = 0; index < count; index++) {
        const worker = spawnEntity(18 + index, 20, TYPE.VILLAGER);
        worker.workplace = farm;
        worker.jobRefreshTimer = 1_000_000;
    }
}

function farmAt(x, y, field) {
    const farm = spawnEntity(x, y, TYPE.FARM);
    farm.field = {
        stage: "fallow", growth: 0, fertility: 60, harvests: 0,
        lastHarvestYear: 0, sownYear: 0, pendingHarvest: 0, harvestTotal: 0,
        maxFertility: 80, resting: false, lastDepletion: 0, lastReason: "Fallow",
        ...field
    };
    addWorkers(farm);
    return farm;
}

test("a completed harvest depletes soil and records the loss", () => {
    foundedFixture();
    const farm = farmAt(20, 20, {
        stage: "ripe", growth: 100, fertility: 80, harvestTotal: 20
    });
    state.seasonIndex = 2;
    updateFields();
    assert.equal(farm.field.stage, "harvested");
    assert.equal(farm.field.harvests, 1);
    assert.ok(farm.field.fertility < 80, "harvest must reduce fertility");
    assert.ok(farm.field.lastDepletion >= 9, "depletion must reflect the harvest size");
});

test("exhausted soil enters a resting year instead of sowing", () => {
    foundedFixture();
    const farm = farmAt(20, 20, {
        stage: "ripe", growth: 100, fertility: 20, harvestTotal: 24
    });
    state.seasonIndex = 2;
    updateFields();
    assert.equal(farm.field.resting, true);
    state.seasonIndex = 0;
    const before = farm.field.fertility;
    for (let day = 0; day < 5; day++) updateFields();
    assert.ok(farm.field.fertility > before, "resting soil must recover");
    assert.equal(farm.field.stage, "fallow", "a resting field must not be sown");
});

test("stable manure speeds up fallow recovery", () => {
    foundedFixture();
    const near = farmAt(20, 20, { fertility: 20, maxFertility: 80, resting: true });
    const far = farmAt(40, 40, { fertility: 20, maxFertility: 80, resting: true });
    spawnEntity(23, 20, TYPE.STABLE);
    const nearBefore = near.field.fertility;
    const farBefore = far.field.fertility;
    updateFields();
    const nearGain = near.field.fertility - nearBefore;
    const farGain = far.field.fertility - farBefore;
    assert.ok(nearGain > farGain, "manure must add recovery");
    assert.ok(nearGain > 0.2 && farGain > 0.1);
});

test("soil fields round-trip through save preparation and restore", () => {
    foundedFixture();
    const farm = farmAt(20, 20, {
        stage: "fallow", fertility: 34, maxFertility: 72, resting: true, lastDepletion: 9.7
    });
    const snapshot = prepareFieldsForSave();
    const row = snapshot.find(entry => entry.id === farm.id);
    assert.equal(row.field.maxFertility, 72);
    assert.equal(row.field.resting, true);
    farm.field.fertility = 1;
    farm.field.resting = false;
    const restored = restoreFields(snapshot);
    assert.equal(restored, 1);
    assert.equal(farm.field.fertility, 34);
    assert.equal(farm.field.maxFertility, 72);
    assert.equal(farm.field.resting, true);
    const status = getFieldSnapshot().find(entry => entry.id === farm.id);
    assert.equal(status.status, "Resting");
});
