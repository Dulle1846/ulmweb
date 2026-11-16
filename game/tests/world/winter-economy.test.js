import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { state, resetState } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { getWarehouseStock } from "../../js/systems/logistics.js";
import {
    WINTER_LIMITS, WINTER_SYSTEMS, getWinterSnapshot, initializeWinterForRealm,
    normalizeWinterState, serializeWinterState, setWinterPolicy, updateWinterAnnual,
    updateWinterEconomy, upgradeWinterBuildings, upgradeWinterUnits,
} from "../../js/world/winter-economy.js";

const SEED = 20261215;
const WIDTH = 96;
const HEIGHT = 96;

function blankWorld({ height = 0.62, moisture = 0.6, temperature = 0.12, water = false } = {}) {
    resetState();
    state.hasStarted = true;
    state.worldSeed = SEED;
    state.worldOptions = { climate: "snow", size: "small" };
    state.worldW = WIDTH; state.worldH = HEIGHT;
    state.terrainPixW = WIDTH; state.terrainPixH = HEIGHT; state.terrainResolution = 1;
    state.seaLevel = 0.33;
    state.heightMap = new Float32Array(WIDTH * HEIGHT).fill(height);
    state.moistureMap = new Float32Array(WIDTH * HEIGHT).fill(moisture);
    state.temperatureMap = new Float32Array(WIDTH * HEIGHT).fill(temperature);
    if (water) {
        for (let y = 40; y < 56; y++) for (let x = 40; x < 56; x++) state.heightMap[y * WIDTH + x] = 0.18;
    }
    state.dayOfYear = 330;
    state.year = 3;
    state.seasonIndex = 3;
    state.tick = 20;
    state.weather = "storm";
    state.resources = { wood: 100, stone: 100, gold: 100, food: 100 };
    state.morale = 72;
    state.roads = { version: 1, revision: 0, tiles: {} };
    state.market = { prices: { wood: 3, stone: 3, food: 3 }, priceTrend: { wood: 0, stone: 0, food: 0 }, partners: [] };
    state.diplomacy = { realms: [{ id: "neighbour", relation: 50 }] };
    state.entities = [];
    const keep = {
        id: "keep", type: TYPE.KEEP, x: 48, y: 48, hp: 100, maxHp: 100, dead: false,
        isBuilding: () => true,
        warehouse: { capacity: 320, stored: { firewood: 40, food: 10, water: 10 }, reservedIn: {}, reservedOut: {}, filters: ["firewood", "food", "water"] },
    };
    state.entities.push(keep);
    return { keep };
}

function addFarm(x = 44, y = 44, fertility = 40) {
    const farm = {
        id: "farm-" + x + "-" + y, type: TYPE.FARM, x, y, hp: 100, maxHp: 100, dead: false,
        isBuilding: () => true,
        field: { fertility, maxFertility: 50, growth: 30, stage: "growing" },
    };
    state.entities.push(farm);
    return farm;
}

function addHouse(x = 52, y = 52) {
    const house = { id: "house-" + x + "-" + y, type: TYPE.HOUSE, x, y, hp: 100, maxHp: 100, dead: false, isBuilding: () => true };
    state.entities.push(house);
    return house;
}

function addVillagers(count = 4) {
    const list = [];
    for (let i = 0; i < count; i++) {
        const villager = {
            id: "villager-" + i, type: TYPE.VILLAGER, x: 46 + (i % 5), y: 46 + Math.floor(i / 5),
            hp: 100, maxHp: 100, dead: false, isKing: false, person: { name: "Resident " + i },
        };
        state.entities.push(villager);
        list.push(villager);
    }
    return list;
}

function addRoads(count = 20) {
    for (let i = 0; i < count; i++) state.roads.tiles[i + ",48"] = { type: "road" };
}

function spring() {
    state.dayOfYear = 20;
    state.seasonIndex = 0;
    state.tick = 40;
    state.weather = "rain";
    state.temperatureMap.fill(0.55);
    state.moistureMap.fill(0.85);
}

test("1.2.16 has twenty numbered winter systems in one deterministic ledger", () => {
    assert.equal(WINTER_SYSTEMS.length, 20);
    assert.equal(new Set(WINTER_SYSTEMS.map(entry => entry.id)).size, 20);
    assert.deepEqual(WINTER_SYSTEMS.map(entry => entry.id), Array.from({ length: 20 }, (_, index) => "1.2.16." + (index + 1)));
    assert.equal(WINTER_LIMITS.ledgerDays, 20);
});

test("1.2.16.1 snow depth lowers bearing capacity on deep ground", () => {
    blankWorld({ height: 0.55 });
    const shallow = updateWinterEconomy({ force: true, systems: ["bearing"] });
    blankWorld({ height: 0.88 });
    const deep = updateWinterEconomy({ force: true, systems: ["bearing"] });
    assert.ok(deep.values.snowDepth > shallow.values.snowDepth);
    assert.ok(deep.values.bearing < shallow.values.bearing, "deeper snow must reduce bearing");
    assert.ok(deep.values.bearing >= 0.12 && deep.values.bearing <= 1);
});

test("1.2.16.2 slow winter transport removes food from the stores", () => {
    blankWorld({ height: 0.9 });
    const before = state.resources.food;
    const snapshot = updateWinterEconomy({ force: true, systems: ["transport"] });
    assert.ok(snapshot.values.transportSpeed < 0.5);
    assert.equal(snapshot.values.transportSpeed < 0.38 ? state.resources.food < before : true, true);
    assert.ok(snapshot.values.supplyLoss >= 0);
});

test("1.2.16.3 cold raises heating demand and burns warehouse firewood", () => {
    blankWorld({ temperature: 0.02 });
    const cold = updateWinterEconomy({ force: true, systems: ["heating"] });
    const fuelAfterCold = getWarehouseStock("firewood");
    blankWorld({ temperature: 0.38 });
    const warm = updateWinterEconomy({ force: true, systems: ["heating"] });
    assert.ok(cold.values.heatingDemand > warm.values.heatingDemand);
    assert.ok(fuelAfterCold < 40, "the cold ledger must consume physical firewood");
    assert.ok(cold.values.fuelBurned > 0);
});

test("1.2.16.4 missing heating fuel causes illness risk and morale loss", () => {
    blankWorld();
    state.entities = state.entities.filter(entity => entity.type !== TYPE.KEEP);
    addVillagers(10);
    const beforeMorale = state.morale;
    const snapshot = updateWinterEconomy({ force: true, systems: ["heating", "shortfall"] });
    assert.ok(snapshot.values.heatingShortfall > 0);
    assert.ok(snapshot.values.illnessRisk > 0);
    assert.ok(state.morale < beforeMorale);
    assert.ok(state.entities.some(entity => entity.type === TYPE.VILLAGER && entity.illnessUntilTick > state.tick));
    assert.ok(state.winter.totals.fuelShortfall > 0);
});

test("1.2.16.5 fuel scarcity raises the wood market price", () => {
    blankWorld();
    state.entities = state.entities.filter(entity => entity.type !== TYPE.KEEP);
    const beforePrice = state.market.prices.wood;
    const snapshot = updateWinterEconomy({ force: true, systems: ["heating", "shortfall", "fuelPrice"] });
    assert.ok(snapshot.values.fuelPricePressure > 0);
    assert.ok(state.market.prices.wood > beforePrice);
    assert.ok(state.market.priceTrend.wood > 0);
});

test("1.2.16.6 frozen water opens seasonal ice roads with real capacity", () => {
    blankWorld({ water: true });
    const snapshot = updateWinterEconomy({ force: true, systems: ["iceRoads"] });
    const open = snapshot.iceRoads.filter(route => route.status === "open");
    assert.ok(open.length > 0);
    assert.ok(snapshot.values.iceCapacity > 0);
    assert.ok(snapshot.values.iceRoutesOpen > 0);
    assert.ok(open.every(route => route.capacity >= 1));
});

test("1.2.16.7 spring breakup destroys ice routes and loses cargo", () => {
    blankWorld({ water: true });
    const winter = updateWinterEconomy({ force: true, systems: ["iceRoads"] });
    assert.ok(winter.iceRoads.some(route => route.status === "open"));
    spring();
    const foodBefore = state.resources.food;
    const snapshot = updateWinterEconomy({ force: true, systems: ["iceBreakup"] });
    assert.ok(snapshot.iceRoads.some(route => route.status === "broken"));
    assert.ok(snapshot.values.iceCargoLost > 0);
    assert.ok(state.resources.food < foodBefore);
    assert.ok(state.winter.totals.cargoLost > 0);
});

test("1.2.16.8 snow clearance spends wood and slows field growth", () => {
    blankWorld();
    const farm = addFarm();
    addRoads(20);
    const beforeWood = state.resources.wood;
    const beforeGrowth = farm.field.growth;
    const snapshot = updateWinterEconomy({ force: true, systems: ["clearance"] });
    assert.ok(snapshot.values.clearanceWork > 0);
    assert.ok(snapshot.values.clearancePenalty > 0);
    assert.ok(state.resources.wood < beforeWood);
    assert.ok(farm.field.growth < beforeGrowth);
});

test("1.2.16.9 deep snow insulates soil above thin snow", () => {
    blankWorld({ height: 0.5, temperature: 0.04 });
    const thin = updateWinterEconomy({ force: true, systems: ["insulation"] });
    blankWorld({ height: 0.86, temperature: 0.04 });
    const thick = updateWinterEconomy({ force: true, systems: ["insulation"] });
    const farm = addFarm();
    updateWinterEconomy({ force: true, systems: ["insulation"] });
    assert.ok(thick.values.soilTemperature > thin.values.soilTemperature);
    assert.ok(thick.values.insulation > thin.values.insulation);
    assert.ok(farm.field.winterInsulation > 0);
});

test("1.2.16.10 thin cover and frost reduce field fertility", () => {
    blankWorld({ height: 0.42, temperature: 0.01 });
    spring();
    state.temperatureMap.fill(0.01);
    state.weather = "snow";
    const farm = addFarm(44, 44, 40);
    const before = farm.field.fertility;
    const snapshot = updateWinterEconomy({ force: true, systems: ["frostDamage"] });
    assert.ok(snapshot.values.frostDamage > 0);
    assert.ok(farm.field.fertility < before);
    assert.ok(farm.field.frostDamage > 0);
});

test("1.2.16.11 spring meltwater raises field fertility once per year", () => {
    blankWorld({ height: 0.58 });
    spring();
    const farm = addFarm(44, 44, 30);
    const before = farm.field.fertility;
    const snapshot = updateWinterEconomy({ force: true, systems: ["meltwater"] });
    assert.ok(snapshot.values.meltwater > 0);
    assert.ok(farm.field.fertility > before);
    assert.equal(state.winter.lastMeltYear, state.year);
});

test("1.2.16.12 spring meltwater floods a building and then enriches fields", () => {
    blankWorld({ height: 0.55, moisture: 0.95 });
    spring();
    const farm = addFarm(44, 44, 30);
    const house = addHouse(52, 52);
    const foodBefore = state.resources.food;
    const snapshot = updateWinterEconomy({ force: true, systems: ["flood"] });
    assert.ok(snapshot.values.floodDamage > 0);
    assert.ok(state.winter.totals.floodDamage > 0 || farm.hp < 100 || house.hp < 100);
    assert.ok(farm.field.fertility >= 30);
    assert.ok(state.resources.food <= foodBefore);
});

test("1.2.16.13 wildlife migration produces a measurable hunt yield", () => {
    blankWorld({ height: 0.74, moisture: 0.8 });
    const before = state.resources.food;
    const snapshot = updateWinterEconomy({ force: true, systems: ["wildlife"] });
    assert.ok(snapshot.values.huntYield > 0);
    assert.ok(state.resources.food > before);
    assert.ok(state.winter.totals.huntFood > 0);
});

test("1.2.16.14 wolf pressure removes food from the herd economy", () => {
    blankWorld({ height: 0.74, moisture: 0.8 });
    const before = state.resources.food;
    const snapshot = updateWinterEconomy({ force: true, systems: ["wolfPressure"], focus: { x: 24, y: 48 } });
    assert.ok(snapshot.values.wolfPressure > 0.45);
    assert.ok(state.resources.food < before);
    assert.ok(state.winter.totals.wolfLoss > 0);
});

test("1.2.16.15 empty winter stores create food stress and migration pressure", () => {
    blankWorld();
    addVillagers(12);
    state.resources.food = 0;
    const beforeMorale = state.morale;
    const snapshot = updateWinterEconomy({ force: true, systems: ["foodStress"] });
    assert.ok(snapshot.values.foodStress > 0.55);
    assert.ok(snapshot.values.foodStressLoss >= 1);
    assert.ok(snapshot.values.migrationPull > 0);
    assert.ok(state.morale < beforeMorale);
});

test("1.2.16.16 avalanche and blizzard damage a building and close the pass", () => {
    blankWorld({ height: 0.84 });
    const house = addHouse(52, 52);
    const result = updateWinterAnnual({ force: true });
    assert.ok(result.applied);
    assert.ok(result.after.avalancheRisk > 0.4);
    assert.ok(result.after.passClosed > 0.4);
    assert.ok(state.winter.totals.snowDamage > 0 || house.hp < 100);
});

test("1.2.16.17 delayed caravans damage a neighbour relation", () => {
    blankWorld({ height: 0.84 });
    const before = state.diplomacy.realms[0].relation;
    const result = updateWinterAnnual({ force: true });
    assert.ok(result.after.caravanDelay > 0);
    assert.ok(result.after.diplomacyMalus > 0);
    assert.ok(state.diplomacy.realms[0].relation < before);
});

test("1.2.16.18 a funded winter festival raises morale", () => {
    blankWorld();
    state.resources.food = 100;
    state.winter = normalizeWinterState({ fuelStock: 20 });
    setWinterPolicy("festival", true);
    state.winter.fuelStock = 20;
    const before = state.morale;
    const snapshot = updateWinterEconomy({ force: true, systems: ["morale"] });
    assert.equal(snapshot.policy.festival, true);
    assert.ok(snapshot.values.moraleBonus > 0);
    assert.ok(state.morale > before);
});

test("1.2.16.19 winterising a building costs materials and raises hardiness", () => {
    blankWorld();
    const house = addHouse(52, 52);
    updateWinterEconomy({ force: true, systems: ["hardiness"] });
    const before = house.winterHardiness;
    const beforeWood = state.resources.wood;
    const result = upgradeWinterBuildings(2);
    assert.ok(result.ok);
    assert.ok(house.winterHardiness > before);
    assert.ok(state.resources.wood < beforeWood);
    assert.ok(house.winterUpgrade > 0);
});

test("1.2.16.20 winter kits equip residents and reduce exposure", () => {
    blankWorld();
    const villagers = addVillagers(2);
    updateWinterEconomy({ force: true, systems: ["unitKit"] });
    const before = villagers[0].winterKit;
    const beforeGold = state.resources.gold;
    const result = upgradeWinterUnits(2);
    assert.ok(result.ok);
    assert.ok(villagers[0].winterKit > before);
    assert.ok(villagers[0].winterKitTier >= 1);
    assert.ok(state.resources.gold < beforeGold);
});

test("winter state is deterministic and survives save normalization", () => {
    blankWorld({ water: true });
    addFarm(); addHouse(); addVillagers(4);
    initializeWinterForRealm();
    const first = updateWinterEconomy({ force: true });
    const saved = serializeWinterState();
    const normalized = normalizeWinterState(saved);
    assert.deepEqual(normalized.policy, first.policy);
    assert.equal(normalized.totals.ledgers, state.winter.totals.ledgers);
    const firstValues = { ...first.values };
    blankWorld({ water: true });
    addFarm(); addHouse(); addVillagers(4);
    initializeWinterForRealm();
    const second = updateWinterEconomy({ force: true });
    assert.deepEqual(second.values, firstValues, "same seed and setup must reproduce the ledger");
});

test("winter HUD exposes depth, heating, ice roads and avalanche risk", async () => {
    const html = await readFile(new URL("../../index.html", import.meta.url), "utf8");
    for (const id of ["winter-section", "winter-snow-depth", "winter-heating-demand", "winter-ice-roads", "winter-avalanche-risk", "winter-meltwater", "winter-event-log"]) {
        assert.match(html, new RegExp('id="' + id + '"'));
    }
    assert.match(html, /data-winter-action="clearance"/);
    assert.match(html, /css\/winter\.css/);
    assert.match(await readFile(new URL("../../css/winter.css", import.meta.url), "utf8"), /\.winter-section/);
    const snapshot = getWinterSnapshot();
    assert.equal(snapshot.systemCount, 20);
});
