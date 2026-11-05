import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { createMarketState, updateMarket } from "../../js/systems/market.js";

function runMarket(seed) {
    resetState();
    state.worldSeed = seed;
    state.tick = 90;
    state.seasonIndex = 2;
    state.market = createMarketState();
    updateMarket();
    return {
        prices: { ...state.market.prices },
        trend: { ...state.market.priceTrend },
        history: JSON.parse(JSON.stringify(state.market.priceHistory)),
        draws: state.randomStreams.market || 0
    };
}

test("regional prices and market history are reproducible for the same realm seed", () => {
    const first = runMarket(20261105);
    assert.deepEqual(runMarket(20261105), first);
    assert.deepEqual(runMarket(20261105), first);
    assert.equal(first.draws, 3, "each commodity receives one independent market drift roll");
});
