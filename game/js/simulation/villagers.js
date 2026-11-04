// ═══════════════════════════════════════════════════════════════
//  VILLAGERS — KI, Tagesablauf, Flucht, Bewegung
// ═══════════════════════════════════════════════════════════════

import {
    WORLD_W, WORLD_H,
    UNIT_SPEED, WANDER_RADIUS, ROUTINE,
    FLEE_DISTANCE, FLEE_SPEED_MULT,
} from '../core/config.js';
import { TYPE } from '../core/types.js';
import { state } from '../core/state.js';
import { getEntitiesOfType } from '../world/entities.js';
import { isWaterAt } from '../world/world.js';
import { distance, rand } from '../core/utils.js';

const MOVING_TYPES = new Set([
    TYPE.VILLAGER, TYPE.GUARD, TYPE.ARCHER, TYPE.KNIGHT, TYPE.PRIEST,
]);

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
//  PRO SIMULATIONSTICK
// ═══════════════════════════════════════════════════════════════

export function updateVillagers() {
    if (state.isPaused || state.gameOver) return;

    const villagers = getEntitiesOfType(TYPE.VILLAGER);

    villagers.forEach(v => {
        v.age++;

        v.jobRefreshTimer--;
        if (v.jobRefreshTimer <= 0) {
            assignJob(v);
            v.jobRefreshTimer = 80 + Math.floor(Math.random() * 120);
        }

        v.routineTimer--;
        if (v.routineTimer <= 0) advancePhase(v);
    });

    if (state.tick % 220 === 0 && state.resources.food > 4) {
        state.resources.food -= 1;
    }
}

// ═══════════════════════════════════════════════════════════════
//  PRO FRAME — Smooth Movement
// ═══════════════════════════════════════════════════════════════

export function updateFriendlyMovement(deltaSeconds) {
    if (state.isPaused || state.gameOver || state.victory) return;
    if (deltaSeconds <= 0 || deltaSeconds > 0.2) return;

    const units = state.entities.filter(e => !e.dead && MOVING_TYPES.has(e.type));
    const enemies = state.entities.filter(e => !e.dead && e.isEnemy());

    units.forEach(unit => {
        const threat = findThreat(unit, enemies);
        if (threat) {
            handleFlee(unit, threat, deltaSeconds);
            return;
        }
        handleRoutineMovement(unit, deltaSeconds);
    });
}

// ═══════════════════════════════════════════════════════════════
//  FLUCHT
// ═══════════════════════════════════════════════════════════════

function findThreat(unit, enemies) {
    if (unit.type === TYPE.GUARD || unit.type === TYPE.KNIGHT) return null;
    let closest = null;
    let closestDist = FLEE_DISTANCE;
    for (const e of enemies) {
        const d = Math.hypot(unit.x - e.x, unit.y - e.y);
        if (d < closestDist) { closestDist = d; closest = e; }
    }
    return closest;
}

function handleFlee(unit, threat, dt) {
    unit.visualState = "flee";
    const keep = getEntitiesOfType(TYPE.KEEP)[0];
    const target = keep || { x: unit.anchor.x, y: unit.anchor.y };
    const dx = target.x - unit.x;
    const dy = target.y - unit.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 2) {
        const speed = (UNIT_SPEED[unit.type] || 1.0) * FLEE_SPEED_MULT;
        const s = Math.min(1, dt * 5);
        unit.velocityX += ((dx / dist) * speed - unit.velocityX) * s;
        unit.velocityY += ((dy / dist) * speed - unit.velocityY) * s;
        const nx = unit.x + unit.velocityX * dt;
        const ny = unit.y + unit.velocityY * dt;
        if (isWalkable(nx, ny, unit)) {
            unit.x = nx; unit.y = ny;
            unit.state = "walk";
            if (Math.abs(unit.velocityX) > 0.02) unit.facing = unit.velocityX > 0 ? 1 : -1;
        }
    }
}

// ═══════════════════════════════════════════════════════════════
//  ROUTINEN
// ═══════════════════════════════════════════════════════════════

function advancePhase(unit) {
    unit.routinePhase = (unit.routinePhase + 1) % 5;
    switch (unit.routinePhase) {
        case ROUTINE.GO_TO_WORK:
            if (unit.workplace && !unit.workplace.dead) setTargetNear(unit, unit.workplace.x, unit.workplace.y, 1.5);
            unit.routineTimer = 80 + Math.floor(Math.random() * 60);
            break;
        case ROUTINE.WORKING:
            unit.targetX = unit.x; unit.targetY = unit.y;
            unit.velocityX = 0; unit.velocityY = 0;
            unit.visualState = "work";
            unit.routineTimer = ROUTINE.WORK_DURATION + Math.floor(Math.random() * 80);
            break;
        case ROUTINE.ON_BREAK:
            unit.visualState = "idle";
            setTargetNear(unit, unit.anchor.x, unit.anchor.y, WANDER_RADIUS[unit.type] || 15);
            unit.routineTimer = ROUTINE.BREAK_DURATION + Math.floor(Math.random() * 40);
            break;
        case ROUTINE.GO_HOME:
            setTargetNear(unit, unit.home.x, unit.home.y, 2);
            unit.routineTimer = 60 + Math.floor(Math.random() * 40);
            break;
        case ROUTINE.RESTING:
            unit.targetX = unit.x; unit.targetY = unit.y;
            unit.velocityX = 0; unit.velocityY = 0;
            unit.visualState = "idle";
            unit.routineTimer = ROUTINE.REST_DURATION + Math.floor(Math.random() * 60);
            break;
    }
}

function handleRoutineMovement(unit, dt) {
    if (unit.routinePhase === ROUTINE.WORKING || unit.routinePhase === ROUTINE.RESTING) {
        unit.velocityX *= 0.9;
        unit.velocityY *= 0.9;
        return;
    }
    moveToward(unit, dt);
}

// ═══════════════════════════════════════════════════════════════
//  BEWEGUNGSMOTOR
// ═══════════════════════════════════════════════════════════════

function moveToward(unit, dt) {
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

    if (dist < 0.2 || !isWalkable(unit.targetX, unit.targetY, unit)) {
        unit.velocityX = 0; unit.velocityY = 0;
        unit.visualState = "idle";
        unit.movePause = rand(0.5, 2.0);
        setTargetNear(unit, unit.anchor.x, unit.anchor.y, WANDER_RADIUS[unit.type] || 12);
        return;
    }

    const speed = UNIT_SPEED[unit.type] || 1.0;
    const s = Math.min(1, dt * 4);
    unit.velocityX += ((dx / dist) * speed - unit.velocityX) * s;
    unit.velocityY += ((dy / dist) * speed - unit.velocityY) * s;

    const nx = unit.x + unit.velocityX * dt;
    const ny = unit.y + unit.velocityY * dt;

    if (isWalkable(nx, ny, unit)) {
        unit.x = nx; unit.y = ny;
        unit.state = "walk";
        unit.visualState = "walk";
        if (Math.abs(unit.velocityX) > 0.02) unit.facing = unit.velocityX > 0 ? 1 : -1;
    } else {
        unit.velocityX = 0; unit.velocityY = 0;
        unit.movePause = rand(0.3, 1.0);
        unit.visualState = "idle";
        setTargetNear(unit, unit.anchor.x, unit.anchor.y, WANDER_RADIUS[unit.type] || 12);
    }
}

// ═══════════════════════════════════════════════════════════════
//  HILFSFUNKTIONEN
// ═══════════════════════════════════════════════════════════════

function setTargetNear(unit, cx, cy, radius) {
    for (let i = 0; i < 20; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * radius;
        const tx = cx + Math.cos(a) * r;
        const ty = cy + Math.sin(a) * r;
        if (isWalkable(tx, ty, unit)) {
            unit.targetX = tx; unit.targetY = ty;
            return;
        }
    }
    unit.targetX = unit.x; unit.targetY = unit.y;
    unit.movePause = rand(1, 3);
}

function isWalkable(x, y, self) {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) return false;
    if (isWaterAt(x, y)) return false;

    return !state.entities.some(e =>
        e !== self && !e.dead && e.isBuilding() &&
        Math.floor(e.x) === tx && Math.floor(e.y) === ty
    );
}

function assignJob(villager) {
    let best = null, bestDist = Infinity;
    for (const m of JOB_MAP) {
        for (const b of getEntitiesOfType(m.building)) {
            const d = Math.hypot(villager.x - b.x, villager.y - b.y);
            if (d < bestDist) { bestDist = d; best = { workplace: b, job: m.job }; }
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
