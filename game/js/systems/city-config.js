// Shared data for the city-builder simulation. Keeping costs, goods, recipes
// and service radii in one frozen module prevents the UI and the simulation
// from drifting into different versions of the same rules.
import { TYPE } from "../core/types.js";

export const CITY_VERSION = 1;

export const NEW_BUILDING_TYPES = Object.freeze([
    TYPE.TENT, TYPE.STONE_HOUSE, TYPE.WAREHOUSE, TYPE.SAWMILL, TYPE.BAKERY,
    TYPE.WELL, TYPE.MASON, TYPE.FORESTER, TYPE.CLINIC, TYPE.MARKET,
    TYPE.SHRINE, TYPE.COURT, TYPE.PRISON
]);

export const BUILDING_LABELS = Object.freeze({
    [TYPE.KEEP]: "Royal Keep",
    [TYPE.HOUSE]: "Timber Cottage",
    [TYPE.FARM]: "Farmstead",
    [TYPE.LUMBER]: "Lumber Camp",
    [TYPE.QUARRY]: "Stone Quarry",
    [TYPE.TOWER]: "Watchtower",
    [TYPE.WALL]: "Defensive Wall",
    [TYPE.TAVERN]: "Tavern",
    [TYPE.TEMPLE]: "Temple",
    [TYPE.BARRACKS]: "Barracks",
    [TYPE.MILL]: "Flour Mill",
    [TYPE.STABLE]: "Stable",
    [TYPE.WONDER]: "Wonder",
    [TYPE.GOLDMINE]: "Gold Mine",
    [TYPE.BARREL]: "Supply Barrel",
    [TYPE.TENT]: "Tent",
    [TYPE.STONE_HOUSE]: "Stone House",
    [TYPE.WAREHOUSE]: "Warehouse",
    [TYPE.SAWMILL]: "Sawmill",
    [TYPE.BAKERY]: "Bakery",
    [TYPE.WELL]: "Well",
    [TYPE.MASON]: "Mason's Yard",
    [TYPE.FORESTER]: "Forester's Lodge",
    [TYPE.CLINIC]: "Clinic",
    [TYPE.MARKET]: "Market",
    [TYPE.SHRINE]: "Shrine",
    [TYPE.COURT]: "Court of Law",
    [TYPE.PRISON]: "Prison"
});

// Direct construction uses the same material language as the card catalogue.
// These are catalogue costs, never a hidden second price.
export const BUILDING_COSTS = Object.freeze({
    [TYPE.KEEP]: Object.freeze({ wood: 60, stone: 60, gold: 20 }),
    [TYPE.HOUSE]: Object.freeze({ wood: 22, stone: 8 }),
    [TYPE.FARM]: Object.freeze({ wood: 16, food: 10 }),
    [TYPE.LUMBER]: Object.freeze({ wood: 26, stone: 6 }),
    [TYPE.QUARRY]: Object.freeze({ wood: 24, stone: 12 }),
    [TYPE.TOWER]: Object.freeze({ wood: 18, stone: 24 }),
    [TYPE.WALL]: Object.freeze({ stone: 10 }),
    [TYPE.TAVERN]: Object.freeze({ wood: 30, stone: 10, gold: 8 }),
    [TYPE.TEMPLE]: Object.freeze({ stone: 30, gold: 10 }),
    [TYPE.BARRACKS]: Object.freeze({ wood: 28, stone: 16, gold: 6 }),
    [TYPE.MILL]: Object.freeze({ wood: 24, stone: 8 }),
    [TYPE.STABLE]: Object.freeze({ wood: 24, food: 8 }),
    [TYPE.WONDER]: Object.freeze({ stone: 70, gold: 40 }),
    [TYPE.GOLDMINE]: Object.freeze({ wood: 30, stone: 18 }),
    [TYPE.BARREL]: Object.freeze({ wood: 4 }),
    [TYPE.TENT]: Object.freeze({ wood: 8, food: 3 }),
    [TYPE.STONE_HOUSE]: Object.freeze({ wood: 18, stone: 30 }),
    [TYPE.WAREHOUSE]: Object.freeze({ wood: 34, stone: 14 }),
    [TYPE.SAWMILL]: Object.freeze({ wood: 28, stone: 10 }),
    [TYPE.BAKERY]: Object.freeze({ wood: 22, stone: 14, food: 5 }),
    [TYPE.WELL]: Object.freeze({ wood: 8, stone: 18 }),
    [TYPE.MASON]: Object.freeze({ wood: 20, stone: 22 }),
    [TYPE.FORESTER]: Object.freeze({ wood: 16, stone: 4 }),
    [TYPE.CLINIC]: Object.freeze({ wood: 24, stone: 18, gold: 6 }),
    [TYPE.MARKET]: Object.freeze({ wood: 26, stone: 8, gold: 5 }),
    [TYPE.SHRINE]: Object.freeze({ wood: 6, stone: 18, gold: 4 }),
    [TYPE.COURT]: Object.freeze({ wood: 30, stone: 24, gold: 10 }),
    [TYPE.PRISON]: Object.freeze({ wood: 22, stone: 30, gold: 8 })
});

export const BUILD_MENU = Object.freeze([
    Object.freeze({ id: "roads", label: "ROADS", note: "Dirt, gravel and paved routes. Roads change real travel speed and upkeep." }),
    Object.freeze({ id: "housing", label: "HOUSING", types: Object.freeze([TYPE.TENT, TYPE.HOUSE, TYPE.STONE_HOUSE]) }),
    Object.freeze({ id: "production", label: "PRODUCTION", types: Object.freeze([TYPE.LUMBER, TYPE.SAWMILL, TYPE.FARM, TYPE.MILL, TYPE.BAKERY, TYPE.QUARRY, TYPE.MASON, TYPE.GOLDMINE, TYPE.STABLE]) }),
    Object.freeze({ id: "storage", label: "STORAGE", types: Object.freeze([TYPE.WAREHOUSE]) }),
    Object.freeze({ id: "services", label: "SERVICES", types: Object.freeze([TYPE.WELL, TYPE.TAVERN, TYPE.TEMPLE, TYPE.MARKET, TYPE.CLINIC]) }),
    Object.freeze({ id: "faith", label: "FAITH", types: Object.freeze([TYPE.SHRINE]) }),
    Object.freeze({ id: "justice", label: "JUSTICE", types: Object.freeze([TYPE.COURT, TYPE.PRISON]) }),
    Object.freeze({ id: "military", label: "MILITARY", types: Object.freeze([TYPE.TOWER, TYPE.WALL, TYPE.BARRACKS]) }),
    Object.freeze({ id: "nature", label: "NATURE", types: Object.freeze([TYPE.FORESTER]) })
]);

export const GOODS = Object.freeze({
    logs: Object.freeze({ label: "Logs", plural: "logs" }),
    planks: Object.freeze({ label: "Planks", plural: "planks" }),
    stoneBlocks: Object.freeze({ label: "Stone blocks", plural: "stone blocks" }),
    cutStone: Object.freeze({ label: "Cut stone", plural: "cut stone" }),
    grain: Object.freeze({ label: "Grain", plural: "grain" }),
    flour: Object.freeze({ label: "Flour", plural: "flour" }),
    bread: Object.freeze({ label: "Bread", plural: "bread" }),
    water: Object.freeze({ label: "Water", plural: "water" }),
    firewood: Object.freeze({ label: "Firewood", plural: "firewood" })
});

export const GOOD_KEYS = Object.freeze(Object.keys(GOODS));

// A warehouse profile is not a second building type: it narrows what an
// existing store accepts and how much it can hold. The royal keep is always a
// general store so bread and construction materials can always find a home.
export const WAREHOUSE_PROFILES = Object.freeze({
    general: Object.freeze({ id: "general", label: "General store", capacity: 180, filters: GOOD_KEYS, description: "Accepts every hauled good." }),
    timber: Object.freeze({ id: "timber", label: "Timber yard", capacity: 220, filters: Object.freeze(["logs", "planks", "firewood"]), description: "Logs, planks and firewood only." }),
    stone: Object.freeze({ id: "stone", label: "Stone depot", capacity: 220, filters: Object.freeze(["stoneBlocks", "cutStone"]), description: "Rough and dressed stone only." }),
    food: Object.freeze({ id: "food", label: "Granary", capacity: 210, filters: Object.freeze(["grain", "flour", "bread"]), description: "Grain, flour and bread only." }),
    water: Object.freeze({ id: "water", label: "Cistern", capacity: 160, filters: Object.freeze(["water"]), description: "Drawn water only." })
});
export const WAREHOUSE_PROFILE_IDS = Object.freeze(Object.keys(WAREHOUSE_PROFILES));

export function warehouseProfile(id) {
    return WAREHOUSE_PROFILES[id] || WAREHOUSE_PROFILES.general;
}

// Recipes run in bounded batches. A producer first fills its local output or
// input store; carriers move goods between those stores and a warehouse.
export const RECIPES = Object.freeze({
    [TYPE.LUMBER]: Object.freeze({ label: "Harvest timber", workers: 3, site: "forest", output: Object.freeze({ logs: 2 }), outputCapacity: 28, batch: 2 }),
    [TYPE.SAWMILL]: Object.freeze({ label: "Saw planks", workers: 2, input: Object.freeze({ logs: 2 }), output: Object.freeze({ planks: 2, firewood: 1 }), inputCapacity: 28, outputCapacity: 32, batch: 2 }),
    [TYPE.FARM]: Object.freeze({ label: "Grow grain", workers: 4, field: true, output: Object.freeze({ grain: 2 }), outputCapacity: 36, batch: 2 }),
    [TYPE.MILL]: Object.freeze({ label: "Mill flour", workers: 2, input: Object.freeze({ grain: 2 }), output: Object.freeze({ flour: 2 }), inputCapacity: 28, outputCapacity: 28, batch: 2 }),
    [TYPE.BAKERY]: Object.freeze({ label: "Bake bread", workers: 2, input: Object.freeze({ flour: 1 }), output: Object.freeze({ bread: 4 }), inputCapacity: 24, outputCapacity: 24, batch: 1 }),
    [TYPE.QUARRY]: Object.freeze({ label: "Cut stone blocks", workers: 4, site: "stone", output: Object.freeze({ stoneBlocks: 3 }), outputCapacity: 32, batch: 3 }),
    [TYPE.MASON]: Object.freeze({ label: "Dress cut stone", workers: 2, input: Object.freeze({ stoneBlocks: 2 }), output: Object.freeze({ cutStone: 2 }), inputCapacity: 28, outputCapacity: 28, batch: 2 }),
    // A dug well draws groundwater and therefore works inland, unlike a
    // river-fed works. Water access still affects household service coverage.
    [TYPE.WELL]: Object.freeze({ label: "Draw water", workers: 1, output: Object.freeze({ water: 3 }), outputCapacity: 24, batch: 3 }),
    [TYPE.FORESTER]: Object.freeze({ label: "Plant and tend the forest", workers: 2, site: "forest", output: Object.freeze({}), outputCapacity: 0, batch: 0 })
});

export const HOUSING_TIERS = Object.freeze({
    [TYPE.TENT]: Object.freeze({ label: "Tent", capacity: 2, comfort: 0.35, warmth: 0.35 }),
    [TYPE.HOUSE]: Object.freeze({ label: "Timber cottage", capacity: 4, comfort: 0.7, warmth: 0.65 }),
    [TYPE.STONE_HOUSE]: Object.freeze({ label: "Stone house", capacity: 6, comfort: 0.95, warmth: 1 })
});

export const CONSTRUCTION_STAGES = Object.freeze([
    Object.freeze({ id: "site", label: "SITE PREPARATION", days: 1, material: "planks" }),
    Object.freeze({ id: "foundation", label: "FOUNDATION", days: 2, material: "cutStone" }),
    Object.freeze({ id: "frame", label: "TIMBER FRAME", days: 2, material: "planks" }),
    Object.freeze({ id: "complete", label: "COMPLETED", days: 0, material: null })
]);
export const CONSTRUCTION_SHARE = 0.25;

export const SERVICE_DEFINITIONS = Object.freeze({
    water: Object.freeze({ label: "Water", types: Object.freeze([TYPE.WELL]), radius: 8, color: "#548ca8" }),
    social: Object.freeze({ label: "Social life", types: Object.freeze([TYPE.TAVERN, TYPE.TEMPLE, TYPE.SHRINE, TYPE.MARKET]), radius: 7, color: "#b57942" }),
    safety: Object.freeze({ label: "Safety", types: Object.freeze([TYPE.TOWER, TYPE.WALL, TYPE.BARRACKS, TYPE.COURT, TYPE.PRISON]), radius: 7, color: "#7b8b57" }),
    justice: Object.freeze({ label: "Justice", types: Object.freeze([TYPE.COURT, TYPE.PRISON]), radius: 8, color: "#8c7f6a" }),
    health: Object.freeze({ label: "Health", types: Object.freeze([TYPE.CLINIC, TYPE.TEMPLE, TYPE.SHRINE]), radius: 6, color: "#9a6d7e" })
});

export function isHousingType(type) {
    return Object.prototype.hasOwnProperty.call(HOUSING_TIERS, type);
}

export function housingCapacityFor(type) {
    return HOUSING_TIERS[type]?.capacity || 0;
}

export function buildingLabel(type) {
    return BUILDING_LABELS[type] || "Structure";
}

export function normalizeCost(cost) {
    const result = {};
    for (const key of ["wood", "stone", "gold", "food"]) {
        const value = Number(cost?.[key]);
        if (Number.isFinite(value) && value > 0) result[key] = value;
    }
    return result;
}

export function totalCost(cost) {
    return Object.values(normalizeCost(cost)).reduce((sum, value) => sum + value, 0);
}

export function constructionMaterialNeed(cost) {
    const normalized = normalizeCost(cost);
    return {
        planks: Math.max(1, Math.ceil((normalized.wood || 0) / 14)),
        cutStone: Math.max(1, Math.ceil((normalized.stone || 0) / 18))
    };
}

export function costShare(cost, share = CONSTRUCTION_SHARE) {
    const normalized = normalizeCost(cost);
    const result = {};
    for (const [key, value] of Object.entries(normalized)) result[key] = value * share;
    return result;
}
