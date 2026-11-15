import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import {
    SWAMP_WORK_IDS, applySwampWork, createSwampWorksState, normalizeSwampWorksState,
    restoreSwampWorks, serializeSwampWorks, swampWorkAt, swampWorkReady,
    swampWorkUseAt, swampWorksSummaryAt, swampWorksStats, validateSwampWorksSnapshot,
} from "../../js/world/swamp-works.js";
import { swampProfileAt, swampRequirementAudit } from "../../js/world/swamp-ecology.js";
import { performSwampWork, swampWorkAvailability } from "../../js/systems/forest-gathering.js";

const BASE = Object.freeze({
    seed: 20261115, seaLevel: 0.33, climate: "swamp", temperature: 0.5,
    year: 9, hour: 7, weather: "fog", wind: 1.2, dayOfYear: 60,
    height: 0.35, moisture: 0.8,
});

test("wetland works are bounded, persistent and visible to the ecology", () => {
    state.swampWorks = null;
    assert.deepEqual(swampWorkUseAt(4, 5), {});
    const record = applySwampWork(4, 5, "boardwalk", { day: 12 });
    assert.equal(record.boardwalk, true);
    assert.equal(swampWorkAt(4, 5).boardwalk, true);
    assert.deepEqual(swampWorkUseAt(4, 5), { boardwalk: true });
    assert.match(swampWorksSummaryAt(4, 5), /boardwalk/i);
    assert.equal(swampWorkReady(4, 5, "boardwalk", 12).ok, false);
    assert.equal(swampWorksStats().boardwalk, 1);

    applySwampWork(4, 5, "drainage", { day: 13 });
    applySwampWork(4, 5, "peat", { day: 14 });
    assert.equal(swampWorkAt(4, 5).drained, true);
    assert.equal(swampWorkAt(4, 5).peatCut, true);
    assert.equal(swampWorkReady(4, 5, "peat", 20).ok, false);
    assert.equal(swampWorkReady(4, 5, "peat", 34).ok, true);
    assert.match(swampWorksSummaryAt(4, 5), /boardwalk.*drainage.*peat/i);
});

test("wetland works serialize and restore without inventing tiles", () => {
    state.swampWorks = createSwampWorksState();
    applySwampWork(1, 2, "fishing", { day: 3 });
    applySwampWork(7, 8, "reeds", { day: 4 });
    const snapshot = serializeSwampWorks();
    assert.equal(validateSwampWorksSnapshot(snapshot), true);
    assert.equal(snapshot.tiles["1:2"].fished, true);
    state.swampWorks = null;
    assert.equal(restoreSwampWorks(snapshot), 2);
    assert.deepEqual(serializeSwampWorks(), snapshot);
    assert.throws(() => validateSwampWorksSnapshot({ version: 1, tiles: { bad: {} } }));
    assert.equal(normalizeSwampWorksState(null).tiles && Object.keys(normalizeSwampWorksState(null).tiles).length, 0);
    assert.deepEqual(Object.keys(normalizeSwampWorksState({ version: 1, tiles: {}, stats: {} }).stats).sort(), [...SWAMP_WORK_IDS].sort());
});

test("drained and boardwalk profiles change water, bearing and movement", () => {
    const wild = swampProfileAt(12.5, 9.5, { ...BASE, use: { state: "wild" } });
    const worked = swampProfileAt(12.5, 9.5, {
        ...BASE,
        use: { state: "drained", drained: true, boardwalk: true, settled: true },
    });
    assert.equal(worked.use.drained, true);
    assert.equal(worked.use.boardwalk, true);
    assert.ok(worked.water.waterLevel < wild.water.waterLevel);
    assert.ok(worked.water.depth < wild.water.depth);
    assert.ok(worked.soil.bearing > wild.soil.bearing);
    assert.ok(worked.hazards.movement > wild.hazards.movement);
    assert.ok(worked.features.includes("1.2.11.67"));
    assert.ok(worked.features.includes("1.2.11.65"));
    const secured = swampProfileAt(12.5, 9.5, {
        ...BASE,
        use: { state: "wild", defended: true, surveyed: true },
    });
    assert.ok(secured.economy.defence > wild.economy.defence);
    assert.ok(secured.economy.development < wild.economy.development);
    assert.ok(secured.features.includes("1.2.11.71"));
    assert.ok(secured.features.includes("1.2.11.72"));
    assert.equal(SWAMP_WORK_IDS.length, 9);
    assert.equal(swampRequirementAudit(worked).length, 81);
    assert.ok(swampRequirementAudit(worked).some(entry => entry.id === "1.2.11.67" && entry.present));
});

test("player wetland works spend real resources and deliver goods", () => {
    resetState();
    state.worldSeed = 20261115;
    state.worldW = 32;
    state.worldH = 32;
    state.terrainResolution = 2;
    state.terrainPixW = 64;
    state.terrainPixH = 64;
    state.worldOptions = { landmass: 50, ruggedness: 55, forests: 52, water: 48, climate: "swamp" };
    state.seaLevel = 0.33;
    state.heightMap = new Float32Array(64 * 64).fill(0.4);
    state.moistureMap = new Float32Array(64 * 64).fill(0.85);
    state.temperatureMap = new Float32Array(64 * 64).fill(0.55);
    state.resources = { wood: 100, stone: 100, gold: 100, food: 100 };
    state.dayOfYear = 60;
    state.year = 1;

    let site = null;
    for (let y = 2; y < 30 && !site; y++) {
        for (let x = 2; x < 30; x++) {
            const availability = swampWorkAvailability(x, y);
            if (availability.ok) { site = { x, y, availability }; break; }
        }
    }
    assert.ok(site, "the deterministic survey needs at least one wetland site");
    assert.ok(site.availability.audit >= 20);
    const woodBefore = state.resources.wood;
    const boardwalk = performSwampWork(site.x, site.y, "boardwalk", { dayOfYear: 60 });
    assert.equal(boardwalk.ok, true, boardwalk.reason);
    assert.ok(state.resources.wood < woodBefore);
    assert.equal(state.swampWorks.tiles[site.x + ":" + site.y].boardwalk, true);
    assert.equal(swampWorkReady(site.x, site.y, "boardwalk", 60).ok, false);
    const fished = performSwampWork(site.x, site.y, "fishing", { dayOfYear: 61 });
    assert.equal(fished.ok, true, fished.reason);
    assert.ok(fished.goods.some(good => good.id === "marsh-fish" || good.id === "waterfowl"));
    assert.ok(Object.keys(state.forestGathering.stock).length > 0);
    const repeated = performSwampWork(site.x, site.y, "fishing", { dayOfYear: 62 });
    assert.equal(repeated.ok, false);
    assert.match(repeated.reason, /recover/);
});
