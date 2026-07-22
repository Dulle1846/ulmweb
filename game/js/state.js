// ── Global Mutable Game State ──────────────────────────────────

export const state = {
    // Canvas references (set during init)
    canvas: null,
    ctx: null,
    minimapCanvas: null,
    minimapCtx: null,

    // Camera
    camera: { x: 0, y: 0 },

    // Timing
    tick: 0,
    gameSpeed: 1,
    isPaused: false,
    tickAccumulator: 0,
    lastFrameTime: 0,

    // Win / Lose
    gameOver: false,
    victory: false,

    // Kingdom
    kingdomName: "ELDRIA",

    // Resources
    resources: {
        wood: 180,
        stone: 95,
        gold: 45,
        food: 120,
        research: 0,
    },

    incomeThisTick: {
        wood: 0, stone: 0, gold: 0, food: 0, research: 0,
    },

    // Morale & time
    morale: 72,
    seasonIndex: 0,
    year: 1,
    dayOfYear: 0,

    // Cards
    currentCard: null,
    availableCards: [],

    // UI
    selectedTab: 0,
    eventLog: [],

    // Tech
    techs: [],
    unlockedTechs: new Set(),

    // World
    entities: [],
    particles: [],
    floaters: [],
    world: [],
    explored: [],

    // Events & weather
    lastRandomEvent: 0,
    weather: "clear",
    weatherTimer: 0,

    // Stats
    kingHp: 240,
    totalRaidsSurvived: 0,
};
