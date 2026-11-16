import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import {
    COAST_WORKS, COAST_WORK_IDS, applyCoastWork, coastWorkAt, coastWorkReady,
    coastWorkUseAt, coastWorksStats, coastWorksSummaryAt, createCoastWorksState,
    ensureCoastWorks, normalizeCoastWorksState, restoreCoastWorks,
    serializeCoastWorks, validateCoastWorksSnapshot,
} from "../../js/world/coast-works.js";
import { updateCoastHazards } from "../../js/world/coast-hazards.js";

test("all nine coastal works cover 1.2.14.54–1.2.14.62", () => {
    assert.equal(COAST_WORK_IDS.length, 9);
    assert.deepEqual(COAST_WORK_IDS.map(id => COAST_WORKS[id].requirement), [
        ...Array.from({ length: 9 }, (_, index) => "1.2.14." + (index + 54)),
    ]);
    for (const work of Object.values(COAST_WORKS)) {
        assert.ok(work.label.length > 4);
        assert.ok(work.description.length > 30);
        assert.ok(Object.values(work.cost).every(value => Number.isFinite(value) && value >= 0));
    }
});

test("coastal works persist, expose use flags and serialize in a bounded snapshot", () => {
    resetState();
    state.coastWorks = createCoastWorksState();
    state.dayOfYear = 80;
    assert.equal(applyCoastWork(10, 8, "harbour", { day: 80 }).harbour, true);
    assert.equal(applyCoastWork(10, 8, "lighthouse", { day: 80 }).lighthouse, true);
    assert.deepEqual(coastWorkUseAt(10, 8), { harbour: true, lighthouse: true });
    assert.match(coastWorksSummaryAt(10, 8), /Harbour/);
    assert.match(coastWorksSummaryAt(10, 8), /lighthouse/i);
    assert.equal(coastWorkAt(10, 8).lastHarvest.harbour, 80);
    assert.equal(coastWorkReady(10, 8, "harbour", 81).ok, false);
    assert.equal(coastWorkReady(10, 8, "harbour", 95).ok, false);
    assert.equal(coastWorkReady(10, 8, "saltworks", 95).ok, true);
    assert.equal(coastWorkReady(10, 8, "lighthouse", 95).ok, false);

    const snapshot = serializeCoastWorks();
    assert.equal(restoreCoastWorks(snapshot), 1);
    assert.equal(coastWorksStats().harbour, 1);
    assert.equal(validateCoastWorksSnapshot(snapshot), true);
    assert.equal(serializeCoastWorks().tiles["10:8"].lighthouse, true);
});

test("coastal work snapshots reject malformed data and stay bounded", () => {
    const normalized = normalizeCoastWorksState({
        version: 1, revision: 4, stats: { harbour: 3 },
        tiles: {
            "2:3": { harbour: true, lastHarvest: { saltworks: -4, fishingVillage: 12.8 }, lastDay: 12.8 },
            bad: { harbour: true },
            "4:5": { harbour: "yes" },
        },
    });
    assert.equal(Object.keys(normalized.tiles).length, 1);
    assert.equal(normalized.tiles["2:3"].lastHarvest.fishingVillage, 12);
    assert.equal(normalized.tiles["2:3"].lastHarvest.saltworks, undefined);
    assert.equal(normalized.stats.harbour, 3);
    assert.throws(() => validateCoastWorksSnapshot(null), /object/);
    assert.throws(() => validateCoastWorksSnapshot({ version: 1, tiles: { bad: {} } }), /key/);
    assert.throws(() => validateCoastWorksSnapshot({ version: 1, tiles: { "1:1": { harbour: "yes" } } }), /flag/);
    assert.throws(() => validateCoastWorksSnapshot({ version: 1, tiles: {}, stats: [] }), /statistic/i);

    state.coastWorks = null;
    assert.equal(Object.keys(ensureCoastWorks().tiles).length, 0);
    for (let index = 0; index < 520; index++) applyCoastWork(index, 0, "fishingVillage", { day: index % 400 });
    assert.ok(Object.keys(ensureCoastWorks().tiles).length <= 512);
    assert.ok(coastWorksStats().fishingVillage > 0);
});

test("coastal hazards destroy real buildings and leave keeps and wonders standing", () => {
    resetState();
    const width = 64, height = 64;
    state.worldSeed = 20261214;
    state.worldOptions = {
        size: "standard", shape: "coast", climate: "coastal", landmass: 50,
        ruggedness: 55, forests: 52, water: 48, fertility: 55, resources: 50, coastline: 65,
    };
    state.worldW = 32;
    state.worldH = 32;
    state.terrainResolution = 2;
    state.terrainPixW = width;
    state.terrainPixH = height;
    state.seaLevel = 0.3277;
    state.heightMap = new Float32Array(width * height).fill(0.335);
    state.moistureMap = new Float32Array(width * height).fill(0.62);
    state.temperatureMap = new Float32Array(width * height).fill(0.58);
    state.dayOfYear = 150;
    state.year = 3;
    state.weather = "storm";
    state.coastWorks = null;
    const house = { id: "house", type: TYPE.HOUSE, x: 12, y: 8, hp: 80, maxHp: 80, isBuilding() { return true; } };
    const keep = { id: "keep", type: TYPE.KEEP, x: 14, y: 8, hp: 400, maxHp: 400, isBuilding() { return true; } };
    state.entities = [house, keep];
    const result = updateCoastHazards({ force: true, focus: "surge" });
    assert.ok(result.events.length > 0);
    assert.equal(house.dead, true);
    assert.equal(result.destroyed.kind, "building");
    assert.equal(result.destroyed.label, "Timber Cottage");
    assert.notEqual(keep.dead, true);
    assert.ok(result.surge && result.surge.value > 0);
});
