// 1.2.22 — player-facing biome identity layer.
//
// The terrain bake owns the broad colour field and the existing eco renderers
// own each climate's ground detail. This layer adds the two things a colour
// alone cannot prove: one recognisable landmark per discovered atlas region,
// and a small, bounded habitat vignette around it. Everything is a pure reader
// over the generated biome map and the existing atlas, so it never mutates the
// simulation or writes save data.
import { state } from "../../core/state.js";
import { CELL } from "../../core/config.js";
import { seasonIndexAt } from "../../world/season.js";
import {
    BIOME_ATMOSPHERE, BIOME_IDENTITY, BIOME_PLANTS, plantsForBiome
} from "../../world/biome-generation-data.js";
import { BIOME_MAP_ORDER } from "../../world/biome-generation.js";

const TAU = Math.PI * 2;
const MAX_ANCHORS = 36;
const MAX_MOTES = 140;
// Keep the landmark out of the region's central settlement. A ring at roughly
// a third of the region's half-size reads as a place in the district rather
// than a decoration hidden under the town hall.
const OFFSETS = [
    [0.32, 0.18], [-0.3, 0.22], [0.28, -0.25], [-0.34, -0.2],
    [0.06, 0.36], [0.38, 0.02], [-0.38, -0.02], [0.1, -0.38], [-0.1, 0.34]
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const unit = (seed, salt = 0) => {
    let value = (Number(seed) >>> 0) ^ Math.imul((Number(salt) | 0) + 1, 0x9e3779b1);
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
};
const hashText = text => {
    let value = 2166136261;
    for (let index = 0; index < String(text).length; index++) {
        value ^= String(text).charCodeAt(index);
        value = Math.imul(value, 16777619);
    }
    return value >>> 0;
};
const hexRgb = hex => [
    parseInt(String(hex).slice(1, 3), 16),
    parseInt(String(hex).slice(3, 5), 16),
    parseInt(String(hex).slice(5, 7), 16)
];
const rgba = (hex, alpha) => {
    const [red, green, blue] = hexRgb(hex);
    return "rgba(" + red + "," + green + "," + blue + "," + alpha + ")";
};

function seasonOfState() {
    const explicit = Number(state.seasonIndex);
    if (Number.isInteger(explicit) && explicit >= 0 && explicit <= 3) return explicit;
    return seasonIndexAt(Number(state.dayOfYear) || 1);
}

function exploredAt(explored, x, y) {
    if (!explored?.length) return true;
    return Boolean(explored[Math.floor(x)]?.[Math.floor(y)]);
}

function biomeKeyAt(map, x, y, fallback = "meadow") {
    if (!map?.ids?.length || !map.width || !map.height) return fallback;
    const stride = Math.max(1, Number(map.stride) || 4);
    const column = clamp(Math.floor(x / stride), 0, map.width - 1);
    const row = clamp(Math.floor(y / stride), 0, map.height - 1);
    return BIOME_MAP_ORDER[map.ids[row * map.width + column]] || fallback;
}

// Pure and testable: no canvas, no state. Regions are the compact 1.2.19 rows;
// explored keeps a landmark inside the player's actual knowledge. Each region
// tries a deterministic ring of offsets and prefers land, so an atlas centre
// that happens to be a lake does not turn every forest into a drowned tower.
export function biomeLandmarkAnchors({ regions = [], map = null, explored = null, limit = MAX_ANCHORS } = {}) {
    const anchors = [];
    for (const region of regions) {
        if (!region?.discovered) continue;
        const seed = hashText(region.id || region.name || "region");
        const start = seed % OFFSETS.length;
        let chosen = null;
        for (let attempt = 0; attempt < OFFSETS.length; attempt++) {
            const [ox, oy] = OFFSETS[(start + attempt) % OFFSETS.length];
            const x = Number(region.centerX) + ox * Number(region.width || 0);
            const y = Number(region.centerY) + oy * Number(region.height || 0);
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            if (x < 0 || y < 0 || x >= (Number(state.worldW) || 176) || y >= (Number(state.worldH) || 176)) continue;
            if (!exploredAt(explored, x, y)) continue;
            const biome = biomeKeyAt(map, x, y, region.rawBiome || "meadow");
            const isWater = biome === "water";
            const coastalRegion = ["water", "beach", "swamp"].includes(region.rawBiome);
            if (isWater && !coastalRegion && attempt < OFFSETS.length - 1) continue;
            chosen = {
                regionId: region.id,
                name: region.name,
                biome,
                identity: BIOME_IDENTITY[biome] || BIOME_IDENTITY.meadow,
                x, y,
                seed,
                variant: (seed >>> 8) % 1000 / 1000
            };
            break;
        }
        if (chosen) anchors.push(chosen);
        if (anchors.length >= limit) break;
    }
    return anchors;
}

let anchorCache = { key: "", anchors: [] };
function anchorsForState() {
    const atlas = state.biomeAtlas;
    if (!atlas?.regions?.length) return [];
    let key = String(state.worldSeed) + "|" + String(state.exploredRevision) + "|"
        + String(state.biomeIndexMap?.ids?.length || 0) + "|";
    for (const region of atlas.regions) key += region.discovered ? "1" : "0";
    if (key !== anchorCache.key) {
        anchorCache = {
            key,
            anchors: biomeLandmarkAnchors({
                regions: atlas.regions,
                map: state.biomeIndexMap,
                explored: state.explored,
                limit: MAX_ANCHORS
            })
        };
    }
    return anchorCache.anchors;
}

function dominantBiomeAt(map, x, y) {
    const samples = [
        [x, y], [x - 5, y], [x + 5, y], [x, y - 5], [x, y + 5]
    ].map(([sx, sy]) => biomeKeyAt(map, sx, sy, "meadow"));
    const counts = new Map();
    for (const biome of samples) counts.set(biome, (counts.get(biome) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "meadow";
}

// The haze is a soft vignette, not a per-frame gradient. A radial gradient
// fill over the whole viewport is one of the most expensive canvas operations
// on software renderers, and its inputs only change when the canvas, biome or
// season changes. Cache the rendered sprite and make the steady-state cost one
// image draw. The cache deliberately holds only the last view: a player can
// cross many biome edges in one session, but only one atmosphere is on screen
// at a time.
let hazeCache = { key: "", sprite: null };

function hazeSpriteFor(width, height, biome, season) {
    const key = width + "x" + height + "|" + biome + "|" + season;
    if (hazeCache.key === key) return hazeCache.sprite;
    const identity = BIOME_IDENTITY[biome] || BIOME_IDENTITY.meadow;
    const air = identity.palette.atmosphere;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const haze = canvas.getContext("2d");
    if (!haze) return null;
    const radius = Math.max(width, height) * 0.76;
    const gradient = haze.createRadialGradient(
        width * 0.5, height * 0.46, Math.min(width, height) * 0.16,
        width * 0.5, height * 0.5, radius
    );
    const alpha = season === 3 ? 0.075 : 0.055;
    gradient.addColorStop(0, rgba(air, 0));
    gradient.addColorStop(0.72, rgba(air, alpha * 0.34));
    gradient.addColorStop(1, rgba(air, alpha));
    haze.fillStyle = gradient;
    haze.fillRect(0, 0, width, height);
    hazeCache = { key, sprite: canvas };
    return canvas;
}

function drawHaze(ctx, canvas, biome, season, zoom) {
    if (zoom < 0.28) return;
    const sprite = hazeSpriteFor(canvas.width, canvas.height, biome, season);
    if (!sprite) return;
    ctx.drawImage(sprite, 0, 0);
}

function shadow(ctx, x, y, s, alpha = 0.2) {
    ctx.save();
    ctx.fillStyle = "rgba(12,10,8," + alpha + ")";
    ctx.beginPath();
    ctx.ellipse(x, y + s * 0.2, s * 0.76, s * 0.26, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
}

function snowDab(ctx, x, y, s, alpha = 0.66) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#eaf3f5";
    ctx.beginPath();
    ctx.ellipse(x, y, s * 0.3, s * 0.1, -0.18, 0, TAU);
    ctx.fill();
    ctx.restore();
}

function drawDrownedTower(ctx, x, y, s, palette, season) {
    shadow(ctx, x, y + s * 0.25, s, 0.16);
    ctx.save();
    ctx.fillStyle = palette.dark;
    ctx.strokeStyle = palette.light;
    ctx.lineWidth = Math.max(0.7, s * 0.035);
    ctx.beginPath();
    ctx.moveTo(x - s * 0.42, y + s * 0.45);
    ctx.lineTo(x - s * 0.34, y - s * 1.15);
    ctx.lineTo(x - s * 0.02, y - s * 1.36);
    ctx.lineTo(x + s * 0.2, y - s * 1.04);
    ctx.lineTo(x + s * 0.24, y - s * 0.72);
    ctx.lineTo(x + s * 0.4, y - s * 0.5);
    ctx.lineTo(x + s * 0.44, y + s * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 0.78;
    ctx.fillStyle = "#1d2c31";
    ctx.beginPath();
    ctx.moveTo(x - s * 0.18, y - s * 0.55);
    ctx.lineTo(x + s * 0.03, y - s * 0.55);
    ctx.lineTo(x + s * 0.03, y - s * 0.2);
    ctx.lineTo(x - s * 0.18, y - s * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = palette.water;
    ctx.lineWidth = Math.max(1, s * 0.06);
    for (let ring = 0; ring < 3; ring++) {
        ctx.beginPath();
        ctx.ellipse(x, y + s * (0.48 + ring * 0.1), s * (0.52 + ring * 0.14), s * 0.1, 0, 0, TAU);
        ctx.stroke();
    }
    if (season === 3) snowDab(ctx, x - s * 0.05, y - s * 1.24, s);
    ctx.restore();
}

function drawSaltSpit(ctx, x, y, s, palette, season) {
    ctx.save();
    ctx.strokeStyle = palette.base;
    ctx.lineCap = "round";
    ctx.lineWidth = s * 0.52;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(x - s * 1.1, y + s * 0.4);
    ctx.quadraticCurveTo(x - s * 0.2, y - s * 0.2, x + s * 1.05, y + s * 0.22);
    ctx.stroke();
    ctx.strokeStyle = palette.light;
    ctx.lineWidth = Math.max(0.8, s * 0.06);
    ctx.globalAlpha = 0.7;
    for (let line = 0; line < 3; line++) {
        ctx.beginPath();
        ctx.moveTo(x - s * (0.8 - line * 0.18), y + s * 0.22 + line * s * 0.12);
        ctx.quadraticCurveTo(x, y - s * 0.1, x + s * (0.65 + line * 0.12), y + s * 0.2 + line * s * 0.08);
        ctx.stroke();
    }
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = "#6f5b42";
    ctx.lineWidth = Math.max(1, s * 0.055);
    ctx.beginPath();
    ctx.moveTo(x + s * 0.34, y - s * 0.18);
    ctx.lineTo(x + s * 0.54, y - s * 0.48);
    ctx.moveTo(x + s * 0.34, y - s * 0.18);
    ctx.lineTo(x + s * 0.12, y - s * 0.44);
    ctx.stroke();
    if (season === 3) snowDab(ctx, x, y + s * 0.12, s, 0.45);
    ctx.restore();
}

function drawIceCairn(ctx, x, y, s, palette, season) {
    shadow(ctx, x, y + s * 0.26, s, 0.16);
    ctx.save();
    ctx.strokeStyle = palette.light;
    ctx.lineWidth = Math.max(0.7, s * 0.035);
    const blocks = [
        [0, 0.3, 0.58, 0.28], [-0.1, -0.04, 0.48, 0.24], [0.08, -0.34, 0.36, 0.2],
        [-0.04, -0.6, 0.24, 0.16]
    ];
    for (const [ox, oy, width, height] of blocks) {
        ctx.fillStyle = season === 3 ? "#dceff4" : "#bcdde5";
        ctx.beginPath();
        ctx.moveTo(x + ox * s - width * s * 0.5, y + oy * s + height * s * 0.5);
        ctx.lineTo(x + ox * s - width * s * 0.34, y + oy * s - height * s * 0.5);
        ctx.lineTo(x + ox * s + width * s * 0.42, y + oy * s - height * s * 0.32);
        ctx.lineTo(x + ox * s + width * s * 0.5, y + oy * s + height * s * 0.52);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#f4ffff";
    ctx.beginPath();
    ctx.arc(x - s * 0.08, y - s * 0.52, Math.max(1, s * 0.045), 0, TAU);
    ctx.fill();
    ctx.restore();
}

function drawStandingStone(ctx, x, y, s, palette, season) {
    shadow(ctx, x, y + s * 0.2, s, 0.24);
    ctx.save();
    ctx.strokeStyle = palette.light;
    ctx.lineWidth = Math.max(0.7, s * 0.04);
    const stones = [[-0.46, 0.58, 0.28], [0.08, 1.15, 0.36], [0.54, 0.42, 0.2]];
    for (const [ox, height, width] of stones) {
        ctx.fillStyle = palette.dark;
        ctx.beginPath();
        ctx.moveTo(x + ox * s - width * s * 0.5, y + s * 0.28);
        ctx.lineTo(x + ox * s - width * s * 0.38, y - height * s);
        ctx.lineTo(x + ox * s + width * s * 0.24, y - height * s * 1.04);
        ctx.lineTo(x + ox * s + width * s * 0.46, y + s * 0.28);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = Math.max(0.8, s * 0.045);
    ctx.beginPath();
    ctx.moveTo(x + s * 0.02, y - s * 0.8);
    ctx.lineTo(x + s * 0.16, y - s * 0.56);
    ctx.lineTo(x - s * 0.06, y - s * 0.34);
    ctx.stroke();
    if (season === 3) snowDab(ctx, x - s * 0.46, y - s * 0.46, s, 0.7);
    ctx.restore();
}

function drawFrostMound(ctx, x, y, s, palette, season) {
    shadow(ctx, x, y + s * 0.3, s, 0.18);
    ctx.save();
    ctx.fillStyle = season === 3 ? "#c4d9df" : palette.base;
    ctx.strokeStyle = palette.light;
    ctx.lineWidth = Math.max(0.7, s * 0.035);
    ctx.beginPath();
    ctx.ellipse(x, y + s * 0.26, s * 0.95, s * 0.44, 0, Math.PI, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 0.48;
    ctx.fillStyle = "#e6f6f7";
    ctx.beginPath();
    ctx.ellipse(x, y - s * 0.24, s * 0.48, s * 0.2, -0.16, Math.PI, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.52;
    ctx.strokeStyle = palette.accent;
    for (let crack = 0; crack < 3; crack++) {
        ctx.beginPath();
        ctx.moveTo(x + s * (crack - 1) * 0.28, y + s * 0.12);
        ctx.lineTo(x + s * (crack - 1) * 0.36, y + s * 0.3);
        ctx.stroke();
    }
    ctx.restore();
}

function drawGreatSpruce(ctx, x, y, s, palette, season) {
    shadow(ctx, x, y + s * 0.26, s, 0.3);
    ctx.save();
    ctx.strokeStyle = "#4b3c2c";
    ctx.lineWidth = Math.max(1.1, s * 0.11);
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.25);
    ctx.lineTo(x, y - s * 0.45);
    ctx.stroke();
    ctx.fillStyle = palette.dark;
    ctx.strokeStyle = palette.light;
    ctx.lineWidth = Math.max(0.7, s * 0.03);
    const tiers = [[-0.2, 1.05, 0.9], [-0.55, 0.95, 0.75], [-0.9, 0.8, 0.6], [-1.2, 0.62, 0.42]];
    for (const [oy, width, height] of tiers) {
        ctx.beginPath();
        ctx.moveTo(x, y + oy * s - height * s * 0.5);
        ctx.lineTo(x - width * s * 0.56, y + oy * s + height * s * 0.5);
        ctx.lineTo(x + width * s * 0.56, y + oy * s + height * s * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        if (season === 3) snowDab(ctx, x, y + oy * s + height * s * 0.38, s, 0.5);
    }
    ctx.restore();
}

function drawSunkenShrine(ctx, x, y, s, palette, season) {
    shadow(ctx, x, y + s * 0.36, s, 0.18);
    ctx.save();
    ctx.strokeStyle = palette.light;
    ctx.lineWidth = Math.max(0.8, s * 0.045);
    ctx.fillStyle = palette.dark;
    const pillars = [[-0.62, 0.3], [0.5, 0.16]];
    for (const [ox, height] of pillars) {
        ctx.beginPath();
        ctx.moveTo(x + ox * s - s * 0.14, y + s * 0.42);
        ctx.lineTo(x + ox * s - s * 0.1, y - height * s);
        ctx.lineTo(x + ox * s + s * 0.12, y - height * s * 1.06);
        ctx.lineTo(x + ox * s + s * 0.16, y + s * 0.42);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.78, y - s * 0.3);
    ctx.quadraticCurveTo(x, y - s * 0.95, x + s * 0.68, y - s * 0.18);
    ctx.stroke();
    ctx.globalAlpha = 0.26;
    ctx.fillStyle = palette.water;
    ctx.beginPath();
    ctx.ellipse(x, y + s * 0.45, s * 0.95, s * 0.2, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = palette.accent;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.3, y + s * 0.1);
    ctx.lineTo(x + s * 0.26, y - s * 0.1);
    ctx.stroke();
    if (season === 3) snowDab(ctx, x, y - s * 0.38, s, 0.5);
    ctx.restore();
}

function drawWindArch(ctx, x, y, s, palette, season) {
    shadow(ctx, x, y + s * 0.28, s, 0.22);
    ctx.save();
    ctx.strokeStyle = palette.light;
    ctx.fillStyle = palette.base;
    ctx.lineWidth = Math.max(0.8, s * 0.045);
    ctx.beginPath();
    ctx.moveTo(x - s * 0.78, y + s * 0.4);
    ctx.lineTo(x - s * 0.64, y - s * 0.8);
    ctx.quadraticCurveTo(x - s * 0.2, y - s * 1.42, x + s * 0.38, y - s * 0.98);
    ctx.quadraticCurveTo(x + s * 0.78, y - s * 0.6, x + s * 0.82, y + s * 0.4);
    ctx.lineTo(x + s * 0.5, y + s * 0.4);
    ctx.quadraticCurveTo(x + s * 0.46, y - s * 0.3, x + s * 0.08, y - s * 0.56);
    ctx.quadraticCurveTo(x - s * 0.34, y - s * 0.72, x - s * 0.36, y + s * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = palette.dark;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.6, y + s * 0.16);
    ctx.lineTo(x + s * 0.64, y + s * 0.1);
    ctx.moveTo(x - s * 0.56, y - s * 0.18);
    ctx.lineTo(x + s * 0.48, y - s * 0.24);
    ctx.stroke();
    if (season === 3) snowDab(ctx, x - s * 0.06, y - s * 0.86, s, 0.45);
    ctx.restore();
}

function drawKurgan(ctx, x, y, s, palette, season) {
    shadow(ctx, x, y + s * 0.3, s, 0.2);
    ctx.save();
    ctx.fillStyle = palette.base;
    ctx.strokeStyle = palette.light;
    ctx.lineWidth = Math.max(0.7, s * 0.035);
    ctx.beginPath();
    ctx.ellipse(x, y + s * 0.24, s * 0.92, s * 0.5, 0, Math.PI, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = palette.dark;
    for (const [ox, oy] of [[-0.8, 0.3], [0.78, 0.28], [-0.44, 0.46], [0.44, 0.44], [0.02, 0.52]]) {
        ctx.beginPath();
        ctx.arc(x + ox * s, y + oy * s, s * 0.08, 0, TAU);
        ctx.fill();
    }
    ctx.strokeStyle = "#5d4a36";
    ctx.lineWidth = Math.max(1, s * 0.055);
    ctx.beginPath();
    ctx.moveTo(x, y - s * 0.1);
    ctx.lineTo(x, y - s * 0.9);
    ctx.stroke();
    ctx.fillStyle = palette.accent;
    ctx.beginPath();
    ctx.moveTo(x, y - s * 0.9);
    ctx.lineTo(x + s * 0.34, y - s * 0.74);
    ctx.lineTo(x, y - s * 0.56);
    ctx.closePath();
    ctx.fill();
    if (season === 3) snowDab(ctx, x, y - s * 0.06, s, 0.4);
    ctx.restore();
}

function drawGreatOak(ctx, x, y, s, palette, season) {
    shadow(ctx, x, y + s * 0.28, s, 0.28);
    ctx.save();
    ctx.strokeStyle = "#4b382b";
    ctx.lineWidth = Math.max(1.2, s * 0.14);
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.28);
    ctx.lineTo(x - s * 0.04, y - s * 0.44);
    ctx.moveTo(x - s * 0.04, y + s * 0.08);
    ctx.lineTo(x - s * 0.42, y + s * 0.26);
    ctx.moveTo(x - s * 0.02, y + s * 0.04);
    ctx.lineTo(x + s * 0.4, y + s * 0.24);
    ctx.stroke();
    ctx.fillStyle = palette.dark;
    const lobes = [[-0.52, -0.62, 0.48], [0.02, -0.9, 0.62], [0.54, -0.58, 0.46], [0, -0.5, 0.58]];
    for (const [ox, oy, radius] of lobes) {
        ctx.beginPath();
        ctx.arc(x + ox * s, y + oy * s, radius * s, 0, TAU);
        ctx.fill();
    }
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = palette.light;
    for (const [ox, oy, radius] of [[-0.2, -0.92, 0.18], [0.3, -0.7, 0.14], [-0.5, -0.55, 0.12]]) {
        ctx.beginPath();
        ctx.arc(x + ox * s, y + oy * s, radius * s, 0, TAU);
        ctx.fill();
    }
    if (season === 3) snowDab(ctx, x - s * 0.2, y - s * 1.08, s, 0.55);
    ctx.restore();
}

function drawHollowTree(ctx, x, y, s, palette, season) {
    shadow(ctx, x, y + s * 0.28, s, 0.28);
    ctx.save();
    ctx.fillStyle = "#4b382b";
    ctx.strokeStyle = "#2b2119";
    ctx.lineWidth = Math.max(0.8, s * 0.04);
    ctx.beginPath();
    ctx.moveTo(x - s * 0.4, y + s * 0.3);
    ctx.lineTo(x - s * 0.28, y - s * 1.1);
    ctx.lineTo(x - s * 0.02, y - s * 1.24);
    ctx.lineTo(x + s * 0.24, y - s * 1.02);
    ctx.lineTo(x + s * 0.4, y + s * 0.3);
    ctx.lineTo(x + s * 0.12, y + s * 0.3);
    ctx.lineTo(x + s * 0.06, y - s * 0.6);
    ctx.lineTo(x - s * 0.12, y - s * 0.58);
    ctx.lineTo(x - s * 0.14, y + s * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = palette.dark;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(x + s * 0.02, y - s * 0.78, s * 0.18, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = palette.accent;
    for (const [ox, oy, radius] of [[-0.48, 0.22, 0.09], [-0.34, 0.34, 0.06], [0.5, 0.16, 0.07]]) {
        ctx.beginPath();
        ctx.arc(x + ox * s, y + oy * s, radius * s, 0, TAU);
        ctx.fill();
    }
    ctx.restore();
}

function drawGiantFig(ctx, x, y, s, palette, season) {
    shadow(ctx, x, y + s * 0.3, s, 0.3);
    ctx.save();
    ctx.fillStyle = "#4b382b";
    ctx.strokeStyle = palette.dark;
    ctx.lineWidth = Math.max(0.8, s * 0.035);
    ctx.beginPath();
    ctx.moveTo(x - s * 0.16, y + s * 0.3);
    ctx.lineTo(x - s * 0.12, y - s * 0.7);
    ctx.lineTo(x + s * 0.12, y - s * 0.7);
    ctx.lineTo(x + s * 0.18, y + s * 0.3);
    ctx.closePath();
    ctx.fill();
    for (const [ox, direction] of [[-0.14, -1], [0.1, 1], [-0.28, -0.6], [0.28, 0.6]]) {
        ctx.beginPath();
        ctx.moveTo(x + ox * s, y - s * 0.1);
        ctx.lineTo(x + ox * s + direction * s * 0.42, y + s * 0.3);
        ctx.lineTo(x + ox * s + direction * s * 0.2, y + s * 0.3);
        ctx.closePath();
        ctx.fill();
    }
    ctx.fillStyle = palette.dark;
    for (const [ox, oy, radius] of [[-0.44, -0.9, 0.38], [0.44, -0.95, 0.4], [0, -1.16, 0.48]]) {
        ctx.beginPath();
        ctx.arc(x + ox * s, y + oy * s, radius * s, 0, TAU);
        ctx.fill();
    }
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = Math.max(0.7, s * 0.03);
    for (let vine = 0; vine < 4; vine++) {
        ctx.beginPath();
        ctx.moveTo(x + (vine - 1.5) * s * 0.26, y - s * 0.82);
        ctx.quadraticCurveTo(x + (vine - 1.5) * s * 0.36, y - s * 0.3, x + (vine - 1.5) * s * 0.2, y + s * 0.08);
        ctx.stroke();
    }
    ctx.restore();
}

function drawLandmark(ctx, anchor, x, y, s, season, detail) {
    if (detail <= 0) {
        ctx.save();
        ctx.globalAlpha = 0.86;
        ctx.fillStyle = anchor.identity.palette.accent;
        ctx.strokeStyle = anchor.identity.palette.dark;
        ctx.lineWidth = Math.max(0.8, s * 0.08);
        ctx.beginPath();
        ctx.moveTo(x, y - s * 0.55);
        ctx.lineTo(x + s * 0.42, y);
        ctx.lineTo(x, y + s * 0.45);
        ctx.lineTo(x - s * 0.42, y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        return;
    }
    switch (anchor.identity.landmark.id) {
        case "drowned-tower": return drawDrownedTower(ctx, x, y, s, anchor.identity.palette, season);
        case "salt-spit": return drawSaltSpit(ctx, x, y, s, anchor.identity.palette, season);
        case "ice-cairn": return drawIceCairn(ctx, x, y, s, anchor.identity.palette, season);
        case "standing-stone": return drawStandingStone(ctx, x, y, s, anchor.identity.palette, season);
        case "frost-mound": return drawFrostMound(ctx, x, y, s, anchor.identity.palette, season);
        case "great-spruce": return drawGreatSpruce(ctx, x, y, s, anchor.identity.palette, season);
        case "sunken-shrine": return drawSunkenShrine(ctx, x, y, s, anchor.identity.palette, season);
        case "wind-arch": return drawWindArch(ctx, x, y, s, anchor.identity.palette, season);
        case "kurgan": return drawKurgan(ctx, x, y, s, anchor.identity.palette, season);
        case "great-oak": return drawGreatOak(ctx, x, y, s, anchor.identity.palette, season);
        case "hollow-tree": return drawHollowTree(ctx, x, y, s, anchor.identity.palette, season);
        case "giant-fig": return drawGiantFig(ctx, x, y, s, anchor.identity.palette, season);
        default: {
            ctx.save();
            ctx.fillStyle = anchor.identity.palette.dark;
            ctx.strokeStyle = anchor.identity.palette.light;
            ctx.lineWidth = Math.max(0.7, s * 0.04);
            ctx.beginPath();
            ctx.moveTo(x - s * 0.4, y + s * 0.3);
            ctx.lineTo(x - s * 0.24, y - s * 0.7);
            ctx.lineTo(x + s * 0.24, y - s * 0.7);
            ctx.lineTo(x + s * 0.4, y + s * 0.3);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }
    }
}

function seasonalPlantColor(hex, season) {
    const [red, green, blue] = hexRgb(hex);
    const target = season === 2 ? [166, 126, 62] : season === 3 ? [196, 202, 190] : season === 0 ? [210, 226, 174] : null;
    const amount = season === 2 ? 0.34 : season === 3 ? 0.3 : season === 0 ? 0.12 : 0;
    if (!target) return hex;
    return "rgb(" + Math.round(red * (1 - amount) + target[0] * amount) + ","
        + Math.round(green * (1 - amount) + target[1] * amount) + ","
        + Math.round(blue * (1 - amount) + target[2] * amount) + ")";
}

function drawPlantGlyph(ctx, x, y, s, plant, seed, season) {
    const color = seasonalPlantColor(plant.color || "#5f7a45", season);
    const lean = (unit(seed, 3) - 0.5) * 0.34;
    const age = plant.ages?.[Math.floor(unit(seed, 5) * plant.ages.length)] || "mature";
    const ageScale = age === "sapling" || age === "bud" || age === "crust" ? 0.62
        : age === "young" || age === "patch" ? 0.82
            : age === "ancient" || age === "old mat" || age === "deep mat" ? 1.16 : 1;
    const size = (plant.size?.[0] || 0.2) + ((plant.size?.[1] || 0.4) - (plant.size?.[0] || 0.2)) * unit(seed, 7);
    const height = s * (0.42 + size * 0.34) * ageScale;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lean);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(0.7, height * 0.065);
    if (plant.form === "tree" || plant.form === "palm") {
        ctx.strokeStyle = "#4b392b";
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -height * 0.7);
        ctx.stroke();
        ctx.strokeStyle = color;
        if (plant.form === "palm") {
            for (let frond = 0; frond < 5; frond++) {
                const angle = -1.9 + frond * 0.48;
                ctx.beginPath();
                ctx.moveTo(0, -height * 0.7);
                ctx.quadraticCurveTo(Math.cos(angle) * height * 0.38, -height * 0.82 + Math.sin(angle) * height * 0.16,
                    Math.cos(angle) * height * 0.58, -height * 0.62 + Math.sin(angle) * height * 0.3);
                ctx.stroke();
            }
        } else {
            ctx.globalAlpha = 0.94;
            ctx.beginPath();
            ctx.arc(-height * 0.16, -height * 0.82, height * 0.34, 0, TAU);
            ctx.arc(height * 0.18, -height * 0.8, height * 0.3, 0, TAU);
            ctx.arc(0, -height * 1.02, height * 0.38, 0, TAU);
            ctx.fill();
        }
    } else if (plant.form === "conifer") {
        ctx.fillStyle = color;
        for (let tier = 0; tier < 3; tier++) {
            const width = height * (0.36 - tier * 0.08);
            const top = -height * (0.45 + tier * 0.24);
            ctx.beginPath();
            ctx.moveTo(0, top - height * 0.26);
            ctx.lineTo(-width, top + height * 0.22);
            ctx.lineTo(width, top + height * 0.22);
            ctx.closePath();
            ctx.fill();
        }
    } else if (plant.form === "shrub") {
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(-height * 0.2, -height * 0.3, height * 0.25, 0, TAU);
        ctx.arc(height * 0.16, -height * 0.34, height * 0.22, 0, TAU);
        ctx.arc(0, -height * 0.5, height * 0.26, 0, TAU);
        ctx.fill();
    } else if (plant.form === "grass" || plant.form === "herb" || plant.form === "succulent") {
        const blades = plant.form === "herb" ? 3 : 5;
        for (let blade = 0; blade < blades; blade++) {
            const spread = (blade - (blades - 1) / 2) * height * 0.14;
            ctx.beginPath();
            ctx.moveTo(spread * 0.4, 0);
            ctx.quadraticCurveTo(spread, -height * 0.48, spread * 1.6, -height * (0.72 + unit(seed, blade) * 0.24));
            ctx.stroke();
        }
        if (plant.form === "herb") {
            ctx.beginPath();
            ctx.arc(0, -height * 0.86, Math.max(1, height * 0.12), 0, TAU);
            ctx.fill();
        }
    } else if (plant.form === "fern") {
        for (let frond = 0; frond < 4; frond++) {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo((frond - 1.5) * height * 0.24, -height * 0.5, (frond - 1.5) * height * 0.4, -height * 0.7);
            ctx.stroke();
        }
    } else if (plant.form === "vine") {
        ctx.beginPath();
        ctx.moveTo(0, -height * 0.9);
        ctx.bezierCurveTo(-height * 0.3, -height * 0.5, height * 0.3, -height * 0.28, 0, 0);
        ctx.stroke();
    } else if (plant.form === "aquatic") {
        ctx.globalAlpha = 0.72;
        ctx.beginPath();
        ctx.ellipse(0, -height * 0.18, height * 0.38, height * 0.15, 0, 0, TAU);
        ctx.fill();
    } else {
        ctx.globalAlpha = 0.78;
        ctx.beginPath();
        ctx.ellipse(0, -height * 0.1, height * 0.3, height * 0.14, 0, 0, TAU);
        ctx.fill();
    }
    ctx.restore();
}

function drawPlantVignette(ctx, anchor, x, y, s, season, detail) {
    // A flowering herb under a snow cap is the visual equivalent of a bug: it
    // tells the player winter never reached the biome. Keep evergreens, shrubs,
    // ferns, moss and dormant grass, but no flower heads or floating lily pads
    // in winter. The seasonal palette already turns the survivors grey-straw.
    const active = plantsForBiome(anchor.biome).filter(id => {
        const plant = BIOME_PLANTS[id];
        if (!plant) return false;
        if (plant.seasons && !plant.seasons.includes(season)) return false;
        if (season === 3 && (plant.form === "herb" || plant.form === "aquatic")) return false;
        return true;
    });
    if (!active.length) return;
    const count = detail > 1 ? 7 : 4;
    for (let index = 0; index < count; index++) {
        const angle = unit(anchor.seed, index * 4 + 1) * TAU;
        const radius = s * (0.45 + unit(anchor.seed, index * 4 + 2) * 0.85);
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius * 0.56;
        const plantId = active[Math.floor(unit(anchor.seed, index * 4 + 3) * active.length)];
        // Lazy import would be asynchronous; the catalog is already part of the
        // registry module and is imported below through the data module.
        const plant = BIOME_PLANTS[plantId];
        if (!plant) continue;
        drawPlantGlyph(ctx, px, py, s * 0.42, plant, anchor.seed + index * 977, season);
    }
}

function drawMotes(ctx, anchor, x, y, s, season, tick, budget) {
    const config = BIOME_ATMOSPHERE[anchor.biome];
    if (!config || !config.seasons.includes(season) || budget <= 0) return 0;
    const count = Math.min(8, config.count);
    ctx.save();
    for (let index = 0; index < count && index < budget; index++) {
        const phase = tick * 0.00036 + unit(anchor.seed, index * 9 + 1) * TAU;
        const drift = s * (0.45 + unit(anchor.seed, index * 9 + 2) * 0.95);
        const px = x + Math.cos(phase + index * 0.8) * drift;
        const py = y - s * 0.24 + Math.sin(phase * 0.84 + index * 1.7) * drift * 0.55;
        const alpha = 0.18 + unit(anchor.seed, index * 9 + 4) * 0.48;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = config.color;
        if (config.kind === "spindrift") {
            ctx.strokeStyle = config.color;
            ctx.lineWidth = Math.max(0.7, s * 0.025);
            ctx.beginPath();
            ctx.moveTo(px - s * 0.16, py);
            ctx.lineTo(px + s * 0.16, py - s * 0.02);
            ctx.stroke();
        } else if (config.kind === "firefly") {
            ctx.beginPath();
            ctx.arc(px, py, Math.max(1, s * 0.045), 0, TAU);
            ctx.fill();
            ctx.globalAlpha = alpha * 0.3;
            ctx.beginPath();
            ctx.arc(px, py, Math.max(2, s * 0.12), 0, TAU);
            ctx.fill();
        } else if (config.kind === "glint") {
            ctx.strokeStyle = config.color;
            ctx.lineWidth = Math.max(0.7, s * 0.022);
            ctx.beginPath();
            ctx.moveTo(px - s * 0.08, py);
            ctx.lineTo(px + s * 0.08, py);
            ctx.moveTo(px, py - s * 0.08);
            ctx.lineTo(px, py + s * 0.08);
            ctx.stroke();
        } else if (config.kind === "needle" || config.kind === "seed") {
            ctx.beginPath();
            ctx.ellipse(px, py, Math.max(0.8, s * 0.05), Math.max(0.5, s * 0.022), phase, 0, TAU);
            ctx.fill();
        } else {
            ctx.beginPath();
            ctx.arc(px, py, Math.max(0.8, s * 0.03), 0, TAU);
            ctx.fill();
        }
    }
    ctx.restore();
    return count;
}

export function drawBiomeIdentityOverlay(ctx, zoom, cam, canvas) {
    if (!ctx || !canvas || !(zoom > 0.22)) return;
    const anchors = anchorsForState();
    if (!anchors.length) return;
    const season = seasonOfState();
    const tick = Number(state.tick) || 0;
    const width = canvas.width, height = canvas.height;
    const centerX = (cam.x + width * 0.5) / (CELL * zoom);
    const centerY = (cam.y + height * 0.5) / (CELL * zoom);
    drawHaze(ctx, canvas, dominantBiomeAt(state.biomeIndexMap, centerX, centerY), season, zoom);

    let budget = MAX_MOTES;
    for (const anchor of anchors) {
        const identity = anchor.identity;
        const s = CELL * zoom * clamp(identity.landmark.scale || 1.5, 1.1, 2.6) * 0.72;
        const x = anchor.x * CELL * zoom - cam.x;
        const y = anchor.y * CELL * zoom - cam.y;
        if (x < -s * 2.5 || y < -s * 2.5 || x > width + s * 2.5 || y > height + s * 2.5) continue;
        const detail = zoom >= (identity.lod?.detail || 0.85) ? 2 : zoom >= 0.45 ? 1 : 0;
        if (detail > 0) drawPlantVignette(ctx, anchor, x, y, s, season, detail);
        drawLandmark(ctx, anchor, x, y, s, season, detail);
        budget -= drawMotes(ctx, anchor, x, y, s, season, tick, budget);
        if (budget <= 0) break;
    }
}

export const __internals = {
    MAX_ANCHORS, MAX_MOTES, OFFSETS, biomeKeyAt, dominantBiomeAt, hashText, unit
};
