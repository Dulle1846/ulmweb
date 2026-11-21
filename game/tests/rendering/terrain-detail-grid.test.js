import test from "node:test";
import assert from "node:assert/strict";
import {
    alignToWorldGrid,
    detailLayerTransform,
    detailStepForZoom,
    transformedLayerRect,
    treeClusterCount,
    treeClusterLayout,
    treeClusterLodForZoom,
    treeClusterSeed,
    treeClusterStepForZoom,
    treeScatterChance,
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

test("grove cells snap to the detail lattice and only reach the canopy at rooftop zoom", () => {
    assert.equal(treeClusterStepForZoom(0.09), 9);
    assert.equal(treeClusterStepForZoom(0.3), 4);
    assert.equal(treeClusterStepForZoom(0.55), 1);
    assert.equal(treeClusterStepForZoom(0.95), 1);
    assert.equal(treeClusterStepForZoom(2.4), 1);
    assert.equal(treeClusterLodForZoom(0.3), "mass");
    assert.equal(treeClusterLodForZoom(0.55), "canopy");
    assert.equal(treeClusterLodForZoom(0.95), "canopy");
    assert.equal(treeClusterLodForZoom(2.4), "canopy");
});

test("grove density stays bounded and responds to clearing, distance and damage", () => {
    const dense = treeClusterCount({
        zoom: 2.4, copies: 3, canopy: 0.86, clearing: 0, roll: 0.4, cellTiles: 2,
    });
    const edge = treeClusterCount({
        zoom: 2.4, copies: 1, canopy: 0.38, clearing: 0.34, edge: 0.8, roll: 0.4, cellTiles: 2,
    });
    const burned = treeClusterCount({
        zoom: 2.4, copies: 2, canopy: 0.7, clearing: 0, disturbance: "burned", roll: 0.4, cellTiles: 2,
    });
    const sampled = treeClusterCount({
        zoom: 2.4, copies: 3, canopy: 0.86, clearing: 0, roll: 0.4, cellTiles: 1,
    });
    const far = treeClusterCount({ zoom: 0.3, copies: 3, canopy: 0.9, roll: 0.4 });
    assert.ok(dense >= 7, "a dense ancient grove must keep a closed canopy, got " + dense);
    assert.ok(dense <= 9, "the grove count must stay bounded, got " + dense);
    assert.ok(edge < dense, "an edge clearing must not draw as many trees as the interior");
    assert.ok(burned < dense, "a damaged stand must be thinner than a closed canopy");
    assert.ok(far >= 3 && far <= 10, "landscape groves must use a bounded stipple count, got " + far);
    assert.equal(treeClusterCount({ zoom: 2.4, copies: 3, canopy: 1, clearing: 0.8 }), 1);
    assert.equal(sampled, 2, "a closed canopy tile should show two sampled crowns, not every stem");
    assert.equal(treeClusterCount({ zoom: 2.4, copies: 1, canopy: 0.3 }), 1);
});

test("close canopy scatter keeps a sampled subset and thins at the edge", () => {
    const denseRoof = treeScatterChance({ zoom: 0.95, treeChance: 0.86 });
    const denseInterior = treeScatterChance({ zoom: 2.4, treeChance: 0.86 });
    const edge = treeScatterChance({ zoom: 0.95, treeChance: 0.4, clearing: 0.34 });
    const burned = treeScatterChance({ zoom: 0.95, treeChance: 0.7, disturbance: "burned" });
    assert.ok(denseRoof > edge, "a dense stand must sample more candidates than an ecotone");
    assert.ok(denseInterior > denseRoof, "interior zoom may sample a little more of the same stand");
    assert.ok(burned < denseRoof, "a damaged stand must thin the whole scatter");
    assert.ok(denseRoof < 0.92, "even a dense roof must skip some candidate stems");
    assert.equal(treeScatterChance({ zoom: 2.4, treeChance: 0 }), 0);
});

test("grove scatter is deterministic but not a single tile-centred lattice", () => {
    const seed = treeClusterSeed(12, 7, 20261104);
    assert.equal(seed, treeClusterSeed(12, 7, 20261104));
    assert.notEqual(seed, treeClusterSeed(13, 7, 20261104));
    assert.notEqual(seed, treeClusterSeed(12, 7, 20261105));
    const first = treeClusterLayout({
        centerX: 480, centerY: 360, stepPx: 96, seed, count: 5, spread: 0.42,
    });
    const replay = treeClusterLayout({
        centerX: 480, centerY: 360, stepPx: 96, seed, count: 5, spread: 0.42,
    });
    assert.deepEqual(first, replay, "the same grove must replay exactly after a pan or reload");
    assert.equal(first.length, 5);
    const offsets = new Set();
    for (const point of first) {
        assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
        assert.ok(Math.hypot(point.x - 480, point.y - 360) <= 96 * 0.42 + 0.001);
        assert.ok(point.size >= 0.84 && point.size <= 1.12);
        offsets.add(point.x.toFixed(2) + ":" + point.y.toFixed(2));
    }
    assert.equal(offsets.size, first.length, "crowns must not all land on one repeated offset");
    const other = treeClusterLayout({
        centerX: 480, centerY: 360, stepPx: 96, seed: treeClusterSeed(13, 7, 20261104),
        count: 5, spread: 0.42,
    });
    assert.notDeepEqual(first, other);
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
