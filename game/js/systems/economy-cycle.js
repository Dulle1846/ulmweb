// Scarcity, storage and credit rules for the realm economy.
//
// This module deliberately contains no UI, market or event imports. It owns the
// small set of tuning constants and pure state helpers used by the ledger,
// fields, market and the command deck. A ledger is settled every twenty days,
// so these helpers may scan buildings and residents only on that cadence.
import { state } from "../core/state.js";
import { TYPE } from "../core/types.js";

export const ECONOMY_TUNING = Object.freeze({
    // Household demand per twenty-day ledger. The base rate keeps the shipped
    // opening realm playable; the household and livestock terms make expansion
    // consume its own reserve instead of being free.
    foodPerResident: 0.30,
    foodPerHousehold: 0.045,
    foodPerLivestock: 0.32,
    livestockPerStable: 2,
    baseFoodStorage: 360,
    keepFoodStorage: 320,
    warehouseFoodStorage: 180,
    barrelFoodStorage: 32,
    // Spoilage is deliberately a slow brake on hoarding, not a second granary
    // fire every settlement. The long campaign keeps a year of grain without
    // being punished faster than farms can replace it.
    safeStorageRatio: 0.90,
    spoilageRate: 0.0015,
    tropicalSpoilageRate: 0.004,
    tundraSpoilageRate: 0.0008,
    savannaSpoilageRate: 0.0012,
    stormSpoilageAdd: 0.001,
    // A farm household keeps part of its crop. This is the subsistence share
    // that never enters the market chain; it makes a staffed field feed people
    // even when no mill or bakery has been built yet.
    farmSubsistenceShare: 0.85,
    debtInterestRate: 0.04,
    maxDebt: 1200,
    debtProductivityPenalty: 0.22,
    crisisProductivityPenalty: 0.35,
    debtMarketPenalty: 0.35,
    crisisMarketPressure: 0.35,
    minTaxRate: 5,
    maxTaxRate: 30,
    taxStep: 5
});

function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, number(value)));
}

function round2(value) {
    return Math.round(number(value) * 100) / 100;
}

function isCompletedBuilding(entity) {
    return Boolean(entity && !entity.dead && entity.isBuilding?.() && !(entity.construction && entity.construction.stage < 3));
}

export function isHouseholdType(type) {
    return type === TYPE.HOUSE || type === TYPE.STONE_HOUSE || type === TYPE.TENT;
}

export function getFoodDemandInputs(entities = state.entities) {
    let residents = 0;
    let households = 0;
    let livestock = 0;
    for (const entity of Array.isArray(entities) ? entities : []) {
        if (!entity || entity.dead) continue;
        if (entity.type === TYPE.VILLAGER) residents++;
        else if (isHouseholdType(entity.type) && isCompletedBuilding(entity)) households++;
        else if (entity.type === TYPE.STABLE && isCompletedBuilding(entity)) livestock += ECONOMY_TUNING.livestockPerStable;
    }
    const military = state.military && typeof state.military === "object" ? state.military : {};
    livestock += Math.max(0, number(military.horses)) + Math.max(0, number(military.assignedHorses));
    return { residents, households, livestock };
}

// Only stores that can actually hold food add crown granary space. A timber
// yard is still useful for construction, but it cannot absorb a grain surplus.
export function getFoodStorageCapacity(entities = state.entities) {
    let capacity = ECONOMY_TUNING.baseFoodStorage;
    for (const entity of Array.isArray(entities) ? entities : []) {
        if (!isCompletedBuilding(entity)) continue;
        if (entity.type === TYPE.KEEP) {
            capacity += number(entity.warehouse?.capacity, ECONOMY_TUNING.keepFoodStorage);
        } else if (entity.type === TYPE.WAREHOUSE) {
            const filters = Array.isArray(entity.warehouse?.filters) ? entity.warehouse.filters : null;
            // Royal food is the cooked resource, while warehouses store the
            // physical grain/flour/bread chain. A general store or granary
            // therefore feeds the royal granary; a timber yard does not.
            const acceptsFood = !filters || filters.some(good => good === "grain" || good === "flour" || good === "bread");
            if (acceptsFood) {
                capacity += number(entity.warehouse?.capacity, ECONOMY_TUNING.warehouseFoodStorage);
            }
        } else if (entity.type === TYPE.BARREL) {
            capacity += ECONOMY_TUNING.barrelFoodStorage;
        }
    }
    return Math.max(1, Math.round(capacity));
}

export function calculateFoodSpoilage(foodAvailable, storageCapacity, { climate = state.worldOptions?.climate || "temperate", weather = state.weather || "clear" } = {}) {
    const food = Math.max(0, number(foodAvailable));
    const capacity = Math.max(0, number(storageCapacity));
    const safe = capacity * ECONOMY_TUNING.safeStorageRatio;
    const exposed = Math.max(0, food - safe);
    if (exposed <= 0) return 0;
    const rate = climate === "tropical" ? ECONOMY_TUNING.tropicalSpoilageRate
        : climate === "tundra" ? ECONOMY_TUNING.tundraSpoilageRate
            : climate === "savanna" ? ECONOMY_TUNING.savannaSpoilageRate
                : ECONOMY_TUNING.spoilageRate;
    const weatherAdd = weather === "rain" || weather === "storm" ? ECONOMY_TUNING.stormSpoilageAdd : 0;
    return Math.min(exposed, round2(exposed * (rate + weatherAdd)));
}

// Agriculture reads the same weather, season, morale and public-health state as
// the rest of the realm. Land quality remains the field's own fertility term.
export function getHarvestYieldFactor() {
    const season = clamp(state.seasonIndex, 0, 3);
    const seasonFactor = [1, 1.04, 1.14, 0.84][season] || 1;
    const weather = String(state.weather || "clear").toLowerCase();
    const weatherFactor = weather === "rain" ? 1.04 : weather === "snow" ? 0.88 : 1;
    const climate = String(state.worldOptions?.climate || "temperate").toLowerCase();
    const climateFactor = {
        arid: 0.90,
        tropical: 1.06,
        northern: 0.94,
        tundra: 0.72,
        savanna: 0.96,
        mediterranean: 1.02,
        enchanted: 1.02
    }[climate] || 1;
    const moraleFactor = 0.85 + clamp(state.morale, 0, 100) / 500;
    const health = state.health && typeof state.health === "object" ? state.health : {};
    const healthFactor = 1 - clamp(health.severity, 0, 1) * 0.25;
    return clamp(seasonFactor * weatherFactor * climateFactor * moraleFactor * healthFactor, 0.45, 1.35);
}

export function normalizeFoodCrisis(input = {}) {
    const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const events = Array.isArray(source.events)
        ? source.events.filter(event => event && typeof event === "object").slice(-12)
        : [];
    return {
        severity: clamp(source.severity, 0, 1),
        consecutiveShortages: Math.max(0, Math.floor(number(source.consecutiveShortages))),
        eventCount: Math.max(0, Math.floor(number(source.eventCount, events.length))),
        lastEventTick: Math.max(0, Math.floor(number(source.lastEventTick))),
        lastMilestone: clamp(source.lastMilestone, 0, 3),
        lastEvent: source.lastEvent && typeof source.lastEvent === "object" ? { ...source.lastEvent } : null,
        populationLoss: Math.max(0, Math.floor(number(source.populationLoss))),
        lastPopulationLossTick: Math.max(0, Math.floor(number(source.lastPopulationLossTick))),
        events
    };
}

export function nextFoodCrisis(previous = {}, { shortage = 0, demand = 0, tick = 0, year = 1 } = {}) {
    const prior = normalizeFoodCrisis(previous);
    const missing = Math.max(0, number(shortage));
    const need = Math.max(0.0001, number(demand));
    const ratio = clamp(missing / need, 0, 1);
    let severity;
    let consecutiveShortages;
    if (missing > 0) {
        severity = clamp(Math.max(0.12, prior.severity * 0.55 + 0.24 + ratio * 0.48), 0, 1);
        consecutiveShortages = prior.consecutiveShortages + 1;
    } else {
        severity = clamp(prior.severity * 0.52 - 0.08, 0, 1);
        consecutiveShortages = 0;
    }
    const milestone = severity >= 0.75 ? 3 : severity >= 0.5 ? 2 : severity >= 0.25 ? 1 : 0;
    const currentTick = Math.max(0, Math.floor(number(tick)));
    const canRecord = milestone > prior.lastMilestone && currentTick - prior.lastEventTick >= 20;
    const event = canRecord ? {
        tick: currentTick,
        year: Math.max(1, Math.floor(number(year, 1))),
        severity: round2(severity),
        shortage: round2(missing),
        demand: round2(need),
        kind: milestone === 3 ? "famine" : milestone === 2 ? "hunger-unrest" : "empty-stores"
    } : null;
    const events = event ? [...prior.events, event].slice(-12) : prior.events;
    return {
        severity,
        consecutiveShortages,
        eventCount: prior.eventCount + (event ? 1 : 0),
        lastEventTick: event ? currentTick : prior.lastEventTick,
        lastMilestone: severity < 0.12 ? 0 : (event ? milestone : prior.lastMilestone),
        lastEvent: event || prior.lastEvent,
        populationLoss: prior.populationLoss,
        lastPopulationLossTick: prior.lastPopulationLossTick,
        events
    };
}

export function ensureEconomyCycleState() {
    if (!state.economy || typeof state.economy !== "object" || Array.isArray(state.economy)) state.economy = {};
    const economy = state.economy;
    economy.debt = clamp(economy.debt, 0, ECONOMY_TUNING.maxDebt * 2);
    economy.totalDebtInterest = clamp(economy.totalDebtInterest, 0, Number.MAX_SAFE_INTEGER);
    economy.foodCrisis = normalizeFoodCrisis(economy.foodCrisis);
    const accounting = economy.foodAccounting && typeof economy.foodAccounting === "object" ? economy.foodAccounting : {};
    economy.foodAccounting = {
        inflow: clamp(accounting.inflow, 0, Number.MAX_SAFE_INTEGER),
        outflow: clamp(accounting.outflow, 0, Number.MAX_SAFE_INTEGER),
        sinceTick: Math.max(0, Math.floor(number(accounting.sinceTick, state.tick)))
    };
    economy.foodStorageCapacity = getFoodStorageCapacity();
    return economy;
}

// Called by addResource for food. It records actual changes, not forecasts.
export function noteFoodResourceChange(delta) {
    const amount = number(delta);
    if (!amount || !state.economy || typeof state.economy !== "object") return;
    const accounting = state.economy.foodAccounting || (state.economy.foodAccounting = { inflow: 0, outflow: 0, sinceTick: state.tick });
    if (amount > 0) accounting.inflow = Math.max(0, number(accounting.inflow)) + amount;
    else accounting.outflow = Math.max(0, number(accounting.outflow)) + Math.abs(amount);
}

export function takeFoodInflow() {
    const economy = ensureEconomyCycleState();
    const inflow = Math.max(0, number(economy.foodAccounting.inflow));
    economy.foodAccounting.inflow = 0;
    economy.foodAccounting.outflow = 0;
    economy.foodAccounting.sinceTick = Math.max(0, Math.floor(number(state.tick)));
    return inflow;
}

export function getFoodCrisisSnapshot() {
    const crisis = ensureEconomyCycleState().foodCrisis;
    return { ...crisis, events: [...crisis.events] };
}

export function normalizeEconomyCycleState() {
    return ensureEconomyCycleState();
}

export const ECONOMY_HISTORY_LIMIT = 24;

// The economy field of a loaded save. New scarcity fields are filled with
// neutral defaults, while every persisted resource, debt, crisis and history
// value is kept exactly as written. Shared by the live loader and save tests.
export function restoreEconomyCycleState(snapshot = {}) {
    const year = Math.max(1, Number(state.year) || 1);
    const saved = snapshot && typeof snapshot.economy === "object" && !Array.isArray(snapshot.economy)
        ? snapshot.economy
        : {};
    state.economy = {
        daysElapsed: 0, foodConsumed: 0, taxesCollected: 0, wagesPaid: 0,
        upkeepPaid: 0, furnitureUpkeepPaid: 0, unpaidWages: 0, unpaidUpkeep: 0,
        unpaidFurniture: 0, population: 0, employed: 0, unemployed: 0,
        populationGrowth: 0, lastGrowthYear: year, births: 0,
        lastBirthCheckYear: year, lastSocialYear: year, lastAgencyYear: year,
        deaths: 0, lastMortalityYear: year, lastLedger: null, debt: 0,
        totalDebtInterest: 0,
        foodAccounting: { inflow: 0, outflow: 0, sinceTick: state.tick },
        foodCrisis: { severity: 0, consecutiveShortages: 0, eventCount: 0, lastEventTick: 0, lastMilestone: 0, lastEvent: null, populationLoss: 0, lastPopulationLossTick: 0, events: [] },
        history: [],
        ...saved
    };
    normalizeEconomyCycleState();
    state.economy.history = (Array.isArray(state.economy.history) ? state.economy.history : [])
        .filter(entry => entry && typeof entry === "object" && !Array.isArray(entry) && Number.isFinite(Number(entry.tick)))
        .slice(-ECONOMY_HISTORY_LIMIT);
    const growthYear = state.economy.lastGrowthYear;
    state.economy.lastGrowthYear = Number.isFinite(growthYear) ? Math.max(1, Math.min(year, Math.floor(growthYear))) : year;
    const populationGrowth = Number(state.economy.populationGrowth);
    state.economy.populationGrowth = Number.isFinite(populationGrowth) ? Math.max(0, populationGrowth) : 0;
    const births = Number(state.economy.births);
    state.economy.births = Number.isFinite(births) ? Math.max(0, Math.floor(births)) : 0;
    const mortalityYear = Number(state.economy.lastMortalityYear);
    state.economy.lastMortalityYear = Number.isFinite(mortalityYear) ? Math.max(1, Math.min(year, Math.floor(mortalityYear))) : year;
    const deaths = Number(state.economy.deaths);
    state.economy.deaths = Number.isFinite(deaths) ? Math.max(0, Math.floor(deaths)) : 0;
    const agencyYear = Number(state.economy.lastAgencyYear);
    state.economy.lastAgencyYear = Number.isFinite(agencyYear) ? Math.max(1, Math.min(year, Math.floor(agencyYear))) : year;
    const socialYear = Number(state.economy.lastSocialYear);
    state.economy.lastSocialYear = Number.isFinite(socialYear) ? Math.max(1, Math.min(year, Math.floor(socialYear))) : year;
    const birthCheckYear = Number(state.economy.lastBirthCheckYear);
    state.economy.lastBirthCheckYear = Number.isFinite(birthCheckYear) ? Math.max(1, Math.min(year, Math.floor(birthCheckYear))) : year;
    return state.economy;
}

export function getDebtPressure() {
    const debt = Math.max(0, number(state.economy?.debt));
    return clamp(debt / ECONOMY_TUNING.maxDebt, 0, 1);
}

export function getDebtProductivity() {
    return 1 - getDebtPressure() * ECONOMY_TUNING.debtProductivityPenalty;
}

export function getFoodCrisisProductivity() {
    return 1 - clamp(state.economy?.foodCrisis?.severity, 0, 1) * ECONOMY_TUNING.crisisProductivityPenalty;
}

export function getDebtMarketFactor() {
    return 1 + getDebtPressure() * ECONOMY_TUNING.debtMarketPenalty;
}

export function getEconomyCycleSnapshot() {
    const economy = ensureEconomyCycleState();
    const ledger = economy.lastLedger && typeof economy.lastLedger === "object" ? economy.lastLedger : null;
    const inputs = getFoodDemandInputs();
    const demand = inputs.residents * ECONOMY_TUNING.foodPerResident +
        inputs.households * ECONOMY_TUNING.foodPerHousehold +
        inputs.livestock * ECONOMY_TUNING.foodPerLivestock;
    const storage = getFoodStorageCapacity();
    return {
        food: Math.max(0, number(state.resources?.food)),
        storageCapacity: storage,
        safeStorage: round2(storage * ECONOMY_TUNING.safeStorageRatio),
        spoilage: calculateFoodSpoilage(state.resources?.food, storage),
        demand: round2(demand),
        inflow: ledger ? round2(ledger.foodInflow) : Math.max(0, number(economy.foodAccounting.inflow)),
        shortage: ledger ? round2(ledger.foodShortage) : 0,
        balance: ledger ? round2(ledger.foodBalance) : 0,
        debt: round2(economy.debt),
        debtInterest: ledger ? round2(ledger.debtInterest) : 0,
        debtPressure: getDebtPressure(),
        crisis: { ...economy.foodCrisis, events: [...economy.foodCrisis.events] },
        residents: inputs.residents,
        households: inputs.households,
        livestock: inputs.livestock,
        taxRate: number(state.government?.taxRate, 10)
    };
}
