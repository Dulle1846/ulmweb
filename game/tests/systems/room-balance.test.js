import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { Entity, TYPE } from "../../js/core/types.js";
import { defaultLayout } from "../../js/presentation/building-layout.js";
import { BUILDING_SIZE } from "../../js/core/config.js";
import { calculateDailyLedger } from "../../js/systems/economy.js";
import {
    applyRoomBonuses,
    getFurnitureUpkeepTotal,
    getRaidDamageMultiplier,
    getRoomBonusSnapshot,
    invalidateRoomBonusCache,
} from "../../js/systems/rooms.js";
import { getPopulationGrowthMoraleThreshold } from "../../js/systems/population.js";
import { FURNITURE_COSTS } from "../../js/systems/furniture.js";

const DAYS_PER_LEDGER = 20;
const LEDGERS_PER_YEAR = 18;
const STARTING_TYPES = [
    TYPE.KEEP,
    TYPE.HOUSE, TYPE.HOUSE, TYPE.HOUSE,
    TYPE.FARM, TYPE.FARM,
    TYPE.LUMBER, TYPE.QUARRY, TYPE.GOLDMINE, TYPE.TEMPLE,
];
const NO_FURNITURE = { bed: 0, table: 0, chair: 0, shelf: 0, hearth: 0, rug: 0, statue: 0, candle: 0 };

function createStartingRealm(furnished) {
    resetState();
    invalidateRoomBonusCache();
    state.entities = STARTING_TYPES.map((type, index) => {
        const entity = new Entity(20 + index, 20, type);
        const size = BUILDING_SIZE[type] || { w: 1, h: 1 };
        entity.id = "balance-" + index;
        entity.layout = defaultLayout(type, size.w, size.h);
        if (!furnished) {
            entity.interior = { ...NO_FURNITURE };
            entity.roomFurniture = {};
        }
        return entity;
    });
    state.hasStarted = true;
    state.resources = { wood: 0, stone: 0, gold: 0, food: 0 };
    state.morale = 72;
    state.politics.legitimacy = 65;
    return getRoomBonusSnapshot();
}

function simulateYears(furnished = true, years = 5) {
    const snapshot = createStartingRealm(furnished);
    const yearly = [];
    let firstMoraleCapDay = null;
    let firstLegitimacyCapDay = null;
    for (let ledger = 1; ledger <= years * LEDGERS_PER_YEAR; ledger++) {
        const bonuses = applyRoomBonuses();
        if (firstMoraleCapDay === null && state.morale >= 100 - 1e-9) {
            firstMoraleCapDay = ledger * DAYS_PER_LEDGER;
        }
        if (firstLegitimacyCapDay === null && state.politics.legitimacy >= 100 - 1e-9) {
            firstLegitimacyCapDay = ledger * DAYS_PER_LEDGER;
        }
        if (ledger % LEDGERS_PER_YEAR === 0) {
            yearly.push({
                year: ledger / LEDGERS_PER_YEAR,
                gold: state.resources.gold,
                morale: state.morale,
                legitimacy: state.politics.legitimacy,
                perLedger: { ...bonuses.totals },
            });
        }
    }
    return {
        snapshot,
        yearly,
        totalGold: state.resources.gold,
        finalMorale: state.morale,
        finalLegitimacy: state.politics.legitimacy,
        firstMoraleCapDay,
        firstLegitimacyCapDay,
    };
}

test("five-year room simulation measures the furnished and unfurnished realm", () => {
    const furnished = simulateYears(true);
    const bare = simulateYears(false);

    assert.equal(furnished.snapshot.rooms, 24);
    assert.equal(furnished.snapshot.buildings, 10);
    assert.ok(furnished.snapshot.rawTotals.gold > bare.snapshot.rawTotals.gold);
    assert.ok(furnished.snapshot.rawTotals.legitimacy > bare.snapshot.rawTotals.legitimacy);
    assert.ok(furnished.snapshot.rawTotals.morale > bare.snapshot.rawTotals.morale);
    assert.ok(furnished.totalGold > 0);
    assert.ok(Number.isFinite(furnished.finalMorale));
    assert.ok(Number.isFinite(furnished.finalLegitimacy));

    // Room bonuses should supplement the realm, not saturate both social caps
    // within the first two simulated years.
    assert.ok(furnished.firstMoraleCapDay === null || furnished.firstMoraleCapDay >= 520);
    assert.ok(furnished.firstLegitimacyCapDay === null || furnished.firstLegitimacyCapDay >= 720);

    console.log("ROOM BALANCE · 5 YEARS · FURNISHED", JSON.stringify({
        raw: furnished.snapshot.rawTotals,
        capped: furnished.snapshot.capped,
        totals: furnished.snapshot.totals,
        furnitureUpkeep: furnished.snapshot.furnitureUpkeep,
        firstMoraleCapDay: furnished.firstMoraleCapDay,
        firstLegitimacyCapDay: furnished.firstLegitimacyCapDay,
        totalGold: furnished.totalGold,
        yearly: furnished.yearly,
    }));
    console.log("ROOM BALANCE · 5 YEARS · UNFURNISHED", JSON.stringify({
        raw: bare.snapshot.rawTotals,
        totals: bare.snapshot.totals,
        firstMoraleCapDay: bare.firstMoraleCapDay,
        firstLegitimacyCapDay: bare.firstLegitimacyCapDay,
        totalGold: bare.totalGold,
    }));
});

// A decade with harvests, food demand, wages, raids, plague, drought and the
// furniture upkeep. The event schedule is fixed so the comparison between a
// furnished and a bare realm is meaningful instead of noise.
const EVENT_BY_YEAR = new Map([
    [2, "raid"], [3, "harvest"], [4, "plague"], [5, "drought"],
    [6, "raid"], [7, "harvest"], [8, "flood"], [9, "raid"], [10, "harvest"],
]);

// A deliberately specialised realm: the treasury is packed with shelves, the
// guard hall with storage and tables, the chambers with beds and the temple
// with candles. This is what separates a furnished realm from a bare one.
const SPECIALIZED_FURNITURE = {
    [TYPE.KEEP]: {
        "THRONE ROOM": { chair: 6, statue: 6 },
        "TREASURY": { shelf: 12 },
        "ROYAL CHAMBER": { bed: 8, rug: 4 },
        "GUARD HALL": { shelf: 6, table: 6 },
    },
    [TYPE.HOUSE]: { "BEDCHAMBER": { bed: 6 } },
    [TYPE.TEMPLE]: { "NAVE": { candle: 12 }, "CHAPEL": { candle: 12 } },
};

function furnishSpecialized(entities) {
    for (const entity of entities) {
        const plan = SPECIALIZED_FURNITURE[entity.type];
        if (plan) entity.roomFurniture = JSON.parse(JSON.stringify(plan));
    }
}

function furnishingCost(entities) {
    const totals = {};
    for (const entity of entities) {
        for (const items of Object.values(entity.roomFurniture || {})) {
            for (const [id, count] of Object.entries(items)) {
                for (const [resource, amount] of Object.entries(FURNITURE_COSTS[id] || {})) {
                    totals[resource] = (totals[resource] || 0) + amount * count;
                }
            }
        }
    }
    return totals;
}

function simulateDecade(furnished = true) {
    let snapshot = createStartingRealm(furnished);
    if (furnished) {
        furnishSpecialized(state.entities);
        state.buildingInteriorVersion = (state.buildingInteriorVersion || 0) + 1;
        invalidateRoomBonusCache();
        snapshot = getRoomBonusSnapshot();
    }
    const capex = furnishingCost(state.entities);
    const stats = {
        furnitureCapex: capex,
        roomGold: 0,
        furnitureUpkeep: 0,
        taxes: 0,
        foodProduced: 0,
        foodConsumed: 0,
        foodShortage: 0,
        raidLoss: 0,
        events: [],
        yearly: [],
    };
    let population = 52;
    let gold = 170;
    let food = 90;
    state.resources = { wood: 240, stone: 150, gold, food };
    state.morale = 72;
    state.politics.legitimacy = 65;

    for (let ledger = 1; ledger <= 10 * LEDGERS_PER_YEAR; ledger++) {
        const year = Math.floor((ledger - 1) / LEDGERS_PER_YEAR) + 1;
        const firstLedgerOfYear = (ledger - 1) % LEDGERS_PER_YEAR === 0;
        const employed = Math.min(population, 34);
        let foodFactor = 1;
        let moraleShock = 0;
        let goldShock = 0;
        let populationFactor = 1;

        if (firstLedgerOfYear) {
            const event = EVENT_BY_YEAR.get(year) || "none";
            stats.events.push({ year, event });
            if (event === "raid") {
                const multiplier = getRaidDamageMultiplier();
                const lost = 18 * multiplier;
                stats.raidLoss += lost;
                goldShock -= lost;
                food -= 10 * multiplier;
                moraleShock -= 6 * multiplier;
            } else if (event === "plague") {
                moraleShock -= 7;
                populationFactor = 0.985;
            } else if (event === "drought") {
                foodFactor = 0.45;
                moraleShock -= 2;
            } else if (event === "flood") {
                foodFactor = 0.7;
                goldShock -= 8;
                moraleShock -= 3;
                populationFactor = 0.995;
            } else if (event === "harvest") {
                foodFactor = 1.35;
                moraleShock += 2;
            }
        }

        const foodProduced = (8 + 2 * 4) * foodFactor;
        food += foodProduced;
        const settlement = calculateDailyLedger({
            population,
            employed,
            buildings: STARTING_TYPES.length,
            foodAvailable: food,
            goldAvailable: gold,
            taxRate: 10,
            furnitureUpkeep: getFurnitureUpkeepTotal(),
        });
        food = Math.max(0, food - settlement.foodConsumed);
        gold = Math.max(0, gold + settlement.netGold + goldShock);
        state.resources.food = food;
        state.resources.gold = gold;

        const bonuses = applyRoomBonuses();
        food = state.resources.food;
        gold = state.resources.gold;

        state.morale = Math.max(0, Math.min(100, state.morale + moraleShock));
        if (settlement.foodShortage > 0) {
            stats.foodShortage += settlement.foodShortage;
            state.morale = Math.max(0, state.morale - Math.min(2.5, 0.35 + settlement.foodShortage * 0.12));
        }
        if (settlement.unpaidWages > 0 || settlement.unpaidUpkeep > 0 || settlement.unpaidFurniture > 0) {
            state.morale = Math.max(0, state.morale - 0.2);
        }
        population = Math.max(20, Math.round(population * populationFactor));

        stats.roomGold += bonuses.totals.gold;
        stats.furnitureUpkeep += settlement.furnitureUpkeepPaid;
        stats.taxes += settlement.taxesCollected;
        stats.foodProduced += foodProduced;
        stats.foodConsumed += settlement.foodConsumed;

        if (ledger % LEDGERS_PER_YEAR === 0) {
            const threshold = getPopulationGrowthMoraleThreshold();
            if (state.morale >= threshold) population = Math.floor(population * 1.02);
            else if (state.morale < 40) population = Math.max(20, Math.floor(population * 0.99));
            stats.yearly.push({
                year,
                gold: Math.round(gold * 100) / 100,
                food: Math.round(food * 100) / 100,
                morale: Math.round(state.morale),
                legitimacy: Math.round(state.politics.legitimacy),
                population,
            });
        }
    }

    return {
        snapshot,
        stats,
        final: {
            gold: Math.round(gold * 100) / 100,
            food: Math.round(food * 100) / 100,
            morale: Math.round(state.morale * 10) / 10,
            legitimacy: Math.round(state.politics.legitimacy * 10) / 10,
            population,
        },
        upkeep: getFurnitureUpkeepTotal(),
    };
}

test("ten-year simulation keeps room and furniture bonuses viable through food, events and upkeep", () => {
    const furnished = simulateDecade(true);
    const bare = simulateDecade(false);

    assert.equal(furnished.stats.yearly.length, 10);
    assert.equal(furnished.stats.events.length, 10);
    assert.ok(furnished.snapshot.furnitureUpkeep > 0);
    assert.equal(bare.snapshot.furnitureUpkeep, 0);
    assert.equal(bare.stats.furnitureUpkeep, 0);
    assert.ok(furnished.upkeep > 0);

    // Furniture must pay for itself: the specialised treasury earns more than
    // the whole furniture upkeep costs, the realm still ends with more coin,
    // and staying furnished is a minority of income rather than a drain.
    assert.ok(furnished.stats.roomGold > bare.stats.roomGold);
    assert.ok(furnished.stats.roomGold - furnished.stats.furnitureUpkeep > bare.stats.roomGold);
    assert.ok(furnished.final.gold > bare.final.gold);
    const income = furnished.stats.taxes + furnished.stats.roomGold;
    assert.ok(furnished.stats.furnitureUpkeep / income < 0.2);
    assert.ok(furnished.stats.furnitureCapex.gold > 0);
    assert.ok(furnished.stats.furnitureCapex.gold < 250);

    // Furnishings add a bounded layer above the base cap, so the specialised
    // realm is stronger than the bare one even after both base caps saturate.
    assert.ok(furnished.snapshot.furnitureTotals.legitimacy > 0);
    assert.ok(furnished.snapshot.furnitureTotals.morale > 0);
    assert.ok(furnished.final.legitimacy >= bare.final.legitimacy);

    // The guard hall's furniture has to actually soften the three raids.
    assert.ok(furnished.snapshot.totals.defense > bare.snapshot.totals.defense);
    assert.ok(furnished.stats.raidLoss < bare.stats.raidLoss);

    // Food demand, shortages and recovery all stay inside sane bounds.
    assert.ok(furnished.stats.foodProduced > 0);
    assert.ok(furnished.stats.foodConsumed > 0);
    assert.ok(furnished.stats.foodShortage > 0);
    assert.ok(furnished.final.food >= 0);
    assert.ok(furnished.final.population >= 40);
    assert.ok(furnished.final.morale >= 0 && furnished.final.morale <= 100);
    assert.ok(furnished.final.legitimacy >= 0 && furnished.final.legitimacy <= 100);

    console.log("ROOM BALANCE · 10 YEARS · FURNISHED", JSON.stringify({
        totals: furnished.snapshot.totals,
        furnitureUpkeep: furnished.snapshot.furnitureUpkeep,
        stats: furnished.stats,
        final: furnished.final,
    }));
    console.log("ROOM BALANCE · 10 YEARS · UNFURNISHED", JSON.stringify({
        totals: bare.snapshot.totals,
        stats: bare.stats,
        final: bare.final,
    }));
});
