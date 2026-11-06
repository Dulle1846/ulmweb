// Investigate the 5,000-node A* cap on the colossal stress map.
// Run with: node --expose-gc scripts/path-limit-audit.mjs
//
// The local A* is a faithful, instrumented copy of villagers.js::findPath.
// The shipped findPath() is also called once at its current 5,000-node cap.

import { performance } from "node:perf_hooks";
import { resetState, state } from "../js/core/state.js";
import { initWorld, worldWidth, worldHeight } from "../js/world/world.js";
import { initStartingKingdom } from "../js/world/entities.js";
import { isWalkable, rebuildBlockedBuildingTiles, findPath } from "../js/simulation/villagers.js";
import { getRoadTravelCost } from "../js/systems/roads.js";

const SEED = 20261107;
const OPTIONS = {
    size: "colossal",
    shape: "continent",
    climate: "temperate",
    landmass: 55,
    ruggedness: 65,
    forests: 62,
    water: 47,
    fertility: 60,
    resources: 58,
    mountains: 80,
    rivers: 65,
    lakes: 80,
    coastline: 75,
    snow: 55,
    wetlands: 65,
    aridity: 40,
};

function makeCanvasStub() {
    return {
        width: 0,
        height: 0,
        getContext() {
            return {
                createImageData(width, height) {
                    return { width, height, data: new Uint8ClampedArray(width * height * 4) };
                },
                putImageData() {},
            };
        },
    };
}

function withCanvasStub(callback) {
    const previous = globalThis.document;
    globalThis.document = {
        createElement(tag) {
            if (tag !== "canvas") throw new Error("Unexpected DOM element in benchmark: " + tag);
            return makeCanvasStub();
        },
    };
    try {
        return callback();
    } finally {
        globalThis.document = previous;
    }
}

function rounded(value, digits = 2) {
    const factor = 10 ** digits;
    return Math.round((Number(value) || 0) * factor) / factor;
}

function analyzeLand() {
    const W = worldWidth(), H = worldHeight(), total = W * H;
    const walkable = new Uint8Array(total);
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) walkable[y * W + x] = isWalkable(x + 0.5, y + 0.5) ? 1 : 0;
    }
    const component = new Int32Array(total).fill(-1);
    const queue = new Int32Array(total);
    let componentId = 0;
    let largest = { id: -1, size: 0, seed: -1, span: 0, a: null, b: null };
    for (let start = 0; start < total; start++) {
        if (!walkable[start] || component[start] !== -1) continue;
        let head = 0, tail = 0, size = 0;
        queue[tail++] = start;
        component[start] = componentId;
        while (head < tail) {
            const index = queue[head++];
            size++;
            const x = index % W, y = Math.floor(index / W);
            for (let oy = -1; oy <= 1; oy++) {
                for (let ox = -1; ox <= 1; ox++) {
                    if (!ox && !oy) continue;
                    const nx = x + ox, ny = y + oy;
                    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                    const next = ny * W + nx;
                    if (!walkable[next] || component[next] !== -1) continue;
                    if (ox && oy && (!walkable[y * W + nx] || !walkable[ny * W + x])) continue;
                    component[next] = componentId;
                    queue[tail++] = next;
                }
            }
        }
        if (size > largest.size) largest = { id: componentId, size, seed: start, span: 0, a: null, b: null };
        componentId++;
    }

    const dist = new Int32Array(total);
    const parent = new Int32Array(total).fill(-1);
    function farthest(startIndex) {
        dist.fill(-1);
        parent.fill(-1);
        let head = 0, tail = 0, bestIndex = startIndex, bestDistance = 0;
        queue[tail++] = startIndex;
        dist[startIndex] = 0;
        while (head < tail) {
            const index = queue[head++];
            if (dist[index] > bestDistance) { bestDistance = dist[index]; bestIndex = index; }
            const x = index % W, y = Math.floor(index / W);
            for (let oy = -1; oy <= 1; oy++) {
                for (let ox = -1; ox <= 1; ox++) {
                    if (!ox && !oy) continue;
                    const nx = x + ox, ny = y + oy;
                    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                    const next = ny * W + nx;
                    if (component[next] !== largest.id || dist[next] !== -1) continue;
                    if (ox && oy && (!walkable[y * W + nx] || !walkable[ny * W + x])) continue;
                    dist[next] = dist[index] + 1;
                    parent[next] = index;
                    queue[tail++] = next;
                }
            }
        }
        return { index: bestIndex, distance: bestDistance };
    }
    const first = farthest(largest.seed);
    const second = farthest(first.index);
    largest.span = second.distance;
    largest.a = { x: first.index % W, y: Math.floor(first.index / W) };
    largest.b = { x: second.index % W, y: Math.floor(second.index / W) };
    const path = [];
    let cursor = second.index;
    while (cursor !== -1 && cursor !== first.index) {
        path.push({ x: (cursor % W) + 0.5, y: Math.floor(cursor / W) + 0.5 });
        cursor = parent[cursor];
    }
    path.push({ x: (first.index % W) + 0.5, y: Math.floor(first.index / W) + 0.5 });
    path.reverse();
    largest.path = path;
    return { totalWalkable: walkable.reduce((sum, value) => sum + value, 0), components: componentId, largest };
}

function heapPush(heap, node) {
    heap.push(node);
    let index = heap.length - 1;
    while (index > 0) {
        const parent = (index - 1) >> 1;
        if (heap[parent].f <= node.f) break;
        heap[index] = heap[parent];
        index = parent;
    }
    heap[index] = node;
}

function heapPop(heap) {
    if (!heap.length) return null;
    const first = heap[0], last = heap.pop();
    if (heap.length) {
        let index = 0;
        while (true) {
            const left = index * 2 + 1, right = left + 1;
            if (left >= heap.length) break;
            const child = right < heap.length && heap[right].f < heap[left].f ? right : left;
            if (heap[child].f >= last.f) break;
            heap[index] = heap[child];
            index = child;
        }
        heap[index] = last;
    }
    return first;
}

const heuristic = (x, y, tx, ty) => {
    const dx = Math.abs(tx - x), dy = Math.abs(ty - y);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
};

function auditAStar(startX, startY, targetX, targetY, maxNodes = 5000, heuristicWeight = 0.78) {
    const W = worldWidth(), H = worldHeight();
    const sx = Math.floor(startX), sy = Math.floor(startY), tx = Math.floor(targetX), ty = Math.floor(targetY);
    if (sx < 0 || sy < 0 || tx < 0 || ty < 0 || sx >= W || sy >= H || tx >= W || ty >= H) {
        return { found: false, reason: "outside world" };
    }
    if (sx === tx && sy === ty) return { found: true, route: [], nodes: 0, expanded: 0, maxOpen: 0, ms: 0 };
    if (!isWalkable(tx + 0.5, ty + 0.5)) return { found: false, reason: "target blocked" };

    const start = sy * W + sx, target = ty * W + tx;
    const open = [], costs = new Map([[start, 0]]), parents = new Map(), closed = new Set();
    heapPush(open, { index: start, x: sx, y: sy, g: 0, f: heuristic(sx, sy, tx, ty) * heuristicWeight });
    const directions = [[-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1], [-1, -1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [1, 1, Math.SQRT2]];
    let visited = 0, maxOpen = 1;
    const started = performance.now();
    while (open.length && visited < Math.max(100, Math.min(400000, Math.floor(maxNodes) || 1800))) {
        const current = heapPop(open);
        if (closed.has(current.index)) continue;
        if (current.g !== costs.get(current.index)) continue;
        if (current.index === target) {
            const route = [];
            let cursor = target;
            while (cursor !== start) {
                route.push({ x: (cursor % W) + 0.5, y: Math.floor(cursor / W) + 0.5 });
                cursor = parents.get(cursor);
                if (cursor === undefined) return { found: false, reason: "broken parent chain" };
            }
            route.reverse();
            const ms = performance.now() - started;
            const valid = route.every(node => isWalkable(node.x, node.y));
            return { found: true, route, nodes: route.length, expanded: visited, maxOpen, ms, valid };
        }
        closed.add(current.index);
        visited++;
        for (const [dx, dy, stepCost] of directions) {
            const nx = current.x + dx, ny = current.y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const next = ny * W + nx;
            if (closed.has(next) || !isWalkable(nx + 0.5, ny + 0.5)) continue;
            if (dx !== 0 && dy !== 0 && (!isWalkable(current.x + dx + 0.5, current.y + 0.5) || !isWalkable(current.x + 0.5, current.y + dy + 0.5))) continue;
            const nextCost = current.g + stepCost * getRoadTravelCost(nx + 0.5, ny + 0.5);
            const known = costs.get(next);
            if (known !== undefined && nextCost >= known) continue;
            costs.set(next, nextCost);
            parents.set(next, current.index);
            heapPush(open, { index: next, x: nx, y: ny, g: nextCost, f: nextCost + heuristic(nx, ny, tx, ty) * heuristicWeight });
            if (open.length > maxOpen) maxOpen = open.length;
        }
    }
    const ms = performance.now() - started;
    return { found: false, reason: "search cap reached", expanded: visited, maxOpen, ms, cap: maxNodes };
}

const initStarted = performance.now();
resetState();
state.worldSeed = SEED;
state.worldOptions = { ...OPTIONS };
state.hasStarted = true;
state.isPaused = false;
withCanvasStub(() => initWorld(SEED, state.worldOptions));
initStartingKingdom();
rebuildBlockedBuildingTiles();
const initMs = performance.now() - initStarted;

const land = analyzeLand();
const from = land.largest.a, to = land.largest.b;
const actualStarted = performance.now();
const actualRoute = findPath(from.x + 0.5, from.y + 0.5, to.x + 0.5, to.y + 0.5, 5000);
const actualMs = performance.now() - actualStarted;

function segmentAudit(chunkSize) {
    const source = land.largest.path;
    const waypoints = [source[0]];
    for (let index = chunkSize; index < source.length; index += chunkSize) waypoints.push(source[index]);
    if (waypoints[waypoints.length - 1] !== source[source.length - 1]) waypoints.push(source[source.length - 1]);
    const segments = [];
    for (let index = 0; index < waypoints.length - 1; index++) {
        const start = waypoints[index], end = waypoints[index + 1];
        const started = performance.now();
        const route = findPath(start.x, start.y, end.x, end.y, 5000);
        const ms = performance.now() - started;
        const valid = Boolean(route) && route.every(node => isWalkable(node.x, node.y));
        segments.push({ from: start, to: end, found: Boolean(route), nodes: route?.length || 0, ms: rounded(ms, 1), valid });
    }
    return {
        chunkSize,
        waypoints: waypoints.length,
        segments,
        found: segments.every(segment => segment.found && segment.valid),
        totalNodes: segments.reduce((total, segment) => total + segment.nodes, 0),
        totalMs: rounded(segments.reduce((total, segment) => total + segment.ms, 0), 1),
        maxMs: rounded(Math.max(...segments.map(segment => segment.ms)), 1),
    };
}

const waypointResults = [160, 120, 80].map(segmentAudit);

function weightedSegmentAudit(chunkSize, maxNodes, heuristicWeight) {
    const source = land.largest.path;
    const waypoints = [source[0]];
    for (let index = chunkSize; index < source.length; index += chunkSize) waypoints.push(source[index]);
    if (waypoints[waypoints.length - 1] !== source[source.length - 1]) waypoints.push(source[source.length - 1]);
    const segments = [];
    for (let index = 0; index < waypoints.length - 1; index++) {
        const start = waypoints[index], end = waypoints[index + 1];
        const result = auditAStar(start.x, start.y, end.x, end.y, maxNodes, heuristicWeight);
        segments.push({
            from: start,
            to: end,
            found: Boolean(result.found),
            nodes: result.nodes || 0,
            expanded: result.expanded || 0,
            ms: rounded(result.ms, 1),
            valid: result.valid ?? false,
        });
    }
    return {
        chunkSize,
        heuristicWeight,
        maxNodes,
        waypoints: waypoints.length,
        segments,
        found: segments.every(segment => segment.found && segment.valid),
        totalNodes: segments.reduce((total, segment) => total + segment.nodes, 0),
        totalMs: rounded(segments.reduce((total, segment) => total + segment.ms, 0), 1),
        maxMs: rounded(Math.max(...segments.map(segment => segment.ms)), 1),
    };
}

const weightedWaypoints = [160, 120, 80].map(chunkSize => weightedSegmentAudit(chunkSize, 5000, 1.25));

const caps = [1800, 5000, 10000, 20000, 40000, 80000, 160000, 240000];
const capResults = caps.map(cap => {
    const result = auditAStar(from.x + 0.5, from.y + 0.5, to.x + 0.5, to.y + 0.5, cap, 0.78);
    return {
        cap,
        found: result.found,
        nodes: result.nodes || 0,
        expanded: result.expanded || 0,
        maxOpen: result.maxOpen || 0,
        ms: rounded(result.ms, 1),
        valid: result.valid ?? false,
        reason: result.reason || null,
    };
});

const weightedCaps = [5000, 10000, 20000].map(cap => {
    const result = auditAStar(from.x + 0.5, from.y + 0.5, to.x + 0.5, to.y + 0.5, cap, 1.25);
    return { cap, found: result.found, nodes: result.nodes || 0, expanded: result.expanded || 0, ms: rounded(result.ms, 1), valid: result.valid ?? false, reason: result.reason || null };
});

const heuristicResults = [0.78, 0.9, 1.0, 1.1, 1.25].map(weight => {
    const result = auditAStar(from.x + 0.5, from.y + 0.5, to.x + 0.5, to.y + 0.5, 240000, weight);
    return {
        weight,
        found: result.found,
        nodes: result.nodes || 0,
        expanded: result.expanded || 0,
        maxOpen: result.maxOpen || 0,
        ms: rounded(result.ms, 1),
        valid: result.valid ?? false,
        reason: result.reason || null,
    };
});

const firstPassingCap = capResults.find(result => result.found && result.valid);
const largestSummary = { ...land.largest, pathNodes: land.largest.path.length };
delete largestSummary.path;
console.log("PATH LIMIT AUDIT", JSON.stringify({
    seed: SEED,
    world: [worldWidth(), worldHeight()],
    terrain: [state.terrainPixW, state.terrainPixH],
    initMs: rounded(initMs, 1),
    land: { ...land, largest: largestSummary },
    endpoints: { from, to, span: land.largest.span },
    currentFindPath: {
        maxNodes: 5000,
        found: Boolean(actualRoute),
        nodes: actualRoute?.length || 0,
        ms: rounded(actualMs, 2),
    },
    waypointResults,
    weightedWaypoints,
    caps: capResults,
    weightedCaps,
    heuristics: heuristicResults,
    firstPassingCap: firstPassingCap?.cap || null,
}));

if (!actualRoute && !firstPassingCap) process.exitCode = 1;
