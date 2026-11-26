import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { createMarketState, updateMarket } from "../../js/systems/market.js";
import { getHousingSnapshot } from "../../js/systems/population.js";
import { updateServices } from "../../js/systems/settlement.js";
import { setAuditOpening, readAuditTotals } from "../../js/systems/goods-book.js";
import { ensureInventory, getGoodsAudit, getPhysicalStock } from "../../js/systems/logistics.js";
import {
    COMMISSARY_FOOD_GOODS, COMMISSARY_FOOD_KEYS, CROWN_SUPPLY_VERSION,
    createCrownSupplyState, ensureCrownSupply,
    getCrownAnnualFoodDemand,
    getCrownGrainTarget,
    getCrownReserveYears,
    getCrownSupplySnapshot,
    getCrownWaterCoverage,
    normalizeCrownSupplyState,
    provisionGranary,
    requisitionGranary,
    setGrainContract,
    setWaterworks,
    settleCrownSupply,
    upgradeHousingStock
} from "../../js/systems/crown-supply.js";

function fixture() {
    resetState();
    state.hasStarted = true;
    state.year = 10;
    state.tick = 4000;
    state.resources = { wood: 500, stone: 500, gold: 2000, food: 10 };
    state.market = createMarketState();
    for (const partner of state.market.partners) partner.stock.food = 500;
    state.diplomacy = { realms: [], history: [] };
    state.entities = [{
        id: "house-1",
        type: TYPE.HOUSE,
        x: 10,
        y: 10,
        dead: false,
        hp: 100,
        maxHp: 100,
        occupants: 1,
        construction: { stage: 3 },
        isBuilding: () => true
    }, {
        id: "villager-1",
        type: TYPE.VILLAGER,
        x: 10,
        y: 10,
        dead: false,
        home: { x: 10, y: 10 },
        isBuilding: () => false
    }];
    return state.entities[0];
}

function addResidents(count, type = TYPE.VILLAGER) {
    const start = state.entities.length;
    for (let index = 0; index < count; index++) {
        state.entities.push({
            id: (type === TYPE.VILLAGER ? "villager-" : "guard-") + (start + index),
            type,
            x: 10,
            y: 10,
            dead: false,
            isBuilding: () => false
        });
    }
}

test("an old save without crown supply receives safe defaults", () => {
    resetState();
    const supply = ensureCrownSupply();
    assert.equal(supply.version, 2);
    assert.equal(supply.grainLevel, 0);
    assert.equal(supply.lastGrainSeason, 0);
    assert.equal(supply.waterworksLevel, 0);
    const normalized = normalizeCrownSupplyState({ grainLevel: 99, waterworksLevel: -4, history: "invalid" });
    assert.equal(normalized.grainLevel, 4);
    assert.equal(normalized.waterworksLevel, 0);
    assert.deepEqual(normalized.history, []);
});

test("a grain contract refills the reserve from open trade partners", () => {
    fixture();
    const beforeGold = state.resources.gold;
    const result = setGrainContract(2);
    assert.equal(result.ok, true);
    assert.ok(state.resources.food > 200, "contract did not buy a meaningful reserve");
    assert.ok(state.resources.gold < beforeGold, "grain was not paid for in gold");
    const snapshot = getCrownSupplySnapshot();
    assert.equal(snapshot.grainLevel, 2);
    assert.equal(snapshot.grainActive, true);
    assert.ok(snapshot.grainPartners >= 1);

    // The contract must keep buying in later years, not only on signing.
    state.resources.food = 0;
    state.resources.gold = 2000;
    state.year = 11;
    state.tick = 4400;
    const annual = settleCrownSupply();
    assert.ok(annual.grainBought > 0, "annual grain settlement bought nothing");
    assert.ok(state.resources.food > 0);
});

test("a regional contract delivers at the new year, not in every season", () => {
    fixture();
    assert.equal(setGrainContract(2).ok, true);
    state.resources.food = 0;
    state.resources.gold = 2000;
    state.year = 10;
    state.seasonIndex = 1;
    state.tick = 4100;
    const midyear = settleCrownSupply();
    assert.equal(midyear?.grainBought || 0, 0, "a regional contract must not deliver mid-year");
    state.year = 11;
    state.seasonIndex = 0;
    state.tick = 4400;
    const annual = settleCrownSupply();
    assert.ok(annual.grainBought > 0, "annual shipment bought nothing");
});

test("the war granary receives a shipment in every season", () => {
    fixture();
    assert.equal(setGrainContract(4).ok, true);
    state.resources.food = 0;
    state.resources.gold = 2000;
    state.year = 10;
    state.seasonIndex = 1;
    state.tick = 4100;
    const seasonal = settleCrownSupply();
    assert.ok(seasonal.grainBought > 0, "war granary seasonal shipment bought nothing");
});

test("the war granary target covers two years of real annual demand", () => {
    fixture();
    addResidents(45);
    addResidents(8, TYPE.GUARD);
    const demand = getCrownAnnualFoodDemand();
    assert.equal(demand, 46 * 6 + 8 * 2);
    const target = getCrownGrainTarget(4);
    assert.ok(target >= demand * 2, "war granary target did not cover two years");
    assert.ok(getCrownReserveYears(target) >= 2);
    const snapshot = getCrownSupplySnapshot();
    assert.equal(snapshot.annualDemand, demand);
    assert.ok(snapshot.commissary.keep.wood >= 600);
});

test("the commissary sells only surplus goods and fills the war granary", () => {
    fixture();
    addResidents(45);
    addResidents(8, TYPE.GUARD);
    state.entities.push({
        id: "farm-1",
        type: TYPE.FARM,
        x: 10,
        y: 10,
        dead: false,
        construction: { stage: 3 },
        isBuilding: () => true,
        inventory: { version: 2, input: {}, output: { grain: 400 }, reservedIn: {}, reservedOut: {} }
    });
    state.resources.wood = 2000;
    state.resources.stone = 2000;
    state.resources.gold = 0;
    state.resources.food = 10;
    assert.equal(setGrainContract(4).ok, true);
    const before = { wood: state.resources.wood, stone: state.resources.stone };
    const result = provisionGranary();
    assert.equal(result.ok, true);
    assert.ok(result.bought > 0, "the commissary bought no grain");
    assert.ok(result.bartered > 0, "the commissary did not barter surplus goods for grain");
    assert.equal(result.requisitioned, 400, "the commissary did not call in the stored harvest");
    assert.ok(state.resources.food > 300, "the commissary bought no meaningful reserve");
    assert.ok(state.resources.wood >= 600, "the commissary consumed the timber reserve");
    assert.ok(state.resources.stone >= 600, "the commissary consumed the stone reserve");
    assert.ok(state.resources.wood < before.wood || state.resources.stone < before.stone);
    assert.ok(getCrownReserveYears() >= 1, "the market purchase covers less than one year");
});

test("the commissary can barter for grain at a regional contract", () => {
    fixture();
    assert.equal(setGrainContract(2).ok, true);
    for (const partner of state.market.partners) partner.stock.food = 0;
    state.resources.food = 10;
    state.resources.gold = 0;
    state.resources.wood = 2000;
    state.resources.stone = 2000;
    const result = provisionGranary();
    assert.ok(result.bartered > 0, "regional commissary did not barter goods for grain");
    assert.ok(state.resources.food >= 240, "regional reserve was not filled");
    assert.ok(state.resources.wood >= 600 && state.resources.stone >= 600, "regional construction reserve was consumed");
});
test("grain purchases preserve the garrison payroll reserve", () => {
    fixture();
    state.resources.gold = 200;
    for (let index = 0; index < 10; index++) {
        state.entities.push({ id: "guard-" + index, type: TYPE.GUARD, x: 12, y: 12, dead: false, isBuilding: () => false });
    }
    const result = setGrainContract(3);
    assert.equal(result.ok, true);
    assert.ok(state.resources.gold >= 140, "grain contract consumed the garrison payroll");
});

test("trade partners restock food after repeated purchases", () => {
    fixture();
    for (const partner of state.market.partners) partner.stock.food = 0;
    state.market.lastUpdateTick = 0;
    state.tick = 500;
    updateMarket();
    assert.ok(state.market.partners.some(partner => partner.stock.food > 0));
});

test("paid waterworks cover occupied homes and stop when the payroll fails", () => {
    const house = fixture();
    const water = setWaterworks(2);
    assert.equal(water.ok, true);
    updateServices();
    assert.ok(getCrownWaterCoverage() >= 0.6);
    assert.ok(state.city.services.summary.water > 0.4, "waterworks did not reach the occupied home");
    assert.equal(state.city.services.byHouse[house.id].waterSource, "crown-waterworks");

    state.resources.gold = 0;
    state.year = 11;
    state.tick = 4400;
    settleCrownSupply();
    assert.equal(getCrownWaterCoverage(), 0);
    assert.equal(getCrownSupplySnapshot().waterworksActive, false);
});

test("crown supply history keeps the settlement tick across normalization", () => {
    const normalized = normalizeCrownSupplyState({
        history: [{ year: 7, tick: 2777, grainLevel: 2, grainBought: 10, grainCost: 12, waterworksLevel: 1, waterworksCost: 18, housingUpgrades: 0 }]
    });
    assert.equal(normalized.history[0].tick, 2777);
});

test("a timber cottage can be rebuilt in stone for two more places", () => {
    const house = fixture();
    const before = getHousingSnapshot();
    const result = upgradeHousingStock();
    assert.equal(result.ok, true);
    assert.equal(house.type, TYPE.STONE_HOUSE);
    const after = getHousingSnapshot();
    assert.equal(after.capacity, before.capacity + 2);
    assert.equal(getCrownSupplySnapshot().stoneHouses, 1);
});

function addStore(id, stock) {
    const store = { id, type: TYPE.WAREHOUSE, x: 30, y: 30, dead: false, construction: { stage: 3 }, isBuilding: () => true };
    state.entities.push(store);
    ensureInventory(store);
    for (const [good, quantity] of Object.entries(stock)) store.warehouse.stored[good] = quantity;
    return store;
}

function addOutput(id, type, stock) {
    const building = { id, type, x: 40, y: 30, dead: false, construction: { stage: 3 }, isBuilding: () => true };
    state.entities.push(building);
    ensureInventory(building);
    for (const [good, quantity] of Object.entries(stock)) building.inventory.output[good] = quantity;
    return building;
}

function openAudit() {
    const opening = { food: state.resources.food };
    for (const good of COMMISSARY_FOOD_KEYS) opening[good] = getPhysicalStock(good);
    setAuditOpening(opening);
}

test("the commissary calls in real stored food goods before spending materials", () => {
    fixture();
    assert.equal(setGrainContract(2).ok, true);
    state.resources.food = 10;
    state.resources.gold = 0;
    state.resources.wood = 500;
    state.resources.stone = 500;
    for (const partner of state.market.partners) partner.stock.food = 0;
    const store = addStore("store-1", { grain: 20, flour: 30, bread: 40 });
    const mill = addOutput("mill-1", TYPE.MILL, { flour: 5 });
    const bakery = addOutput("bakery-1", TYPE.BAKERY, { bread: 4 });
    openAudit();
    const before = COMMISSARY_FOOD_KEYS.map(good => readAuditTotals(good, "good").consumed);
    const foodBefore = readAuditTotals("food", "resource").produced;
    const result = provisionGranary();
    assert.equal(result.ok, true, "99 food from real stores must count as provisioning the granary");
    assert.equal(result.bought, 0, "no market grain was available");
    assert.equal(result.bartered, 0, "no material should be bartered while real food is held");
    assert.equal(result.requisitioned, 99, "20 grain + 35 flour + 44 bread become food");
    assert.deepEqual(result.byGood, { grain: 20, flour: 35, bread: 44 });
    assert.equal(state.resources.food, 109);
    assert.equal(store.warehouse.stored.grain, 0);
    assert.equal(store.warehouse.stored.flour, 0);
    assert.equal(store.warehouse.stored.bread, 0);
    assert.equal(mill.inventory.output.flour, 0);
    assert.equal(bakery.inventory.output.bread, 0);
    assert.equal(state.resources.wood, 500);
    assert.equal(state.resources.stone, 500);
    assert.equal(getGoodsAudit().balanced, true, "both sides of every requisition must be booked");
    for (const [index, good] of COMMISSARY_FOOD_KEYS.entries()) {
        assert.equal(getPhysicalStock(good), 0, good + " must leave the physical economy");
        assert.equal(readAuditTotals(good, "good").consumed - before[index], result.byGood[good]);
    }
    assert.equal(readAuditTotals("food", "resource").produced - foodBefore, 99);
    assert.equal(CROWN_SUPPLY_VERSION, 2);
});

test("requisition respects carrier reservations and never double-books inside one tick", () => {
    fixture();
    assert.equal(setGrainContract(2).ok, true);
    state.resources.food = 10;
    state.tick = 4001;
    const store = addStore("store-r", { grain: 10 });
    store.warehouse.reservedOut.grain = 4;
    openAudit();
    const first = requisitionGranary();
    assert.equal(first.requisitioned, 6, "reserved grain is not available to the crown");
    assert.equal(store.warehouse.stored.grain, 4);
    assert.equal(store.warehouse.reservedOut.grain, 4, "a carrier claim is untouched");
    const second = requisitionGranary();
    assert.equal(second.requisitioned, 0, "the same tick cannot call in unreserved stock twice");
    assert.equal(readAuditTotals("grain", "good").consumed, 6);
    const bookings = state.city.logistics.ledger.filter(entry => entry.cause === "crown-requisition");
    assert.equal(bookings.length, 2, "one grain booking and one food booking, no duplicate");
    assert.equal(getGoodsAudit().balanced, true);
});

test("without a grain contract the commissary leaves stores and the save shape alone", () => {
    fixture();
    const store = addStore("store-idle", { grain: 20, flour: 20, bread: 20 });
    openAudit();
    assert.deepEqual(COMMISSARY_FOOD_GOODS, { grain: 1, flour: 1, bread: 1 });
    assert.deepEqual(requisitionGranary(), { requisitioned: 0, byGood: { grain: 0, flour: 0, bread: 0 } });
    assert.equal(store.warehouse.stored.grain, 20);
    assert.equal(store.warehouse.stored.flour, 20);
    assert.equal(store.warehouse.stored.bread, 20);
    assert.deepEqual(Object.keys(ensureCrownSupply()).sort(), Object.keys(createCrownSupplyState()).sort());
    assert.equal(CROWN_SUPPLY_VERSION, 2);
    assert.equal(getCrownSupplySnapshot().commissary.foodGoods.grain, 20);
    assert.equal(getCrownSupplySnapshot().commissary.foodGoods.bread, 20);
});
