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
};

const IDS = {
    size: new Set(Object.keys(WORLD_SIZES)),
    shape: new Set(WORLD_SHAPES.map(entry => entry.id)),
    climate: new Set(CLIMATES.map(entry => entry.id)),
};

export function normalizeWorldOptions(options = {}) {
    const normalized = {};
    for (const key of ['landmass', 'ruggedness', 'forests', 'water', 'fertility', 'resources']) {
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

export function seaLevelFor(options = {}) {
    const o = normalizeWorldOptions(options);
    const level = BIOME.SHALLOW_WATER
        + (o.water - 50) * 0.00115
        - (o.landmass - 50) * 0.00075;
    return clamp(level, 0.235, 0.395);
}

// ── geographic shaping ────────────────────────────────────────

function shapeField(nx, ny, shape, edgeNoise) {
    const dx = nx * 2 - 1;
    const dy = ny * 2 - 1;
    const dist = Math.hypot(dx, dy);

    if (shape === 'archipelago') {
        const isles = fbm(nx * 4.6 + 7.3, ny * 4.6 + 2.1, 4, 0.55, 2.25);
        const cluster = smoothstep(0.46, 0.66, isles - dist * 0.16);
        return clamp(cluster * smoothstep(1.15, 0.3, dist), 0, 1);
    }
    if (shape === 'coastal') {
        const wobble = (edgeNoise - 0.5) * 0.30;
        return smoothstep(0.98, 0.12, nx + wobble + (ny - 0.5) * 0.22);
    }
    if (shape === 'inland' || shape === 'valley') return 1;
    // Continent: broad centre, ragged coastline.
    return smoothstep(1.16, 0.52, dist + (edgeNoise - 0.5) * 0.20);
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

    let h = base * 0.84 + Math.pow(clamp((base - 0.42) / 0.58, 0, 1), 1.5) * ridge * 0.38 * rugged;
    h += (edgeNoise - 0.5) * 0.05;

    if (options.shape === 'inland') {
        const dist = Math.hypot(nx * 2 - 1, ny * 2 - 1);
        h = 0.445 + h * 0.33 + smoothstep(0.52, 1.0, dist) * 0.22 + (edgeNoise - 0.5) * 0.05;
    } else if (options.shape === 'valley') {
        const dist = Math.hypot(nx * 2 - 1, ny * 2 - 1);
        h = 0.465 + h * 0.24 + Math.pow(dist, 2.05) * 0.30 + (edgeNoise - 0.5) * 0.04;
    } else {
        const mask = shapeField(nx, ny, options.shape, edgeNoise);
        h = h * (0.44 + 0.56 * mask) + 0.36 * (mask - 0.55) + (base - 0.5) * 0.10;
    }

    h += (options.landmass - 50) * 0.00115 - (options.water - 50) * 0.00095;
    return clamp(h, 0, 1);
}

export function sampleMoisture(wx, wy, rawOptions = {}) {
    const options = rawOptions.__normalized ? rawOptions : normalizeWorldOptions(rawOptions);
    const noise = fbm((wx + 512) * NOISE_SCALE * 1.28, (wy + 512) * NOISE_SCALE * 1.28, 4, 0.55, 2.0);
    return clamp(noise + (options.forests - 50) * 0.0032 + (options.fertility - 50) * 0.0016, 0, 1);
}

export function sampleTemperature(wx, wy, W, H, height, sea, rawOptions = {}) {
    const options = rawOptions.__normalized ? rawOptions : normalizeWorldOptions(rawOptions);
    const base = { temperate: 0.58, northern: 0.33, mediterranean: 0.69, arid: 0.79, enchanted: 0.52 }[options.climate] ?? 0.58;
    const latitude = 1 - Math.abs(wy / H - 0.5) * 2;   // 1 at the equator, 0 at the poles
    let t = base + (latitude - 0.62) * 0.26 - Math.max(0, height - sea) * 0.30;
    t += (fbm(wx * 0.0085 + 91.3, wy * 0.0085 + 17.9, 3, 0.5, 2.1) - 0.5) * 0.07;
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
export function carveWaterFeatures(heights, width, height, seed, sea, options = {}) {
    const rand = hashSeed(seed ^ 0x9e3779b9);
    const riverBudget = Math.max(3, Math.round((width * height) / 5200));
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
                const radius = 2 + Math.floor(rand() * 3);
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

// ── preview ───────────────────────────────────────────────────

// Renders the exact same height/moisture/temperature model at preview
// resolution. Water features are carved with the shared algorithm, so the
// coastline and rivers the player approves are the ones they get.
export function renderWorldPreview(ctx, width, height, rawOptions = {}, seed = 1) {
    const options = { ...normalizeWorldOptions(rawOptions), __normalized: true };
    const dims = resolveWorldDimensions(options);
    const sea = seaLevelFor(options);
    initNoise(seed);

    const previewW = Math.max(48, Math.floor(width));
    const previewH = Math.max(32, Math.floor(height));
    const heights = new Float32Array(previewW * previewH);
    const moistures = new Float32Array(previewW * previewH);
    const temperatures = new Float32Array(previewW * previewH);

    for (let y = 0; y < previewH; y++) {
        for (let x = 0; x < previewW; x++) {
            const wx = (x + 0.5) / previewW * dims.w;
            const wy = (y + 0.5) / previewH * dims.h;
            const h = sampleHeight(wx, wy, dims.w, dims.h, options);
            const index = y * previewW + x;
            heights[index] = h;
            moistures[index] = sampleMoisture(wx, wy, options);
            temperatures[index] = sampleTemperature(wx, wy, dims.w, dims.h, h, sea, options);
        }
    }

    carveWaterFeatures(heights, previewW, previewH, seed, sea, options);

    const image = ctx.createImageData(previewW, previewH);
    const data = image.data;
    for (let y = 0; y < previewH; y++) {
        for (let x = 0; x < previewW; x++) {
            const index = y * previewW + x;
            const left = heights[y * previewW + Math.max(0, x - 1)];
            const up = heights[Math.max(0, y - 1) * previewW + x];
            const shade = clamp((heights[index] - (left + up) * 0.5) * 900, -26, 26);
            const color = terrainColor(heights[index], moistures[index], temperatures[index], x, y, options.climate, sea, shade);
            const offset = index * 4;
            data[offset] = clamp(Math.round(color[0]), 0, 255);
            data[offset + 1] = clamp(Math.round(color[1]), 0, 255);
            data[offset + 2] = clamp(Math.round(color[2]), 0, 255);
            data[offset + 3] = 255;
        }
    }
    ctx.putImageData(image, 0, 0);
}

export { BIOME };
