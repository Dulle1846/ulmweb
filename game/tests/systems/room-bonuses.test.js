import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { Entity, TYPE } from "../../js/core/types.js";
import { PLAN, defaultLayout } from "../../js/presentation/building-layout.js";
import {
    FURNITURE_BONUS_CAP,
    ROOM_BONUS_CAPS,
    ROOM_BONUS_INTERVAL,
    applyRoomBonuses,
    getBuildingRoomBreakdown,
    getRaidDamageMultiplier,
    getRoomBonusSnapshot,
    invalidateRoomBonusCache,
    roomBonusSignature,
    roomRoleId,
} from "../../js/systems/rooms.js";
import {
    getPopulationGrowthMoraleThreshold,
    POPULATION_GROWTH_MORALE,
} from "../../js/systems/population.js";

function keepEntity() {
    const entity = new Entity(20, 20, TYPE.KEEP);
    entity.layout = defaultLayout(TYPE.KEEP, 3, 3);
    return entity;
}

function sealAllDoors(layout) {
    layout.cells = layout.cells.map(value => value === PLAN.DOOR ? PLAN.WALL : value);
}

function clearFurniture(entity) {
    entity.interior = { bed: 0, table: 0, chair: 0, shelf: 0, hearth: 0, rug: 0, statue: 0, candle: 0 };
}

beforeEach(() => {
    resetState();
    invalidateRoomBonusCache();
});

test("room names map to their realm function", () => {
    assert.equal(roomRoleId("THRONE ROOM"), "crown");
    assert.equal(roomRoleId("Treasury"), "treasury");
    assert.equal(roomRoleId("Royal Chamber"), "household");
    assert.equal(roomRoleId("Guard Hall"), "garrison");
    assert.equal(roomRoleId("Chapel"), "faith");
    assert.equal(roomRoleId("Kitchen"), "common");
});

test("a reachable keep generates crown, treasury, household and garrison bonuses", () => {
    state.entities = [keepEntity()];
    const snapshot = getRoomBonusSnapshot();
    const roles = new Map(snapshot.roles.map(role => [role.id, role]));

    assert.equal(snapshot.interval, ROOM_BONUS_INTERVAL);
    assert.equal(snapshot.rooms, 5);
    assert.equal(snapshot.sealed, 0);
    assert.equal(roles.get("crown").roomCount, 1);
    assert.equal(roles.get("treasury").roomCount, 1);
    assert.equal(roles.get("household").roomCount, 2);
    assert.equal(roles.get("garrison").roomCount, 1);
    assert.ok(snapshot.totals.gold > 0);
    assert.ok(snapshot.totals.legitimacy > 0);
    assert.ok(snapshot.totals.morale > 0);
    assert.ok(snapshot.totals.growth > 0);
    assert.ok(snapshot.totals.defense > 0);
    assert.ok(roles.get("crown").effects.legitimacy > 0);
});

test("sealed rooms are reported and give no bonuses", () => {
    const keep = keepEntity();
    sealAllDoors(keep.layout);
    state.entities = [keep];
    invalidateRoomBonusCache();

    const snapshot = getRoomBonusSnapshot();
    assert.equal(snapshot.rooms, 0);
    assert.ok(snapshot.sealed >= 5);
    for (const value of Object.values(snapshot.totals)) assert.equal(value, 0);
    assert.equal(getRaidDamageMultiplier(), 1);
});

test("room bonuses settle gold, morale and legitimacy together", () => {
    state.hasStarted = true;
    state.entities = [keepEntity()];
    state.resources = { wood: 0, stone: 0, gold: 0, food: 0 };
    state.morale = 40;
    state.politics.legitimacy = 40;

    const snapshot = applyRoomBonuses();
    assert.ok(snapshot.totals.gold > 0);
    assert.ok(state.resources.gold > 0);
    assert.ok(state.morale > 40);
    assert.ok(state.politics.legitimacy > 40);
    assert.ok(state.economy.roomGold > 0);
    assert.ok(state.economy.roomMorale > 0);
    assert.ok(state.economy.roomLegitimacy > 0);
});

test("household rooms lower the growth threshold and guard rooms reduce raid damage", () => {
    state.entities = [keepEntity()];
    const snapshot = getRoomBonusSnapshot();
    const threshold = getPopulationGrowthMoraleThreshold();

    assert.ok(snapshot.totals.growth > 0);
    assert.equal(threshold, Math.max(30, POPULATION_GROWTH_MORALE - snapshot.totals.growth));
    assert.ok(threshold < POPULATION_GROWTH_MORALE);
    assert.ok(snapshot.totals.defense > 0);
    assert.ok(getRaidDamageMultiplier() < 1);
    assert.ok(getRaidDamageMultiplier() >= 0.4);
});

test("a cottage's bedchamber and living room feed different room functions", () => {
    const house = new Entity(8, 8, TYPE.HOUSE);
    house.layout = defaultLayout(TYPE.HOUSE, 1.6, 1.2);
    state.entities = [house];
    invalidateRoomBonusCache();

    const snapshot = getRoomBonusSnapshot();
    assert.ok(snapshot.roles.find(role => role.id === "household").roomCount >= 1);
    assert.ok(snapshot.roles.find(role => role.id === "common").roomCount >= 1);
    assert.ok(snapshot.totals.morale > 0);
    assert.equal(snapshot.totals.gold, 0);
});

test("the bonus cache refreshes when the layout version changes", () => {
    state.entities = [keepEntity()];
    const first = getRoomBonusSnapshot();
    const signature = roomBonusSignature();
    sealAllDoors(state.entities[0].layout);
    state.buildingLayoutVersion = (state.buildingLayoutVersion || 0) + 1;

    const second = getRoomBonusSnapshot();
    assert.equal(first.rooms, 5);
    assert.equal(second.rooms, 0);
    assert.notEqual(roomBonusSignature(), signature);
});

test("furniture raises the room function it supports and respects the furniture cap", () => {
    const keep = keepEntity();
    clearFurniture(keep);
    state.entities = [keep];
    invalidateRoomBonusCache();
    const bare = getRoomBonusSnapshot();

    keep.interior = { chair: 12, table: 12, statue: 12 };
    state.buildingInteriorVersion = (state.buildingInteriorVersion || 0) + 1;
    const furnished = getRoomBonusSnapshot();
    const crown = furnished.roles.find(role => role.id === "crown");
    const room = getBuildingRoomBreakdown(keep).rooms.find(entry => entry.role === "crown");

    assert.ok(furnished.rawTotals.legitimacy > bare.rawTotals.legitimacy);
    assert.ok(crown.furnitureEffects.legitimacy > 0);
    assert.ok(room.furnitureMultiplier > 1);
    assert.ok(room.furnitureMultiplier <= 1 + FURNITURE_BONUS_CAP + 0.0001);
    assert.ok(room.effects.legitimacy > room.baseEffects.legitimacy);
});

test("the building breakdown keeps sealed rooms visible with zero effects", () => {
    const keep = keepEntity();
    state.entities = [keep];
    const open = getBuildingRoomBreakdown(keep);
    assert.equal(open.rooms.length, 5);
    assert.equal(open.accessible, 5);
    assert.equal(open.sealed, 0);
    assert.ok(open.rooms.find(room => room.name === "THRONE ROOM").furnitureMultiplier > 1);

    sealAllDoors(keep.layout);
    const sealed = getBuildingRoomBreakdown(keep);
    assert.equal(sealed.accessible, 0);
    assert.ok(sealed.sealed >= 5);
    assert.deepEqual(sealed.totals, { gold: 0, legitimacy: 0, morale: 0, growth: 0, defense: 0 });
    for (const room of sealed.rooms) {
        assert.equal(room.accessible, false);
        assert.equal(room.furnitureMultiplier, 1);
        for (const value of Object.values(room.effects)) assert.equal(value, 0);
    }
});

test("furniture changes invalidate the realm snapshot cache", () => {
    const keep = keepEntity();
    clearFurniture(keep);
    state.entities = [keep];
    invalidateRoomBonusCache();
    const first = getRoomBonusSnapshot();

    keep.interior = { chair: 12, table: 12, statue: 12 };
    state.buildingInteriorVersion = (state.buildingInteriorVersion || 0) + 1;
    const second = getRoomBonusSnapshot();

    assert.ok(second.rawTotals.legitimacy > first.rawTotals.legitimacy);
    assert.ok(second.rawTotals.morale > first.rawTotals.morale);
});

test("realm caps are explicit and the starting keep reaches the morale and growth caps", () => {
    state.entities = [keepEntity()];
    const snapshot = getRoomBonusSnapshot();
    assert.equal(snapshot.totals.morale, ROOM_BONUS_CAPS.morale);
    assert.equal(snapshot.totals.growth, ROOM_BONUS_CAPS.growth);
    assert.equal(snapshot.capped.morale, true);
    assert.equal(snapshot.capped.growth, true);
    assert.ok(snapshot.rawTotals.morale > snapshot.totals.morale);
});
