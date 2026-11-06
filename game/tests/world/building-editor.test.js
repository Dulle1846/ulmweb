import test from "node:test";
import assert from "node:assert/strict";
import { TYPE } from "../../js/core/types.js";
import {
    PLAN,
    hasInterior,
    defaultLayout,
    normalizeLayout,
    serializeLayout,
    cloneLayout,
    rotateLayout,
    setPlanCell,
    movePlanCell,
    roomsOf,
    layoutStats,
    isBorder,
} from "../../js/presentation/building-layout.js";

function interiorDoor(layout) {
    const n = layout.w;
    for (let y = 1; y < n - 1; y++) {
        for (let x = 1; x < n - 1; x++) {
            if (layout.cells[y * n + x] === PLAN.DOOR) return { x, y };
        }
    }
    return null;
}

function emptyCell(layout) {
    const n = layout.w;
    for (let y = 1; y < n - 1; y++) {
        for (let x = 1; x < n - 1; x++) {
            if (layout.cells[y * n + x] === PLAN.EMPTY) return { x, y };
        }
    }
    return null;
}

test("floor plans exist for living buildings but not walls or barrels", () => {
    assert.equal(hasInterior(TYPE.HOUSE, 1.6, 1.2), true);
    assert.equal(hasInterior(TYPE.KEEP, 3, 3), true);
    assert.equal(hasInterior(TYPE.WALL, 2, 0.4), false);
    assert.equal(hasInterior(TYPE.BARREL, 1, 1), false);
});

test("a default cottage has a closed perimeter, windows, a door and two accessible rooms", () => {
    const layout = defaultLayout(TYPE.HOUSE, 1.6, 1.2);
    const n = layout.w;
    for (let i = 0; i < n; i++) {
        for (const cell of [i, (n - 1) * n + i, i * n, i * n + n - 1]) {
            assert.notEqual(layout.cells[cell], PLAN.EMPTY);
        }
    }
    const stats = layoutStats(layout, TYPE.HOUSE);
    assert.equal(stats.rooms.length, 2);
    assert.ok(stats.doors >= 2);
    assert.ok(stats.windows >= 2);
    assert.equal(stats.unreachable, 0);
    assert.ok(stats.rooms.every(room => room.name.length > 0));
});

test("the royal keep starts with several rooms and a walkable layout", () => {
    const layout = defaultLayout(TYPE.KEEP, 3, 3);
    const stats = layoutStats(layout, TYPE.KEEP);
    assert.ok(stats.rooms.length >= 4);
    assert.ok(stats.doors >= 3);
    assert.equal(stats.unreachable, 0);
    assert.equal(stats.rooms[0].name, "THRONE ROOM");
});

test("closing the inner door makes the rear room unreachable, reopening restores access", () => {
    const layout = defaultLayout(TYPE.HOUSE, 1.6, 1.2);
    const door = interiorDoor(layout);
    assert.ok(door);
    layout.cells[door.y * layout.w + door.x] = PLAN.WALL;
    let stats = layoutStats(layout, TYPE.HOUSE);
    assert.equal(stats.unreachable, 1);
    layout.cells[door.y * layout.w + door.x] = PLAN.DOOR;
    stats = layoutStats(layout, TYPE.HOUSE);
    assert.equal(stats.unreachable, 0);
});

test("perimeter walls cannot be erased but can hold doors and windows", () => {
    const layout = defaultLayout(TYPE.HOUSE, 1.6, 1.2);
    assert.equal(setPlanCell(layout, 0, 0, PLAN.EMPTY), false);
    assert.notEqual(layout.cells[0], PLAN.EMPTY);
    assert.equal(isBorder(layout, 0, 3), true);
    const n = layout.w;
    assert.equal(setPlanCell(layout, 3, 0, PLAN.WINDOW), true);
    assert.equal(layout.cells[3], PLAN.WINDOW);
    const target = emptyCell(layout);
    assert.equal(setPlanCell(layout, target.x, target.y, PLAN.WALL), true);
});

test("interior walls and doors can be moved, border cells cannot", () => {
    const layout = defaultLayout(TYPE.HOUSE, 1.6, 1.2);
    const source = { x: 5, y: 2 };
    layout.cells[source.y * layout.w + source.x] = PLAN.WALL;
    const target = emptyCell(layout);
    const before = layout.cells.filter(value => value === PLAN.WALL).length;
    assert.equal(movePlanCell(layout, source.x, source.y, target.x, target.y), true);
    assert.equal(layout.cells[source.y * layout.w + source.x], PLAN.EMPTY);
    assert.equal(layout.cells[target.y * layout.w + target.x], PLAN.WALL);
    assert.equal(layout.cells.filter(value => value === PLAN.WALL).length, before);
    assert.equal(movePlanCell(layout, 0, 3, target.x, target.y), false);
    assert.equal(movePlanCell(layout, source.x, source.y, 0, 0), false);
});

test("layout normalization rejects broken data and repairs open borders", () => {
    const fallback = normalizeLayout(TYPE.HOUSE, null, 1.6, 1.2);
    assert.ok(fallback.w >= 9);
    const broken = normalizeLayout(TYPE.HOUSE, { w: 4, h: 4, cells: [] }, 1.6, 1.2);
    assert.deepEqual(broken, fallback);

    const raw = defaultLayout(TYPE.HOUSE, 1.6, 1.2);
    raw.cells[0] = PLAN.EMPTY;
    raw.cells[45] = 99;
    const repaired = normalizeLayout(TYPE.HOUSE, raw, 1.6, 1.2);
    assert.notEqual(repaired.cells[0], PLAN.EMPTY);
    assert.equal(repaired.cells[45], PLAN.EMPTY);
});

test("save serialization is a deep copy and survives a round trip", () => {
    const layout = defaultLayout(TYPE.KEEP, 3, 3);
    const saved = serializeLayout(TYPE.KEEP, layout, 3, 3);
    assert.deepEqual(saved, { w: layout.w, h: layout.h, cells: layout.cells });
    const restored = normalizeLayout(TYPE.KEEP, saved, 3, 3);
    assert.deepEqual(restored.cells, layout.cells);
    const copy = cloneLayout(layout);
    copy.cells[1] = PLAN.DOOR;
    assert.notEqual(layout.cells[1], copy.cells[1]);
});

test("rotating a plan four times returns the original structure", () => {
    const layout = defaultLayout(TYPE.KEEP, 3, 3);
    let turned = layout;
    for (let i = 0; i < 4; i++) turned = rotateLayout(turned);
    assert.deepEqual(turned.cells, layout.cells);
    const once = rotateLayout(layout);
    assert.equal(once.w, layout.w);
    assert.equal(once.cells.filter(value => value === PLAN.DOOR).length,
        layout.cells.filter(value => value === PLAN.DOOR).length);
});

test("rooms expose centroids and accessible flags for the editor", () => {
    const layout = defaultLayout(TYPE.TAVERN, 2.2, 1.6);
    const rooms = roomsOf(layout, TYPE.TAVERN);
    assert.ok(rooms.length >= 2);
    for (const room of rooms) {
        assert.ok(room.area > 0);
        assert.ok(Number.isFinite(room.cx) && Number.isFinite(room.cy));
        assert.equal(typeof room.accessible, "boolean");
        assert.ok(room.name);
    }
    assert.ok(rooms.some(room => room.accessible));
});
