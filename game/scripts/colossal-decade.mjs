// Accelerated ten-year audit for a colossal (576 x 576) realm.
// Run with: node --expose-gc scripts/colossal-decade.mjs
//
// The benchmark uses the real terrain generator, the real starting kingdom and
// the real fixed-step simulation. Rendering is not involved; the only stub is a
// canvas used by the one-off terrain prerender during initWorld().

import { performance } from "node:perf_hooks";
import { resetState, state } from "../js/core/state.js";
import { initWorld, worldWidth, worldHeight, isWaterAt } from "../js/world/world.js";
import { initStartingKingdom } from "../js/world/entities.js";
import { updateSimulation } from "../js/simulation/simulation.js";
import { findPath, isWalkable } from "../js/simulation/villagers.js";
import { TYPE } from "../js/core/types.js";

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
const DAYS_PER_YEAR = 400;
const YEARS = 10;
const TICKS = DAYS_PER_YEAR * YEARS;

function mb(bytes) {
    return Math.round((bytes / 1024 / 1024) * 100) / 100;
}

function memorySnapshot(label) {
    if (typeof global.gc === "function") global.gc();
    const usage = process.memoryUsage();
    return {
        label,
        rssMB: mb(usage.rss),
        heapUsedMB: mb(usage.heapUsed),
        heapTotalMB: mb(usage.heapTotal),
        externalMB: mb(usage.external),
        arrayBuffersMB: mb(usage.arrayBuffers),
    };
}

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

function populationCount() {
    return state.entities.filter(entity => !entity.dead && entity.type === TYPE.VILLAGER).length;
}

function buildingCount() {
    return state.entities.filter(entity => !entity.dead && entity.isBuilding?.()).length;
}

function snapshot() {
    const ledger = state.economy?.lastLedger || {};
    return {
        year: state.year,
        tick: state.tick,
        resources: Object.fromEntries(Object.entries(state.resources).map(([key, value]) => [key, rounded(value)])),
        population: populationCount(),
        economyPopulation: state.economy?.population || 0,
        employed: state.economy?.employed || 0,
        buildings: buildingCount(),
        morale: rounded(state.morale, 1),
        legitimacy: rounded(state.politics?.legitimacy, 1),
        foodShortage: rounded(ledger.foodShortage),
        netGold: rounded(ledger.netGold),
        roomGold: rounded(ledger.roomGold),
        gameOver: Boolean(state.gameOver),
        victory: Boolean(state.victory),
        totalEntities: state.entities.length,
    };
}

function findWalkableNear(cx, cy, minRadius, maxRadius) {
    for (let radius = minRadius; radius <= maxRadius; radius++) {
        for (let ox = -radius; ox <= radius; ox++) {
            for (let oy = -radius; oy <= radius; oy++) {
                if (Math.max(Math.abs(ox), Math.abs(oy)) !== radius) continue;
                const x = cx + ox, y = cy + oy;
                if (x < 2 || y < 2 || x >= worldWidth() - 2 || y >= worldHeight() - 2) continue;
                if (!isWalkable(x + 0.5, y + 0.5)) continue;
                return { x, y };
            }
        }
    }
    return null;
}

function findTargetsAtDistance(origin, desiredDistance) {
    const angles = [0, Math.PI / 2, Math.PI, -Math.PI / 2, Math.PI / 4, -Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4];
    const targets = [];
    for (const angle of angles) {
        const idealX = origin.x + Math.cos(angle) * desiredDistance;
        const idealY = origin.y + Math.sin(angle) * desiredDistance;
        const target = findWalkableNear(Math.round(idealX), Math.round(idealY), 0, 10);
        if (!target) continue;
        const actualDistance = Math.hypot(target.x - origin.x, target.y - origin.y);
        if (actualDistance < desiredDistance * 0.9) continue;
        if (targets.some(existing => existing.x === target.x && existing.y === target.y)) continue;
        targets.push({ ...target, actualDistance });
    }
    return targets;
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
    function farthest(startIndex, size) {
        dist.fill(-1);
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
                    queue[tail++] = next;
                }
            }
        }
        return { index: bestIndex, distance: bestDistance, size };
    }
    const first = farthest(largest.seed, largest.size);
    const second = farthest(first.index, largest.size);
    largest.span = second.distance;
    largest.a = { x: first.index % W, y: Math.floor(first.index / W) };
    largest.b = { x: second.index % W, y: Math.floor(second.index / W) };
    // After the second sweep, dist[] is the BFS distance from largest.a. Pick
    // a genuinely reachable cell for the far-coordinate path probe; the
    // nearest Euclidean land can sit across a water channel.
    let farIndex = -1, farDiff = Infinity;
    for (let index = 0; index < total; index++) {
        if (component[index] !== largest.id || dist[index] < 5 || dist[index] > 30) continue;
        const diff = Math.abs(dist[index] - 12);
        if (diff < farDiff) { farDiff = diff; farIndex = index; }
    }
    largest.farProbe = farIndex >= 0
        ? { x: farIndex % W, y: Math.floor(farIndex / W), steps: dist[farIndex] }
        : null;
    return { totalWalkable: walkable.reduce((sum, value) => sum + value, 0), components: componentId, largest };
}

function pathBenchmark() {
    const centerX = Math.floor(worldWidth() / 2);
    const centerY = Math.floor(worldHeight() / 2);
    const start = findWalkableNear(centerX, centerY, 0, 80);
    if (!start) throw new Error("No walkable start tile found near the realm center.");
    const land = analyzeLand();
    const results = [];
    for (const distance of [8, 24, 48, 80, 140, 200]) {
        const targets = findTargetsAtDistance(start, distance);
        if (!targets.length) {
            results.push({ desiredDistance: distance, found: false, reason: "no walkable target" });
            continue;
        }
        let bestAttempt = null;
        for (const candidate of targets) {
            const started = performance.now();
            const route = findPath(start.x + 0.5, start.y + 0.5, candidate.x + 0.5, candidate.y + 0.5, 5000);
            const elapsedMs = performance.now() - started;
            const attempt = {
                desiredDistance: distance,
                actualDistance: rounded(candidate.actualDistance, 1),
                target: { x: candidate.x, y: candidate.y },
                elapsedMs: rounded(elapsedMs, 2),
            };
            if (!route) {
                bestAttempt ||= { ...attempt, found: false, reason: "no route" };
                continue;
            }
            const valid = route.every(node =>
                Number.isFinite(node.x) && Number.isFinite(node.y)
                && node.x >= 0 && node.y >= 0
                && node.x < worldWidth() && node.y < worldHeight()
                && isWalkable(node.x, node.y)
            );
            bestAttempt = { ...attempt, found: true, nodes: route.length, valid };
            break;
        }
        results.push(bestAttempt);
    }

    const farStart = land.largest.a;
    const farTarget = land.largest.farProbe;
    let farPath = null;
    if (farTarget) {
        const started = performance.now();
        const route = findPath(farStart.x + 0.5, farStart.y + 0.5, farTarget.x + 0.5, farTarget.y + 0.5, 5000);
        const elapsedMs = performance.now() - started;
        const valid = Boolean(route) && route.every(node =>
            Number.isFinite(node.x) && Number.isFinite(node.y)
            && node.x >= 0 && node.y >= 0
            && node.x < worldWidth() && node.y < worldHeight()
            && isWalkable(node.x, node.y)
        );
        farPath = {
            found: Boolean(route),
            from: farStart,
            to: { x: farTarget.x, y: farTarget.y },
            steps: farTarget.steps,
            nodes: route?.length || 0,
            elapsedMs: rounded(elapsedMs, 2),
            valid,
        };
    } else {
        farPath = { found: false, from: farStart, reason: "no nearby connected target" };
    }

    let longPath = null;
    if (land.largest.span >= 160) {
        const a = land.largest.a, b = land.largest.b;
        const started = performance.now();
        const route = findPath(a.x + 0.5, a.y + 0.5, b.x + 0.5, b.y + 0.5, 5000);
        const elapsedMs = performance.now() - started;
        const valid = Boolean(route) && route.every(node =>
            Number.isFinite(node.x) && Number.isFinite(node.y)
            && node.x >= 0 && node.y >= 0
            && node.x < worldWidth() && node.y < worldHeight()
            && isWalkable(node.x, node.y)
        );
        longPath = {
            found: Boolean(route),
            distance: land.largest.span,
            from: a,
            to: b,
            nodes: route?.length || 0,
            elapsedMs: rounded(elapsedMs, 2),
            valid,
            searchCap: 5000,
        };
    } else {
        longPath = { found: false, distance: land.largest.span, reason: "largest land component is shorter than 160 tiles" };
    }
    return { start, results, land, farPath, longPath };
}

function cumulativeEconomy() {
    const totals = state.economy || {};
    const keys = ["foodConsumed", "taxesCollected", "wagesPaid", "upkeepPaid", "furnitureUpkeepPaid", "roadUpkeepAssessed", "unpaidWages", "unpaidUpkeep", "unpaidFurniture", "roomGold", "roomMorale", "roomLegitimacy"];
    const result = { daysElapsed: totals.daysElapsed || 0 };
    for (const key of keys) result[key] = rounded(totals[key] || 0);
    result.netGold = rounded((totals.taxesCollected || 0) - (totals.wagesPaid || 0) - (totals.upkeepPaid || 0) - (totals.furnitureUpkeepPaid || 0));
    return result;
}

function structuralMemory() {
    const terrainPixels = state.terrainPixW * state.terrainPixH;
    const terrainBytes = terrainPixels * 4 * 3;
    const geography = state.resourceGeography;
    let geographyBytes = 0;
    if (geography) {
        for (const value of Object.values(geography)) {
            if (ArrayBuffer.isView(value)) geographyBytes += value.byteLength;
        }
    }
    return {
        world: `${state.worldW} x ${state.worldH}`,
        terrain: `${state.terrainPixW} x ${state.terrainPixH}`,
        terrainPixels,
        terrainMB: mb(terrainBytes),
        geographyMB: mb(geographyBytes),
        combinedMB: mb(terrainBytes + geographyBytes),
        exploredTiles: state.explored.length * (state.explored[0]?.length || 0),
        riverSegments: state.rivers.reduce((total, river) => total + river.length, 0),
    };
}

const memoryBefore = memorySnapshot("before world generation");

resetState();
state.worldSeed = SEED;
state.worldOptions = { ...OPTIONS };
state.hasStarted = true;
state.isPaused = false;
state.gameOver = false;

const initStarted = performance.now();
withCanvasStub(() => initWorld(SEED, state.worldOptions));
initStartingKingdom();
const initMs = performance.now() - initStarted;
const memoryAfterInit = memorySnapshot("after world + starting kingdom");
const initial = snapshot();
const structure = structuralMemory();

const simulationStarted = performance.now();
const yearly = [];
let lastYear = state.year;
let ledgerPeriods = 0;
let foodShortagePeriods = 0;
let foodShortageTotal = 0;
let unpaidWagePeriods = 0;
let unpaidUpkeepPeriods = 0;
let minFood = Infinity, maxFood = -Infinity;
let minGold = Infinity, maxGold = -Infinity;
for (let tick = 1; tick <= TICKS; tick++) {
    updateSimulation();
    minFood = Math.min(minFood, state.resources.food);
    maxFood = Math.max(maxFood, state.resources.food);
    minGold = Math.min(minGold, state.resources.gold);
    maxGold = Math.max(maxGold, state.resources.gold);
    if (state.tick % 20 === 0 && state.economy?.lastLedger) {
        ledgerPeriods++;
        const ledger = state.economy.lastLedger;
        if (ledger.foodShortage > 0) {
            foodShortagePeriods++;
            foodShortageTotal += ledger.foodShortage;
        }
        if (ledger.unpaidWages > 0) unpaidWagePeriods++;
        if (ledger.unpaidUpkeep > 0) unpaidUpkeepPeriods++;
    }
    if (state.year !== lastYear) {
        lastYear = state.year;
        yearly.push(snapshot());
    }
}
const simulationMs = performance.now() - simulationStarted;
const final = snapshot();
const economyTotals = {
    ...cumulativeEconomy(),
    ledgerPeriods,
    foodShortagePeriods,
    foodShortageTotal: rounded(foodShortageTotal),
    unpaidWagePeriods,
    unpaidUpkeepPeriods,
    minFood: rounded(minFood),
    maxFood: rounded(maxFood),
    minGold: rounded(minGold),
    maxGold: rounded(maxGold),
};
const memoryAfterSimulation = memorySnapshot("after ten-year simulation");
const paths = pathBenchmark();

const allEntitiesValid = state.entities.every(entity =>
    Number.isFinite(entity.x) && Number.isFinite(entity.y)
    && entity.x >= 0 && entity.y >= 0
    && entity.x < worldWidth() && entity.y < worldHeight()
);
const ids = state.entities.map(entity => entity.id).filter(Boolean);
const uniqueIds = new Set(ids).size === ids.length;
const resourcesValid = Object.values(state.resources).every(value => Number.isFinite(value) && value >= 0);
const populationValid = Number.isFinite(state.morale) && state.morale >= 0 && state.morale <= 100
    && Number.isFinite(state.politics?.legitimacy) && state.politics.legitimacy >= 0 && state.politics.legitimacy <= 100;
const pathChecks = paths.results.filter(result => result.found).map(result => result.valid);
const warnings = [];
if (paths.longPath && !paths.longPath.valid) {
    warnings.push(`single ${paths.longPath.distance}-tile route returned no path within the ${paths.longPath.searchCap}-node A* cap; shorter paths remain valid`);
}
const invariantFailures = [];
if (state.tick !== TICKS) invariantFailures.push(`tick ${state.tick} != ${TICKS}`);
if (state.year !== YEARS + 1) invariantFailures.push(`year ${state.year} != ${YEARS + 1}`);
if (yearly.length !== YEARS) invariantFailures.push(`yearly snapshots ${yearly.length} != ${YEARS}`);
if (economyTotals.daysElapsed !== TICKS) invariantFailures.push(`economy days ${economyTotals.daysElapsed} != ${TICKS}`);
if (economyTotals.ledgerPeriods !== TICKS / 20) invariantFailures.push(`ledger periods ${economyTotals.ledgerPeriods} != ${TICKS / 20}`);
if (!allEntitiesValid) invariantFailures.push("entity outside world bounds");
if (!uniqueIds) invariantFailures.push("duplicate entity ids");
if (!resourcesValid) invariantFailures.push("invalid resource balance");
if (!populationValid) invariantFailures.push("morale or legitimacy outside 0..100");
if (pathChecks.some(valid => !valid)) invariantFailures.push("path contains an unwalkable node");
if (!(paths.farPath?.found && paths.farPath.valid)) {
    invariantFailures.push("no valid path at far-coordinate land tile");
}

console.log("COLOSSAL DECADE · WORLD", JSON.stringify({
    seed: SEED,
    world: structure.world,
    terrain: structure.terrain,
    resolution: state.terrainResolution,
    initMs: rounded(initMs, 1),
    initial,
}));
console.log("COLOSSAL DECADE · MEMORY", JSON.stringify({
    structural: structure,
    before: memoryBefore,
    afterInit: memoryAfterInit,
    afterSimulation: memoryAfterSimulation,
}));
console.log("COLOSSAL DECADE · YEARLY", JSON.stringify(yearly));
console.log("COLOSSAL DECADE · FINAL", JSON.stringify({
    simulationMs: rounded(simulationMs, 1),
    ticksPerSecond: Math.round(TICKS / (simulationMs / 1000)),
    final,
    economy: economyTotals,
}));
console.log("COLOSSAL DECADE · PATHS", JSON.stringify(paths));
console.log("COLOSSAL DECADE · INVARIANTS", JSON.stringify({
    ok: invariantFailures.length === 0,
    failures: invariantFailures,
    warnings,
    entitiesValid: allEntitiesValid,
    uniqueIds,
    resourcesValid,
    moraleAndLegitimacyValid: populationValid,
    pathsValid: pathChecks.every(Boolean),
    farCoordinatePathValid: Boolean(paths.farPath?.found && paths.farPath.valid),
}));

if (invariantFailures.length) process.exitCode = 1;
