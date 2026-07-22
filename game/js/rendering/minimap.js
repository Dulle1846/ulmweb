// ═══════════════════════════════════════════════════════════════
//  MINIMAP — mit Zoom-Level-Anzeige
// ═══════════════════════════════════════════════════════════════

import { WORLD_W, WORLD_H, CELL, BIOME } from '../config.js';
import { TYPE } from '../types.js';
import { state } from '../state.js';
import { getHeightAt } from '../world/world.js';

export function updateMinimap() {
    const mctx = state.minimapCtx;
    if (!mctx) return;

    const mw = 140;
    const mh = 140;

    mctx.fillStyle = "#052e16";
    mctx.fillRect(0, 0, mw, mh);

    const scaleX = mw / WORLD_W;
    const scaleY = mh / WORLD_H;

    // Terrain (gesampled)
    const step = 3;
    for (let x = 0; x < WORLD_W; x += step) {
        for (let y = 0; y < WORLD_H; y += step) {
            if (!state.explored[x] || !state.explored[x][y]) continue;

            const h = getHeightAt(x + 0.5, y + 0.5);

            if (h < BIOME.SHALLOW_WATER) mctx.fillStyle = "#0c4a6e";
            else if (h < BIOME.SAND)      mctx.fillStyle = "#c2b280";
            else if (h < BIOME.FOREST)    mctx.fillStyle = "#365314";
            else if (h < BIOME.ROCK)      mctx.fillStyle = "#166534";
            else                           mctx.fillStyle = "#6e6e6e";

            mctx.fillRect(
                Math.floor(x * scaleX),
                Math.floor(y * scaleY),
                Math.ceil(step * scaleX) + 1,
                Math.ceil(step * scaleY) + 1
            );
        }
    }

    // Entities
    state.entities.forEach(e => {
        if (e.dead) return;
        let color = "#eab308";
        if (e.isEnemy()) color = "#e11d48";
        if (e.type === TYPE.KEEP) color = "#f2c744";

        mctx.fillStyle = color;
        mctx.fillRect(
            Math.floor(e.x * scaleX) - 1,
            Math.floor(e.y * scaleY) - 1,
            3, 3
        );
    });

    // Kamera-Viewport
    const zoom = state.zoom;
    const camX = (state.camera.x / (WORLD_W * CELL * zoom)) * mw;
    const camY = (state.camera.y / (WORLD_H * CELL * zoom)) * mh;
    const camW = (state.canvas.width / (WORLD_W * CELL * zoom)) * mw;
    const camH = (state.canvas.height / (WORLD_H * CELL * zoom)) * mh;

    mctx.strokeStyle = "#fcd34d";
    mctx.lineWidth = 1.5;
    mctx.strokeRect(camX, camY, camW, camH);

    // Zoom-Level Text
    const labels = ["", "L1", "L2", "L3"];
    mctx.fillStyle = "#fcd34d";
    mctx.font = "bold 9px monospace";
    mctx.fillText(labels[state.zoomLevel], 3, 10);
}
