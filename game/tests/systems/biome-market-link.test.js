import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { createMarketState, getTradePartners, updateMarket } from "../../js/systems/market.js";
import {
    getBiomeFrontierSupply, getBiomeMarketQuote, normalizeBiomeFrontierSupply
} from "../../js/systems/biome-market-link.js";

function atlasWith({ woodStock = 80, extraction = 0 } = {}) {
    return {
        seed: 7,
        regions: [{
            id: "frontier-test",
            discovered: true,
            extractionPressure: extraction,
            importCoverage: [],
            resources: [
                { id: "oak", discovered: true, locallyExtinct: false, stock: woodStock, capacity: 100 },
                { id: "granite", discovered: true, locallyExtinct: false, stock: 80, capacity: 100 },
                { id: "wild-grain", discovered: true, locallyExtinct: false, stock: 80, capacity: 100 }
            ]
        }]
    };
}

function setup(options) {
    resetState();
    state.year = 1;
    state.seasonIndex = 1;
    state.biomeAtlas = atlasWith(options);
    state.market = createMarketState();
}

test("surveyed biome stock and extraction set a bounded frontier quote", () => {
    setup({ woodStock: 80, extraction: 0 });
    const steady = getBiomeFrontierSupply().categories.wood;
    assert.equal(steady.known, true);
    assert.equal(steady.stock, 80);
    assert.equal(steady.capacity, 100);
    assert.equal(steady.cover, 0.8);
    assert.equal(steady.pressure, 0);
    assert.equal(steady.priceFactor, 1);

    state.biomeAtlas = atlasWith({ woodStock: 40, extraction: 0.6 });
    const strained = getBiomeFrontierSupply().categories.wood;
    assert.equal(strained.known, true);
    assert.equal(strained.cover, 0.4);
    assert.ok(strained.pressure > 0.4);
    assert.ok(strained.priceFactor > 1.25);
    assert.equal(strained.band, "SCARCE");
});

test("depleting the atlas raises the next market price and saves the same frontier reading", () => {
    setup({ woodStock: 80, extraction: 0 });
    state.tick = 90;
    updateMarket();
    const healthyPrice = state.market.prices.wood;
    const healthyFrontier = { ...state.market.frontierSupply.categories.wood };

    state.biomeAtlas = atlasWith({ woodStock: 40, extraction: 0.6 });
    state.market.lastUpdateTick = 0;
    state.tick = 180;
    updateMarket();
    assert.ok(state.market.prices.wood > healthyPrice, "a tighter frontier must raise the regional price");
    assert.ok(state.market.frontierSupply.categories.wood.priceFactor > healthyFrontier.priceFactor);
    assert.equal(state.market.frontierSupply.categories.wood.band, "SCARCE");

    const saved = JSON.parse(JSON.stringify(state.market));
    state.market = saved;
    state.tick = 200;
    const partners = getTradePartners();
    assert.ok(partners.length > 0);
    assert.deepEqual(state.market.frontierSupply, saved.frontierSupply,
        "the frontier explanation must survive a save/load round-trip unchanged");
});

test("a saved legacy market gains a normalized frontier without losing its quote", () => {
    setup({ woodStock: 80, extraction: 0 });
    state.tick = 90;
    updateMarket();
    const price = state.market.prices.wood;
    const legacy = JSON.parse(JSON.stringify(state.market));
    delete legacy.frontierSupply;
    state.market = legacy;
    state.tick = 100;
    getTradePartners();
    assert.ok(state.market.frontierSupply);
    assert.equal(state.market.frontierSupply.version, 1);
    assert.equal(state.market.prices.wood, price);
    const normalized = normalizeBiomeFrontierSupply(state.market.frontierSupply);
    assert.deepEqual(normalized, state.market.frontierSupply);
});

test("market prices feed back into what stored frontier goods fetch", () => {
    setup();
    state.market.prices.wood = 4;
    const dear = getBiomeMarketQuote("wood");
    assert.equal(dear.market, "wood");
    assert.equal(dear.basePrice, 2);
    assert.ok(dear.factor > 1);

    state.market.prices.wood = 1;
    const cheap = getBiomeMarketQuote("wood");
    assert.ok(cheap.factor < 1);
    assert.equal(getBiomeMarketQuote("herb").factor, 1, "uncoupled biomes keep their existing price");
});

test("frontier readings are deterministic for the same realm and tick", () => {
    function run() {
        setup({ woodStock: 63, extraction: 0.27 });
        state.tick = 90;
        updateMarket();
        return JSON.stringify({
            prices: state.market.prices,
            frontier: state.market.frontierSupply,
            trend: state.market.priceTrend
        });
    }
    const first = run();
    assert.equal(run(), first);
    assert.equal(run(), first);
});
