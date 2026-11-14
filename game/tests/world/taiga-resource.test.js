import test from "node:test";
import assert from "node:assert/strict";
import { initWorld } from "../../js/world/world.js";
import { state } from "../../js/core/state.js";
import { getResourceNodeAt, getForestMovementFactorAt } from "../../js/systems/resource-geography.js";
import { taigaSiteSummaryAt, taigaSiteProfileAt } from "../../js/systems/grassland-use.js";

function makeCanvas() {
    const context = {
        createImageData(width, height) {
            return { width, height, data: new Uint8ClampedArray(width * height * 4) };
        },
        putImageData() {}, clearRect() {}, fillRect() {}, drawImage() {},
    };
    return { width: 1, height: 1, style: {}, getContext() { return context; } };
}

globalThis.document = { createElement: () => makeCanvas() };

const TAIGA_TYPES = new Set(["taiga-spruce", "taiga-pine", "taiga-larch", "taiga-birch", "taiga-mixed"]);
const DISTURBANCES = new Set(["burned", "windthrow", "diseased", "bark-beetle", "snowbreak", "drought-stressed"]);

test("a generated taiga world is a forest world, not a recoloured temperate map", () => {
    initWorld(20261116, {
        size: "standard", shape: "continent", climate: "taiga", water: 46,
        landmass: 58, fertility: 48, forests: 70, mountains: 55, ruggedness: 58,
    });
    assert.equal(state.worldOptions.climate, "taiga");
    let nodes = 0;
    let taigaNodes = 0;
    let maxCapacity = 0;
    let minCapacity = Infinity;
    let generic = 0;
    const types = new Map();
    for (let y = 0; y < state.worldH; y++) {
        for (let x = 0; x < state.worldW; x++) {
            const node = getResourceNodeAt(x, y);
            if (!node?.forestCapacity) continue;
            nodes++;
            assert.ok(Number.isFinite(node.forestCapacity) && node.forestCapacity > 0);
            maxCapacity = Math.max(maxCapacity, node.forestCapacity);
            minCapacity = Math.min(minCapacity, node.forestCapacity);
            assert.ok(node.forestStock >= 0 && node.forestStock <= node.forestCapacity);
            types.set(node.forestType, (types.get(node.forestType) || 0) + 1);
            if (TAIGA_TYPES.has(node.forestType)) {
                taigaNodes++;
                assert.equal(node.forestTypeLabel.includes("Taiga"), true, node.forestType);
            } else if (DISTURBANCES.has(node.forestType)) {
                assert.ok(node.forestTypeLabel.length > 3);
            } else {
                generic++;
            }
        }
    }
    assert.ok(nodes > 500, "a taiga continent needs substantial forest cover");
    assert.ok(taigaNodes / nodes > 0.7, "at least seventy percent of forest nodes keep a taiga identity");
    assert.equal(generic, 0);
    assert.equal(types.has("taiga-spruce"), true);
    assert.equal(types.has("taiga-pine"), true);
    assert.equal(types.has("taiga-larch"), true);
    assert.equal(types.has("taiga-birch"), true);
    assert.equal(types.has("taiga-mixed"), true);
    assert.ok(maxCapacity >= 100);
    assert.ok(minCapacity > 0);
    assert.ok(types.has("snowbreak") || types.has("windthrow"));
});

test("taiga sites expose biome summaries to the shared land-use survey", () => {
    let found = 0;
    for (let y = 0; y < state.worldH && found < 3; y += 3) {
        for (let x = 0; x < state.worldW && found < 3; x += 3) {
            const summary = taigaSiteSummaryAt(x, y);
            if (!summary) continue;
            assert.match(summary, /taiga|spruce|pine|larch|birch|forest|lake|bog/i);
            const profile = taigaSiteProfileAt(x, y);
            assert.equal(profile.taiga, true);
            found++;
        }
    }
    assert.ok(found > 0);
});

test("deep taiga snow slows forest movement without stopping it", () => {
    const originalDay = state.dayOfYear;
    const originalClimate = state.worldOptions.climate;
    try {
        state.worldOptions.climate = "taiga";
        state.dayOfYear = 340;
        const winter = getForestMovementFactorAt(10, 10);
        state.dayOfYear = 140;
        const summer = getForestMovementFactorAt(10, 10);
        assert.ok(winter >= 0.56 && winter <= 1);
        assert.ok(summer >= winter);
    } finally {
        state.dayOfYear = originalDay;
        state.worldOptions.climate = originalClimate;
    }
});
