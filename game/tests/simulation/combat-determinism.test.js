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
