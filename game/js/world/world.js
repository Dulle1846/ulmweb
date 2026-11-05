// ═══════════════════════════════════════════════════════════════
//  WORLD — Perlin-Noise-Terrain, nahtlose Biome, Exploration
// ═══════════════════════════════════════════════════════════════

import {
    WORLD_W, WORLD_H, CELL,
    NOISE_SCALE, NOISE_OCTAVES, NOISE_PERSISTENCE, NOISE_LACUNARITY,
    BIOME, BIOME_COLORS,
} from '../core/config.js';
import { state } from '../core/state.js';
import { distance } from '../core/utils.js';
import { generateResourceGeography } from '../systems/resource-geography.js';

// ═══════════════════════════════════════════════════════════════
//  PERLIN NOISE (klassisch, 2D, permutation-basiert)
// ═══════════════════════════════════════════════════════════════

const PERM = new Uint8Array(512);
const GRAD = [
    [1,1],[-1,1],[1,-1],[-1,-1],
    [1,0],[-1,0],[0,1],[0,-1],
];

function initPerlin(seed) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;

    // Fisher-Yates mit Seed
    let s = seed;
    for (let i = 255; i > 0; i--) {
        s = (s * 16807 + 0) % 2147483647;
        const j = s % (i + 1);
        [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
}

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(a, b, t) { return a + t * (b - a); }

function grad2d(hash, x, y) {
    const g = GRAD[hash & 7];
    return g[0] * x + g[1] * y;
}

function perlin2(x, y) {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);

    const u = fade(xf);
    const v = fade(yf);

    const aa = PERM[PERM[xi] + yi];
    const ab = PERM[PERM[xi] + yi + 1];
    const ba = PERM[PERM[xi + 1] + yi];
    const bb = PERM[PERM[xi + 1] + yi + 1];

    return lerp(
        lerp(grad2d(aa, xf, yf),     grad2d(ba, xf - 1, yf),     u),
        lerp(grad2d(ab, xf, yf - 1), grad2d(bb, xf - 1, yf - 1), u),
        v
    );
}

function fbm(x, y, octaves, persistence, lacunarity) {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let max = 0;

    for (let i = 0; i < octaves; i++) {
        value += perlin2(x * frequency, y * frequency) * amplitude;
        max += amplitude;
        amplitude *= persistence;
        frequency *= lacunarity;
    }

    return (value / max + 1) * 0.5;   // normalize → 0..1
}

// ═══════════════════════════════════════════════════════════════
//  TERRAIN-GENERIERUNG
// ═══════════════════════════════════════════════════════════════

export function normalizeWorldOptions(options={}) {
    const defaults={landmass:50,ruggedness:55,forests:52,water:48};
    const normalized={};
    for(const [key,fallback] of Object.entries(defaults)){
        const value=Number(options?.[key]);
        normalized[key]=Number.isFinite(value)?Math.max(0,Math.min(100,Math.round(value))):fallback;
    }
    return normalized;
}

export function initWorld(seed = state.worldSeed, options=state.worldOptions) {
    state.worldOptions=normalizeWorldOptions(options);
    const worldSeed = Number.isSafeInteger(Number(seed)) && Number(seed) > 0
        ? Number(seed)
        : 1 + Math.floor(Math.random() * 2147483000);
    state.worldSeed = worldSeed;
    state.fogCanvas=null;state.fogDirty=true;state.fogExploredRef=null;
    initPerlin(worldSeed);

    const W = WORLD_W;
    const H = WORLD_H;
    const resolution = 2;               // 2× logical resolution; substantially less generation and texture work
    const pixW = W * resolution;
    const pixH = H * resolution;

    // Heightmap in voller Auflösung
    state.heightMap = new Float32Array(pixW * pixH);
    state.moistureMap = new Float32Array(pixW * pixH);

    for (let py = 0; py < pixH; py++) {
        for (let px = 0; px < pixW; px++) {
            const wx = px / resolution;
            const wy = py / resolution;

            let h = fbm(
                wx * NOISE_SCALE,
                wy * NOISE_SCALE,
                NOISE_OCTAVES,
                NOISE_PERSISTENCE,
                NOISE_LACUNARITY
            );
            const options=state.worldOptions;
            const roughness=0.45+(options.ruggedness/100)*1.35;
            const landBias=(options.landmass-50)*0.0016;
            const waterBias=(50-options.water)*0.00135;
            h=Math.max(0,Math.min(1,0.5+(h-0.5)*roughness+landBias+waterBias));

            // Zentrales Tal abflachen (fruchtbar)
            const dcx = (wx - W / 2) / (W * 0.2);
            const dcy = (wy - H / 2) / (H * 0.2);
            const valleyDist = Math.sqrt(dcx * dcx + dcy * dcy);
            if (valleyDist < 1) {
                const blend = 1 - valleyDist;
                h = h * (1 - blend * 0.6) + 0.48 * (blend * 0.6);
            }

            // Feuchtigkeit (zweite Noise-Schicht)
            const rawMoisture = fbm(
                (wx + 500) * NOISE_SCALE * 1.3,
                (wy + 500) * NOISE_SCALE * 1.3,
                3, 0.5, 2.0
            );
            const m=Math.max(0,Math.min(1,rawMoisture+(state.worldOptions.forests-50)*0.002));

            state.heightMap[py * pixW + px] = h;
            state.moistureMap[py * pixW + px] = m;
        }
    }

    // Speicher für Terrain-Rendering
    state.terrainResolution = resolution;
    state.terrainPixW = pixW;
    state.terrainPixH = pixH;

    // Resource nodes are generated from the same seed and terrain maps.
    generateResourceGeography(worldSeed);

    // Exploration
    state.explored = [];
    for (let x = 0; x < W; x++) {
        state.explored[x] = [];
        for (let y = 0; y < H; y++) {
            state.explored[x][y] = false;
        }
    }

    revealArea(Math.floor(W / 2), Math.floor(H / 2), 22);

    // Vorberechnetes Terrain-Canvas
    prerenderTerrain();
}

// ═══════════════════════════════════════════════════════════════
//  TERRAIN VORRENDERN (großes Off-Screen Canvas)
// ═══════════════════════════════════════════════════════════════

export function prerenderTerrain() {
    const res = state.terrainResolution;
    const pixW = state.terrainPixW;
    const pixH = state.terrainPixH;

    // Canvas erstellen
    const tc = document.createElement('canvas');
    tc.width = pixW;
    tc.height = pixH;
    const tctx = tc.getContext('2d');
    const imageData = tctx.createImageData(pixW, pixH);
    const data = imageData.data;

    for (let py = 0; py < pixH; py++) {
        for (let px = 0; px < pixW; px++) {
            const idx = py * pixW + px;
            const h = state.heightMap[idx];
            const m = state.moistureMap[idx];

            const color = getTerrainColor(h, m, px, py);

            const pi = idx * 4;
            data[pi]     = color[0];
            data[pi + 1] = color[1];
            data[pi + 2] = color[2];
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

function clampByte(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
}

function getTerrainColor(h, m, px, py) {
    // Forest density is controlled by the world forge.
    const forestShift=((state.worldOptions?.forests??52)-50)*0.0016;
    // Bestimme Biom
    let base;
    if (h < BIOME.DEEP_WATER)        base = BIOME_COLORS.DEEP_WATER;
    else if (h < BIOME.SHALLOW_WATER) base = BIOME_COLORS.SHALLOW_WATER;
    else if (h < BIOME.SAND)          base = BIOME_COLORS.SAND;
    else if (h < BIOME.GRASS)         base = BIOME_COLORS.GRASS;
    else if (h < BIOME.DENSE_GRASS)   base = BIOME_COLORS.DENSE_GRASS;
    else if (h < BIOME.FOREST-forestShift)        base = BIOME_COLORS.FOREST;
    else if (h < BIOME.DENSE_FOREST-forestShift)  base = BIOME_COLORS.DENSE_FOREST;
    else if (h < BIOME.ROCK)          base = BIOME_COLORS.ROCK;
    else                               base = BIOME_COLORS.SNOW;

    // Micro-Variation (deterministisch)
    const seed = ((px * 73856093) ^ (py * 19349663)) >>> 0;
    const variation = ((seed % 21) - 10) * 0.6;

    // Hillshade from the height gradient: light comes from the north-west,
    // so south-east facing slopes fall into shade. This is computed once
    // during prerender, not per frame.
    const west = terrainHeight(px - 1, py, h);
    const north = terrainHeight(px, py - 1, h);
    const northWest = terrainHeight(px - 1, py - 1, h);
    const slope = h - (west + north + northWest) / 3;
    const hillshade = Math.max(-30, Math.min(32, slope * 2400));

    // Feuchtigkeit beeinflusst Farbsättigung
    const moistureShift = (m - 0.5) * 15;

    // Höhen-Schatten
    const shadowShift = (h - 0.5) * -20;

    // Broad, deterministic mottling stops large fields from reading as
    // one flat poster colour without introducing per-frame noise.
    const mottle = Math.sin(px * 0.085 + py * 0.021) * 3.4 + Math.cos(py * 0.11 - px * 0.017) * 2.6;

    // Water depth bands and a faint ripple make the shoreline readable.
    let waterTone = 0;
    if (h < BIOME.SHALLOW_WATER) {
        const depth = Math.max(0, Math.min(1, (BIOME.SHALLOW_WATER - h) / BIOME.SHALLOW_WATER));
        waterTone = -depth * 16 + Math.sin(px * 0.55 + py * 0.85) * 3.2;
    }

    // A lighter strip where land meets water.
    const coast = h >= BIOME.SHALLOW_WATER && h < BIOME.SHALLOW_WATER + 0.012 ? 12 : 0;

    return [
        clampByte(base[0] + variation + moistureShift + shadowShift + hillshade + mottle + waterTone + coast),
        clampByte(base[1] + variation * 0.8 + moistureShift * 0.5 + hillshade * 0.92 + mottle * 0.9 + waterTone + coast * 0.8),
        clampByte(base[2] + variation * 0.6 - moistureShift * 0.3 + shadowShift * 0.5 + hillshade * 0.75 + mottle * 0.6 + waterTone + coast * 0.6),
    ];
}

// ═══════════════════════════════════════════════════════════════
//  HILFSFUNKTIONEN
// ═══════════════════════════════════════════════════════════════

export function getHeightAt(wx, wy) {
    const res = state.terrainResolution;
    const px = Math.floor(wx * res);
    const py = Math.floor(wy * res);
    if (px < 0 || py < 0 || px >= state.terrainPixW || py >= state.terrainPixH) return 0;
    return state.heightMap[py * state.terrainPixW + px];
}

export function getBiomeAt(wx, wy) {
    const h = getHeightAt(wx, wy);
    const forestShift=((state.worldOptions?.forests??52)-50)*0.0016;
    if (h < BIOME.SHALLOW_WATER) return "water";
    if (h < BIOME.SAND) return "sand";
    if (h < BIOME.DENSE_GRASS) return "grass";
    if (h < BIOME.DENSE_FOREST-forestShift) return "forest";
    if (h < BIOME.ROCK) return "rock";
    return "snow";
}

export function isWaterAt(wx, wy) {
    return getHeightAt(wx, wy) < BIOME.SHALLOW_WATER;
}

export function revealArea(tx, ty, radius) {
    for (let x = tx - radius; x <= tx + radius; x++) {
        for (let y = ty - radius; y <= ty + radius; y++) {
            if (x < 0 || x >= WORLD_W || y < 0 || y >= WORLD_H) continue;
            if (distance(tx, ty, x, y) < radius && !state.explored[x][y]) {
                state.explored[x][y] = true;
                state.fogDirty = true;
            }
        }
    }
}
