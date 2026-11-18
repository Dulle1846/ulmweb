import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { initStartingKingdom } from "../../js/world/entities.js";
import { TYPE } from "../../js/core/types.js";
import { getBuildingCost } from "../../js/systems/construction.js";
import { destroyCoastalTargetAt } from "../../js/world/coast-hazards.js";
import { destroySnowTargetAt } from "../../js/world/snow-hazards.js";
import { destroyVolcanicTargetAt } from "../../js/world/volcano-hazards.js";
import {
    DISASTER_PENDING_LIMIT, REBUILD_DISCOUNT, REBUILD_RADIUS,
    consumeRebuildRuin, createDisasterRecoveryState, disasterCauseLabel,
    getDisasterRecoverySnapshot, ingestDisasterTags, normalizeDisasterRecoveryState,
    rebuildDiscountFor, updateDisasterRecovery, validateDisasterRecoveryState
} from "../../js/systems/disaster-recovery.js";

function setupRealm({ year = 5 } = {}) {
    resetState();
    state.worldSeed = 4242;
    state.tick = 20;
    state.year = year;
    state.dayOfYear = 20;
    state.seasonIndex = 0;
    state.hasStarted = true;
    state.resources = { wood: 400, stone: 300, gold: 600, food: 600 };
    initStartingKingdom();
    state.disasterRecovery = createDisasterRecoveryState();
}

// The exact shape the three annual hazard passes leave behind: a dead building
// carrying destroyedBy and destroyedYear.
function deadWreck(id, type = TYPE.HOUSE, x = 5.5, y = 6.5, year = 5, cause = "snow-avalanche") {
    const building = {
        id, type, x, y, dead: true,
        destroyedBy: cause, destroyedYear: year,
        isBuilding: () => true
    };
    state.entities.push(building);
    return building;
}

test("the annual pass reads hazard tags into one bounded wreck record", () => {
    setupRealm();
    deadWreck("house-1", TYPE.HOUSE, 7.5, 8.5, 5, "snow-avalanche");
    const annual = updateDisasterRecovery();
    assert.equal(annual.ingested, 1);
    assert.equal(annual.wrecks, 0, "a wreck made this year is salvaged at a later audit");
    const snapshot = getDisasterRecoverySnapshot();
    assert.equal(snapshot.pendingCount, 1);
    assert.equal(snapshot.pending[0].label, "Timber Cottage");
    assert.equal(snapshot.pending[0].causeLabel, "Snow avalanche");
    assert.equal(snapshot.pending[0].materials.wood, 5);
    assert.equal(snapshot.pending[0].materials.stone, 2);
    assert.equal(ingestDisasterTags(5), 0, "the same building must not be read twice");
    assert.equal(disasterCauseLabel("coastal-storm-surge"), "Coastal storm surge");
});

test("every annual hazard pass writes the tags the recovery pass reads", () => {
    const passes = [
        ["coast", destroyCoastalTargetAt, "coastal-"],
        ["snow", destroySnowTargetAt, "snow-"],
        ["volcano", destroyVolcanicTargetAt, "volcanic-"]
    ];
    for (const [name, destroy, prefix] of passes) {
        setupRealm();
        const target = state.entities.find(entity => !entity.dead && entity.isBuilding?.()
            && entity.type !== TYPE.KEEP && entity.type !== TYPE.WONDER);
        assert.ok(target, name + " needs a real building to wreck");
        const result = destroy(Math.floor(target.x), Math.floor(target.y), { cause: "test-cause" });
        assert.equal(result.ok, true, name + " must destroy a building");
        assert.equal(result.kind, "building");
        assert.equal(target.destroyedBy, prefix + "test-cause");
        assert.equal(target.destroyedYear, 5);
        const annual = updateDisasterRecovery();
        assert.equal(annual.ingested, 1, name + " tags must reach the register");
        assert.equal(getDisasterRecoverySnapshot().pending[0].causeLabel, disasterCauseLabel(prefix + "test-cause"));
    }
});

test("the register is capped and keeps a bounded history", () => {
    setupRealm();
    for (let index = 0; index < DISASTER_PENDING_LIMIT + 4; index++) {
        deadWreck("house-" + index, TYPE.HOUSE, 10 + index, 12);
    }
    const first = updateDisasterRecovery();
    assert.equal(first.ingested, DISASTER_PENDING_LIMIT);
    assert.equal(state.disasterRecovery.pending.length, DISASTER_PENDING_LIMIT);
    const second = updateDisasterRecovery();
    assert.equal(second.ingested, 4);
    assert.equal(state.disasterRecovery.pending.length, DISASTER_PENDING_LIMIT);
    assert.equal(state.disasterRecovery.history.length, 4);
});

test("salvage is read once at a later annual audit and never doubled", () => {
    setupRealm({ year: 5 });
    deadWreck("house-1", TYPE.HOUSE, 20, 20, 5);
    state.resources.wood = 0;
    state.resources.stone = 0;
    const sameYear = updateDisasterRecovery();
    assert.equal(sameYear.ingested, 1);
    assert.equal(sameYear.wrecks, 0);
    assert.equal(state.resources.wood, 0);

    state.year = 6;
    const first = updateDisasterRecovery();
    assert.equal(first.wrecks, 1);
    assert.equal(first.wood, 5);
    assert.equal(first.stone, 2);
    assert.equal(state.resources.wood, 5);
    assert.equal(state.resources.stone, 2);
    assert.equal(state.disasterRecovery.lastSalvage.year, 6);

    const second = updateDisasterRecovery();
    assert.equal(second.wrecks, 0);
    assert.equal(state.resources.wood, 5);
    assert.equal(state.disasterRecovery.pending.length, 1, "a salvaged wreck stays rebuildable");
});

test("rebuilding on a wreck site is cheaper and consumes the wreck", () => {
    setupRealm();
    const base = getBuildingCost(TYPE.HOUSE);
    deadWreck("house-1", TYPE.HOUSE, 30.5, 31.5, 5);
    updateDisasterRecovery();
    const near = getBuildingCost(TYPE.HOUSE, 31, 31);
    const far = getBuildingCost(TYPE.HOUSE, 60, 60);
    assert.ok(near.wood < base.wood, "a wreck within " + REBUILD_RADIUS + " tiles must cut timber");
    assert.ok(near.stone < base.stone);
    assert.equal(far.wood, base.wood);
    assert.ok(rebuildDiscountFor(TYPE.HOUSE, 31, 31));
    assert.equal(rebuildDiscountFor(TYPE.FARM, 31, 31), null);
    assert.equal(REBUILD_DISCOUNT, 0.25);

    assert.equal(consumeRebuildRuin(TYPE.HOUSE, 31, 31), true);
    assert.equal(getBuildingCost(TYPE.HOUSE, 31, 31).wood, base.wood);
    assert.equal(getDisasterRecoverySnapshot().pendingCount, 0);
    assert.equal(getDisasterRecoverySnapshot().rebuilt, 1);
});

test("legacy saves normalize to a neutral register and bad values are rejected", () => {
    const neutral = normalizeDisasterRecoveryState(undefined);
    assert.deepEqual(neutral.pending, []);
    assert.deepEqual(neutral.history, []);
    assert.deepEqual(neutral.salvage, { wood: 0, stone: 0 });
    const dirty = normalizeDisasterRecoveryState({
        pending: [{ x: "bad" }, { type: TYPE.FARM, x: 4, y: 5, year: 3, materials: { wood: -4, stone: 900 } }],
        salvage: { wood: -2, stone: 12.8 },
        lastSalvage: { year: "x", wrecks: 9 }
    });
    assert.equal(dirty.pending.length, 1);
    assert.equal(dirty.pending[0].materials.wood, 0);
    assert.equal(dirty.pending[0].materials.stone, 24);
    assert.equal(dirty.salvage.wood, 0);
    assert.equal(dirty.salvage.stone, 12);
    assert.equal(dirty.lastSalvage.wrecks, 8);
    assert.equal(validateDisasterRecoveryState(undefined), true);
    assert.throws(() => validateDisasterRecoveryState({ pending: "nope" }), /wreck list/);
    assert.throws(() => validateDisasterRecoveryState({ history: new Array(DISASTER_PENDING_LIMIT + 1).fill({}) }), /history/);
});
