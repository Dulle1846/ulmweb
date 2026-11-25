import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { spawnEntity } from "../../js/world/entities.js";
import { getRealmWarningSnapshot } from "../../js/presentation/realm-warning-snapshot.js";

function setup() {
    resetState();
    state.resources = { wood: 100, stone: 100, gold: 100, food: 100 };
    state.eventLog = [];
}

function find(entries, id) {
    return entries.find(item => item.id === id) || null;
}

test("a quiet realm has no warnings", () => {
    setup();
    const snapshot = getRealmWarningSnapshot();
    assert.equal(snapshot.count, 0);
    assert.deepEqual(snapshot.entries, []);
    assert.equal(snapshot.primary, null);
    assert.equal(snapshot.summary, "");
});

test("damaged structures are one warning source even when several buildings hurt", () => {
    setup();
    const wall = spawnEntity(20, 20, TYPE.WALL);
    wall.hp = Math.round(wall.maxHp * 0.25);
    const house = spawnEntity(22, 20, TYPE.HOUSE);
    house.hp = Math.round(house.maxHp * 0.75);
    const site = spawnEntity(24, 20, TYPE.HOUSE);
    site.construction = { stage: 1 };
    site.hp = 10;

    const snapshot = getRealmWarningSnapshot();
    assert.equal(snapshot.count, 1, "the badge counts warning sources, not damaged buildings");
    assert.equal(snapshot.primary.id, "structure-damage");
    assert.equal(snapshot.primary.label, "STRUCTURE DAMAGE · 2");
    assert.equal(snapshot.primary.panel, "buildings");
    assert.match(snapshot.primary.detail, /HP missing/);
    assert.match(snapshot.summary, /STRUCTURE DAMAGE · 2/);
});

test("a deferred issue stays visible and keeps the highest navigation priority", () => {
    setup();
    state.activeEvent = { id: "issue-1", title: "The border tax is disputed", dismissed: true };
    const wall = spawnEntity(20, 20, TYPE.WALL);
    wall.hp = Math.round(wall.maxHp / 2);

    const snapshot = getRealmWarningSnapshot();
    assert.equal(snapshot.count, 2);
    assert.equal(snapshot.primary.id, "issue-deferred");
    assert.equal(snapshot.primary.label, "REALM ISSUE DEFERRED");
    assert.match(snapshot.primary.detail, /border tax/i);
    assert.equal(snapshot.primary.panel, "chronicle", "OPEN ISSUE lives in the Chronicle, not the royal-house Decisions tab");
    assert.equal(find(snapshot.entries, "structure-damage")?.panel, "buildings");
});

test("worn roads become a bounded build warning with a stable revision cache", () => {
    setup();
    state.roads = {
        version: 1, revision: 3,
        tiles: { "10:10": { type: "dirt", builtAtTick: 0, condition: 45 } },
        lastWearYear: 1,
        lastWear: { year: 1, tiles: 1, changed: 1, worn: 1, average: 45, loss: 55 },
        lastRepairYear: 0, lastRepair: null
    };
    const first = getRealmWarningSnapshot();
    const road = find(first.entries, "road-wear");
    assert.ok(road, "a worn road must be visible in the HUD model");
    assert.equal(road.label, "ROAD WEAR · 1");
    assert.equal(road.panel, "build");
    assert.equal(road.buildCategory, "roads");
    assert.match(road.detail, /Worst 45%/);

    state.roads.tiles["10:10"].condition = 100;
    state.roads.revision = 4;
    const repaired = getRealmWarningSnapshot();
    assert.equal(find(repaired.entries, "road-wear"), null, "a repaired road must clear the warning");
});

test("active hazards and economic distress appear as separate HUD sources", () => {
    setup();
    state.environmentalHazards = {
        active: [{ label: "HEATWAVE · ASHWOOD", severity: 0.8 }],
        warnings: ["HEATWAVE · ASHWOOD · 80%"]
    };
    state.economy.foodCrisis.severity = 0.6;

    const snapshot = getRealmWarningSnapshot();
    assert.equal(snapshot.count, 2);
    const hazards = find(snapshot.entries, "hazards");
    assert.equal(hazards.label, "HAZARDS ACTIVE · 1");
    assert.equal(hazards.panel, "hazards");
    assert.match(hazards.detail, /HEATWAVE/);
    const economy = find(snapshot.entries, "economy");
    assert.equal(economy.label, "ECONOMY");
    assert.equal(economy.panel, "economy");
    assert.match(economy.detail, /food crisis 60%/);
});

test("outbreak and raid warnings keep their existing top-bar meaning", () => {
    setup();
    state.health.outbreakActive = true;
    state.health.disease = "red-fever";
    state.raidActive = true;
    const snapshot = getRealmWarningSnapshot();
    assert.equal(snapshot.count, 2);
    assert.equal(snapshot.primary.id, "outbreak");
    assert.equal(snapshot.primary.panel, "health");
    assert.equal(find(snapshot.entries, "raid").panel, "military");
});
