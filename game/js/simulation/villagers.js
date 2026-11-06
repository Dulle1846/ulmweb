// ═══════════════════════════════════════════════════════════════
//  VILLAGERS — KI, Tagesablauf, Flucht, Bewegung
// ═══════════════════════════════════════════════════════════════

import {
    UNIT_SPEED, WANDER_RADIUS, ROUTINE, BUILDING_SIZE,
    FLEE_DISTANCE, FLEE_SPEED_MULT,
} from '../core/config.js';
import { TYPE } from '../core/types.js';
import { state } from '../core/state.js';
import { getEntitiesOfType } from '../world/entities.js';
import { isWaterAt, worldWidth, worldHeight } from '../world/world.js';
import { recordResourceMovement } from '../systems/goods-book.js';
import { distance } from '../core/utils.js';
import { rand as seededRand } from '../core/random.js';
const rand=(min,max)=>seededRand(min,max,"villagers");
import { BUILDING_WORKFORCE } from '../systems/economy.js';
import { getRoadSpeedMultiplier,getRoadTravelCost } from '../systems/roads.js';

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
        const W=worldWidth(),H=worldHeight();
        for(let x=Math.max(0,Math.floor(left));x<Math.min(W,Math.ceil(right));x++){
            for(let y=Math.max(0,Math.floor(top));y<Math.min(H,Math.ceil(bottom));y++){
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
    { building: TYPE.SAWMILL, job: "sawyer" },
    { building: TYPE.BAKERY,  job: "baker" },
    { building: TYPE.WELL,    job: "wellkeeper" },
    { building: TYPE.MASON,   job: "mason" },
    { building: TYPE.FORESTER, job: "forester" },
    { building: TYPE.WAREHOUSE, job: "hauler" },
    { building: TYPE.CLINIC,  job: "healer" },
    { building: TYPE.MARKET,   job: "merchant" },
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
            v.jobRefreshTimer = 80 + Math.floor(rand(0, 120));
        }

        v.routineTimer--;
        if (v.routineTimer <= 0) advancePhase(v);
    });

    if (state.tick % 220 === 0 && state.resources.food > 4) {
        recordResourceMovement("food", -1, "residents-provisions", {
            from: { kind: "realm", id: "royal-stores" }, to: { kind: "population", id: "residents" },
            key: "food:residents:" + state.tick
        });
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
            unit.routineTimer = 80 + Math.floor(rand(0, 60));
            break;
        case ROUTINE.WORKING:
            unit.targetX = unit.x; unit.targetY = unit.y;
            unit.velocityX = 0; unit.velocityY = 0;
            unit.visualState = "work";
            unit.routineTimer = ROUTINE.WORK_DURATION + Math.floor(rand(0, 80));
            break;
        case ROUTINE.ON_BREAK:
            unit.visualState = "idle";
            const safety = Number(unit.person?.needs?.safety ?? 50);
            const radius = safety < 35 ? 2 : (WANDER_RADIUS[unit.type] || 15);
            setTargetNear(unit, unit.anchor.x, unit.anchor.y, radius);
            unit.routineTimer = ROUTINE.BREAK_DURATION + Math.floor(rand(0, 40));
            break;
        case ROUTINE.GO_HOME:
            setTargetNear(unit, unit.home.x, unit.home.y, 2);
            unit.routineTimer = 60 + Math.floor(rand(0, 40));
            break;
        case ROUTINE.RESTING:
            unit.targetX = unit.x; unit.targetY = unit.y;
            unit.velocityX = 0; unit.velocityY = 0;
            unit.visualState = "idle";
            const restNeed = Number(unit.person?.needs?.rest ?? 50);
            const recoveryTime = Math.max(0, 50 - restNeed);
            unit.routineTimer = ROUTINE.REST_DURATION + Math.floor(rand(0, 60)) + Math.floor(recoveryTime * 0.8);
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
    if(unit.path&&(unit.pathTargetX!==targetTileX||unit.pathTargetY!==targetTileY||unit.pathVersion!==((state.buildingCollisionVersion||0)+':'+(state.roads?.revision||0))))unit.path=null;
    if(unit.path&&followCachedPath(unit,dt,getRoadSpeedMultiplier(unit.x,unit.y)))return;

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

    const speed = (UNIT_SPEED[unit.type] || 1.0)*getRoadSpeedMultiplier(unit.x,unit.y);
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
            unit.pathVersion=(state.buildingCollisionVersion||0)+':'+(state.roads?.revision||0);
            if(followCachedPath(unit,dt,getRoadSpeedMultiplier(unit.x,unit.y)))return;
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
        const a = rand(0, Math.PI * 2);
        const r = Math.sqrt(rand(0, 1)) * radius;
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
    if (tx < 0 || ty < 0 || tx >= worldWidth() || ty >= worldHeight()) return false;
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
let lastDirectPathResult = "none";
function findPathDirect(startX,startY,targetX,targetY,maxNodes=1800){
    rebuildBlockedBuildingTiles();
    lastDirectPathResult = "none";
    const W=worldWidth(),H=worldHeight();
    const sx=Math.floor(startX),sy=Math.floor(startY),tx=Math.floor(targetX),ty=Math.floor(targetY);
    if(sx<0||sy<0||tx<0||ty<0||sx>=W||sy>=H||tx>=W||ty>=H){lastDirectPathResult="invalid";return null;}
    if(sx===tx&&sy===ty){lastDirectPathResult="found";return [];}
    if(!isWalkable(tx+0.5,ty+0.5)){lastDirectPathResult="unreachable";return null;}
    const start=sy*W+sx,target=ty*W+tx;
    const open=[],costs=new Map([[start,0]]),parents=new Map(),closed=new Set();
    heapPush(open,{index:start,x:sx,y:sy,g:0,f:pathHeuristic(sx,sy,tx,ty)*0.78});
    const directions=[[-1,0,1],[1,0,1],[0,-1,1],[0,1,1],[-1,-1,Math.SQRT2],[1,-1,Math.SQRT2],[-1,1,Math.SQRT2],[1,1,Math.SQRT2]];
    let visited=0;
    while(open.length&&visited<Math.max(100,Math.min(5000,Math.floor(maxNodes)||1800))){
        const current=heapPop(open);
        if(closed.has(current.index))continue;
        if(current.g!==costs.get(current.index))continue;
        if(current.index===target){
            const route=[];let cursor=target;
            while(cursor!==start){
                route.push({x:(cursor%W)+0.5,y:Math.floor(cursor/W)+0.5});
                cursor=parents.get(cursor);
                if(cursor===undefined){lastDirectPathResult="unreachable";return null;}
            }
            lastDirectPathResult="found";
            route.reverse();return route;
        }
        closed.add(current.index);visited++;
        for(const [dx,dy,stepCost] of directions){
            const nx=current.x+dx,ny=current.y+dy;
            if(nx<0||ny<0||nx>=W||ny>=H)continue;
            const next=ny*W+nx;
            if(closed.has(next)||!isWalkable(nx+0.5,ny+0.5))continue;
            if(dx!==0&&dy!==0&&(!isWalkable(current.x+dx+0.5,current.y+0.5)||!isWalkable(current.x+0.5,current.y+dy+0.5)))continue;
            const nextCost=current.g+stepCost*getRoadTravelCost(nx+0.5,ny+0.5),known=costs.get(next);
            if(known!==undefined&&nextCost>=known)continue;
            costs.set(next,nextCost);parents.set(next,current.index);
            heapPush(open,{index:next,x:nx,y:ny,g:nextCost,f:nextCost+pathHeuristic(nx,ny,tx,ty)*0.78});
        }
    }
    lastDirectPathResult = open.length ? "cap" : "unreachable";
    return null;
}

// ═══════════════════════════════════════════════════════════════
//  HIERARCHICAL FALLBACK — coarse route, local A* segments
//  Local unit paths keep the 5,000-node search guard. A failed long
//  direct search is refined through a coarse walkability grid, never by
//  increasing the per-call node budget.
// ═══════════════════════════════════════════════════════════════

const HIERARCHICAL_TRIGGER_DISTANCE = 64;
const HIERARCHICAL_LOCAL_CAP = 5000;
const hierarchicalGridCache = new Map();
let reachableTileCache = null;

function walkabilityKey() {
    return [state.worldEpoch || 0, worldWidth(), worldHeight(), state.buildingCollisionVersion || 0].join(":");
}

function getReachableTiles(startX, startY) {
    const W = worldWidth(), H = worldHeight();
    const startTile = Math.floor(startY) * W + Math.floor(startX);
    const key = `${walkabilityKey()}:${startTile}`;
    if (reachableTileCache && reachableTileCache.key === key) return reachableTileCache;
    if (!isWalkable(startX, startY)) return null;

    const tiles = new Uint8Array(W * H);
    const queue = new Int32Array(W * H);
    let head = 0, tail = 0;
    tiles[startTile] = 1;
    queue[tail++] = startTile;
    while (head < tail) {
        const current = queue[head++];
        const x = current % W, y = Math.floor(current / W);
        if (x > 0) {
            const next = current - 1;
            if (!tiles[next] && isWalkable(x - 0.5, y + 0.5)) { tiles[next] = 1; queue[tail++] = next; }
        }
        if (x + 1 < W) {
            const next = current + 1;
            if (!tiles[next] && isWalkable(x + 1.5, y + 0.5)) { tiles[next] = 1; queue[tail++] = next; }
        }
        if (y > 0) {
            const next = current - W;
            if (!tiles[next] && isWalkable(x + 0.5, y - 0.5)) { tiles[next] = 1; queue[tail++] = next; }
        }
        if (y + 1 < H) {
            const next = current + W;
            if (!tiles[next] && isWalkable(x + 0.5, y + 1.5)) { tiles[next] = 1; queue[tail++] = next; }
        }
    }
    reachableTileCache = { key, tiles, W, H };
    return reachableTileCache;
}

function getHierarchicalGrid(cellSize, reachable) {
    const W = reachable.W, H = reachable.H;
    const key = `${reachable.key}:${cellSize}`;
    const cached = hierarchicalGridCache.get(key);
    if (cached) return cached;

    const cols = Math.ceil(W / cellSize), rows = Math.ceil(H / cellSize);
    const reps = new Int32Array(cols * rows).fill(-1);
    for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
            const left = cx * cellSize, top = cy * cellSize;
            const centerX = left + cellSize / 2, centerY = top + cellSize / 2;
            let best = -1, bestDistance = Infinity;
            for (let y = top; y < Math.min(H, top + cellSize); y++) {
                for (let x = left; x < Math.min(W, left + cellSize); x++) {
                    const tile = y * W + x;
                    if (!reachable.tiles[tile]) continue;
                    const d = (x + 0.5 - centerX) ** 2 + (y + 0.5 - centerY) ** 2;
                    if (d < bestDistance) { bestDistance = d; best = tile; }
                }
            }
            reps[cy * cols + cx] = best;
        }
    }
    const grid = { cellSize, cols, rows, reps, W, H, key, reachable };
    hierarchicalGridCache.set(key, grid);
    return grid;
}

function hierarchicalRoute(grid, startX, startY, targetX, targetY) {
    const { cols, rows, reps, W } = grid;
    const startTile = Math.floor(startY) * W + Math.floor(startX);
    const targetTile = Math.floor(targetY) * W + Math.floor(targetX);
    if (!grid.reachable.tiles[startTile] || !grid.reachable.tiles[targetTile]) return null;
    const cellIndex = (x, y) => {
        const cx = Math.max(0, Math.min(cols - 1, Math.floor(x / grid.cellSize)));
        const cy = Math.max(0, Math.min(rows - 1, Math.floor(y / grid.cellSize)));
        return cy * cols + cx;
    };
    const startCell = cellIndex(startX, startY);
    const targetCell = cellIndex(targetX, targetY);
    if (reps[startCell] < 0 || reps[targetCell] < 0) return null;
    if (startCell === targetCell) return null;

    const total = cols * rows;
    const seen = new Int32Array(total).fill(-1);
    const parent = new Int32Array(total).fill(-1);
    const queue = new Int32Array(total);
    let head = 0, tail = 0;
    queue[tail++] = startCell;
    seen[startCell] = 0;
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    while (head < tail) {
        const current = queue[head++];
        if (current === targetCell) break;
        const cx = current % cols, cy = Math.floor(current / cols);
        for (const [dx, dy] of directions) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
            const next = ny * cols + nx;
            if (seen[next] !== -1 || reps[next] < 0) continue;
            seen[next] = seen[current] + 1;
            parent[next] = current;
            queue[tail++] = next;
        }
    }
    if (seen[targetCell] === -1) return null;

    const cells = [];
    let cursor = targetCell;
    while (cursor !== -1) {
        cells.push(cursor);
        if (cursor === startCell) break;
        cursor = parent[cursor];
    }
    cells.reverse();
    if (cells[0] !== startCell) return null;

    const waypoints = [{ x: startX, y: startY }];
    for (let index = 1; index < cells.length - 1; index++) {
        const tile = reps[cells[index]];
        if (tile < 0) return null;
        waypoints.push({ x: (tile % W) + 0.5, y: Math.floor(tile / W) + 0.5 });
    }
    waypoints.push({ x: targetX, y: targetY });

    const route = [];
    for (let index = 0; index < waypoints.length - 1; index++) {
        const from = waypoints[index], to = waypoints[index + 1];
        const segment = findPathDirect(from.x, from.y, to.x, to.y, HIERARCHICAL_LOCAL_CAP);
        if (!segment) return null;
        for (const node of segment) {
            if (!isWalkable(node.x, node.y)) return null;
            route.push(node);
        }
    }
    return route.length ? route : null;
}

function findHierarchicalPath(startX, startY, targetX, targetY) {
    const reachable = getReachableTiles(startX, startY);
    if (!reachable) return null;
    // 16-tile cells keep refinement local; 8- and 4-tile cells are the
    // safety net around narrow coastlines and dense building footprints.
    for (const cellSize of [16, 8, 4]) {
        const grid = getHierarchicalGrid(cellSize, reachable);
        const route = hierarchicalRoute(grid, startX, startY, targetX, targetY);
        if (route) return route;
    }
    return null;
}

export function findPath(startX,startY,targetX,targetY,maxNodes=1800){
    const direct = findPathDirect(startX,startY,targetX,targetY,maxNodes);
    if (direct) return direct;
    // Only a search that hit the node guard gets the hierarchical retry.
    // Genuinely unreachable targets must stay cheap and return null.
    if (lastDirectPathResult !== "cap") return null;
    if (Math.max(Math.abs(targetX - startX), Math.abs(targetY - startY)) < HIERARCHICAL_TRIGGER_DISTANCE) return null;
    return findHierarchicalPath(startX,startY,targetX,targetY);
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
    let best = null, bestDist = Infinity, bestScore = Infinity;
    const preferredBuilding = villager.person?.activeGoal?.id === "secure_food" ? TYPE.FARM : null;
    for (const m of JOB_MAP) {
        const capacity=BUILDING_WORKFORCE[m.building]||0;
        for (const b of (workplaces?.get(m)||getEntitiesOfType(m.building))) {
            if((workerCounts.get(b)||0)>=capacity)continue;
            const d = Math.hypot(villager.x - b.x, villager.y - b.y);
            const score = d + (preferredBuilding ? (m.building === preferredBuilding ? -12 : 8) : 0);
            if (score < bestScore) { bestScore = score; bestDist = d; best = { workplace: b, job: m.job }; }
        }
    }
    // Construction sites reserve up to two builders. They compete with normal
    // workplaces by distance so a new foundation is not ignored simply because
    // every resident already holds a production job.
    const constructionSites = state.entities.filter(entity =>
        !entity.dead && entity.isBuilding() && entity.construction && entity.construction.stage < 3 &&
        !entity.construction.paused && (workerCounts.get(entity) || 0) < 2
    );
    for (const site of constructionSites) {
        const d = Math.hypot(villager.x - site.x, villager.y - site.y);
        if (d > 40 || d >= bestDist - 6) continue;
        bestDist = d;
        best = { workplace: site, job: "builder" };
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
