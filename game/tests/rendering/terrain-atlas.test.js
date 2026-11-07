import test from "node:test";
import assert from "node:assert/strict";
import {
    buildTerrainAtlas, TERRAIN_ATLAS_TILE, TERRAIN_ATLAS_SIZE,
    TERRAIN_ATLAS_COLUMNS, TERRAIN_ATLAS_ROWS,
    TERRAIN_ATLAS_TILES, TERRAIN_ATLAS_MATERIALS,
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
            pixels[y * tile + x] = atlas.data[(py * atlas.size + px) * 4 + channel];
        }
    }
    return pixels;
}

test("terrain atlas is deterministic and stays inside the texture budget", () => {
    const first = buildTerrainAtlas({ fresh: true });
    const second = buildTerrainAtlas({ fresh: true });
    assert.equal(first.size, TERRAIN_ATLAS_SIZE);
    assert.equal(first.data.length, TERRAIN_ATLAS_SIZE * TERRAIN_ATLAS_SIZE * 4);
    assert.ok(first.data.length <= 4 * 1024 * 1024, "atlas must stay below 4 MiB");
    assert.equal(checksum(first.data), checksum(second.data), "the atlas must be reproducible");
    assert.equal(buildTerrainAtlas(), buildTerrainAtlas(), "the cached atlas is reused");
});

test("every terrain material ships two distinct variants", () => {
    const atlas = buildTerrainAtlas();
    assert.equal(TERRAIN_ATLAS_MATERIALS.length, 7);
    assert.equal(TERRAIN_ATLAS_COLUMNS * TERRAIN_ATLAS_ROWS, 16);
    const seen = new Set();
    for (const material of TERRAIN_ATLAS_MATERIALS) {
        const variants = TERRAIN_ATLAS_TILES[material];
        assert.equal(variants.length, 2, material + " needs two variants");
        for (const index of variants) {
            assert.ok(index >= 0 && index < TERRAIN_ATLAS_COLUMNS * TERRAIN_ATLAS_ROWS, material + " tile index in range");
            assert.equal(seen.has(index), false, "tile " + index + " must be used once");
            seen.add(index);
        }
        assert.notEqual(checksum(tileChannel(atlas, variants[0], 0)), checksum(tileChannel(atlas, variants[1], 0)),
            material + " variants must not be identical");
    }
});

test("every used tile carries surface detail instead of a flat wash", () => {
    const atlas = buildTerrainAtlas();
    for (const material of TERRAIN_ATLAS_MATERIALS) {
        for (const index of TERRAIN_ATLAS_TILES[material]) {
            const pixels = tileChannel(atlas, index, 0);
            let sum = 0;
            for (const value of pixels) sum += value;
            const mean = sum / pixels.length;
            let variance = 0;
            for (const value of pixels) variance += (value - mean) ** 2;
            variance /= pixels.length;
            assert.ok(variance > 90, material + " tile " + index + " detail variance " + variance.toFixed(1));
        }
    }
});

test("tiles wrap without a visible border seam", () => {
    const atlas = buildTerrainAtlas();
    const tile = TERRAIN_ATLAS_TILE;
    for (const material of TERRAIN_ATLAS_MATERIALS) {
        for (const index of TERRAIN_ATLAS_TILES[material]) {
            const pixels = tileChannel(atlas, index, 0);
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
                material + " tile " + index + " wraps seamlessly (seam " + seam.toFixed(2) + " vs interior " + interior.toFixed(2) + ")");
        }
    }
});

test("reserved atlas slots stay neutral and every pixel is opaque", () => {
    const atlas = buildTerrainAtlas();
    for (const index of [14, 15]) {
        const pixels = tileChannel(atlas, index, 0);
        for (const value of pixels) assert.equal(value, 128);
    }
    for (let offset = 3; offset < atlas.data.length; offset += 4) {
        if (atlas.data[offset] !== 255) assert.fail("atlas alpha must stay opaque at byte " + offset);
    }
});
