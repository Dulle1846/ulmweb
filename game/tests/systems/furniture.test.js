import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { Entity, TYPE } from "../../js/core/types.js";
import { PLAN, defaultLayout } from "../../js/presentation/building-layout.js";
import {
    FURNITURE_BONUS_CAP,
    MAX_FURNITURE_PER_ROOM,
    furnitureMultiplier,
    furnitureUpkeep,
    getRoomFurniturePlan,
    normalizeRoomFurniture,
} from "../../js/systems/furniture.js";
import {
    getBuildingRoomBreakdown,
    getFurnitureUpkeepTotal,
    getRoomBonusSnapshot,
    invalidateRoomBonusCache,
} from "../../js/systems/rooms.js";
import { calculateDailyLedger } from "../../js/systems/economy.js";

function keepEntity() {
    const entity = new Entity(20, 20, TYPE.KEEP);
    entity.id = "furniture-keep";
    entity.layout = defaultLayout(TYPE.KEEP, 3, 3);
    return entity;
}

function room(breakdown, name) {
    return breakdown.rooms.find(entry => entry.name === name);
}

beforeEach(() => {
    resetState();
    invalidateRoomBonusCache();
});

test("legacy interiors are distributed to the rooms whose function they support", () => {
    const keep = keepEntity();
    const breakdown = getBuildingRoomBreakdown(keep);
    const throne = room(breakdown, "THRONE ROOM");
    const household = breakdown.rooms.filter(entry => entry.role === "household");

    assert.equal(breakdown.furnitureExplicit, false);
    assert.ok(throne.furnitureItems.chair > 0 || throne.furnitureItems.statue > 0);
    assert.ok(household.some(entry => entry.furnitureItems.bed > 0));
    assert.ok(throne.furnitureMultiplier > 1);
    assert.equal(breakdown.furnitureTotal, 22);
});

test("explicit room furniture only strengthens the room it is assigned to", () => {
    const keep = keepEntity();
    keep.roomFurniture = { "THRONE ROOM": { statue: 12 } };
    const breakdown = getBuildingRoomBreakdown(keep);
    const throne = room(breakdown, "THRONE ROOM");
    const treasury = room(breakdown, "TREASURY");

    assert.equal(breakdown.furnitureExplicit, true);
    assert.equal(throne.furnitureMultiplier, 1 + FURNITURE_BONUS_CAP);
    assert.equal(treasury.furnitureMultiplier, 1);
    assert.equal(treasury.furnitureCount, 0);
    assert.ok(throne.effects.legitimacy > throne.baseEffects.legitimacy);
    assert.equal(treasury.effects.legitimacy, 0);
});

test("the same furniture is worth more in a room that actually uses it", () => {
    const crown = furnitureMultiplier({ statue: 4 }, "crown");
    const treasury = furnitureMultiplier({ statue: 4 }, "treasury");
    const garrison = furnitureMultiplier({ statue: 4 }, "garrison");

    assert.ok(crown > treasury);
    assert.ok(treasury > garrison);
    assert.equal(garrison, 1);
});

test("room furniture is clamped to the per-room capacity and unknown items are dropped", () => {
    const normalized = normalizeRoomFurniture({
        "THRONE ROOM": { statue: 40, candle: -2, chandelier: 3 },
        "": { bed: 2 },
        "TREASURY": { shelf: 2 },
    });

    assert.equal(normalized["THRONE ROOM"].statue, MAX_FURNITURE_PER_ROOM);
    assert.equal(normalized["THRONE ROOM"].candle, undefined);
    assert.equal(normalized["THRONE ROOM"].chandelier, undefined);
    assert.deepEqual(Object.keys(normalized).sort(), ["THRONE ROOM", "TREASURY"]);
    assert.deepEqual(normalizeRoomFurniture(null), {});
});

test("sealed rooms keep their furniture visible but grant no bonus and no plan points", () => {
    const keep = keepEntity();
    keep.layout.cells = keep.layout.cells.map(value => value === PLAN.DOOR ? PLAN.WALL : value);
    keep.roomFurniture = { "THRONE ROOM": { statue: 6 } };
    state.entities = [keep];
    invalidateRoomBonusCache();

    const breakdown = getBuildingRoomBreakdown(keep);
    const throne = room(breakdown, "THRONE ROOM");
    assert.equal(throne.accessible, false);
    assert.equal(throne.furnitureMultiplier, 1);
    assert.equal(breakdown.totals.legitimacy, 0);
    assert.equal(breakdown.furnitureTotal, 6);
});

test("furniture upkeep grows with every assigned item and reaches the realm total", () => {
    const keep = keepEntity();
    keep.roomFurniture = {
        "THRONE ROOM": { statue: 2, candle: 3 },
        "TREASURY": { shelf: 1 },
    };
    state.entities = [keep];
    invalidateRoomBonusCache();

    assert.equal(furnitureUpkeep({ statue: 2, candle: 3 }), 0.0245);
    assert.equal(getFurnitureUpkeepTotal(), 0.027);
    assert.equal(getRoomBonusSnapshot().furnitureUpkeep, 0.027);

    keep.roomFurniture = {};
    state.buildingInteriorVersion = (state.buildingInteriorVersion || 0) + 1;
    assert.equal(getFurnitureUpkeepTotal(), 0);
});

test("the settlement ledger charges furniture upkeep and reports shortfalls", () => {
    const funded = calculateDailyLedger({
        population: 30, employed: 20, buildings: 4, foodAvailable: 100, goldAvailable: 60, furnitureUpkeep: 0.75,
    });
    assert.equal(funded.furnitureUpkeepAssessed, 0.75);
    assert.equal(funded.furnitureUpkeepPaid, 0.75);
    assert.equal(funded.unpaidFurniture, 0);
    assert.ok(Math.abs(funded.netGold - (funded.taxesCollected - funded.wagesPaid - funded.upkeepPaid - 0.75)) < 1e-9);

    const empty = calculateDailyLedger({
        population: 0, employed: 0, buildings: 0, foodAvailable: 0, goldAvailable: 0, furnitureUpkeep: 0.75,
    });
    assert.equal(empty.furnitureUpkeepPaid, 0);
    assert.equal(empty.unpaidFurniture, 0.75);
    assert.equal(empty.netGold, 0);
});

test("buying into one room leaves the rest of the building untouched", () => {
    const keep = keepEntity();
    keep.roomFurniture = { "THRONE ROOM": { chair: 4 } };
    const plan = getRoomFurniturePlan({
        rooms: getBuildingRoomBreakdown(keep).rooms,
        interior: keep.interior,
        roomFurniture: keep.roomFurniture,
    });

    assert.equal(plan.byRoom["THRONE ROOM"].chair, 4);
    assert.deepEqual(plan.byRoom["TREASURY"], {});
    assert.equal(plan.explicit, true);
    assert.equal(plan.totalItems, 4);
    assert.ok(plan.upkeep > 0);
});
