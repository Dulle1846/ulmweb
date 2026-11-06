// Settlement economy: workforce, household consumption, wages, taxes and upkeep.
// Financial ledgers settle every 20 in-game days; rates below are daily values.
import { TYPE } from "../core/types.js";
import { state } from "../core/state.js";
import { addResource } from "./resources.js";
import { updatePolitics } from "./politics.js";
import { getRoadUpkeepTotal } from "./roads.js";
import { getEdictModifiers } from "./edicts.js";
import { applyRoomBonuses, getFurnitureUpkeepTotal } from "./rooms.js";

export const ECONOMY_INTERVAL = 20;
export const DAYS_PER_LEDGER = 20;
export const ECONOMY_HISTORY_LIMIT = 24;
export const BUILDING_WORKFORCE = Object.freeze({
    [TYPE.FARM]: 4,
    [TYPE.LUMBER]: 3,
    [TYPE.QUARRY]: 4,
    [TYPE.GOLDMINE]: 3,
    [TYPE.TAVERN]: 2,
    [TYPE.TEMPLE]: 2,
    [TYPE.MILL]: 2,
    [TYPE.STABLE]: 2,
    [TYPE.WAREHOUSE]: 2,
    [TYPE.SAWMILL]: 2,
    [TYPE.BAKERY]: 2,
    [TYPE.WELL]: 1,
    [TYPE.MASON]: 2,
    [TYPE.FORESTER]: 2,
    [TYPE.CLINIC]: 2,
    [TYPE.MARKET]: 2
});

const clampNonNegative = value => Math.max(0, Number.isFinite(value) ? value : 0);

export function calculateDailyLedger({ population, employed, buildings, foodAvailable, goldAvailable, taxRate = 10, roadUpkeep = 0, furnitureUpkeep = 0 }) {
    const people = Math.floor(clampNonNegative(population));
    const workers = Math.min(people, Math.floor(clampNonNegative(employed)));
    const buildingCount = Math.floor(clampNonNegative(buildings));
    const foodDemand = people * 0.015 * DAYS_PER_LEDGER;
    const foodConsumed = Math.min(clampNonNegative(foodAvailable), foodDemand);
    const foodShortage = Math.max(0, foodDemand - foodConsumed);
    const effectiveTaxRate = Math.max(0, Math.min(35, Number.isFinite(Number(taxRate)) ? Number(taxRate) : 10));
    const taxesAssessed = workers * 0.025 * DAYS_PER_LEDGER * (effectiveTaxRate / 10);
    const wagesAssessed = workers * 0.015 * DAYS_PER_LEDGER;
    const roadUpkeepAssessed = clampNonNegative(roadUpkeep);
    const upkeepAssessed = buildingCount * 0.003 * DAYS_PER_LEDGER + roadUpkeepAssessed;
    const furnitureUpkeepAssessed = clampNonNegative(furnitureUpkeep);
    const treasuryAfterTaxes = clampNonNegative(goldAvailable) + taxesAssessed;
    const wagesPaid = Math.min(treasuryAfterTaxes, wagesAssessed);
    const upkeepPaid = Math.min(Math.max(0, treasuryAfterTaxes - wagesPaid), upkeepAssessed);
    const furnitureUpkeepPaid = Math.min(Math.max(0, treasuryAfterTaxes - wagesPaid - upkeepPaid), furnitureUpkeepAssessed);
    return {
        population: people,
        employed: workers,
        unemployed: people - workers,
        foodDemand,
        foodConsumed,
        foodShortage,
        taxesCollected: taxesAssessed,
        wagesPaid,
        upkeepPaid,
        upkeepAssessed,
        roadUpkeepAssessed,
        furnitureUpkeepAssessed,
        furnitureUpkeepPaid,
        unpaidWages: wagesAssessed - wagesPaid,
        unpaidUpkeep: upkeepAssessed - upkeepPaid,
        unpaidFurniture: furnitureUpkeepAssessed - furnitureUpkeepPaid,
        netGold: taxesAssessed - wagesPaid - upkeepPaid - furnitureUpkeepPaid
    };
}

export function getWorkforceSnapshot() {
    const villagers = state.entities.filter(entity => !entity.dead && entity.type === TYPE.VILLAGER);
    const workersByBuilding = new Map();
    let employed = 0;
    for (const villager of villagers) {
        if ((villager.illnessUntilTick || 0) > state.tick) continue;
        const workplace = villager.workplace;
        const constructionCapacity = workplace?.construction && workplace.construction.stage < 3 ? 2 : 0;
        if (!workplace || workplace.dead || (!BUILDING_WORKFORCE[workplace.type] && !constructionCapacity)) continue;
        workersByBuilding.set(workplace, (workersByBuilding.get(workplace) || 0) + 1);
        employed++;
    }
    const buildings = state.entities.filter(entity => !entity.dead && entity.isBuilding()).length;
    return {
        population: villagers.length,
        employed,
        unemployed: Math.max(0, villagers.length - employed),
        workersByBuilding,
        buildings
    };
}

export function getBuildingEfficiency(building, workforce = null) {
    if (!building || building.dead) return 0;
    if (building.construction && building.construction.stage < 3) return 0;
    const constructionCapacity = building.construction && building.construction.stage < 3 ? 2 : 0;
    const capacity = BUILDING_WORKFORCE[building.type] || constructionCapacity;
    if (!capacity) return 0;
    const workers = (workforce || getWorkforceSnapshot()).workersByBuilding.get(building) || 0;
    const productivity = state.city?.enabled ? Math.max(0.7, Math.min(1.05, Number(state.city?.needs?.productivity) || 1)) : 1;
    return Math.max(0, Math.min(1, workers / capacity)) * productivity;
}

export function updateEconomy() {
    if (state.tick <= 0 || state.tick % ECONOMY_INTERVAL !== 0) return null;
    const workforce = getWorkforceSnapshot();
    const ledger = calculateDailyLedger({
        population: workforce.population,
        employed: workforce.employed,
        buildings: workforce.buildings,
        foodAvailable: state.resources.food,
        goldAvailable: state.resources.gold,
        roadUpkeep: getRoadUpkeepTotal() * DAYS_PER_LEDGER,
        furnitureUpkeep: getFurnitureUpkeepTotal()
    });

    // Royal edicts bend the ledger before it settles: a harvest law lowers
    // household demand, a mint raises what the tax collectors bring in, and a
    // standing edict nudges morale every settlement period.
    const edicts = getEdictModifiers();
    ledger.foodDemand *= edicts.food;
    ledger.foodConsumed = Math.min(state.resources.food, ledger.foodDemand);
    ledger.foodShortage = Math.max(0, ledger.foodDemand - ledger.foodConsumed);
    ledger.taxesCollected *= edicts.tax;
    ledger.netGold = ledger.taxesCollected - ledger.wagesPaid - ledger.upkeepPaid - ledger.furnitureUpkeepPaid;

    addResource("food", -ledger.foodConsumed);
    addResource("gold", ledger.netGold);
    if (edicts.morale !== 0) {
        state.morale = Math.max(0, Math.min(100, state.morale + edicts.morale * DAYS_PER_LEDGER));
    }
    if (ledger.foodShortage > 0) {
        state.morale = Math.max(0, state.morale - Math.min(2.5, 0.35 + ledger.foodShortage * 0.12));
    }
    if (ledger.unpaidWages > 0 || ledger.unpaidUpkeep > 0 || ledger.unpaidFurniture > 0) {
        state.morale = Math.max(0, state.morale - 0.2);
    }

    const totals = state.economy || (state.economy = {});
    totals.daysElapsed = (totals.daysElapsed || 0) + DAYS_PER_LEDGER;
    for (const key of ["foodConsumed", "taxesCollected", "wagesPaid", "upkeepPaid", "furnitureUpkeepPaid", "roadUpkeepAssessed", "unpaidWages", "unpaidUpkeep", "unpaidFurniture"]) {
        totals[key] = (totals[key] || 0) + ledger[key];
    }
    totals.lastLedger = ledger;
    totals.population = workforce.population;
    totals.employed = workforce.employed;
    totals.unemployed = workforce.unemployed;
    // Keep a bounded, real time series for the charts in the economy and store
    // panels. Every point is copied from a completed settlement; nothing here
    // is a forecast or a synthesized interpolation.
    totals.history = Array.isArray(totals.history) ? totals.history.slice(-(ECONOMY_HISTORY_LIMIT - 1)) : [];
    totals.history.push({
        tick: state.tick,
        year: state.year,
        dayOfYear: state.dayOfYear,
        wood: Math.max(0, Number(state.resources.wood) || 0),
        stone: Math.max(0, Number(state.resources.stone) || 0),
        gold: Math.max(0, Number(state.resources.gold) || 0),
        food: Math.max(0, Number(state.resources.food) || 0),
        netGold: Number(ledger.netGold) || 0,
        taxesCollected: Number(ledger.taxesCollected) || 0,
        foodDemand: Number(ledger.foodDemand) || 0,
        foodConsumed: Number(ledger.foodConsumed) || 0,
        foodShortage: Number(ledger.foodShortage) || 0,
        population: workforce.population,
        employed: workforce.employed
    });
    const roomBonuses = applyRoomBonuses();
    updatePolitics(ledger,workforce);
    ledger.roomGold = roomBonuses.totals.gold;
    ledger.roomMorale = roomBonuses.totals.morale;
    ledger.roomLegitimacy = roomBonuses.totals.legitimacy;
    totals.roomGold = (Number(totals.roomGold) || 0) + roomBonuses.totals.gold;
    totals.roomMorale = (Number(totals.roomMorale) || 0) + roomBonuses.totals.morale;
    totals.roomLegitimacy = (Number(totals.roomLegitimacy) || 0) + roomBonuses.totals.legitimacy;
    return ledger;
}
