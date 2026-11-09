import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { spawnEntity } from "../../js/world/entities.js";
import {
    generateResourceGeography, getResourceNodeAt, harvestForest, plantForestAt, regrowForests,
} from "../../js/systems/resource-geography.js";
import { foresterRangeSummary, updateFields } from "../../js/systems/fields.js";
import { updateBuildingIncome } from "../../js/simulation/buildings.js";

// The short stewardship test proves one cut-over range can be repaired. This
// audit works the same range for ten game years across three seeds: the annual
// harvest is deliberately uneven, with a rotating number of thinned and
// clear-cut stands. A Forester can look healthy for 200 ticks and still lose a
// multi-year race against repeated harvest, while the terrain cache only
// invalidates on visible stocking stages rather than every sapling.
const YEARS = 10;
const DAYS_PER_YEAR = 400;
const SEEDS = [20261108, 7, 99];
const CLEAR_PATTERN = [3, 1, 2, 2, 3, 1, 3, 2, 1, 3];
const THINNING_PATTERN = [4, 2, 3, 4, 2, 4, 3, 2, 4, 3];
const CLEAR_DAY_PATTERN = [120, 100, 140, 80, 120, 140, 100, 80, 140, 120];

function scheduleFor(seedIndex, year) {
    const offset = (year - 1 + seedIndex) % YEARS;
    return {
        clearCount: CLEAR_PATTERN[offset],
        thinningCount: THINNING_PATTERN[offset],
        clearDay: CLEAR_DAY_PATTERN[offset],
    };
}

function setup(seed) {
    resetState();
    state.hasStarted = true;
    state.isPaused = false;
    state.gameOver = false;
    state.tick = 0;
    state.year = 1;
    state.dayOfYear = 0;
    state.seasonIndex = 0;
    state.worldSeed = seed;
    state.worldW = 64;
    state.worldH = 64;
    state.terrainResolution = 2;
    state.terrainPixW = 128;
    state.terrainPixH = 128;
    state.worldOptions = { landmass: 50, ruggedness: 55, forests: 70, water: 48, climate: "temperate" };
    state.heightMap = new Float32Array(128 * 128).fill(0.7);
    state.moistureMap = new Float32Array(128 * 128).fill(0.8);
    state.temperatureMap = new Float32Array(128 * 128).fill(0.55);
    state.weather = "clear";
    state.resources = { wood: 500, stone: 500, gold: 200, food: 300 };
    generateResourceGeography(seed);
}

function forestSite() {
    let best = null;
    for (let y = 6; y < state.worldH - 6; y++) {
        for (let x = 6; x < state.worldW - 6; x++) {
            let tiles = 0;
            let capacity = 0;
            for (let oy = -5; oy <= 5; oy++) {
                for (let ox = -5; ox <= 5; ox++) {
                    const node = getResourceNodeAt(x + ox, y + oy);
                    if (node?.forestCapacity > 0) {
                        tiles++;
                        capacity += node.forestCapacity;
                    }
                }
            }
            if (tiles >= 14 && (!best || capacity > best.capacity)) best = { x, y, tiles, capacity };
        }
    }
    if (!best) throw new Error("fixture needs a forest site with at least fourteen stands in range");
    return best;
}

function rangeTiles(site) {
    const tiles = [];
    for (let oy = -5; oy <= 5; oy++) {
        for (let ox = -5; ox <= 5; ox++) {
            const node = getResourceNodeAt(site.x + ox, site.y + oy);
            if (node?.forestCapacity > 0) {
                tiles.push({ x: node.x, y: node.y, capacity: node.forestCapacity });
            }
        }
    }
    return tiles;
}

function employ(forester, count, site) {
    for (let index = 0; index < count; index++) {
        const worker = spawnEntity(site.x + index - 1, site.y + 3, TYPE.VILLAGER);
        assert.ok(worker, "fixture worker should spawn");
        worker.workplace = forester;
        worker.anchor = { x: site.x, y: site.y };
        worker.jobRefreshTimer = 1_000_000;
    }
}

function advanceDay() {
    state.tick++;
    state.dayOfYear++;
    if (state.dayOfYear >= DAYS_PER_YEAR) {
        state.dayOfYear = 0;
        state.year++;
    }
    state.seasonIndex = Math.floor(state.dayOfYear / 100) % 4;
    updateFields();
    regrowForests(400, { slice: state.tick % 400, slices: 400 });
    if (state.tick % 6 === 0) updateBuildingIncome();
}

function snapshot(forester) {
    const range = foresterRangeSummary(forester);
    return {
        year: state.year,
        tick: state.tick,
        stock: range.stock,
        capacity: range.capacity,
        fill: range.fill,
        restorable: range.restorable,
        depleted: range.depleted,
        reason: forester.foresterReason,
        productionReason: forester.productionReason,
        planted: Number(forester.foresterPlanted) || 0,
        visualRevision: Number(state.forestVisualRevision) || 0,
    };
}

function runSeed(seed, seedIndex) {
    setup(seed);
    const site = forestSite();
    const forester = spawnEntity(site.x, site.y, TYPE.FORESTER);
    assert.ok(forester, `seed ${seed}: the Forester should spawn on the selected forest site`);
    forester.construction = null;
    employ(forester, 2, site);

    const tiles = rangeTiles(site);
    for (const tile of tiles) plantForestAt(tile.x, tile.y, tile.capacity);
    const initial = foresterRangeSummary(forester);
    assert.equal(initial.restorable, 0, `seed ${seed}: the fixture range must start fully grown`);
    assert.equal(initial.capacity, initial.stock);

    const byDistance = tiles
        .filter(tile => tile.x !== site.x || tile.y !== site.y)
        .sort((a, b) => Math.hypot(a.x - site.x, a.y - site.y) - Math.hypot(b.x - site.x, b.y - site.y));
    const thinningPool = byDistance.slice(0, 4);
    const clearPool = tiles
        .filter(tile => tile.x !== site.x || tile.y !== site.y)
        .slice()
        .sort((a, b) => a.capacity - b.capacity
            || Math.hypot(a.x - site.x, a.y - site.y) - Math.hypot(b.x - site.x, b.y - site.y))
        .slice(0, 3);
    assert.equal(thinningPool.length, 4, `seed ${seed}: the audit needs four thinning stands`);
    assert.equal(clearPool.length, 3, `seed ${seed}: the audit needs three clear-cut stands`);

    const rows = [];
    let harvested = 0;
    let plantedAtStart = Number(forester.foresterPlanted) || 0;
    let lastVisualRevision = Number(state.forestVisualRevision) || 0;

    for (let year = 1; year <= YEARS; year++) {
        const schedule = scheduleFor(seedIndex, year);
        const thinning = thinningPool.slice(0, schedule.thinningCount);
        const clearCut = clearPool.slice(0, schedule.clearCount);
        let plantingDays = 0;
        let grownDays = 0;
        let lowestFill = 1;
        let yearHarvest = 0;

        for (let day = 0; day < DAYS_PER_YEAR; day++) {
            advanceDay();

            // The thinning cadence stays constant; its pressure changes with
            // how many stands the year works. The last pass is early enough
            // for the Forester to close the final gaps before the measurement.
            if (day % 20 === 0 && day <= 360) {
                for (const tile of thinning) {
                    const taken = harvestForest(tile.x, tile.y, 2);
                    harvested += taken;
                    yearHarvest += taken;
                }
            }

            // The annual clear-cut changes both its size and its calendar day.
            if (day === schedule.clearDay) {
                for (const tile of clearCut) {
                    const taken = harvestForest(tile.x, tile.y, tile.capacity);
                    harvested += taken;
                    yearHarvest += taken;
                }
            }

            const sample = snapshot(forester);
            if (sample.reason === "Planting saplings") plantingDays++;
            if (sample.reason === "Forest is fully grown") grownDays++;
            assert.notEqual(sample.reason, "Waiting for planting space",
                `seed ${seed} year ${year} day ${day}: a restorable range must always accept saplings`);
            assert.ok(!sample.reason.includes("depleted"),
                `seed ${seed} year ${year} day ${day}: a planting Forester must never report depletion`);
            if (state.tick % 6 === 0) {
                assert.equal(sample.productionReason, sample.reason,
                    `seed ${seed} year ${year} day ${day}: the building catalogue must mirror the stewardship status`);
            }
            lowestFill = Math.min(lowestFill, sample.fill);
        }

        // The last thinning is on day 360 and the latest clear-cut on day 140,
        // so the normal 400-day year already ends with a completely refilled
        // range. No extra days are appended, keeping exactly ten calendar years.
        const end = snapshot(forester);
        const revision = end.visualRevision;
        assert.equal(end.restorable, 0, `seed ${seed} year ${year} must end with every stand restored`);
        assert.equal(end.reason, "Forest is fully grown", `seed ${seed} year ${year} must end fully grown`);
        assert.ok(!String(end.productionReason).includes("depleted"),
            `seed ${seed} year ${year} must not let the catalogue overwrite the stewardship status`);
        assert.ok(end.stock > 0 && end.stock === end.capacity,
            `seed ${seed} year ${year} ended at ${end.stock}/${end.capacity}`);
        assert.ok(yearHarvest > 0, `seed ${seed} year ${year} performed no harvest`);
        const planted = end.planted - plantedAtStart;
        assert.ok(planted > 50, `seed ${seed} year ${year} planted only ${planted} saplings`);
        assert.ok(plantingDays > 5,
            `seed ${seed} year ${year} reported planting on only ${plantingDays} days`);
        assert.ok(grownDays > 5,
            `seed ${seed} year ${year} reported a fully grown range on only ${grownDays} days`);

        rows.push({
            seed,
            year,
            thinningCount: thinning.length,
            clearCount: clearCut.length,
            clearDay: schedule.clearDay,
            stock: end.stock,
            capacity: end.capacity,
            fill: end.fill,
            restorable: end.restorable,
            reason: end.reason,
            harvested: yearHarvest,
            planted,
            plantingDays,
            grownDays,
            lowestFill,
            visualRevision: revision,
            visualDelta: revision - lastVisualRevision,
        });
        plantedAtStart = end.planted;
        lastVisualRevision = revision;
    }

    return {
        seed,
        site,
        range: initial,
        rows,
        harvested,
        planted: Number(forester.foresterPlanted) || 0,
        visualRevision: lastVisualRevision,
    };
}

test("a staffed forester sustains ten years of varying harvest across three seeds", () => {
    const results = SEEDS.map((seed, index) => runSeed(seed, index));
    assert.equal(results.length, SEEDS.length);

    for (const result of results) {
        const { seed, rows } = result;
        assert.equal(rows.length, YEARS);
        assert.deepEqual([...new Set(rows.map(row => row.seed))], [seed]);
        assert.ok(rows.every(row => row.restorable === 0 && row.fill === 1 && row.reason === "Forest is fully grown"),
            `seed ${seed}: every year must end fully grown`);
        assert.ok(rows.every(row => row.harvested > 0 && row.planted > 0),
            `seed ${seed}: every year must harvest and replant stock`);
        assert.ok(rows.every(row => row.visualDelta > 0),
            `seed ${seed}: every harvest year must invalidate the cached woodland`);
        assert.ok(rows.every(row => row.lowestFill > 0.6),
            `seed ${seed}: repeated harvest must not collapse the range below 60%`);
        assert.ok(result.harvested > 2500,
            `seed ${seed}: the ten-year audit harvested only ${result.harvested} stock`);
        assert.ok(result.planted > result.harvested * 0.35,
            `seed ${seed}: the Forester planted ${result.planted} saplings against ${result.harvested} harvested stock`);
        const harvests = rows.map(row => row.harvested);
        assert.ok(Math.max(...harvests) - Math.min(...harvests) > 100,
            `seed ${seed}: the annual harvest did not vary enough (${Math.min(...harvests)}..${Math.max(...harvests)})`);
        const scheduleKeys = new Set(rows.map(row => row.clearCount + ":" + row.thinningCount + ":" + row.clearDay));
        assert.ok(scheduleKeys.size >= 4,
            `seed ${seed}: the annual harvest schedule must actually rotate`);
    }

    const harvestTotals = results.map(result => Math.round(result.harvested / 100));
    assert.ok(new Set(harvestTotals).size >= 2,
        "the three seeds must not produce one identical harvest total");
});
