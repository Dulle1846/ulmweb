// ═══════════════════════════════════════════════════════════════
//  CAMERA — Viewport, stufenloser Zoom, Zoom-to-Cursor
// ═══════════════════════════════════════════════════════════════

import {
    WORLD_W, WORLD_H, CELL,
    ZOOM_MIN, ZOOM_MAX, ZOOM_SPEED, ZOOM_LERP,
    ZOOM_THRESHOLD_1_2, ZOOM_THRESHOLD_2_3,
} from './config.js';
import { state } from './state.js';

// ── Zoom anwenden (aufgerufen pro Frame) ──────────────────────

export function updateCamera(dt) {
    // Smoothes Zoom-Interpolieren
    const diff = state.zoomTarget - state.zoom;
    if (Math.abs(diff) > 0.001) {
        state.zoom += diff * Math.min(1, ZOOM_LERP * dt * 60);
    } else {
        state.zoom = state.zoomTarget;
    }

    // Zoom-Level berechnen
    if (state.zoom < ZOOM_THRESHOLD_1_2) {
        state.zoomLevel = 1;
    } else if (state.zoom < ZOOM_THRESHOLD_2_3) {
        state.zoomLevel = 2;
    } else {
        state.zoomLevel = 3;
    }

    clampCamera();
}

// ── Zoom per Mausrad ──────────────────────────────────────────

export function applyZoomDelta(delta, mouseScreenX, mouseScreenY) {
    const oldZoom = state.zoomTarget;

    // Exponentieller Zoom (wie CK3)
    const factor = Math.exp(-delta * ZOOM_SPEED);
    state.zoomTarget = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, state.zoomTarget * factor));

    // Zoom-to-cursor: Weltpunkt unter der Maus beibehalten
    const worldXBefore = (mouseScreenX + state.camera.x) / (CELL * oldZoom);
    const worldYBefore = (mouseScreenY + state.camera.y) / (CELL * oldZoom);

    const worldXAfter = (mouseScreenX + state.camera.x) / (CELL * state.zoomTarget);
    const worldYAfter = (mouseScreenY + state.camera.y) / (CELL * state.zoomTarget);

    state.camera.x += (worldXBefore - worldXAfter) * CELL * state.zoomTarget;
    state.camera.y += (worldYBefore - worldYAfter) * CELL * state.zoomTarget;
}

// ── Kamera begrenzen ──────────────────────────────────────────

export function clampCamera() {
    const worldPixelW = WORLD_W * CELL * state.zoom;
    const worldPixelH = WORLD_H * CELL * state.zoom;
    const cw = state.canvas.width;
    const ch = state.canvas.height;

    // Erlaube etwas Überziehen, damit man die Ränder sieht
    const margin = 100;

    state.camera.x = Math.max(-margin, Math.min(state.camera.x, worldPixelW - cw + margin));
    state.camera.y = Math.max(-margin, Math.min(state.camera.y, worldPixelH - ch + margin));
}

// ── Kamera zentrieren ─────────────────────────────────────────

export function centerCamera() {
    const cx = WORLD_W / 2;
    const cy = WORLD_H / 2;

    state.camera.x = cx * CELL * state.zoom - state.canvas.width / 2;
    state.camera.y = cy * CELL * state.zoom - state.canvas.height / 2;
}

// ── Canvas-Größe anpassen ─────────────────────────────────────

export function resize() {
    state.canvas.width = window.innerWidth - 290;
    state.canvas.height = window.innerHeight - 56;
}

// ── Bildschirm → Welt Konvertierung ──────────────────────────

export function screenToWorld(sx, sy) {
    return {
        x: (sx + state.camera.x) / (CELL * state.zoom),
        y: (sy + state.camera.y) / (CELL * state.zoom),
    };
}

export function worldToScreen(wx, wy) {
    return {
        x: wx * CELL * state.zoom - state.camera.x,
        y: wy * CELL * state.zoom - state.camera.y,
    };
}
