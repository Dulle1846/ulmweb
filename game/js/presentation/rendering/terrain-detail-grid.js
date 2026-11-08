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
