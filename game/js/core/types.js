// ═══════════════════════════════════════════════════════════════
//  TYPES — Enums, Hilfsfunktionen, Entity-Klasse
// ═══════════════════════════════════════════════════════════════

export const TYPE = {
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
    GOLDMINE: 13,
    BARREL: 14,

    VILLAGER: 20,
    GUARD: 21,
    ARCHER: 22,
    KNIGHT: 23,
    PRIEST: 24,

    GOBLIN: 30,
    ORC: 31,
    TROLL: 32,

    DEER: 40,
    RUIN: 50,
};

// ── HP-Tabelle ────────────────────────────────────────────────

const MAX_HP = {
    [TYPE.KEEP]:     1200,
    [TYPE.HOUSE]:    180,
    [TYPE.FARM]:     90,
    [TYPE.LUMBER]:   110,
    [TYPE.QUARRY]:   140,
    [TYPE.WALL]:     450,
    [TYPE.TOWER]:    220,
    [TYPE.TAVERN]:   160,
    [TYPE.TEMPLE]:   210,
    [TYPE.BARRACKS]: 280,
    [TYPE.MILL]:     130,
    [TYPE.STABLE]:   170,
    [TYPE.WONDER]:   9999,
    [TYPE.GOLDMINE]: 240,
    [TYPE.BARREL]:    45,
    [TYPE.VILLAGER]: 35,
    [TYPE.GUARD]:    160,
    [TYPE.ARCHER]:   95,
    [TYPE.KNIGHT]:   240,
    [TYPE.PRIEST]:   70,
    [TYPE.GOBLIN]:   45,
    [TYPE.ORC]:      110,
    [TYPE.TROLL]:    240,
    [TYPE.DEER]:     25,
};

function getMaxHpForType(type) {
    return MAX_HP[type] ?? 100;
}

// ── Emoji-Zuordnung nach Job ──────────────────────────────────

export const JOB_ICONS = {
    farmer:      "🌾",
    woodcutter:  "🪓",
    miner:       "⛏️",
    goldminer:   "💰",
    innkeeper:   "🍺",
    acolyte:     "✨",
    miller:      "⚙️",
    stablehand:  "🐴",
    guard:       "🛡️",
    archer:      "🏹",
    knight:      "⚔️",
    king:        "👑",
    priest:      "🙏",
    wanderer:    "🧳",
    fleeing:     "💨",
    idle:        "◆",
};

// ── Entity-Klasse ─────────────────────────────────────────────

export class Entity {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;

        this.hp = getMaxHpForType(type);
        this.maxHp = this.hp;
        this.dead = false;
        this.age = 0;

        // ── Animation ────────────────────────────────────────
        this.anim = random("entity") * 100;
        this.facing = random("entity") > 0.5 ? 1 : -1;
        this.visualState = "idle";   // idle | walk | work | flee

        // ── Position & Bewegung ──────────────────────────────
        this.anchor = { x, y };
        this.home = { x, y };
        this.targetX = x;
        this.targetY = y;
        this.velocityX = 0;
        this.velocityY = 0;

        // ── Routinen-System ──────────────────────────────────
        this.routinePhase = 0;
        this.routineTimer = Math.floor(random("entity") * 60) + 20;
        this.movePause = 0;

        // ── Job ──────────────────────────────────────────────
        this.job = null;
        this.jobRefreshTimer = 0;
        this.workplace = null;

        // ── Sonstiges ────────────────────────────────────────
        this.isKing = false;
        this.moraleMod = 0;
        this.tint = Math.floor(random("entity") * 4);
    }

    isBuilding() {
        return this.type < 20;
    }

    isUnit() {
        return this.type >= 20 && this.type < 30;
    }

    isEnemy() {
        return this.type >= 30 && this.type < 40;
    }

    isFriendly() {
        return this.type >= 20 && this.type < 30;
    }
}
