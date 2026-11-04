// ═══════════════════════════════════════════════════════════════
//  TERRAIN RENDERING — Smooth Perlin, LOD, Dekoration
// ═══════════════════════════════════════════════════════════════

import { WORLD_W, WORLD_H, CELL, BIOME } from '../../core/config.js';
import { state } from '../../core/state.js';
import { getHeightAt } from '../../world/world.js';

// ═══════════════════════════════════════════════════════════════
//  TERRAIN ZEICHNEN
// ═══════════════════════════════════════════════════════════════

export function drawTerrain(ctx) {
    const zoom = state.zoom;
    const cam = state.camera;
    const canvas = state.canvas;
    const tc = state.terrainCanvas;

    if (!tc) return;

    const res = state.terrainResolution;

    // Welcher Bereich des Terrain-Canvas ist sichtbar?
    const srcX = (cam.x / (CELL * zoom)) * res;
    const srcY = (cam.y / (CELL * zoom)) * res;
    const srcW = (canvas.width / (CELL * zoom)) * res;
    const srcH = (canvas.height / (CELL * zoom)) * res;

    // Clamp
    const sx = Math.max(0, Math.floor(srcX));
    const sy = Math.max(0, Math.floor(srcY));
    const sw = Math.min(tc.width - sx, Math.ceil(srcW) + 2);
    const sh = Math.min(tc.height - sy, Math.ceil(srcH) + 2);

    if (sw <= 0 || sh <= 0) return;

    // Zeichne den sichtbaren Ausschnitt des vorgerenderten Terrains
    ctx.save();
    ctx.imageSmoothingEnabled = zoom < 1.5;

    const destX = -(cam.x % (CELL * zoom * (1 / res)));
    const destY = -(cam.y % (CELL * zoom * (1 / res)));

    ctx.drawImage(
        tc,
        sx, sy, sw, sh,
        Math.floor((sx * CELL * zoom / res) - cam.x),
        Math.floor((sy * CELL * zoom / res) - cam.y),
        Math.ceil(sw * CELL * zoom / res),
        Math.ceil(sh * CELL * zoom / res)
    );

    ctx.restore();

    // ── Fog of War ───────────────────────────────────────────
    drawFogOfWar(ctx, zoom, cam, canvas);

    // ── Level-2/3 Dekorationen ───────────────────────────────
    if (state.zoomLevel >= 2) {
        drawTerrainDecorations(ctx, zoom, cam, canvas);
    }
}

// ═══════════════════════════════════════════════════════════════
//  FOG OF WAR
// ═══════════════════════════════════════════════════════════════

function getFogCanvas() {
    let fog=state.fogCanvas;
    if(!fog){
        fog=document.createElement("canvas");
        fog.width=WORLD_W;fog.height=WORLD_H;
        state.fogCanvas=fog;
        state.fogDirty=true;
    }
    if(state.fogDirty||state.fogExploredRef!==state.explored){
        const fctx=fog.getContext("2d");
        const image=fctx.createImageData(WORLD_W,WORLD_H);
        const pixels=image.data;
        for(let y=0;y<WORLD_H;y++){
            for(let x=0;x<WORLD_W;x++){
                if(state.explored[x]?.[y])continue;
                const i=(y*WORLD_W+x)*4;
                pixels[i]=8;pixels[i+1]=10;pixels[i+2]=8;pixels[i+3]=235;
            }
        }
        fctx.putImageData(image,0,0);
        state.fogDirty=false;
        state.fogExploredRef=state.explored;
    }
    return fog;
}

function drawFogOfWar(ctx, zoom, cam, canvas) {
    const fog=getFogCanvas();
    const cellPx=CELL*zoom;
    ctx.save();
    ctx.imageSmoothingEnabled=false;
    ctx.drawImage(
        fog,0,0,WORLD_W,WORLD_H,
        -cam.x,-cam.y,WORLD_W*cellPx,WORLD_H*cellPx
    );
    ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
//  DEKORATIONEN (Bäume, Steine, Blumen) — nur Level 2+
// ═══════════════════════════════════════════════════════════════

function drawTerrainDecorations(ctx, zoom, cam, canvas) {
    const cellPx = CELL * zoom;
    const tick = state.tick;

    const startX = Math.max(0, Math.floor(cam.x / cellPx) - 1);
    const startY = Math.max(0, Math.floor(cam.y / cellPx) - 1);
    const endX = Math.min(WORLD_W, Math.ceil((cam.x + canvas.width) / cellPx) + 1);
    const endY = Math.min(WORLD_H, Math.ceil((cam.y + canvas.height) / cellPx) + 1);

    // LOD: Bei mittlerem Zoom weniger Dekos
    const step = zoom < 0.22 ? 8 : zoom < 0.55 ? 5 : zoom < 1.05 ? 3 : zoom < 1.7 ? 2 : 1;
    const forestLine=BIOME.FOREST-(((state.worldOptions?.forests??52)-50)*0.0016);

    for (let x = startX; x < endX; x += step) {
        for (let y = startY; y < endY; y += step) {
            if (!state.explored[x] || !state.explored[x][y]) continue;

            const h = getHeightAt(x + 0.5, y + 0.5);
            const seed = ((x * 73856093) ^ (y * 19349663)) >>> 0;
            const s1 = (seed % 100) / 100;
            const s2 = ((seed >> 4) % 100) / 100;

            const px = x * cellPx - cam.x + cellPx / 2;
            const py = y * cellPx - cam.y + cellPx / 2;

            // Bäume bei forest
            if (h >= forestLine && h < BIOME.ROCK && s1 > 0.3) {
                drawTree(ctx, px, py, cellPx, tick, s1, s2, zoom);
            }

            // Steine bei rock
            if (h >= BIOME.ROCK && h < BIOME.SNOW && s1 > 0.5) {
                drawRock(ctx, px, py, cellPx, zoom);
            }

            // Blumen bei Gras (nur Level 3)
            if (state.zoomLevel >= 3 && h >= BIOME.GRASS && h < BIOME.DENSE_GRASS && s2 > 0.88) {
                drawFlower(ctx, px, py, cellPx, s1);
            }

            // Grashalme (nur Level 3)
            if (state.zoomLevel >= 3 && h >= BIOME.SAND && h < BIOME.FOREST && s1 > 0.75) {
                drawGrassTufts(ctx, px, py, cellPx, s2);
            }
        }
    }
}

function drawTree(ctx, px, py, cellPx, tick, s1, s2, zoom) {
    const scale = cellPx / 48;
    const sway = Math.sin(tick * 0.05 + s1 * 10 + s2 * 7) * 1.5 * scale;

    // Stamm
    ctx.fillStyle = "#5d4028";
    ctx.fillRect(px - 3 * scale, py + 2 * scale, 6 * scale, 14 * scale);

    // Krone
    ctx.fillStyle = "#2d6b30";
    ctx.beginPath();
    ctx.arc(px + sway, py - 4 * scale, 14 * scale, 0, Math.PI * 2);
    ctx.fill();

    // Highlight
    ctx.fillStyle = "#4a9e4e";
    ctx.beginPath();
    ctx.arc(px - 4 * scale + sway, py - 8 * scale, 7 * scale, 0, Math.PI * 2);
    ctx.fill();

    if (zoom > 1.2) {
        ctx.fillStyle = "#65c46a";
        ctx.beginPath();
        ctx.arc(px - 6 * scale + sway, py - 10 * scale, 3 * scale, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawRock(ctx, px, py, cellPx, zoom) {
    const s = cellPx / 48;
    ctx.fillStyle = "#6e6e6e";
    ctx.beginPath();
    ctx.moveTo(px - 10 * s, py + 8 * s);
    ctx.lineTo(px - 6 * s, py - 6 * s);
    ctx.lineTo(px + 6 * s, py - 4 * s);
    ctx.lineTo(px + 10 * s, py + 8 * s);
    ctx.closePath();
    ctx.fill();

    if (zoom > 1.0) {
        ctx.fillStyle = "#9a9a9a";
        ctx.beginPath();
        ctx.moveTo(px - 5 * s, py);
        ctx.lineTo(px - 1 * s, py - 5 * s);
        ctx.lineTo(px + 3 * s, py - 2 * s);
        ctx.lineTo(px - 2 * s, py + 2 * s);
        ctx.closePath();
        ctx.fill();
    }
}

function drawFlower(ctx, px, py, cellPx, s1) {
    const r = cellPx * 0.06;
    ctx.fillStyle = s1 > 0.5 ? "#e8638c" : "#f5f1d0";
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f2c744";
    ctx.beginPath();
    ctx.arc(px, py, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
}

function drawGrassTufts(ctx, px, py, cellPx, s2) {
    const s = cellPx / 48;
    ctx.strokeStyle = "#2c5a2c";
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    ctx.moveTo(px, py + 4 * s);
    ctx.lineTo(px - 2 * s, py - 5 * s);
    ctx.moveTo(px + 3 * s, py + 4 * s);
    ctx.lineTo(px + 5 * s, py - 4 * s);
    ctx.stroke();
}
