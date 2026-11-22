// 1.2.20.55–58, 60, 68, 70, 71 — the hazard block is no longer panel data.
//
// The same realm state is measured twice: once with a calm, neutral modifier
// block and once with a real hazard block. Calm values must equal the shipped
// baseline exactly; hazard values must diverge in the systems the player feels.
import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { Entity, TYPE } from "../../js/core/types.js";
import { calculateDailyLedger, getBuildingEfficiency } from "../../js/systems/economy.js";
import { updateConstruction } from "../../js/systems/construction.js";
import { restoreEnvironmentalHazardState } from "../../js/systems/environmental-hazards.js";
import { createMarketState, executeTrade } from "../../js/systems/market.js";
import { spawnEntity } from "../../js/world/entities.js";
import { generateResourceGeography, getResourceNodeAt } from "../../js/systems/resource-geography.js";
import { initializeCityForRealm, getInventorySummary } from "../../js/systems/logistics.js";
import { updateBuildingIncome } from "../../js/simulation/buildings.js";
import { ensureForestFauna, resetForestFauna } from "../../js/systems/forest-fauna.js";
import {
    getHazardExtractionFactor, getHazardFoodDemandFactor, getHazardModifiers,
    getHazardMovementFactor, getHazardPastureCapacityFactor, getHazardSimulationEffects,
    getHazardTradeBuyFactor, getHazardTradeSellFactor, getHazardWorkFactor,
    invalidateHazardModifierCache
} from "../../js/systems/hazard-modifiers.js";

function setModifiers(values = null) {
    state.environmentalHazards = values
        ? { modifiers: { diseaseRisk: 0, work: 0, movement: 0, needs: 0, morale: 0, resistance: 0, adaptation: 0, medical: 0, trade: 0, extraction: 0, pasture: 0, ...values } }
        : null;
    invalidateHazardModifierCache();
}

function workforceFor(building, workers = 1) {
    return {
        workersByBuilding: new Map([[building, workers]]),
        skillByBuilding: new Map([[building, 50]]),
        experienceByBuilding: new Map([[building, 0]])
    };
}

test("1.2.20 hazard multipliers are exactly neutral without an active hazard", () => {
    resetState();
    setModifiers(null);
    const effects = getHazardSimulationEffects();
    assert.deepEqual({ ...getHazardModifiers() }, {
        diseaseRisk: 0, work: 0, movement: 0, needs: 0, morale: 0,
        resistance: 0, adaptation: 0, medical: 0, trade: 0, extraction: 0, pasture: 0
    });
    for (const key of ["foodDemand", "work", "movement", "extraction", "pasture", "tradeBuy", "tradeSell"]) {
        assert.equal(effects[key], 1, key + " must be exactly 1 in calm weather");
    }
    assert.equal(effects.adaptationRelief, 0);

    // The old ledger baseline, unchanged to the last floating-point bit.
    const ledger = calculateDailyLedger({ population: 10, employed: 8, buildings: 12, foodAvailable: 20, goldAvailable: 10 });
    assert.ok(Math.abs(ledger.foodDemand - 3) < 1e-9);
    assert.ok(Math.abs(ledger.foodConsumed - 3) < 1e-9);

    const farm = new Entity(10, 10, TYPE.FARM);
    state.entities = [farm, new Entity(10, 11, TYPE.VILLAGER)];
    assert.equal(getBuildingEfficiency(farm, workforceFor(farm)), 0.5,
        "the existing production baseline must not move");
});

test("1.2.20 a quiet legacy save loads at exactly neutral", () => {
    resetState();
    restoreEnvironmentalHazardState({
        active: [{
            id: "coast-bundle", mechanic: "bundle:coast", label: "Coastal exposure",
            category: "regional", spec: "1.2.20", severity: 0.8, startedYear: 1, effects: {}
        }],
        modifiers: {
            diseaseRisk: 0.4, work: 0.9, movement: 0.9, needs: 0.9, morale: 0,
            resistance: 0, adaptation: 0.2, medical: 0, trade: 0.9, extraction: 0.9, pasture: 0.9
        }
    });
    const effects = getHazardSimulationEffects();
    assert.equal(effects.foodDemand, 1);
    assert.equal(effects.work, 1);
    assert.equal(effects.movement, 1);
    assert.equal(effects.extraction, 1);
    assert.equal(effects.pasture, 1);
    assert.equal(effects.tradeBuy, 1);
    assert.equal(effects.tradeSell, 1);
});

test("1.2.20 an active hazard raises household food and water draw", () => {
    resetState();
    setModifiers({ needs: 0.5, adaptation: 0.4 });
    const factor = getHazardFoodDemandFactor();
    assert.ok(factor > 1, "a hazard must raise demand");
    const calm = calculateDailyLedger({ population: 10, employed: 8, buildings: 12, foodAvailable: 10, goldAvailable: 10 });
    const hazard = calculateDailyLedger({
        population: 10, employed: 8, buildings: 12, foodAvailable: 10, goldAvailable: 10,
        hazardFoodDemandFactor: factor
    });
    const tight = calculateDailyLedger({
        population: 10, employed: 8, buildings: 12, foodAvailable: 3, goldAvailable: 10,
        hazardFoodDemandFactor: factor
    });
    assert.ok(hazard.foodDemand > calm.foodDemand);
    assert.ok(hazard.foodConsumed > calm.foodConsumed);
    assert.ok(tight.foodShortage > 0, "a hazard must turn adequate stores into a shortage");
});

test("1.2.20 an active hazard slows production and building", () => {
    resetState();
    setModifiers({ work: 0.5, adaptation: 0.2 });
    const farm = new Entity(10, 10, TYPE.FARM);
    const builder = new Entity(20, 21, TYPE.VILLAGER);
    state.entities = [farm, builder];
    state.city = { enabled: true, constructionVersion: 0 };
    state.tick = 100;
    state.isPaused = false;
    state.gameOver = false;
    const hazardEfficiency = getBuildingEfficiency(farm, workforceFor(farm));
    assert.ok(hazardEfficiency < 0.5, "hazard work factor must reach building production");

    const site = new Entity(20, 20, TYPE.HOUSE);
    site.construction = {
        stage: 1, progress: 0, paused: false,
        delivered: { cutStone: 1 }, materialNeed: { cutStone: 1 }
    };
    state.entities = [site, builder];
    setModifiers(null);
    updateConstruction();
    const calmProgress = site.construction.progress;
    assert.equal(calmProgress, 50, "the previous construction baseline must not move");

    site.construction.progress = 0;
    builder.workplace = null;
    setModifiers({ work: 0.5, adaptation: 0.2 });
    updateConstruction();
    assert.ok(site.construction.progress > 0 && site.construction.progress < calmProgress,
        "a hazard must slow the same builder on the same site");
});

function forestRealm() {
    resetState();
    state.tick = 0;
    state.seasonIndex = 0;
    state.worldSeed = 20261108;
    state.worldW = 48;
    state.worldH = 48;
    state.terrainResolution = 2;
    state.terrainPixW = 96;
    state.terrainPixH = 96;
    state.worldOptions = { landmass: 50, ruggedness: 55, forests: 70, water: 48, climate: "temperate" };
    state.heightMap = new Float32Array(96 * 96).fill(0.7);
    state.moistureMap = new Float32Array(96 * 96).fill(0.8);
    state.temperatureMap = new Float32Array(96 * 96).fill(0.55);
    state.resources = { wood: 200, stone: 200, gold: 100, food: 100 };
    state.incomeThisTick = { wood: 0, stone: 0, gold: 0, food: 0 };
    state.morale = 70;
    generateResourceGeography(state.worldSeed);
    initializeCityForRealm({ seedWarehouse: false });
}

function forestSite() {
    for (let y = 8; y < 40; y++) {
        for (let x = 8; x < 40; x++) {
            let trees = 0;
            for (let oy = -5; oy <= 5; oy++) {
                for (let ox = -5; ox <= 5; ox++) {
                    if (getResourceNodeAt(x + ox, y + oy)?.forestCapacity > 0) trees++;
                }
            }
            if (trees >= 6) return { x, y };
        }
    }
    throw new Error("fixture needs a forest site");
}

function harvestedLogs(modifiers) {
    forestRealm();
    setModifiers(modifiers);
    const site = forestSite();
    const lumber = spawnEntity(site.x, site.y, TYPE.LUMBER);
    for (let index = 0; index < 3; index++) {
        spawnEntity(site.x + index, site.y + 1, TYPE.VILLAGER).workplace = lumber;
    }
    updateBuildingIncome();
    return getInventorySummary(lumber).output.logs || 0;
}

function totalPastureCapacity(modifiers) {
    resetState();
    resetForestFauna();
    state.worldSeed = 20261108;
    state.worldW = 48;
    state.worldH = 48;
    state.terrainResolution = 2;
    state.terrainPixW = 96;
    state.terrainPixH = 96;
    state.worldOptions = { landmass: 50, ruggedness: 55, forests: 52, water: 48, climate: "temperate" };
    state.heightMap = new Float32Array(96 * 96).fill(0.7);
    state.moistureMap = new Float32Array(96 * 96).fill(0.8);
    state.temperatureMap = new Float32Array(96 * 96).fill(0.55);
    setModifiers(modifiers);
    generateResourceGeography(state.worldSeed);
    const model = ensureForestFauna();
    return model.herds.reduce((sum, herd) => sum + herd.capacity, 0);
}

test("1.2.20 a real lumber camp brings less timber out in a severe season", () => {
    const calm = harvestedLogs(null);
    const hazard = harvestedLogs({ extraction: 1, adaptation: 0 });
    assert.equal(calm, 2, "the previous calm harvest must not move");
    assert.equal(hazard, 1, "the same camp must bring out less timber");
});

test("1.2.20 real forest herds lose pasture capacity in a severe season", () => {
    const calm = totalPastureCapacity(null);
    const hazard = totalPastureCapacity({ pasture: 0.5, adaptation: 0 });
    assert.ok(calm > 0 && hazard > 0);
    assert.ok(hazard < calm, "the same forest must carry less game");
});

test("1.2.20 caravan deals really shift in the market", () => {
    const trade = hazard => {
        resetState();
        state.market = createMarketState();
        state.resources = { wood: 20, stone: 10, gold: 100, food: 20 };
        state.incomeThisTick = { wood: 0, stone: 0, gold: 0, food: 0 };
        setModifiers(hazard);
        const bought = executeTrade("northmere", "wood", "buy", 5);
        assert.equal(bought.ok, true);
        return bought.gold;
    };
    const calmBuy = trade(null);
    const hazardBuy = trade({ trade: 0.5, adaptation: 0 });
    assert.ok(hazardBuy > calmBuy, "the same caravan must charge more in a hazard season");

    const sell = hazard => {
        resetState();
        state.market = createMarketState();
        state.resources = { wood: 20, stone: 10, gold: 100, food: 20 };
        state.incomeThisTick = { wood: 0, stone: 0, gold: 0, food: 0 };
        setModifiers(hazard);
        const sold = executeTrade("northmere", "wood", "sell", 5);
        assert.equal(sold.ok, true);
        return sold.gold;
    };
    const calmSell = sell(null);
    const hazardSell = sell({ trade: 0.5, adaptation: 0 });
    assert.ok(hazardSell < calmSell, "the same caravan must pay less in a hazard season");
});

test("1.2.20 movement, extraction, pasture and caravan terms all respond", () => {
    resetState();
    setModifiers({ movement: 0.5, extraction: 0.5, pasture: 0.5, trade: 0.5, adaptation: 0 });
    const movement = getHazardMovementFactor();
    const extraction = getHazardExtractionFactor();
    const pasture = getHazardPastureCapacityFactor();
    const buy = getHazardTradeBuyFactor();
    const sell = getHazardTradeSellFactor();
    assert.ok(movement < 1, "movement must slow");
    assert.ok(extraction < 1, "raw extraction must fall");
    assert.ok(10 * extraction < 10, "a ten-unit harvest must yield less");
    assert.ok(pasture < 1, "herd capacity must shrink");
    assert.ok(100 * pasture < 100, "a hundred-head pasture must carry fewer animals");
    assert.ok(buy > 1, "caravans must charge more");
    assert.ok(sell < 1, "caravans must pay less");

    // Regional adaptation takes back part of every penalty, without erasing it.
    setModifiers({ movement: 0.5, extraction: 0.5, pasture: 0.5, trade: 0.5, work: 0.5, adaptation: 0.8 });
    assert.ok(getHazardMovementFactor() > movement);
    assert.ok(getHazardExtractionFactor() > extraction);
    assert.ok(getHazardPastureCapacityFactor() > pasture);
    assert.ok(getHazardTradeBuyFactor() < buy);
    assert.ok(getHazardTradeSellFactor() > sell);
    assert.ok(getHazardWorkFactor() < 1);
});
