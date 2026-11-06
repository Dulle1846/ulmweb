import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { Entity, TYPE } from "../../js/core/types.js";
import { PLAN, defaultLayout } from "../../js/presentation/building-layout.js";
import {
    ROOM_BONUS_INTERVAL,
    applyRoomBonuses,
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
