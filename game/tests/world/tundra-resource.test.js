import test from "node:test";
import assert from "node:assert/strict";
import { getResourceNodeAt } from "../../js/systems/resource-geography.js";
import { initWorld } from "../../js/world/world.js";
import { state } from "../../js/core/state.js";

function makeCanvas() {
    const context = {
        createImageData(width, height) {
            return { width, height, data: new Uint8ClampedArray(width * height * 4) };
        },
        putImageData() {},
        clearRect() {},
        fillRect() {},
        drawImage() {},
    };
    return {
        width: 1,
        height: 1,
        style: {},
        getContext() { return context; },
    };
}

test("tundra timber is sparse low scrub, never a closed forest", () => {
    const previousDocument = globalThis.document;
    globalThis.document = { createElement: () => makeCanvas() };
    try {
        initWorld(20261113, {
            size: "standard", shape: "continent", climate: "tundra",
            water: 38, landmass: 60, fertility: 22, forests: 8,
            mountains: 55, ruggedness: 62,
        });
        const sweep = forestScan();
        assert.ok(sweep.nodes > 20, "a tundra lumber yard needs a real, if sparse, resource");
        assert.ok(sweep.nodes < sweep.cells * 0.06, "tundra must not become a woodland");
        assert.equal(sweep.wrongKind, 0);
        assert.equal(sweep.tallForest, 0);
        assert.ok(sweep.maximumCapacity <= 36);
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
});

function forestScan() {
    const cells = state.worldW * state.worldH;
    let nodes = 0, wrongKind = 0, tallForest = 0, maximumCapacity = 0;
    for (let y = 0; y < state.worldH; y++) {
        for (let x = 0; x < state.worldW; x++) {
            const node = getResourceNodeAt(x, y);
            if (!node?.forestCapacity) continue;
            nodes++;
            maximumCapacity = Math.max(maximumCapacity, node.forestCapacity);
            if (node.forestType !== "subalpine-scrub") wrongKind++;
            if (node.forestTypeLabel !== "Subalpine Scrub") tallForest++;
        }
    }
    return { nodes, cells, wrongKind, tallForest, maximumCapacity };
}
