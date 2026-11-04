// Camera, zoom interpolation and world/screen coordinate conversion.

import {
    WORLD_W, WORLD_H, CELL,
    ZOOM_MIN, ZOOM_MAX, ZOOM_SPEED, ZOOM_LERP,
    ZOOM_THRESHOLD_DISTRICTS, ZOOM_THRESHOLD_ROOFTOPS, ZOOM_THRESHOLD_INTERIORS
} from '../core/config.js';
import { state } from '../core/state.js';
import {
    ZOOM_PRESETS,
    clampZoom,
    resolveZoomLevel,
    interpolateZoom,
    cameraOffsetForAnchor
} from '../core/zoom-model.js';

const ZOOM_THRESHOLDS = {
    district: ZOOM_THRESHOLD_DISTRICTS,
    rooftops: ZOOM_THRESHOLD_ROOFTOPS,
    interiors: ZOOM_THRESHOLD_INTERIORS
};

export function updateCamera(deltaSeconds = 1 / 60) {
    state.zoom = interpolateZoom(state.zoom, state.zoomTarget, deltaSeconds, ZOOM_LERP);

    if (state.zoomAnchor) {
        const anchor = state.zoomAnchor;
        state.camera.x = cameraOffsetForAnchor(anchor.worldX, anchor.screenX, CELL, state.zoom);
        state.camera.y = cameraOffsetForAnchor(anchor.worldY, anchor.screenY, CELL, state.zoom);

        if (state.zoom === state.zoomTarget) {
            state.zoomAnchor = null;
        }
    }

    state.zoomLevel = resolveZoomLevel(state.zoom, ZOOM_THRESHOLDS);
    clampCamera();
}

export function setZoomTarget(targetZoom, screenX, screenY) {
    const canvas = state.canvas;
    if (!canvas) return;

    const anchorX = Number.isFinite(screenX) ? screenX : canvas.width / 2;
    const anchorY = Number.isFinite(screenY) ? screenY : canvas.height / 2;
    const worldAnchor = screenToWorld(anchorX, anchorY);

    state.zoomTarget = clampZoom(targetZoom, ZOOM_MIN, ZOOM_MAX);
    state.zoomAnchor = {
        worldX: worldAnchor.x,
        worldY: worldAnchor.y,
        screenX: anchorX,
        screenY: anchorY
    };
}

export function applyZoomDelta(delta, mouseScreenX, mouseScreenY) {
    if (!Number.isFinite(delta) || delta === 0) return;
    const target = state.zoomTarget * Math.exp(-delta * ZOOM_SPEED);
    setZoomTarget(target, mouseScreenX, mouseScreenY);
}

export function setZoomLevel(level) {
    const index = Number(level) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= ZOOM_PRESETS.length) {
        throw new RangeError("Zoom level must be between 1 and 4.");
    }
    setZoomTarget(ZOOM_PRESETS[index]);
}

export function clampCamera() {
    if (!state.canvas) return;

    const worldPixelW = WORLD_W * CELL * state.zoom;
    const worldPixelH = WORLD_H * CELL * state.zoom;
    const viewportW = state.canvas.width;
    const viewportH = state.canvas.height;

    if (worldPixelW <= viewportW) {
        state.camera.x = (worldPixelW - viewportW) / 2;
    } else {
        state.camera.x = Math.max(0, Math.min(state.camera.x, worldPixelW - viewportW));
    }

    if (worldPixelH <= viewportH) {
        state.camera.y = (worldPixelH - viewportH) / 2;
    } else {
        state.camera.y = Math.max(0, Math.min(state.camera.y, worldPixelH - viewportH));
    }
}

export function centerCamera() {
    if (!state.canvas) return;
    state.camera.x = WORLD_W * CELL * state.zoom / 2 - state.canvas.width / 2;
    state.camera.y = WORLD_H * CELL * state.zoom / 2 - state.canvas.height / 2;
    clampCamera();
}

export function resize() {
    if (!state.canvas) return;

    const wrapper = state.canvas.parentElement;
    const rect = wrapper?.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect?.width || window.innerWidth));
    const height = Math.max(1, Math.floor(rect?.height || window.innerHeight));

    const oldWidth = state.canvas.width;
    const oldHeight = state.canvas.height;
    const centerWorldX = oldWidth > 0 ? (state.camera.x + oldWidth / 2) / (CELL * state.zoom) : WORLD_W / 2;
    const centerWorldY = oldHeight > 0 ? (state.camera.y + oldHeight / 2) / (CELL * state.zoom) : WORLD_H / 2;

    if (state.canvas.width !== width || state.canvas.height !== height) {
        // A resize changes screen coordinates; preserve the view centre and release a cursor anchor.
        state.zoomAnchor = null;
        state.canvas.width = width;
        state.canvas.height = height;
        state.camera.x = centerWorldX * CELL * state.zoom - width / 2;
        state.camera.y = centerWorldY * CELL * state.zoom - height / 2;
        clampCamera();
    }
}

export function screenToWorld(screenX, screenY) {
    const scale = CELL * state.zoom;
    return {
        x: (screenX + state.camera.x) / scale,
        y: (screenY + state.camera.y) / scale
    };
}

export function worldToScreen(worldX, worldY) {
    const scale = CELL * state.zoom;
    return {
        x: worldX * scale - state.camera.x,
        y: worldY * scale - state.camera.y
    };
}
