// Baked height occlusion for the WebGL terrain layer.
//
// The shader has no cheap way to see whether a point sits in a hollow, on a
// ridge or in the open: a per-fragment horizon scan would cost dozens of height
// fetches. The occlusion term is therefore baked once per world from the same
// smoothed height field the shader reconstructs, and sampled as a single byte.
//
// The module is DOM-free so it can be unit tested in Node.

export const OCCLUSION_DEFAULTS = Object.freeze({
    // Texel radii. The terrain grid stores 2-5 samples per tile, so these reach
    // roughly half a tile and one and a half tiles.
    radii: Object.freeze([2, 5]),
    strength: 1.35,
});

const DIRECTIONS = Object.freeze([
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [Math.SQRT1_2, Math.SQRT1_2], [-Math.SQRT1_2, Math.SQRT1_2],
    [Math.SQRT1_2, -Math.SQRT1_2], [-Math.SQRT1_2, -Math.SQRT1_2],
]);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function buildHeightOcclusion(heights, width, height, options = {}) {
    if (!heights || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        throw new Error("A height field and positive dimensions are required.");
    }
    const columns = Math.floor(width);
    const rows = Math.floor(height);
    const radii = Array.isArray(options.radii) && options.radii.length ? options.radii : OCCLUSION_DEFAULTS.radii;
    const strength = Number.isFinite(Number(options.strength)) ? Number(options.strength) : OCCLUSION_DEFAULTS.strength;
    const bytes = new Uint8Array(columns * rows);

    const sample = (x, y) => heights[clamp(y, 0, rows - 1) * columns + clamp(x, 0, columns - 1)];

    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < columns; x++) {
            const center = sample(x, y);
            let occlusion = 0;
            for (const [dx, dy] of DIRECTIONS) {
                for (let index = 0; index < radii.length; index++) {
                    const radius = Math.max(1, radii[index] | 0);
                    const neighbour = sample(Math.round(x + dx * radius), Math.round(y + dy * radius));
                    const rise = neighbour - center;
                    // Near neighbours occlude more than distant ones.
                    if (rise > 0) occlusion += rise / (1 + index * 0.6);
                }
            }
            const open = clamp(1 - occlusion * strength, 0, 1);
            bytes[y * columns + x] = Math.round(open * 255);
        }
    }
    return bytes;
}
