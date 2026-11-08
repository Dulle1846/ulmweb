import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { generateResourceGeography } from "../../js/systems/resource-geography.js";
import {
    ensureForestFauna, resetForestFauna, updateForestFauna, FOREST_FAUNA_LIMITS,
} from "../../js/systems/forest-fauna.js";

const DAYS_PER_YEAR = 400;
const YEARS = 4;
const SEEDS = [20261108, 7, 99];

function setup(seed = 20261108, stockRatio = 1) {
    resetState();
    resetForestFauna();
    state.worldSeed = seed;
    state.worldW = 48;
    state.worldH = 48;
    state.terrainResolution = 2;
    state.terrainPixW = 96;
    state.terrainPixH = 96;
    state.worldOptions = { landmass: 50, ruggedness: 55, forests: 70, water: 48, climate: "temperate" };
    state.heightMap = new Float32Array(96 * 96).fill(0.7);
    state.moistureMap = new Float32Array(96 * 96).fill(0.8);
    state.temperatureMap = new Float32Array(96 * 96).fill(0.55);
    generateResourceGeography(seed);
    if (stockRatio !== 1) {
        const geo = state.resourceGeography;
        for (let i = 0; i < geo.forestStock.length; i++) {
            if (geo.forestCapacity[i] > 0) {
                geo.forestStock[i] = Math.max(1, Math.round(geo.forestCapacity[i] * stockRatio));
            }
        }
    }
    return ensureForestFauna();
}

function summary(model) {
    const tiles = new Set();
    const ids = new Set();
    let total = 0;
    let capacity = 0;
    let stackedTiles = 0;
    for (const herd of model.herds) {
        const key = herd.x + ":" + herd.y;
        if (tiles.has(key)) stackedTiles++;
        tiles.add(key);
        ids.add(herd.id);
        total += herd.population;
        capacity += herd.capacity;
    }
    return {
        herds: model.herds.length,
        total,
        capacity,
        fill: capacity > 0 ? total / capacity : 0,
        species: new Set(model.herds.map(herd => herd.species)),
        stackedTiles,
        duplicateIds: model.herds.length - ids.size,
        stats: { ...model.stats },
    };
}

function assertUnstacked(model, label) {
    const seen = new Set();
    for (const herd of model.herds) {
        const key = herd.x + ":" + herd.y;
        assert.equal(seen.has(key), false, `${label}: two herds occupy tile ${key}`);
        seen.add(key);
    }
}

function assertBounded(model, label) {
    for (const herd of model.herds) {
        assert.ok(Number.isFinite(herd.population) && herd.population >= 0.4, `${label}: ${herd.id} has no population`);
        assert.ok(Number.isFinite(herd.capacity) && herd.capacity >= 1, `${label}: ${herd.id} has no capacity`);
        assert.ok(herd.population <= herd.capacity * 1.35 + 0.11, `${label}: ${herd.id} exceeds its population bound`);
    }
}

function advance(model, days, label) {
    for (let day = 0; day < days; day++) {
        updateForestFauna(1);
        assertUnstacked(model, `${label}, day ${model.day}`);
        if (day % 10 === 0) assertBounded(model, `${label}, day ${model.day}`);
    }
}

test("four simulated years keep herds, migration and dispersal bounded", () => {
    for (const seed of SEEDS) {
        const model = setup(seed);
        const initialSpecies = [...new Set(model.herds.map(herd => herd.species))].sort();
        const years = [];

        for (let year = 1; year <= YEARS; year++) {
            const before = { ...model.stats };
            advance(model, DAYS_PER_YEAR, `seed ${seed}, year ${year}`);
            const end = summary(model);
            const delta = {
                births: end.stats.births - before.births,
                deaths: end.stats.deaths - before.deaths,
                migrations: end.stats.migrations - before.migrations,
                splits: end.stats.splits - before.splits,
            };

            assert.equal(model.day, 0, `seed ${seed} did not finish year ${year}`);
            assert.equal(end.stackedTiles, 0, `seed ${seed} stacked herds in year ${year}`);
            assert.equal(end.duplicateIds, 0, `seed ${seed} duplicated herd ids in year ${year}`);
            assert.ok(end.herds >= 40 && end.herds <= FOREST_FAUNA_LIMITS.maxHerds, `seed ${seed} herd count out of bounds`);
            assert.ok(end.fill >= 0.3 && end.fill <= 0.5, `seed ${seed} year-end fill ${end.fill.toFixed(3)} is implausible`);
            assert.ok(delta.births > 0 && delta.deaths > 0, `seed ${seed} stopped reproducing or dying`);
            assert.ok(delta.migrations > 0, `seed ${seed} migration stopped across the year boundary`);
            assert.ok(delta.migrations <= end.herds * 3, `seed ${seed} migration is not bounded`);
            if (year === 1) {
                assert.ok(delta.splits >= 1, `seed ${seed} never dispersed`);
                assert.ok(delta.splits <= 20, `seed ${seed} dispersed without bound`);
            } else {
                assert.ok(delta.splits <= 2, `seed ${seed} split too often after settling`);
            }
            years.push(end);
        }

        assert.deepEqual([...years.at(-1).species].sort(), initialSpecies, `seed ${seed} lost a species`);
        assert.ok(model.history.length <= 32, `seed ${seed} history is unbounded`);
        assert.ok(Math.abs(years[3].total - years[1].total) / years[1].total < 0.1,
            `seed ${seed} did not settle into a stable population`);
    }
});

test("hunting pressure lowers stable populations without collapsing them", () => {
    const baseline = (() => {
        const model = setup(20261108);
        advance(model, DAYS_PER_YEAR * 2, "full stock");
        return summary(model);
    })();
    const mid = (() => {
        const model = setup(20261108, 0.6);
        advance(model, DAYS_PER_YEAR * 2, "60% stock");
        return summary(model);
    })();
    const low = (() => {
        const model = setup(20261108, 0.3);
        advance(model, DAYS_PER_YEAR * 2, "30% stock");
        return summary(model);
    })();

    for (const [label, result] of [["full", baseline], ["60%", mid], ["30%", low]]) {
        assert.equal(result.stackedTiles, 0, `${label} stock stacked herds`);
        assert.equal(result.duplicateIds, 0, `${label} stock duplicated herd ids`);
        assert.ok(result.herds >= 40, `${label} stock lost the metapopulation`);
        assert.ok(result.fill >= 0.3 && result.fill <= 0.5, `${label} stock fill ${result.fill.toFixed(3)} is implausible`);
    }

    assert.ok(mid.total < baseline.total * 0.9, "moderate hunting pressure must lower the population");
    assert.ok(low.total < mid.total * 0.95, "heavy hunting pressure must lower the population further");
    assert.ok(low.total > baseline.total * 0.5, "heavy hunting pressure must not collapse the population");
    assert.ok(low.stats.migrations > 0, "hunting pressure must not freeze migration");
    assert.deepEqual([...low.species].sort(), [...baseline.species].sort(), "hunting pressure removed a species");
});
