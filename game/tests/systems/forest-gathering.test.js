import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { generateResourceGeography, getResourceNodeAt } from "../../js/systems/resource-geography.js";
import {
    ensureForestGathering, forestGatheringSummary, forestProductsAt, gatherForestProducts,
    gatherNearestForestProducts, processForestHunt, restoreForestGathering, serializeForestGathering,
    validateForestGatheringSnapshot, FOREST_GATHERING_LIMITS,
} from "../../js/systems/forest-gathering.js";
import { ensureForestFauna } from "../../js/systems/forest-fauna.js";

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

test("reading or serializing a fresh realm does not create a forest ledger", () => {
    setup();
    assert.equal(state.forestGathering, null);
    assert.equal(forestGatheringSummary(), "");
    const snapshot = serializeForestGathering();
    assert.equal(state.forestGathering, null, "serialization must not mutate the live realm");
    assert.deepEqual(snapshot, { version: 1, stock: {}, totalGathered: {}, quality: {}, history: [], lastGather: {} });
});

test("forest products are read from the same real stand as the renderer", () => {
    setup();
    const tile = findForestWithGoods();
    assert.ok(tile, "a generated forest tile should expose seasonal goods");
    assert.ok(tile.products.goods.some(good => good.id === "timber" || good.id === "firewood"));
    assert.ok(tile.products.goods.some(good => good.id.endsWith("-timber")),
        "a stand should expose the timber of its species, not only generic timber");
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
    assert.ok(first.goods.some(good => good.category === "wood"), "the visit should work real timber");
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

test("hunting removes animals from a real herd, raises its pressure and yields quality-tagged goods", () => {
    setup();
    const model = ensureForestFauna();
    const herd = model.herds.find(entry => entry.population >= 2);
    assert.ok(herd, "the test realm must contain a huntable herd");
    const before = herd.population;
    const result = gatherForestProducts(herd.x, herd.y, { dayOfYear: 250, year: 1 });
    assert.equal(result.ok, true);
    assert.ok(result.hunt, "the gather action must report the hunted herd");
    assert.ok(result.hunt.taken >= 1);
    assert.ok(herd.population < before, "the harvest must remove animals from this herd");
    assert.ok(herd.huntingPressure > 0, "the harvest must create hunting pressure");
    assert.ok(["prime", "good", "lean"].includes(result.hunt.quality));
    const ledger = ensureForestGathering();
    assert.ok(ledger.stock.game > 0);
    assert.ok(ledger.quality.game && Object.values(ledger.quality.game).some(value => value > 0));
    assert.match(forestGatheringSummary(), /Wild game/);
});

test("raw wild products can be cured and tanned without losing their quality", () => {
    setup();
    const model = ensureForestFauna();
    const herd = model.herds.find(entry => entry.population >= 2);
    assert.ok(herd);
    const gathered = gatherForestProducts(herd.x, herd.y, { dayOfYear: 250, year: 1 });
    assert.equal(gathered.ok, true);
    const ledger = ensureForestGathering();
    const rawBefore = { game: ledger.stock.game, fur: ledger.stock.fur, hides: ledger.stock.hides };
    const processed = processForestHunt(2, { dayOfYear: 251, year: 1 });
    assert.equal(processed.ok, true);
    assert.ok(ledger.stock.game < rawBefore.game);
    assert.ok(ledger.stock["cured-game"] > 0);
    assert.ok(ledger.stock["tanned-fur"] > 0);
    assert.ok(ledger.stock["cured-hides"] > 0);
    assert.ok(ledger.quality["cured-game"]);
    assert.ok(ledger.quality["tanned-fur"]);
    const snapshot = serializeForestGathering();
    assert.equal(validateForestGatheringSnapshot(snapshot), true);
    setup();
    restoreForestGathering(snapshot);
    assert.deepEqual(serializeForestGathering(), snapshot);
});

test("a lumber yard can gather from the nearest real forest node", () => {
    setup();
    const tile = findForestWithGoods();
    assert.ok(tile);
    const result = gatherNearestForestProducts(tile.x + 3, tile.y + 3, 7);
    assert.equal(result.ok, true);
    assert.ok(result.goods.length > 0);
});
