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
        // Spring: young, slightly brighter growth.
        p.meadow = toward(p.meadow, [118, 158, 84], 0.16);
        p.lush = toward(p.lush, [72, 126, 64], 0.12);
        p.forest = toward(p.forest, [46, 92, 50], 0.10);
        p.dry = toward(p.dry, [158, 152, 92], 0.08);
    } else if (season === 1) {
        // Summer: warmer grass, deeper canopy, drier edges.
        p.meadow = toward(p.meadow, [132, 148, 72], 0.18);
        p.lush = toward(p.lush, [74, 112, 58], 0.12);
        p.forest = toward(p.forest, [38, 76, 40], 0.12);
        p.dry = toward(p.dry, [174, 154, 92], 0.14);
    } else if (season === 2) {
        // Autumn: ochre grass, copper canopy, muted wetland.
        p.meadow = toward(p.meadow, [158, 134, 72], 0.38);
        p.lush = toward(p.lush, [126, 112, 58], 0.30);
        p.forest = toward(p.forest, [128, 82, 44], 0.46);
        p.dry = toward(p.dry, [184, 150, 82], 0.24);
        p.swamp = toward(p.swamp, [104, 84, 50], 0.30);
    } else {
        // Winter: bleached grass, bare canopy, pale snow.
        p.meadow = toward(p.meadow, [178, 186, 172], 0.52);
        p.lush = toward(p.lush, [148, 162, 154], 0.48);
        p.forest = toward(p.forest, [86, 104, 96], 0.44);
        p.dry = toward(p.dry, [164, 160, 144], 0.42);
        p.sand = toward(p.sand, [204, 200, 186], 0.24);
        p.snow = toward(p.snow, [238, 244, 247], 0.38);
        p.swamp = toward(p.swamp, [104, 116, 108], 0.40);
        p.waterDeep = toward(p.waterDeep, [20, 44, 62], 0.18);
        p.waterShallow = toward(p.waterShallow, [52, 106, 118], 0.18);
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
        snowBias: season === 3 ? 0.18 : 0,
        autumn: season === 2 ? 1 : 0,
        winter: season === 3 ? 1 : 0,
    };
}

function unitColor(color) {
    return [color[0] / 255, color[1] / 255, color[2] / 255];
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
