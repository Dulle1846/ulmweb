import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { spawnEntity, buildingAt, buildingOverlaps } from "../../js/world/entities.js";

beforeEach(() => {
    state.entities = [];
});

test("buildingAt detects the full footprint of a large building", () => {
    spawnEntity(20, 20, TYPE.KEEP);

    assert.equal(buildingAt(19, 20), true);
    assert.equal(buildingAt(22, 20), false);
});

test("new buildings cannot overlap an existing building footprint", () => {
    spawnEntity(20, 20, TYPE.KEEP);

    assert.equal(buildingOverlaps(21, 20, TYPE.HOUSE), true);
    assert.equal(buildingOverlaps(24, 20, TYPE.HOUSE), false);
});

test("destroyed buildings no longer occupy space", () => {
    const keep = spawnEntity(20, 20, TYPE.KEEP);
    keep.dead = true;

    assert.equal(buildingAt(20, 20), false);
    assert.equal(buildingOverlaps(21, 20, TYPE.HOUSE), false);
});

test("scaled footprints are indexed and an ignored building does not block itself", () => {
    const keep = spawnEntity(20, 20, TYPE.KEEP);
    assert.equal(buildingOverlaps(23, 20, TYPE.HOUSE), false);
    assert.equal(buildingOverlaps(20, 20, TYPE.HOUSE, 1, keep), false);

    keep.footprintScale = 2;
    state.buildingCollisionVersion = (state.buildingCollisionVersion || 0) + 1;

    assert.equal(buildingOverlaps(23, 20, TYPE.HOUSE), true);
    assert.equal(buildingOverlaps(23, 20, TYPE.HOUSE, 1, keep), false);
});
