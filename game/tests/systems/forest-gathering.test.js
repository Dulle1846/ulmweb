import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { generateResourceGeography, getResourceNodeAt } from "../../js/systems/resource-geography.js";
import {
    ensureForestGathering, forestGatheringSummary, forestProductsAt, gatherForestProducts,
    gatherNearestForestProducts, restoreForestGathering, serializeForestGathering, validateForestGatheringSnapshot,
    FOREST_GATHERING_LIMITS,
} from "../../js/systems/forest-gathering.js";

function setup(seed = 20261108) {
    resetState();
    state.worldSeed = seed;
    state.worldW = 48;
    state.worldH = 48;
    state.terrainResolution = 2;
    state.terrainPixW = 96;
    state.terrainPixH = 96;
    state.worldOptions = { landmass: 50, ruggedness: 55, forests: 70, water: 48, climate: "temperate" };
    state.heightMap = new Float32Array(96 * 96).fill(0.7);
    state.moistureMap = new Float32Array(96 * 96).fill(0.8);
    state.temperatureMap = new Float32Array(96 * 96).fill(0.55);
    generateResourceGeography(seed);
}

function findForestWithGoods() {
    for (let y = 2; y < state.worldH - 2; y++) {
        for (let x = 2; x < state.worldW - 2; x++) {
            const node = getResourceNodeAt(x, y);
            if (!node?.forestCapacity || !node.forestStock) continue;
            const products = forestProductsAt(x, y, 250);
            if (products?.goods.length) return { x, y, node, products };
        }
    }
    return null;
}

test("forest products are read from the same real stand as the renderer", () => {
    setup();
    const tile = findForestWithGoods();
    assert.ok(tile, "a generated forest tile should expose seasonal goods");
    assert.ok(tile.products.goods.some(good => good.id === "timber" || good.id === "firewood"));
    assert.ok(tile.products.goods.some(good => ["mushrooms", "berries", "acorns", "beechnuts", "chestnuts", "herbs"].includes(good.id)));
    assert.ok(tile.products.stand.ground.compaction >= 0 && tile.products.stand.ground.compaction <= 1);
});

test("gathering is seasonal, bounded and cannot repeat on the same day", () => {
    setup();
    const tile = findForestWithGoods();
    assert.ok(tile);
    const first = gatherForestProducts(tile.x, tile.y, { dayOfYear: 250, year: 1 });
    assert.equal(first.ok, true);
    assert.ok(first.total > 0);
    assert.ok(first.goods.every(good => good.amount > 0));
    assert.match(forestGatheringSummary(), /[A-Za-z]/);
    const repeated = gatherForestProducts(tile.x, tile.y, { dayOfYear: 250, year: 1 });
    assert.equal(repeated.ok, false);
    assert.match(repeated.reason, /already gathered/);
    const nextDay = gatherForestProducts(tile.x, tile.y, { dayOfYear: 251, year: 1 });
    assert.equal(nextDay.ok, true);
    const ledger = ensureForestGathering();
    assert.ok(Object.values(ledger.stock).every(value => Number.isInteger(value) && value >= 0));
    assert.ok(ledger.history.length <= FOREST_GATHERING_LIMITS.maxHistory);
});

test("forest gathering round-trips through validated save data", () => {
    setup();
    const tile = findForestWithGoods();
    assert.ok(tile);
    gatherForestProducts(tile.x, tile.y, { dayOfYear: 250, year: 3 });
    const snapshot = serializeForestGathering();
    assert.equal(snapshot.version, 1);
    assert.ok(Object.keys(snapshot.stock).length > 0);
    assert.equal(validateForestGatheringSnapshot(snapshot), true);
    const expected = JSON.stringify(snapshot);
    setup();
    restoreForestGathering(snapshot);
    assert.equal(JSON.stringify(serializeForestGathering()), expected);
    assert.equal(restoreForestGathering(null), 0);
    assert.throws(() => validateForestGatheringSnapshot({ version: 2, stock: {} }), /forest-gathering/);
    assert.throws(() => validateForestGatheringSnapshot({ version: 1, stock: { timber: -1 } }), /forest product stock/);
});

test("a lumber yard can gather from the nearest real forest node", () => {
    setup();
    const tile = findForestWithGoods();
    assert.ok(tile);
    const result = gatherNearestForestProducts(tile.x + 3, tile.y + 3, 7);
    assert.equal(result.ok, true);
    assert.ok(result.goods.length > 0);
});
