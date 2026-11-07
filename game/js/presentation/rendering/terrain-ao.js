// Baked height occlusion for the WebGL terrain layer.
//
// The shader has no cheap way to see whether a point sits in a hollow, on a
// ridge or in the open: a per-fragment horizon scan would cost dozens of height
// fetches. The occlusion term is therefore baked once per world from the same
// smoothed height field the shader reconstructs, and sampled as a single byte.
//
// The bake runs on the main thread when a realm loads, so it is written as a
// flat loop over precomputed offsets and can run at half resolution: the term
// is low frequency and the shader filters it bilinearly anyway.
//
// The module is DOM-free so it can be unit tested in Node.

export const OCCLUSION_DEFAULTS = Object.freeze({
    // Texel radii. The terrain grid stores 2-5 samples per tile, so these reach
    // roughly half a tile and one and a half tiles.
    radii: Object.freeze([2, 5]),
    strength: 1.35,
    stride: 1,
});

const DIRECTIONS = Object.freeze([
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [Math.SQRT1_2, Math.SQRT1_2], [-Math.SQRT1_2, Math.SQRT1_2],
    [Math.SQRT1_2, -Math.SQRT1_2], [-Math.SQRT1_2, -Math.SQRT1_2],
]);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function offsetsFor(radii) {
    const offsets = [];
    for (const [dx, dy] of DIRECTIONS) {
        for (let index = 0; index < radii.length; index++) {
            const radius = Math.max(1, Math.trunc(radii[index]) || 1);
            offsets.push({
                x: Math.round(dx * radius),
                y: Math.round(dy * radius),
                // Near neighbours occlude more than distant ones.
                weight: 1 / (1 + index * 0.6),
            });
        }
    }
    return offsets;
}

export function buildHeightOcclusion(heights, width, height, options = {}) {
    if (!heights || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        throw new Error("A height field and positive dimensions are required.");
    }
    const columns = Math.floor(width);
    const rows = Math.floor(height);
    const radii = Array.isArray(options.radii) && options.radii.length ? options.radii : OCCLUSION_DEFAULTS.radii;
    const strength = Number.isFinite(Number(options.strength)) ? Number(options.strength) : OCCLUSION_DEFAULTS.strength;
    const stride = Math.max(1, Math.floor(Number(options.stride) || OCCLUSION_DEFAULTS.stride));
    const outColumns = Math.ceil(columns / stride);
    const outRows = Math.ceil(rows / stride);
    const bytes = new Uint8Array(outColumns * outRows);
    const offsets = offsetsFor(radii);

    for (let outY = 0; outY < outRows; outY++) {
        const y = outY * stride;
        const row = y * columns;
        for (let outX = 0; outX < outColumns; outX++) {
            const x = outX * stride;
            const center = heights[row + x];
            let occlusion = 0;
            for (let index = 0; index < offsets.length; index++) {
                const offset = offsets[index];
                const nx = x + offset.x;
                const ny = y + offset.y;
                if (nx < 0 || nx >= columns || ny < 0 || ny >= rows) continue;
                const rise = heights[ny * columns + nx] - center;
                if (rise > 0) occlusion += rise * offset.weight;
            }
            const open = clamp(1 - occlusion * strength, 0, 1);
            bytes[outY * outColumns + outX] = (open * 255 + 0.5) | 0;
        }
    }
    return bytes;
}
