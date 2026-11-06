// Accelerated ten-year economy audit on default colossal worlds across seeds.
// Run with: node --expose-gc scripts/colossal-decade-seeds.mjs

import { performance } from "node:perf_hooks";
import { resetState, state } from "../js/core/state.js";
import { DEFAULT_WORLD_OPTIONS } from "../js/world/terrain-model.js";
import { initWorld } from "../js/world/world.js";
import { initStartingKingdom } from "../js/world/entities.js";
import { updateSimulation } from "../js/simulation/simulation.js";
import { TYPE } from "../js/core/types.js";

const SEEDS = [20261107, 1846, 424242, 7, 90210];
const OPTIONS = { ...DEFAULT_WORLD_OPTIONS, size: "colossal" };
const TICKS = 4000;
const DAYS_PER_YEAR = 400;

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

function runSeed(seed) {
    resetState();
    state.worldSeed = seed;
    state.worldOptions = { ...OPTIONS };
    state.hasStarted = true;
    state.isPaused = false;
    state.gameOver = false;

    const initStarted = performance.now();
    withCanvasStub(() => initWorld(seed, state.worldOptions));
    initStartingKingdom();
    const initMs = performance.now() - initStarted;

    const initial = {
        population: populationCount(),
        buildings: buildingCount(),
        gold: rounded(state.resources.gold),
        food: rounded(state.resources.food),
        morale: rounded(state.morale, 1),
        legitimacy: rounded(state.politics?.legitimacy, 1),
    };

    let minFood = Infinity, maxFood = -Infinity, minGold = Infinity, maxGold = -Infinity;
    let ledgerPeriods = 0, shortagePeriods = 0, shortageTotal = 0;
    let unpaidWagePeriods = 0, unpaidUpkeepPeriods = 0;
    const simulationStarted = performance.now();
    let completedTicks = 0;
    for (let tick = 1; tick <= TICKS; tick++) {
        updateSimulation();
        completedTicks = state.tick;
        minFood = Math.min(minFood, state.resources.food);
        maxFood = Math.max(maxFood, state.resources.food);
        minGold = Math.min(minGold, state.resources.gold);
        maxGold = Math.max(maxGold, state.resources.gold);
        if (state.tick % 20 === 0 && state.economy?.lastLedger) {
            ledgerPeriods++;
            const ledger = state.economy.lastLedger;
            if (ledger.foodShortage > 0) {
                shortagePeriods++;
                shortageTotal += ledger.foodShortage;
            }
            if (ledger.unpaidWages > 0) unpaidWagePeriods++;
            if (ledger.unpaidUpkeep > 0) unpaidUpkeepPeriods++;
        }
        if (state.gameOver) break;
    }
    const simulationMs = performance.now() - simulationStarted;

    const totals = state.economy || {};
    const economy = {
        daysElapsed: rounded(totals.daysElapsed),
        foodConsumed: rounded(totals.foodConsumed),
        taxesCollected: rounded(totals.taxesCollected),
        wagesPaid: rounded(totals.wagesPaid),
        upkeepPaid: rounded(totals.upkeepPaid),
        furnitureUpkeepPaid: rounded(totals.furnitureUpkeepPaid),
        netGold: rounded((totals.taxesCollected || 0) - (totals.wagesPaid || 0) - (totals.upkeepPaid || 0) - (totals.furnitureUpkeepPaid || 0)),
        unpaidWages: rounded(totals.unpaidWages),
        unpaidUpkeep: rounded(totals.unpaidUpkeep),
    };

    const final = {
        year: state.year,
        tick: state.tick,
        population: populationCount(),
        economyPopulation: state.economy?.population || 0,
        employed: state.economy?.employed || 0,
        buildings: buildingCount(),
        wood: rounded(state.resources.wood),
        stone: rounded(state.resources.stone),
        gold: rounded(state.resources.gold),
        food: rounded(state.resources.food),
        morale: rounded(state.morale, 1),
        legitimacy: rounded(state.politics?.legitimacy, 1),
        gameOver: Boolean(state.gameOver),
        victory: Boolean(state.victory),
        totalEntities: state.entities.length,
    };

    const resourcesValid = Object.values(state.resources).every(value => Number.isFinite(value) && value >= 0);
    const entitiesValid = state.entities.every(entity =>
        Number.isFinite(entity.x) && Number.isFinite(entity.y)
        && entity.x >= 0 && entity.y >= 0
        && entity.x < state.worldW && entity.y < state.worldH
    );
    const ids = state.entities.map(entity => entity.id).filter(Boolean);
    const uniqueIds = new Set(ids).size === ids.length;
    const moodsValid = Number.isFinite(state.morale) && state.morale >= 0 && state.morale <= 100
        && Number.isFinite(state.politics?.legitimacy) && state.politics.legitimacy >= 0 && state.politics.legitimacy <= 100;
    const valid = resourcesValid && entitiesValid && uniqueIds && moodsValid && completedTicks <= TICKS;

    return {
        seed,
        options: { ...state.worldOptions },
        world: [state.worldW, state.worldH],
        terrain: [state.terrainPixW, state.terrainPixH],
        initMs: rounded(initMs, 1),
        simulationMs: rounded(simulationMs, 1),
        completedTicks,
        yearsElapsed: rounded((completedTicks - state.dayOfYear) / DAYS_PER_YEAR, 1),
        initial,
        final,
        economy,
        ledgerPeriods,
        shortagePeriods,
        shortageTotal: rounded(shortageTotal),
        unpaidWagePeriods,
        unpaidUpkeepPeriods,
        minFood: rounded(minFood),
        maxFood: rounded(maxFood),
        minGold: rounded(minGold),
        maxGold: rounded(maxGold),
        valid,
    };
}

const runs = SEEDS.map(runSeed);
const range = (values) => [Math.min(...values), Math.max(...values)];
const summary = {
    profile: "default world options, colossal",
    seeds: SEEDS,
    counts: {
        completedTenYears: runs.filter(run => run.completedTicks === TICKS).length,
        gameOver: runs.filter(run => run.final.gameOver).length,
        victory: runs.filter(run => run.final.victory).length,
        invalid: runs.filter(run => !run.valid).length,
    },
    finalPopulation: range(runs.map(run => run.final.population)),
    finalBuildings: range(runs.map(run => run.final.buildings)),
    finalGold: range(runs.map(run => run.final.gold)),
    finalFood: range(runs.map(run => run.final.food)),
    finalWood: range(runs.map(run => run.final.wood)),
    minFood: Math.min(...runs.map(run => run.minFood)),
    netGold: range(runs.map(run => run.economy.netGold)),
    shortageRuns: runs.filter(run => run.shortagePeriods > 0).length,
    totalShortage: rounded(runs.reduce((total, run) => total + run.shortageTotal, 0)),
    initMs: range(runs.map(run => run.initMs)),
    simulationMs: range(runs.map(run => run.simulationMs)),
};

console.log("DEFAULT DECADE SEEDS", JSON.stringify({ summary, runs }));

if (summary.counts.invalid > 0) process.exitCode = 1;
