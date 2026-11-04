// ═══════════════════════════════════════════════════════════════
//  VILLAGERS — KI, Tagesablauf, Flucht, Bewegung
// ═══════════════════════════════════════════════════════════════

import {
    WORLD_W, WORLD_H,
    UNIT_SPEED, WANDER_RADIUS, ROUTINE, BUILDING_SIZE,
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

const blockedBuildingTiles=new Set();
let blockedEntityCount=-1,blockedWorldSeed=-1,blockedWorldEpoch=-1,blockedBuildingVersion=-1;

export function rebuildBlockedBuildingTiles(){
    const version=state.buildingCollisionVersion||0;
    if(blockedEntityCount===state.entities.length&&blockedWorldSeed===state.worldSeed&&blockedWorldEpoch===state.worldEpoch&&blockedBuildingVersion===version)return;
    blockedBuildingTiles.clear();
    for(const entity of state.entities){
        if(entity.dead||!entity.isBuilding())continue;
        const base=BUILDING_SIZE[entity.type]||{w:1,h:1};
        const scale=Math.max(0.25,Math.min(6,Number(entity.footprintScale)||1));
        const left=entity.x+0.5-(base.w*scale)/2;
        const right=entity.x+0.5+(base.w*scale)/2;
        const top=entity.y+0.5-(base.h*scale)/2;
        const bottom=entity.y+0.5+(base.h*scale)/2;
        for(let x=Math.max(0,Math.floor(left));x<Math.min(WORLD_W,Math.ceil(right));x++){
            for(let y=Math.max(0,Math.floor(top));y<Math.min(WORLD_H,Math.ceil(bottom));y++){
                blockedBuildingTiles.add(x+":"+y);
            }
        }
    }
    blockedEntityCount=state.entities.length;
    blockedWorldSeed=state.worldSeed;
    blockedWorldEpoch=state.worldEpoch;
    blockedBuildingVersion=version;
}

const JOB_MAP = [
    { building: TYPE.FARM,    job: "farmer" },
    { building: TYPE.LUMBER,  job: "woodcutter" },
    { building: TYPE.QUARRY,  job: "miner" },
    { building: TYPE.GOLDMINE, job: "goldminer" },
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

    rebuildBlockedBuildingTiles();
    const villagers=[];
    const workplaces=new Map(JOB_MAP.map(job=>[job,[]]));
    const workplacesByType=new Map(JOB_MAP.map(job=>[job.building,workplaces.get(job)]));
    for(const entity of state.entities){
        if(entity.dead)continue;
        if(entity.type===TYPE.VILLAGER)villagers.push(entity);
        const list=workplacesByType.get(entity.type);
        if(list)list.push(entity);
    }

    villagers.forEach(v => {
        v.age++;

        v.jobRefreshTimer--;
        if (v.jobRefreshTimer <= 0) {
            assignJob(v,workplaces);
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

    rebuildBlockedBuildingTiles();
    const units=[],enemies=[];
    let keep=null;
    for(const entity of state.entities){
        if(entity.dead)continue;
        if(MOVING_TYPES.has(entity.type))units.push(entity);
        if(entity.isEnemy())enemies.push(entity);
        if(entity.type===TYPE.KEEP)keep=entity;
    }
    const buckets = new Map();
    const bucketSize = FLEE_DISTANCE;
    for (const enemy of enemies) {
        const key = Math.floor(enemy.x / bucketSize) + ":" + Math.floor(enemy.y / bucketSize);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(enemy);
    }

    units.forEach(unit => {
        const threat = findThreat(unit, buckets, bucketSize);
        if (threat) {
            handleFlee(unit, threat, deltaSeconds, keep);
            return;
        }
        handleRoutineMovement(unit, deltaSeconds);
    });
}

// ═══════════════════════════════════════════════════════════════
//  FLUCHT
// ═══════════════════════════════════════════════════════════════

function findThreat(unit, buckets, bucketSize) {
    if (unit.type === TYPE.GUARD || unit.type === TYPE.KNIGHT) return null;
    let closest = null;
    let closestDist = FLEE_DISTANCE;
    const minX = Math.floor((unit.x - FLEE_DISTANCE) / bucketSize);
    const maxX = Math.floor((unit.x + FLEE_DISTANCE) / bucketSize);
    const minY = Math.floor((unit.y - FLEE_DISTANCE) / bucketSize);
    const maxY = Math.floor((unit.y + FLEE_DISTANCE) / bucketSize);
    for (let bx = minX; bx <= maxX; bx++) {
        for (let by = minY; by <= maxY; by++) {
            const local = buckets.get(bx + ":" + by) || [];
            for (const enemy of local) {
                const d = Math.hypot(unit.x - enemy.x, unit.y - enemy.y);
                if (d < closestDist) { closestDist = d; closest = enemy; }
            }
        }
    }
    return closest;
}

function handleFlee(unit, threat, dt, keep=null) {
    unit.visualState = "flee";
    const anchor = unit.anchor || unit.home || { x: unit.x, y: unit.y };
    const target = keep || anchor;
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
        if (isWalkable(nx, ny)) {
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

    if (dist < 0.2 || !isWalkable(unit.targetX, unit.targetY)) {
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

    let moved = false;
    if (isWalkable(nx, ny, unit)) {
        unit.x = nx; unit.y = ny; moved = true;
    } else if (isWalkable(nx, unit.y, unit)) {
        unit.x = nx; moved = true;
    } else if (isWalkable(unit.x, ny, unit)) {
        unit.y = ny; moved = true;
    }
    if (moved) {
        unit.state = "walk";
        unit.visualState = "walk";
        if (Math.abs(unit.velocityX) > 0.02) unit.facing = unit.velocityX > 0 ? 1 : -1;
    } else {
        unit.velocityX = 0; unit.velocityY = 0;
        unit.movePause = rand(0.3, 1.0);
        unit.visualState = "idle";
        const anchor = unit.anchor || unit.home || {x:unit.x,y:unit.y};
        setTargetNear(unit, anchor.x, anchor.y, WANDER_RADIUS[unit.type] || 12);
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
        if (isWalkable(tx, ty)) {
            unit.targetX = tx; unit.targetY = ty;
            return;
        }
    }
    unit.targetX = unit.x; unit.targetY = unit.y;
    unit.movePause = rand(1, 3);
}

export function isWalkable(x, y) {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) return false;
    if (isWaterAt(x, y)) return false;

    return !blockedBuildingTiles.has(tx+":"+ty);
}

function assignJob(villager,workplaces=null) {
    let best = null, bestDist = Infinity;
    for (const m of JOB_MAP) {
        for (const b of (workplaces?.get(m)||getEntitiesOfType(m.building))) {
            const d = Math.hypot(villager.x - b.x, villager.y - b.y);
            if (d < bestDist) { bestDist = d; best = { workplace: b, job: m.job }; }
        }
    }
    const nextWorkplace = best && bestDist <= 40 ? best.workplace : null;
    if (villager.workplace !== nextWorkplace) {
        villager.routinePhase = 4; // First advance enters GO_TO_WORK instead of skipping it.
        villager.routineTimer = 1;
        villager.velocityX = 0;
        villager.velocityY = 0;
    }
    if (nextWorkplace) {
        villager.job = best.job;
        villager.workplace = nextWorkplace;
        villager.anchor = { x: nextWorkplace.x, y: nextWorkplace.y };
    } else {
        villager.job = "wanderer";
        villager.workplace = null;
        villager.anchor = { ...(villager.home || {x:villager.x,y:villager.y}) };
    }
}
