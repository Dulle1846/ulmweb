// ========================================================
// CASTLEFORGE — Configuration & Constants
// ========================================================

// World dimensions
export const TILE_SIZE = 48
export const WORLD_WIDTH = 160
export const WORLD_HEIGHT = 160

// Game timing
export const BASE_TICK_INTERVAL = 333 // ms between ticks at x1

// Time system
export const SEASONS = ["SPRING", "SUMMER", "AUTUMN", "WINTER"]

// Entity types
export const TYPE = {
    // Buildings
    KEEP: 0,
    HOUSE: 1,
    FARM: 2,
    LUMBER: 3,
    QUARRY: 4,
    TOWER: 5,
    WALL: 6,
    TAVERN: 7,
    TEMPLE: 8,
    BARRACKS: 9,
    MILL: 10,
    STABLE: 11,
    WONDER: 12,
    
    // Friendly units
    VILLAGER: 20,
    GUARD: 21,
    ARCHER: 22,
    KNIGHT: 23,
    PRIEST: 24,
    
    // Enemies
    GOBLIN: 30,
    ORC: 31,
    TROLL: 32,
    
    // Wildlife
    DEER: 40,
    RUIN: 50
}

// Terrain types
export const TERRAIN = {
    WATER: "water",
    FOREST: "forest",
    ROCK: "rock",
    RUINS: "ruins",
    GRASS: "grass"
}

// Weather
export const WEATHER = {
    CLEAR: "clear",
    RAIN: "rain",
    SNOW: "snow",
    STORM: "storm"
}

// UI IDs
export const UI = {
    CANVAS: "canvas",
    MINIMAP: "minimap",
    MORALE_BAR: "morale-bar",
    MORALE_VALUE: "morale-value",
    SEASON: "season",
    YEAR: "year",
    RES_WOOD: "res-wood",
    RES_STONE: "res-stone",
    RES_GOLD: "res-gold",
    RES_FOOD: "res-food",
    WOOD_INCOME: "wood-income",
    STONE_INCOME: "stone-income",
    GOLD_INCOME: "gold-income",
    FOOD_INCOME: "food-income",
    TICK_COUNT: "tick-count",
    POPULATION: "population",
    PAUSE_TEXT: "pause-text",
    KINGDOM_NAME: "kingdom-name",
    CARD_CONTAINER: "card-container",
    CARD_ICON: "card-icon",
    CARD_NAME: "card-name",
    CARD_DESC: "card-desc",
    CARD_COST_WOOD: "card-cost-wood",
    CARD_COST_STONE: "card-cost-stone",
    CARD_COST_GOLD: "card-cost-gold",
    TAB_CONTENT: "tab-content",
    HINT_BOX: "hint-box",
    HINT_TEXT: "hint-text",
    FLOATING_MESSAGES: "floating-messages",
    BIG_MESSAGE: "big-message",
    BIG_TITLE: "big-title",
    BIG_SUBTITLE: "big-subtitle"
}

// Max HP for each entity type
export const MAX_HP = {
    [TYPE.KEEP]: 1200,
    [TYPE.HOUSE]: 180,
    [TYPE.FARM]: 90,
    [TYPE.LUMBER]: 110,
    [TYPE.QUARRY]: 140,
    [TYPE.WALL]: 450,
    [TYPE.TOWER]: 220,
    [TYPE.TAVERN]: 160,
    [TYPE.TEMPLE]: 210,
    [TYPE.BARRACKS]: 280,
    [TYPE.MILL]: 130,
    [TYPE.STABLE]: 170,
    [TYPE.WONDER]: 9999,
    [TYPE.VILLAGER]: 35,
    [TYPE.GUARD]: 160,
    [TYPE.ARCHER]: 95,
    [TYPE.KNIGHT]: 240,
    [TYPE.PRIEST]: 70,
    [TYPE.GOBLIN]: 45,
    [TYPE.ORC]: 110,
    [TYPE.TROLL]: 240,
    [TYPE.DEER]: 25
}
