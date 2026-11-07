// ═══════════════════════════════════════════════════════════════
//  TERRAIN MODEL — pure, reusable world shaping
//  Shared by the live world generator and the start-screen preview,
//  so a forged realm always matches the landscape the player chose.
// ═══════════════════════════════════════════════════════════════

import { BIOME, NOISE_SCALE } from '../core/config.js';

// ── deterministic noise ───────────────────────────────────────

const PERM = new Uint8Array(512);
const GRAD = [
    [1, 1], [-1, 1], [1, -1], [-1, -1],
    [1, 0], [-1, 0], [0, 1], [0, -1],
];

export function initNoise(seed) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    let s = (Number(seed) || 1) >>> 0;
    for (let i = 255; i > 0; i--) {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        const j = s % (i + 1);
        const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
    }
    for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
}

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(a, b, t) { return a + t * (b - a); }

function grad2d(hash, x, y) {
    const g = GRAD[hash & 7];
    return g[0] * x + g[1] * y;
}

export function perlin2(x, y) {
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
        lerp(grad2d(aa, xf, yf), grad2d(ba, xf - 1, yf), u),
        lerp(grad2d(ab, xf, yf - 1), grad2d(bb, xf - 1, yf - 1), u),
        v
    );
}

export function fbm(x, y, octaves = 5, persistence = 0.52, lacunarity = 2.1) {
    let value = 0, amplitude = 1, frequency = 1, max = 0;
    for (let i = 0; i < octaves; i++) {
        value += perlin2(x * frequency, y * frequency) * amplitude;
        max += amplitude;
        amplitude *= persistence;
        frequency *= lacunarity;
    }
    return (value / max + 1) * 0.5;
}

// Ridged multifractal turns smooth hills into believable mountain chains.
export function ridged(x, y, octaves = 5) {
    let value = 0, amplitude = 1, frequency = 1, max = 0;
    for (let i = 0; i < octaves; i++) {
        const n = 1 - Math.abs(perlin2(x * frequency, y * frequency));
        value += n * n * amplitude;
        max += amplitude;
        amplitude *= 0.5;
        frequency *= 2.05;
    }
    return value / max;
}

export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0 || 1e-6), 0, 1);
    return t * t * (3 - 2 * t);
}

// ── world configuration ───────────────────────────────────────

export const WORLD_SIZES = {
    compact:  { id: 'compact',  label: 'Compact',  w: 128, h: 128, note: 'One valley, quick to read' },
    standard: { id: 'standard', label: 'Standard', w: 176, h: 176, note: 'A full realm with room to grow' },
    grand:    { id: 'grand',    label: 'Grand',    w: 224, h: 224, note: 'Several regions and long rivers' },
    vast:     { id: 'vast',     label: 'Vast',     w: 288, h: 288, note: 'A sprawling continent' },
    huge:     { id: 'huge',     label: 'Huge',     w: 352, h: 352, note: 'A continent with distant frontiers' },
    gigantic: { id: 'gigantic', label: 'Gigantic', w: 448, h: 448, note: 'A world of many regions' },
    colossal: { id: 'colossal', label: 'Colossal', w: 576, h: 576, note: 'The largest forgeable world' },
};

export const WORLD_SHAPES = [
    { id: 'continent',    label: 'Continent',  note: 'One broad landmass ringed by sea' },
    { id: 'archipelago',  label: 'Archipelago', note: 'Many islands separated by channels' },
    { id: 'coastal',      label: 'Coast',      note: 'Land on one side, open ocean on the other' },
    { id: 'inland',       label: 'Inland',     note: 'A landlocked basin walled by mountains' },
    { id: 'valley',       label: 'Valley',     note: 'A fertile valley inside a mountain ring' },
];

export const CLIMATES = [
    { id: 'temperate',    label: 'Temperate',    note: 'Green meadows, mixed forests, four seasons' },
    { id: 'northern',     label: 'Northern',     note: 'Taiga, tundra and long snowy winters' },
    { id: 'mediterranean',label: 'Mediterranean',note: 'Warm dry summers and olive hills' },
    { id: 'arid',         label: 'Arid',         note: 'Steppe, desert plateaus and oases' },
    { id: 'enchanted',    label: 'Enchanted',    note: 'A milder climate with uncanny colours' },
];

export const DEFAULT_WORLD_OPTIONS = {
    size: 'standard', shape: 'continent', climate: 'temperate',
    landmass: 50, ruggedness: 55, forests: 52, water: 48, fertility: 55, resources: 50,
    mountains: 55, rivers: 50, lakes: 50, coastline: 50, snow: 50, wetlands: 50, aridity: 50,
};

const NUMERIC_KEYS = [
    'landmass', 'ruggedness', 'forests', 'water', 'fertility', 'resources',
    'mountains', 'rivers', 'lakes', 'coastline', 'snow', 'wetlands', 'aridity',
];

const IDS = {
    size: new Set(Object.keys(WORLD_SIZES)),
    shape: new Set(WORLD_SHAPES.map(entry => entry.id)),
    climate: new Set(CLIMATES.map(entry => entry.id)),
};

export function normalizeWorldOptions(options = {}) {
    const normalized = {};
    for (const key of NUMERIC_KEYS) {
        const value = Number(options?.[key]);
        normalized[key] = Number.isFinite(value) ? Math.round(clamp(value, 0, 100)) : DEFAULT_WORLD_OPTIONS[key];
    }
    normalized.size = IDS.size.has(options?.size) ? options.size : DEFAULT_WORLD_OPTIONS.size;
    normalized.shape = IDS.shape.has(options?.shape) ? options.shape : DEFAULT_WORLD_OPTIONS.shape;
    normalized.climate = IDS.climate.has(options?.climate) ? options.climate : DEFAULT_WORLD_OPTIONS.climate;
    return normalized;
}

export function resolveWorldDimensions(options = {}) {
    const size = WORLD_SIZES[options?.size] || WORLD_SIZES.standard;
    return { w: size.w, h: size.h, id: size.id };
}

// Terrain is sampled on a grid above tile resolution so slopes stay detailed.
// The cap keeps even a colossal realm near 1.3 million terrain pixels.
export function terrainResolutionFor(w, h) {
    const max = Math.max(w, h);
    if (max <= 128) return 5;
    if (max <= 192) return 4;
    if (max <= 352) return 3;
    return 2;
}

export function normalizeWorldSeed(seed) {
    const value = Number(seed);
    return Number.isSafeInteger(value) && value > 0 ? value : 1;
}

export function seaLevelFor(options = {}) {
    const o = normalizeWorldOptions(options);
    const level = BIOME.SHALLOW_WATER
        + (o.water - 50) * 0.00115
        - (o.landmass - 50) * 0.00075;
    return clamp(level, 0.235, 0.395);
}

// ── geographic shaping ────────────────────────────────────────

function shapeField(nx, ny, shape, edgeNoise, coastScale = 1) {
    const dx = nx * 2 - 1;
    const dy = ny * 2 - 1;
    const dist = Math.hypot(dx, dy);

    if (shape === 'archipelago') {
        const isles = fbm(nx * 4.6 + 7.3, ny * 4.6 + 2.1, 4, 0.55, 2.25);
        const cluster = smoothstep(0.46, 0.66, isles - dist * 0.16 * coastScale);
        return clamp(cluster * smoothstep(1.15, 0.3, dist), 0, 1);
    }
    if (shape === 'coastal') {
        const wobble = (edgeNoise - 0.5) * 0.30 * coastScale;
        return smoothstep(0.98, 0.12, nx + wobble + (ny - 0.5) * 0.22);
    }
    if (shape === 'inland' || shape === 'valley') return 1;
    // Continent: broad centre, ragged coastline.
    return smoothstep(1.16, 0.52, dist + (edgeNoise - 0.5) * 0.20 * coastScale);
}

export function sampleHeight(wx, wy, W, H, rawOptions = {}) {
    const options = rawOptions.__normalized ? rawOptions : normalizeWorldOptions(rawOptions);
    const nx = clamp(wx / W, 0, 1);
    const ny = clamp(wy / H, 0, 1);

    // Domain warp keeps coastlines and ridges from looking machine-made.
    const warpX = (fbm(wx * 0.0062 + 13.7, wy * 0.0062 + 3.1, 3, 0.5, 2.0) - 0.5) * 46;
    const warpY = (fbm(wx * 0.0062 - 8.3, wy * 0.0062 + 19.2, 3, 0.5, 2.0) - 0.5) * 46;
    const base = fbm((wx + warpX) * NOISE_SCALE, (wy + warpY) * NOISE_SCALE, 6, 0.52, 2.1);
    const ridge = ridged((wx + 31) * NOISE_SCALE * 1.55, (wy + 17) * NOISE_SCALE * 1.55, 5);
    const edgeNoise = fbm(nx * 3.4 + 5.2, ny * 3.4 + 8.7, 3, 0.55, 2.0);
    const rugged = 0.30 + (options.ruggedness / 100) * 1.55;
    // Defaults preserve the original landscape: 55 mountains is a 1.0 multiplier.
    const mountainScale = 0.45 + options.mountains / 100;
    const coastScale = 0.55 + options.coastline / 100 * 0.9;

    let h = base * 0.84 + Math.pow(clamp((base - 0.42) / 0.58, 0, 1), 1.5) * ridge * 0.38 * rugged * mountainScale;
    h += (edgeNoise - 0.5) * 0.05;
    h += (options.mountains - 50) * 0.0009 * smoothstep(0.30, 0.80, h);

    if (options.shape === 'inland') {
        const dist = Math.hypot(nx * 2 - 1, ny * 2 - 1);
        h = 0.445 + h * 0.33 + smoothstep(0.52, 1.0, dist) * 0.22 + (edgeNoise - 0.5) * 0.05;
    } else if (options.shape === 'valley') {
        const dist = Math.hypot(nx * 2 - 1, ny * 2 - 1);
        h = 0.465 + h * 0.24 + Math.pow(dist, 2.05) * 0.30 + (edgeNoise - 0.5) * 0.04;
    } else {
        const mask = shapeField(nx, ny, options.shape, edgeNoise, coastScale);
        h = h * (0.44 + 0.56 * mask) + 0.36 * (mask - 0.55) + (base - 0.5) * 0.10;
    }

    h += (options.landmass - 50) * 0.00115 - (options.water - 50) * 0.00095;
    return clamp(h, 0, 1);
}

export function sampleMoisture(wx, wy, rawOptions = {}) {
    const options = rawOptions.__normalized ? rawOptions : normalizeWorldOptions(rawOptions);
    const noise = fbm((wx + 512) * NOISE_SCALE * 1.28, (wy + 512) * NOISE_SCALE * 1.28, 4, 0.55, 2.0);
    return clamp(
        noise + (options.forests - 50) * 0.0032 + (options.fertility - 50) * 0.0016
        + (options.wetlands - 50) * 0.0016 - (options.aridity - 50) * 0.0012,
        0, 1
    );
}

export function sampleTemperature(wx, wy, W, H, height, sea, rawOptions = {}) {
    const options = rawOptions.__normalized ? rawOptions : normalizeWorldOptions(rawOptions);
    const base = { temperate: 0.58, northern: 0.33, mediterranean: 0.69, arid: 0.79, enchanted: 0.52 }[options.climate] ?? 0.58;
    const latitude = 1 - Math.abs(wy / H - 0.5) * 2;   // 1 at the equator, 0 at the poles
    let t = base + (latitude - 0.62) * 0.26 - Math.max(0, height - sea) * 0.30;
    t += (fbm(wx * 0.0085 + 91.3, wy * 0.0085 + 17.9, 3, 0.5, 2.1) - 0.5) * 0.07;
    t += (options.aridity - 50) * 0.0009 - (options.snow - 50) * 0.0012;
    return clamp(t, 0, 1);
}

// ── water features (shared by the preview and the world) ──────

function hashSeed(seed) {
    let s = (Number(seed) >>> 0) || 1;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 0x100000000;
    };
}

// Traces rivers downhill from high ground and fills the basin at their end
// as a lake. Operates on any height grid, so the preview and the full realm
// use exactly the same geographic rules.
function sliderValue(options, key) {
    const value = Number(options?.[key]);
    return Number.isFinite(value) ? clamp(value, 0, 100) : DEFAULT_WORLD_OPTIONS[key];
}

function carveWaterFeaturesLegacy(heights, width, height, seed, sea, options = {}) {
    const rand = hashSeed(seed ^ 0x9e3779b9);
    const riverSetting = sliderValue(options, 'rivers');
    const lakeSetting = sliderValue(options, 'lakes');
    const area = width * height;
    const riverBudget = Math.min(220, Math.max(1, Math.round(area / 5200 * (0.35 + riverSetting / 100 * 1.3))));
    const lakeScale = 0.6 + lakeSetting / 100 * 0.8;
    const rivers = [];
    const width2 = width - 2;

    for (let attempt = 0; attempt < riverBudget * 14 && rivers.length < riverBudget; attempt++) {
        const sx = 1 + Math.floor(rand() * width2);
        const sy = 1 + Math.floor(rand() * (height - 2));
        const start = heights[sy * width + sx];
        if (!(start > sea + 0.16)) continue;

        const path = [];
        let cx = sx, cy = sy;
        let reachedSea = false;

        for (let step = 0; step < Math.max(80, width + height); step++) {
            const idx = cy * width + cx;
            path.push(idx);
            if (heights[idx] < sea - 0.005) { reachedSea = true; break; }

            let best = Infinity, bx = cx, by = cy;
            for (let oy = -1; oy <= 1; oy++) {
                for (let ox = -1; ox <= 1; ox++) {
                    if (!ox && !oy) continue;
                    const nx = cx + ox, ny = cy + oy;
                    if (nx < 1 || ny < 1 || nx >= width - 1 || ny >= height - 1) continue;
                    const value = heights[ny * width + nx] + rand() * 0.004;
                    if (value < best) { best = value; bx = nx; by = ny; }
                }
            }
            const here = heights[cy * width + cx];
            if (best >= here - 0.0004) {
                // Local basin: the river ends in a lake.
                const radius = Math.max(1, Math.round((2 + Math.floor(rand() * 3)) * lakeScale));
                for (let oy = -radius; oy <= radius; oy++) {
                    for (let ox = -radius; ox <= radius; ox++) {
                        if (ox * ox + oy * oy > radius * radius) continue;
                        const nx = cx + ox, ny = cy + oy;
                        if (nx < 1 || ny < 1 || nx >= width - 1 || ny >= height - 1) continue;
                        const index = ny * width + nx;
                        heights[index] = Math.min(heights[index], sea - 0.012);
                    }
                }
                break;
            }
            cx = bx; cy = by;
        }

        if (path.length < 10) continue;

        // Carve a narrow channel with soft banks.
        for (const idx of path) {
            const px = idx % width;
            for (let oy = -1; oy <= 0; oy++) {
                for (let ox = -1; ox <= 1; ox++) {
                    const nx = px + ox, ny = ((idx / width) | 0) + oy;
                    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                    const ni = ny * width + nx;
                    const depth = ox === 0 && oy === 0 ? 0.020 : 0.008;
                    heights[ni] = Math.min(heights[ni], sea - depth);
                }
            }
        }
        rivers.push(path);
    }

    // The lakes slider also scatters standalone basins in low ground above its
    // neutral 50 setting. At 50 generation is byte-for-byte the legacy model,
    // so old saves keep the exact terrain they were created with.
    const lakeBudget = Math.max(0, Math.min(24, Math.round(area / 60000 * (lakeSetting - 50) / 50)));
    for (let lake = 0; lake < lakeBudget; lake++) {
        let cx = 6 + Math.floor(rand() * (width - 12));
        let cy = 6 + Math.floor(rand() * (height - 12));
        let lowest = Infinity;
        for (let oy = -5; oy <= 5; oy++) {
            for (let ox = -5; ox <= 5; ox++) {
                const nx = cx + ox, ny = cy + oy;
                if (nx < 2 || ny < 2 || nx >= width - 2 || ny >= height - 2) continue;
                const value = heights[ny * width + nx];
                if (value < lowest) { lowest = value; cx = nx; cy = ny; }
            }
        }
        if (!(lowest > sea + 0.012)) continue;
        const radius = Math.max(1, Math.round((2 + Math.floor(rand() * 3)) * lakeScale));
        for (let oy = -radius; oy <= radius; oy++) {
            for (let ox = -radius; ox <= radius; ox++) {
                if (ox * ox + oy * oy > radius * radius) continue;
                const nx = cx + ox, ny = cy + oy;
                if (nx < 1 || ny < 1 || nx >= width - 1 || ny >= height - 1) continue;
                const index = ny * width + nx;
                heights[index] = Math.min(heights[index], sea - 0.012);
            }
        }
    }
    return rivers;
}

// ── water carving, generation version 2 ───────────────────────
//
// Version 1 lowered complete discs to `sea - 0.012`. That made flat plates
// with vertical rims: at four samples per tile a small pond could only be an
// eight-sided star. Version 2 subtracts a smooth, noise-warped depression from
// the real height field instead, so the shoreline is wherever the carved
// terrain crosses sea level and follows the landscape instead of a stamp.
// Saved realms keep version 1: their terrain is rebuilt from seed and options.
export const TERRAIN_GENERATION_VERSION = 2;

// A flat bed with a short, gentle bank. Carving a deep bowl made the shader
// paint the whole slope as bare rock, and the visible water shrank to a dot in
// the middle. The bed follows `sea - bedDepth` for lakes and the local channel
// for rivers; the bank rises at a slope below the rock threshold.
function carveBasin(heights, width, height, cx, cy, radius, bed, bankSlope, bankWidth, seedA, seedB, irregular) {
    if (!(radius > 0) || !(bankSlope > 0) || !(bankWidth > 0)) return;
    const reach = Math.ceil(radius * 1.22 + bankWidth);
    const x0 = Math.max(0, Math.floor(cx - reach));
    const x1 = Math.min(width - 1, Math.ceil(cx + reach));
    const y0 = Math.max(0, Math.floor(cy - reach));
    const y1 = Math.min(height - 1, Math.ceil(cy + reach));
    for (let y = y0; y <= y1; y++) {
        const oy = y - cy;
        const row = y * width;
        for (let x = x0; x <= x1; x++) {
            const ox = x - cx;
            const d = Math.hypot(ox, oy);
            let rim = 1;
            if (irregular) {
                const angle = Math.atan2(oy, ox);
                rim += 0.18 * Math.sin(angle * 3 + seedA)
                    + 0.09 * Math.sin(angle * 5 - seedB)
                    + 0.05 * Math.sin(angle * 8 + seedA * 1.7);
            }
            const flat = radius * rim;
            if (d > flat + bankWidth) continue;
            const grain = 0.985 + 0.03 * hash2(x + ((seedA * 97) | 0), y + ((seedB * 89) | 0));
            const target = (bed + Math.max(0, d - flat) * bankSlope) * grain;
            const index = row + x;
            if (target < heights[index]) heights[index] = target > 0 ? target : 0;
        }
    }
}

export function carveWaterFeatures(heights, width, height, seed, sea, options = {}) {
    const version = Number(options.__terrainVersion) || TERRAIN_GENERATION_VERSION;
    if (version < 2) return carveWaterFeaturesLegacy(heights, width, height, seed, sea, options);

    const rand = hashSeed(seed ^ 0x9e3779b9);
    const riverSetting = sliderValue(options, 'rivers');
    const lakeSetting = sliderValue(options, 'lakes');
    const resolution = Math.max(1, Math.min(6, Math.round(Number(options.__resolution) || 1)));
    const tiles = (width / resolution) * (height / resolution);
    // The old budget counted terrain samples. At four samples per tile that
    // put roughly one puddle in every five tiles, which is the leopard pattern.
    // Count tiles instead, so a standard realm gets a handful of real rivers.
    const riverBudget = Math.min(26, Math.max(1, Math.round(tiles / 5200 * (0.15 + riverSetting / 100 * 1.5))));
    const lakeFactor = Math.max(0, (lakeSetting - 10) / 90);
    const lakeBudget = Math.min(40, Math.round((tiles / 5000) * lakeFactor));
    const lakeScale = 0.75 + lakeSetting / 100 * 0.85;
    const channelWidth = 1.05 * resolution;
    const bodies = [];
    const rivers = [];
    const width2 = width - 2;

    for (let attempt = 0; attempt < riverBudget * 18 && rivers.length < riverBudget; attempt++) {
        const sx = 1 + Math.floor(rand() * width2);
        const sy = 1 + Math.floor(rand() * (height - 2));
        if (!(heights[sy * width + sx] > sea + 0.16)) continue;

        const path = [];
        let cx = sx, cy = sy;

        for (let step = 0; step < Math.max(120, width + height); step++) {
            const index = cy * width + cx;
            path.push(index);
            if (heights[index] < sea - 0.002) break;

            let best = Infinity, bx = cx, by = cy;
            for (let oy = -1; oy <= 1; oy++) {
                for (let ox = -1; ox <= 1; ox++) {
                    if (!ox && !oy) continue;
                    const nx = cx + ox, ny = cy + oy;
                    if (nx < 1 || ny < 1 || nx >= width - 1 || ny >= height - 1) continue;
                    const value = heights[ny * width + nx] + rand() * 0.004;
                    if (value < best) { best = value; bx = nx; by = ny; }
                }
            }
            const here = heights[index];
            if (best >= here - 0.0004) {
                // A local basin becomes a lake only when it sits close enough
                // to sea level to fill naturally. High shelves stay dry hollows
                // instead of the deep craters version 1 cut into plateaus.
                const need = here - sea;
                if (need > 0.006 && need < 0.16) {
                    const radius = (2.4 + rand() * 2.4) * lakeScale * resolution;
                    carveBasin(heights, width, height, cx, cy, radius, sea - 0.028,
                        0.018 + rand() * 0.008, 11 * resolution,
                        rand() * 6.283, rand() * 6.283, true);
                    bodies.push({ x: cx, y: cy, r: radius });
                }
                break;
            }
            cx = bx; cy = by;
        }

        if (path.length < 12) continue;

        // Carve a valley with a soft cross-section. The bed only drops below
        // sea level in the lower reaches, so a river is a dry valley on high
        // ground and gains water as it descends instead of climbing a canal.
        for (const index of path) {
            const px = index % width;
            const py = (index / width) | 0;
            const wobble = 0.9 + 0.28 * Math.sin(px * 0.11 + py * 0.07 + (seed % 31) * 0.13);
            // The bed is relative to the local ground. The channel is dry on
            // high ground and fills only where its bed falls below sea level.
            const bed = heights[index] - 0.045;
            carveBasin(heights, width, height, px, py, channelWidth * wobble, bed,
                0.030, 1.7 * resolution, px * 0.7, py * 0.9, false);
        }
        rivers.push(path);
    }

    // Standalone lakes prefer real low ground. Their rims are noise-warped and
    // their depth is tied to the local relief, so the sea contour is organic.
    for (let lake = 0; lake < lakeBudget; lake++) {
        const margin = Math.max(3, Math.round(3 * resolution));
        let cx = margin + Math.floor(rand() * Math.max(1, width - margin * 2));
        let cy = margin + Math.floor(rand() * Math.max(1, height - margin * 2));
        let lowest = Infinity, lx = cx, ly = cy;
        const search = Math.max(2, Math.round(4 * resolution));
        for (let oy = -search; oy <= search; oy++) {
            for (let ox = -search; ox <= search; ox++) {
                const nx = cx + ox, ny = cy + oy;
                if (nx < 2 || ny < 2 || nx >= width - 2 || ny >= height - 2) continue;
                const value = heights[ny * width + nx];
                if (value < lowest) { lowest = value; lx = nx; ly = ny; }
            }
        }
        const need = lowest - sea;
        if (!(need > 0.006 && need < 0.145)) continue;
        const radius = (2.2 + rand() * 2.8) * lakeScale * resolution;
        if (bodies.some(body => Math.hypot(body.x - lx, body.y - ly) < (body.r + radius) * 0.45)) continue;
        carveBasin(heights, width, height, lx, ly, radius, sea - 0.028,
            0.018 + rand() * 0.008, 11 * resolution,
            rand() * 6.283, rand() * 6.283, true);
        bodies.push({ x: lx, y: ly, r: radius });
    }

    return rivers;
}

// ── classification ────────────────────────────────────────────

export function classifyTerrain(height, moisture, temperature, sea) {
    if (height < sea) return 'water';
    if (height < sea + 0.016) return 'beach';
    if (temperature < 0.17 || height > 0.925) return 'snow';
    if (height > 0.79) return 'rock';
    if (temperature < 0.27) return 'tundra';
    if (temperature < 0.4) return 'taiga';
    if (moisture > 0.74 && height < sea + 0.075) return 'swamp';
    if (temperature > 0.68 && moisture < 0.3) return 'desert';
    if (temperature > 0.56 && moisture < 0.44) return 'steppe';
    if (moisture > 0.66 && temperature > 0.38) return 'dense-forest';
    if (moisture > 0.44) return 'forest';
    return 'meadow';
}

// Gameplay code understands a smaller vocabulary; map the richer biomes onto it.
export function gameplayBiome(biome) {
    if (biome === 'water') return 'water';
    if (biome === 'beach' || biome === 'desert') return 'sand';
    if (biome === 'rock' || biome === 'snow') return 'rock';
    if (biome === 'forest' || biome === 'dense-forest' || biome === 'taiga' || biome === 'swamp') return 'forest';
    return 'grass';
}

// ── colour model ──────────────────────────────────────────────

const PALETTES = {
    temperate: {
        waterDeep: [22, 56, 82], waterShallow: [54, 122, 142], foam: [206, 226, 226],
        dry: [156, 148, 98], meadow: [104, 142, 78], lush: [62, 110, 60], forest: [40, 82, 46],
        cold: [120, 132, 118], hot: [168, 152, 92], sand: [206, 190, 146], swamp: [80, 92, 60],
        rock: [116, 112, 102], snow: [226, 231, 234],
    },
    northern: {
        waterDeep: [18, 46, 66], waterShallow: [44, 100, 120], foam: [214, 228, 232],
        dry: [132, 136, 112], meadow: [88, 120, 84], lush: [52, 92, 60], forest: [34, 68, 48],
        cold: [138, 146, 140], hot: [150, 146, 104], sand: [176, 172, 146], swamp: [72, 84, 70],
        rock: [108, 110, 108], snow: [232, 238, 242],
    },
    mediterranean: {
        waterDeep: [24, 68, 96], waterShallow: [62, 140, 158], foam: [218, 232, 228],
        dry: [176, 158, 104], meadow: [128, 148, 82], lush: [84, 118, 58], forest: [56, 88, 48],
        cold: [140, 140, 110], hot: [186, 154, 88], sand: [214, 194, 146], swamp: [92, 96, 62],
        rock: [126, 116, 98], snow: [228, 230, 232],
    },
    arid: {
        waterDeep: [26, 72, 96], waterShallow: [66, 144, 154], foam: [222, 232, 224],
        dry: [188, 160, 104], meadow: [150, 146, 90], lush: [104, 118, 64], forest: [78, 94, 54],
        cold: [160, 148, 118], hot: [200, 158, 92], sand: [220, 194, 142], swamp: [98, 100, 66],
        rock: [136, 116, 92], snow: [230, 231, 228],
    },
    enchanted: {
        waterDeep: [30, 48, 92], waterShallow: [62, 118, 160], foam: [214, 226, 236],
        dry: [142, 128, 118], meadow: [96, 140, 102], lush: [58, 108, 84], forest: [44, 76, 74],
        cold: [126, 128, 140], hot: [160, 136, 116], sand: [196, 182, 158], swamp: [74, 84, 74],
        rock: [112, 106, 118], snow: [228, 232, 240],
    },
};

function mix(a, b, t) {
    return [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
    ];
}

function shift(color, amount) {
    return [color[0] + amount, color[1] + amount, color[2] + amount];
}

function hash2(px, py) {
    let value = Math.imul(px + 1, 0x9e3779b1) ^ Math.imul(py + 1, 0x85ebca77);
    value = Math.imul(value ^ (value >>> 15), 0x2c1b3c6d);
    return ((value ^ (value >>> 12)) >>> 0) / 0x100000000;
}

// One continuous colour field instead of hard biome bands: every transition
// is a smooth blend, which is what makes the landscape read as natural.
export function terrainColor(height, moisture, temperature, px, py, climate, sea, shade = 0) {
    const P = PALETTES[climate] || PALETTES.temperate;
    const jitter = hash2(px, py) - 0.5;

    if (height < sea) {
        const depth = clamp((sea - height) / Math.max(0.02, sea), 0, 1);
        let color = mix(P.waterShallow, P.waterDeep, Math.pow(depth, 0.55));
        const ripple = Math.sin(px * 0.43 + py * 0.61) * 0.5 + Math.sin(px * 0.12 - py * 0.33) * 0.5;
        color = shift(color, ripple * 3.4 - depth * 7 + jitter * 2);
        const shore = 1 - smoothstep(0, 0.035, sea - height);
        color = mix(color, P.foam, shore * 0.45);
        return color;
    }

    const e = clamp((height - sea) / Math.max(0.001, 1 - sea), 0, 1);

    let color = mix(P.dry, P.meadow, smoothstep(0.16, 0.48, moisture));
    color = mix(color, P.lush, smoothstep(0.52, 0.78, moisture));
    color = mix(color, P.cold, smoothstep(0.52, 0.2, temperature) * 0.55);
    color = mix(color, P.hot, smoothstep(0.62, 0.92, temperature) * 0.38);

    const arid = smoothstep(0.6, 0.88, temperature) * (1 - smoothstep(0.2, 0.42, moisture));
    color = mix(color, P.sand, arid * 0.86);

    const wetland = smoothstep(0.66, 0.86, moisture) * smoothstep(0.16, 0.02, e);
    color = mix(color, P.swamp, wetland * 0.82);

    const forest = smoothstep(0.4, 0.66, moisture) * (1 - arid) * smoothstep(0.012, 0.12, e);
    color = mix(color, P.forest, forest * 0.9);

    // Rock breaks through on steep, high ground; snow caps the peaks.
    const rock = smoothstep(0.55, 0.82, e);
    color = mix(color, P.rock, rock * 0.94);
    const snow = Math.max(smoothstep(0.78, 0.93, e), smoothstep(0.26, 0.12, temperature));
    color = mix(color, P.snow, snow);

    // Sand ribbon with a ragged edge and pebble flecks where land meets water.
    const beachEdge = 0.028 + hash2(px >> 1, py >> 1) * 0.024;
    const beach = 1 - smoothstep(0.004, beachEdge, height - sea);
    color = mix(color, P.sand, beach * 0.92);
    if (beach > 0.55 && jitter > 0.18) color = shift(color, -14);

    // Layered micro-relief: broad pasture patches, fine mottling and grain.
    const pasture = Math.sin(px * 0.031 + py * 0.017) * 0.5 + Math.sin(px * 0.013 - py * 0.041 + 1.7) * 0.5;
    const mottle = Math.sin(px * 0.09 + py * 0.023) * 3.1 + Math.cos(py * 0.12 - px * 0.019) * 2.5;
    const grain = Math.sin(px * 0.37 - py * 0.29) * 1.3 + Math.cos(px * 0.21 + py * 0.43) * 1.1;
    color = mix(color, P.meadow, Math.max(0, pasture) * 0.12);
    color = mix(color, P.lush, Math.max(0, -pasture) * 0.1);
    return shift(color, pasture * 5.4 + mottle + grain + jitter * 5.2 + shade);
}

// ── shared world generation ───────────────────────────────────

// The preview and the live realm both read this one cached world. Starting a
// realm with the options currently shown in the forge therefore reuses the
// exact height, moisture, temperature and river arrays the player saw.
export function generateWorldData(seed, rawOptions = {}, terrainVersion = TERRAIN_GENERATION_VERSION) {
    const options = normalizeWorldOptions(rawOptions);
    const sampling = { ...options, __normalized: true };
    const worldSeed = normalizeWorldSeed(seed);
    const dims = resolveWorldDimensions(options);
    const sea = seaLevelFor(options);
    const resolution = terrainResolutionFor(dims.w, dims.h);
    const pixW = dims.w * resolution;
    const pixH = dims.h * resolution;
    const heights = new Float32Array(pixW * pixH);
    const moistures = new Float32Array(pixW * pixH);
    const temperatures = new Float32Array(pixW * pixH);

    initNoise(worldSeed);

    for (let py = 0; py < pixH; py++) {
        for (let px = 0; px < pixW; px++) {
            const wx = (px + 0.5) / resolution;
            const wy = (py + 0.5) / resolution;
            const index = py * pixW + px;
            const h = sampleHeight(wx, wy, dims.w, dims.h, sampling);
            heights[index] = h;
            moistures[index] = sampleMoisture(wx, wy, sampling);
            temperatures[index] = sampleTemperature(wx, wy, dims.w, dims.h, h, sea, sampling);
        }
    }

    // Rivers and their terminal lakes are carved into the very same grid the
    // realm uses. The preview never runs a separate, smaller simulation.
    const rivers = carveWaterFeatures(heights, pixW, pixH, worldSeed, sea,
        { ...sampling, __resolution: resolution, __terrainVersion: terrainVersion })
        .map(path => path.map(index => ({ x: index % pixW, y: Math.floor(index / pixW) })));

    // A little moisture bleeds into the banks so river valleys turn green.
    // The band is measured in tiles and falls off smoothly; the old four-pixel
    // ring read as a painted collar around every puddle.
    const bleedRadius = Math.max(2, Math.round(3.2 * resolution));
    for (const path of rivers) {
        for (let p = 0; p < path.length; p += 2) {
            const point = path[p];
            for (let oy = -bleedRadius; oy <= bleedRadius; oy++) {
                for (let ox = -bleedRadius; ox <= bleedRadius; ox++) {
                    const nx = point.x + ox, ny = point.y + oy;
                    if (nx < 0 || ny < 0 || nx >= pixW || ny >= pixH) continue;
                    const d = Math.hypot(ox, oy) / bleedRadius;
                    if (d >= 1) continue;
                    const index = ny * pixW + nx;
                    const boost = (1 - d) * (1 - d) * 0.16;
                    moistures[index] = Math.min(1, moistures[index] + boost);
                }
            }
        }
    }

    return {
        seed: worldSeed, options, dims, sea, resolution, pixW, pixH, terrainVersion,
        heights, moistures, temperatures, rivers,
    };
}

let cachedWorldKey = '';
let cachedWorldData = null;

export function worldDataKey(seed, rawOptions = {}, terrainVersion = TERRAIN_GENERATION_VERSION) {
    return normalizeWorldSeed(seed) + '|' + terrainVersion + '|' + JSON.stringify(normalizeWorldOptions(rawOptions));
}

export function getWorldData(seed, rawOptions = {}, terrainVersion = TERRAIN_GENERATION_VERSION) {
    const key = worldDataKey(seed, rawOptions, terrainVersion);
    if (key !== cachedWorldKey || !cachedWorldData) {
        cachedWorldData = generateWorldData(seed, rawOptions, terrainVersion);
        cachedWorldKey = key;
    }
    return cachedWorldData;
}

export function clearWorldDataCache() {
    cachedWorldKey = '';
    cachedWorldData = null;
}

// ── preview ───────────────────────────────────────────────────

// Draws the cached world data itself, pixel for pixel, fitted into the preview
// canvas. There is no second sampling pass and no preview-only river carving,
// so the shape the player approves is the shape the realm receives.
export function renderWorldPreview(ctx, width, height, rawOptions = {}, seed = 1) {
    const world = getWorldData(seed, rawOptions);
    const { pixW, pixH, heights, moistures, temperatures, sea, options, dims } = world;

    const image = ctx.createImageData(pixW, pixH);
    const data = image.data;
    for (let py = 0; py < pixH; py++) {
        for (let px = 0; px < pixW; px++) {
            const index = py * pixW + px;
            const h = heights[index];
            const west = heights[py * pixW + Math.max(0, px - 1)];
            const north = heights[Math.max(0, py - 1) * pixW + px];
            const northWest = heights[Math.max(0, py - 1) * pixW + Math.max(0, px - 1)];
            const shade = clamp((h - (west + north + northWest) / 3) * 2400, -30, 32);
            const color = terrainColor(h, moistures[index], temperatures[index], px, py, options.climate, sea, shade);
            const offset = index * 4;
            data[offset] = clamp(Math.round(color[0]), 0, 255);
            data[offset + 1] = clamp(Math.round(color[1]), 0, 255);
            data[offset + 2] = clamp(Math.round(color[2]), 0, 255);
            data[offset + 3] = 255;
        }
    }

    const hasCanvas = typeof OffscreenCanvas !== 'undefined' || typeof document !== 'undefined';
    if (!hasCanvas) {
        // Headless fallback keeps the pure data path testable without a DOM.
        ctx.putImageData(image, 0, 0);
        return world;
    }

    const source = typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(pixW, pixH)
        : document.createElement('canvas');
    source.width = pixW;
    source.height = pixH;
    const sourceCtx = source.getContext('2d');
    if (!sourceCtx) return world;
    sourceCtx.putImageData(image, 0, 0);

    const canvasW = Math.max(1, Math.floor(width));
    const canvasH = Math.max(1, Math.floor(height));
    const fit = Math.min(canvasW, canvasH);
    const scale = fit / dims.w;
    const drawW = Math.max(1, Math.round(dims.w * scale));
    const drawH = Math.max(1, Math.round(dims.h * scale));
    const offsetX = (canvasW - drawW) / 2;
    const offsetY = (canvasH - drawH) / 2;

    ctx.save();
    ctx.fillStyle = '#101a14';
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, offsetX, offsetY, drawW, drawH);
    ctx.restore();
    return world;
}

export { BIOME, PALETTES as TERRAIN_PALETTES };
