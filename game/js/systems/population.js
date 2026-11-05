// Settlement population: housing capacity and measured yearly household growth.
import { TYPE } from "../core/types.js";
import { state } from "../core/state.js";
import { spawnEntity,canSpawnEntity } from "../world/entities.js";
import { randInt as seededRandInt } from "../core/random.js";
const randInt=(min,max)=>seededRandInt(min,max,"population");

export const RESIDENTS_PER_HOUSE = 4;
export const POPULATION_GROWTH_FOOD_RESERVE = 0.75;
export const POPULATION_GROWTH_MORALE = 55;

export function getHousingSnapshot() {
    const population = state.entities.filter(entity => !entity.dead && entity.type === TYPE.VILLAGER).length;
    const houses = state.entities.filter(entity => !entity.dead && entity.type === TYPE.HOUSE).length;
    const capacity = houses * RESIDENTS_PER_HOUSE;
    return {
        population,
        houses,
        capacity,
        available: Math.max(0, capacity - population),
        overcrowded: population > capacity
    };
}

export function getHouseholdSnapshot() {
    const houses = state.entities.filter(entity => !entity.dead && entity.type === TYPE.HOUSE);
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
        homes: houses.map(house => ({ x: house.x, y: house.y, residents: counts.get(house), capacity: RESIDENTS_PER_HOUSE }))
    };
}

// Repairs older saves whose villagers used workplaces as their home anchor.
// Assignments are deterministic and never exceed the four-resident household limit.
export function normalizeHouseholdAssignments() {
    const houses = state.entities.filter(entity => !entity.dead && entity.type === TYPE.HOUSE);
    if (!houses.length) return getHouseholdSnapshot();
    const counts = new Map(houses.map(house => [house, 0]));
    const villagers = state.entities.filter(entity => !entity.dead && entity.type === TYPE.VILLAGER);
    for (const villager of villagers) {
        const current = houses.find(house => villager.home?.x === house.x && villager.home?.y === house.y);
        if (current && counts.get(current) < RESIDENTS_PER_HOUSE) {
            counts.set(current, counts.get(current) + 1);
            villager.householdId = `house:${current.x}:${current.y}`;
            if (!Number.isFinite(villager.lastAgedYear)) villager.lastAgedYear = state.year;
            continue;
        }
        const candidates = houses
            .filter(house => counts.get(house) < RESIDENTS_PER_HOUSE)
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
        .filter(entity => !entity.dead && entity.type === TYPE.HOUSE)
        .filter(house => (counts.get(`${house.x}:${house.y}`) || 0) < RESIDENTS_PER_HOUSE)
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

// A new resident may join at the start of a new year when food, morale and
// housing all support it. The year marker prevents duplicate growth on reload.
export function updatePopulation() {
    if (state.tick <= 0 || state.year <= 1) return null;
    const economy = state.economy || (state.economy = {});
    const lastGrowthYear = Number.isFinite(economy.lastGrowthYear) ? economy.lastGrowthYear : 1;
    if (state.year <= lastGrowthYear) return null;

    economy.lastGrowthYear = state.year;
    const housing = getHousingSnapshot();
    if (housing.available < 1 || state.morale < POPULATION_GROWTH_MORALE) return null;
    if ((state.resources.food || 0) < housing.population * POPULATION_GROWTH_FOOD_RESERVE) return null;
    if (!canSpawnEntity(TYPE.VILLAGER)) return null;

    normalizeHouseholdAssignments();
    const home = chooseAvailableHouse();
    if (!home) return null;

    const villager = spawnEntity(
        home.x + randInt(-2, 3),
        home.y + randInt(-2, 3),
        TYPE.VILLAGER
    );
    if (!villager) return null;
    villager.home = { x: home.x, y: home.y };
    villager.anchor = { x: home.x, y: home.y };
    villager.householdId = `house:${home.x}:${home.y}`;
    villager.lastAgedYear = state.year;
    villager.jobRefreshTimer = 0;
    economy.populationGrowth = Math.max(0, Number(economy.populationGrowth) || 0) + 1;
    return villager;
}
