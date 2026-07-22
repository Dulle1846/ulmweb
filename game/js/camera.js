// ── Camera / Viewport Logic ────────────────────────────────────

import { TILE_SIZE, WORLD_WIDTH, WORLD_HEIGHT } from './config.js';
import { state } from './state.js';

export function clampCamera() {
    state.camera.x = Math.max(0, Math.min(
        state.camera.x,
        WORLD_WIDTH * TILE_SIZE - state.canvas.width
    ));
    state.camera.y = Math.max(0, Math.min(
        state.camera.y,
        WORLD_HEIGHT * TILE_SIZE - state.canvas.height
    ));
}

export function centerCamera() {
    state.camera.x = (WORLD_WIDTH * TILE_SIZE / 2) - state.canvas.width / 2 + 120;
    state.camera.y = (WORLD_HEIGHT * TILE_SIZE / 2) - state.canvas.height / 2 - 80;
}

export function resize() {
    state.canvas.width  = window.innerWidth - 290;
    state.canvas.height = window.innerHeight - 56;
}
