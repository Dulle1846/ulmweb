import test from "node:test";
import assert from "node:assert/strict";
import { TYPE } from "../../js/core/types.js";
import { getCoreCounsel } from "../../js/presentation/core-counsel.js";

function realm(overrides = {}) {
    return {
        hasStarted: true,
        resources: { food: 200, wood: 180, stone: 95, gold: 75 },
        entities: [{ dead: false, type: TYPE.HOUSE }],
        economy: { lastLedger: { foodShortage: 0 } },
        statistics: { totalRoadTilesBuilt: 12 },
        market: { prices: { wood: 2, stone: 3, food: 2 }, partners: [{ stock: { wood: 20, stone: 20, food: 20 } }] },
        hand: [{ id: "card" }],
        morale: 80,
        ...overrides
    };
}

test("core counsel prioritizes food, housing, roads and cards", () => {
    assert.equal(getCoreCounsel(realm({ resources: { food: 20 } })).id, "food");
    assert.equal(getCoreCounsel(realm({ resources: { food: 200 }, entities: [] })).id, "housing");
    assert.equal(getCoreCounsel(realm({ statistics: { totalRoadTilesBuilt: 0 } })).id, "roads");
    assert.equal(getCoreCounsel(realm({ hand: [] })).id, "cards");
});

test("core counsel points to the existing panels and stays quiet once the loop is steady", () => {
    const food = getCoreCounsel(realm({ resources: { food: 20, wood: 180, stone: 95, gold: 75 } }));
    assert.equal(food.panel, "build");
    assert.equal(food.actionLabel, "BUILD");

    const cards = getCoreCounsel(realm({ hand: [] }));
    assert.equal(cards.panel, "cards");
    assert.equal(cards.actionLabel, "OPEN CARDS");

    assert.equal(getCoreCounsel(realm()).id, "steady");
    assert.equal(getCoreCounsel(realm()).panel, "cards");
});

test("core counsel reads the existing food shortage and housing capacity signals", () => {
    assert.equal(getCoreCounsel(realm({
        economy: { lastLedger: { foodShortage: 8 } }
    })).id, "food");

    const villages = Array.from({ length: 4 }, () => ({ dead: false, type: TYPE.VILLAGER }));
    assert.equal(getCoreCounsel(realm({ entities: [...villages, { dead: false, type: TYPE.HOUSE }] })).id, "housing");
});

test("core counsel never recommends an unaffordable farm when the granary is empty", () => {
    const counsel = getCoreCounsel(realm({
        resources: { food: 0, wood: 0, stone: 0, gold: 0 },
        hand: [{ id: "card" }]
    }));
    assert.equal(counsel.id, "food");
    assert.equal(counsel.panel, "cards");
    assert.equal(counsel.actionLabel, "OPEN CARDS");
    assert.match(counsel.text, /open the cards/i);
});

test("core counsel uses the existing market when the granary is empty and food can be bought", () => {
    const counsel = getCoreCounsel(realm({
        resources: { food: 0, wood: 0, stone: 0, gold: 100 },
        hand: [{ id: "card" }]
    }));
    assert.equal(counsel.id, "food");
    assert.equal(counsel.panel, "market");
    assert.equal(counsel.actionLabel, "OPEN MARKET");
    assert.match(counsel.text, /market/i);
});

test("core counsel does not recommend an unaffordable cottage or road", () => {
    const villages = Array.from({ length: 4 }, () => ({ dead: false, type: TYPE.VILLAGER }));
    const housing = getCoreCounsel(realm({
        resources: { food: 200, wood: 0, stone: 0, gold: 0 },
        entities: [...villages, { dead: false, type: TYPE.HOUSE }],
        hand: [{ id: "card" }]
    }));
    assert.equal(housing.id, "housing");
    assert.equal(housing.panel, "cards");

    const roads = getCoreCounsel(realm({
        resources: { food: 200, wood: 0, stone: 0, gold: 0 },
        statistics: { totalRoadTilesBuilt: 0 },
        hand: [{ id: "card" }]
    }));
    assert.equal(roads.id, "roads");
    assert.equal(roads.panel, "cards");
});

test("core counsel does not recommend a step before the realm is founded", () => {
    const counsel = getCoreCounsel({ hasStarted: false });
    assert.equal(counsel.id, "found");
    assert.equal(counsel.panel, null);
});
