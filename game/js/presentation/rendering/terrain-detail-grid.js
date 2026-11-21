// Stable sampling and transform rules for the cached terrain detail layer.
//
// Decorations are static world objects. Their sample lattice therefore has to
// be anchored to the world, never to the current camera. The old renderer
// started at `floor(camera / cell)` and then stepped across the viewport, which
// shifted the whole lattice by up to `step - 1` tiles whenever the camera
// moved. A tree could disappear and reappear even though its tile had not
// changed. Keeping these rules pure makes that behaviour testable without a
// browser.

export const DETAIL_SETTLE_MS = 140;

export function detailStepForZoom(zoom) {
    const value = Number(zoom);
    if (!Number.isFinite(value) || value <= 0) return 1;
    return value < 0.16 ? 9 : value < 0.3 ? 6 : value < 0.55 ? 4 : value < 1.0 ? 2 : 1;
}

// Trees use a coarser lattice only at landscape distance. At district zoom
// and closer every tile is visited, so zooming in never reveals that half the
// wood was missing. The lattice is still world-anchored, never camera-based.
export function treeStepForZoom(zoom) {
    const value = Number(zoom);
    return Number.isFinite(value) && value < 0.3 ? 2 : 1;
}

// A wood is not a tree on every tile. At landscape/district distance, grove
// cells are intentionally larger than one tile and snap to the existing detail
// lattice, so a sliced rebuild visits every grove exactly once and the same
// grove cannot migrate between frames. Close canopy LOD does not use this cell;
// it samples the half-tile candidate lattice in `terrain.js` instead.
export function treeClusterStepForZoom(zoom) {
    const value = Number(zoom);
    if (Number.isFinite(value) && value >= 0.55) return 1;
    return Math.max(2, detailStepForZoom(value));
}

// Below the rooftops threshold the grove is a canopy mass/impostor. At
// rooftop and interior distance it is drawn as individual authored trees.
export function treeClusterLodForZoom(zoom) {
    const value = Number(zoom);
    return Number.isFinite(value) && value >= 0.55 ? "canopy" : "mass";
}

function unsignedHash(value) {
    let hash = value >>> 0;
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 0x7feb352d) >>> 0;
    hash ^= hash >>> 15;
    hash = Math.imul(hash, 0x846ca68b) >>> 0;
    hash ^= hash >>> 16;
    return hash >>> 0;
}

function hashUnit(value, salt = 0) {
    return unsignedHash((value >>> 0) ^ Math.imul(salt + 1, 0x9e3779b1)) / 4294967296;
}

// Stable identity for one grove. The seed is deliberately part of the hash:
// two realms with the same terrain still get independent woods, while a reload
// of the same realm always replays the exact same crowns.
export function treeClusterSeed(clusterX, clusterY, seed) {
    const x = Math.floor(Number(clusterX) || 0);
    const y = Math.floor(Number(clusterY) || 0);
    const world = Number(seed) >>> 0;
    return (Math.imul(x + 1, 73856093)
        ^ Math.imul(y + 1, 19349663)
        ^ Math.imul(world || 1, 83492791)) >>> 0;
}

export function treeClusterRoll(seed, salt = 0) {
    return hashUnit(seed >>> 0, salt);
}

// Probability that one candidate on the half-tile canopy lattice becomes a
// visible crown. This is the close-LOD sampling rule, not a per-tile count: a
// dense stand still leaves empty candidates, while a clearing or damaged stand
// thins the whole scatter instead of opening a hard hole on one tile.
export function treeScatterChance({
    zoom = 1, treeChance = 0, clearing = 0, disturbance = null,
} = {}) {
    const density = Math.max(0, Math.min(1, Number(treeChance) || 0));
    const open = Math.max(0, Math.min(1, Number(clearing) || 0));
    let chance = density * (Number(zoom) >= 1.55 ? 0.90 : 0.82);
    if (open > 0.28) chance *= 0.35;
    if (disturbance) chance *= 0.55;
    return Math.max(0, Math.min(0.92, chance));
}

// Grove density is a property of the stand and the LOD, not of one tile roll.
// The result stays bounded (0..10) so a dense ancient wood cannot turn into an
// unbounded number of path operations at interior zoom.
export function treeClusterCount({
    zoom = 1, copies = 1, canopy = 0.5, clearing = 0, edge = 0,
    disturbance = null, roll = 0.5, cellTiles = 1,
} = {}) {
    const lod = treeClusterLodForZoom(zoom);
    const copyCount = Math.max(1, Math.min(3, Math.round(Number(copies) || 1)));
    const cover = Math.max(0, Math.min(1, Number(canopy) || 0));
    const open = Math.max(0, Math.min(1, Number(clearing) || 0));
    const edgePressure = Math.max(0, Math.min(1, Number(edge) || 0));
    const cell = Math.max(1, Math.min(9, Math.round(Number(cellTiles) || 1)));
    if (lod === "mass") {
        // At map distance the wood is a stipple of small crowns, not a row of
        // billboard trees. Many small clumps preserve the forest texture while
        // each one stays close to the size a real crown would have on screen.
        let count = 7 + (cover > 0.45 ? 1 : 0) + (copyCount >= 2 ? 1 : 0)
            + (copyCount >= 3 && cover > 0.6 ? 1 : 0);
        if (open > 0.3) count -= 2;
        if (roll < 0.16) count -= 1;
        return Math.max(3, Math.min(10, count));
    }
    if (cell === 1) {
        // One tile of ground can hold zero, one, two or three visible sampled
        // crowns. The extra crown appears only in a closed mature stand; sparse
        // edges, clearings and damaged stands keep a single tree. This is a
        // sampled subset of the stand, not every stem on the tile.
        if (cover > 0.5 || copyCount >= 2) {
            // Edge pressure is already baked into canopy/cover. Penalising it a
            // second time made the whole ecotone read as a lawn with a few lone
            // trees; clearing and damage are the remaining real thinning gates.
            if (open > 0.2 || disturbance) return 1;
            if (zoom >= 1.55) {
                // A real interior wood has gaps, not an equal pair in every
                // cell. Sampling zero to three crowns per tile breaks the row
                // rhythm while preserving a closed canopy overall.
                if (roll < 0.12) return 0;
                if (roll < 0.32) return 1;
                if (roll > 0.80) return 3;
                return 2;
            }
            return roll < 0.22 ? 1 : 2;
        }
        return 1;
    }
    // A closed canopy needs overlapping crowns, not one crown per tile. Eight
    // or nine mature stems in a 2x2 cell overlap into a wood while still leaving
    // individual trees and gaps visible when the player zooms in.
    let count = 3 + Math.round(copyCount * 1.15) + (cover > 0.58 ? 1 : 0);
    if (cover > 0.74 && copyCount >= 3) count += 1;
    if (open > 0.28) count -= 2;
    if (open > 0.5) count = 1;
    if (disturbance) count -= 1;
    if (roll < 0.15) count -= 1;
    return Math.max(1, Math.min(9, count));
}

// A deterministic low-discrepancy scatter inside one grove cell. The old pass
// drew every crown at the same tile-relative offset, which survived even a
// random per-tree hash and read as a plantation. These points orbit a jittered
// grove centre at different radii, with independent size and species rolls.
export function treeClusterLayout({
    centerX = 0, centerY = 0, stepPx = 96, seed = 0, count = 3, spread = 0.42,
} = {}) {
    const total = Math.max(1, Math.min(10, Math.round(Number(count) || 1)));
    const spacing = Math.max(1, Number(stepPx) || 1);
    const reach = Math.max(0.08, Math.min(0.7, Number(spread) || 0.42)) * spacing;
    const points = [];
    for (let index = 0; index < total; index++) {
        const angle = index * 2.399963229728653
            + treeClusterRoll(seed, index * 5 + 1) * 0.9;
        const radial = Math.sqrt(0.1 + treeClusterRoll(seed, index * 5 + 2) * 0.82) * reach;
        const size = 0.84 + treeClusterRoll(seed, index * 5 + 3) * 0.28;
        points.push({
            x: centerX + Math.cos(angle) * radial,
            y: centerY + Math.sin(angle) * radial * 0.84,
            size,
            r1: treeClusterRoll(seed, index * 5 + 4),
            r2: treeClusterRoll(seed, index * 5 + 5),
            r3: treeClusterRoll(seed, index * 5 + 6),
        });
    }
    return points;
}

export function alignToWorldGrid(tile, step) {
    const value = Math.floor(Number(tile) || 0);
    const stride = Math.max(1, Math.floor(Number(step) || 1));
    const remainder = ((value % stride) + stride) % stride;
    const aligned = remainder === 0 ? value : value + (stride - remainder);
    return aligned === 0 ? 0 : aligned;
}

export function visibleTileBounds({
    cellPx, cameraX, cameraY, width, height, worldWidth, worldHeight,
}) {
    const px = Math.max(0.0001, Number(cellPx) || 0.0001);
    return {
        startX: Math.max(0, Math.floor((Number(cameraX) || 0) / px) - 1),
        startY: Math.max(0, Math.floor((Number(cameraY) || 0) / px) - 1),
        endX: Math.min(Math.max(0, Number(worldWidth) || 0), Math.ceil(((Number(cameraX) || 0) + (Number(width) || 0)) / px) + 1),
        endY: Math.min(Math.max(0, Number(worldHeight) || 0), Math.ceil(((Number(cameraY) || 0) + (Number(height) || 0)) / px) + 1),
    };
}

// A previously rasterised detail layer was drawn for `previousZoom` and
// `previousCamera`. This returns the CSS transform that keeps every old pixel
// on the world coordinate it belongs to after a pan or zoom:
//
//     screen = translate(x, y) scale(scale) * oldScreen
//
// `backingX/backingY/backingScale` are the same transform in backing pixels and
// are used when the old layer is copied onto a canvas rather than positioned in
// CSS (the WebGL decoration overlay).
export function detailLayerTransform({
    previousZoom, previousCameraX, previousCameraY, previousRenderScale = 1,
    zoom, cameraX, cameraY, renderScale = 1,
}) {
    const oldZoom = Number(previousZoom) || 1;
    const nextZoom = Number(zoom) || oldZoom;
    const oldCamX = Number(previousCameraX) || 0;
    const oldCamY = Number(previousCameraY) || 0;
    const nextCamX = Number(cameraX) || 0;
    const nextCamY = Number(cameraY) || 0;
    const oldScale = Math.max(0.0001, Number(previousRenderScale) || 1);
    const nextScale = Math.max(0.0001, Number(renderScale) || 1);
    const ratio = nextZoom / oldZoom;
    return {
        ratio,
        scale: ratio * oldScale / nextScale,
        x: (oldCamX * ratio - nextCamX) / nextScale,
        y: (oldCamY * ratio - nextCamY) / nextScale,
        backingX: oldCamX * ratio - nextCamX,
        backingY: oldCamY * ratio - nextCamY,
        backingScale: ratio,
    };
}

export function transformedLayerRect(transform, canvasWidth, canvasHeight, renderScale = 1) {
    const scale = Number(transform?.scale) || 1;
    const backingScale = Math.max(0.0001, Number(renderScale) || 1);
    return {
        x: (Number(transform?.x) || 0) * backingScale,
        y: (Number(transform?.y) || 0) * backingScale,
        width: Math.max(0, Number(canvasWidth) || 0) * scale,
        height: Math.max(0, Number(canvasHeight) || 0) * scale,
    };
}
