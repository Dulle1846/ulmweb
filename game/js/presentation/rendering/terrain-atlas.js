// Deterministic ground-detail atlas for the WebGL terrain shader.
//
// The shader builds its materials procedurally so the surface stays resolution
// independent, but pure noise at every scale reads as plastic. This module bakes
// small, perfectly seamless detail maps once. The shader modulates them over
// the procedural colour, so grass, rock, sand and snow gain a real surface
// texture without decoding image files or shipping binary assets.
//
// Every pattern is built from integer sine cycles or lattice noise wrapped at
// the tile border, which makes each tile tile seamlessly. Four variants per
// material are selected by region and cross-faded, so a meadow or rock field
// does not repeat one stamp across the whole map.
//
// The module is DOM-free: it allocates plain typed arrays so it can be unit
// tested in Node. Uploading to a texture is the renderer's job.

export const TERRAIN_ATLAS_TILE = 256;
export const TERRAIN_ATLAS_COLUMNS = 8;
export const TERRAIN_ATLAS_ROWS = 4;
export const TERRAIN_ATLAS_VARIANTS = 4;
export const TERRAIN_ATLAS_WIDTH = TERRAIN_ATLAS_TILE * TERRAIN_ATLAS_COLUMNS;
export const TERRAIN_ATLAS_HEIGHT = TERRAIN_ATLAS_TILE * TERRAIN_ATLAS_ROWS;

// Four contiguous tiles per material. The shader selects a base tile and walks
// the ring, so every material must stay a consecutive block.
export const TERRAIN_ATLAS_TILES = Object.freeze({
    grass: Object.freeze([0, 1, 2, 3]),
    forest: Object.freeze([4, 5, 6, 7]),
    rock: Object.freeze([8, 9, 10, 11]),
    sand: Object.freeze([12, 13, 14, 15]),
    snow: Object.freeze([16, 17, 18, 19]),
    earth: Object.freeze([20, 21, 22, 23]),
    wetland: Object.freeze([24, 25, 26, 27]),
});

export const TERRAIN_ATLAS_MATERIALS = Object.freeze(Object.keys(TERRAIN_ATLAS_TILES));

export const TERRAIN_ATLAS_NEUTRAL_TILES = Object.freeze([28, 29, 30, 31]);

// ── periodic noise ──────────────────────────────────────────────
// The lattice wraps at `period` cells, so a caller feeding u,v in [0,1) times
// `period` gets a pattern that repeats exactly at the tile border.

function hash2(x, y, seed) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
}

function smoothStep(t) {
    return t * t * (3 - 2 * t);
}

function wrapIndex(value, period) {
    const p = Math.max(1, period | 0);
    return ((value % p) + p) % p;
}

function periodicNoise(x, y, period, seed) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const tx = smoothStep(x - xi);
    const ty = smoothStep(y - yi);
    const x0 = wrapIndex(xi, period);
    const x1 = wrapIndex(xi + 1, period);
    const y0 = wrapIndex(yi, period);
    const y1 = wrapIndex(yi + 1, period);
    const a = hash2(x0, y0, seed);
    const b = hash2(x1, y0, seed);
    const c = hash2(x0, y1, seed);
    const d = hash2(x1, y1, seed);
    const top = a + (b - a) * tx;
    const bottom = c + (d - c) * tx;
    return top + (bottom - top) * ty;
}

function periodicFbm(u, v, period, octaves, seed) {
    let total = 0;
    let weight = 0;
    let amplitude = 1;
    let frequency = Math.max(1, period | 0);
    for (let octave = 0; octave < octaves; octave++) {
        total += amplitude * periodicNoise(u * frequency, v * frequency, frequency, seed + octave * 31);
        weight += amplitude;
        amplitude *= 0.5;
        frequency *= 2;
    }
    return weight > 0 ? total / weight : 0;
}

function clamp255(value) {
    return value < 0 ? 0 : value > 255 ? 255 : Math.round(value);
}

function smoothRange(edge0, edge1, value) {
    const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0 || 1)));
    return t * t * (3 - 2 * t);
}

// ── material painters ───────────────────────────────────────────
// Each painter returns [detail, macroVariation, contrast] in 0..255. The shader
// reads the red channel for surface detail; the other channels stay available
// for tint and contrast work without another texture fetch.

function grassTile(u, v, variant) {
    const seed = 11 + variant * 37;
    const clump = periodicFbm(u, v, 6, 3, seed);
    const tuft = periodicFbm(u, v, 18, 2, seed + 5);
    const blades = Math.sin(2 * Math.PI * (u * 54 + v * 3) + clump * 7.5 + variant * 1.7);
    const bladesFine = Math.sin(2 * Math.PI * (u * 37 - v * 6) + tuft * 9.0);
    let value = 146 + 46 * clump + 12 * (tuft - 0.5);
    value += 26 * blades + 10 * bladesFine;
    value -= 18 * smoothRange(0.78, 0.98, tuft);
    const tint = 0.5 + 0.5 * Math.sin(2 * Math.PI * (v * 2 + variant * 0.25) + clump * 4.0);
    return [value, 120 + 60 * clump, 150 + 30 * tint];
}

function forestTile(u, v, variant) {
    const seed = 31 + variant * 29;
    const canopy = periodicFbm(u, v, 4, 3, seed);
    const litter = periodicFbm(u, v, 11, 2, seed + 3);
    const leaf = Math.sin(2 * Math.PI * (u * 16 + v * 11) + litter * 6.0);
    let value = 112 + 42 * canopy + 16 * leaf;
    value += 26 * smoothRange(0.58, 0.86, litter);
    value -= 22 * smoothRange(0.76, 0.98, canopy);
    return [value, 100 + 70 * litter, 120 + 40 * canopy + 24 * leaf];
}

function rockTile(u, v, variant) {
    const seed = 53 + variant * 23;
    const structure = periodicFbm(u, v, 5, 2, seed);
    const strata = Math.sin(2 * Math.PI * (v * 7 + 0.18 * Math.sin(2 * Math.PI * u * 2)) + structure * 3.4);
    const cracks = 1 - Math.abs(2 * periodicFbm(u, v, 12, 2, seed + 9) - 1);
    let value = 134 + 34 * strata + 26 * structure;
    value -= 58 * smoothRange(0.86, 1.0, cracks);
    value += 20 * smoothRange(0.66, 0.92, periodicFbm(u, v, 26, 1, seed + 4));
    return [value, 110 + 70 * structure, 100 + 90 * cracks];
}

function sandTile(u, v, variant) {
    const seed = 71 + variant * 19;
    const swell = periodicFbm(u, v, 4, 2, seed);
    const ripple = Math.sin(2 * Math.PI * (v * 13 + u * 2) + swell * 5.5);
    const grit = periodicFbm(u, v, 32, 1, seed + 2);
    let value = 170 + 22 * ripple + 14 * (grit - 0.5);
    value += 10 * Math.sin(2 * Math.PI * (u * 9 - v * 4) + swell * 3.0);
    return [value, 140 + 50 * swell, 130 + 40 * ripple];
}

function snowTile(u, v, variant) {
    const seed = 91 + variant * 13;
    const drift = periodicFbm(u, v, 5, 3, seed);
    const crest = Math.sin(2 * Math.PI * (u * 3 + v * 2) + drift * 4.0);
    const cell = 64;
    const sparkle = hash2(wrapIndex(Math.floor(u * cell), cell), wrapIndex(Math.floor(v * cell), cell), seed + 7) > 0.975 ? 26 : 0;
    let value = 196 + 30 * drift + 12 * crest + sparkle;
    return [value, 170 + 40 * drift, 180 + 40 * crest];
}

function earthTile(u, v, variant) {
    const seed = 111 + variant * 17;
    const grain = periodicFbm(u, v, 10, 3, seed);
    const grit = periodicNoise(u * 44, v * 44, 44, seed + 1);
    const clod = periodicFbm(u, v, 22, 2, seed + 5);
    // Bare ground needs real relief at three scales: broad clods, mid-scale
    // grain and a fine crust. A single soft noise reads as a flat wash in-game.
    const crust = Math.sin(2 * Math.PI * (u * 14 + v * 9) + grain * 6.0 + variant * 2.1);
    const pebbles = smoothRange(0.72, 0.94, periodicFbm(u, v, 34, 2, seed + 11));
    let value = 148 + 56 * grain + 32 * (grit - 0.5) + 12 * crust;
    value -= 30 * smoothRange(0.58, 0.90, clod);
    value += 26 * pebbles;
    return [value, 120 + 70 * grain, 110 + 60 * clod];
}

function wetlandTile(u, v, variant) {
    const seed = 131 + variant * 23;
    const pools = periodicFbm(u, v, 5, 3, seed);
    const moss = periodicFbm(u, v, 16, 2, seed + 7);
    const reedBeds = smoothRange(0.52, 0.86, periodicFbm(u, v, 9, 2, seed + 3));
    // Standing water has to read darker than the moss, and the reeds have to
    // break the pool edges. A soft two-octave wash alone looked like wet felt.
    const reeds = Math.sin(2 * Math.PI * (u * 22 + v * 5) + moss * 5.0);
    const ripple = Math.sin(2 * Math.PI * (u * 7 - v * 3) + pools * 4.0);
    let value = 118 + 52 * pools;
    value -= 38 * smoothRange(0.52, 0.80, pools);
    value += 20 * (moss - 0.5) + 20 * reeds * (0.4 + 0.6 * reedBeds) + 10 * ripple;
    return [value, 90 + 80 * moss, 100 + 60 * pools];
}

const PAINTERS = Object.freeze({
    grass: grassTile,
    forest: forestTile,
    rock: rockTile,
    sand: sandTile,
    snow: snowTile,
    earth: earthTile,
    wetland: wetlandTile,
});

function paintTile(data, width, index, material, variant) {
    const painter = PAINTERS[material];
    const tile = TERRAIN_ATLAS_TILE;
    const column = index % TERRAIN_ATLAS_COLUMNS;
    const row = Math.floor(index / TERRAIN_ATLAS_COLUMNS);
    const originX = column * tile;
    const originY = row * tile;
    for (let y = 0; y < tile; y++) {
        const v = y / tile;
        for (let x = 0; x < tile; x++) {
            const u = x / tile;
            const [detail, macro, contrast] = painter(u, v, variant);
            const offset = ((originY + y) * width + originX + x) * 4;
            data[offset] = clamp255(detail);
            data[offset + 1] = clamp255(macro);
            data[offset + 2] = clamp255(contrast);
            data[offset + 3] = 255;
        }
    }
}

function paintNeutralTile(data, width, index) {
    const tile = TERRAIN_ATLAS_TILE;
    const column = index % TERRAIN_ATLAS_COLUMNS;
    const row = Math.floor(index / TERRAIN_ATLAS_COLUMNS);
    const originX = column * tile;
    const originY = row * tile;
    for (let y = 0; y < tile; y++) {
        for (let x = 0; x < tile; x++) {
            const offset = ((originY + y) * width + originX + x) * 4;
            data[offset] = 128;
            data[offset + 1] = 128;
            data[offset + 2] = 128;
            data[offset + 3] = 255;
        }
    }
}

let cachedAtlas = null;

export function buildTerrainAtlas({ fresh = false } = {}) {
    if (cachedAtlas && !fresh) return cachedAtlas;
    const width = TERRAIN_ATLAS_WIDTH;
    const height = TERRAIN_ATLAS_HEIGHT;
    const data = new Uint8Array(width * height * 4);
    for (const material of TERRAIN_ATLAS_MATERIALS) {
        const variants = TERRAIN_ATLAS_TILES[material];
        for (let variant = 0; variant < variants.length; variant++) {
            paintTile(data, width, variants[variant], material, variant);
        }
    }
    for (const index of TERRAIN_ATLAS_NEUTRAL_TILES) paintNeutralTile(data, width, index);
    const atlas = Object.freeze({
        width,
        height,
        tile: TERRAIN_ATLAS_TILE,
        columns: TERRAIN_ATLAS_COLUMNS,
        rows: TERRAIN_ATLAS_ROWS,
        variants: TERRAIN_ATLAS_VARIANTS,
        tiles: TERRAIN_ATLAS_TILES,
        neutralTiles: TERRAIN_ATLAS_NEUTRAL_TILES,
        data,
    });
    if (!fresh) cachedAtlas = atlas;
    return atlas;
}
