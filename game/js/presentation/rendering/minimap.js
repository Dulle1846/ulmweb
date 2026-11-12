// ═══════════════════════════════════════════════════════════════
//  MINIMAP — terrain, structures, army and viewport
// ═══════════════════════════════════════════════════════════════

import { WORLD_W, WORLD_H, CELL, BIOME } from '../../core/config.js';
import { TYPE } from '../../core/types.js';
import { state } from '../../core/state.js';

// The terrain half of the minimap only changes when the world or explored
// mask changes. Redrawing ~7,700 sampled cells every 400 ms was real main-
// thread work that sat outside the world-draw timer and could delay a frame.
// Keep that static half in a small offscreen cache; entities and the camera
// rectangle are still redrawn on every minimap tick.
let minimapTerrainCanvas = null;
let minimapTerrainCtx = null;
let minimapTerrainKey = "";

function minimapTerrain(W, H, scaleX, scaleY, sea, step) {
    const mw = 140;
    const mh = 140;
    if (!minimapTerrainCanvas) {
        minimapTerrainCanvas = document.createElement('canvas');
        minimapTerrainCanvas.width = mw;
        minimapTerrainCanvas.height = mh;
        minimapTerrainCtx = minimapTerrainCanvas.getContext('2d', { alpha: false });
        minimapTerrainKey = "";
    }
    const key = [
        W, H, step, sea,
        Number(state.terrainVersion) || 0,
        Number(state.exploredRevision) || 0,
        Number(state.worldSeed) || 0,
        Number(state.terrainResolution) || 0,
        Number(state.terrainPixW) || 0,
        Number(state.terrainPixH) || 0,
    ].join("|");
    if (key === minimapTerrainKey) return minimapTerrainCanvas;
    minimapTerrainKey = key;
    const mctx = minimapTerrainCtx;
    mctx.fillStyle = '#052e16';
    mctx.fillRect(0, 0, mw, mh);
    for (let x = 0; x < W; x += step) {
        for (let y = 0; y < H; y += step) {
            if (!state.explored[x]?.[y]) continue;
            const h = state.heightMap
                ? state.heightMap[Math.min(state.terrainPixH - 1, Math.floor((y + 0.5) * state.terrainResolution)) * state.terrainPixW + Math.min(state.terrainPixW - 1, Math.floor((x + 0.5) * state.terrainResolution))]
                : 0;

            if (h < sea) mctx.fillStyle = '#0c4a6e';
            else if (h < sea + 0.02) mctx.fillStyle = '#c2b280';
            else if (h < BIOME.FOREST) mctx.fillStyle = '#365314';
            else if (h < BIOME.ROCK) mctx.fillStyle = '#166534';
            else mctx.fillStyle = '#6e6e6e';

            mctx.fillRect(
                Math.floor(x * scaleX),
                Math.floor(y * scaleY),
                Math.ceil(step * scaleX) + 1,
                Math.ceil(step * scaleY) + 1
            );
        }
    }
    return minimapTerrainCanvas;
}

export function updateMinimap() {
    const mctx = state.minimapCtx;
    if (!mctx) return;

    const mw = 140;
    const mh = 140;
    const W = Number(state.worldW) || WORLD_W;
    const H = Number(state.worldH) || WORLD_H;
    const scaleX = mw / W;
    const scaleY = mh / H;
    const sea = Number(state.seaLevel) || BIOME.SHALLOW_WATER;
    const step = Math.max(2, Math.floor(Math.max(W, H) / 64));
    mctx.drawImage(minimapTerrain(W, H, scaleX, scaleY, sea, step), 0, 0);

    state.entities.forEach(e => {
        if (e.dead) return;
        let color = '#eab308';
        if (e.isEnemy()) color = '#e11d48';
        if (e.type === TYPE.KEEP) color = '#f2c744';
        if (e.isBuilding() && e.type !== TYPE.KEEP) color = '#b8a37a';

        mctx.fillStyle = color;
        mctx.fillRect(
            Math.floor(e.x * scaleX) - 1,
            Math.floor(e.y * scaleY) - 1,
            3, 3
        );
    });

    const zoom = state.zoom;
    const left = Math.max(0, Math.min(W, state.camera.x / (CELL * zoom)));
    const top = Math.max(0, Math.min(H, state.camera.y / (CELL * zoom)));
    const right = Math.max(left, Math.min(W, (state.camera.x + state.canvas.width) / (CELL * zoom)));
    const bottom = Math.max(top, Math.min(H, (state.camera.y + state.canvas.height) / (CELL * zoom)));
    const camX = left * scaleX;
    const camY = top * scaleY;
    const camW = Math.max(0, (right - left) * scaleX);
    const camH = Math.max(0, (bottom - top) * scaleY);

    mctx.strokeStyle = '#fcd34d';
    mctx.lineWidth = 1.5;
    mctx.strokeRect(camX, camY, camW, camH);

    const labels = ['', 'L1', 'L2', 'L3', 'L4'];
    mctx.fillStyle = '#fcd34d';
    mctx.font = 'bold 9px monospace';
    mctx.fillText(labels[state.zoomLevel], 3, 10);
}
