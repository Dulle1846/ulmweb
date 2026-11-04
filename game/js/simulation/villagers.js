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
import { BUILDING_WORKFORCE } from '../systems/economy.js';

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

    const workerCounts=new Map();
    for(const villager of villagers){
        if(villager.workplace&&!villager.workplace.dead)workerCounts.set(villager.workplace,(workerCounts.get(villager.workplace)||0)+1);
    }

    villagers.forEach(v => {
        // Age is measured in settlement years, not in simulation ticks.
        // The year guard also prevents duplicate ageing if this system is
        // invoked more than once during the year-boundary tick.
        if (state.dayOfYear === 0 && v.lastAgedYear !== state.year) {
            v.age = Math.max(0, Number(v.age) || 0) + 1;
            v.lastAgedYear = state.year;
        }

        v.jobRefreshTimer--;
        if (v.jobRefreshTimer <= 0) {
            assignJob(v,workplaces,workerCounts);
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

    const targetTileX=Math.floor(unit.targetX),targetTileY=Math.floor(unit.targetY);
    if(unit.path&&(unit.pathTargetX!==targetTileX||unit.pathTargetY!==targetTileY||unit.pathVersion!==(state.buildingCollisionVersion||0)))unit.path=null;
    if(unit.path&&followCachedPath(unit,dt))return;

    const dx = unit.targetX - unit.x;
    const dy = unit.targetY - unit.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 0.2 || !isWalkable(unit.targetX, unit.targetY)) {
        unit.path=null;unit.velocityX = 0; unit.velocityY = 0;
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
    // Cheap axis sliding handles most small obstacles. Invoke A* only when
    // both axis alternatives are blocked, avoiding path searches on ordinary frames.
    if(!moved){
        const route=findPath(unit.x,unit.y,unit.targetX,unit.targetY);
        if(route?.length){
            unit.path=route;unit.pathIndex=0;unit.pathTargetX=targetTileX;unit.pathTargetY=targetTileY;
            unit.pathVersion=state.buildingCollisionVersion||0;
            if(followCachedPath(unit,dt))return;
        }
    }
    if (moved) {
        unit.state = "walk";
        unit.visualState = "walk";
        if (Math.abs(unit.velocityX) > 0.02) unit.facing = unit.velocityX > 0 ? 1 : -1;
    } else {
        unit.path=null;unit.velocityX = 0; unit.velocityY = 0;
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

function heapPush(heap,node){
    heap.push(node);
    let index=heap.length-1;
    while(index>0){
        const parent=(index-1)>>1;
        if(heap[parent].f<=node.f)break;
        heap[index]=heap[parent];index=parent;
    }
    heap[index]=node;
}
function heapPop(heap){
    if(!heap.length)return null;
    const first=heap[0],last=heap.pop();
    if(heap.length){
        let index=0;
        while(true){
            const left=index*2+1,right=left+1;
            if(left>=heap.length)break;
            let child=right<heap.length&&heap[right].f<heap[left].f?right:left;
            if(heap[child].f>=last.f)break;
            heap[index]=heap[child];index=child;
        }
        heap[index]=last;
    }
    return first;
}
const pathHeuristic=(x,y,tx,ty)=>{
    const dx=Math.abs(tx-x),dy=Math.abs(ty-y);
    return Math.max(dx,dy)+(Math.SQRT2-1)*Math.min(dx,dy);
};

// A bounded A* search is only invoked when direct steering meets an obstacle.
// Routes are cached on each unit and invalidated when its destination or the
// building-collision version changes.
export function findPath(startX,startY,targetX,targetY,maxNodes=1800){
    rebuildBlockedBuildingTiles();
    const sx=Math.floor(startX),sy=Math.floor(startY),tx=Math.floor(targetX),ty=Math.floor(targetY);
    if(sx<0||sy<0||tx<0||ty<0||sx>=WORLD_W||sy>=WORLD_H||tx>=WORLD_W||ty>=WORLD_H)return null;
    if(sx===tx&&sy===ty)return [];
    if(!isWalkable(tx+0.5,ty+0.5))return null;
    const start=sy*WORLD_W+sx,target=ty*WORLD_W+tx;
    const open=[],costs=new Map([[start,0]]),parents=new Map(),closed=new Set();
    heapPush(open,{index:start,x:sx,y:sy,g:0,f:pathHeuristic(sx,sy,tx,ty)});
    const directions=[[-1,0,1],[1,0,1],[0,-1,1],[0,1,1],[-1,-1,Math.SQRT2],[1,-1,Math.SQRT2],[-1,1,Math.SQRT2],[1,1,Math.SQRT2]];
    let visited=0;
    while(open.length&&visited<Math.max(100,Math.min(5000,Math.floor(maxNodes)||1800))){
        const current=heapPop(open);
        if(closed.has(current.index))continue;
        if(current.g!==costs.get(current.index))continue;
        if(current.index===target){
            const route=[];let cursor=target;
            while(cursor!==start){
                route.push({x:(cursor%WORLD_W)+0.5,y:Math.floor(cursor/WORLD_W)+0.5});
                cursor=parents.get(cursor);
                if(cursor===undefined)return null;
            }
            route.reverse();return route;
        }
        closed.add(current.index);visited++;
        for(const [dx,dy,stepCost] of directions){
            const nx=current.x+dx,ny=current.y+dy;
            if(nx<0||ny<0||nx>=WORLD_W||ny>=WORLD_H)continue;
            const next=ny*WORLD_W+nx;
            if(closed.has(next)||!isWalkable(nx+0.5,ny+0.5))continue;
            if(dx!==0&&dy!==0&&(!isWalkable(current.x+dx+0.5,current.y+0.5)||!isWalkable(current.x+0.5,current.y+dy+0.5)))continue;
            const nextCost=current.g+stepCost,known=costs.get(next);
            if(known!==undefined&&nextCost>=known)continue;
            costs.set(next,nextCost);parents.set(next,current.index);
            heapPush(open,{index:next,x:nx,y:ny,g:nextCost,f:nextCost+pathHeuristic(nx,ny,tx,ty)});
        }
    }
    return null;
}

function followCachedPath(unit,dt,speedMultiplier=1){
    const path=unit.path;
    if(!Array.isArray(path)||!path.length)return false;
    while(unit.pathIndex<path.length){
        const node=path[unit.pathIndex];
        if(Math.hypot(node.x-unit.x,node.y-unit.y)>=0.34)break;
        unit.pathIndex++;
    }
    if(unit.pathIndex>=path.length){unit.path=null;return false;}
    const node=path[unit.pathIndex],dx=node.x-unit.x,dy=node.y-unit.y,dist=Math.hypot(dx,dy);
    if(dist<0.001){unit.pathIndex++;return true;}
    const speed=(UNIT_SPEED[unit.type]||1)*speedMultiplier,s=Math.min(1,dt*4);
    unit.velocityX+=(dx/dist*speed-unit.velocityX)*s;
    unit.velocityY+=(dy/dist*speed-unit.velocityY)*s;
    let nx=unit.x+unit.velocityX*dt,ny=unit.y+unit.velocityY*dt;
    if(Math.hypot(node.x-nx,node.y-ny)<0.22){nx=node.x;ny=node.y;unit.velocityX=0;unit.velocityY=0;}
    if(!isWalkable(nx,ny,unit)){unit.path=null;unit.velocityX=0;unit.velocityY=0;return false;}
    unit.x=nx;unit.y=ny;unit.state="walk";unit.visualState="walk";
    if(Math.abs(unit.velocityX)>0.02)unit.facing=unit.velocityX>0?1:-1;
    return true;
}

function assignJob(villager,workplaces=null,workerCounts=new Map()) {
    const previousWorkplace=villager.workplace;
    if(previousWorkplace)workerCounts.set(previousWorkplace,Math.max(0,(workerCounts.get(previousWorkplace)||0)-1));
    let best = null, bestDist = Infinity;
    for (const m of JOB_MAP) {
        const capacity=BUILDING_WORKFORCE[m.building]||0;
        for (const b of (workplaces?.get(m)||getEntitiesOfType(m.building))) {
            if((workerCounts.get(b)||0)>=capacity)continue;
            const d = Math.hypot(villager.x - b.x, villager.y - b.y);
            if (d < bestDist) { bestDist = d; best = { workplace: b, job: m.job }; }
        }
    }
    const nextWorkplace = best && bestDist <= 40 ? best.workplace : null;
    if(nextWorkplace)workerCounts.set(nextWorkplace,(workerCounts.get(nextWorkplace)||0)+1);
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
