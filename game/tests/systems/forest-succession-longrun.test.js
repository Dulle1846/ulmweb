import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import {
    findNearestResourceNode, generateResourceGeography, harvestForest, regrowForests,
} from "../../js/systems/resource-geography.js";
import { gatherNearestForestProducts } from "../../js/systems/forest-gathering.js";
import {
    ensureForestSuccession, resetForestSuccession, suppressNearestForestDisturbance,
    updateForestSuccession,
} from "../../js/systems/forest-succession.js";
import { forestSuccessionStage } from "../../js/world/forest-ecology.js";

// The unit tests prove one spread pass and one control action. This audit runs
// the same daily loop the simulation uses for four decades: succession every
// day, plus one stock regrowth pass every 25 days. It exists to catch a slow
// takeover that a 10-day test cannot see, and to keep the spread and recovery
// rates honest after future tuning.
function setup(seed = 20261108) {
    resetState();
    resetForestSuccession();
    state.worldSeed = seed;
    state.worldW = 64;
    state.worldH = 64;
    state.terrainResolution = 2;
    state.terrainPixW = 128;
    state.terrainPixH = 128;
    state.worldOptions = { landmass: 50, ruggedness: 55, forests: 70, water: 48, climate: "temperate" };
    state.heightMap = new Float32Array(128 * 128).fill(0.62);
    state.moistureMap = new Float32Array(128 * 128).fill(0.68);
    state.temperatureMap = new Float32Array(128 * 128).fill(0.55);
    state.weather = "clear";
    state.year = 1;
    state.dayOfYear = 0;
    state.tick = 0;
    state.seasonIndex = 0;
    generateResourceGeography(seed);
    return ensureForestSuccession();
}

function forestMetrics(model, geo, forestTiles) {
    const counts = { fresh: 0, regrowth: 0, young: 0, recovering: 0, recovered: 0 };
    for (const record of Object.values(model.tiles)) {
        const stage = forestSuccessionStage(record.kind, record.age);
        if (stage) counts[stage.id]++;
    }
    let stock = 0;
    let capacity = 0;
    for (let i = 0; i < geo.forestCapacity.length; i++) {
        stock += geo.forestStock[i] || 0;
        capacity += geo.forestCapacity[i] || 0;
    }
    const active = counts.fresh + counts.regrowth + counts.young + counts.recovering;
    return {
        ...counts,
        active,
        ratio: active / Math.max(1, forestTiles),
        fill: stock / Math.max(1, capacity),
        events: model.events,
        spreads: model.spreadings,
    };
}

function runYears(years, { control = false } = {}) {
    const model = ensureForestSuccession();
    const geo = state.resourceGeography;
    const forestTiles = geo.forestCapacity.reduce((count, capacity) => count + (capacity > 0 ? 1 : 0), 0);
    if (control) {
        state.resources.wood = 200;
        state.resources.food = 200;
        state.resources.gold = 200;
    }
    const rows = [];
    let suppressed = 0;
    for (let year = 1; year <= years; year++) {
        for (let day = 0; day < 400; day++) {
            state.tick++;
            state.dayOfYear++;
            if (state.dayOfYear >= 400) {
                state.dayOfYear = 0;
                state.year++;
            }
            state.seasonIndex = Math.floor(state.dayOfYear / 100) % 4;
            updateForestSuccession(1);
            regrowForests(400, { slice: state.tick % 400, slices: 400 });
            if (control && day % 20 === 0) {
                for (let i = 0; i < 2; i++) {
                    if (suppressNearestForestDisturbance(32, 32, 24).ok) suppressed++;
                }
            }
            if (control && day === 399) {
                state.resources.wood += 40;
                state.resources.food += 40;
                state.resources.gold += 40;
            }
        }
        rows.push({ year, ...forestMetrics(model, geo, forestTiles), suppressed });
    }
    return { model, geo, forestTiles, rows, suppressed };
}

function runTimberYears(years, { yards = 8, gathers = 4, gatherEvery = 5 } = {}) {
    const model = ensureForestSuccession();
    const geo = state.resourceGeography;
    const forestTiles = geo.forestCapacity.reduce((count, capacity) => count + (capacity > 0 ? 1 : 0), 0);
    const yardSites = Array.from({ length: yards }, (_, index) => ({
        x: 8 + (index * 13) % 56,
        y: 8 + (index * 23) % 56,
    }));
    const gatherSites = [[16, 16], [16, 48], [48, 16], [48, 48], [32, 16], [16, 32], [48, 32], [32, 48]]
        .slice(0, gathers);
    let harvested = 0;
    let gathered = 0;
    let regrown = 0;
    let failed = 0;
    const rows = [];

    for (let year = 1; year <= years; year++) {
        for (let day = 0; day < 400; day++) {
            state.tick++;
            state.dayOfYear++;
            if (state.dayOfYear >= 400) {
                state.dayOfYear = 0;
                state.year++;
            }
            state.seasonIndex = Math.floor(state.dayOfYear / 100) % 4;
            updateForestSuccession(1);
            regrown += regrowForests(400, { slice: state.tick % 400, slices: 400 });

            // The Lumber Yard recipe harvests two stock from its nearest wood
            // every six simulation days, then checks its seven-tile range again.
            if (state.tick % 6 === 0) {
                for (const site of yardSites) {
                    const node = findNearestResourceNode("forest", site.x, site.y, 7);
                    if (!node) { failed++; continue; }
                    const taken = harvestForest(node.x, node.y, 2);
                    harvested += taken;
                    if (taken <= 0) failed++;
                }
            }

            // A player visit uses the real gather action: several wood goods
            // from one tile, once per tile and day.
            if (gatherSites.length && day % gatherEvery === 0) {
                for (const [x, y] of gatherSites) {
                    const result = gatherNearestForestProducts(x, y, 7);
                    if (!result.ok) { failed++; continue; }
                    const wood = (result.goods || [])
                        .filter(good => good.category === "wood")
                        .reduce((sum, good) => sum + good.amount, 0);
                    gathered += wood;
                    harvested += wood;
                }
            }
        }
        const metrics = forestMetrics(model, geo, forestTiles);
        let depleted = 0;
        for (let i = 0; i < geo.forestCapacity.length; i++) {
            if ((geo.forestCapacity[i] || 0) > 0 && (geo.forestStock[i] || 0) <= 0) depleted++;
        }
        rows.push({ year, fill: metrics.fill, depleted });
    }
    return { rows, forestTiles, harvested, gathered, regrown, failed };
}

test("a century of timber harvest and regrowth keeps the wood standing", () => {
    setup();
    const run = runTimberYears(100, { yards: 8, gathers: 4, gatherEvery: 5 });
    const last = run.rows[run.rows.length - 1];
    const lowest = run.rows.reduce((low, row) => row.fill < low.fill ? row : low);

    assert.ok(run.harvested > 150000, `only ${run.harvested} stock was harvested over the century`);
    assert.ok(run.gathered > 100000, `only ${run.gathered} stock came from the real gathering action`);
    assert.ok(run.regrown > run.harvested, `regrowth ${run.regrown} did not cover harvest ${run.harvested}`);
    assert.ok(lowest.fill > 0.8, `forest fill fell to ${(lowest.fill * 100).toFixed(1)}% in year ${lowest.year}`);
    assert.ok(last.fill > 0.84, `century-end forest fill was ${(last.fill * 100).toFixed(1)}%`);
    assert.ok(last.depleted < run.forestTiles * 0.1, `${last.depleted} forest tiles were fully depleted`);
    assert.ok(run.failed < 10, `${run.failed} harvesting actions found no reachable wood`);
});

test("four decades of fire, storm and disease stay below a fifth of the forest", () => {
    setup();
    const run = runYears(40);
    const last = run.rows[run.rows.length - 1];
    const peak = run.rows.reduce((highest, row) => row.ratio > highest.ratio ? row : highest);

    assert.ok(peak.ratio < 0.15, `peak disturbed share was ${(peak.ratio * 100).toFixed(1)}% in year ${peak.year}`);
    assert.ok(last.ratio < 0.12, `final disturbed share was ${(last.ratio * 100).toFixed(1)}%`);
    assert.ok(last.fill > 0.9, `forest stock fill fell to ${(last.fill * 100).toFixed(1)}%`);
    assert.ok(last.recovered > 100, "old disturbances must actually leave the active stages");
    assert.ok(last.events >= 100, "the event cadence must still produce disturbances");
    assert.ok(last.spreads > 3000, "the neighbour rule must still spread disturbances");
    assert.ok(run.model.spreadHistory.length <= 24);
    for (const row of run.rows) {
        assert.ok(row.active <= run.forestTiles, "disturbed tiles can never exceed the forest");
        assert.ok(row.ratio < 0.15, `year ${row.year} exceeded the disturbance budget`);
    }
});

test("control parties keep working without stalling the decades model", () => {
    setup();
    const run = runYears(12, { control: true });
    const last = run.rows[run.rows.length - 1];
    assert.ok(run.suppressed > 0, "the control policy must contain real disturbances");
    assert.ok(last.ratio < 0.15, `controlled disturbed share was ${(last.ratio * 100).toFixed(1)}%`);
    assert.ok(last.fill > 0.9, `controlled forest fill was ${(last.fill * 100).toFixed(1)}%`);
    assert.ok(last.events > 25);
    assert.ok(last.recovered > 0);
});
