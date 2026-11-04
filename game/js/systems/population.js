// Settlement population: housing capacity and measured yearly household growth.
import { TYPE } from "../core/types.js";
import { state } from "../core/state.js";
import { spawnEntity,canSpawnEntity } from "../world/entities.js";
import { randInt } from "../core/utils.js";

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

export function canAccommodateVillagers(count = 1) {
    const requested = Math.max(0, Math.floor(Number(count) || 0));
    return getHousingSnapshot().available >= requested;
}

// A single household may join at the start of a new year when food, morale and
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

    const home = state.entities.find(entity => !entity.dead && entity.type === TYPE.HOUSE)
        || state.entities.find(entity => !entity.dead && entity.type === TYPE.KEEP);
    if (!home) return null;

    const villager = spawnEntity(
        home.x + randInt(-2, 3),
        home.y + randInt(-2, 3),
        TYPE.VILLAGER
    );
    if (!villager) return null;
    villager.home = { x: home.x, y: home.y };
    villager.anchor = { x: home.x, y: home.y };
    villager.jobRefreshTimer = 0;
    economy.populationGrowth = Math.max(0, Number(economy.populationGrowth) || 0) + 1;
    return villager;
}
