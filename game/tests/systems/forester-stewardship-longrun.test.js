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
// audit keeps working the same range for five game years: selective thinning
// every twenty days plus one clear-cut per year. It exists because a Forester
// that looks correct for 200 ticks can still lose a multi-year race against
// repeated harvest, and because the terrain cache only invalidates on visible
// stocking stages rather than on every sapling.
const YEARS = 5;
const DAYS_PER_YEAR = 400;

function setup(seed = 20261108) {
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
            if (tiles >= 16 && (!best || capacity > best.capacity)) best = { x, y, tiles, capacity };
        }
    }
    if (!best) throw new Error("fixture needs a forest site with at least sixteen stands in range");
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

test("a staffed forester sustains its range through five years of repeated harvest", () => {
    setup();
    const site = forestSite();
    const forester = spawnEntity(site.x, site.y, TYPE.FORESTER);
    assert.ok(forester, "the Forester should spawn on the selected forest site");
    forester.construction = null;
    employ(forester, 2, site);

    const tiles = rangeTiles(site);
    // Start from a completed woodland so every later gap is harvest damage.
    for (const tile of tiles) plantForestAt(tile.x, tile.y, tile.capacity);
    const initial = foresterRangeSummary(forester);
    assert.equal(initial.restorable, 0, "the fixture range must start fully grown");
    assert.equal(initial.capacity, initial.stock);

    const byDistance = tiles
        .filter(tile => tile.x !== site.x || tile.y !== site.y)
        .sort((a, b) => Math.hypot(a.x - site.x, a.y - site.y) - Math.hypot(b.x - site.x, b.y - site.y));
    const thinning = byDistance.slice(0, 4);
    const clearCut = byDistance.slice(4, 6);
    assert.equal(thinning.length, 4, "the audit needs four thinning stands");
    assert.equal(clearCut.length, 2, "the audit needs two clear-cut stands");

    const rows = [];
    let harvested = 0;
    let plantedAtStart = Number(forester.foresterPlanted) || 0;
    let lastVisualRevision = Number(state.forestVisualRevision) || 0;
    const visualByYear = [];

    for (let year = 1; year <= YEARS; year++) {
        let plantingDays = 0;
        let grownDays = 0;
        let lowestFill = 1;
        let yearHarvest = 0;

        for (let day = 0; day < DAYS_PER_YEAR; day++) {
            advanceDay();

            // Selective thinning: four stands lose two stock every twenty days.
            if (day % 20 === 0) {
                for (const tile of thinning) {
                    const taken = harvestForest(tile.x, tile.y, 2);
                    harvested += taken;
                    yearHarvest += taken;
                }
            }

            // One clear-cut per year removes both selected stands completely.
            if (day === 180) {
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
                `year ${year} day ${day}: a restorable range must always accept saplings`);
            assert.ok(!sample.reason.includes("depleted"),
                `year ${year} day ${day}: a planting Forester must never report depletion`);
            if (state.tick % 6 === 0) {
                assert.equal(sample.productionReason, sample.reason,
                    `year ${year} day ${day}: the building catalogue must mirror the live stewardship status`);
            }
            lowestFill = Math.min(lowestFill, sample.fill);
        }

        // Let the last thinning and the clear-cut finish before measuring the
        // year-end state. The extra days use the same daily loop.
        for (let day = 0; day < 8; day++) advanceDay();
        const end = snapshot(forester);
        const revision = end.visualRevision;
        visualByYear.push({ year, revision, delta: revision - lastVisualRevision });
        lastVisualRevision = revision;

        assert.equal(end.restorable, 0, `year ${year} must end with every stand restored`);
        assert.equal(end.reason, "Forest is fully grown", `year ${year} must end fully grown`);
        assert.ok(!String(end.productionReason).includes("depleted"),
            `year ${year} must not let the catalogue overwrite the stewardship status`);
        assert.ok(end.stock > 0 && end.stock === end.capacity,
            `year ${year} ended at ${end.stock}/${end.capacity}`);
        assert.ok(yearHarvest > 0, `year ${year} performed no harvest`);
        assert.ok(end.planted - plantedAtStart > 100,
            `year ${year} planted only ${end.planted - plantedAtStart} saplings`);
        assert.ok(plantingDays > 10,
            `year ${year} reported planting on only ${plantingDays} days`);
        // A full clear-cut of two stands can consume most of a year at the
        // Forester's deliberate two-sapling daily pace, so the audit only
        // requires a substantial fully-grown window before the next harvest.
        assert.ok(grownDays > 100,
            `year ${year} reported a fully grown range on only ${grownDays} days`);

        rows.push({
            year,
            stock: end.stock,
            capacity: end.capacity,
            fill: end.fill,
            restorable: end.restorable,
            reason: end.reason,
            harvested: yearHarvest,
            planted: end.planted - plantedAtStart,
            plantingDays,
            grownDays,
            lowestFill,
            visualRevision: revision,
        });
        plantedAtStart = end.planted;
    }

    assert.ok(harvested > 2000, `the five-year audit harvested only ${harvested} stock`);
    assert.ok(rows.every(row => row.lowestFill > 0.7),
        "repeated harvest must not collapse the standing stock below 70%");
    assert.ok(rows.every(row => row.visualRevision > 0 && row.planted > 0));
    assert.ok(visualByYear.every(row => row.delta > 0),
        "every harvest year must invalidate the cached woodland at least once");
    assert.ok(forester.foresterPlanted > harvested * 0.5,
        `the Forester planted ${forester.foresterPlanted} saplings against ${harvested} harvested stock`);
});
