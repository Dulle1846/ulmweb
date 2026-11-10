// Settlement population: housing capacity and measured yearly household growth.
import { TYPE } from "../core/types.js";
import { state } from "../core/state.js";
import { spawnEntity,canSpawnEntity } from "../world/entities.js";
import { randInt as seededRandInt } from "../core/random.js";
import { getRoomBonusSnapshot } from "./rooms.js";
import { HOUSING_TIERS, housingCapacityFor, isHousingType } from "./city-config.js";
import { canSettleNewcomer } from "./settlement.js";
import { getFaithModifiers } from "./faith.js";
import { getJusticeModifiers } from "./justice.js";
const randInt=(min,max)=>seededRandInt(min,max,"population");
const housingEntities=()=>state.entities.filter(entity=>!entity.dead&&isHousingType(entity.type));
const capacityOf=house=>housingCapacityFor(house.type);

export const RESIDENTS_PER_HOUSE = HOUSING_TIERS[TYPE.HOUSE].capacity;
export const POPULATION_GROWTH_FOOD_RESERVE = 0.75;
export const POPULATION_GROWTH_MORALE = 55;
// One growth event per year made the final ambition mathematically
// unreachable: a 20-resident opening could reach at most 44 residents by year
// 25. A settlement that has food, housing and services can now welcome two
// residents a year, with births counting toward that same allowance.
export const POPULATION_GROWTH_PER_YEAR = 2;

export function getPopulationGrowthMoraleThreshold() {
    const growth = Math.max(0, Number(getRoomBonusSnapshot().totals.growth) || 0);
    return Math.max(30, POPULATION_GROWTH_MORALE - growth);
}

export function getHousingSnapshot() {
    const population = state.entities.filter(entity => !entity.dead && entity.type === TYPE.VILLAGER).length;
    const houses = state.entities.filter(entity => !entity.dead && isHousingType(entity.type) && !(entity.construction && entity.construction.stage < 3));
    const capacity = houses.reduce((sum,house)=>sum+capacityOf(house),0);
    return {
        population,
        houses: houses.length,
        capacity,
        available: Math.max(0, capacity - population),
        overcrowded: population > capacity
    };
}

export function getHouseholdSnapshot() {
    const houses = housingEntities().filter(house => !(house.construction && house.construction.stage < 3));
    const villagers = state.entities.filter(entity => !entity.dead && entity.type === TYPE.VILLAGER);
    const counts = new Map(houses.map(house => [house, 0]));
    for (const villager of villagers) {
        const home = houses.find(house => villager.home?.x === house.x && villager.home?.y === house.y);
        if (home) counts.set(home, counts.get(home) + 1);
    }
    return {
        households: houses.length,
        housed: [...counts.values()].reduce((sum, count) => sum + count, 0),
        unhoused: villagers.length - [...counts.values()].reduce((sum, count) => sum + count, 0),
        homes: houses.map(house => ({ x: house.x, y: house.y, residents: counts.get(house), capacity: capacityOf(house), type: house.type }))
    };
}

// Repairs older saves whose villagers used workplaces as their home anchor.
// Assignments are deterministic and never exceed the four-resident household limit.
export function normalizeHouseholdAssignments() {
    const houses = housingEntities().filter(house => !(house.construction && house.construction.stage < 3));
    if (!houses.length) return getHouseholdSnapshot();
    const counts = new Map(houses.map(house => [house, 0]));
    const villagers = state.entities.filter(entity => !entity.dead && entity.type === TYPE.VILLAGER);
    for (const villager of villagers) {
        const current = houses.find(house => villager.home?.x === house.x && villager.home?.y === house.y);
        if (current && counts.get(current) < capacityOf(current)) {
            counts.set(current, counts.get(current) + 1);
            villager.householdId = `house:${current.x}:${current.y}`;
            if (!Number.isFinite(villager.lastAgedYear)) villager.lastAgedYear = state.year;
            continue;
        }
        const candidates = houses
            .filter(house => counts.get(house) < capacityOf(house))
            .sort((a, b) => {
                const occupancy = counts.get(a) - counts.get(b);
                if (occupancy) return occupancy;
                const da = Math.hypot(villager.x - a.x, villager.y - a.y);
                const db = Math.hypot(villager.x - b.x, villager.y - b.y);
                return da - db;
            });
        const home = candidates[0];
        if (!home) continue;
        counts.set(home, counts.get(home) + 1);
        villager.home = { x: home.x, y: home.y };
        villager.anchor = { x: home.x, y: home.y };
        villager.householdId = `house:${home.x}:${home.y}`;
        if (!Number.isFinite(villager.lastAgedYear)) villager.lastAgedYear = state.year;
    }
    return getHouseholdSnapshot();
}

function chooseAvailableHouse() {
    const snapshot = getHouseholdSnapshot();
    const counts = new Map(snapshot.homes.map(home => [`${home.x}:${home.y}`, home.residents]));
    return state.entities
        .filter(entity => !entity.dead && isHousingType(entity.type) && !(entity.construction && entity.construction.stage < 3))
        .filter(house => (counts.get(`${house.x}:${house.y}`) || 0) < capacityOf(house))
        .sort((a, b) => {
            const occupancy = (counts.get(`${a.x}:${a.y}`) || 0) - (counts.get(`${b.x}:${b.y}`) || 0);
            if (occupancy) return occupancy;
            return a.y - b.y || a.x - b.x;
        })[0] || null;
}

export function canAccommodateVillagers(count = 1) {
    const numericCount = Number(count);
    if (!Number.isSafeInteger(numericCount) || numericCount < 0) return false;
    return getHousingSnapshot().available >= numericCount;
}

function ensureGrowthYear(economy) {
    if (Number(economy.growthYear) !== state.year) {
        economy.growthYear = state.year;
        economy.growthThisYear = 0;
    }
}

// Births and immigration share one yearly allowance. Births are a natural
// increase, not a second free slot, so a large family cannot outrun housing.
export function recordPopulationGrowth({ immigration = true } = {}) {
    const economy = state.economy || (state.economy = {});
    ensureGrowthYear(economy);
    economy.growthThisYear = Math.max(0, Number(economy.growthThisYear) || 0) + 1;
    if (immigration) economy.populationGrowth = Math.max(0, Number(economy.populationGrowth) || 0) + 1;
    economy.lastGrowthYear = state.year;
}

// A new resident may join at the start of a new year when food, morale and
// housing all support it. Two residents may join each year, which keeps the
// 25-year population ambition reachable without weakening the household gate.
// The gate is exposed so the population panel can explain a stalled realm
// instead of silently showing free beds and no growth.
export function getPopulationGrowthGate() {
    const housing = getHousingSnapshot();
    const moraleGate = getPopulationGrowthMoraleThreshold();
    if (housing.available < 1) {
        return { ok: false, reason: "No free housing", housing, moraleGate };
    }
    const migration = getFaithModifiers().migrationFactor * getJusticeModifiers().migrationFactor;
    const effectiveMoraleGate = moraleGate + Math.round(Math.max(0, 1 - migration) * 28);
    if (state.morale < effectiveMoraleGate) {
        return { ok: false, reason: "Household morale is too low", housing, moraleGate: effectiveMoraleGate };
    }
    const foodFloor = housing.population * POPULATION_GROWTH_FOOD_RESERVE;
    if ((state.resources.food || 0) < foodFloor) {
        return { ok: false, reason: "The food reserve is below the growth floor", housing, moraleGate: effectiveMoraleGate, foodFloor };
    }
    if (state.city?.enabled) {
        const gate = canSettleNewcomer();
        if (!gate.ok) return { ok: false, reason: gate.reason, housing, moraleGate: effectiveMoraleGate, foodFloor };
    }
    if (!canSpawnEntity(TYPE.VILLAGER)) {
        return { ok: false, reason: "The world population cap is reached", housing, moraleGate: effectiveMoraleGate, foodFloor };
    }
    return { ok: true, reason: null, housing, moraleGate: effectiveMoraleGate, foodFloor };
}

export function updatePopulation() {
    if (state.tick <= 0 || state.year <= 1) return null;
    const economy = state.economy || (state.economy = {});
    ensureGrowthYear(economy);
    let newest = null;

    while ((Number(economy.growthThisYear) || 0) < POPULATION_GROWTH_PER_YEAR) {
        const gate = getPopulationGrowthGate();
        if (!gate.ok) break;

        normalizeHouseholdAssignments();
        const home = chooseAvailableHouse();
        if (!home) break;

        const villager = spawnEntity(
            home.x + randInt(-2, 3),
            home.y + randInt(-2, 3),
            TYPE.VILLAGER
        );
        if (!villager) break;
        villager.home = { x: home.x, y: home.y };
        villager.anchor = { x: home.x, y: home.y };
        villager.householdId = `house:${home.x}:${home.y}`;
        villager.lastAgedYear = state.year;
        villager.jobRefreshTimer = 0;
        villager.civicOrigin = "settler";
        recordPopulationGrowth();
        newest = villager;
    }
    return newest;
}
