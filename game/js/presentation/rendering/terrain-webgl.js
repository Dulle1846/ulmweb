// Screen-resolution terrain surface.
//
// The simulation stores height/moisture/temperature on a compact grid (2–5
// samples per tile). That grid is the authoritative data, but it must never be
// visible. This renderer uploads the field as 32-bit floats and reconstructs it
// with a Catmull-Rom bicubic patch per fragment, including the analytic
// derivative, so both the colour contours and the hillshade are C1-smooth.
//
// Rivers and lakes are carved into the same grid with hard one-pixel edges. A
// blurred water mask in the alpha channel is used only for display, so their
// silhouettes read as natural shores without moving gameplay water.

import { BUILDING_SIZE, CELL } from '../../core/config.js';
import { state } from '../../core/state.js';
import { worldWidth, worldHeight } from '../../world/world.js';
import { getRoadTiles } from '../../systems/roads.js';
import { terrainShaderPalette } from './terrain-palette.js';

const VERTEX_SHADER = `#version 300 es
in vec2 aPosition;
void main() {
    gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D uTerrain;
uniform sampler2D uWear;
uniform sampler2D uWaterDist;
uniform vec2 uWorldSize;
uniform vec2 uDataSize;
uniform vec2 uCamera;
uniform vec2 uViewport;
uniform float uCell;
uniform float uZoom;
uniform float uSea;
uniform float uTime;
uniform float uDetail;
uniform float uCloseDetail;
uniform float uSeed;
uniform float uHighQuality;
uniform float uSnowBias;
uniform float uAutumn;
uniform float uWinter;
uniform vec3 uGrass;
uniform vec3 uLush;
uniform vec3 uDry;
uniform vec3 uEarth;
uniform vec3 uForest;
uniform vec3 uRock;
uniform vec3 uSand;
uniform vec3 uSnow;
uniform vec3 uSwamp;
uniform vec3 uWaterDeep;
uniform vec3 uWaterShallow;
uniform vec3 uFoam;

out vec4 outColor;

// ── deterministic noise ─────────────────────────────────────────

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
}

float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm2(vec2 p) {
    return vnoise(p) * 0.62 + vnoise(p * 2.07 + vec2(17.1, 9.2)) * 0.38;
}

float fbm3(vec2 p) {
    float total = vnoise(p) * 0.50;
    total += vnoise(p * 2.03 + vec2(17.1, 9.2)) * 0.30;
    total += vnoise(p * 4.11 + vec2(4.7, 21.3)) * 0.20;
    return total;
}

float ridged3(vec2 p) {
    float total = (1.0 - abs(vnoise(p) * 2.0 - 1.0)) * 0.62;
    total += (1.0 - abs(vnoise(p * 2.07 + vec2(11.3, 3.7)) * 2.0 - 1.0)) * 0.38;
    return total;
}

// ── smooth height field ─────────────────────────────────────────

struct Surface {
    float h;
    float m;
    float t;
    float smoothResidual;
    float hx;
    float hy;
    float ax;
    float ay;
    float hLinear;
};

vec4 fetchTerrain(ivec2 p) {
    ivec2 last = ivec2(uDataSize) - ivec2(1);
    return texelFetch(uTerrain, clamp(p, ivec2(0), last), 0);
}

Surface sampleBilinear(vec2 world) {
    vec2 texels = uDataSize / uWorldSize;
    vec2 p = world * texels - 0.5;
    vec2 base = floor(p);
    vec2 f = p - base;
    ivec2 i = ivec2(base);

    vec4 c00 = fetchTerrain(i);
    vec4 c10 = fetchTerrain(i + ivec2(1, 0));
    vec4 c01 = fetchTerrain(i + ivec2(0, 1));
    vec4 c11 = fetchTerrain(i + ivec2(1, 1));

    vec4 top = mix(c00, c10, f.x);
    vec4 bottom = mix(c01, c11, f.x);
    vec4 v = mix(top, bottom, f.y);
    float hx = mix(c10.r - c00.r, c11.r - c01.r, f.y) * texels.x;
    float hy = mix(c01.r - c00.r, c11.r - c10.r, f.x) * texels.y;
    float ax = mix(c10.a - c00.a, c11.a - c01.a, f.y) * texels.x;
    float ay = mix(c01.a - c00.a, c11.a - c10.a, f.x) * texels.y;
    return Surface(v.r, v.g, v.b, v.a, hx, hy, ax, ay, v.r);
}

// Catmull-Rom bicubic: continuous value and derivative, so shading has no
// texel-sized facets and coastlines are curved instead of grid polygons.
Surface sampleBicubic(vec2 world) {
    vec2 texels = uDataSize / uWorldSize;
    vec2 p = world * texels - 0.5;
    vec2 base = floor(p);
    vec2 f = p - base;
    ivec2 b = ivec2(base);

    float x2 = f.x * f.x;
    float x3 = x2 * f.x;
    float wx0 = 0.5 * (-x3 + 2.0 * x2 - f.x);
    float wx1 = 0.5 * (3.0 * x3 - 5.0 * x2 + 2.0);
    float wx2 = 0.5 * (-3.0 * x3 + 4.0 * x2 + f.x);
    float wx3 = 0.5 * (x3 - x2);
    float dx0 = 0.5 * (-3.0 * x2 + 4.0 * f.x - 1.0);
    float dx1 = 0.5 * (9.0 * x2 - 10.0 * f.x);
    float dx2 = 0.5 * (-9.0 * x2 + 8.0 * f.x + 1.0);
    float dx3 = 0.5 * (3.0 * x2 - 2.0 * f.x);

    float y2 = f.y * f.y;
    float y3 = y2 * f.y;
    float wy0 = 0.5 * (-y3 + 2.0 * y2 - f.y);
    float wy1 = 0.5 * (3.0 * y3 - 5.0 * y2 + 2.0);
    float wy2 = 0.5 * (-3.0 * y3 + 4.0 * y2 + f.y);
    float wy3 = 0.5 * (y3 - y2);
    float dy0 = 0.5 * (-3.0 * y2 + 4.0 * f.y - 1.0);
    float dy1 = 0.5 * (9.0 * y2 - 10.0 * f.y);
    float dy2 = 0.5 * (-9.0 * y2 + 8.0 * f.y + 1.0);
    float dy3 = 0.5 * (3.0 * y2 - 2.0 * f.y);

    vec4 c00 = fetchTerrain(b + ivec2(-1, -1));
    vec4 c10 = fetchTerrain(b + ivec2( 0, -1));
    vec4 c20 = fetchTerrain(b + ivec2( 1, -1));
    vec4 c30 = fetchTerrain(b + ivec2( 2, -1));
    vec4 r0 = wx0 * c00 + wx1 * c10 + wx2 * c20 + wx3 * c30;
    vec4 s0 = dx0 * c00 + dx1 * c10 + dx2 * c20 + dx3 * c30;

    vec4 c01 = fetchTerrain(b + ivec2(-1, 0));
    vec4 c11 = fetchTerrain(b + ivec2( 0, 0));
    vec4 c21 = fetchTerrain(b + ivec2( 1, 0));
    vec4 c31 = fetchTerrain(b + ivec2( 2, 0));
    vec4 r1 = wx0 * c01 + wx1 * c11 + wx2 * c21 + wx3 * c31;
    vec4 s1 = dx0 * c01 + dx1 * c11 + dx2 * c21 + dx3 * c31;

    vec4 c02 = fetchTerrain(b + ivec2(-1, 1));
    vec4 c12 = fetchTerrain(b + ivec2( 0, 1));
    vec4 c22 = fetchTerrain(b + ivec2( 1, 1));
    vec4 c32 = fetchTerrain(b + ivec2( 2, 1));
    vec4 r2 = wx0 * c02 + wx1 * c12 + wx2 * c22 + wx3 * c32;
    vec4 s2 = dx0 * c02 + dx1 * c12 + dx2 * c22 + dx3 * c32;

    vec4 c03 = fetchTerrain(b + ivec2(-1, 2));
    vec4 c13 = fetchTerrain(b + ivec2( 0, 2));
    vec4 c23 = fetchTerrain(b + ivec2( 1, 2));
    vec4 c33 = fetchTerrain(b + ivec2( 2, 2));
    vec4 r3 = wx0 * c03 + wx1 * c13 + wx2 * c23 + wx3 * c33;
    vec4 s3 = dx0 * c03 + dx1 * c13 + dx2 * c23 + dx3 * c33;

    vec4 v = wy0 * r0 + wy1 * r1 + wy2 * r2 + wy3 * r3;
    vec4 gx = wy0 * s0 + wy1 * s1 + wy2 * s2 + wy3 * s3;
    vec4 gy = dy0 * r0 + dy1 * r1 + dy2 * r2 + dy3 * r3;
    vec4 bilinear = mix(mix(c11, c21, f.x), mix(c12, c22, f.x), f.y);
    return Surface(v.r, v.g, v.b, v.a, gx.r * texels.x, gy.r * texels.y,
        gx.a * texels.x, gy.a * texels.y, bilinear.r);
}

// A slow domain warp is what turns the four-samples-per-tile data lattice into
// organic coastline curvature. Amplitude stays far below one tile, so the
// shore remains where gameplay believes it is.
vec2 domainWarp(vec2 world) {
    float a = vnoise(world * 0.38 + vec2(13.7, 5.1)) - 0.5;
    float b = vnoise(world * 0.38 + vec2(7.3, 19.4)) - 0.5;
    vec2 fineWarp = vec2(
        vnoise(world * 1.7 + vec2(3.0, 8.0)),
        vnoise(world * 1.7 + vec2(11.0, 2.0))
    ) - 0.5;
    return vec2(a, b) * 0.34 + fineWarp * 0.05;
}

Surface sampleSurface(vec2 world) {
    vec2 warped = world + domainWarp(world);
    if (uHighQuality > 0.5) return sampleBicubic(warped);
    return sampleBilinear(warped);
}

float heightBilinear(vec2 world) {
    vec2 texels = uDataSize / uWorldSize;
    vec2 p = world * texels - 0.5;
    vec2 base = floor(p);
    vec2 f = p - base;
    ivec2 i = ivec2(base);
    float c00 = fetchTerrain(i).r;
    float c10 = fetchTerrain(i + ivec2(1, 0)).r;
    float c01 = fetchTerrain(i + ivec2(0, 1)).r;
    float c11 = fetchTerrain(i + ivec2(1, 1)).r;
    return mix(mix(c00, c10, f.x), mix(c01, c11, f.x), f.y);
}

// ── materials ───────────────────────────────────────────────────

vec3 grassMaterial(vec2 world, float moisture, float macro, float meso, float fine, float micro, float detail) {
    float clumps = smoothstep(0.40, 0.66, meso + (micro - 0.5) * 0.30);
    float tuft = smoothstep(0.40, 0.80, vnoise(world * 3.6 + vec2(1.7, 8.4)));
    float blades = sin(world.x * 15.0 + world.y * 2.2 + micro * 11.0 + sin(world.y * 5.4 + macro * 6.0) * 2.4) * 0.5 + 0.5;
    float bladesFine = sin(world.x * 37.0 - world.y * 5.0 + micro * 17.0) * 0.5 + 0.5;
    float fleck = vnoise(world * 22.0 + vec2(4.2, 7.9));

    vec3 color = mix(uGrass, uLush, (0.22 + clumps * 0.24 + tuft * 0.08) * smoothstep(0.26, 0.86, moisture));
    color = mix(color, uForest * 1.10, uCloseDetail * smoothstep(0.62, 0.9, fbm2(world * 7.3 + 11.0)) * 0.12);
    color *= 0.88 + 0.14 * meso + 0.08 * micro;
    color += vec3(0.100, 0.130, 0.035) * (blades - 0.5) * detail;
    color += vec3(0.050, 0.065, 0.018) * (bladesFine - 0.5) * uCloseDetail;

    color = mix(color, uLush * 0.80, smoothstep(0.56, 0.80, fleck) * 0.14 * uCloseDetail);
    color = mix(color, color * 0.72, smoothstep(0.90, 0.99, fine) * 0.22 * detail);
    if (uAutumn > 0.5) color = mix(color, uDry * 0.94, 0.20);
    return color;
}

vec3 forestMaterial(vec2 world, float macro, float meso, float fine, float micro, float detail) {
    float leaf = vnoise(world * 7.4 + vec2(1.4, 3.8));
    float litter = smoothstep(0.40, 0.78, leaf + (micro - 0.5) * 0.20);
    float undergrowth = smoothstep(0.54, 0.90, vnoise(world * 12.0 + vec2(6.3, 2.1)));

    vec3 color = mix(uForest * 1.55, uLush * 0.95, 0.26 + 0.30 * macro);
    color *= 0.86 + 0.16 * meso + 0.12 * micro;
    color = mix(color, uEarth * 0.72, litter * 0.18);
    color = mix(color, uForest * 0.80, smoothstep(0.68, 0.88, leaf) * 0.24 * detail);
    color = mix(color, uForest * 1.22, undergrowth * 0.20 * detail);
    float canopy = vnoise(world * 5.2 + vec2(9.1, 3.3));
    color = mix(color, uForest * 0.92, smoothstep(0.55, 0.86, canopy) * 0.26 * detail);
    color = mix(color, color * 1.12, smoothstep(0.36, 0.12, canopy) * 0.14 * detail);
    color += vec3(0.030, 0.038, 0.012) * (fine - 0.5) * detail;
    color = mix(color, color * 0.70, smoothstep(0.86, 0.99, fine) * 0.26 * detail);
    if (uAutumn > 0.5) color = mix(color, uForest * 1.22 + vec3(0.075, 0.017, 0.0), 0.34);
    return color;
}

vec3 earthMaterial(float meso, float fine, float micro, float detail) {
    float grit = (step(0.66, fine) * 0.20 + step(0.86, micro) * 0.12) * detail;
    vec3 color = mix(uEarth, uDry, meso * 0.38);
    color *= 0.76 + 0.24 * micro + 0.20 * fine - grit;
    color = mix(color, color * 0.64, smoothstep(0.60, 0.84, micro) * 0.20);
    return color;
}

vec3 rockMaterial(vec2 world, float meso, float micro, float detail) {
    float structure = ridged3(world * 1.9 + uSeed);
    float crack = smoothstep(0.060, 0.0, abs(structure - 0.55));
    float strata = sin(world.y * 2.6 + structure * 5.0) * 0.5 + 0.5;
    vec3 color = mix(uRock * 0.78, uRock * 1.55, structure);
    color *= 0.80 + 0.14 * meso + 0.10 * micro;
    color = mix(color, color * 0.62, crack * 0.22);
    color = mix(color, color * 1.10, strata * 0.12 * detail);
    color = mix(color, color * 1.10, step(0.80, micro) * 0.10 * detail);
    return color;
}

vec3 wetlandMaterial(vec2 world, float macro, float meso, float micro) {
    float pools = smoothstep(0.34, 0.70, macro + micro * 0.22 + 0.10);
    float moss = vnoise(world * 14.0 + vec2(3.3, 9.9));
    vec3 color = mix(uSwamp, uWaterShallow * 0.44, pools * 0.38);
    color *= 0.70 + 0.28 * meso + 0.18 * micro;
    color = mix(color, color * 0.72, smoothstep(0.62, 0.9, moss) * 0.26);
    color = mix(color, color * 1.20, step(0.76, micro) * 0.18);
    return color;
}

vec3 sandMaterial(vec2 world, float meso, float fine, float micro, float detail) {
    float ripple = sin(world.y * 34.0 + vnoise(world * 1.9) * 9.0 + uTime * 0.07) * 0.5 + 0.5;
    float grit = vnoise(world * 29.0 + vec2(8.1, 2.7));
    vec3 color = mix(uSand, uSand * 0.86, 0.32 + 0.18 * meso);
    color += vec3(0.052, 0.040, 0.019) * (ripple - 0.5) * detail;
    color = mix(color, color * 0.74, step(0.70, fine) * 0.36 * detail);
    color = mix(color, color * 1.12, step(0.76, grit) * 0.22 * uCloseDetail);
    return color;
}

vec3 snowMaterial(vec2 world, float micro, float detail) {
    float drift = vnoise(world * 2.2 + uSeed);
    float sparkle = step(0.985, hash21(floor(world * 30.0))) * uCloseDetail;
    vec3 color = mix(uSnow, uSnow * 0.86, drift * 0.32);
    color = mix(color, color * 1.06, step(0.68, micro) * 0.16);
    color = mix(color, color * 0.78, smoothstep(0.60, 0.80, vnoise(world * 6.2)) * 0.24);
    return color + vec3(0.075) * sparkle;
}

vec3 waterMaterial(vec2 world, float sd, float micro) {
    // Depth comes from a smoothed height contour, never from the carved
    // height: the carve is one flat pixel step and would band the lakebed.
    float depth = smoothstep(0.02, 0.65, -sd);
    vec3 color = mix(uWaterShallow, uWaterDeep * 1.30, depth * 0.62);
    color = mix(color, uLush * 0.55, (1.0 - uDetail) * 0.28);

    float wave = sin(world.x * 2.1 + uTime * 0.42 + world.y * 1.35) * 0.50
        + sin(world.y * 4.6 - uTime * 0.31 + world.x * 0.8) * 0.30
        + sin((world.x - world.y) * 8.5 + uTime * 0.55) * 0.14;
    color += vec3(0.010, 0.018, 0.021) * wave;

    float crest = smoothstep(0.55, 0.95, wave * 0.5 + 0.52) * smoothstep(0.38, 0.85, micro);

    // Thin surf line that follows the shore distance, broken by noise.
    float rim = smoothstep(0.0, 0.09, -sd) * (1.0 - smoothstep(0.11, 0.34, -sd));
    float foamPattern = vnoise(world * 2.8 + vec2(uTime * 0.05, 0.0));
    // The surf line is left out on purpose: on a two-tile pond it draws a
    // bright outline around the polygon instead of lapping at a shore.

    if (uWinter > 0.5) {
        float ice = smoothstep(0.32, 0.74, fbm2(world * 0.4)) * uWinter;
        color = mix(color, mix(uSnow, uWaterShallow, 0.40), ice * 0.32);
    }
    return color;
}

void main() {
    vec2 screen = vec2(gl_FragCoord.x, uViewport.y - gl_FragCoord.y);
    vec2 world = (screen + uCamera) / max(0.001, uCell * uZoom);

    Surface terrain = sampleSurface(world);
    float h = terrain.h;
    float hx = terrain.hx;
    float hy = terrain.hy;
    float slope = length(vec2(hx, hy));
    float detail = uDetail;

    // Display-only water: a lightly smoothed copy of the height field. Its
    // contour is an organic shoreline with no one-texel carve staircase, and
    // sub-tile puddles fade out instead of turning into identical ovals.
    // Water comes straight from the true signed distance field: its zero
    // contour is the real shore, it antialiases cleanly at any zoom, and it
    // cannot overshoot into the star shapes a cubic height reconstruction
    // produced at the one-texel carve wall. Fine noise only breaks the
    // mathematically round carve into an organic edge.
    float sd = texture(uWaterDist, world / uWorldSize).r * 12.0 - 6.0;
    float edgeNoise = (vnoise(world * 9.0 + vec2(4.1, 7.3)) - 0.5) * 0.10
        + (vnoise(world * 21.0 + vec2(1.7, 5.2)) - 0.5) * 0.035;
    float water = 1.0 - smoothstep(-0.02, 0.02, sd - edgeNoise);
    float wx = hx + terrain.ax;
    float wy = hy + terrain.ay;
    float nearShore = (1.0 - smoothstep(0.02, 0.40, sd)) * (1.0 - water);
    // The carve drops one texel and leaves a cliff ring. Read it as a bank:
    // no cliff material, no grain and no relief inside this band.
    float shoreCalm = (1.0 - smoothstep(0.30, 1.40, sd)) * (1.0 - water);
    float shoreDetail = smoothstep(0.25, 0.7, detail);

    float coastNoise = (vnoise(world * 2.2 + vec2(11.0, 4.0)) - 0.5) * 0.013
        + (vnoise(world * 8.5 + vec2(2.0, 8.0)) - 0.5) * 0.0026;
    float e = h - uSea + coastNoise;
    // Normalised elevation matches the baked palette thresholds (0 at the
    // shore, 1 at the highest peak); using raw height made snow unreachable.
    float elevation = clamp((h - uSea) / max(0.001, 1.0 - uSea), 0.0, 1.0);

    float macro = fbm3(world * 0.24 + vec2(uSeed * 7.0, uSeed * 3.0));
    float meso = fbm3(world * 1.15 + vec2(5.2, 9.7));
    float fine = fbm2(world * 2.4 + vec2(1.3, 4.1));
    float micro = fbm2(world * 3.1 + vec2(6.1, 3.4));
    if (detail > 0.02) {
        fine = mix(fine, fbm3(world * 7.0 + vec2(2.3, 6.1)), detail);
        micro = mix(micro, fbm3(world * 13.0 + vec2(3.1, 7.7)), detail);
    }
    float variation = vnoise(world * 0.085 + uSeed);
    float n3 = vnoise(world * 3.1 + vec2(5.7, 1.9));
    float n7 = vnoise(world * 7.3 + vec2(2.9, 8.3));

    float elevationNoise = (n3 - 0.5) * 0.030 + (n7 - 0.5) * 0.012;
    float elevN = clamp(elevation + elevationNoise, 0.0, 1.0);

    vec3 landColor = vec3(0.0);
    // Deep water skips the entire land material stack. The branch is coherent
    // across large areas, so it is a real saving, not just divergence.
    if (water < 0.999) {
        // Beach width measured from the shore, not from a height band: the
        // carved rims sit on a flat shelf just above sea level and a height
        // band would paint the whole crater rim as sand.
        // No painted beach collar: the carve wall is only a few texels wide,
        // so a sand band reads as a stamped ring. Arid ground keeps its sand.
        float beach = nearShore * 0.02 * shoreDetail;
        float rimMask = 1.0 - smoothstep(0.18, 0.90, sd);
        float snow = clamp(
            smoothstep(0.66, 0.80, elevN)
            + smoothstep(0.26, 0.11, terrain.t)
            + uSnowBias,
            0.0, 1.0);
        // The carve wall around rivers is a one-texel drop in the data. It must
        // read as a bank, not as a ring of cliffs, so slopes near water are masked.
        float cliff = smoothstep(0.035, 0.095, slope) * (1.0 - snow * 0.70) * (1.0 - shoreCalm);
        float rock = clamp(smoothstep(0.56, 0.82, elevN) + cliff * 0.65, 0.0, 1.0)
            * (1.0 - shoreCalm) * (1.0 - snow * 0.55);
        float forest = smoothstep(0.36, 0.63, terrain.m)
            * (1.0 - smoothstep(0.80, 0.94, terrain.t))
            * smoothstep(0.010, 0.070, elevation)
            * (1.0 - smoothstep(0.80, 0.95, elevN))
            * (1.0 - smoothstep(0.040, 0.100, slope));
        float wet = smoothstep(0.66, 0.86, terrain.m) * (1.0 - smoothstep(0.10, 0.02, elevation))
            * (1.0 - shoreCalm);
        float arid = smoothstep(0.62, 0.90, terrain.t) * (1.0 - smoothstep(0.18, 0.40, terrain.m));
        float sand = clamp(beach, 0.0, 1.0) * (1.0 - shoreCalm);
        arid *= 1.0 - shoreCalm;
        float grass = clamp(1.0 - forest * 0.85 - rock * 0.95 - snow - wet - sand, 0.0, 1.0);
        float bare = clamp(
            smoothstep(0.30, 0.14, terrain.m) * (1.0 - forest) * (1.0 - rock) * (1.0 - wet) * 0.40
            + smoothstep(0.07, 0.16, slope) * 0.30 * (1.0 - rock) * (1.0 - snow) * (1.0 - nearShore),
            0.0, 0.60);
        bare *= 1.0 - shoreCalm;
        grass = max(0.0, grass - bare);

        float weight = grass + forest + rock + wet + sand + snow + bare;
        vec3 material = vec3(0.0);
        if (grass > 0.02) material += grassMaterial(world, terrain.m, macro, meso, fine, micro, detail) * grass;
        if (forest > 0.02) material += forestMaterial(world, macro, meso, fine, micro, detail) * forest;
        if (rock > 0.02) material += rockMaterial(world, meso, micro, detail) * rock;
        if (wet > 0.02) material += wetlandMaterial(world, macro, meso, micro) * wet;
        if (sand > 0.02) material += sandMaterial(world, meso, fine, micro, detail) * sand;
        if (snow > 0.02) material += snowMaterial(world, micro, detail) * snow;
        if (bare > 0.02) material += earthMaterial(meso, fine, micro, detail) * bare;
        landColor = material / max(0.0001, weight);

        // Broad pasture patches keep large meadows from reading as one flat wash.
        float pasture = smoothstep(0.40, 0.72, vnoise(world * 0.33 + vec2(3.3, 8.1)));
        landColor = mix(landColor, landColor * vec3(1.08, 1.03, 0.86), pasture * 0.10);

        float wear = texture(uWear, world / uWorldSize).r;
        landColor = mix(landColor, mix(uEarth, uDry * 0.82, 0.30), smoothstep(0.02, 0.62, wear) * 0.40);
        landColor = mix(landColor, landColor * vec3(0.88, 0.90, 0.86), nearShore * 0.18 * shoreDetail);

        // Shade from the smoothed field: it has no one-texel carve wall, so
        // no ring mask is needed and the shore cannot read as a gear.
        vec2 grade = vec2(wx, wy);
        float grain = (1.0 - shoreCalm) * (1.0 - water);
        grade *= 1.0 - shoreCalm * 0.92;
        vec3 normal = normalize(vec3(
            -grade.x * 90.0 - (micro - 0.5) * 0.12 * grain,
            -grade.y * 90.0 - (fine - 0.5) * 0.12 * grain,
            1.0));
        vec3 lightDirection = normalize(vec3(-0.58, -0.46, 0.78));
        float diffuse = clamp(dot(normal, lightDirection), 0.0, 1.0);
        landColor *= mix(0.90, 1.10, diffuse);

        float blocker = heightBilinear(world + vec2(-0.7, -0.7));
        float castShadow = smoothstep(0.012, 0.070, blocker - h) * smoothstep(-0.02, 0.03, e);
        landColor *= 1.0 - castShadow * 0.05 * (1.0 - shoreCalm * 0.6);
    }

    vec3 waterColor = waterMaterial(world, sd, micro);
    vec3 color = mix(waterColor, landColor, 1.0 - water);

    float cloud = vnoise(world * 0.10 + vec2(uTime * 0.004, uSeed));
    color *= 1.0 - smoothstep(0.55, 0.90, cloud) * 0.03;

    color *= 0.98 + 0.04 * variation;
    float grain = vnoise(world * 43.0 + vec2(2.2, 6.4));
    color *= 0.98 + 0.04 * grain * uCloseDetail;
    color = mix(color, color * 1.05, smoothstep(0.0, 0.40, elevation) * 0.08);
    // A touch of desaturation keeps the meadows from reading as pure pigment.
    color = mix(vec3(dot(color, vec3(0.299, 0.587, 0.114))), color, 0.92);

    outColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

let gl = null;
let program = null;
let vao = null;
let vertexBuffer = null;
let terrainTexture = null;
let wearTexture = null;
let waterDistTexture = null;
let wearCanvas = null;
let uniforms = {};
let failed = false;
let uploadedWorldEpoch = -1;
let uploadedHeights = null;
let uploadedWearKey = "";
let uploadedWidth = 0;
let uploadedHeight = 0;
let initialized = false;

function compileShader(type, source) {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        console.warn("Terrain WebGL shader compilation failed:", message);
        return null;
    }
    return shader;
}

function createProgram() {
    const vertex = compileShader(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vertex || !fragment) {
        if (vertex) gl.deleteShader(vertex);
        if (fragment) gl.deleteShader(fragment);
        return null;
    }

    const nextProgram = gl.createProgram();
    if (!nextProgram) return null;
    gl.attachShader(nextProgram, vertex);
    gl.attachShader(nextProgram, fragment);
    gl.linkProgram(nextProgram);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);

    if (!gl.getProgramParameter(nextProgram, gl.LINK_STATUS)) {
        console.warn("Terrain WebGL program link failed:", gl.getProgramInfoLog(nextProgram));
        gl.deleteProgram(nextProgram);
        return null;
    }
    return nextProgram;
}

function init() {
    if (initialized) return !failed;
    initialized = true;

    const canvas = state.terrainCanvasEl || document.getElementById("terrain-canvas");
    if (!canvas) {
        failed = true;
        return false;
    }
    state.terrainCanvasEl = canvas;

    gl = canvas.getContext("webgl2", {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: "high-performance",
    });
    if (!gl) {
        console.warn("Terrain WebGL2 unavailable; using the Canvas2D terrain fallback.");
        failed = true;
        return false;
    }

    program = createProgram();
    if (!program) {
        failed = true;
        return false;
    }

    vertexBuffer = gl.createBuffer();
    vao = gl.createVertexArray();
    if (!vertexBuffer || !vao) {
        failed = true;
        return false;
    }

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW
    );
    const position = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    terrainTexture = gl.createTexture();
    wearTexture = gl.createTexture();
    waterDistTexture = gl.createTexture();
    if (!terrainTexture || !wearTexture || !waterDistTexture) {
        failed = true;
        return false;
    }

    // Float reconstruction is done by hand, so the texture itself is sampled
    // with texelFetch and needs no filtering.
    gl.bindTexture(gl.TEXTURE_2D, terrainTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1, 1, 0, gl.RGBA, gl.FLOAT, new Float32Array(4));

    gl.bindTexture(gl.TEXTURE_2D, wearTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));

    // 8-bit shore distance is plenty for soft bands and filters everywhere.
    gl.bindTexture(gl.TEXTURE_2D, waterDistTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([128]));

    gl.useProgram(program);
    uniforms = {
        terrain: gl.getUniformLocation(program, "uTerrain"),
        wear: gl.getUniformLocation(program, "uWear"),
        waterDist: gl.getUniformLocation(program, "uWaterDist"),
        worldSize: gl.getUniformLocation(program, "uWorldSize"),
        dataSize: gl.getUniformLocation(program, "uDataSize"),
        camera: gl.getUniformLocation(program, "uCamera"),
        viewport: gl.getUniformLocation(program, "uViewport"),
        cell: gl.getUniformLocation(program, "uCell"),
        zoom: gl.getUniformLocation(program, "uZoom"),
        sea: gl.getUniformLocation(program, "uSea"),
        time: gl.getUniformLocation(program, "uTime"),
        detail: gl.getUniformLocation(program, "uDetail"),
        closeDetail: gl.getUniformLocation(program, "uCloseDetail"),
        seed: gl.getUniformLocation(program, "uSeed"),
        highQuality: gl.getUniformLocation(program, "uHighQuality"),
        snowBias: gl.getUniformLocation(program, "uSnowBias"),
        autumn: gl.getUniformLocation(program, "uAutumn"),
        winter: gl.getUniformLocation(program, "uWinter"),
        grass: gl.getUniformLocation(program, "uGrass"),
        lush: gl.getUniformLocation(program, "uLush"),
        dry: gl.getUniformLocation(program, "uDry"),
        earth: gl.getUniformLocation(program, "uEarth"),
        forest: gl.getUniformLocation(program, "uForest"),
        rock: gl.getUniformLocation(program, "uRock"),
        sand: gl.getUniformLocation(program, "uSand"),
        snow: gl.getUniformLocation(program, "uSnow"),
        swamp: gl.getUniformLocation(program, "uSwamp"),
        waterDeep: gl.getUniformLocation(program, "uWaterDeep"),
        waterShallow: gl.getUniformLocation(program, "uWaterShallow"),
        foam: gl.getUniformLocation(program, "uFoam"),
    };

    gl.uniform1i(uniforms.terrain, 0);
    gl.uniform1i(uniforms.wear, 1);
    gl.uniform1i(uniforms.waterDist, 2);
    gl.clearColor(0.055, 0.075, 0.055, 1.0);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);

    canvas.addEventListener("webglcontextlost", event => {
        event.preventDefault();
        failed = true;
    });
    canvas.addEventListener("webglcontextrestored", () => {
        failed = false;
        initialized = false;
        uploadedWorldEpoch = -1;
        uploadedWearKey = "";
    });

    return true;
}

function clearStaleErrors() {
    for (let i = 0; i < 4 && gl.getError() !== gl.NO_ERROR; i++) {
        // drain
    }
}

// Display-only smoothed copy of the height field. Three separable 1-2-1 passes
// soften the hard one-pixel carve corners into natural contours; tiny puddles
// dissolve instead of reading as stamped ovals. Gameplay keeps the exact data.
function buildSmoothedHeight(heights, width, height) {
    const count = width * height;
    const source = new Float32Array(count);
    source.set(heights);
    const target = new Float32Array(count);

    for (let pass = 0; pass < 3; pass++) {
        for (let y = 0; y < height; y++) {
            const row = y * width;
            for (let x = 0; x < width; x++) {
                const left = source[row + Math.max(0, x - 1)];
                const center = source[row + x];
                const right = source[row + Math.min(width - 1, x + 1)];
                target[row + x] = (left + center * 2 + right) * 0.25;
            }
        }
        for (let y = 0; y < height; y++) {
            const up = Math.max(0, y - 1) * width;
            const row = y * width;
            const down = Math.min(height - 1, y + 1) * width;
            for (let x = 0; x < width; x++) {
                source[row + x] = (target[up + x] + target[row + x] * 2 + target[down + x]) * 0.25;
            }
        }
    }
    return source;
}

function chamferDistance(field, width, height) {
    const D1 = 1, D2 = Math.SQRT2;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = y * width + x;
            let d = field[i];
            if (y > 0) d = Math.min(d, field[i - width] + D1);
            if (x > 0) d = Math.min(d, field[i - 1] + D1);
            if (y > 0 && x > 0) d = Math.min(d, field[i - width - 1] + D2);
            if (y > 0 && x < width - 1) d = Math.min(d, field[i - width + 1] + D2);
            field[i] = d;
        }
    }
    for (let y = height - 1; y >= 0; y--) {
        for (let x = width - 1; x >= 0; x--) {
            const i = y * width + x;
            let d = field[i];
            if (y < height - 1) d = Math.min(d, field[i + width] + D1);
            if (x < width - 1) d = Math.min(d, field[i + 1] + D1);
            if (y < height - 1 && x < width - 1) d = Math.min(d, field[i + width + 1] + D2);
            if (y < height - 1 && x > 0) d = Math.min(d, field[i + width - 1] + D2);
            field[i] = d;
        }
    }
    return field;
}

// Signed shore distance in tiles, encoded into one byte: 0 = six tiles
// inland, 128 = shoreline, 255 = six tiles out. Used for every shore band so
// the one-texel carve wall cannot break them.
function buildWaterDistance(heights, width, height, sea) {
    const count = width * height;
    const toWater = new Float32Array(count);
    const toLand = new Float32Array(count);
    const INF = 1e6;
    for (let i = 0; i < count; i++) {
        const isWater = heights[i] < sea;
        toWater[i] = isWater ? 0 : INF;
        toLand[i] = isWater ? INF : 0;
    }
    chamferDistance(toWater, width, height);
    chamferDistance(toLand, width, height);
    const bytes = new Uint8Array(count);
    for (let i = 0; i < count; i++) {
        const tiles = (heights[i] < sea ? -toLand[i] : toWater[i]) / 4;
        bytes[i] = Math.round((Math.max(-6, Math.min(6, tiles)) + 6) / 12 * 255);
    }
    return bytes;
}

function uploadWorldData() {
    const width = Number(state.terrainPixW) || 0;
    const height = Number(state.terrainPixH) || 0;
    if (!width || !height || !state.heightMap) return false;

    const heights = state.heightMap;
    const smoothed = buildSmoothedHeight(heights, width, height);
    const floats = new Float32Array(width * height * 4);
    const moistures = state.moistureMap;
    const temperatures = state.temperatureMap;
    for (let i = 0; i < width * height; i++) {
        const offset = i * 4;
        floats[offset] = heights[i] ?? 0;
        floats[offset + 1] = moistures?.[i] ?? 0.5;
        floats[offset + 2] = temperatures?.[i] ?? 0.55;
        floats[offset + 3] = smoothed[i] - heights[i];
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, terrainTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    clearStaleErrors();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, floats);
    if (gl.getError() !== gl.NO_ERROR) {
        console.warn("Terrain float texture upload failed; using the Canvas2D terrain fallback.");
        failed = true;
        return false;
    }

    const distanceBytes = buildWaterDistance(heights, width, height, state.seaLevel ?? 0.33);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, waterDistTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, width, height, 0, gl.RED, gl.UNSIGNED_BYTE, distanceBytes);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);

    uploadedWidth = width;
    uploadedHeight = height;
    uploadedWorldEpoch = state.worldEpoch;
    uploadedHeights = heights;
    return true;
}

function drawWearSpot(context, x, y, radius, strength) {
    if (radius <= 0) return;
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(255,255,255,${strength})`);
    gradient.addColorStop(0.55, `rgba(255,255,255,${strength * 0.40})`);
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
}

function uploadWearData() {
    const W = Math.max(1, Math.floor(worldWidth()));
    const H = Math.max(1, Math.floor(worldHeight()));
    const scale = 2;
    const roads = getRoadTiles();
    const key = [state.worldEpoch, state.roads?.revision ?? 0, state.buildingCollisionVersion ?? 0,
        state.entities.length, state.worldSeed].join(":");
    if (key === uploadedWearKey) return true;

    if (!wearCanvas || wearCanvas.width !== W * scale || wearCanvas.height !== H * scale) {
        wearCanvas = document.createElement("canvas");
        wearCanvas.width = W * scale;
        wearCanvas.height = H * scale;
    }
    const context = wearCanvas.getContext("2d", { willReadFrequently: true });
    if (!context) return false;
    context.globalCompositeOperation = "source-over";
    context.fillStyle = "#000";
    context.fillRect(0, 0, wearCanvas.width, wearCanvas.height);
    context.globalCompositeOperation = "lighter";

    for (const road of roads) {
        drawWearSpot(context, (road.x + 0.5) * scale, (road.y + 0.5) * scale, 1.5 * scale, 0.55);
    }

    for (const entity of state.entities) {
        if (entity.dead) continue;
        const isBuilding = entity.type <= 14 || entity.type >= 60;
        if (!isBuilding) continue;
        const footprint = BUILDING_SIZE[entity.type] || { w: 1.4, h: 1.4 };
        const radius = Math.max(1.2, Math.max(footprint.w, footprint.h) * 0.62 + 0.7);
        drawWearSpot(context, entity.x * scale, entity.y * scale, radius * scale, 0.42);
        if (entity.field) drawWearSpot(context, entity.x * scale, entity.y * scale, 1.8 * scale, 0.24);
    }

    context.globalCompositeOperation = "source-over";
    const image = context.getImageData(0, 0, wearCanvas.width, wearCanvas.height);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, wearTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, wearCanvas.width, wearCanvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, image.data);
    uploadedWearKey = key;
    return true;
}

function setPalette() {
    const palette = terrainShaderPalette(state.worldOptions?.climate, state.seasonIndex ?? 0);
    gl.uniform3fv(uniforms.grass, palette.grass);
    gl.uniform3fv(uniforms.lush, palette.lush);
    gl.uniform3fv(uniforms.dry, palette.dry);
    gl.uniform3fv(uniforms.earth, palette.earth);
    gl.uniform3fv(uniforms.forest, palette.forest);
    gl.uniform3fv(uniforms.rock, palette.rock);
    gl.uniform3fv(uniforms.sand, palette.sand);
    gl.uniform3fv(uniforms.snow, palette.snow);
    gl.uniform3fv(uniforms.swamp, palette.swamp);
    gl.uniform3fv(uniforms.waterDeep, palette.waterDeep);
    gl.uniform3fv(uniforms.waterShallow, palette.waterShallow);
    gl.uniform3fv(uniforms.foam, palette.foam);
    gl.uniform1f(uniforms.snowBias, palette.snowBias);
    gl.uniform1f(uniforms.autumn, palette.autumn);
    gl.uniform1f(uniforms.winter, palette.winter);
}

export function drawTerrainGL() {
    if (failed || !state.heightMap || !state.canvas) return false;
    if (!init()) return false;

    const canvas = state.terrainCanvasEl;
    if (!canvas) return false;
    if (canvas.width !== state.canvas.width || canvas.height !== state.canvas.height) {
        canvas.width = state.canvas.width;
        canvas.height = state.canvas.height;
    }
    if (canvas.width < 2 || canvas.height < 2) return false;

    if (uploadedWorldEpoch !== state.worldEpoch || uploadedHeights !== state.heightMap) {
        if (!uploadWorldData()) return false;
    }
    if (!uploadWearData()) return false;

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.bindVertexArray(vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, terrainTexture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, wearTexture);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, waterDistTexture);

    setPalette();
    gl.uniform2f(uniforms.worldSize, Math.max(1, worldWidth()), Math.max(1, worldHeight()));
    gl.uniform2f(uniforms.dataSize, uploadedWidth, uploadedHeight);
    gl.uniform2f(uniforms.camera, state.camera.x, state.camera.y);
    gl.uniform2f(uniforms.viewport, canvas.width, canvas.height);
    gl.uniform1f(uniforms.cell, CELL);
    gl.uniform1f(uniforms.zoom, state.zoom);
    gl.uniform1f(uniforms.sea, state.seaLevel ?? 0.33);
    gl.uniform1f(uniforms.time, performance.now() / 1000);
    gl.uniform1f(uniforms.detail, Math.max(0, Math.min(1, (state.zoom - 0.30) / 1.25)));
    gl.uniform1f(uniforms.closeDetail, Math.max(0, Math.min(1, (state.zoom - 1.10) / 1.50)));
    gl.uniform1f(uniforms.seed, (state.worldSeed % 1000) * 0.013);
    gl.uniform1f(uniforms.highQuality, state.zoom >= 0.45 ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    return true;
}
