import test from "node:test";
import assert from "node:assert/strict";
import {
    buildTerrainAtlas, TERRAIN_ATLAS_TILE, TERRAIN_ATLAS_WIDTH, TERRAIN_ATLAS_HEIGHT,
    TERRAIN_ATLAS_COLUMNS, TERRAIN_ATLAS_ROWS, TERRAIN_ATLAS_VARIANTS,
    TERRAIN_ATLAS_TILES, TERRAIN_ATLAS_MATERIALS, TERRAIN_ATLAS_NEUTRAL_TILES,
} from "../../js/presentation/rendering/terrain-atlas.js";

function checksum(data) {
    let hash = 2166136261 >>> 0;
    for (const byte of data) {
        hash ^= byte;
        hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash;
}

function tileChannel(atlas, index, channel) {
    const tile = TERRAIN_ATLAS_TILE;
    const column = index % TERRAIN_ATLAS_COLUMNS;
    const row = Math.floor(index / TERRAIN_ATLAS_COLUMNS);
    const pixels = new Float32Array(tile * tile);
    for (let y = 0; y < tile; y++) {
        for (let x = 0; x < tile; x++) {
            const px = column * tile + x;
            const py = row * tile + y;
            pixels[y * tile + x] = atlas.data[(py * atlas.width + px) * 4 + channel];
        }
    }
    return pixels;
}

test("terrain atlas is deterministic and stays inside the texture budget", () => {
    const first = buildTerrainAtlas({ fresh: true });
    const second = buildTerrainAtlas({ fresh: true });
    assert.equal(first.width, TERRAIN_ATLAS_WIDTH);
    assert.equal(first.height, TERRAIN_ATLAS_HEIGHT);
    assert.equal(first.data.length, TERRAIN_ATLAS_WIDTH * TERRAIN_ATLAS_HEIGHT * 4);
    assert.ok(first.data.length <= 8 * 1024 * 1024, "atlas must stay at or below 8 MiB");
    assert.equal(checksum(first.data), checksum(second.data), "the atlas must be reproducible");
    assert.equal(buildTerrainAtlas(), buildTerrainAtlas(), "the cached atlas is reused");
});

test("every terrain material ships four distinct, contiguous variants", () => {
    const atlas = buildTerrainAtlas();
    assert.equal(TERRAIN_ATLAS_MATERIALS.length, 7);
    assert.equal(TERRAIN_ATLAS_VARIANTS, 4);
    assert.equal(TERRAIN_ATLAS_COLUMNS * TERRAIN_ATLAS_ROWS, 32);
    const seen = new Set();
    for (const material of TERRAIN_ATLAS_MATERIALS) {
        const variants = TERRAIN_ATLAS_TILES[material];
        assert.equal(variants.length, TERRAIN_ATLAS_VARIANTS, material + " needs four variants");
        assert.equal(variants[0] % TERRAIN_ATLAS_VARIANTS, 0, material + " must start on a four-tile block");
        for (let variant = 0; variant < variants.length; variant++) {
            const index = variants[variant];
            assert.equal(index, variants[0] + variant, material + " variants must stay contiguous");
            assert.ok(index >= 0 && index < TERRAIN_ATLAS_COLUMNS * TERRAIN_ATLAS_ROWS, material + " tile index in range");
            assert.equal(seen.has(index), false, "tile " + index + " must be used once");
            seen.add(index);
            if (variant > 0) {
                assert.notEqual(checksum(tileChannel(atlas, variants[0], 0)), checksum(tileChannel(atlas, index, 0)),
                    material + " variants must not be identical");
            }
        }
    }
});

test("every used tile carries surface detail in all three channels", () => {
    const atlas = buildTerrainAtlas();
    for (const material of TERRAIN_ATLAS_MATERIALS) {
        for (const index of TERRAIN_ATLAS_TILES[material]) {
            for (const channel of [0, 1, 2]) {
                const pixels = tileChannel(atlas, index, channel);
                let sum = 0;
                for (const value of pixels) sum += value;
                const mean = sum / pixels.length;
                let variance = 0;
                for (const value of pixels) variance += (value - mean) ** 2;
                variance /= pixels.length;
                assert.ok(variance > 20, material + " tile " + index + " channel " + channel + " variance " + variance.toFixed(1));
            }
        }
    }
});

test("tiles wrap without a visible border seam on every channel", () => {
    const atlas = buildTerrainAtlas();
    const tile = TERRAIN_ATLAS_TILE;
    for (const material of TERRAIN_ATLAS_MATERIALS) {
        for (const index of TERRAIN_ATLAS_TILES[material]) {
            for (const channel of [0, 1, 2]) {
                const pixels = tileChannel(atlas, index, channel);
                let seam = 0;
                for (let y = 0; y < tile; y++) {
                    seam += Math.abs(pixels[y * tile] - pixels[y * tile + tile - 1]);
                }
                seam /= tile;
                let interior = 0;
                for (let y = 0; y < tile; y++) {
                    for (let x = 0; x < tile - 1; x++) {
                        interior += Math.abs(pixels[y * tile + x] - pixels[y * tile + x + 1]);
                    }
                }
                interior /= tile * (tile - 1);
                assert.ok(seam <= interior * 1.6 + 2,
                    material + " tile " + index + " channel " + channel + " wraps seamlessly (seam " + seam.toFixed(2) + " vs interior " + interior.toFixed(2) + ")");
            }
        }
    }
});

test("reserved atlas slots stay neutral and every pixel is opaque", () => {
    const atlas = buildTerrainAtlas();
    for (const index of TERRAIN_ATLAS_NEUTRAL_TILES) {
        for (let channel = 0; channel < 3; channel++) {
            for (const value of tileChannel(atlas, index, channel)) assert.equal(value, 128);
        }
    }
    for (let offset = 3; offset < atlas.data.length; offset += 4) {
        if (atlas.data[offset] !== 255) assert.fail("atlas alpha must stay opaque at byte " + offset);
    }
});
