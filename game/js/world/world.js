// ═══════════════════════════════════════════════════════════════
//  WORLD — terrain generation, geography and exploration
//  A single height/moisture/temperature model drives the canvas,
//  the gameplay checks and the start-screen preview.
// ═══════════════════════════════════════════════════════════════

import { WORLD_W, WORLD_H, NOISE_SCALE } from '../core/config.js';
import {
    getWorldData, TERRAIN_GENERATION_VERSION,
    classifyTerrain, gameplayBiome, terrainColor,
    normalizeWorldOptions, resolveWorldDimensions, seaLevelFor,
} from './terrain-model.js';
import { state } from '../core/state.js';
import { distance } from '../core/utils.js';
import { generateResourceGeography } from '../systems/resource-geography.js';
import { ensureForestSuccession, resetForestSuccession } from '../systems/forest-succession.js';
import { generateSpecialBiomes, paintSpecialBiomeTint } from '../systems/special-biome-state.js';
import { generateBiomeAtlas, syncBiomeDiscovery } from '../systems/biome-resource-state.js';

export { normalizeWorldOptions, resolveWorldDimensions, seaLevelFor };

// The baked ground layer only depends on the seed, world options and terrain
// version. Loading the same realm must not re-run the per-pixel palette and
// hillshade loop; cache the untinted pixels and repaint the save's rare-biome
// tint over an exact copy. One entry is enough: a new seed replaces it.
let terrainBaseCache = null;

// ── dimensions ────────────────────────────────────────────────

export function worldWidth() {
    return Number(state.worldW) || WORLD_W;
}

export function worldHeight() {
    return Number(state.worldH) || WORLD_H;
}

// ═══════════════════════════════════════════════════════════════
//  GENERATION
// ═══════════════════════════════════════════════════════════════

function markWorldTime(name, startedAt) {
    const times = globalThis.__KAC_LOAD_TIMES;
    if (times && Number.isFinite(startedAt)) times[name] = Math.round((performance.now() - startedAt) * 10) / 10;
}

export function initWorld(seed = state.worldSeed, options = state.worldOptions, terrainVersion = TERRAIN_GENERATION_VERSION) {
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
    state.terrainVersion = terrainVersion;
    state.fogCanvas = null;
    state.fogDirty = true;
    state.fogExploredRef = null;

    // One shared, cached world data set backs both the forge preview and the
    // live realm. Starting the displayed world reuses its exact terrain arrays.
    const worldDataStarted = performance.now();
    const worldData = getWorldData(worldSeed, state.worldOptions, terrainVersion);
    markWorldTime("worldDataMs", worldDataStarted);
    state.heightMap = worldData.heights;
    state.moistureMap = worldData.moistures;
    state.temperatureMap = worldData.temperatures;
    state.terrainResolution = worldData.resolution;
    state.terrainPixW = worldData.pixW;
    state.terrainPixH = worldData.pixH;
    state.rivers = worldData.rivers;

    const W = dims.w;
    const H = dims.h;

    const resourceStarted = performance.now();
    generateResourceGeography(worldSeed);
    markWorldTime("resourceMs", resourceStarted);
    const forestStarted = performance.now();
    resetForestSuccession();
    ensureForestSuccession();
    markWorldTime("forestMs", forestStarted);
    // The rare atlas is generated from the same seed and terrain samples as
    // the normal biomes. It is a handful of regions plus one byte per tile, not
    // a second tile-object graph.
    const specialStarted = performance.now();
    generateSpecialBiomes(worldSeed, state.worldOptions, {
        heights: state.heightMap,
        moistures: state.moistureMap,
        temperatures: state.temperatureMap,
        resolution: state.terrainResolution,
        pixW: state.terrainPixW,
        pixH: state.terrainPixH,
        W, H, sea: state.seaLevel,
    });
    markWorldTime("specialMs", specialStarted);
    const atlasStarted = performance.now();
    // 1.2.19 builds one bounded 6×6 region atlas from the same terrain samples.
    // It is generated after the rare-biome atlas so both systems read the same
    // world, and it stores only compact region/resource rows.
    generateBiomeAtlas(worldSeed, {
        heights: state.heightMap,
        moistures: state.moistureMap,
        temperatures: state.temperatureMap,
        resolution: state.terrainResolution,
        pixW: state.terrainPixW,
        pixH: state.terrainPixH,
        W, H, sea: state.seaLevel,
    });
    markWorldTime("atlasMs", atlasStarted);

    const exploreStarted = performance.now();
    state.explored = [];
    for (let x = 0; x < W; x++) {
        state.explored[x] = [];
        for (let y = 0; y < H; y++) state.explored[x][y] = false;
    }
    revealArea(Math.floor(W / 2), Math.floor(H / 2), Math.max(18, Math.round(W * 0.13)));
    // The starting clearing is real exploration and therefore reveals the
    // regions it actually covers. Rare deposits stay hidden until surveyed.
    syncBiomeDiscovery({ silent: true });
    markWorldTime("exploreMs", exploreStarted);
    const prerenderStarted = performance.now();
    prerenderTerrain();
    markWorldTime("prerenderMs", prerenderStarted);
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
    const baseKey = [state.worldSeed, state.terrainVersion, pixW, pixH, JSON.stringify(state.worldOptions || {})].join('|');
    const cached = terrainBaseCache?.key === baseKey ? terrainBaseCache : null;
    let imageData;
    if (cached) {
        imageData = tctx.createImageData(pixW, pixH);
        imageData.data.set(cached.data);
    } else {
        imageData = tctx.createImageData(pixW, pixH);
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
                // Mountain relief needs a harder key light than pasture: the same
                // height step can be a 30-degree ridge or a gentle field. Increase
                // only the mountain bake, leaving every other climate's goldens and
                // illumination contract untouched.
                const highRelief = climate === 'mountain' || climate === 'volcanic';
                const reliefScale = highRelief ? 5600 : 2400;
                const hillshade = highRelief
                    ? Math.max(-52, Math.min(58, slope * reliefScale))
                    : Math.max(-30, Math.min(32, slope * reliefScale));

                const color = terrainColor(h, m, temperature, px, py, climate, sea, hillshade, state.worldSeed);
                const pi = idx * 4;
                data[pi] = color[0] < 0 ? 0 : color[0] > 255 ? 255 : color[0];
                data[pi + 1] = color[1] < 0 ? 0 : color[1] > 255 ? 255 : color[1];
                data[pi + 2] = color[2] < 0 ? 0 : color[2] > 255 ? 255 : color[2];
                data[pi + 3] = 255;
            }
        }
    }

    if (!cached) terrainBaseCache = { key: baseKey, data: imageData.data.slice() };
    tctx.putImageData(imageData, 0, 0);
    // The rare biome tint is a low-resolution atlas stretched over the baked
    // ground. It adds no per-pixel branch to the normal terrain palette.
    paintSpecialBiomeTint(tctx, pixW, pixH);
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
    let revealed = false;
    for (let x = tx - radius; x <= tx + radius; x++) {
        for (let y = ty - radius; y <= ty + radius; y++) {
            if (x < 0 || x >= W || y < 0 || y >= H) continue;
            if (!state.explored[x]) state.explored[x] = [];
            if (distance(tx, ty, x, y) < radius && !state.explored[x][y]) {
                state.explored[x][y] = true;
                state.fogDirty = true;
                revealed = true;
            }
        }
    }
    if (revealed) state.exploredRevision = (Number(state.exploredRevision) || 0) + 1;
}

// Exposed for diagnostics and tests without importing the canvas pipeline.
export const __internals = { NOISE_SCALE, terrainHeight };
