import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { spawnEntity } from "../../js/world/entities.js";
import { updateCombat } from "../../js/simulation/combat.js";

function runCombat(seed) {
    resetState();
    state.worldSeed = seed;
    const keep = spawnEntity(40, 40, TYPE.KEEP);
    const enemy = spawnEntity(40, 40, TYPE.GOBLIN);
    for (let tick = 1; tick <= 250 && !enemy.dead; tick++) {
        state.tick = tick;
        updateCombat();
    }
    return {
        enemyHp: enemy.hp,
        enemyDead: enemy.dead,
        keepHp: keep.hp,
        combatDraws: state.randomStreams.combat || 0
    };
}

test("enemy retaliation is reproducible for the same realm seed", () => {
    const first = runCombat(20261105);
    assert.deepEqual(runCombat(20261105), first);
    assert.deepEqual(runCombat(20261105), first);
    assert.ok(first.combatDraws > 0, "combat must consume its dedicated seeded stream");
});

function runWallRaid(stage) {
    resetState();
    state.worldSeed = 20261125;
    const keep = spawnEntity(40, 40, TYPE.KEEP);
    const wall = spawnEntity(40, 40, TYPE.WALL);
    wall.hp = 24;
    if (stage !== undefined) wall.construction = { stage };
    const enemy = spawnEntity(40, 40, TYPE.GOBLIN);
    enemy.hp = 1000;
    let breachTick = null;
    for (let tick = 1; tick <= 400 && !breachTick; tick++) {
        state.tick = tick;
        updateCombat();
        if (wall.dead) breachTick = tick;
    }
    return { keep, wall, enemy, breachTick };
}

test("a finished wall intercepts the raid before the keep", () => {
    const { keep, wall, breachTick } = runWallRaid();
    assert.ok(breachTick, "a finished wall must eventually be breached by the raid");
    assert.equal(keep.hp, keep.maxHp, "the keep must stay untouched while the wall stands");
    for (let tick = breachTick + 1; tick <= breachTick + 120; tick++) {
        state.tick = tick;
        updateCombat();
    }
    assert.ok(keep.hp < keep.maxHp, "once the wall is gone the raid must reach the keep");
});

test("an unfinished wall offers no cover", () => {
    const { keep, wall } = runWallRaid(2);
    assert.equal(wall.dead, false, "a construction site must not absorb hits");
    assert.equal(wall.hp, 24, "an unfinished wall must stay untouched");
    assert.ok(keep.hp < keep.maxHp, "the raid must go straight to the finished structures");
});
