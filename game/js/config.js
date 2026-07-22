// ═══════════════════════════════════════════════════════════════
//  CONFIG — Konstanten, Größen, Farben, Bewegung
// ═══════════════════════════════════════════════════════════════

export const TILE_SIZE = 48;
export const WORLD_WIDTH = 160;
export const WORLD_HEIGHT = 160;
export const BASE_TICK_INTERVAL = 333;
export const SEASONS = ["SPRING", "SUMMER", "AUTUMN", "WINTER"];

// ── Icon-Größen je Einheitentyp (Radius in Pixeln) ───────────
export const ICON_RADIUS = {
    20: 13,   // VILLAGER
    21: 15,   // GUARD
    22: 14,   // ARCHER
    23: 17,   // KNIGHT
    24: 14,   // PRIEST
    30: 10,   // GOBLIN  (Enemy – wird aber als Icon gezeichnet)
    31: 14,   // ORC     (Enemy – wird aber als Icon gezeichnet)
    32: 18,   // TROLL   (Enemy – wird aber als Icon gezeichnet)
};

// ── Badge-Farben je Einheitentyp ──────────────────────────────
export const ROLE_COLORS = {
    20: "#2d5a30",   // VILLAGER  – dunkelgrün
    21: "#3b5a8c",   // GUARD     – stahlblau
    22: "#3f6b3f",   // ARCHER    – waldgrün
    23: "#7a6830",   // KNIGHT    – dunkelgold
    24: "#8a7a50",   // PRIEST    – altgold
    30: "#6b2c2c",   // GOBLIN    – dunkelrot
    31: "#4a5c2a",   // ORC       – olivgrün
    32: "#3a4a3a",   // TROLL    – moosgrün
};

// ── Geschwindigkeiten (Tiles/Sekunde) ─────────────────────────
export const UNIT_SPEED = {
    20: 1.1,   // VILLAGER
    21: 0.95,  // GUARD
    22: 1.05,  // ARCHER
    23: 1.3,   // KNIGHT
    24: 0.85,  // PRIEST
};

// ── Wander-Radius (Tiles) ────────────────────────────────────
export const WANDER_RADIUS = {
    20: 20,    // VILLAGER – großer Radius
    21: 10,    // GUARD   – eng am Posten
    22: 12,    // ARCHER
    23: 14,    // KNIGHT
    24: 9,     // PRIEST  – eng am Tempel
};

// ── Tagesablauf-Phasen (in Simulationsticks) ─────────────────
export const ROUTINE = {
    WORK_DURATION:   180,   // wie lange gearbeitet wird
    BREAK_DURATION:  60,    // Pause danach
    REST_DURATION:   90,    // Ruhezeit zuhause
    GO_TO_WORK:      0,
    WORKING:         1,
    ON_BREAK:        2,
    GO_HOME:         3,
    RESTING:         4,
};

// ── Flucht-Distanz (Tiles) ───────────────────────────────────
export const FLEE_DISTANCE = 14;
export const FLEE_SPEED_MULT = 2.2;
