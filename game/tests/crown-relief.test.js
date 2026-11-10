import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../js/core/state.js";
import { TYPE } from "../js/core/types.js";
import { spawnEntity } from "../js/world/entities.js";
import { getPopulationGrowthGate } from "../js/systems/population.js";
import { getCrownReliefOffer, applyCrownRelief } from "../js/systems/crown-relief.js";

beforeEach(() => {
    resetState();
    state.year = 2;
    state.tick = 400;
    state.morale = 80;
    state.resources = { wood: 600, stone: 600, gold: 500, food: 100 };
});

function houseAndVillager() {
    const house = spawnEntity(40, 40, TYPE.HOUSE);
    const villager = spawnEntity(41, 40, TYPE.VILLAGER);
    return { house, villager };
}

test("a water gate offers and applies a costed waterworks upgrade", () => {
    houseAndVillager();
    state.city = { enabled: true, needs: { summary: { water: 0.2, safety: 1, food: 1, satisfaction: 0.9 } } };
    assert.equal(getPopulationGrowthGate().reason, "No reliable water coverage");
    const offer = getCrownReliefOffer();
    assert.equal(offer.kind, "water");
    assert.equal(offer.cost, 35);
    assert.equal(offer.available, true);
    const result = applyCrownRelief();
    assert.equal(result.ok, true);
    assert.equal(state.crownSupply.waterworksLevel, 1);
    assert.equal(state.resources.gold, 465);
});

test("a full housing gate offers a stone-house upgrade instead of a free bed", () => {
    const house = spawnEntity(40, 40, TYPE.HOUSE);
    for (let index = 0; index < 4; index++) spawnEntity(41 + index, 40, TYPE.VILLAGER);
    state.city = { enabled: true, needs: { summary: { water: 1, safety: 1, food: 1, satisfaction: 1 } } };
    assert.equal(getPopulationGrowthGate().reason, "No free housing");
    const offer = getCrownReliefOffer();
    assert.equal(offer.kind, "housing");
    assert.equal(offer.cost, 55);
    const result = applyCrownRelief();
    assert.equal(result.ok, true);
    assert.equal(house.type, TYPE.STONE_HOUSE);
    assert.equal(state.resources.gold, 445);
});

test("a safety gate has no purchasable shortcut", () => {
    houseAndVillager();
    state.city = { enabled: true, needs: { summary: { water: 1, safety: 0.1, food: 1, satisfaction: 1 } } };
    assert.equal(getPopulationGrowthGate().reason, "Local safety is too low");
    assert.equal(getCrownReliefOffer(), null);
    const result = applyCrownRelief();
    assert.equal(result.ok, false);
    assert.equal(result.reason, "no-crown-relief-available");
});
