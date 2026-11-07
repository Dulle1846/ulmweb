// ═══════════════════════════════════════════════════════════════
//  TERRAIN RENDERING — baked ground, living detail
// ═══════════════════════════════════════════════════════════════

import { WORLD_W, WORLD_H, CELL } from '../../core/config.js';
import { state } from '../../core/state.js';
import { getHeightAt, getMoistureAt, getTemperatureAt, worldWidth, worldHeight } from '../../world/world.js';
import { drawTerrainGL } from './terrain-webgl.js';

const worldW = () => Number(state.worldW) || WORLD_W;
const worldH = () => Number(state.worldH) || WORLD_H;

// ═══════════════════════════════════════════════════════════════
//  GROUND
// ═══════════════════════════════════════════════════════════════

export function drawTerrain(ctx) {
    const zoom = state.zoom;
    const cam = state.camera;
    const canvas = state.canvas;
    const glActive = drawTerrainGL();

    if (!glActive) {
        drawBakedGround(ctx, zoom, cam, canvas);
        if (state.zoomLevel >= 3) drawGroundGrain(ctx, zoom, cam, canvas);
    }

    drawFogOfWar(ctx, zoom, cam, canvas);
    if (state.zoomLevel >= 2) drawTerrainDecorations(ctx, zoom, cam, canvas);
}

function drawBakedGround(ctx, zoom, cam, canvas) {
    // Safety net for browsers without WebGL2. Smoothing stays on even at the
    // closest zoom; the old hard nearest-neighbour switch was the main source
    // of the visible block pattern.
    const tc = state.terrainCanvas;
    ctx.save();
    ctx.fillStyle = "#0a120a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!tc) {
        ctx.restore();
        return;
    }

    const res = state.terrainResolution || 1;
    const pxPerWorld = CELL * zoom;

    const srcX = Math.max(0, (cam.x / pxPerWorld) * res);
    const srcY = Math.max(0, (cam.y / pxPerWorld) * res);
    const srcW = (canvas.width / pxPerWorld) * res;
    const srcH = (canvas.height / pxPerWorld) * res;

    const sx = Math.max(0, Math.floor(srcX));
    const sy = Math.max(0, Math.floor(srcY));
    const sw = Math.min(tc.width - sx, Math.ceil(srcW) + 2);
    const sh = Math.min(tc.height - sy, Math.ceil(srcH) + 2);

    if (sw <= 0 || sh <= 0) {
        ctx.restore();
        return;
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
        tc,
        sx, sy, sw, sh,
        Math.floor((sx / res) * pxPerWorld - cam.x),
        Math.floor((sy / res) * pxPerWorld - cam.y),
        Math.ceil((sw / res) * pxPerWorld),
        Math.ceil((sh / res) * pxPerWorld)
    );
    ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
//  FOG OF WAR
// ═══════════════════════════════════════════════════════════════

function getFogCanvas() {
    let fog = state.fogCanvas;
    const W = worldW(), H = worldH();
    if (!fog || fog.width !== W || fog.height !== H) {
        fog = document.createElement('canvas');
        fog.width = W;
        fog.height = H;
        state.fogCanvas = fog;
        state.fogDirty = true;
        state.fogExploredRef = null;
    }
    if (state.fogDirty || state.fogExploredRef !== state.explored) {
        const fctx = fog.getContext('2d');
        const image = fctx.createImageData(W, H);
        const pixels = image.data;
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                if (state.explored[x]?.[y]) continue;
                const i = (y * W + x) * 4;
                pixels[i] = 8; pixels[i + 1] = 10; pixels[i + 2] = 8; pixels[i + 3] = 235;
            }
        }
        fctx.putImageData(image, 0, 0);
        state.fogDirty = false;
        state.fogExploredRef = state.explored;
    }
    return fog;
}

function drawFogOfWar(ctx, zoom, cam, canvas) {
    const fog = getFogCanvas();
    const cellPx = CELL * zoom;
    ctx.save();
    // The exploration mask is one cell per tile. Bilinear display would soften
    // the old hard cell edges; the fog itself is still authoritative.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(fog, 0, 0, fog.width, fog.height, -cam.x, -cam.y, fog.width * cellPx, fog.height * cellPx);
    ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
//  DECORATIONS — vegetation and props follow the biome
// ═══════════════════════════════════════════════════════════════

function drawTerrainDecorations(ctx, zoom, cam, canvas) {
    const cellPx = CELL * zoom;
    const tick = state.tick;
    const sea = state.seaLevel ?? 0.33;
    const season = state.seasonIndex ?? 0;

    const startX = Math.max(0, Math.floor(cam.x / cellPx) - 1);
    const startY = Math.max(0, Math.floor(cam.y / cellPx) - 1);
    const endX = Math.min(worldW(), Math.ceil((cam.x + canvas.width) / cellPx) + 1);
    const endY = Math.min(worldH(), Math.ceil((cam.y + canvas.height) / cellPx) + 1);

    const step = zoom < 0.16 ? 9 : zoom < 0.3 ? 6 : zoom < 0.55 ? 4 : zoom < 1.0 ? 2 : 1;

    for (let x = startX; x < endX; x += step) {
        for (let y = startY; y < endY; y += step) {
            if (!state.explored[x]?.[y]) continue;

            const wx = x + 0.5, wy = y + 0.5;
            const h = getHeightAt(wx, wy);
            const m = getMoistureAt(wx, wy);
            const temp = getTemperatureAt(wx, wy);
            const seed = ((x * 73856093) ^ (y * 19349663)) >>> 0;
            const s1 = (seed % 1000) / 1000;
            const s2 = ((seed >> 7) % 1000) / 1000;
            const s3 = ((seed >> 13) % 1000) / 1000;

            const px = x * cellPx - cam.x + cellPx * (0.25 + s2 * 0.5);
            const py = y * cellPx - cam.y + cellPx * (0.3 + s3 * 0.45);
            const above = h - sea;

            // Only the shoreline band needs to know where the water lies.
            const shoreDir = above > -0.01 && above < 0.09 ? shoreDirection(x, y, sea) : null;

            // Open water: animated glints and shore foam.
            if (above < 0) {
                if (zoom >= 0.5 && s1 > 0.72) drawWaterGlint(ctx, px, py, cellPx, tick, s1);
                if (above > -0.02 && s1 > 0.5) drawShoreFoam(ctx, px, py, cellPx, tick, s2, zoom);
                continue;
            }

            // The shoreline is a place, not a colour boundary: wet sand,
            // pebbles, driftwood and denser reed clusters sit on the land side.
            if (above < 0.055 && m > 0.3) {
                if (shoreDir && above < 0.016) drawWetEdge(ctx, px, py, cellPx, shoreDir, s1);
                if (s1 > 0.42) drawReeds(ctx, px, py, cellPx, s1, s2, temp, shoreDir);
                else if (s1 > 0.30) drawShoreStones(ctx, px, py, cellPx, s1, s2);
                else if (s1 > 0.27) drawDriftwood(ctx, px, py, cellPx, s1, shoreDir);
                continue;
            }

            // Snowfields get sparse rocks and drifts, not grass.
            if (temp < 0.22 || h > 0.9) {
                if (s1 > 0.72) drawSnowTuft(ctx, px, py, cellPx, s1);
                else if (s1 > 0.62) drawRock(ctx, px, py, cellPx, zoom, true);
                continue;
            }

            // Mountain rock and scree.
            if (h > 0.76 && s1 > 0.4) {
                drawRock(ctx, px, py, cellPx, zoom, false);
                continue;
            }

            const cluster = 0.5 + 0.5 * Math.sin(x * 0.19 + y * 0.13) * Math.sin(x * 0.06 - y * 0.11);
            const forestDensity = Math.max(0, Math.min(1,
                (m - 0.4) / 0.42 + (state.worldOptions?.forests ?? 52) * 0.001 - 0.05));
            const treeChance = (0.08 + forestDensity * 0.72) * (0.5 + cluster * 0.95);
            if (forestDensity > 0.08 && s1 < treeChance) {
                drawTree(ctx, px, py, cellPx, tick, s1, s2, zoom, temp, m, season, shoreDir);
                continue;
            }
            if (cluster > 0.6 && m > 0.34 && s1 > 0.8) {
                drawShrub(ctx, px, py, cellPx, s1, s2, season);
                continue;
            }

            // Desert and steppe flora.
            if (temp > 0.66 && m < 0.36) {
                if (s1 > 0.74) drawCactus(ctx, px, py, cellPx, s1);
                else if (s1 > 0.6) drawGrassTufts(ctx, px, py, cellPx, s1, s2, true);
                continue;
            }

            // Meadows: flower drifts, tufts and the occasional boulder.
            if (h >= sea && h < 0.62 && zoom >= 0.34) {
                if (s1 > 0.9) drawFlowerCluster(ctx, px, py, cellPx, s1, s2, season);
                else if (s1 > 0.76) drawFlower(ctx, px, py, cellPx, s1, season);
                else if (s1 > 0.64) drawGrassTufts(ctx, px, py, cellPx, s1, s2, false);
                else if (s1 > 0.625) drawRock(ctx, px, py, cellPx, zoom, false);
            }
        }
    }
}

// High-frequency ground grain: the baked texture carries the broad colour
// field, this adds tile-scale variation so close inspection never reads as
// one blurred gradient.
function drawGroundGrain(ctx, zoom, cam, canvas) {
    const cellPx = CELL * zoom;
    if (cellPx < 14) return;
    const W = worldW(), H = worldH();
    const sea = state.seaLevel ?? 0.33;
    const startX = Math.max(0, Math.floor(cam.x / cellPx) - 1);
    const startY = Math.max(0, Math.floor(cam.y / cellPx) - 1);
    const endX = Math.min(W, Math.ceil((cam.x + canvas.width) / cellPx) + 1);
    const endY = Math.min(H, Math.ceil((cam.y + canvas.height) / cellPx) + 1);

    ctx.save();
    for (let x = startX; x < endX; x++) {
        for (let y = startY; y < endY; y++) {
            if (!state.explored[x]?.[y]) continue;
            const h = getHeightAt(x + 0.5, y + 0.5);
            if (h < sea) continue;
            const m = getMoistureAt(x + 0.5, y + 0.5);
            const temp = getTemperatureAt(x + 0.5, y + 0.5);
            const seed = ((x * 2654435761) ^ (y * 40503)) >>> 0;
            const a = (seed % 1000) / 1000;
            const b = ((seed >> 8) % 1000) / 1000;
            const px = x * cellPx - cam.x;
            const py = y * cellPx - cam.y;

            const dry = m < 0.42;
            const cold = temp < 0.3;
            const tone = cold ? "235,242,246" : dry ? "226,206,150" : m > 0.66 ? "22,50,26" : "42,74,38";
            ctx.fillStyle = `rgba(${tone},${0.028 + a * 0.04})`;
            const size = cellPx * (0.14 + b * 0.24);
            ctx.fillRect(px + a * cellPx * 0.62, py + b * cellPx * 0.52, size, size * (0.65 + a * 0.6));

            if (zoom >= 0.9 && a > 0.55) {
                ctx.fillStyle = `rgba(${cold ? "250,252,255" : "14,32,16"},${0.05 + b * 0.06})`;
                for (let i = 0; i < 2; i++) {
                    const sx = px + ((a * 13 + i * 7) % 10) / 10 * cellPx;
                    const sy = py + ((b * 17 + i * 11) % 10) / 10 * cellPx;
                    ctx.fillRect(sx, sy, Math.max(1, cellPx * 0.05), Math.max(1, cellPx * 0.03));
                }
            }
        }
    }
    ctx.restore();
}

function drawWaterGlint(ctx, px, py, cellPx, tick, s1) {
    const pulse = 0.35 + 0.65 * Math.abs(Math.sin(tick * 0.03 + s1 * 9));
    const width = cellPx * (0.1 + s1 * 0.16);
    ctx.strokeStyle = `rgba(206,236,240,${0.10 + pulse * 0.16})`;
    ctx.lineWidth = Math.max(0.8, cellPx * 0.022);
    ctx.beginPath();
    ctx.moveTo(px - width, py);
    ctx.quadraticCurveTo(px, py - cellPx * 0.05, px + width, py);
    ctx.stroke();
}

function drawShoreFoam(ctx, px, py, cellPx, tick, s2, zoom) {
    const pulse = 0.4 + 0.6 * Math.abs(Math.sin(tick * 0.04 + s2 * 11));
    ctx.strokeStyle = `rgba(232,244,240,${0.18 + pulse * 0.18})`;
    ctx.lineWidth = Math.max(0.8, cellPx * 0.03);
    ctx.beginPath();
    ctx.arc(px, py, cellPx * (0.18 + pulse * 0.1), Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
}

function drawTree(ctx, px, py, cellPx, tick, s1, s2, zoom, temp, moisture, season, shore = null) {
    const s = cellPx / 48;
    const sway = Math.sin(tick * 0.045 + s1 * 10 + s2 * 7) * 1.6 * s;

    // A soft grounded shadow is enough to lift trees off the new surface
    // without baking hard directional shadows into the seasonal ground. On the
    // bank the shadow stretches over the water, which anchors the crown to the
    // shore instead of leaving it floating on a reflective surface.
    ctx.fillStyle = shore ? "rgba(5, 12, 8, 0.26)" : "rgba(7, 15, 8, 0.22)";
    ctx.beginPath();
    ctx.ellipse(
        px + 3.2 * s + (shore ? shore.x * 5.5 * s : 0),
        py + 8.0 * s + (shore ? shore.y * 5.5 * s : 0),
        (shore ? 13.5 : 10.5) * s,
        (shore ? 4.2 : 3.6) * s,
        0.15, 0, Math.PI * 2
    );
    ctx.fill();
    const variant = Math.min(3, Math.floor(Math.abs(s2) * 4));

    if (temp < 0.4 || (temp < 0.54 && variant === 3)) { drawConifer(ctx, px, py, s, sway, s1, season); return; }
    if (temp > 0.68 && moisture < 0.45) { drawPalm(ctx, px, py, s, sway, s1); return; }
    if (moisture > 0.52 && variant === 2) { drawBirch(ctx, px, py, s, sway, s1, season); return; }
    if (moisture > 0.76 && temp > 0.5 && s1 > 0.9) { drawDeadTree(ctx, px, py, s, sway); return; }
    drawBroadleaf(ctx, px, py, s, sway, s1, season, variant);
}

function drawBroadleaf(ctx, px, py, s, sway, seed, season, variant = 0) {
    const autumn = season === 2;
    const winter = season === 3;
    ctx.fillStyle = "#5d4028";
    ctx.fillRect(px - 2.4 * s, py + 2 * s, 4.8 * s, 13 * s);

    const summer = [["#2f6b31", "#4d9c4b"], ["#36702e", "#5aa84d"], ["#2a5f33", "#468e46"], ["#3d7735", "#6aad52"]][Math.abs(variant) % 4];
    const crown = winter ? "#7c8478" : autumn ? (seed > 0.5 ? "#a8642f" : "#b58537") : summer[0];
    const light = winter ? "#98a196" : autumn ? "#c98a48" : summer[1];
    ctx.fillStyle = crown;
    ctx.beginPath();
    ctx.arc(px + sway, py - 4 * s, (11 + seed * 4) * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.arc(px - 3.6 * s + sway, py - 7 * s, (5.4 + seed * 2) * s, 0, Math.PI * 2);
    ctx.fill();
    if (variant % 2 === 0) {
        ctx.fillStyle = crown;
        ctx.beginPath();
        ctx.arc(px + 4 * s + sway, py - 2 * s, (4.6 + seed * 2) * s, 0, Math.PI * 2);
        ctx.fill();
    }

    if (winter) {
        ctx.fillStyle = "rgba(240,246,248,0.75)";
        ctx.beginPath();
        ctx.arc(px + sway, py - 9 * s, 4.4 * s, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawBirch(ctx, px, py, s, sway, seed, season) {
    const winter = season === 3;
    ctx.fillStyle = "#e9e3d4";
    ctx.fillRect(px - 1.8 * s, py + 1 * s, 3.6 * s, 13 * s);
    ctx.fillStyle = "#4a4136";
    for (let i = 0; i < 3; i++) {
        ctx.fillRect(px - 1.8 * s, py + (3 + i * 3.4) * s, (1.6 + (i % 2) * 0.8) * s, 0.9 * s);
    }
    ctx.fillStyle = winter ? "#8c9488" : (seed > 0.5 ? "#6a9e3e" : "#7fae48");
    ctx.beginPath();
    ctx.arc(px + sway, py - 5 * s, (8.5 + seed * 3) * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = winter ? "#a6aea2" : "#a3c463";
    ctx.beginPath();
    ctx.arc(px - 3 * s + sway, py - 8 * s, 4.4 * s, 0, Math.PI * 2);
    ctx.fill();
}

function drawShrub(ctx, px, py, cellPx, s1, s2, season) {
    const s = cellPx / 48;
    if (season === 3) {
        ctx.strokeStyle = "rgba(120,112,96,0.8)";
        ctx.lineWidth = Math.max(0.8, 1.1 * s);
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(px, py + 2 * s);
            ctx.lineTo(px + (i - 1) * 4 * s, py - 4 * s);
            ctx.stroke();
        }
        return;
    }
    const winterCrown = "#6f7a68";
    ctx.fillStyle = season === 3 ? winterCrown : s1 > 0.5 ? "#3c7238" : "#4c7f3e";
    ctx.beginPath();
    ctx.ellipse(px, py, (6 + s2 * 3) * s, (4.2 + s1 * 2) * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(146,190,96,0.65)";
    ctx.beginPath();
    ctx.ellipse(px - 2 * s, py - 2 * s, 2.6 * s, 1.8 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    if (s2 > 0.7) {
        ctx.fillStyle = "rgba(190,74,74,0.9)";
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(px + (i - 1) * 2.4 * s, py + (i % 2 ? -1 : 1) * 1.6 * s, 0.8 * s, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

function drawFlowerCluster(ctx, px, py, cellPx, s1, s2, season) {
    drawFlower(ctx, px, py, cellPx, s1, season);
    drawFlower(ctx, px + (s2 - 0.5) * 7 * (cellPx / 48), py + 3 * (cellPx / 48), cellPx, 1 - s1, season);
    drawFlower(ctx, px - 4 * (cellPx / 48), py + (s1 - 0.5) * 5 * (cellPx / 48), cellPx, s2, season);
}

function drawConifer(ctx, px, py, s, sway, seed, season) {
    const winter = season === 3;
    ctx.fillStyle = "#4c3724";
    ctx.fillRect(px - 2 * s, py + 4 * s, 4 * s, 11 * s);
    const height = (20 + seed * 8) * s;
    for (let layer = 0; layer < 3; layer++) {
        const width = (12 - layer * 3) * s;
        const baseY = py + 2 * s - layer * height * 0.3;
        ctx.fillStyle = winter ? "#3f5a4c" : layer === 0 ? "#24543a" : "#2c6343";
        ctx.beginPath();
        ctx.moveTo(px + sway, baseY - height * 0.42);
        ctx.lineTo(px - width, baseY);
        ctx.lineTo(px + width, baseY);
        ctx.closePath();
        ctx.fill();
    }
    if (winter) {
        ctx.fillStyle = "rgba(240,246,248,0.8)";
        ctx.beginPath();
        ctx.moveTo(px + sway, py - height * 0.42 + 2 * s);
        ctx.lineTo(px - 3.5 * s, py - height * 0.08);
        ctx.lineTo(px + 3.5 * s, py - height * 0.08);
        ctx.closePath();
        ctx.fill();
    }
}

function drawPalm(ctx, px, py, s, sway, seed) {
    ctx.strokeStyle = "#6b5232";
    ctx.lineWidth = Math.max(1.4, 2.6 * s);
    ctx.beginPath();
    ctx.moveTo(px, py + 8 * s);
    ctx.quadraticCurveTo(px + 2 * s, py - 2 * s, px + sway * 0.6, py - 10 * s);
    ctx.stroke();
    ctx.fillStyle = "#3f7a3f";
    for (let i = 0; i < 5; i++) {
        const angle = -Math.PI * 0.9 + i * Math.PI * 0.45;
        const tipX = px + Math.cos(angle) * (12 + seed * 4) * s + sway;
        const tipY = py - 10 * s + Math.sin(angle) * 8 * s;
        ctx.beginPath();
        ctx.moveTo(px + sway, py - 10 * s);
        ctx.quadraticCurveTo(px + Math.cos(angle) * 7 * s, py - 12 * s + Math.sin(angle) * 4 * s, tipX, tipY);
        ctx.quadraticCurveTo(px + Math.cos(angle) * 6 * s, py - 8 * s, px + sway, py - 10 * s);
        ctx.fill();
    }
    ctx.fillStyle = "#8a6a34";
    ctx.beginPath();
    ctx.arc(px + sway, py - 9 * s, 1.8 * s, 0, Math.PI * 2);
    ctx.fill();
}

function drawDeadTree(ctx, px, py, s, sway) {
    ctx.strokeStyle = "#6a5a44";
    ctx.lineWidth = Math.max(1.2, 2.2 * s);
    ctx.beginPath();
    ctx.moveTo(px, py + 9 * s);
    ctx.lineTo(px + sway * 0.5, py - 9 * s);
    ctx.moveTo(px + sway * 0.3, py - 2 * s);
    ctx.lineTo(px - 6 * s, py - 7 * s);
    ctx.moveTo(px + sway * 0.3, py - 4 * s);
    ctx.lineTo(px + 6 * s, py - 11 * s);
    ctx.stroke();
}

function drawRock(ctx, px, py, cellPx, zoom, snowy) {
    const s = cellPx / 48;
    ctx.fillStyle = snowy ? "#9aa2a4" : "#6e6e64";
    ctx.beginPath();
    ctx.moveTo(px - 9 * s, py + 7 * s);
    ctx.lineTo(px - 5 * s, py - 5 * s);
    ctx.lineTo(px + 5 * s, py - 3 * s);
    ctx.lineTo(px + 9 * s, py + 7 * s);
    ctx.closePath();
    ctx.fill();
    if (zoom > 0.9) {
        ctx.fillStyle = snowy ? "#c8d0d2" : "#9a9a90";
        ctx.beginPath();
        ctx.moveTo(px - 4 * s, py);
        ctx.lineTo(px - 1 * s, py - 4 * s);
        ctx.lineTo(px + 3 * s, py - 2 * s);
        ctx.lineTo(px - 1 * s, py + 2 * s);
        ctx.closePath();
        ctx.fill();
    }
    if (snowy) {
        ctx.fillStyle = "rgba(244,248,250,0.9)";
        ctx.beginPath();
        ctx.ellipse(px, py - 5 * s, 5 * s, 2 * s, 0, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawCactus(ctx, px, py, cellPx, s1) {
    const s = cellPx / 48;
    ctx.fillStyle = s1 > 0.5 ? "#5f7f4a" : "#6f8a52";
    ctx.fillRect(px - 2 * s, py - 8 * s, 4 * s, 14 * s);
    ctx.fillRect(px - 7 * s, py - 4 * s, 3 * s, 6 * s);
    ctx.fillRect(px - 7 * s, py + 1 * s, 6 * s, 2.4 * s);
    ctx.fillRect(px + 4 * s, py - 6 * s, 3 * s, 5 * s);
    ctx.fillRect(px + 2 * s, py - 6 * s, 5 * s, 2.2 * s);
}

// Direction from a land tile towards the nearest water, or null inland. One
// step is enough for the shoreline dressing band and keeps this cheap.
function shoreDirection(x, y, sea) {
    let dx = 0, dy = 0;
    if (getHeightAt(x + 1.5, y + 0.5) < sea) dx += 1;
    if (getHeightAt(x - 0.5, y + 0.5) < sea) dx -= 1;
    if (getHeightAt(x + 0.5, y + 1.5) < sea) dy += 1;
    if (getHeightAt(x + 0.5, y - 0.5) < sea) dy -= 1;
    if (!dx && !dy) return null;
    const length = Math.hypot(dx, dy) || 1;
    return { x: dx / length, y: dy / length };
}

function drawWetEdge(ctx, px, py, cellPx, shore, s1) {
    const s = cellPx / 48;
    const angle = Math.atan2(shore.y, shore.x);
    ctx.save();
    ctx.fillStyle = `rgba(26, 38, 33, ${0.08 + s1 * 0.07})`;
    ctx.beginPath();
    ctx.ellipse(px + shore.x * cellPx * 0.22, py + shore.y * cellPx * 0.22,
        cellPx * 0.40, cellPx * 0.17, angle, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(196, 214, 204, 0.14)";
    ctx.lineWidth = Math.max(0.7, 0.9 * s);
    ctx.beginPath();
    ctx.ellipse(px + shore.x * cellPx * 0.44, py + shore.y * cellPx * 0.44,
        cellPx * 0.36, cellPx * 0.14, angle, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}

function drawShoreStones(ctx, px, py, cellPx, s1, s2) {
    const s = cellPx / 48;
    ctx.fillStyle = "rgba(94, 100, 96, 0.82)";
    for (let i = 0; i < 3; i++) {
        const ox = (i - 1) * 4.5 * s + (s1 - 0.5) * 3 * s;
        const oy = (i % 2 === 0 ? 1 : -1) * 2.2 * s + (s2 - 0.5) * 2 * s;
        ctx.beginPath();
        ctx.ellipse(px + ox, py + oy, (2.6 + (i % 2) * 1.2) * s, (1.7 + (i % 3)) * s, 0.2, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.fillStyle = "rgba(198, 206, 198, 0.32)";
    ctx.beginPath();
    ctx.ellipse(px - 3 * s, py - 1 * s, 1.6 * s, 0.8 * s, 0.2, 0, Math.PI * 2);
    ctx.fill();
}

function drawDriftwood(ctx, px, py, cellPx, s1, shore) {
    const s = cellPx / 48;
    const angle = Math.atan2(shore?.y ?? 0.4, shore?.x ?? 0.8) + Math.PI * 0.5;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle);
    ctx.strokeStyle = "rgba(104, 86, 62, 0.85)";
    ctx.lineWidth = Math.max(1.2, 2 * s);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-7 * s, 0);
    ctx.quadraticCurveTo(0, (-1.2 + s1) * s, 8 * s, 0.6 * s);
    ctx.stroke();
    ctx.lineWidth = Math.max(0.8, 1.1 * s);
    ctx.beginPath();
    ctx.moveTo(2 * s, 0);
    ctx.lineTo(5 * s, -3.4 * s);
    ctx.stroke();
    ctx.restore();
}

function drawReeds(ctx, px, py, cellPx, s1, s2, temp, shore = null) {
    const s = cellPx / 48;
    const height = (8 + s2 * 8) * s;
    if (shore) {
        // A faint reflection keeps the cluster attached to the bank.
        ctx.strokeStyle = temp < 0.4 ? "rgba(110,120,104,0.18)" : "rgba(58,84,48,0.20)";
        ctx.lineWidth = Math.max(0.8, 1.1 * s);
        for (let i = 0; i < 3; i++) {
            const offset = (i - 1) * 2.6 * s;
            ctx.beginPath();
            ctx.moveTo(px + offset + shore.x * 4 * s, py + 5 * s + shore.y * 4 * s);
            ctx.lineTo(px + offset + shore.x * 7 * s, py + 8 * s + shore.y * 7 * s);
            ctx.stroke();
        }
    }
    ctx.strokeStyle = temp < 0.4 ? "rgba(142,150,120,0.78)" : "rgba(84,112,58,0.85)";
    ctx.lineWidth = Math.max(1, 1.25 * s);
    for (let i = 0; i < 5; i++) {
        const offset = (i - 2) * 1.9 * s;
        const lean = (s1 - 0.5) * (4 + i * 0.7) * s;
        const tall = height * (0.72 + ((i * 37) % 10) / 18);
        ctx.beginPath();
        ctx.moveTo(px + offset, py + 4 * s);
        ctx.quadraticCurveTo(px + offset + lean * 0.4, py - tall * 0.55, px + offset + lean, py - tall);
        ctx.stroke();
    }
    ctx.fillStyle = "#7b5d34";
    for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.ellipse(px + (s1 - 0.5) * 3 * s + i * 2.4 * s, py - height * (0.92 - i * 0.1), 1.3 * s, 2.8 * s, 0, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawFlower(ctx, px, py, cellPx, s1, season) {
    if (season === 3) return;
    const r = cellPx * 0.045;
    const color = season === 2 ? "rgba(196,132,64,0.8)" : s1 > 0.5 ? "rgba(214,96,132,0.8)" : "rgba(244,239,208,0.85)";
    ctx.fillStyle = color;
    for (let i = 0; i < 4; i++) {
        const angle = i * Math.PI / 2;
        ctx.beginPath();
        ctx.arc(px + Math.cos(angle) * r * 0.7, py + Math.sin(angle) * r * 0.7, r * 0.62, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.fillStyle = "rgba(226,182,60,0.9)";
    ctx.beginPath();
    ctx.arc(px, py, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
}

function drawGrassTufts(ctx, px, py, cellPx, s1, s2, dry) {
    const s = cellPx / 48;
    const lean = (s2 - 0.5) * 4 * s;
    ctx.strokeStyle = dry ? "rgba(150,132,78,0.55)" : "rgba(38,82,36,0.5)";
    ctx.lineWidth = Math.max(1, 1.05 * s);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(px, py + 3.4 * s);
    ctx.quadraticCurveTo(px - 1.4 * s + lean, py - 0.8 * s, px - 2 * s + lean, py - 4.6 * s);
    ctx.moveTo(px + 1.8 * s, py + 3.4 * s);
    ctx.quadraticCurveTo(px + 3 * s + lean, py - 0.6 * s, px + 2.4 * s + lean, py - 3.8 * s);
    ctx.stroke();
    ctx.lineCap = "butt";
}

function drawSnowTuft(ctx, px, py, cellPx, s1) {
    const s = cellPx / 48;
    ctx.fillStyle = "rgba(236,242,246,0.5)";
    ctx.beginPath();
    ctx.ellipse(px, py + 2 * s, (4 + s1 * 5) * s, 2.2 * s, 0, 0, Math.PI * 2);
    ctx.fill();
}
