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

function activeRenderScale() {
    return Number(state.renderScale) || 1;
}

function cssViewportSize() {
    const canvas = state.canvas;
    const rect = canvas?.parentElement?.getBoundingClientRect?.();
    return {
        width: Math.max(1, Math.floor(rect?.width || canvas?.clientWidth || 1)),
        height: Math.max(1, Math.floor(rect?.height || canvas?.clientHeight || 1))
    };
}

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

    state.zoomLevel = resolveZoomLevel(state.zoom / activeRenderScale(), ZOOM_THRESHOLDS);
    clampCamera();
}

export function setZoomTarget(targetZoom, screenX, screenY) {
    const canvas = state.canvas;
    if (!canvas) return;

    const scale = activeRenderScale();
    const view = cssViewportSize();
    const anchorX = Number.isFinite(screenX) ? screenX : view.width / 2;
    const anchorY = Number.isFinite(screenY) ? screenY : view.height / 2;
    const worldAnchor = screenToWorld(anchorX, anchorY);

    state.zoomTarget = clampZoom(targetZoom, ZOOM_MIN, ZOOM_MAX) * scale;
    state.zoomAnchor = {
        worldX: worldAnchor.x,
        worldY: worldAnchor.y,
        screenX: anchorX * scale,
        screenY: anchorY * scale
    };
}

export function applyZoomDelta(delta, mouseScreenX, mouseScreenY) {
    if (!Number.isFinite(delta) || delta === 0) return;
    const scale = activeRenderScale();
    const target = (state.zoomTarget / scale) * Math.exp(-delta * ZOOM_SPEED);
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

    const worldPixelW = (Number(state.worldW)||WORLD_W) * CELL * state.zoom;
    const worldPixelH = (Number(state.worldH)||WORLD_H) * CELL * state.zoom;
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

// On phones the hand dock covers the lower part of the stage, so the opening
// view is raised by roughly half the dock height to keep the keep in sight.
function openingViewBias() {
    if (typeof window === "undefined") return 0;
    return (window.innerWidth <= 560 ? 88 : 0) * activeRenderScale();
}

export function centerCamera() {
    if (!state.canvas) return;
    state.camera.x = (Number(state.worldW)||WORLD_W) * CELL * state.zoom / 2 - state.canvas.width / 2;
    state.camera.y = (Number(state.worldH)||WORLD_H) * CELL * state.zoom / 2 - state.canvas.height / 2 + openingViewBias();
    clampCamera();
}

export function resize() {
    if (!state.canvas) return;

    const view = cssViewportSize();
    const scale = activeRenderScale();
    const width = Math.max(1, Math.round(view.width * scale));
    const height = Math.max(1, Math.round(view.height * scale));

    const oldWidth = state.canvas.width;
    const oldHeight = state.canvas.height;
    const centerWorldX = oldWidth > 0 ? (state.camera.x + oldWidth / 2) / (CELL * state.zoom) : (Number(state.worldW)||WORLD_W) / 2;
    const centerWorldY = oldHeight > 0 ? (state.camera.y + oldHeight / 2) / (CELL * state.zoom) : (Number(state.worldH)||WORLD_H) / 2;

    if (state.canvas.width !== width || state.canvas.height !== height) {
        // A resize changes screen coordinates; preserve the view centre and release a cursor anchor.
        state.zoomAnchor = null;
        state.canvas.width = width;
        state.canvas.height = height;
        const terrainCanvas = state.terrainCanvasEl || document.getElementById("terrain-canvas");
        if (terrainCanvas) {
            terrainCanvas.width = width;
            terrainCanvas.height = height;
        }
        state.camera.x = centerWorldX * CELL * state.zoom - width / 2;
        state.camera.y = centerWorldY * CELL * state.zoom - height / 2;
        clampCamera();
    }
}

// Optional downscale for weak devices. The canvas CSS size stays full; zoom and
// camera are stored in backing pixels, so the same world region is visible at
// every scale and all drawing code keeps one coordinate system.
export function setRenderScale(nextScale) {
    const scale = Math.max(0.25, Math.min(1, Number(nextScale) || 1));
    const canvas = state.canvas;
    if (!canvas) {
        state.renderScale = scale;
        return;
    }
    const previous = activeRenderScale();
    if (scale === previous) return;
    state.renderScale = scale;

    const centerWorldX = (state.camera.x + canvas.width / 2) / (CELL * state.zoom);
    const centerWorldY = (state.camera.y + canvas.height / 2) / (CELL * state.zoom);
    const ratio = scale / previous;
    state.zoom *= ratio;
    state.zoomTarget *= ratio;

    const view = cssViewportSize();
    const width = Math.max(1, Math.round(view.width * scale));
    const height = Math.max(1, Math.round(view.height * scale));
    canvas.width = width;
    canvas.height = height;
    const terrainCanvas = state.terrainCanvasEl || document.getElementById("terrain-canvas");
    if (terrainCanvas) {
        terrainCanvas.width = width;
        terrainCanvas.height = height;
    }
    state.camera.x = centerWorldX * CELL * state.zoom - width / 2;
    state.camera.y = centerWorldY * CELL * state.zoom - height / 2;
    state.zoomAnchor = null;
    state.zoomLevel = resolveZoomLevel(state.zoom / scale, ZOOM_THRESHOLDS);
    clampCamera();
}

export function screenToWorld(screenX, screenY) {
    const scale = CELL * state.zoom;
    const renderScale = activeRenderScale();
    return {
        x: (screenX * renderScale + state.camera.x) / scale,
        y: (screenY * renderScale + state.camera.y) / scale
    };
}

export function worldToScreen(worldX, worldY) {
    const scale = CELL * state.zoom;
    const renderScale = activeRenderScale();
    return {
        x: (worldX * scale - state.camera.x) / renderScale,
        y: (worldY * scale - state.camera.y) / renderScale
    };
}
