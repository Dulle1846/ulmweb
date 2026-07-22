// ═══════════════════════════════════════════════════════════════
//  VILLAGERS — KI-System mit Tagesablauf, Flucht, Bewegung
// ═══════════════════════════════════════════════════════════════

import {
    WORLD_WIDTH,
    WORLD_HEIGHT,
    UNIT_SPEED,
    WANDER_RADIUS,
    ROUTINE,
    FLEE_DISTANCE,
    FLEE_SPEED_MULT,
} from '../config.js';
import { TYPE } from '../types.js';
import { state } from '../state.js';
import { getEntitiesOfType, getNearestEnemy } from '../world/entities.js';
import { distance, rand } from '../utils.js';

// Welche Einheiten sich frei bewegen
const MOVING_TYPES = new Set([
    TYPE.VILLAGER,
    TYPE.GUARD,
    TYPE.ARCHER,
    TYPE.KNIGHT,
    TYPE.PRIEST,
]);

// Job-Zuordnung: Gebäude → Job-Name
const JOB_MAP = [
    { building: TYPE.FARM,    job: "farmer" },
    { building: TYPE.LUMBER,  job: "woodcutter" },
    { building: TYPE.QUARRY,  job: "miner" },
    { building: TYPE.TAVERN,  job: "innkeeper" },
    { building: TYPE.TEMPLE,  job: "acolyte" },
    { building: TYPE.MILL,    job: "miller" },
    { building: TYPE.STABLE,  job: "stablehand" },
];

// ═══════════════════════════════════════════════════════════════
//  HAUPTFUNKTIONEN
// ═══════════════════════════════════════════════════════════════

/**
 * Wird pro Simulationstick aufgerufen.
 * Verwaltet Job-Zuweisung, Routinen-Timer, Nahrungsverbrauch.
 */
export function updateVillagers() {
    if (state.isPaused || state.gameOver) return;

    const villagers = getEntitiesOfType(TYPE.VILLAGER);

    villagers.forEach(v => {
        v.age++;

        // Job alle ~100 Ticks neu zuweisen
        v.jobRefreshTimer--;
        if (v.jobRefreshTimer <= 0) {
            assignJob(v);
            v.jobRefreshTimer = 80 + Math.floor(Math.random() * 120);
        }

        // Routinen-Phasen-Timer
        v.routineTimer--;
        if (v.routineTimer <= 0) {
            advancePhase(v);
        }
    });

    // Nahrungsverbrauch
    if (state.tick % 220 === 0 && state.resources.food > 4) {
        state.resources.food -= 1;
    }
}

/**
 * Wird pro Animationsframe aufgerufen.
 * Berechnet die flüssige Bewegung aller befreundeten Einheiten.
 */
export function updateFriendlyMovement(deltaSeconds) {
    if (state.isPaused || state.gameOver || state.victory) return;
    if (deltaSeconds <= 0 || deltaSeconds > 0.2) return;

    const units = state.entities.filter(
        e => !e.dead && MOVING_TYPES.has(e.type)
    );

    // Feinde nur einmal finden
    const enemies = state.entities.filter(e => !e.dead && e.isEnemy());

    units.forEach(unit => {
        // Flucht-Check
        const threat = findNearestThreat(unit, enemies);

        if (threat) {
            handleFleeing(unit, threat, deltaSeconds);
            return;
        }

        // Normaler Routinen-Ablauf
        handleRoutine(unit, deltaSeconds);
    });
}

// ═══════════════════════════════════════════════════════════════
//  FLUCHT-SYSTEM
// ═══════════════════════════════════════════════════════════════

function findNearestThreat(unit, enemies) {
    // Wachen und Ritter fluchten nicht so leicht
    if (unit.type === TYPE.GUARD || unit.type === TYPE.KNIGHT) return null;

    let closest = null;
    let closestDist = FLEE_DISTANCE;

    for (const enemy of enemies) {
        const d = Math.hypot(unit.x - enemy.x, unit.y - enemy.y);
        if (d < closestDist) {
            closestDist = d;
            closest = enemy;
        }
    }

    return closest;
}

function handleFleeing(unit, threat, dt) {
    unit.visualState = "flee";

    // Richtung Burg fliehen
    const keep = getEntitiesOfType(TYPE.KEEP)[0];
    const fleeTarget = keep || { x: unit.anchor.x, y: unit.anchor.y };

    const dx = fleeTarget.x - unit.x;
    const dy = fleeTarget.y - unit.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 2) {
        const speed = (UNIT_SPEED[unit.type] || 1.0) * FLEE_SPEED_MULT;

        const desiredVX = (dx / dist) * speed;
        const desiredVY = (dy / dist) * speed;

        const steering = Math.min(1, dt * 5);
        unit.velocityX += (desiredVX - unit.velocityX) * steering;
        unit.velocityY += (desiredVY - unit.velocityY) * steering;

        const nextX = unit.x + unit.velocityX * dt;
        const nextY = unit.y + unit.velocityY * dt;

        if (isWalkable(nextX, nextY, unit)) {
            unit.x = nextX;
            unit.y = nextY;
            unit.state = "walk";
            if (Math.abs(unit.velocityX) > 0.02) {
                unit.facing = unit.velocityX > 0 ? 1 : -1;
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════
//  ROUTINEN-SYSTEM
// ═══════════════════════════════════════════════════════════════

function handleRoutine(unit, dt) {
    switch (unit.routinePhase) {
        case ROUTINE.GO_TO_WORK:
            handleGoToWork(unit, dt);
            break;
        case ROUTINE.WORKING:
            handleWorking(unit, dt);
            break;
        case ROUTINE.ON_BREAK:
            handleBreak(unit, dt);
            break;
        case ROUTINE.GO_HOME:
            handleGoHome(unit, dt);
            break;
        case ROUTINE.RESTING:
            handleResting(unit, dt);
            break;
    }
}

function advancePhase(unit) {
    unit.routinePhase = (unit.routinePhase + 1) % 5;

    switch (unit.routinePhase) {
        case ROUTINE.GO_TO_WORK:
            // Ziel: Arbeitsplatz
            if (unit.workplace && !unit.workplace.dead) {
                setTargetNear(unit, unit.workplace.x, unit.workplace.y, 1.5);
            }
            unit.routineTimer = 80 + Math.floor(Math.random() * 60);
            break;

        case ROUTINE.WORKING:
            // Stehen bleiben, arbeiten
            unit.targetX = unit.x;
            unit.targetY = unit.y;
            unit.velocityX = 0;
            unit.velocityY = 0;
            unit.visualState = "work";
            unit.routineTimer = ROUTINE.WORK_DURATION + Math.floor(Math.random() * 80);
            break;

        case ROUTINE.ON_BREAK:
            // Zufällig nahes Ziel
            unit.visualState = "idle";
            setTargetNear(unit, unit.anchor.x, unit.anchor.y, WANDER_RADIUS[unit.type] || 15);
            unit.routineTimer = ROUTINE.BREAK_DURATION + Math.floor(Math.random() * 40);
            break;

        case ROUTINE.GO_HOME:
            // Nach Hause gehen
            setTargetNear(unit, unit.home.x, unit.home.y, 2);
            unit.routineTimer = 60 + Math.floor(Math.random() * 40);
            break;

        case ROUTINE.RESTING:
            // Zuhause ruhen
            unit.targetX = unit.x;
            unit.targetY = unit.y;
            unit.velocityX = 0;
            unit.velocityY = 0;
            unit.visualState = "idle";
            unit.routineTimer = ROUTINE.REST_DURATION + Math.floor(Math.random() * 60);
            break;
    }
}

// ── Phasen-Verhaltensweisen pro Frame ─────────────────────────

function handleGoToWork(unit, dt) {
    moveTowardTarget(unit, dt);
}

function handleWorking(unit, dt) {
    // Stehen bleiben mit minimaler Wackelbewegung
    unit.velocityX *= 0.9;
    unit.velocityY *= 0.9;
    unit.visualState = "work";
}

function handleBreak(unit, dt) {
    moveTowardTarget(unit, dt);
    unit.visualState = "walk";
}

function handleGoHome(unit, dt) {
    moveTowardTarget(unit, dt);
}

function handleResting(unit, dt) {
    unit.velocityX *= 0.9;
    unit.velocityY *= 0.9;
    unit.visualState = "idle";
}

// ═══════════════════════════════════════════════════════════════
//  BEWEGUNGSMOTOR
// ═══════════════════════════════════════════════════════════════

function moveTowardTarget(unit, dt) {
    // Pause-Behandlung
    if (unit.movePause > 0) {
        unit.movePause -= dt;
        unit.velocityX += (0 - unit.velocityX) * Math.min(1, dt * 6);
        unit.velocityY += (0 - unit.velocityY) * Math.min(1, dt * 6);
        unit.visualState = "idle";
        return;
    }

    const dx = unit.targetX - unit.x;
    const dy = unit.targetY - unit.y;
    const dist = Math.hypot(dx, dy);

    // Ziel erreicht oder unerreichbar
    if (dist < 0.2 || !isWalkable(unit.targetX, unit.targetY, unit)) {
        unit.velocityX = 0;
        unit.velocityY = 0;
        unit.visualState = "idle";
        unit.movePause = rand(0.5, 2.0);

        // Neues Ziel suchen
        setTargetNear(
            unit,
            unit.anchor.x,
            unit.anchor.y,
            WANDER_RADIUS[unit.type] || 12
        );
        return;
    }

    const speed = UNIT_SPEED[unit.type] || 1.0;
    const desiredVX = (dx / dist) * speed;
    const desiredVY = (dy / dist) * speed;

    // Sanfte Beschleunigung
    const steering = Math.min(1, dt * 4);
    unit.velocityX += (desiredVX - unit.velocityX) * steering;
    unit.velocityY += (desiredVY - unit.velocityY) * steering;

    const nextX = unit.x + unit.velocityX * dt;
    const nextY = unit.y + unit.velocityY * dt;

    if (isWalkable(nextX, nextY, unit)) {
        unit.x = nextX;
        unit.y = nextY;
        unit.state = "walk";
        unit.visualState = "walk";

        if (Math.abs(unit.velocityX) > 0.02) {
            unit.facing = unit.velocityX > 0 ? 1 : -1;
        }
    } else {
        // Hindernis – kurz pausieren und neu zielen
        unit.velocityX = 0;
        unit.velocityY = 0;
        unit.movePause = rand(0.3, 1.0);
        unit.visualState = "idle";

        setTargetNear(
            unit,
            unit.anchor.x,
            unit.anchor.y,
            WANDER_RADIUS[unit.type] || 12
        );
    }
}

// ═══════════════════════════════════════════════════════════════
//  HILFSFUNKTIONEN
// ═══════════════════════════════════════════════════════════════

function setTargetNear(unit, cx, cy, radius) {
    for (let i = 0; i < 20; i++) {
        const angle = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * radius;
        const tx = cx + Math.cos(angle) * r;
        const ty = cy + Math.sin(angle) * r;

        if (isWalkable(tx, ty, unit)) {
            unit.targetX = tx;
            unit.targetY = ty;
            return;
        }
    }

    // Fallback
    unit.targetX = unit.x;
    unit.targetY = unit.y;
    unit.movePause = rand(1, 3);
}

function isWalkable(x, y, self) {
    const tx = Math.floor(x);
    const ty = Math.floor(y);

    if (tx < 0 || ty < 0 || tx >= WORLD_WIDTH || ty >= WORLD_HEIGHT) {
        return false;
    }

    const tile = state.world[tx]?.[ty];
    if (!tile || tile.terrain === "water") return false;

    // Gebäude blockieren
    const blocked = state.entities.some(e =>
        e !== self &&
        !e.dead &&
        e.isBuilding() &&
        Math.floor(e.x) === tx &&
        Math.floor(e.y) === ty
    );

    return !blocked;
}

function assignJob(villager) {
    let best = null;
    let bestDist = Infinity;

    for (const mapping of JOB_MAP) {
        const buildings = getEntitiesOfType(mapping.building);

        for (const b of buildings) {
            const d = Math.hypot(villager.x - b.x, villager.y - b.y);
            if (d < bestDist) {
                bestDist = d;
                best = { workplace: b, job: mapping.job };
            }
        }
    }

    if (best && bestDist <= 40) {
        villager.job = best.job;
        villager.workplace = best.workplace;
        villager.anchor = { x: best.workplace.x, y: best.workplace.y };
    } else {
        villager.job = "wanderer";
        villager.workplace = null;
        villager.anchor = { ...villager.home };
    }
}
