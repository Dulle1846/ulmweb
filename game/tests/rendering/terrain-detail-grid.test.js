import test from "node:test";
import assert from "node:assert/strict";
import {
    alignToWorldGrid,
    detailLayerTransform,
    detailStepForZoom,
    transformedLayerRect,
    treeStepForZoom,
    visibleTileBounds,
} from "../../js/presentation/rendering/terrain-detail-grid.js";

const close = (actual, expected, epsilon = 1e-9) => {
    assert.ok(Math.abs(actual - expected) <= epsilon, actual + " !== " + expected);
};

test("detail lattice is anchored to the world, not the camera", () => {
    for (const step of [1, 2, 4, 6, 9]) {
        for (const tile of [-11, -1, 0, 1, 3, 7, 16, 17, 100, 159]) {
            const aligned = alignToWorldGrid(tile, step);
            assert.ok(aligned >= tile);
            assert.ok(aligned % step === 0);
            assert.ok(aligned - tile < step);
            assert.equal(alignToWorldGrid(aligned, step), aligned);
        }
    }
});

test("the same world tile is sampled at every camera position", () => {
    const cellPx = 14.4;
    const width = 1200;
    const height = 800;
    const step = detailStepForZoom(0.3);
    const cameras = [0, 1.7, 3.2, 5.9, 8.1];
    const sampled = cameras.map(cameraX => {
        const bounds = visibleTileBounds({
            cellPx, cameraX, cameraY: 37.3, width, height,
            worldWidth: 160, worldHeight: 160,
        });
        const first = alignToWorldGrid(bounds.startX, step);
        const tiles = [];
        for (let x = first; x < bounds.endX; x += step) tiles.push(x);
        return new Set(tiles);
    });
    // A tile that is at least one detail step away from every camera edge must
    // have exactly the same sampled state in all views.
    for (let x = 0; x < 70; x += step) {
        const states = sampled.map(set => set.has(x));
        assert.ok(states.every(Boolean), "tile column " + x + " was dropped by a camera offset");
    }
});

test("tree lattice is world-anchored and denser at district zoom", () => {
    assert.equal(treeStepForZoom(0.09), 2);
    assert.equal(treeStepForZoom(0.29), 2);
    assert.equal(treeStepForZoom(0.3), 1);
    assert.equal(treeStepForZoom(2.4), 1);
    const cameraX = 87.3;
    const cellPx = 14.4;
    const bounds = visibleTileBounds({
        cellPx, cameraX, cameraY: 42.1, width: 1000, height: 700,
        worldWidth: 160, worldHeight: 160,
    });
    const first = alignToWorldGrid(bounds.startX, 2);
    assert.equal(first % 2, 0);
    assert.equal(alignToWorldGrid(first + 2, 2), first + 2);
});

test("zoom steps stay stable and do not introduce a camera phase", () => {
    assert.equal(detailStepForZoom(0.05), 9);
    assert.equal(detailStepForZoom(0.14), 9);
    assert.equal(detailStepForZoom(0.16), 6);
    assert.equal(detailStepForZoom(0.3), 4);
    assert.equal(detailStepForZoom(0.55), 2);
    assert.equal(detailStepForZoom(1), 1);
    assert.equal(detailStepForZoom(2.4), 1);
});

test("cached detail transform preserves every world point during pan", () => {
    const oldZoom = 0.95;
    const newZoom = 0.95;
    const oldCam = { x: 310.5, y: 207.25 };
    const newCam = { x: 345.75, y: 178.5 };
    const transform = detailLayerTransform({
        previousZoom: oldZoom, previousCameraX: oldCam.x, previousCameraY: oldCam.y,
        previousRenderScale: 1, zoom: newZoom, cameraX: newCam.x, cameraY: newCam.y,
        renderScale: 1,
    });
    close(transform.scale, 1);
    for (const world of [{ x: 4.2, y: 8.1 }, { x: 91.3, y: 55.8 }, { x: 155, y: 3 }]) {
        const oldScreen = world.x * 48 * oldZoom - oldCam.x;
        const newScreen = world.x * 48 * newZoom - newCam.x;
        close(transform.x + oldScreen * transform.scale, newScreen);
        const oldScreenY = world.y * 48 * oldZoom - oldCam.y;
        const newScreenY = world.y * 48 * newZoom - newCam.y;
        close(transform.y + oldScreenY * transform.scale, newScreenY);
    }
});

test("cached detail transform preserves every world point during zoom", () => {
    const oldZoom = 0.72;
    const newZoom = 0.91;
    const oldCam = { x: 510.25, y: 330.5 };
    const newCam = { x: 601.75, y: 390.25 };
    const transform = detailLayerTransform({
        previousZoom: oldZoom, previousCameraX: oldCam.x, previousCameraY: oldCam.y,
        previousRenderScale: 1, zoom: newZoom, cameraX: newCam.x, cameraY: newCam.y,
        renderScale: 1,
    });
    close(transform.scale, newZoom / oldZoom);
    for (const world of [{ x: 12.4, y: 8.7 }, { x: 77.2, y: 101.9 }]) {
        close(transform.x + (world.x * 48 * oldZoom - oldCam.x) * transform.scale, world.x * 48 * newZoom - newCam.x);
        close(transform.y + (world.y * 48 * oldZoom - oldCam.y) * transform.scale, world.y * 48 * newZoom - newCam.y);
    }
});

test("backing transform and cover rect use current render scale", () => {
    const transform = detailLayerTransform({
        previousZoom: 1, previousCameraX: 100, previousCameraY: 50, previousRenderScale: 0.8,
        zoom: 1.25, cameraX: 130, cameraY: 80, renderScale: 0.75,
    });
    const rect = transformedLayerRect(transform, 960, 720, 0.75);
    close(transform.backingX, 100 * 1.25 - 130);
    close(transform.backingY, 50 * 1.25 - 80);
    close(transform.backingScale, 1.25);
    close(rect.width, 960 * transform.scale);
    close(rect.height, 720 * transform.scale);
    close(rect.x, transform.x * 0.75);
    close(rect.y, transform.y * 0.75);
});
