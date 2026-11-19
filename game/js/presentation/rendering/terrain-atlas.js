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

// A field of short, isolated pen segments baked into a tile-sized mask. Each
// grid cell owns at most one stroke, with its own angle, length and position.
// Strokes are stamped with wrap-around so the field stays seamless. This is
// deliberately not a continuous sine: a sine hatch reads as woven fabric at
// close zoom, while separated marks read as a pen. Rasterising once keeps the
// atlas build cheap; sampling nine neighbours per pixel did not.
function buildStrokeMap(cells, seed, angle, density, jitter = 1.2, radius = 1.1, curve = 0.1, bundle = 1, lengthScale = 1) {
    const tile = TERRAIN_ATLAS_TILE;
    const grid = Math.max(2, cells | 0);
    const ink = new Uint8Array(tile * tile);
    for (let cy = 0; cy < grid; cy++) {
        for (let cx = 0; cx < grid; cx++) {
            if (hash2(cx, cy, seed) > density) continue;
            const px = (cx + 0.18 + 0.64 * hash2(cx, cy, seed + 1)) / grid * tile;
            const py = (cy + 0.18 + 0.64 * hash2(cx, cy, seed + 2)) / grid * tile;
            const baseAngle = angle + (hash2(cx, cy, seed + 3) - 0.5) * jitter;
            const baseLength = (0.30 + 0.62 * hash2(cx, cy, seed + 4)) / grid * tile * lengthScale;
            if (baseLength < 1) continue;
            for (let pass = 0; pass < bundle; pass++) {
                const passSeed = seed + 20 + pass * 7;
                const a = pass === 0
                    ? baseAngle
                    : baseAngle + (hash2(cx, cy, passSeed + 3) - 0.5) * 1.1;
                const length = pass === 0
                    ? baseLength
                    : baseLength * (0.42 + 0.28 * hash2(cx, cy, passSeed + 4));
                const hx = Math.cos(a) * length * 0.5;
                const hy = Math.sin(a) * length * 0.5;
                const nx = -hy / Math.max(0.001, length * 0.5);
                const ny = hx / Math.max(0.001, length * 0.5);
                const side = hash2(cx, cy, passSeed + 5) > 0.5 ? 1 : -1;
                const offset = pass === 0 ? 0 : side * (0.14 + 0.10 * hash2(cx, cy, passSeed + 6)) / grid * tile;
                const bend = curve * length * side;
                // Stamp a thin tapered arc rather than one straight segment. A
                // small bundle of two or three arcs reads as a grass tuft; a
                // single straight dash reads as straw or a scratch.
                const steps = Math.max(3, Math.ceil(length * 1.6));
                for (let step = 0; step <= steps; step++) {
                    const t = step / steps;
                    const arc = Math.sin(Math.PI * t) * bend;
                    const centerX = px + nx * offset + hx * (2 * t - 1) + nx * arc;
                    const centerY = py + ny * offset + hy * (2 * t - 1) + ny * arc;
                    const nib = radius * (0.55 + 0.45 * Math.sin(Math.PI * t));
                    const reach = Math.ceil(nib * 2.4);
                    const minX = Math.floor(centerX - reach);
                    const maxX = Math.ceil(centerX + reach);
                    const minY = Math.floor(centerY - reach);
                    const maxY = Math.ceil(centerY + reach);
                    for (let y = minY; y <= maxY; y++) {
                        const sy = ((y % tile) + tile) % tile;
                        for (let x = minX; x <= maxX; x++) {
                            const distance = Math.hypot(x - centerX, y - centerY);
                            const mark = 1 - smoothRange(nib, nib * 2.4, distance);
                            if (mark <= 0) continue;
                            const sx = ((x % tile) + tile) % tile;
                            const index = sy * tile + sx;
                            const value = mark * 255;
                            if (value > ink[index]) ink[index] = value;
                        }
                    }
                }
            }
        }
    }
    return softenStrokeMap(softenStrokeMap(ink));
}

// Wrap blur takes the hard stamp edge off the nib. Two passes soften the
// antialiased slope enough that the tile border is seamless in value and
// gradient, which is what a hand-drawn mark crossing the fold should be.
function softenStrokeMap(ink) {
    const tile = TERRAIN_ATLAS_TILE;
    const soft = new Uint8Array(tile * tile);
    for (let y = 0; y < tile; y++) {
        const up = ((y - 1 + tile) % tile) * tile;
        const down = ((y + 1) % tile) * tile;
        const row = y * tile;
        for (let x = 0; x < tile; x++) {
            const left = (x - 1 + tile) % tile;
            const right = (x + 1) % tile;
            soft[row + x] = Math.round((
                ink[row + x] * 4
                + (ink[row + left] + ink[row + right] + ink[up + x] + ink[down + x]) * 2
                + ink[up + left] + ink[up + right] + ink[down + left] + ink[down + right]
            ) / 16);
        }
    }
    return soft;
}

// Per-material pen character: number of cells, dominant stroke direction,
// coverage, angle spread and nib radius in atlas pixels.
const HATCH_STYLE = Object.freeze({
    grass: Object.freeze({ cells: 16, angle: -1.35, density: 0.60, jitter: 0.85, radius: 0.95, curve: 0.18, bundle: 2, lengthScale: 0.55 }),
    forest: Object.freeze({ cells: 14, angle: -1.15, density: 0.58, jitter: 1.8, radius: 1.05, curve: 0.16, bundle: 2, lengthScale: 0.55 }),
    rock: Object.freeze({ cells: 9, angle: 0.15, density: 0.50, jitter: 1.2, radius: 1.15, curve: 0.06 }),
    sand: Object.freeze({ cells: 16, angle: 0.08, density: 0.30, jitter: 1.1, radius: 0.9, curve: 0.10 }),
    snow: Object.freeze({ cells: 14, angle: 0.02, density: 0.28, jitter: 0.8, radius: 0.9, curve: 0.05 }),
    earth: Object.freeze({ cells: 11, angle: 0.35, density: 0.50, jitter: 1.4, radius: 1.1, curve: 0.12, bundle: 2, lengthScale: 0.8 }),
    wetland: Object.freeze({ cells: 14, angle: -1.42, density: 0.55, jitter: 0.65, radius: 1.0, curve: 0.22, bundle: 2, lengthScale: 0.70 }),
});

// ── material painters ───────────────────────────────────────────
// Each painter returns [detail, macroVariation, hatch] in 0..255. The shader
// reads red for surface relief, green for macro contrast and blue for the
// hand-drawn hatch strokes that carry the ink-work at close zoom. Alpha stays
// opaque so the atlas remains a plain RGB surface.

function grassTile(u, v, variant) {
    const seed = 11 + variant * 37;
    const clump = periodicFbm(u, v, 6, 2, seed);
    const tuft = periodicFbm(u, v, 18, 1, seed + 5);
    // Isotropic grain, not sine blades: the old 54-cycle blade field turned
    // into a woolly vertical moire when the atlas was minified at close zoom.
    const grainDetail = periodicNoise(u * 24, v * 24, 24, seed + 13);
    let value = 146 + 52 * clump + 10 * (tuft - 0.5);
    value += 22 * (grainDetail - 0.5);
    value -= 14 * smoothRange(0.78, 0.98, tuft);
    return [value, 120 + 60 * clump];
}

function forestTile(u, v, variant) {
    const seed = 31 + variant * 29;
    const canopy = periodicFbm(u, v, 4, 2, seed);
    const litter = periodicFbm(u, v, 11, 1, seed + 3);
    const leafGrain = periodicNoise(u * 20, v * 20, 20, seed + 13);
    let value = 112 + 42 * canopy + 18 * (leafGrain - 0.5);
    value += 26 * smoothRange(0.58, 0.86, litter);
    value -= 22 * smoothRange(0.76, 0.98, canopy);
    return [value, 100 + 70 * litter];
}

function rockTile(u, v, variant) {
    const seed = 53 + variant * 23;
    const structure = periodicFbm(u, v, 5, 2, seed);
    const strata = Math.sin(2 * Math.PI * (v * 7 + 0.18 * Math.sin(2 * Math.PI * u * 2)) + structure * 3.4);
    const cracks = 1 - Math.abs(2 * periodicFbm(u, v, 12, 2, seed + 9) - 1);
    let value = 134 + 34 * strata + 26 * structure;
    value -= 58 * smoothRange(0.86, 1.0, cracks);
    value += 20 * smoothRange(0.66, 0.92, periodicFbm(u, v, 26, 1, seed + 4));
    return [value, 110 + 70 * structure];
}

function sandTile(u, v, variant) {
    const seed = 71 + variant * 19;
    const swell = periodicFbm(u, v, 4, 2, seed);
    const ripple = Math.sin(2 * Math.PI * (v * 13 + u * 2) + swell * 5.5);
    const grit = periodicFbm(u, v, 32, 1, seed + 2);
    let value = 170 + 22 * ripple + 14 * (grit - 0.5);
    value += 10 * Math.sin(2 * Math.PI * (u * 9 - v * 4) + swell * 3.0);
    return [value, 140 + 50 * swell];
}

function snowTile(u, v, variant) {
    const seed = 91 + variant * 13;
    const drift = periodicFbm(u, v, 5, 2, seed);
    const crest = Math.sin(2 * Math.PI * (u * 3 + v * 2) + drift * 4.0);
    const cell = 64;
    const sparkle = hash2(wrapIndex(Math.floor(u * cell), cell), wrapIndex(Math.floor(v * cell), cell), seed + 7) > 0.975 ? 26 : 0;
    let value = 196 + 30 * drift + 12 * crest + sparkle;
    return [value, 170 + 40 * drift];
}

function earthTile(u, v, variant) {
    const seed = 111 + variant * 17;
    const grain = periodicFbm(u, v, 10, 2, seed);
    const grit = periodicNoise(u * 44, v * 44, 44, seed + 1);
    const clod = periodicFbm(u, v, 22, 1, seed + 5);
    // Bare ground needs real relief at three scales: broad clods, mid-scale
    // grain and a fine crust. A single soft noise reads as a flat wash in-game.
    const crust = Math.sin(2 * Math.PI * (u * 14 + v * 9) + grain * 6.0 + variant * 2.1);
    const pebbles = smoothRange(0.72, 0.94, periodicFbm(u, v, 34, 2, seed + 11));
    let value = 148 + 56 * grain + 32 * (grit - 0.5) + 12 * crust;
    value -= 30 * smoothRange(0.58, 0.90, clod);
    value += 26 * pebbles;
    return [value, 120 + 70 * grain];
}

function wetlandTile(u, v, variant) {
    const seed = 131 + variant * 23;
    const pools = periodicFbm(u, v, 5, 2, seed);
    const moss = periodicFbm(u, v, 16, 1, seed + 7);
    const reedBeds = smoothRange(0.52, 0.86, periodicFbm(u, v, 9, 2, seed + 3));
    // Standing water has to read darker than the moss, and the reeds have to
    // break the pool edges. A soft two-octave wash alone looked like wet felt.
    const reeds = Math.sin(2 * Math.PI * (u * 22 + v * 5) + moss * 5.0);
    const ripple = Math.sin(2 * Math.PI * (u * 7 - v * 3) + pools * 4.0);
    let value = 118 + 52 * pools;
    value -= 38 * smoothRange(0.52, 0.80, pools);
    value += 20 * (moss - 0.5) + 20 * reeds * (0.4 + 0.6 * reedBeds) + 10 * ripple;
    return [value, 90 + 80 * moss];
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
    const style = HATCH_STYLE[material];
    const hatchSeed = 211 + variant * 71 + material.length * 31 + material.charCodeAt(0) * 3;
    const hatch = buildStrokeMap(style.cells, hatchSeed, style.angle, style.density, style.jitter, style.radius, style.curve, style.bundle || 1, style.lengthScale || 1);
    for (let y = 0; y < tile; y++) {
        const v = y / tile;
        for (let x = 0; x < tile; x++) {
            const u = x / tile;
            const [detail, macro] = painter(u, v, variant);
            // Broad clumps and bare patches keep the pen from spreading an
            // even stipple over the whole meadow.
            const clumpMask = smoothRange(0.38, 0.64, periodicNoise(u * 4, v * 4, 4, hatchSeed + 31));
            const offset = ((originY + y) * width + originX + x) * 4;
            data[offset] = clamp255(detail);
            data[offset + 1] = clamp255(macro);
            data[offset + 2] = Math.round(hatch[y * tile + x] * (0.34 + 0.66 * clumpMask));
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
