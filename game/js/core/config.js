// ═══════════════════════════════════════════════════════════════
//  CONFIG — Konstanten, Zoom, Terrain, Bewegung
// ═══════════════════════════════════════════════════════════════

// ── Weltgröße (in logischen Einheiten / "Tiles") ─────────────
export const WORLD_W = 160;
export const WORLD_H = 160;
export const CELL = 48;                       // Pixel pro logischer Einheit bei Zoom 1.0

export const BASE_TICK_INTERVAL = 750;        // ms per in-game day at 1x; seasons become readable, strategic intervals.
export const MOVEMENT_TICK_REFERENCE_MS = 333; // legacy movement scale used before the slower day clock.
export const SEASONS = ["SPRING", "SUMMER", "AUTUMN", "WINTER"];

// ═══════════════════════════════════════════════════════════════
//  ZOOM
// ═══════════════════════════════════════════════════════════════

export const ZOOM_MIN          = 0.055;
export const ZOOM_MAX          = 4.2;
export const ZOOM_SPEED        = 0.00135;      // Faktor pro wheel-delta-Pixel
export const ZOOM_LERP         = 0.12;        // Frame-rate-independent smoothing at a 60 Hz reference rate

// Vier visuelle Zoom-Ebenen: Landschaft, Bezirke, Dächer, Innenräume.
export const ZOOM_THRESHOLD_DISTRICTS = 0.14;
export const ZOOM_THRESHOLD_ROOFTOPS = 0.55;
export const ZOOM_THRESHOLD_INTERIORS = 1.55;

// ═══════════════════════════════════════════════════════════════
//  PERLIN NOISE — Terrain
// ═══════════════════════════════════════════════════════════════

export const NOISE_SCALE       = 0.018;       // Hauptfrequenz
export const NOISE_OCTAVES     = 6;
export const NOISE_PERSISTENCE = 0.52;
export const NOISE_LACUNARITY  = 2.1;

// Biom-Schwellen (Noise 0..1)
export const BIOME = {
    DEEP_WATER:   0.28,
    SHALLOW_WATER:0.33,
    SAND:         0.37,
    GRASS:        0.58,
    DENSE_GRASS:  0.66,
    FOREST:       0.78,
    DENSE_FOREST: 0.86,
    ROCK:         0.92,
    SNOW:         1.01,
};

// Biom-Farben (Basis — werden mit Noise moduliert)
export const BIOME_COLORS = {
    DEEP_WATER:    [21, 67, 96],
    SHALLOW_WATER: [41, 105, 140],
    SAND:          [194, 178, 128],
    GRASS:         [62, 124, 62],
    DENSE_GRASS:   [48, 107, 48],
    FOREST:        [30, 78, 30],
    DENSE_FOREST:  [22, 58, 22],
    ROCK:          [105, 100, 92],
    SNOW:          [220, 225, 230],
};

// ═══════════════════════════════════════════════════════════════
//  EINHEITEN — Bewegung
// ═══════════════════════════════════════════════════════════════

export const UNIT_SPEED = {
    20: 1.1,    // VILLAGER
    21: 0.95,   // GUARD
    22: 1.05,   // ARCHER
    23: 1.3,    // KNIGHT
    24: 0.85,   // PRIEST
};

export const WANDER_RADIUS = {
    20: 20,
    21: 10,
    22: 12,
    23: 14,
    24: 9,
};

export const ICON_RADIUS = {
    20: 13, 21: 15, 22: 14, 23: 17, 24: 14,
    30: 10, 31: 14, 32: 18,
};

export const ROLE_COLORS = {
    20: "#2d5a30", 21: "#3b5a8c", 22: "#3f6b3f",
    23: "#7a6830", 24: "#8a7a50",
    30: "#6b2c2c", 31: "#4a5c2a", 32: "#3a4a3a",
};

// ═══════════════════════════════════════════════════════════════
//  ROUTINEN
// ═══════════════════════════════════════════════════════════════

export const ROUTINE = {
    WORK_DURATION: 180,
    BREAK_DURATION: 60,
    REST_DURATION: 90,
    GO_TO_WORK: 0,
    WORKING: 1,
    ON_BREAK: 2,
    GO_HOME: 3,
    RESTING: 4,
};

export const FLEE_DISTANCE = 14;
export const FLEE_SPEED_MULT = 2.2;

// ═══════════════════════════════════════════════════════════════
//  GEBÄUDE — Größen (in World-Units) und Innenraum-Daten
// ═══════════════════════════════════════════════════════════════

export const BUILDING_SIZE = {
    0:  { w: 3, h: 3 },   // KEEP
    1:  { w: 1.6, h: 1.4 },   // HOUSE
    2:  { w: 2, h: 1.5 },   // FARM
    3:  { w: 1.6, h: 1.2 },   // LUMBER
    4:  { w: 1.8, h: 1.4 },   // QUARRY
    5:  { w: 1, h: 1 },   // TOWER
    6:  { w: 2, h: 0.6 },   // WALL
    7:  { w: 1.8, h: 1.6 },   // TAVERN
    8:  { w: 2, h: 1.6 },   // TEMPLE
    9:  { w: 2, h: 1.5 },   // BARRACKS
    10: { w: 1.4, h: 1.4 },   // MILL
    11: { w: 2, h: 1.4 },   // STABLE
    12: { w: 4, h: 4 },   // WONDER
    13: { w: 2.2, h: 2 }, // GOLDMINE
    14: { w: 0.7, h: 0.7 }, // BARREL
    60: { w: 1.2, h: 1.1 }, // TENT
    61: { w: 1.8, h: 1.6 }, // STONE HOUSE
    62: { w: 2.4, h: 2 },   // WAREHOUSE
    63: { w: 2, h: 1.8 },   // SAWMILL
    64: { w: 1.8, h: 1.4 }, // BAKERY
    65: { w: 1, h: 1 },     // WELL
    66: { w: 1.8, h: 1.4 }, // MASON
    67: { w: 1.4, h: 1.2 }, // FORESTER
    68: { w: 2, h: 1.5 },   // CLINIC
    69: { w: 1.8, h: 1.4 }, // MARKET
    70: { w: 1.3, h: 1.2 }, // SHRINE
    71: { w: 2.2, h: 1.8 }, // COURT
    72: { w: 2.2, h: 1.8 }, // PRISON
    73: { w: 2.6, h: 2.2 }, // TOWN HALL
    74: { w: 2.2, h: 1.8 }, // SCHOOL
    75: { w: 2.2, h: 1.8 }, // BATHHOUSE
    76: { w: 2, h: 1.7 },   // BREWERY
    77: { w: 2.4, h: 2 },   // GUILDHALL
    78: { w: 1.8, h: 1.5 }, // WATCHHOUSE
    79: { w: 2, h: 1.7 },   // SMITHY
    80: { w: 2.2, h: 1.8 }, // SCRIPTORIUM
};

// Gebäude-Dachfarben (für Level-1-Icons und Level-2-Top-Down)
export const BUILDING_ROOF_COLOR = {
    0:  "#6e695c",  // KEEP  — Stein
    1:  "#b5432e",  // HOUSE — Ziegel
    2:  "#8a7a3c",  // FARM  — Stroh
    3:  "#4a5d3a",  // LUMBER — Grün
    4:  "#5f5b52",  // QUARRY — Grau
    5:  "#6e695c",  // TOWER — Stein
    6:  "#8a8578",  // WALL  — Grau
    7:  "#5a4632",  // TAVERN — Braun
    8:  "#d9d2c0",  // TEMPLE — Weiß
    9:  "#4a3e32",  // BARRACKS — Dunkelbraun
    10: "#8a5f38",  // MILL  — Holz
    11: "#5a4632",  // STABLE — Braun
    12: "#f2c744",  // WONDER — Gold
    13: "#b99139",  // GOLDMINE — Gold ore
    14: "#795a3b",  // BARREL — Supplies
    60: "#a58b65",  // TENT — canvas
    61: "#746d62",  // STONE HOUSE — slate
    62: "#6d5437",  // WAREHOUSE — timber
    63: "#6b5834",  // SAWMILL — sawdust
    64: "#a0713e",  // BAKERY — crust
    65: "#587a80",  // WELL — water
    66: "#777168",  // MASON — stone
    67: "#3f6639",  // FORESTER — green
    68: "#8d6b55",  // CLINIC — clay
    69: "#9a6b3f",  // MARKET — awning
    70: "#cfc6ae",  // SHRINE — pale stone
    71: "#6b7078",  // COURT — slate
    72: "#54504a",  // PRISON — iron-grey
    73: "#7b6650",  // TOWN HALL — civic stone
    74: "#9c7547",  // SCHOOL — slate and timber
    75: "#6e8a8d",  // BATHHOUSE — steam blue
    76: "#a9753f",  // BREWERY — copper
    77: "#7d5a3d",  // GUILDHALL — guild timber
    78: "#5e6b61",  // WATCHHOUSE — guard green
    79: "#6a4932",  // SMITHY — forge brick
    80: "#7b6270",  // SCRIPTORIUM — ink and slate
};

// Gebäude-Icons für Level 1
export const BUILDING_ICON = {
    0:  "🏰", 1:  "🏠", 2:  "🌾", 3:  "🪵",
    4:  "⛰️", 5:  "🗼", 6:  "🧱", 7:  "🍺",
    8:  "⛪", 9:  "🛡️", 10: "⚙️", 11: "🐎",
    12: "✨", 13: "⛏️", 14: "🛢️",
    60: "⛺", 61: "🏛️", 62: "🏚️", 63: "🪚",
    64: "🥖", 65: "💧", 66: "🧱", 67: "🌱",
    68: "🩺", 69: "⚖️",
    70: "🕯️", 71: "🏛️", 72: "🔒",
    73: "🏛️", 74: "📚", 75: "🛁", 76: "🍺", 77: "⚖️", 78: "🛡️",
    79: "⚒️", 80: "✒️",
};

// ═══════════════════════════════════════════════════════════════
//  BACKWARD COMPATIBILITY — für Dateien, die wir nicht neu schrieben
// ═══════════════════════════════════════════════════════════════
export const WORLD_WIDTH  = WORLD_W;
export const WORLD_HEIGHT = WORLD_H;
export const TILE_SIZE    = CELL;
