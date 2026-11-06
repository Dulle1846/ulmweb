// ═══════════════════════════════════════════════════════════════
//  WORLD — terrain generation, geography and exploration
//  A single height/moisture/temperature model drives the canvas,
//  the gameplay checks and the start-screen preview.
// ═══════════════════════════════════════════════════════════════

import {
    WORLD_W, WORLD_H, NOISE_SCALE,
} from '../core/config.js';
import {
    initNoise, sampleHeight, sampleMoisture, sampleTemperature,
    classifyTerrain, gameplayBiome, terrainColor, carveWaterFeatures,
    normalizeWorldOptions, resolveWorldDimensions, seaLevelFor,
} from './terrain-model.js';
import { state } from '../core/state.js';
import { distance } from '../core/utils.js';
import { generateResourceGeography } from '../systems/resource-geography.js';

export { normalizeWorldOptions, resolveWorldDimensions, seaLevelFor };

// ── dimensions ────────────────────────────────────────────────

export function worldWidth() {
    return Number(state.worldW) || WORLD_W;
}

export function worldHeight() {
    return Number(state.worldH) || WORLD_H;
}

function terrainResolutionFor(w, h) {
    const max = Math.max(w, h);
    if (max <= 128) return 5;
    if (max <= 192) return 4;
    return 3;
}

// ═══════════════════════════════════════════════════════════════
//  GENERATION
// ═══════════════════════════════════════════════════════════════

export function initWorld(seed = state.worldSeed, options = state.worldOptions) {
    state.worldOptions = normalizeWorldOptions(options);
    const worldSeed = Number.isSafeInteger(Number(seed)) && Number(seed) > 0
        ? Number(seed)
        : 1 + Math.floor(Math.random() * 2147483000);
    state.worldSeed = worldSeed;

    const dims = resolveWorldDimensions(state.worldOptions);
    state.worldW = dims.w;
    state.worldH = dims.h;
    state.worldSizeId = dims.id;
    state.seaLevel = seaLevelFor(state.worldOptions);
    state.fogCanvas = null;
    state.fogDirty = true;
    state.fogExploredRef = null;

    initNoise(worldSeed);

    const W = dims.w;
    const H = dims.h;
    const resolution = terrainResolutionFor(W, H);
    const pixW = W * resolution;
    const pixH = H * resolution;

    state.heightMap = new Float32Array(pixW * pixH);
    state.moistureMap = new Float32Array(pixW * pixH);
    state.temperatureMap = new Float32Array(pixW * pixH);
    state.terrainResolution = resolution;
    state.terrainPixW = pixW;
    state.terrainPixH = pixH;

    const worldOptions = state.worldOptions;
    const sea = state.seaLevel;

    for (let py = 0; py < pixH; py++) {
        for (let px = 0; px < pixW; px++) {
            const wx = (px + 0.5) / resolution;
            const wy = (py + 0.5) / resolution;
            const index = py * pixW + px;

            const h = sampleHeight(wx, wy, W, H, worldOptions);
            const m = sampleMoisture(wx, wy, worldOptions);
            state.heightMap[index] = h;
            state.moistureMap[index] = m;
            state.temperatureMap[index] = sampleTemperature(wx, wy, W, H, h, sea, worldOptions);
        }
    }

    // Rivers and their terminal lakes are carved with the shared model,
    // so the preview coastline and the real one agree.
    state.rivers = carveWaterFeatures(state.heightMap, pixW, pixH, worldSeed, sea, worldOptions)
        .map(path => path.map(index => ({ x: index % pixW, y: Math.floor(index / pixW) })));

    // A little moisture bleeds into the banks so river valleys turn green.
    for (const path of state.rivers) {
        for (const point of path) {
            for (let oy = -4; oy <= 4; oy++) {
                for (let ox = -4; ox <= 4; ox++) {
                    const nx = point.x + ox, ny = point.y + oy;
                    if (nx < 0 || ny < 0 || nx >= pixW || ny >= pixH) continue;
                    const d = Math.hypot(ox, oy);
                    if (d > 4.5) continue;
                    const index = ny * pixW + nx;
                    const boost = (1 - d / 4.5) * 0.22;
                    state.moistureMap[index] = Math.min(1, state.moistureMap[index] + boost);
                }
            }
        }
    }

    generateResourceGeography(worldSeed);

    state.explored = [];
    for (let x = 0; x < W; x++) {
        state.explored[x] = [];
        for (let y = 0; y < H; y++) state.explored[x][y] = false;
    }
    revealArea(Math.floor(W / 2), Math.floor(H / 2), Math.max(18, Math.round(W * 0.13)));
    prerenderTerrain();
}

// ═══════════════════════════════════════════════════════════════
//  PRERENDER — colour, hillshade and coastal detail are baked once
// ═══════════════════════════════════════════════════════════════

export function prerenderTerrain() {
    const res = state.terrainResolution;
    const pixW = state.terrainPixW;
    const pixH = state.terrainPixH;
    if (!pixW || !pixH || !state.heightMap) return;

    const tc = document.createElement('canvas');
    tc.width = pixW;
    tc.height = pixH;
    const tctx = tc.getContext('2d');
    const imageData = tctx.createImageData(pixW, pixH);
    const data = imageData.data;
    const sea = state.seaLevel;
    const climate = state.worldOptions?.climate || 'temperate';

    for (let py = 0; py < pixH; py++) {
        for (let px = 0; px < pixW; px++) {
            const idx = py * pixW + px;
            const h = state.heightMap[idx];
            const m = state.moistureMap[idx] ?? 0.5;
            const temperature = state.temperatureMap?.[idx] ?? 0.55;

            // Hillshade from the height gradient: light comes from the north-west,
            // so south-east facing slopes fall into shade. Baked during prerender.
            const west = terrainHeight(px - 1, py, h);
            const north = terrainHeight(px, py - 1, h);
            const northWest = terrainHeight(px - 1, py - 1, h);
            const slope = h - (west + north + northWest) / 3;
            const hillshade = Math.max(-30, Math.min(32, slope * 2400));

            const color = terrainColor(h, m, temperature, px, py, climate, sea, hillshade);
            const pi = idx * 4;
            data[pi] = color[0] < 0 ? 0 : color[0] > 255 ? 255 : color[0];
            data[pi + 1] = color[1] < 0 ? 0 : color[1] > 255 ? 255 : color[1];
            data[pi + 2] = color[2] < 0 ? 0 : color[2] > 255 ? 255 : color[2];
            data[pi + 3] = 255;
        }
    }

    tctx.putImageData(imageData, 0, 0);
    state.terrainCanvas = tc;
    state.terrainDirty = false;
}

function terrainHeight(px, py, fallback) {
    const width = state.terrainPixW, height = state.terrainPixH;
    if (px < 0 || py < 0 || px >= width || py >= height) return fallback;
    return state.heightMap[py * width + px];
}

// ═══════════════════════════════════════════════════════════════
//  QUERIES
// ═══════════════════════════════════════════════════════════════

export function getHeightAt(wx, wy) {
    const res = state.terrainResolution || 1;
    const px = Math.floor(wx * res);
    const py = Math.floor(wy * res);
    if (px < 0 || py < 0 || px >= state.terrainPixW || py >= state.terrainPixH) return 0;
    return state.heightMap[py * state.terrainPixW + px];
}

export function getMoistureAt(wx, wy) {
    const res = state.terrainResolution || 1;
    const px = Math.floor(wx * res);
    const py = Math.floor(wy * res);
    if (px < 0 || py < 0 || px >= state.terrainPixW || py >= state.terrainPixH) return 0.5;
    return state.moistureMap?.[py * state.terrainPixW + px] ?? 0.5;
}

export function getTemperatureAt(wx, wy) {
    const res = state.terrainResolution || 1;
    const px = Math.floor(wx * res);
    const py = Math.floor(wy * res);
    if (px < 0 || py < 0 || px >= state.terrainPixW || py >= state.terrainPixH) return 0.55;
    return state.temperatureMap?.[py * state.terrainPixW + px] ?? 0.55;
}

export function getBiomeAt(wx, wy) {
    const h = getHeightAt(wx, wy);
    const sea = state.seaLevel ?? 0.33;
    const m = getMoistureAt(wx, wy);
    const t = getTemperatureAt(wx, wy);
    return gameplayBiome(classifyTerrain(h, m, t, sea));
}

export function getTerrainProfileAt(wx, wy) {
    const h = getHeightAt(wx, wy);
    const sea = state.seaLevel ?? 0.33;
    const m = getMoistureAt(wx, wy);
    const t = getTemperatureAt(wx, wy);
    return { h, m, temp: t, sea, biome: classifyTerrain(h, m, t, sea) };
}

export function isWaterAt(wx, wy) {
    return getHeightAt(wx, wy) < (state.seaLevel ?? 0.33);
}

export function revealArea(tx, ty, radius) {
    const W = worldWidth(), H = worldHeight();
    for (let x = tx - radius; x <= tx + radius; x++) {
        for (let y = ty - radius; y <= ty + radius; y++) {
            if (x < 0 || x >= W || y < 0 || y >= H) continue;
            if (!state.explored[x]) state.explored[x] = [];
            if (distance(tx, ty, x, y) < radius && !state.explored[x][y]) {
                state.explored[x][y] = true;
                state.fogDirty = true;
            }
        }
    }
}

// Exposed for diagnostics and tests without importing the canvas pipeline.
export const __internals = { NOISE_SCALE, terrainHeight };
