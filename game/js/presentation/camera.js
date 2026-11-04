// ═══════════════════════════════════════════════════════════════
//  CAMERA — Stufenloser Zoom, smooth, ohne Sprünge
// ═══════════════════════════════════════════════════════════════

import {
    WORLD_W, WORLD_H, CELL,
    ZOOM_MIN, ZOOM_MAX, ZOOM_SPEED, ZOOM_LERP,
    ZOOM_THRESHOLD_1_2, ZOOM_THRESHOLD_2_3,
} from '../core/config.js';
import { state } from '../core/state.js';

// ═══════════════════════════════════════════════════════════════
//  HAUPT-UPDATE (pro Frame)
// ═══════════════════════════════════════════════════════════════

export function updateCamera() {
    // Sanftes Zoom-Interpolieren
    const diff = state.zoomTarget - state.zoom;
    if (Math.abs(diff) > 0.0001) {
        state.zoom += diff * ZOOM_LERP;
    } else {
        state.zoom = state.zoomTarget;
    }

    // Zoom-Level berechnen
    if (state.zoom < ZOOM_THRESHOLD_1_2)      state.zoomLevel = 1;
    else if (state.zoom < ZOOM_THRESHOLD_2_3) state.zoomLevel = 2;
    else                                       state.zoomLevel = 3;

    clampCamera();
}

// ═══════════════════════════════════════════════════════════════
//  ZOOM PER MAUSRAD
// ═══════════════════════════════════════════════════════════════

export function applyZoomDelta(delta, mouseScreenX, mouseScreenY) {
    // Wir zoomen auf eine "interne" Variable, die wir dann sanft
    // Richtung state.zoomTarget bewegen. So fühlt sich der Zoom
    // flüssig an, egal wie schnell der User scrollt.

    const worldUnderMouseX = (mouseScreenX + state.camera.x) / (CELL * state.zoom);
    const worldUnderMouseY = (mouseScreenY + state.camera.y) / (CELL * state.zoom);

    // Sanfter Faktor: deltaY 100 = 0.92x rein, 0.92x raus
    const sensitivity = 0.0015;
    const factor = Math.exp(delta * sensitivity);

    const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, state.zoomTarget * factor));
    state.zoomTarget = newZoom;

    // KAMERA-KORREKTUR: Berechne die neue Kamera-Position so,
    // dass der Weltpunkt unter der Maus gleich bleibt.
    // (Zoom-to-cursor)
    const newCamX = worldUnderMouseX * CELL * newZoom - mouseScreenX;
    const newCamY = worldUnderMouseY * CELL * newZoom - mouseScreenY;

    state.camera.x = newCamX;
    state.camera.y = newCamY;
}

// ═══════════════════════════════════════════════════════════════
//  KAMERA BEGRENZEN
// ═══════════════════════════════════════════════════════════════

export function clampCamera() {
    const worldPixelW = WORLD_W * CELL * state.zoom;
    const worldPixelH = WORLD_H * CELL * state.zoom;
    const cw = state.canvas.width;
    const ch = state.canvas.height;

    // Wenn die Welt kleiner als der Viewport ist → zentrieren
    if (worldPixelW < cw) {
        state.camera.x = -(cw - worldPixelW) / 2;
    } else {
        // Sanftes Limit: erlaube max. 50% Überstand am Rand
        const maxX = worldPixelW - cw;
        const minX = 0;
        state.camera.x = Math.max(-maxX * 0.3, Math.min(state.camera.x, maxX * 1.3));
    }

    if (worldPixelH < ch) {
        state.camera.y = -(ch - worldPixelH) / 2;
    } else {
        const maxY = worldPixelH - ch;
        state.camera.y = Math.max(-maxY * 0.3, Math.min(state.camera.y, maxY * 1.3));
    }
}

// ═══════════════════════════════════════════════════════════════
//  KAMERA ZENTRIEREN
// ═══════════════════════════════════════════════════════════════

export function centerCamera() {
    const cx = WORLD_W / 2;
    const cy = WORLD_H / 2;

    state.camera.x = cx * CELL * state.zoom - state.canvas.width / 2;
    state.camera.y = cy * CELL * state.zoom - state.canvas.height / 2;
}

// ═══════════════════════════════════════════════════════════════
//  CANVAS-GRÖSSE
// ═══════════════════════════════════════════════════════════════

export function resize() {
    state.canvas.width = window.innerWidth - 290;
    state.canvas.height = window.innerHeight - 56;
}

// ═══════════════════════════════════════════════════════════════
//  KOORDINATEN-KONVERTIERUNG
// ═══════════════════════════════════════════════════════════════

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
