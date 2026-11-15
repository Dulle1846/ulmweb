import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { performVolcanoWork, volcanoWorkAvailability } from "../../js/systems/forest-gathering.js";
import { volcanoProfileAt, volcanoRequirementAudit } from "../../js/world/volcano-ecology.js";
import {
    VOLCANO_WORKS, VOLCANO_WORK_IDS, applyVolcanoWork, createVolcanoWorksState,
    ensureVolcanoWorks, volcanoWorkAt, volcanoWorkReady, volcanoWorkUseAt,
    volcanoWorksStats, volcanoWorksSummaryAt, normalizeVolcanoWorksState,
    restoreVolcanoWorks, serializeVolcanoWorks, validateVolcanoWorksSnapshot,
} from "../../js/world/volcano-works.js";

test("all ten volcanic works cover 1.2.13.49–1.2.13.57 and 1.2.13.73", () => {
    assert.equal(VOLCANO_WORK_IDS.length, 10);
    assert.deepEqual(VOLCANO_WORK_IDS.map(id => VOLCANO_WORKS[id].requirement), [
        ...Array.from({ length: 9 }, (_, index) => "1.2.13." + (index + 49)),
        "1.2.13.73",
    ]);
    for (const work of Object.values(VOLCANO_WORKS)) {
        assert.ok(work.label.length > 4);
        assert.ok(work.description.length > 20);
        assert.ok(Object.values(work.cost).every(value => Number.isFinite(value) && value >= 0));
    }
});

test("volcanic works persist, expose use flags and are saved in a bounded snapshot", () => {
    state.volcanoWorks = createVolcanoWorksState();
    state.dayOfYear = 80;
    assert.equal(applyVolcanoWork(10, 8, "lavaQuarry", { day: 80 }).lavaQuarry, true);
    assert.equal(applyVolcanoWork(10, 8, "geothermalPlant", { day: 80 }).geothermalPlant, true);
    assert.deepEqual(volcanoWorkUseAt(10, 8), { lavaQuarry: true, geothermalPlant: true });
    assert.match(volcanoWorksSummaryAt(10, 8), /Basalt/);
    assert.match(volcanoWorksSummaryAt(10, 8), /Geothermal/);
    assert.equal(volcanoWorkAt(10, 8).lastHarvest.lavaQuarry, 80);
    assert.equal(volcanoWorkReady(10, 8, "lavaQuarry", 90).ok, false);
    assert.equal(volcanoWorkReady(10, 8, "lavaQuarry", 98).ok, true);
    assert.equal(volcanoWorkReady(10, 8, "geothermalPlant", 98).ok, false);

    const snapshot = serializeVolcanoWorks();
    const restored = restoreVolcanoWorks(snapshot);
    assert.equal(restored, 1);
    assert.equal(volcanoWorksStats().lavaQuarry, 1);
    assert.equal(validateVolcanoWorksSnapshot(snapshot), true);
    assert.equal(serializeVolcanoWorks().tiles["10:8"].lavaQuarry, true);
});

test("volcanic work snapshots reject malformed data and normalize out-of-range days", () => {
    const normalized = normalizeVolcanoWorksState({
        version: 1,
        revision: 4,
        stats: { lavaQuarry: 3 },
        tiles: {
            "2:3": { lavaQuarry: true, lastHarvest: { obsidianQuarry: -4, pumiceQuarry: 12.8 }, lastDay: 12.8 },
            bad: { lavaQuarry: true },
            "4:5": { lavaQuarry: "yes" },
        },
    });
    assert.equal(Object.keys(normalized.tiles).length, 1);
    assert.equal(normalized.tiles["2:3"].lastHarvest.pumiceQuarry, 12);
    assert.equal(normalized.tiles["2:3"].lastHarvest.obsidianQuarry, undefined);
    assert.equal(normalized.stats.lavaQuarry, 3);

    assert.throws(() => validateVolcanoWorksSnapshot(null), /object/);
    assert.throws(() => validateVolcanoWorksSnapshot({ version: 1, tiles: { bad: {} } }), /key/);
    assert.throws(() => validateVolcanoWorksSnapshot({ version: 1, tiles: { "1:1": { lavaQuarry: "yes" } } }), /flag/);
    assert.throws(() => validateVolcanoWorksSnapshot({ version: 1, tiles: {}, stats: [] }), /statistics/);
});

test("volcanic work state stays bounded and the empty snapshot is stable", () => {
    state.volcanoWorks = null;
    assert.equal(Object.keys(ensureVolcanoWorks().tiles).length, 0);
    for (let index = 0; index < 520; index++) {
        applyVolcanoWork(index, 0, "pumiceQuarry", { day: index % 400 });
    }
    assert.ok(Object.keys(ensureVolcanoWorks().tiles).length <= 512);
    assert.ok(volcanoWorksStats().pumiceQuarry > 0);
    restoreVolcanoWorks(undefined);
    assert.equal(Object.keys(ensureVolcanoWorks().tiles).length, 0);
});

test("player volcanic works spend real resources and deliver volcanic goods", () => {
    resetState();
    state.worldSeed = 20261313;
    state.worldW = 32;
    state.worldH = 32;
    state.terrainResolution = 2;
    state.terrainPixW = 64;
    state.terrainPixH = 64;
    state.worldOptions = { landmass: 50, ruggedness: 70, forests: 40, water: 48, climate: "volcanic" };
    state.seaLevel = 0.33;
    state.heightMap = new Float32Array(64 * 64).fill(0.72);
    state.moistureMap = new Float32Array(64 * 64).fill(0.4);
    state.temperatureMap = new Float32Array(64 * 64).fill(0.7);
    state.resources = { wood: 200, stone: 200, gold: 100, food: 100 };
    state.dayOfYear = 140;
    state.year = 2;

    let site = null;
    for (let y = 2; y < 30 && !site; y++) {
        for (let x = 2; x < 30; x++) {
            const availability = volcanoWorkAvailability(x, y);
            if (availability.ok && availability.works.lavaQuarry?.ok) { site = { x, y, availability }; break; }
        }
    }
    assert.ok(site, "the deterministic survey needs at least one basalt quarry site");
    assert.ok(site.availability.audit >= 20);
    assert.match(site.availability.title, /volcan|cone|crater|lava|caldera|shield|fissure/i);
    const woodBefore = state.resources.wood;
    const stoneBefore = state.resources.stone;
    const quarry = performVolcanoWork(site.x, site.y, "lavaQuarry", { dayOfYear: 140 });
    assert.equal(quarry.ok, true, quarry.reason);
    assert.ok(state.resources.wood < woodBefore);
    assert.ok(state.resources.stone < stoneBefore);
    assert.equal(state.volcanoWorks.tiles[site.x + ":" + site.y].lavaQuarry, true);
    assert.ok(quarry.goods.some(good => ["stone", "basalt"].includes(good.id)));
    assert.equal(volcanoWorkReady(site.x, site.y, "lavaQuarry", 140).ok, false);
    assert.match(volcanoWorksSummaryAt(site.x, site.y), /quarry/i);
    const repeated = performVolcanoWork(site.x, site.y, "lavaQuarry", { dayOfYear: 142 });
    assert.equal(repeated.ok, false);
    assert.match(repeated.reason, /recover/);
});

test("sulfur works require a real deposit and deliver sulfur, not a phantom success", () => {
    resetState();
    state.worldSeed = 20261313;
    state.worldW = 32;
    state.worldH = 32;
    state.terrainResolution = 2;
    state.terrainPixW = 64;
    state.terrainPixH = 64;
    state.worldOptions = { landmass: 50, ruggedness: 70, forests: 40, water: 48, climate: "volcanic" };
    state.seaLevel = 0.33;
    state.heightMap = new Float32Array(64 * 64).fill(0.72);
    state.moistureMap = new Float32Array(64 * 64).fill(0.4);
    state.temperatureMap = new Float32Array(64 * 64).fill(0.7);
    state.resources = { wood: 200, stone: 200, gold: 100, food: 100 };
    state.dayOfYear = 140;
    state.year = 2;
    state.volcanoWorks = null;

    let rich = null, poor = null;
    for (let y = 2; y < 30 && (!rich || !poor); y++) {
        for (let x = 2; x < 30; x++) {
            const availability = volcanoWorkAvailability(x, y);
            if (!availability.ok) continue;
            if (!rich && availability.works.sulfurMine?.ok && availability.profile.economy.sulfur > 0.3) {
                rich = { x, y, availability };
            }
            if (!poor && availability.profile.economy.sulfur < 0.2) {
                poor = { x, y, availability };
            }
        }
    }
    assert.ok(rich, "a sulfur-bearing tile must exist");
    assert.ok(poor, "a sulfur-poor volcanic tile must exist");
    assert.equal(poor.availability.works.sulfurMine.ok, false);
    assert.match(poor.availability.works.sulfurMine.reason, /sulfur/i);
    const result = performVolcanoWork(rich.x, rich.y, "sulfurMine", { dayOfYear: 140 });
    assert.equal(result.ok, true, result.reason);
    assert.ok(result.goods.some(good => good.id === "sulfur" && good.amount > 0),
        "the sulfur mine must put real sulfur in the ledger");
});

test("built works change the same volcanic profile the renderer and survey read", () => {
    state.volcanoWorks = null;
    applyVolcanoWork(6, 7, "fertileTerrace", { day: 10 });
    const context = {
        seed: 20261313, climate: "volcanic", height: 0.66, moisture: 0.55,
        temperature: 0.7, seaLevel: 0.33, dayOfYear: 150, year: 3,
        use: volcanoWorkUseAt(6, 7),
    };
    const worked = volcanoProfileAt(6.5, 7.5, context);
    const wild = volcanoProfileAt(6.5, 7.5, { ...context, use: {} });
    assert.equal(worked.use.fertileTerrace, true);
    assert.ok(worked.economy.fertileSoil > wild.economy.fertileSoil);
    assert.ok(worked.features.includes("1.2.13.56"));
    assert.ok(worked.features.includes("1.2.13.73"));
    assert.equal(volcanoRequirementAudit(worked).length, 73);
});
