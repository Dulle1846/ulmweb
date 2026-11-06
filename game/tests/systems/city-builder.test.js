import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { spawnEntity } from "../../js/world/entities.js";
import { initializeCityForRealm, serializeCity, restoreCity, validateCitySnapshot } from "../../js/systems/logistics.js";
import { placeDirectBuilding, constructionSnapshot, cancelConstruction } from "../../js/systems/construction.js";
import { updateFields } from "../../js/systems/fields.js";
import { initializeSettlementForRealm, getSettlementSnapshot } from "../../js/systems/settlement.js";

function foundedFixture() {
    resetState();
    state.hasStarted = true;
    state.tick = 24;
    state.year = 1;
    state.seasonIndex = 0;
    state.resources = { wood: 200, stone: 200, gold: 100, food: 100 };
    state.worldW = 160; state.worldH = 160; state.seaLevel = 0.33; state.terrainResolution = 1;
    state.terrainPixW = 160; state.terrainPixH = 160;
    state.heightMap = new Float32Array(160 * 160).fill(0.6);
    state.explored = Array.from({length:160},()=>Array(160).fill(false));
    initializeCityForRealm({ seedWarehouse: false });
}

test("direct construction opens a site, charges only the opening share and remains non-operational", () => {
    foundedFixture();
    const result = placeDirectBuilding(TYPE.WAREHOUSE, 20, 20);
    assert.equal(result.ok, true);
    assert.equal(result.entity.construction.stage, 0);
    assert.ok(state.resources.wood < 200);
    assert.ok(state.resources.stone < 200);
    const snapshot = constructionSnapshot(result.entity);
    assert.equal(snapshot.percent, 0);
    assert.equal(snapshot.status, "SITE PREPARATION");
    assert.equal(result.entity.inventory.input.wood||0, 0);
});

test("cancelling a site removes it and refunds part of the paid materials", () => {
    foundedFixture();
    const result = placeDirectBuilding(TYPE.WAREHOUSE, 20, 20);
    const paidWood = result.entity.construction.paid.wood;
    const before = state.resources.wood;
    const cancelled = cancelConstruction(result.entity);
    assert.equal(cancelled.ok, true);
    assert.equal(result.entity.dead, true);
    assert.ok(state.resources.wood > before);
    assert.ok(state.resources.wood <= before + paidWood);
});

test("city-builder save state validates and round-trips", () => {
    foundedFixture();
    placeDirectBuilding(TYPE.SAWMILL, 20, 20);
    const snapshot = serializeCity();
    assert.equal(validateCitySnapshot(snapshot), true);
    resetState();
    restoreCity(snapshot);
    const restored = serializeCity();
    assert.equal(restored.enabled, true);
    assert.equal(restored.logistics.jobs.length, snapshot.logistics.jobs.length);
    assert.equal(restored.logistics.nextJobId, snapshot.logistics.nextJobId);
});

test("staffed farms pass through a real seasonal field state", () => {
    foundedFixture();
    const farm = spawnEntity(20, 20, TYPE.FARM);
    for (let index = 0; index < 4; index++) spawnEntity(18 + index, 20, TYPE.VILLAGER).workplace = farm;
    updateFields();
    assert.equal(farm.field.stage, "sown");
    state.seasonIndex = 1;
    for (let index = 0; index < 3; index++) updateFields();
    assert.ok(["growing", "ripe"].includes(farm.field.stage));
    assert.ok(farm.field.growth > 0);
});

test("settlement initialization exposes service and household need data", () => {
    foundedFixture();
    initializeSettlementForRealm();
    const summary = getSettlementSnapshot();
    assert.ok(summary.services);
    assert.ok(summary.needs);
    assert.ok(Number.isFinite(summary.needs.water));
    assert.ok(Number.isFinite(summary.needs.satisfaction));
});
