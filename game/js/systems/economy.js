// Settlement economy: workforce, household consumption, wages, taxes and upkeep.
// Financial ledgers settle every 20 in-game days; rates below are daily values.
import { TYPE } from "../core/types.js";
import { state } from "../core/state.js";
import { addResource } from "./resources.js";
import { recordResourceMovement } from "./goods-book.js";
import { updatePolitics } from "./politics.js";
import { getRoadUpkeepTotal } from "./roads.js";
import { getEdictModifiers } from "./edicts.js";
import { applyRoomBonuses, getFurnitureUpkeepTotal } from "./rooms.js";
import { getCourtModifiers } from "./court.js";
import { getFaithModifiers } from "./faith.js";
import { getJusticeModifiers } from "./justice.js";
import { getResearchModifiers } from "./research.js";
import { getCitizenModifiers } from "./population-register.js";
import { getEndeavourModifiers } from "./endeavours.js";
import { getCivicModifiers } from "./civic.js";
import { getJobSkill } from "./skills.js";
import { addLog } from "../core/event-log.js";
import {
    ECONOMY_TUNING, ensureEconomyCycleState, calculateFoodSpoilage, getDebtPressure,
    getDebtProductivity, getFoodCrisisProductivity, getFoodDemandInputs, getFoodStorageCapacity,
    nextFoodCrisis, takeFoodInflow
} from "./economy-cycle.js";
import { recordNaturalDeath } from "./mortality.js";

export const ECONOMY_INTERVAL = 20;
export const DAYS_PER_LEDGER = 20;
export const ECONOMY_HISTORY_LIMIT = 24;
// A twenty-resident opening village must be able to staff its whole production
// chain. The old capacities (four farmers per field, three per lumber camp)
// left the mill, bakery and sawmill permanently short-handed, so planks and
// firewood never reached the stores.
export const BUILDING_WORKFORCE = Object.freeze({
    [TYPE.FARM]: 2,
    [TYPE.LUMBER]: 2,
    [TYPE.QUARRY]: 2,
    [TYPE.GOLDMINE]: 1,
    [TYPE.TAVERN]: 1,
    [TYPE.TEMPLE]: 1,
    [TYPE.MILL]: 2,
    [TYPE.STABLE]: 1,
    [TYPE.WAREHOUSE]: 1,
    [TYPE.SAWMILL]: 1,
    [TYPE.BAKERY]: 2,
    [TYPE.WELL]: 1,
    [TYPE.MASON]: 1,
    [TYPE.FORESTER]: 1,
    [TYPE.CLINIC]: 1,
    [TYPE.MARKET]: 1,
    [TYPE.TOWN_HALL]: 2,
    [TYPE.SCHOOL]: 2,
    [TYPE.BATHHOUSE]: 1,
    [TYPE.BREWERY]: 2,
    [TYPE.GUILDHALL]: 2,
    [TYPE.WATCHHOUSE]: 1,
    [TYPE.SMITHY]: 1,
    [TYPE.SCRIPTORIUM]: 1
});

const clampNonNegative = value => Math.max(0, Number.isFinite(value) ? value : 0);

export function calculateDailyLedger({ population, employed, buildings, foodAvailable, goldAvailable, taxRate = 10, roadUpkeep = 0, furnitureUpkeep = 0, households = 0, livestock = 0 }) {
    const people = Math.floor(clampNonNegative(population));
    const workers = Math.min(people, Math.floor(clampNonNegative(employed)));
    const buildingCount = Math.floor(clampNonNegative(buildings));
    // Residents, hearths and livestock all eat. The extra terms are zero by
    // default so the pure ledger remains useful to isolated balance tests.
    const foodDemand = people * ECONOMY_TUNING.foodPerResident +
        clampNonNegative(households) * ECONOMY_TUNING.foodPerHousehold +
        clampNonNegative(livestock) * ECONOMY_TUNING.foodPerLivestock;
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
        households: Math.floor(clampNonNegative(households)),
        livestock: clampNonNegative(livestock),
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
    const skillByBuilding = new Map();
    const experienceByBuilding = new Map();
    let employed = 0;
    for (const villager of villagers) {
        if ((villager.illnessUntilTick || 0) > state.tick) continue;
        const workplace = villager.workplace;
        const constructionCapacity = workplace?.construction && workplace.construction.stage < 3 ? 2 : 0;
        if (!workplace || workplace.dead || (!BUILDING_WORKFORCE[workplace.type] && !constructionCapacity)) continue;
        workersByBuilding.set(workplace, (workersByBuilding.get(workplace) || 0) + 1);
        skillByBuilding.set(workplace, (skillByBuilding.get(workplace) || 0) + getJobSkill(villager));
        experienceByBuilding.set(workplace, (experienceByBuilding.get(workplace) || 0) + Math.max(0, Number(villager.person?.jobExperience) || 0));
        employed++;
    }
    const buildings = state.entities.filter(entity => !entity.dead && entity.isBuilding()).length;
    return {
        population: villagers.length,
        employed,
        unemployed: Math.max(0, villagers.length - employed),
        workersByBuilding,
        skillByBuilding,
        experienceByBuilding,
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
    const civicModifiers = getCivicModifiers();
    const averageSkill = workers > 0 ? (workforce?.skillByBuilding?.get(building) || 0) / workers : 50;
    const averageExperience = workers > 0 ? (workforce?.experienceByBuilding?.get(building) || 0) / workers : 0;
    // A newly assigned resident has potential but not yet a career. Experience
    // unlocks the skill contribution, so existing balance remains stable on day one.
    const skillFactor = 1 + (Math.max(0, Math.min(100, averageSkill)) - 50) * 0.0028 * Math.min(1, averageExperience / 25);
    return Math.max(0, Math.min(1, workers / capacity)) * productivity * getCitizenModifiers().productivity * skillFactor *
        Math.max(0.7, Math.min(1.30, 1 + Number(civicModifiers.production || 0))) *
        getFoodCrisisProductivity() * getDebtProductivity();
}

export function updateEconomy() {
    if (state.tick <= 0 || state.tick % ECONOMY_INTERVAL !== 0) return null;
    const economy = ensureEconomyCycleState();
    const workforce = getWorkforceSnapshot();
    const foodInputs = getFoodDemandInputs();
    const foodInflow = takeFoodInflow();
    const storageCapacity = getFoodStorageCapacity();
    const ledger = calculateDailyLedger({
        population: workforce.population,
        employed: workforce.employed,
        buildings: workforce.buildings,
        foodAvailable: state.resources.food,
        goldAvailable: state.resources.gold,
        taxRate: Number(state.government?.taxRate ?? 10),
        households: foodInputs.households,
        livestock: foodInputs.livestock,
        roadUpkeep: getRoadUpkeepTotal() * DAYS_PER_LEDGER,
        furnitureUpkeep: getFurnitureUpkeepTotal()
    });
    ledger.foodInflow = foodInflow;
    ledger.storageCapacity = storageCapacity;
    ledger.taxRate = Number(state.government?.taxRate ?? 10);

    // Royal edicts bend the ledger before it settles: a harvest law lowers
    // household demand, a mint raises what the tax collectors bring in, and a
    // standing edict nudges morale every settlement period.
    const edicts = getEdictModifiers();
    const court = getCourtModifiers();
    const faith = getFaithModifiers();
    const justice = getJusticeModifiers();
    // Research reaches the household directly: crop rotation and granaries
    // lower what a family needs, while the census and written law raise the
    // share the collectors actually bring in.
    const research = getResearchModifiers();
    const endeavours = getEndeavourModifiers();
    const eraModifiers = state.ambitions?.era?.agenda?.modifiers || {};
    const eraFoodDemandFactor = Math.max(0.70, Math.min(1.10, Number(eraModifiers.foodDemandFactor) || 1));
    const eraTaxEfficiency = Math.max(1, Math.min(1.15, Number(eraModifiers.taxEfficiency) || 1));
    const civicModifiers = getCivicModifiers();
    ledger.foodDemand *= edicts.food * research.foodDemandFactor * (1 - endeavours.food) * eraFoodDemandFactor * (1 + civicModifiers.foodDemand);
    ledger.eraFoodDemandFactor = eraFoodDemandFactor;
    ledger.eraTaxEfficiency = eraTaxEfficiency;
    ledger.foodConsumed = Math.min(state.resources.food, ledger.foodDemand);
    ledger.foodShortage = Math.max(0, ledger.foodDemand - ledger.foodConsumed);
    ledger.taxesCollected *= edicts.tax;
    ledger.faithTaxBonus = ledger.taxesCollected * (faith.taxEfficiency - 1);
    ledger.taxesCollected *= faith.taxEfficiency;
    ledger.justiceTaxBonus = ledger.taxesCollected * (justice.taxEfficiency - 1);
    ledger.taxesCollected *= justice.taxEfficiency;
    ledger.researchTaxBonus = ledger.taxesCollected * (research.taxEfficiency - 1);
    ledger.taxesCollected *= research.taxEfficiency;
    const courtTaxBefore = ledger.taxesCollected;
    ledger.taxesCollected *= court.taxEfficiency;
    ledger.courtTaxBonus = ledger.taxesCollected - courtTaxBefore;
    // Named citizens are the tax base. Their loyalty and employment reach the
    // ledger through one bounded civic modifier, not a second tax calculation.
    const civic = getCitizenModifiers();
    const citizenTaxBefore = ledger.taxesCollected;
    ledger.taxesCollected *= civic.taxEfficiency;
    ledger.citizenTaxBonus = ledger.taxesCollected - citizenTaxBefore;
    ledger.civicTaxEfficiency = civic.taxEfficiency;
    const endeavourTaxBefore = ledger.taxesCollected;
    ledger.taxesCollected *= 1 + endeavours.tax;
    ledger.endeavourTaxBonus = ledger.taxesCollected - endeavourTaxBefore;
    const eraTaxBefore = ledger.taxesCollected;
    ledger.taxesCollected *= eraTaxEfficiency;
    ledger.eraTaxBonus = ledger.taxesCollected - eraTaxBefore;
    const civicTaxBefore = ledger.taxesCollected;
    ledger.taxesCollected *= Math.max(0.7, Math.min(1.35, 1 + Number(civicModifiers.tax || 0)));
    ledger.civicTaxBonus = ledger.taxesCollected - civicTaxBefore;
    ledger.netGold = ledger.taxesCollected - ledger.wagesPaid - ledger.upkeepPaid - ledger.furnitureUpkeepPaid;
    ledger.deficit = Math.max(0, ledger.unpaidWages + ledger.unpaidUpkeep + ledger.unpaidFurniture);

    recordResourceMovement("food", -ledger.foodConsumed, "population-food", {
        from: { kind: "realm", id: "royal-stores" }, to: { kind: "population", id: "households" },
        key: "food:population:" + state.tick
    });
    addResource("food", -ledger.foodConsumed);

    // Food left above the safe storage band spoils. The safe band is not a
    // second stock: it is the same royal reserve, measured against real stores.
    const foodAfterConsumption = Math.max(0, Number(state.resources.food) || 0);
    const foodSpoiled = calculateFoodSpoilage(foodAfterConsumption, storageCapacity);
    if (foodSpoiled > 0) {
        recordResourceMovement("food", -foodSpoiled, "food-spoilage", {
            from: { kind: "realm", id: "royal-stores" }, to: { kind: "spoilage", id: "open-stores" },
            key: "food:spoilage:" + state.tick
        });
        addResource("food", -foodSpoiled);
    }
    ledger.foodSpoiled = foodSpoiled;
    ledger.foodBalance = foodInflow - ledger.foodConsumed - foodSpoiled;
    ledger.foodReserve = Math.max(0, Number(state.resources.food) || 0);
    ledger.reserveLedgers = ledger.foodDemand > 0 ? ledger.foodReserve / ledger.foodDemand : null;

    // Gold is a liability system, not a zero floor. Unpaid wages and upkeep
    // become crown arrears; a positive settlement first repays the oldest debt.
    const debtBefore = economy.debt;
    const netGold = Number(ledger.netGold) || 0;
    const debtPayment = netGold > 0 ? Math.min(debtBefore, netGold) : 0;
    const retainedGold = netGold > 0 ? netGold - debtPayment : netGold;
    if (retainedGold !== 0) addResource("gold", retainedGold);
    economy.debt = Math.max(0, debtBefore - debtPayment);
    ledger.debtBefore = debtBefore;
    ledger.debtPaid = debtPayment;
    ledger.debtAdded = ledger.deficit;
    economy.debt = Math.min(ECONOMY_TUNING.maxDebt * 2, economy.debt + ledger.deficit);
    const debtInterest = economy.debt * ECONOMY_TUNING.debtInterestRate;
    economy.debt = Math.min(ECONOMY_TUNING.maxDebt * 2, economy.debt + debtInterest);
    economy.totalDebtInterest = Math.max(0, Number(economy.totalDebtInterest) || 0) + debtInterest;
    ledger.debtInterest = debtInterest;
    ledger.debt = economy.debt;
    ledger.debtBefore = debtBefore;
    ledger.debtAfter = economy.debt;
    ledger.goldAfter = Math.max(0, Number(state.resources.gold) || 0);

    const crisis = nextFoodCrisis(economy.foodCrisis, {
        shortage: ledger.foodShortage,
        demand: ledger.foodDemand,
        tick: state.tick,
        year: state.year
    });
    economy.foodCrisis = crisis;
    ledger.foodCrisis = { ...crisis, events: [...crisis.events] };
    if (crisis.lastEvent && crisis.lastEvent.tick === state.tick) {
        addLog("HUNGER EVENT — " + String(crisis.lastEvent.kind).toUpperCase().replaceAll("-", " ") +
            " · " + Math.round(crisis.lastEvent.shortage * 100) / 100 + " FOOD MISSING", "#e6a15a", "famine");
    }
    // A sustained famine removes one resident at a time. The record goes through
    // the normal mortality archive, so a death is inspectable and not a silent
    // population clamp. The long gap keeps famine from deleting a village in a
    // handful of ledgers.
    if (crisis.severity >= 0.8 && crisis.consecutiveShortages >= 3 && state.tick - crisis.lastPopulationLossTick >= 60) {
        const victim = state.entities
            .filter(entity => !entity.dead && entity.type === TYPE.VILLAGER && !entity.isKing && entity.personId)
            .sort((a, b) => String(a.personId).localeCompare(String(b.personId)))[0];
        if (victim) {
            recordNaturalDeath(victim, "hunger");
            crisis.populationLoss++;
            crisis.lastPopulationLossTick = state.tick;
            economy.foodCrisis = crisis;
            addLog("FAMINE TAKES A RESIDENT — " + (victim.person?.name || "A household member"), "#d98c78", "famine");
        }
    }

    if (edicts.morale !== 0) {
        state.morale = Math.max(0, Math.min(100, state.morale + edicts.morale * DAYS_PER_LEDGER));
    }
    if (ledger.foodShortage > 0) {
        const hungerShock = 0.35 + ledger.foodShortage * 0.12 + crisis.severity * 0.8;
        state.morale = Math.max(0, state.morale - Math.min(3.5, hungerShock));
    }
    const debtPressure = getDebtPressure();
    if (debtPressure > 0) state.morale = Math.max(0, state.morale - (0.1 + debtPressure * 0.5));
    if (ledger.unpaidWages > 0 || ledger.unpaidUpkeep > 0 || ledger.unpaidFurniture > 0) {
        state.morale = Math.max(0, state.morale - 0.2);
    }

    const totals = state.economy || (state.economy = {});
    totals.daysElapsed = (totals.daysElapsed || 0) + DAYS_PER_LEDGER;
    for (const key of ["foodConsumed", "foodSpoiled", "foodInflow", "taxesCollected", "wagesPaid", "upkeepPaid", "furnitureUpkeepPaid", "roadUpkeepAssessed", "unpaidWages", "unpaidUpkeep", "unpaidFurniture", "debtAdded", "debtPaid", "debtInterest"]) {
        totals[key] = (totals[key] || 0) + Number(ledger[key] || 0);
    }
    totals.lastLedger = ledger;
    totals.foodStorageCapacity = storageCapacity;
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
        foodInflow: Number(ledger.foodInflow) || 0,
        foodSpoiled: Number(ledger.foodSpoiled) || 0,
        foodBalance: Number(ledger.foodBalance) || 0,
        storageCapacity: Number(ledger.storageCapacity) || 0,
        debt: Number(ledger.debt) || 0,
        debtInterest: Number(ledger.debtInterest) || 0,
        crisisSeverity: Number(crisis.severity) || 0,
        taxRate: Number(ledger.taxRate) || 0,
        households: foodInputs.households,
        livestock: foodInputs.livestock,
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
