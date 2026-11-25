import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { spawnEntity } from "../../js/world/entities.js";
import { getBuildingRepairSnapshot, getRealmDamageSnapshot, repairBuilding } from "../../js/systems/building-repair.js";

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
