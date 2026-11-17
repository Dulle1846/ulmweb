import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { initStartingKingdom } from "../../js/world/entities.js";
import { ensureDiplomacy } from "../../js/systems/diplomacy.js";
import { getNobilitySnapshot, normalizeNobilityState, updateNobility } from "../../js/systems/nobility.js";
import { updateNobleFeuds } from "../../js/systems/noble-feuds.js";
import {
    getNobleHostSnapshot,
    orderNobleHost,
    updateNobleHosts
} from "../../js/systems/noble-host.js";
import { prepareSaveSnapshot } from "../../js/core/save-runtime.js";
import { SAVE_SCHEMA_VERSION } from "../../js/core/save-validation.js";

function startRealm(seed = 20261114) {
    resetState();
    state.hasStarted = true;
    state.worldSeed = seed;
    state.year = 2;
    state.resources = { wood: 200, stone: 100, gold: 200, food: 200 };
    state.incomeThisTick = { wood: 0, stone: 0, gold: 0, food: 0 };
    initStartingKingdom();
}

function initializeHosts() {
    updateNobility();
    updateNobleFeuds();
    return updateNobleHosts();
}

test("land hosts derive strength, equipment and upkeep from actual house values", () => {
    startRealm();
    const snapshot = initializeHosts();
    assert.equal(snapshot.activeHosts, 4);
    assert.ok(snapshot.totalStrength > 0);
    const house = snapshot.hosts[0];
    assert.ok(house.commanderName);
    assert.ok(house.strength > 0);
    assert.ok(house.equipment >= 0);
    assert.ok(house.wages > 0);
    assert.ok(house.supplies > 0);

    const before = house.targetStrength;
    const record = state.nobility.houses.find(entry => entry.id === house.houseId);
    record.wealth = Math.min(100, record.wealth + 20);
    record.levy = Math.min(30, record.levy + 5);
    record.loyalty = 80;
    updateNobleHosts();
    const after = getNobleHostSnapshot().hosts.find(entry => entry.houseId === house.houseId);
    assert.ok(after.targetStrength > before, "wealth, levy and loyalty must raise the target host size");
    assert.ok(after.wages > 0);
});

test("a house without loyalty cannot raise or keep a land host", () => {
    startRealm();
    const snapshot = initializeHosts();
    const house = snapshot.hosts[0];
    orderNobleHost(house.houseId, "disband");
    const record = state.nobility.houses.find(entry => entry.id === house.houseId);
    record.loyalty = 10;
    record.power = 0;
    record.levy = 1;
    assert.equal(orderNobleHost(house.houseId, "raise").reason, "house-will-not-raise-a-host");
    updateNobleHosts();
    assert.equal(getNobleHostSnapshot().hosts.some(entry => entry.houseId === house.houseId), false);
});

test("a severe feud reduces the host target and blocks a march", () => {
    startRealm();
    const baseline = initializeHosts();
    const house = baseline.hosts[0];
    const other = baseline.hosts[1];
    const before = house.targetStrength;
    state.nobility.feuds = [{
        id: "feud-host-test",
        houses: [house.houseId, other.houseId],
        cause: "grazing and mill rights",
        severity: 5,
        status: "active",
        startedYear: state.year,
        lastEscalationYear: state.year,
        settledYear: 0,
        ignoredYear: 0,
        mediatorId: null,
        history: []
    }];
    updateNobleHosts();
    const after = getNobleHostSnapshot().hosts.find(entry => entry.houseId === house.houseId);
    assert.ok(after.targetStrength < before);
    assert.ok(after.feudSeverity >= 5);
    assert.equal(orderNobleHost(house.houseId, "march").reason, "feud-prevents-march");
});

test("hosts muster, return on a real schedule and can join a war", () => {
    startRealm();
    const snapshot = initializeHosts();
    const house = snapshot.hosts[0];
    const goldBefore = state.resources.gold;
    const foodBefore = state.resources.food;
    const march = orderNobleHost(house.houseId, "march");
    assert.equal(march.ok, true);
    assert.equal(march.host.status, "mustering");
    assert.ok(march.host.readyIn > 0);
    assert.equal(state.resources.gold, goldBefore - snapshot.marchCost.gold);
    assert.equal(state.resources.food, foodBefore - snapshot.marchCost.food);

    state.tick = march.host.readyTick + 1;
    updateNobleHosts();
    assert.equal(getNobleHostSnapshot().hosts.find(entry => entry.houseId === house.houseId).status, "quartered");

    const quarter = orderNobleHost(house.houseId, "quarter");
    assert.equal(quarter.ok, true);
    assert.equal(quarter.host.status, "returning");
    assert.ok(quarter.host.returnIn > 0);
    state.tick = quarter.host.returnTick + 1;
    updateNobleHosts();
    assert.equal(getNobleHostSnapshot().hosts.find(entry => entry.houseId === house.houseId).status, "quartered");

    ensureDiplomacy().realms[0].treaty = "war";
    for (const record of state.nobility.houses) record.loyalty = 70;
    state.year = 3;
    updateNobility();
    const warSnapshot = updateNobleHosts();
    assert.ok(warSnapshot.warHosts > 0);
    assert.ok(warSnapshot.hosts.some(entry => entry.joinedWar && entry.status === "marching"));
});

test("low loyalty can turn a persistent host into an open revolt", () => {
    startRealm();
    initializeHosts();
    for (const record of state.nobility.houses) {
        record.loyalty = 0;
        record.power = 0;
        record.levy = 1;
    }
    state.year = 3;
    updateNobility();
    const snapshot = updateNobleHosts();
    assert.ok(snapshot.currentRevolts > 0);
    assert.ok(snapshot.revolts >= snapshot.currentRevolts);
    assert.ok(snapshot.hosts.some(entry => entry.status === "revolted"));
    assert.ok(Number(state.morale) < 72);
});

test("hosts and feuds survive the save preflight and old noble saves gain empty defaults", () => {
    startRealm();
    state.year = 2;
    initializeHosts();
    const saved = JSON.parse(JSON.stringify(state.nobility));
    assert.ok(saved.houses.every(house => house.host && house.host.strength >= 0));
    assert.ok(Array.isArray(saved.feuds));
    const prepared = prepareSaveSnapshot({
        saveSchemaVersion: SAVE_SCHEMA_VERSION,
        worldSeed: state.worldSeed,
        entities: [],
        resources: { ...state.resources },
        incomeThisTick: { wood: 0, stone: 0, gold: 0, food: 0 },
        nobility: JSON.parse(JSON.stringify(saved))
    });
    const normalized = normalizeNobilityState(prepared.nobility);
    assert.equal(normalized.houses.length, saved.houses.length);
    assert.ok(normalized.houses.every(house => house.host && house.host.commanderName));
    assert.deepEqual(normalized.feuds.map(feud => feud.id), saved.feuds.map(feud => feud.id));

    const legacy = normalizeNobilityState({ houses: [{ id: "house-legacy", familyName: "Legacy" }] });
    assert.equal(legacy.houses[0].host, null);
    assert.deepEqual(legacy.feuds, []);
    assert.deepEqual(legacy.hostHistory, []);
});

test("the noble panel exposes host orders and feud actions to the browser", async () => {
    const { readFile } = await import("node:fs/promises");
    const ui = await readFile(new URL("../../js/presentation/management-ui.js", import.meta.url), "utf8");
    assert.match(ui, /getNobleHostSnapshot/);
    assert.match(ui, /getNobleFeudSnapshot/);
    assert.match(ui, /data-command="noble-host-order"/);
    assert.match(ui, /data-command="noble-feud-mediate"/);
    assert.match(ui, /data-command="noble-feud-inflame"/);
    assert.match(ui, /data-command="noble-feud-ignore"/);
});
