import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { FOREST_GOODS } from "../../js/world/forest-ecology.js";
import { generateResourceGeography } from "../../js/systems/resource-geography.js";
import {
    deliverForestGoods, forestDeliveryChannel, forestDeliveryAvailability,
    forestGatheringEconomySummary, forestGoodMarketPrice, forestGoodSaleValue,
    forestGoodUseLabel, forestSellAvailability, restoreForestGathering, sellForestGoods,
} from "../../js/systems/forest-gathering.js";

function setup(stock = {}, withGeography = false) {
    resetState();
    if (withGeography) {
        state.worldSeed = 20261125;
        state.worldW = 48;
        state.worldH = 48;
        state.terrainResolution = 2;
        state.terrainPixW = 96;
        state.terrainPixH = 96;
        state.worldOptions = { landmass: 50, ruggedness: 55, forests: 70, water: 48, climate: "temperate" };
        state.heightMap = new Float32Array(96 * 96).fill(0.7);
        state.moistureMap = new Float32Array(96 * 96).fill(0.8);
        state.temperatureMap = new Float32Array(96 * 96).fill(0.55);
        generateResourceGeography(state.worldSeed);
    }
    restoreForestGathering({
        version: 1,
        stock,
        totalGathered: { ...stock },
        quality: {},
        history: [],
        lastGather: {},
    });
    const building = {
        id: "lumber-economy", type: TYPE.LUMBER, x: 10, y: 10, dead: false,
        construction: { stage: 3, progress: 100 }, isBuilding: () => true,
    };
    state.entities = [building];
    return building;
}

test("every catalogued forest good has a real use, a delivery path and a market quote", () => {
    setup();
    const ids = Object.keys(FOREST_GOODS);
    assert.equal(ids.length, 260, "the forest catalogue is the audit population");
    for (const id of ids) {
        const good = FOREST_GOODS[id];
        assert.ok(forestDeliveryChannel(id), id + " must not be stranded without a delivery path");
        assert.ok(forestGoodMarketPrice(id) > 0, id + " must carry a positive market quote");
        assert.ok(forestGoodUseLabel(id), id + " must tell the player what it is for");
    }
    assert.equal(forestDeliveryChannel("honey"), "food");
    assert.equal(forestDeliveryChannel("acorns"), "gold");
    assert.equal(forestDeliveryChannel("timber"), "wood");
    assert.equal(forestGoodUseLabel("honey"), "food / market");
    assert.equal(forestGoodUseLabel("acorns"), "pannage / market");
    assert.equal(forestGoodUseLabel("timber"), "logs → planks");
    assert.ok(forestGoodMarketPrice("honey") > forestGoodMarketPrice("acorns"));
});

test("selling non-timber forest goods pays the quoted gold and leaves timber for the yard", () => {
    const building = setup({ honey: 2, acorns: 3, herbs: 1, timber: 4, firewood: 1 });
    const beforeGold = Number(state.resources.gold) || 0;
    const preview = forestSellAvailability(building);
    assert.equal(preview.ok, true);
    assert.equal(preview.available, 6);
    assert.equal(preview.gold, forestGoodSaleValue("honey", 2) + forestGoodSaleValue("acorns", 3)
        + forestGoodSaleValue("herbs", 1));
    assert.match(preview.summary, /Honey/);
    const summary = forestGatheringEconomySummary();
    assert.match(summary, /food \/ market/);
    assert.match(summary, /pannage \/ market/);
    assert.match(summary, /market quote/);

    const result = sellForestGoods(building);
    assert.equal(result.ok, true);
    assert.equal(result.total, 6);
    assert.equal(result.gold, preview.gold);
    assert.equal(Number(state.resources.gold) || 0, beforeGold + result.gold);
    assert.equal(state.forestGathering.stock.honey, 0);
    assert.equal(state.forestGathering.stock.acorns, 0);
    assert.equal(state.forestGathering.stock.herbs, 0);
    assert.equal(state.forestGathering.stock.timber, 4, "timber must stay available for logs and planks");
    assert.equal(state.forestGathering.stock.firewood, 1);
    assert.ok(result.goods.every(good => good.value > 0 && good.label && good.use));
    assert.equal(forestSellAvailability(building).ok, false, "a second sale has no market goods left");
});

test("delivery pays the individual quote for market goods and reports the real gold delta", () => {
    const building = setup({ herbs: 2, acorns: 1, timber: 1 }, true);
    const beforeGold = Number(state.resources.gold) || 0;
    const availability = forestDeliveryAvailability(building);
    assert.equal(availability.available, 4);
    assert.equal(availability.wood, 1);
    assert.ok(availability.gold > 0);
    assert.match(availability.summary, /timber\/fuel/);
    assert.match(availability.summary, /market/);

    const result = deliverForestGoods(building);
    assert.equal(result.ok, true);
    assert.ok(result.delivered.gold > 0);
    assert.equal(Number(state.resources.gold) || 0, beforeGold + result.delivered.gold);
    const goldGoods = result.goods.filter(good => good.to === "gold");
    assert.ok(goldGoods.length >= 2);
    assert.equal(goldGoods.reduce((sum, good) => sum + good.value, 0), result.delivered.gold);
    assert.equal(state.forestGathering.stock.herbs, 0);
    assert.equal(state.forestGathering.stock.acorns, 0);
    assert.equal(state.forestGathering.stock.timber, 0);
});
