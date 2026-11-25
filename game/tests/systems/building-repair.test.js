import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { spawnEntity } from "../../js/world/entities.js";
import { getBuildingRepairSnapshot, getRealmDamageSnapshot, getBulkRepairSnapshot, repairAllDamaged, repairBuilding } from "../../js/systems/building-repair.js";

function setup() {
    resetState();
    state.resources = { wood: 100, stone: 100, gold: 100, food: 100 };
    state.eventLog = [];
}

test("repair reads only finished, damaged buildings", () => {
    setup();
    const wall = spawnEntity(20, 20, TYPE.WALL);
    assert.equal(getBuildingRepairSnapshot(wall).reason, "sound");
    assert.equal(repairBuilding(wall).ok, false);

    const site = spawnEntity(22, 20, TYPE.WALL);
    site.construction = { stage: 2 };
    site.hp = 10;
    assert.equal(getBuildingRepairSnapshot(site.id).reason, "under-construction");
    assert.equal(repairBuilding(site.id).ok, false);

    const villager = spawnEntity(24, 20, TYPE.VILLAGER);
    assert.equal(getBuildingRepairSnapshot(villager).reason, "no-building");
});

test("a damaged wall is restored from stone and leaves a player-visible record", () => {
    setup();
    const wall = spawnEntity(30, 30, TYPE.WALL);
    wall.hp = 135;
    const snapshot = getBuildingRepairSnapshot(wall.id);
    assert.equal(snapshot.ok, true);
    assert.ok(snapshot.cost.stone > 0, "a wall repair must consume stone");
    assert.equal(snapshot.cost.wood, undefined, "a wall repair must not invent a wood bill");

    const result = repairBuilding(wall.id);
    assert.equal(result.ok, true);
    assert.equal(wall.hp, wall.maxHp);
    assert.equal(state.resources.stone, 100 - snapshot.cost.stone);
    assert.ok(state.eventLog.some(entry => /REPAIRED/.test(entry.text)), "the repair must be recorded");
    assert.equal(getBuildingRepairSnapshot(wall.id).reason, "sound", "a second repair must be a no-op");
});

test("the realm damage survey counts finished damaged structures and the worst one", () => {
    setup();
    assert.deepEqual(getRealmDamageSnapshot(), { damaged: 0, defensive: 0, missingHp: 0, worst: null });

    spawnEntity(10, 10, TYPE.WALL);
    const site = spawnEntity(12, 10, TYPE.WALL);
    site.construction = { stage: 2 };
    site.hp = 10;
    const hurtWall = spawnEntity(14, 10, TYPE.WALL);
    hurtWall.hp = 100;
    const hurtHouse = spawnEntity(16, 10, TYPE.HOUSE);
    hurtHouse.hp = Math.floor(hurtHouse.maxHp * 0.9);

    const survey = getRealmDamageSnapshot();
    assert.equal(survey.damaged, 2, "only finished damaged buildings count");
    assert.equal(survey.defensive, 1, "the breach wall must be reported as defensive");
    assert.ok(survey.missingHp > 0, "missing HP must be accumulated");
    assert.equal(survey.worst.id, hurtWall.id, "the lowest HP fraction must be the worst structure");
    assert.ok(survey.worst.ratio < 0.5);
});

test("an unaffordable repair spends nothing and can be retried", () => {
    setup();
    state.resources.stone = 0;
    const keep = spawnEntity(40, 40, TYPE.KEEP);
    keep.hp = Math.floor(keep.maxHp / 2);
    const snapshot = getBuildingRepairSnapshot(keep);
    assert.equal(snapshot.ok, false);
    assert.equal(snapshot.reason, "short-resources");

    const result = repairBuilding(keep);
    assert.equal(result.ok, false);
    assert.equal(keep.hp, Math.floor(keep.maxHp / 2));
    assert.deepEqual(state.resources, { wood: 100, stone: 0, gold: 100, food: 100 });

    state.resources.stone = 100;
    assert.equal(repairBuilding(keep).ok, true);
    assert.equal(keep.hp, keep.maxHp);
});

test("one bulk order restores every damaged structure from the advertised bill", () => {
    setup();
    const wall = spawnEntity(50, 50, TYPE.WALL);
    wall.hp = Math.floor(wall.maxHp * 0.5);
    const house = spawnEntity(52, 50, TYPE.HOUSE);
    house.hp = Math.floor(house.maxHp * 0.7);
    const sound = spawnEntity(54, 50, TYPE.WALL);
    const site = spawnEntity(56, 50, TYPE.WALL);
    site.construction = { stage: 2 };
    site.hp = 10;

    const bill = getBulkRepairSnapshot();
    assert.equal(bill.count, 2, "only damaged finished structures belong in the bulk bill");
    assert.ok(bill.ok && bill.cost.stone > 0, "the advertised bill must be affordable");
    const before = { ...state.resources };

    const result = repairAllDamaged();
    assert.equal(result.ok, true);
    assert.equal(result.repaired, 2);
    assert.equal(wall.hp, wall.maxHp);
    assert.equal(house.hp, house.maxHp);
    assert.equal(sound.hp, sound.maxHp, "a sound structure must stay untouched");
    assert.equal(site.hp, 10, "an unfinished site must stay untouched");
    for (const [resource, amount] of Object.entries(bill.cost)) {
        assert.equal(state.resources[resource], before[resource] - amount, "spend must match the shown bill exactly");
    }
    assert.equal(getBulkRepairSnapshot().count, 0);
    assert.deepEqual(repairAllDamaged(), { ok: false, reason: "no-damaged-buildings", cost: {}, repaired: 0, restored: 0 });
});

test("an unaffordable bulk bill spends nothing and can be retried", () => {
    setup();
    state.resources.wood = 0;
    state.resources.stone = 0;
    const wall = spawnEntity(60, 60, TYPE.WALL);
    wall.hp = Math.floor(wall.maxHp * 0.4);
    const house = spawnEntity(62, 60, TYPE.HOUSE);
    house.hp = Math.floor(house.maxHp * 0.6);

    const bill = getBulkRepairSnapshot();
    assert.equal(bill.count, 2);
    assert.equal(bill.ok, false);
    assert.equal(bill.reason, "short-resources");
    const result = repairAllDamaged();
    assert.equal(result.ok, false);
    assert.equal(result.repaired, 0);
    assert.equal(wall.hp, Math.floor(wall.maxHp * 0.4));
    assert.equal(house.hp, Math.floor(house.maxHp * 0.6));
    assert.deepEqual(state.resources, { wood: 0, stone: 0, gold: 100, food: 100 });

    state.resources.wood = 100;
    state.resources.stone = 100;
    assert.equal(repairAllDamaged().ok, true);
    assert.equal(wall.hp, wall.maxHp);
    assert.equal(house.hp, house.maxHp);
});
