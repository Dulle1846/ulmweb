// ═══════════════════════════════════════════════════════════════
//  STATE — Globaler veränderlicher Spielzustand
// ═══════════════════════════════════════════════════════════════

export const state = {
    // Canvas
    canvas: null,
    ctx: null,
    minimapCanvas: null,
    minimapCtx: null,

    // ── Kamera ───────────────────────────────────────────────
    camera: { x: 0, y: 0 },
    zoom: 1.0,
    zoomTarget: 1.0,
    zoomLevel: 2,               // 1, 2 oder 3 — wird per Frame berechnet

    // ── Timing ───────────────────────────────────────────────
    tick: 0,
    gameSpeed: 1,
    isPaused: false,
    tickAccumulator: 0,
    lastFrameTime: 0,

    // ── Win / Lose ───────────────────────────────────────────
    gameOver: false,
    victory: false,

    // ── Königreich ───────────────────────────────────────────
    kingdomName: "ELDRIA",

    resources: {
        wood: 180, stone: 95, gold: 45, food: 120, research: 0,
    },
    incomeThisTick: {
        wood: 0, stone: 0, gold: 0, food: 0, research: 0,
    },

    morale: 72,
    seasonIndex: 0,
    year: 1,
    dayOfYear: 0,

    // ── Karten ───────────────────────────────────────────────
    currentCard: null,
    availableCards: [],

    // ── UI ────────────────────────────────────────────────────
    selectedTab: 0,
    eventLog: [],

    // ── Technologie ──────────────────────────────────────────
    techs: [],
    unlockedTechs: new Set(),

    // ── Welt ─────────────────────────────────────────────────
    entities: [],
    particles: [],
    floaters: [],

    // Terrain-Daten: heightMap[y * W + x], biomeMap, colorMap
    heightMap: null,
    moistureMap: null,
    terrainCanvas: null,        // vorgerendertes Terrain-Bild
    terrainDirty: true,         // neu zeichnen nötig?

    explored: [],

    // ── Events / Wetter ──────────────────────────────────────
    lastRandomEvent: 0,
    weather: "clear",
    weatherTimer: 0,

    // ── Statistiken ──────────────────────────────────────────
    kingHp: 240,
    totalRaidsSurvived: 0,
    raidActive: false,
};
