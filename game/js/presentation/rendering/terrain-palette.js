// Seasonal terrain colours shared by the WebGL surface and the 2D fallback.
// The climate palettes stay authoritative; seasons only shift their mood.

import { TERRAIN_PALETTES } from '../../world/terrain-model.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function mix(a, b, amount) {
    const t = clamp(amount, 0, 1);
    return [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
    ];
}

function toward(color, target, amount) {
    return mix(color, target, amount);
}

function clonePalette(palette) {
    const result = {};
    for (const [key, value] of Object.entries(palette)) {
        result[key] = Array.isArray(value) ? [...value] : value;
    }
    return result;
}

function seasonalPalette(base, season) {
    const p = clonePalette(base);

    if (season === 0) {
        // Spring: fresh young growth, cool green and a light blossom cast.
        p.meadow = toward(p.meadow, [124, 172, 94], 0.24);
        p.lush = toward(p.lush, [66, 128, 60], 0.18);
        p.forest = toward(p.forest, [42, 94, 50], 0.16);
        p.dry = toward(p.dry, [156, 156, 88], 0.06);
        p.sand = toward(p.sand, [206, 194, 148], 0.10);
    } else if (season === 1) {
        // Summer: warm golden grass, deep canopy, parched edges.
        p.meadow = toward(p.meadow, [152, 148, 64], 0.32);
        p.lush = toward(p.lush, [76, 108, 50], 0.20);
        p.forest = toward(p.forest, [32, 70, 34], 0.20);
        p.dry = toward(p.dry, [184, 158, 86], 0.24);
        p.sand = toward(p.sand, [216, 198, 146], 0.14);
        p.waterShallow = toward(p.waterShallow, [62, 126, 122], 0.14);
    } else if (season === 2) {
        // Autumn: ochre grass, copper canopy, muted wetland.
        p.meadow = toward(p.meadow, [172, 132, 60], 0.50);
        p.lush = toward(p.lush, [132, 110, 54], 0.38);
        p.forest = toward(p.forest, [138, 76, 34], 0.58);
        p.dry = toward(p.dry, [190, 146, 70], 0.34);
        p.swamp = toward(p.swamp, [108, 82, 44], 0.40);
        p.rock = toward(p.rock, [132, 116, 94], 0.12);
        p.waterDeep = toward(p.waterDeep, [30, 46, 50], 0.14);
    } else {
        // Winter: bleached grass, bare canopy, pale snow.
        p.meadow = toward(p.meadow, [190, 198, 188], 0.64);
        p.lush = toward(p.lush, [156, 170, 160], 0.58);
        p.forest = toward(p.forest, [96, 112, 102], 0.54);
        p.dry = toward(p.dry, [168, 166, 150], 0.50);
        p.sand = toward(p.sand, [208, 204, 192], 0.32);
        p.snow = toward(p.snow, [242, 248, 252], 0.46);
        p.rock = toward(p.rock, [148, 154, 158], 0.18);
        p.swamp = toward(p.swamp, [108, 122, 116], 0.46);
        p.waterDeep = toward(p.waterDeep, [18, 42, 60], 0.24);
        p.waterShallow = toward(p.waterShallow, [56, 112, 126], 0.24);
    }

    p.earth = mix(p.dry, p.rock, 0.52);
    return p;
}

export function terrainPaletteFor(climate, seasonIndex = 0) {
    const season = ((Math.trunc(Number(seasonIndex) || 0) % 4) + 4) % 4;
    const base = TERRAIN_PALETTES[climate] || TERRAIN_PALETTES.temperate;
    const palette = seasonalPalette(base, season);
    return {
        ...palette,
        season,
        snowBias: season === 3 ? 0.28 : 0,
        autumn: season === 2 ? 1 : 0,
        winter: season === 3 ? 1 : 0,
    };
}

function unitColor(color) {
    return [color[0] / 255, color[1] / 255, color[2] / 255];
}

// Continuous season phase: 0 is the first day of spring, 1 the first day of
// summer, 2 autumn, 3 winter and 4 spring again. The surface blends across the
// boundary instead of snapping when dayOfYear crosses 100.
export function terrainSeasonPhase(dayOfYear, seasonIndex = 0) {
    const day = Number(dayOfYear);
    if (Number.isFinite(day)) {
        const wrapped = ((day % 400) + 400) % 400;
        return wrapped / 100;
    }
    const season = ((Math.trunc(Number(seasonIndex) || 0) % 4) + 4) % 4;
    return season;
}

// Triangular basis over the four seasons. At a season boundary the two
// neighbours share the weight; mid-season one weight is exactly one.
export function seasonWeights(phase) {
    const wrapped = ((Number(phase) % 4) + 4) % 4;
    const weights = [0, 0, 0, 0];
    for (let index = 0; index < 4; index++) {
        let distance = Math.abs(wrapped - index);
        distance = Math.min(distance, 4 - distance);
        weights[index] = Math.max(0, 1 - distance);
    }
    const total = weights.reduce((sum, value) => sum + value, 0) || 1;
    return weights.map(value => value / total);
}

function mixPalette(from, to, amount) {
    const result = {};
    for (const key of Object.keys(from)) {
        if (Array.isArray(from[key]) && Array.isArray(to[key]) && from[key].length === to[key].length) {
            result[key] = mix(from[key], to[key], amount);
        } else if (typeof from[key] === "number" && typeof to[key] === "number") {
            result[key] = from[key] + (to[key] - from[key]) * amount;
        } else {
            result[key] = from[key];
        }
    }
    return result;
}

// Palette for a fractional season phase. Colours interpolate between the two
// neighbouring seasons and the effect flags become weights, so shader passes
// such as leaf litter or frost fade in over the last days of a season.
export function terrainPaletteForPhase(climate, phase) {
    const wrapped = ((Number(phase) % 4) + 4) % 4;
    const lower = Math.floor(wrapped) % 4;
    const fraction = wrapped - Math.floor(wrapped);
    const base = TERRAIN_PALETTES[climate] || TERRAIN_PALETTES.temperate;
    const from = seasonalPalette(base, lower);
    const to = seasonalPalette(base, (lower + 1) % 4);
    const palette = fraction < 1e-4 ? from : mixPalette(from, to, fraction);
    const weights = seasonWeights(wrapped);
    return {
        ...palette,
        season: lower,
        seasonPhase: wrapped,
        snowBias: 0.28 * weights[3],
        spring: weights[0],
        summer: weights[1],
        autumn: weights[2],
        winter: weights[3],
    };
}

const SHADER_COLOR_KEYS = Object.freeze({
    grass: "meadow", lush: "lush", dry: "dry", earth: "earth", forest: "forest",
    rock: "rock", sand: "sand", snow: "snow", swamp: "swamp",
    waterDeep: "waterDeep", waterShallow: "waterShallow", foam: "foam",
});

export function terrainShaderPaletteForPhase(climate, phase) {
    const p = terrainPaletteForPhase(climate, phase);
    const result = {};
    for (const [uniform, key] of Object.entries(SHADER_COLOR_KEYS)) {
        result[uniform] = unitColor(p[key]);
    }
    result.snowBias = p.snowBias;
    result.spring = p.spring;
    result.summer = p.summer;
    result.autumn = p.autumn;
    result.winter = p.winter;
    return result;
}

export function terrainShaderPalette(climate, seasonIndex = 0) {
    const p = terrainPaletteFor(climate, seasonIndex);
    return {
        grass: unitColor(p.meadow),
        lush: unitColor(p.lush),
        dry: unitColor(p.dry),
        earth: unitColor(p.earth),
        forest: unitColor(p.forest),
        rock: unitColor(p.rock),
        sand: unitColor(p.sand),
        snow: unitColor(p.snow),
        swamp: unitColor(p.swamp),
        waterDeep: unitColor(p.waterDeep),
        waterShallow: unitColor(p.waterShallow),
        foam: unitColor(p.foam),
        snowBias: p.snowBias,
        autumn: p.autumn,
        winter: p.winter,
    };
}
