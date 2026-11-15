import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { performMountainWork, mountainWorkAvailability } from "../../js/systems/forest-gathering.js";
import { mountainProfileAt } from "../../js/world/mountain-ecology.js";
import {
    MOUNTAIN_WORKS, MOUNTAIN_WORK_IDS, applyMountainWork, createMountainWorksState,
    ensureMountainWorks, mountainWorkAt, mountainWorkReady, mountainWorkUseAt,
    mountainWorksStats, mountainWorksSummaryAt, normalizeMountainWorksState,
    restoreMountainWorks, serializeMountainWorks, validateMountainWorksSnapshot,
} from "../../js/world/mountain-works.js";

test("all nine mountain works cover 1.2.12.69–1.2.12.77", () => {
    assert.equal(MOUNTAIN_WORK_IDS.length, 9);
    assert.deepEqual(MOUNTAIN_WORK_IDS.map(id => MOUNTAIN_WORKS[id].requirement),
        Array.from({ length: 9 }, (_, index) => "1.2.12." + (index + 69)));
    for (const work of Object.values(MOUNTAIN_WORKS)) {
        assert.ok(work.label.length > 4);
        assert.ok(work.description.length > 20);
        assert.ok(Object.values(work.cost).every(value => Number.isFinite(value) && value >= 0));
    }
});

test("mountain works persist, expose use flags and are saved in a bounded snapshot", () => {
    state.mountainWorks = createMountainWorksState();
    state.dayOfYear = 80;
    assert.equal(applyMountainWork(10, 8, "terrace", { day: 80 }).terraced, true);
    assert.equal(applyMountainWork(10, 8, "mine", { day: 80 }).mine, true);
    assert.deepEqual(mountainWorkUseAt(10, 8), { terraced: true, mine: true });
    assert.match(mountainWorksSummaryAt(10, 8), /Terraced/);
    assert.match(mountainWorksSummaryAt(10, 8), /mine/);
    assert.equal(mountainWorkAt(10, 8).lastHarvest.mine, 80);
    assert.equal(mountainWorkReady(10, 8, "mine", 90).ok, false);
    assert.equal(mountainWorkReady(10, 8, "mine", 98).ok, true);
    assert.equal(mountainWorkReady(10, 8, "terrace", 98).ok, false);

    const snapshot = serializeMountainWorks();
    const restored = restoreMountainWorks(snapshot);
    assert.equal(restored, 1);
    assert.equal(mountainWorksStats().mine, 1);
    assert.equal(validateMountainWorksSnapshot(snapshot), true);
    assert.equal(serializeMountainWorks().tiles["10:8"].mine, true);
});

test("mountain work snapshots reject malformed data and normalize out-of-range days", () => {
    const normalized = normalizeMountainWorksState({
        version: 1,
        revision: 4,
        stats: { mine: 3 },
        tiles: {
            "2:3": { road: true, lastHarvest: { mine: -4, quarry: 12.8 }, lastDay: 12.8 },
            bad: { road: true },
            "4:5": { road: "yes" },
        },
    });
    assert.equal(Object.keys(normalized.tiles).length, 1);
    assert.equal(normalized.tiles["2:3"].lastHarvest.quarry, 12);
    assert.equal(normalized.tiles["2:3"].lastHarvest.mine, undefined);
    assert.equal(normalized.stats.road, 0);

    assert.throws(() => validateMountainWorksSnapshot(null), /object/);
    assert.throws(() => validateMountainWorksSnapshot({ version: 1, tiles: { bad: {} } }), /key/);
    assert.throws(() => validateMountainWorksSnapshot({ version: 1, tiles: { "1:1": { road: "yes" } } }), /flag/);
    assert.throws(() => validateMountainWorksSnapshot({ version: 1, tiles: {}, stats: [] }), /statistics/);
});

test("mountain work state stays bounded and the empty snapshot is stable", () => {
    state.mountainWorks = null;
    assert.equal(Object.keys(ensureMountainWorks().tiles).length, 0);
    for (let index = 0; index < 520; index++) {
        applyMountainWork(index, 0, "quarry", { day: index % 400 });
    }
    assert.ok(Object.keys(ensureMountainWorks().tiles).length <= 512);
    assert.ok(mountainWorksStats().quarry > 0);
    restoreMountainWorks(undefined);
    assert.equal(Object.keys(ensureMountainWorks().tiles).length, 0);
});

test("player mountain works spend real resources and deliver mountain goods", () => {
    resetState();
    state.worldSeed = 20261115;
    state.worldW = 32;
    state.worldH = 32;
    state.terrainResolution = 2;
    state.terrainPixW = 64;
    state.terrainPixH = 64;
    state.worldOptions = { landmass: 50, ruggedness: 70, forests: 55, water: 48, climate: "mountain" };
    state.seaLevel = 0.33;
    state.heightMap = new Float32Array(64 * 64).fill(0.72);
    state.moistureMap = new Float32Array(64 * 64).fill(0.58);
    state.temperatureMap = new Float32Array(64 * 64).fill(0.38);
    state.resources = { wood: 200, stone: 200, gold: 100, food: 100 };
    state.dayOfYear = 140;
    state.year = 2;

    let site = null;
    for (let y = 2; y < 30 && !site; y++) {
        for (let x = 2; x < 30; x++) {
            const availability = mountainWorkAvailability(x, y);
            if (availability.ok && availability.works.quarry?.ok) { site = { x, y, availability }; break; }
        }
    }
    assert.ok(site, "the deterministic survey needs at least one quarry site");
    assert.ok(site.availability.audit >= 20);
    assert.match(site.availability.title, /mountain|ridge|peak|massif|slope|summit|valley|plateau|gorge/i);
    const woodBefore = state.resources.wood;
    const stoneBefore = state.resources.stone;
    const quarry = performMountainWork(site.x, site.y, "quarry", { dayOfYear: 140 });
    assert.equal(quarry.ok, true, quarry.reason);
    assert.ok(state.resources.wood < woodBefore);
    assert.ok(state.resources.stone < stoneBefore);
    assert.equal(state.mountainWorks.tiles[site.x + ":" + site.y].quarry, true);
    assert.ok(quarry.goods.some(good => ["stone", "granite", "limestone", "slate", "marble"].includes(good.id)));
    assert.equal(mountainWorkReady(site.x, site.y, "quarry", 140).ok, false);
    assert.match(mountainWorksSummaryAt(site.x, site.y), /quarry/i);
    const repeated = performMountainWork(site.x, site.y, "quarry", { dayOfYear: 142 });
    assert.equal(repeated.ok, false);
    assert.match(repeated.reason, /recover/);
});

test("built works change the same mountain profile the renderer and survey read", () => {
    state.mountainWorks = null;
    applyMountainWork(6, 7, "terrace", { day: 10 });
    const context = {
        seed: 20261212, climate: "mountain", height: 0.66, moisture: 0.55,
        temperature: 0.4, seaLevel: 0.33, dayOfYear: 150, year: 3, use: mountainWorkUseAt(6, 7),
    };
    const worked = mountainProfileAt(6.5, 7.5, context);
    const wild = mountainProfileAt(6.5, 7.5, { ...context, use: {} });
    assert.equal(worked.use.terraced, true);
    assert.ok(worked.economy.terraced > wild.economy.terraced);
    assert.ok(worked.features.includes("1.2.12.69"));
});
