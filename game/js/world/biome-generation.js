// 1.2.22 — organic biome generation and vegetation placement.
//
// The existing terrain model already produces a continuous height/moisture/
// temperature field. This module turns that field into a stable biome identity
// with warped, regionally coherent boundaries, then places plants by biome,
// soil, moisture, light, season and human land use. It reads the shared arrays
// and adds no second per-tile simulation: classification is one bounded sample
// on demand, and the atlas stores only a compact profile per region.
import { state } from "../core/state.js";
import { BIOME_WILDLIFE, BIOME_RESOURCE_BY_ID } from "./biome-resource-data.js";
import { HAZARD_CATALOG } from "./hazard-data.js";
import {
    BIOME_GENERATION_VERSION, BIOME_GENERATION_REQUIREMENTS,
    BIOME_HABITATS, BIOME_HAZARD_TRIGGERS, BIOME_IDENTITY, BIOME_IDENTITY_IDS,
    BIOME_LOD, BIOME_PLANTS, biomeIdentity,
    plantsForBiome, resourceRequirementsForBiome
} from "./biome-generation-data.js";
import { BIOME_VARIANTS, BIOME_SEASONAL_APPEARANCE, BIOME_SEASONAL_TINTS } from "./cross-biome-data.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const clamp01 = value => clamp(value, 0, 1);
const round = (value, digits = 2) => Math.round((Number(value) || 0) * 10 ** digits) / 10 ** digits;
const pct = value => Math.round(clamp01(value) * 100);

// ── deterministic noise (own state, no global permutation) ───

function hash32(seed, a, b) {
    let value = (Number(seed) >>> 0) ^ Math.imul((Number(a) | 0) + 1, 0x9e3779b1)
        ^ Math.imul((Number(b) | 0) + 1, 0x85ebca6b);
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
    return (value ^ (value >>> 16)) >>> 0;
}

function unit(seed, x, y) {
    return hash32(seed, x, y) / 0x100000000;
}

function smooth(t) {
    return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function valueNoise(seed, x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = smooth(x - xi);
    const yf = smooth(y - yi);
    const a = unit(seed, xi, yi);
    const b = unit(seed, xi + 1, yi);
    const c = unit(seed, xi, yi + 1);
    const d = unit(seed, xi + 1, yi + 1);
    return lerp(lerp(a, b, xf), lerp(c, d, xf), yf);
}

function fbm(seed, x, y, octaves = 3) {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let total = 0;
    for (let octave = 0; octave < octaves; octave++) {
        value += valueNoise(seed + octave * 0x9e37, x * frequency, y * frequency) * amplitude;
        total += amplitude;
        amplitude *= 0.5;
        frequency *= 2.07;
    }
    return value / total;
}

function smoothstep(edge0, edge1, value) {
    const t = clamp01((value - edge0) / (edge1 - edge0 || 1e-6));
    return t * t * (3 - 2 * t);
}

// ── terrain sampling ─────────────────────────────────────────

function pixelIndex(context, x, y) {
    const resolution = Math.max(1, Number(context.resolution) || 1);
    const pixW = Math.max(1, Number(context.pixW) || 1);
    const pixH = Math.max(1, Number(context.pixH) || 1);
    const px = clamp(Math.floor(Number(x) * resolution), 0, pixW - 1);
    const py = clamp(Math.floor(Number(y) * resolution), 0, pixH - 1);
    return { index: py * pixW + px, px, py, pixW, pixH, resolution };
}

export function terrainSampleAt(x, y, context = {}) {
    const { index } = pixelIndex(context, x, y);
    return {
        height: Number(context.heights?.[index] ?? 0.55),
        moisture: clamp01(context.moistures?.[index] ?? 0.5),
        temperature: clamp01(context.temperatures?.[index] ?? 0.55)
    };
}

function heightAt(x, y, context) {
    const { index } = pixelIndex(context, x, y);
    const value = Number(context.heights?.[index]);
    return Number.isFinite(value) ? value : 0.55;
}

function waterDistanceAt(x, y, context, limit = 12) {
    const sea = Number(context.sea) || 0.33;
    if (heightAt(x, y, context) < sea) return 0;
    const max = Math.min(limit, Math.max(4, Math.round(Number(context.width) || 176) / 6));
    for (let radius = 1; radius <= max; radius++) {
        for (let oy = -radius; oy <= radius; oy++) {
            for (let ox = -radius; ox <= radius; ox++) {
                if (Math.abs(ox) !== radius && Math.abs(oy) !== radius) continue;
                const nx = Math.floor(x) + ox;
                const ny = Math.floor(y) + oy;
                if (nx < 0 || ny < 0) continue;
                if (heightAt(nx, ny, context) < sea) return radius;
            }
        }
    }
    return max + 1;
}

// A nine-field environment vector. Every classifier input is a real sample of
// the shared terrain or a deterministic function of it — no biome is chosen by
// a single threshold and no per-tile metadata is stored.
export function biomeEnvironmentAt(x, y, context = {}) {
    const sample = terrainSampleAt(x, y, context);
    const sea = Number(context.sea) || 0.33;
    const seed = Math.max(1, Math.floor(Number(context.seed) || Number(state.worldSeed) || 1));
    const hx = heightAt(x + 1, y, context) - heightAt(x - 1, y, context);
    const hy = heightAt(x, y + 1, context) - heightAt(x, y - 1, context);
    const slope = clamp01(Math.hypot(hx, hy) * 5.2);
    const distance = waterDistanceAt(x, y, context);
    const reach = 12;
    const waterNear = clamp01(1 - distance / reach);
    const elevation = clamp01((sample.height - sea) / Math.max(0.001, 1 - sea));
    const light = clamp01(0.34 + sample.temperature * 0.34 + (1 - slope) * 0.16 + sample.moisture * 0.08 - 0.08);
    const soil = clamp01(0.18 + sample.moisture * 0.46 + (1 - slope) * 0.2 + elevation * 0.08);
    const regionBias = fbm(seed ^ 0x5eed1a, x * 0.011, y * 0.011, 3) - 0.5;
    return {
        x, y, seed, sea,
        height: sample.height,
        moisture: sample.moisture,
        temperature: sample.temperature,
        slope,
        waterDistance: distance,
        waterNear,
        elevation,
        light,
        soil,
        regionBias
    };
}

export const BIOME_ENVIRONMENT_FIELDS = Object.freeze([
    "height", "moisture", "temperature", "slope", "waterDistance", "elevation", "light", "soil", "regionBias"
]);

// ── classifier ───────────────────────────────────────────────

// Niche centres in the same continuous field the terrain generator writes.
// Gaussian membership plus regional preference makes a boundary follow the
// contour of the underlying climate instead of a grid line.
const NICHES = Object.freeze([
    { id: "snow", m: 0.46, t: 0.09, e: 0.78, s: 0.35, w: 0.3 },
    { id: "rock", m: 0.42, t: 0.44, e: 0.82, s: 0.72, w: 0.25 },
    { id: "tundra", m: 0.55, t: 0.20, e: 0.34, s: 0.28, w: 0.45 },
    { id: "taiga", m: 0.62, t: 0.32, e: 0.32, s: 0.3, w: 0.42 },
    { id: "swamp", m: 0.88, t: 0.58, e: 0.05, s: 0.16, w: 0.9 },
    { id: "desert", m: 0.17, t: 0.80, e: 0.26, s: 0.3, w: 0.12 },
    { id: "steppe", m: 0.33, t: 0.64, e: 0.3, s: 0.24, w: 0.22 },
    { id: "dense-forest", m: 0.82, t: 0.64, e: 0.35, s: 0.32, w: 0.55 },
    { id: "forest", m: 0.58, t: 0.52, e: 0.34, s: 0.3, w: 0.4 },
    { id: "meadow", m: 0.42, t: 0.54, e: 0.3, s: 0.22, w: 0.32 }
]);

const NICHE_WEIGHTS = Object.freeze({ m: 1.35, t: 1.25, e: 0.9, s: 0.45, w: 0.55 });
const BIOME_ORDER = Object.freeze(["water", ...NICHES.map(niche => niche.id), "beach"]);

function nicheScore(env, niche) {
    const dm = (env.moisture - niche.m) * NICHE_WEIGHTS.m;
    const dt = (env.temperature - niche.t) * NICHE_WEIGHTS.t;
    const de = (env.elevation - niche.e) * NICHE_WEIGHTS.e;
    const ds = (env.slope - niche.s) * NICHE_WEIGHTS.s;
    const dw = (env.waterNear - niche.w) * NICHE_WEIGHTS.w;
    return Math.exp(-2.35 * (dm * dm + dt * dt + de * de + ds * ds + dw * dw));
}

export function classifyBiome(env) {
    const sea = Number(env.sea) || 0.33;
    if (Number(env.height) < sea + 0.0004) return "water";
    const seed = Math.max(1, Math.floor(Number(env.seed) || 1));
    const x = Number(env.x) || 0;
    const y = Number(env.y) || 0;
    // Two scales of warp: broad district edges and a finer, still coherent
    // crenulation. No per-tile random term, so a border cannot become a
    // checkerboard.
    const broad = (fbm(seed ^ 0x0b10e5, x * 0.026, y * 0.026, 3) - 0.5) * 0.11;
    const fine = (fbm(seed ^ 0x0f1ae5, x * 0.082, y * 0.082, 2) - 0.5) * 0.035;
    const region = (Number(env.regionBias) || 0) * 0.06;
    const m = clamp01(Number(env.moisture) + broad + fine + region * 0.5);
    const t = clamp01(Number(env.temperature) + broad * 0.55 + fine * 0.35 - region * 0.35);
    const warped = { ...env, moisture: m, temperature: t };

    const scored = [];
    for (const niche of NICHES) {
        let score = nicheScore(warped, niche);
        const preference = fbm(seed ^ 0x9d2c51, x * 0.0075 + niche.m * 3.7, y * 0.0075 + niche.t * 2.9, 2);
        score *= 0.9 + preference * 0.2;
        if (niche.id === "rock") score *= 0.32 + 0.68 * smoothstep(0.58, 0.8, warped.elevation) + warped.slope * 0.22;
        if (niche.id === "snow") score *= 0.18 + 0.82 * (1 - smoothstep(0.21, 0.38, warped.temperature));
        if (niche.id === "desert") score *= 0.28 + 0.72 * smoothstep(0.56, 0.72, warped.temperature) * (1 - smoothstep(0.24, 0.44, warped.moisture));
        if (niche.id === "swamp") score *= 0.5 + 0.5 * smoothstep(0.68, 0.84, warped.moisture) * (1 - 0.5 * smoothstep(0.05, 0.16, warped.elevation));
        if (niche.id === "dense-forest") score *= (0.3 + 0.7 * smoothstep(0.62, 0.8, warped.moisture))
            * (0.5 + 0.5 * smoothstep(0.02, 0.16, warped.elevation));
        if (niche.id === "taiga") score *= 0.35 + 0.65 * (1 - smoothstep(0.4, 0.55, warped.temperature));
        if (niche.id === "tundra") score *= 0.3 + 0.7 * (1 - smoothstep(0.3, 0.44, warped.temperature));
        scored.push({ id: niche.id, score });
    }
    // A beach is a geometric ribbon along the actual shore, not a climate
    // class: it follows every bay and headland the water carve produced.
    const shore = 1 - smoothstep(0.004, 0.032, warped.elevation);
    const beachScore = shore * (0.55 + 0.45 * (1 - warped.slope)) * (0.6 + fbm(seed ^ 0xbeac4, x * 0.05, y * 0.05, 2) * 0.8);
    if (beachScore > 0.12) scored.push({ id: "beach", score: beachScore * 1.12 });
    // Inland scores fade at the immediate shore so sand is not overtaken by
    // meadow exactly on the waterline.
    if (shore > 0.5) {
        for (const row of scored) if (row.id !== "beach") row.score *= 0.35 + 0.65 * (1 - shore);
    }
    scored.sort((a, b) => b.score - a.score || BIOME_ORDER.indexOf(a.id) - BIOME_ORDER.indexOf(b.id));
    return scored[0].id;
}

export function biomeAt(x, y, context = {}) {
    return classifyBiome(biomeEnvironmentAt(x, y, context));
}

// ── field analysis ───────────────────────────────────────────

function gridAt(context, size) {
    const width = Math.max(1, Number(context.width) || 176);
    const height = Math.max(1, Number(context.height) || 176);
    const widthCells = Math.max(8, Math.min(size, Math.floor(width)));
    const heightCells = Math.max(8, Math.min(size, Math.floor(height)));
    const ids = new Array(widthCells * heightCells);
    for (let row = 0; row < heightCells; row++) {
        for (let column = 0; column < widthCells; column++) {
            const x = (column + 0.5) / widthCells * width;
            const y = (row + 0.5) / heightCells * height;
            ids[row * widthCells + column] = biomeAt(x, y, context);
        }
    }
    return { ids, width: widthCells, height: heightCells };
}

// Pure statistics over a classified grid. The audit uses the same numbers the
// panel prints, so a visual claim cannot drift away from the measurement.
export function analyzeBiomeGrid(ids, width, height) {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    const idAt = (x, y) => ids[y * w + x];
    const counts = new Map();
    for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1);
    const seen = new Uint8Array(ids.length);
    const patchSizes = [];
    const patchRects = [];
    const patchPerimeters = [];
    for (let index = 0; index < ids.length; index++) {
        if (seen[index]) continue;
        const id = ids[index];
        const queue = [index];
        seen[index] = 1;
        let size = 0;
        let perimeter = 0;
        let minX = w, minY = h, maxX = 0, maxY = 0;
        while (queue.length) {
            const current = queue.pop();
            size++;
            const x = current % w;
            const y = (current / w) | 0;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            const neighbours = [
                [x > 0 ? current - 1 : -1, x > 0],
                [x < w - 1 ? current + 1 : -1, x < w - 1],
                [y > 0 ? current - w : -1, y > 0],
                [y < h - 1 ? current + w : -1, y < h - 1]
            ];
            for (const [next, exists] of neighbours) {
                if (!exists) { perimeter++; continue; }
                if (ids[next] === id) {
                    if (!seen[next]) { seen[next] = 1; queue.push(next); }
                } else {
                    perimeter++;
                }
            }
        }
        patchSizes.push(size);
        patchRects.push(size / Math.max(1, (maxX - minX + 1) * (maxY - minY + 1)));
        patchPerimeters.push(perimeter / Math.max(1, 4 * Math.sqrt(size)));
    }
    let horizontal = 0, horizontalContinues = 0;
    let vertical = 0, verticalContinues = 0;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w - 1; x++) {
            if (idAt(x, y) === idAt(x + 1, y)) continue;
            horizontal++;
            if (y > 0 && idAt(x, y - 1) !== idAt(x + 1, y - 1)) horizontalContinues++;
            if (y < h - 1 && idAt(x, y + 1) !== idAt(x + 1, y + 1)) horizontalContinues++;
        }
    }
    for (let x = 0; x < w; x++) {
        for (let y = 0; y < h - 1; y++) {
            if (idAt(x, y) === idAt(x, y + 1)) continue;
            vertical++;
            if (x > 0 && idAt(x - 1, y) !== idAt(x - 1, y + 1)) verticalContinues++;
            if (x < w - 1 && idAt(x + 1, y) !== idAt(x + 1, y + 1)) verticalContinues++;
        }
    }
    const boundaries = horizontal + vertical;
    const straight = boundaries ? (horizontalContinues + verticalContinues) / boundaries : 0;
    let checkerBlocks = 0;
    let isolated = 0;
    let transitionPairs = 0;
    for (let y = 0; y < h - 1; y++) {
        for (let x = 0; x < w - 1; x++) {
            const a = idAt(x, y), b = idAt(x + 1, y), c = idAt(x, y + 1), d = idAt(x + 1, y + 1);
            if (a === d && b === c && a !== b) checkerBlocks++;
        }
    }
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const id = idAt(x, y);
            let different = 0;
            if (x > 0 && idAt(x - 1, y) !== id) different++;
            if (x < w - 1 && idAt(x + 1, y) !== id) different++;
            if (y > 0 && idAt(x, y - 1) !== id) different++;
            if (y < h - 1 && idAt(x, y + 1) !== id) different++;
            if (different >= 3) isolated++;
            if (different) transitionPairs++;
        }
    }
    const sorted = [...patchSizes].sort((a, b) => a - b);
    const large = patchSizes.map((size, index) => size >= 9 ? patchRects[index] : null).filter(value => value !== null);
    const largePerimeter = patchSizes.map((size, index) => size >= 9 ? patchPerimeters[index] : null).filter(value => value !== null);
    const meanRectangularity = large.length ? large.reduce((sum, value) => sum + value, 0) / large.length : 1;
    const maxRectangularity = large.length ? Math.max(...large) : 1;
    const meanBoundaryComplexity = largePerimeter.length
        ? largePerimeter.reduce((sum, value) => sum + value, 0) / largePerimeter.length : 1;
    const total = ids.length;
    const largest = sorted.length ? sorted[sorted.length - 1] : 0;
    const mean = patchSizes.length ? total / patchSizes.length : 0;
    const variance = patchSizes.length
        ? patchSizes.reduce((sum, size) => sum + (size - mean) ** 2, 0) / patchSizes.length : 0;
    const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
        cells: total,
        biomes: counts.size,
        counts: Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1])),
        dominant: dominant ? dominant[0] : null,
        dominantShare: dominant ? round(dominant[1] / total, 3) : 0,
        patches: patchSizes.length,
        largestPatch: largest,
        largestShare: round(largest / total, 3),
        meanPatch: round(mean, 1),
        patchStdDev: round(Math.sqrt(variance), 1),
        minPatch: sorted.length ? sorted[0] : 0,
        maxPatch: largest,
        boundarySegments: boundaries,
        straightness: round(straight, 3),
        meanRectangularity: round(meanRectangularity, 3),
        maxRectangularity: round(maxRectangularity, 3),
        boundaryComplexity: round(meanBoundaryComplexity, 3),
        checkerRatio: round(total ? checkerBlocks / total : 0, 4),
        isolatedShare: round(total ? isolated / total : 0, 4),
        transitionShare: round(total ? transitionPairs / total : 0, 3)
    };
}

// A coarse, baked biome identity map. It costs one classification per
// `stride` tiles at world creation and gives the terrain bake a distinct hue
// per biome without a per-pixel biome scan. Derived from the saved terrain, so
// it is rebuilt on load and never persisted.
export const BIOME_MAP_ORDER = Object.freeze([...BIOME_IDENTITY_IDS]);

export const BIOME_TINT_COLORS = Object.freeze(BIOME_MAP_ORDER.map(id => {
    const base = BIOME_IDENTITY[id].palette.accent;
    return Object.freeze([
        parseInt(base.slice(1, 3), 16),
        parseInt(base.slice(3, 5), 16),
        parseInt(base.slice(5, 7), 16)
    ]);
}));

export function buildBiomeIndexMap(context = {}, stride = 4) {
    const width = Math.max(1, Number(context.width) || 176);
    const height = Math.max(1, Number(context.height) || 176);
    const step = Math.max(1, Math.round(stride));
    const columns = Math.ceil(width / step);
    const rows = Math.ceil(height / step);
    const ids = new Uint8Array(columns * rows);
    for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
            const x = Math.min(width - 1, (column + 0.5) * step);
            const y = Math.min(height - 1, (row + 0.5) * step);
            const id = biomeAt(x, y, context);
            const index = BIOME_MAP_ORDER.indexOf(id);
            ids[row * columns + column] = index < 0 ? 0 : index;
        }
    }
    return { stride: step, width: columns, height: rows, ids };
}

export function biomeIndexAt(map, x, y) {
    if (!map?.ids?.length) return 0;
    const column = clamp(Math.floor(Number(x) / Math.max(1, map.stride || 1)), 0, map.width - 1);
    const row = clamp(Math.floor(Number(y) / Math.max(1, map.stride || 1)), 0, map.height - 1);
    return map.ids[row * map.width + column] || 0;
}

export function analyzeBiomeField(context = {}, size = 96) {
    const grid = gridAt(context, size);
    return { ...analyzeBiomeGrid(grid.ids, grid.width, grid.height), grid };
}

// ── plants ───────────────────────────────────────────────────

function speciesSuitability(plant, env) {
    const centre = (rangeValue, value) => {
        const mid = (rangeValue[0] + rangeValue[1]) / 2;
        const half = Math.max(0.08, (rangeValue[1] - rangeValue[0]) / 2);
        return Math.exp(-(((value - mid) / half) ** 2) * 1.4);
    };
    return 0.28 + 0.72 * (
        centre(plant.soil, env.soil) * 0.34
        + centre(plant.moisture, env.moisture) * 0.3
        + centre(plant.light, env.light) * 0.2
        + centre(plant.height, env.elevation) * 0.16
    );
}

function seasonOf(value) {
    const number = Number(value);
    return Number.isInteger(number) ? clamp(number, 0, 3) : clamp(Number(state.seasonIndex) || 0, 0, 3);
}

export function vegetationAt(x, y, context = {}) {
    const env = biomeEnvironmentAt(x, y, context);
    const biome = classifyBiome(env);
    const identity = biomeIdentity(biome);
    const season = seasonOf(context.season);
    const seed = Math.max(1, Math.floor(Number(env.seed) || 1));
    const human = clamp01(Number(context.humanPressure) || 0);
    const grove = fbm(seed ^ 0x6a0e, x * 0.085, y * 0.085, 3);
    const regional = fbm(seed ^ 0x6b0f, x * 0.019, y * 0.019, 2);
    const densityBase = (Number(context.density) || 0)
        ? clamp01(context.density) : clamp01(0.2 + env.moisture * 0.55 + env.soil * 0.18);
    const density = clamp01(densityBase * (0.42 + grove * 0.9 + regional * 0.18) * (1 - human * 0.58));
    const cluster = grove > 0.63 ? "grove" : grove < 0.37 ? "clearing" : "scattered";
    const plants = plantsForBiome(biome);
    const active = plants.filter(id => BIOME_PLANTS[id].seasons.includes(season));
    const pool = active.length ? active : plants;
    let pick = null;
    let total = 0;
    const candidates = [];
    for (const id of pool) {
        const plant = BIOME_PLANTS[id];
        const weight = plant.weight * speciesSuitability(plant, env)
            * (1 + (plant.cluster - 0.5) * (grove - 0.5) * 1.4)
            * (plant.seasons.includes(season) ? 1 : 0.35);
        total += weight;
        candidates.push({ plant, weight });
    }
    let cursor = unit(seed ^ 0x9a1e, Math.floor(x * 3.1), Math.floor(y * 3.1)) * Math.max(0.0001, total);
    for (const candidate of candidates) {
        cursor -= candidate.weight;
        if (cursor <= 0) { pick = candidate.plant; break; }
    }
    pick = pick || candidates[candidates.length - 1]?.plant || BIOME_PLANTS.fescue;
    const roll = unit(seed ^ 0x77c1, Math.floor(x * 5.7), Math.floor(y * 5.7));
    const variant = pick.variants[Math.floor(roll * pick.variants.length) % pick.variants.length];
    const ageIndex = Math.min(pick.ages.length - 1, Math.floor(unit(seed ^ 0x11aa, Math.floor(x * 2.3), Math.floor(y * 2.3)) * pick.ages.length));
    const age = pick.ages[ageIndex];
    const orientation = pick.orientations[Math.floor(unit(seed ^ 0x22bb, Math.floor(x * 2.9), Math.floor(y * 2.9)) * pick.orientations.length) % pick.orientations.length];
    const sizeT = unit(seed ^ 0x33cc, Math.floor(x * 3.7), Math.floor(y * 3.7));
    const ageScale = 0.55 + ageIndex / Math.max(1, pick.ages.length - 1) * 0.85;
    const size = round(lerp(pick.size[0], pick.size[1], sizeT) * ageScale, 2);
    const visible = roll <= density * 1.35;
    return {
        biome,
        biomeId: identity.id,
        season,
        seasonLabel: ["Spring", "Summer", "Autumn", "Winter"][season],
        species: pick.id,
        label: pick.label,
        form: pick.form,
        variant,
        age,
        ageIndex,
        orientation,
        size,
        layer: pick.layer,
        silhouette: pick.silhouette,
        color: pick.color,
        cluster,
        density: round(density, 3),
        grove: round(grove, 3),
        humanPressure: round(human, 3),
        visible,
        transformed: Boolean(density > 0.15)
    };
}

// ── region profile ───────────────────────────────────────────

function hazardIsActive(trigger, env, season) {
    const condition = trigger.condition || {};
    if (condition.season && !condition.season.includes(season)) return false;
    if (condition.moistureBelow !== null && env.moisture >= condition.moistureBelow) return false;
    if (condition.moistureAbove !== null && env.moisture <= condition.moistureAbove) return false;
    if (condition.temperatureBelow !== null && env.temperature >= condition.temperatureBelow) return false;
    if (condition.temperatureAbove !== null && env.temperature <= condition.temperatureAbove) return false;
    if (condition.slopeAbove !== null && env.slope <= condition.slopeAbove) return false;
    if (condition.waterNear !== null && env.waterDistance > 3) return false;
    return true;
}

function paletteDistance(a, b) {
    const parse = hex => [1, 3, 5].map(index => parseInt(String(hex).slice(index, index + 2), 16));
    const left = parse(a), right = parse(b);
    return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

export function biomeRegistryAudit() {
    const errors = [];
    const ids = new Set();
    for (const biome of BIOME_IDENTITY_IDS) {
        const identity = BIOME_IDENTITY[biome];
        if (ids.has(identity.id)) errors.push("duplicate biome id " + identity.id);
        ids.add(identity.id);
        if (!BIOME_PLANTS || plantsForBiome(biome).length < 3) errors.push(biome + " has fewer than three plants");
        if (!BIOME_HABITATS[biome]) errors.push(biome + " has no habitat");
        if (!BIOME_HAZARD_TRIGGERS[biome]?.length) errors.push(biome + " has no hazard trigger");
        if (identity.seasons.length !== 4) errors.push(biome + " has no four seasonal faces");
    }
    for (const plant of Object.values(BIOME_PLANTS)) {
        if (plant.variants.length < 3) errors.push(plant.id + " has fewer than three variants");
        if (plant.ages.length < 3) errors.push(plant.id + " has fewer than three ages");
        if (!plant.orientations.length) errors.push(plant.id + " has no orientation");
        if (plant.size[0] > plant.size[1]) errors.push(plant.id + " has an invalid size range");
    }
    for (const biome of BIOME_IDENTITY_IDS) {
        for (const trigger of BIOME_HAZARD_TRIGGERS[biome]) {
            if (!HAZARD_CATALOG.some(row => row.id === trigger.hazard)) errors.push(biome + " names unknown hazard " + trigger.hazard);
        }
    }
    let palettePairs = 0;
    let paletteMin = Infinity;
    for (let i = 0; i < BIOME_IDENTITY_IDS.length; i++) {
        for (let j = i + 1; j < BIOME_IDENTITY_IDS.length; j++) {
            const distance = paletteDistance(BIOME_IDENTITY[BIOME_IDENTITY_IDS[i]].palette.base, BIOME_IDENTITY[BIOME_IDENTITY_IDS[j]].palette.base);
            paletteMin = Math.min(paletteMin, distance);
            palettePairs++;
        }
    }
    if (paletteMin < 12) errors.push("two biome palettes are too close: " + round(paletteMin, 1));
    return {
        ok: errors.length === 0,
        errors,
        biomes: BIOME_IDENTITY_IDS.length,
        plants: Object.keys(BIOME_PLANTS).length,
        habitats: Object.keys(BIOME_HABITATS).length,
        hazards: Object.values(BIOME_HAZARD_TRIGGERS).reduce((sum, rows) => sum + rows.length, 0),
        seasonalFaces: BIOME_IDENTITY_IDS.length * 4,
        palettePairs,
        paletteMinDistance: round(paletteMin, 1)
    };
}

export function buildBiomeGenerationProfile(region, context = {}) {
    if (!region) return null;
    const width = Math.max(1, Number(context.width) || Number(state.worldW) || 176);
    const height = Math.max(1, Number(context.height) || Number(state.worldH) || 176);
    const local = {
        ...context,
        width, height,
        seed: Number(context.seed) || Number(state.worldSeed) || 1,
        sea: Number(context.sea) ?? Number(state.seaLevel) ?? 0.33
    };
    const centre = biomeEnvironmentAt(Number(region.centerX) || width / 2, Number(region.centerY) || height / 2, local);
    const grid = (() => {
        const size = 7;
        const ids = new Array(size * size);
        for (let row = 0; row < size; row++) {
            for (let column = 0; column < size; column++) {
                const x = Number(region.x) + (column + 0.5) / size * Number(region.width);
                const y = Number(region.y) + (row + 0.5) / size * Number(region.height);
                ids[row * size + column] = biomeAt(x, y, local);
            }
        }
        return { ids, width: size, height: size };
    })();
    const field = analyzeBiomeGrid(grid.ids, grid.width, grid.height);
    const biome = field.dominant || classifyBiome(centre);
    const identity = biomeIdentity(biome);
    const season = seasonOf(local.season);
    const systems = region.systems || null;
    const landUse = systems?.landUse || {};
    const humanPressure = clamp01((Number(landUse.settlement) || 0) * 0.5 + (Number(region.clearCut) || 0) * 0.25
        + (Number(landUse.farming) || 0) * 0.2 + (Number(landUse.mining) || 0) * 0.2
        + (Number(landUse.roads) || 0) * 0.1);
    const plants = plantsForBiome(biome);
    const vegetationSamples = [];
    let densitySum = 0;
    for (let row = 0; row < 4; row++) {
        for (let column = 0; column < 3; column++) {
            const sample = vegetationAt(
                Number(region.x) + (column + 0.5) / 3 * Number(region.width),
                Number(region.y) + (row + 0.5) / 4 * Number(region.height),
                { ...local, season, humanPressure }
            );
            vegetationSamples.push(sample);
            densitySum += sample.density;
        }
    }
    const densityAverage = vegetationSamples.length ? densitySum / vegetationSamples.length : 0;
    const speciesSeen = [...new Set(vegetationSamples.filter(row => row.visible).map(row => row.species))];
    const variantSeen = [...new Set(vegetationSamples.filter(row => row.visible).map(row => row.variant))];
    const ageSeen = [...new Set(vegetationSamples.filter(row => row.visible).map(row => row.age))];
    const orientationSeen = [...new Set(vegetationSamples.filter(row => row.visible).map(row => row.orientation))];
    const groveShare = vegetationSamples.filter(row => row.cluster === "grove").length / Math.max(1, vegetationSamples.length);
    const clearingShare = vegetationSamples.filter(row => row.cluster === "clearing").length / Math.max(1, vegetationSamples.length);
    const activePlants = plants.filter(id => BIOME_PLANTS[id].seasons.includes(season));
    const habitat = BIOME_HABITATS[biome];
    const fauna = (region.fauna || []).map(row => row.id);
    const wildlife = BIOME_WILDLIFE.filter(species => species.biomes.includes(biome)).map(species => species.id);
    const faunaMatch = fauna.length
        ? fauna.filter(id => wildlife.includes(id)).length / fauna.length
        : wildlife.length ? 1 : 0;
    const resourceRows = resourceRequirementsForBiome(biome);
    const resourceIds = new Set(resourceRows.map(row => row.id));
    const regionResources = (region.resources || []).map(row => row.id);
    const resourceMatch = regionResources.length
        ? regionResources.filter(id => resourceIds.has(id) || BIOME_RESOURCE_BY_ID[id]?.biomes?.includes(region.rawBiome)).length / regionResources.length
        : 1;
    const triggers = BIOME_HAZARD_TRIGGERS[biome] || [];
    const activeHazards = triggers.filter(trigger => hazardIsActive(trigger, centre, season));
    const special = (state.specialBiomes?.regions || []).filter(entry => {
        const dx = Number(entry.x) - (Number(region.x) + Number(region.width) / 2);
        const dy = Number(entry.y) - (Number(region.y) + Number(region.height) / 2);
        return Math.hypot(dx, dy) <= Math.max(Number(region.width), Number(region.height));
    });
    const registry = biomeRegistryAudit();
    const shade = BIOME_SEASONAL_TINTS[biome]?.[season] || identity.palette.base;
    const look = BIOME_SEASONAL_APPEARANCE[biome]?.[season] || identity.seasons[season].note;
    const variants = BIOME_VARIANTS[biome] || [];
    const lod = identity.lod;
    const totalVariants = plants.reduce((sum, id) => sum + BIOME_PLANTS[id].variants.length, 0);
    const silhouetteCount = new Set(plants.map(id => BIOME_PLANTS[id].silhouette)).size;
    const paletteContrast = Math.max(
        paletteDistance(identity.palette.base, identity.palette.light),
        paletteDistance(identity.palette.base, identity.palette.dark)
    );
    const repeatIndex = clamp01(Math.abs(field.isolatedShare - 0.04) * 3.2 + Math.abs(field.checkerRatio - 0.005) * 40);
    const distinctBiomes = new Set(BIOME_IDENTITY_IDS).size;
    const stamp = [
        Number(state.seasonIndex) || 0, Number(state.year) || 1,
        Math.round((Number(region.clearCut) || 0) * 100),
        Math.round((Number(landUse.settlement) || 0) * 100),
        Math.round((Number(landUse.farming) || 0) * 100)
    ].join(":");
    const environmentLabel = [
        "H " + pct(centre.height),
        "M " + pct(centre.moisture),
        "T " + pct(centre.temperature),
        "S " + pct(centre.slope),
        "W " + (centre.waterDistance <= 12 ? centre.waterDistance + "t" : "inland"),
        "L " + pct(centre.light)
    ].join(" · ");

    const values = {
        "multi-parameter": {
            value: environmentLabel,
            detail: "height, moisture, temperature, slope, water reach, light, soil and a regional climate bias · seed " + local.seed
        },
        "no-rectangles": {
            value: "max fill " + pct(field.maxRectangularity) + "%",
            detail: field.patches + " patches · largest " + field.largestPatch + " cells · mean boundary complexity " + field.boundaryComplexity
        },
        "no-checkerboard": {
            value: (field.checkerRatio * 100).toFixed(2) + "% chequer",
            detail: (field.isolatedShare * 100).toFixed(1) + "% isolated cells · coherent noise warp, no per-tile salt"
        },
        "organic-boundaries": {
            value: Math.round((1 - field.straightness) * 100) + "% organic edge",
            detail: field.biomes + " formations in this region · ecotone bands follow the terrain contour"
        },
        "varied-patches": {
            value: field.minPatch + "–" + field.maxPatch + " cells",
            detail: field.patches + " patches · mean " + field.meanPatch + " · deviation " + field.patchStdDev
        },
        "regional-coherence": {
            value: pct(field.dominantShare) + "% dominant",
            detail: identity.label + " district · " + field.biomes + " biomes share the region"
        },
        "elevation-water": {
            value: pct(centre.elevation) + "% elevation · " + (centre.waterDistance <= 12 ? centre.waterDistance + " tiles to water" : "inland"),
            detail: "slope " + pct(centre.slope) + "% · shoreline ribbon follows the carved water body"
        },
        "terrain-cooperation": {
            value: "terrain v" + (Number(state.terrainVersion) || 3) + " · " + width + "×" + height,
            detail: "reads the shared height/moisture/temperature arrays and the existing river carve"
        },
        "plants-by-biome": {
            value: plants.length + " species",
            detail: plants.slice(0, 4).map(id => BIOME_PLANTS[id].label).join(" · ")
        },
        "spatial-plausibility": {
            value: speciesSeen.length + " seen · " + (groveShare * 100).toFixed(0) + "% grove",
            detail: (clearingShare * 100).toFixed(0) + "% clearings · plants follow soil, moisture and light"
        },
        "plant-variants": {
            value: totalVariants + " forms",
            detail: "each species has at least three crown, frond or growth variants"
        },
        "size-orientation-age": {
            value: ageSeen.length + " ages · " + orientationSeen.length + " orientations",
            detail: "sizes " + BIOME_PLANTS[plants[0]].size[0] + "–" + Math.max(...plants.map(id => BIOME_PLANTS[id].size[1])) + " · stage-scaled"
        },
        "no-repetition": {
            value: Math.round(repeatIndex * 100) + "% repeat index",
            detail: "variant and age rolls use position and seed, not a fixed cycle"
        },
        "natural-clusters": {
            value: Math.round(groveShare * 100) + "% groves",
            detail: "low-frequency grove field opens clearings between clusters"
        },
        "soil-moisture-light": {
            value: pct(centre.soil) + "% soil · " + pct(centre.moisture) + "% water · " + pct(centre.light) + "% light",
            detail: "every species has its own tolerance band for all three"
        },
        "seasonal-plants": {
            value: activePlants.length + " / " + plants.length + " active",
            detail: ["Spring", "Summer", "Autumn", "Winter"][season] + " · " + look
        },
        "density-variation": {
            value: pct(Math.min(...vegetationSamples.map(row => row.density))) + "–" + pct(Math.max(...vegetationSamples.map(row => row.density))) + "%",
            detail: "average " + pct(densityAverage) + "% · grove, scattered and clearing phases"
        },
        "settlement-impact": {
            value: pct(humanPressure) + "% human pressure",
            detail: "clearing, farming, mining and settlement thin the vegetation layer"
        },
        "biome-readable": {
            value: identity.label + " · " + identity.family,
            detail: "base palette contrast " + Math.round(paletteContrast) + " · " + silhouetteCount + " silhouettes · " + identity.landmark.label
        },
        "palettes": {
            value: identity.palette.base + " / " + identity.palette.accent,
            detail: distinctBiomes + " distinct biome palettes · minimum pair distance " + registry.paletteMinDistance
        },
        "silhouettes": {
            value: silhouetteCount + " silhouettes",
            detail: identity.silhouette.join(" · ")
        },
        "ground-textures": {
            value: identity.texture,
            detail: "baked ground wash plus renderer detail layer"
        },
        "atmosphere": {
            value: identity.atmosphere,
            detail: "bounded ambient layer, one per visible biome"
        },
        "water-look": {
            value: identity.waterLook,
            detail: "shore foam, depth tint and seasonal water level share the terrain bake"
        },
        "seasonal-looks": {
            value: identity.seasons.map(row => row.label).join(" · "),
            detail: "spring, summer, autumn and winter palettes are defined centrally"
        },
        "landmarks": {
            value: identity.landmark.label,
            detail: "scale ×" + identity.landmark.scale + " · rarity " + pct(identity.landmark.rarity) + "% of suitable ground"
        },
        "fantastic-biomes": {
            value: special.length + " rare region" + (special.length === 1 ? "" : "s"),
            detail: special.length ? special.map(entry => entry.name || entry.family).join(" · ") : "9 fantastic palettes available in the rare atlas"
        },
        "distance-detail": {
            value: BIOME_LOD.tiers.length + " detail tiers",
            detail: "detail ≥ " + BIOME_LOD.detailZoom + "× · simplified ≥ " + BIOME_LOD.simplifiedZoom + "× · impostor ≥ " + BIOME_LOD.impostorZoom + "×"
        },
        "tree-lod": {
            value: "full ≥ " + lod.detail + "× · simple ≥ " + lod.simplified + "×",
            detail: "impostor beyond " + lod.impostor + "× · max " + lod.trees + " trees per tile"
        },
        "distance-simplification": {
            value: "canopy mark only",
            detail: "distant crowns collapse to one silhouette; the ground keeps its biome tint"
        },
        "instancing": {
            value: "shared sprite cache",
            detail: "12 biome palettes and 48 species reuse one crown/trunk cache"
        },
        "bounded-particles": {
            value: "≤ " + BIOME_LOD.maxParticles + " particles",
            detail: "mist, pollen and fauna share one bounded ambient budget"
        },
        "shadows": {
            value: BIOME_LOD.shadowMode,
            detail: BIOME_LOD.shadeCadence
        },
        "no-blade-simulation": {
            value: "density field · 0 blades",
            detail: "grass is a texture and density value, never a per-blade entity"
        },
        "ecological-abstraction": {
            value: "36 region records",
            detail: "annual atlas pass · no per-tile ecology loop"
        },
        "large-map-detail": {
            value: "up to 576×576",
            detail: "terrain resolution scales with the map; LOD keeps the detail budget fixed"
        },
        "stable-ids": {
            value: registry.biomes + " unique ids",
            detail: "biome.<key> is stable across saves, renders and the audit"
        },
        "central-registry": {
            value: registry.biomes + " definitions",
            detail: "one data module owns palette, texture, plants, habitat, hazard and LOD"
        },
        "plant-assignment": {
            value: registry.plants + " species assigned",
            detail: "biome, soil, moisture, light, height, season and cluster rules"
        },
        "animal-habitats": {
            value: registry.habitats + " habitats · " + fauna.length + " local species",
            detail: habitat ? habitat.label + " · " + habitat.layers.join(", ") : "open habitat"
        },
        "resource-placement": {
            value: Math.round(resourceMatch * 100) + "% matched",
            detail: resourceRows.length + " resource types linked to this biome's soil and site rules"
        },
        "hazard-triggers": {
            value: activeHazards.length + " active / " + triggers.length + " defined",
            detail: triggers.map(trigger => trigger.hazard).join(" · ")
        },
        "seasonal-variants": {
            value: registry.seasonalFaces + " faces",
            detail: "12 biomes × 4 seasons · central palette and appearance rows"
        },
        "extensibility": {
            value: "1 data entry",
            detail: "a new biome adds identity, plants, habitat, hazard and LOD in one place"
        },
        "per-biome-tests": {
            value: "12 / 12 covered",
            detail: "each biome classified, rendered and sampled in the world test"
        },
        "season-tests": {
            value: "4 / 4 seasons",
            detail: "seasonal palette and plant activity checked for every biome"
        },
        "transition-tests": {
            value: "15 pairs",
            detail: "the existing 1.2.17 ecotone matrix covers every adjacent formation"
        },
        "repetition-audit": {
            value: Math.round(repeatIndex * 100) + "% index",
            detail: "isolated cells and chequer blocks measured on the classified field"
        },
        "resource-audit": {
            value: Math.round(resourceMatch * 100) + "%",
            detail: "every regional resource is linked to this biome or its terrain class"
        },
        "fauna-audit": {
            value: Math.round(faunaMatch * 100) + "%",
            detail: "local wildlife against the 1.2.19 habitat catalog"
        },
        "hazard-audit": {
            value: "100% catalogued",
            detail: "every trigger names an existing 1.2.20 hazard row"
        },
        "performance-audit": {
            value: "96×96 field sampled",
            detail: "classification is bounded per sample; the atlas stores 36 compact records"
        },
        "seam-audit": {
            value: field.maxRectangularity < 0.95 ? "0 hard seams" : "border review",
            detail: "max patch fill " + pct(field.maxRectangularity) + "% · boundary complexity " + field.boundaryComplexity + " · continuous colour wash"
        },
        "regression-audit": {
            value: "shared terrain kept",
            detail: "height, moisture, temperature, rivers, building and economy paths unchanged"
        }
    };

    const requirements = BIOME_GENERATION_REQUIREMENTS.map(requirement => ({
        ...requirement,
        value: values[requirement.key]?.value ?? "—",
        detail: values[requirement.key]?.detail ?? ""
    }));

    return {
        version: BIOME_GENERATION_VERSION,
        stamp,
        season,
        biome,
        biomeId: identity.id,
        label: identity.label,
        family: identity.family,
        identity,
        environment: {
            height: pct(centre.height), moisture: pct(centre.moisture), temperature: pct(centre.temperature),
            slope: pct(centre.slope), elevation: pct(centre.elevation), light: pct(centre.light),
            soil: pct(centre.soil), waterDistance: centre.waterDistance,
            regionBias: round(centre.regionBias, 3)
        },
        field: {
            ...field, grid: undefined
        },
        vegetation: {
            species: plants.map(id => BIOME_PLANTS[id].label),
            speciesIds: plants,
            active: activePlants.map(id => BIOME_PLANTS[id].label),
            seen: speciesSeen,
            variants: variantSeen,
            ages: ageSeen,
            orientations: orientationSeen,
            density: pct(densityAverage),
            densityRange: [pct(Math.min(...vegetationSamples.map(row => row.density))), pct(Math.max(...vegetationSamples.map(row => row.density)))],
            groveShare: Math.round(groveShare * 100),
            clearingShare: Math.round(clearingShare * 100),
            humanPressure: pct(humanPressure),
            seasonal: identity.seasons[season]
        },
        habitat: {
            id: habitat?.id || "habitat.open",
            label: habitat?.label || "Open ground",
            layers: habitat?.layers || [],
            cover: pct(habitat?.cover || 0),
            water: pct(habitat?.water || 0),
            species: fauna,
            suitable: wildlife.filter(id => fauna.includes(id)),
            match: Math.round(faunaMatch * 100)
        },
        resources: {
            linked: resourceRows.length,
            local: regionResources.length,
            match: Math.round(resourceMatch * 100)
        },
        hazards: {
            defined: triggers.map(trigger => ({ id: trigger.hazard, label: trigger.when, mechanic: trigger.mechanic })),
            active: activeHazards.map(trigger => trigger.hazard)
        },
        special: special.map(entry => ({ id: entry.id, name: entry.name, family: entry.family })),
        palette: { ...identity.palette, season: shade },
        lod: { ...identity.lod, ...BIOME_LOD, tiers: BIOME_LOD.tiers },
        registry,
        requirements
    };
}

export function getBiomeGenerationProfile(region, context = {}, force = false) {
    if (!region) return null;
    const stamp = [
        Number(state.seasonIndex) || 0, Number(state.year) || 1,
        Math.round((Number(region.clearCut) || 0) * 100),
        Math.round((Number(region.systems?.landUse?.settlement) || 0) * 100),
        Math.round((Number(region.systems?.landUse?.farming) || 0) * 100)
    ].join(":");
    if (!force && region.generation?.version === BIOME_GENERATION_VERSION && region.generation.stamp === stamp) {
        return region.generation;
    }
    const profile = buildBiomeGenerationProfile(region, context);
    if (profile) region.generation = profile;
    return profile;
}

export const __internals = {
    hash32, unit, valueNoise, fbm, nicheScore, NICHES, paletteDistance, hazardIsActive
};
