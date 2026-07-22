// ── Minimap Rendering ──────────────────────────────────────────

import { WORLD_WIDTH, WORLD_HEIGHT, TILE_SIZE } from '../config.js';
import { TYPE } from '../types.js';
import { state } from '../state.js';

export function updateMinimap() {
    const mctx = state.minimapCtx;
    if (!mctx) return;

    mctx.fillStyle = "#052e16";
    mctx.fillRect(0, 0, 140, 140);

    const scale = 140 / WORLD_WIDTH;

    for (let x = 0; x < WORLD_WIDTH; x += 6) {
        for (let y = 0; y < WORLD_HEIGHT; y += 6) {
            if (!state.explored[x] || !state.explored[x][y]) continue;

            const terrain = state.world[x][y].terrain;
            if (terrain === "water")      mctx.fillStyle = "#0c4a6e";
            else if (terrain === "forest") mctx.fillStyle = "#166534";
            else                           mctx.fillStyle = "#365314";

            mctx.fillRect(x * scale, y * scale, 5, 5);
        }
    }

    // entity dots
    state.entities.forEach(e => {
        if (e.dead) return;
        let color = "#eab308";
        if (e.isEnemy())        color = "#e11d48";
        if (e.type === TYPE.KEEP) color = "#854d0e";

        mctx.fillStyle = color;
        mctx.fillRect(e.x * scale - 1, e.y * scale - 1, 3, 3);
    });

    // camera viewport
    const camX = (state.camera.x / (WORLD_WIDTH * TILE_SIZE)) * 140;
    const camY = (state.camera.y / (WORLD_HEIGHT * TILE_SIZE)) * 140;
    const camW = (state.canvas.width / (WORLD_WIDTH * TILE_SIZE)) * 140;
    const camH = (state.canvas.height / (WORLD_HEIGHT * TILE_SIZE)) * 140;

    mctx.strokeStyle = "#fcd34d";
    mctx.lineWidth = 2;
    mctx.strokeRect(camX, camY, camW, camH);
}
