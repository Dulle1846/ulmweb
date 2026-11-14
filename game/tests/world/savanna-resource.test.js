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

test("savanna woodland is real timber but stays open country", () => {
    const previousDocument = globalThis.document;
    globalThis.document = { createElement: () => makeCanvas() };
    try {
        initWorld(20261114, {
            size: "standard", shape: "continent", climate: "savanna",
            water: 34, landmass: 62, fertility: 52, forests: 38,
            mountains: 48, ruggedness: 52,
        });
        const sweep = forestScan();
        assert.ok(sweep.nodes > 20, "a savanna lumber yard needs a real, if sparse, resource");
        assert.ok(sweep.nodes < sweep.cells * 0.06, "savanna must not become a closed woodland");
        assert.equal(sweep.wrongKind, 0);
        assert.equal(sweep.wrongLabel, 0);
        assert.ok(sweep.maximumCapacity <= 90);
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
});

function forestScan() {
    const cells = state.worldW * state.worldH;
    let nodes = 0, wrongKind = 0, wrongLabel = 0, maximumCapacity = 0;
    for (let y = 0; y < state.worldH; y++) {
        for (let x = 0; x < state.worldW; x++) {
            const node = getResourceNodeAt(x, y);
            if (!node?.forestCapacity) continue;
            nodes++;
            maximumCapacity = Math.max(maximumCapacity, node.forestCapacity);
            if (node.forestType !== "savanna-woodland") wrongKind++;
            if (node.forestTypeLabel !== "Savanna Woodland") wrongLabel++;
        }
    }
    return { nodes, cells, wrongKind, wrongLabel, maximumCapacity };
}
