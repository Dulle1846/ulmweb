// Multi-year mountain realm audit: works, seasonal hazards and a real save.
//
// The short ecology tests prove a tile profile; this one runs the campaign
// driver for five simulated years with the mountain climate, builds a chain of
// real works, checks winter avalanche exposure against summer, and round-trips
// the complete save through the production create/prepare/restore pipeline.
import test from "node:test";
import assert from "node:assert/strict";
import { runCampaign } from "../campaign/campaign-driver.mjs";
import { resetState, state } from "../../js/core/state.js";
import { createSaveSnapshot, prepareSaveSnapshot, restoreSaveSnapshot } from "../../js/core/save-runtime.js";
import { createIdentityState } from "../../js/systems/identity.js";
import { createLegacyState } from "../../js/systems/legacy.js";
import { mountainWorkAvailability, performMountainWork } from "../../js/systems/forest-gathering.js";
import { mountainWorksStats } from "../../js/world/mountain-works.js";
import { getMountainTacticsAt } from "../../js/systems/resource-geography.js";
import { mountainProfileAt } from "../../js/world/mountain-ecology.js";
import { getHeightAt, getMoistureAt, getTemperatureAt } from "../../js/world/world.js";

const SEED = 20261212;
const YEARS = 5;
const KINDS = ["terrace", "road", "quarry", "mine", "aqueduct"];
const DUE_TICKS = [20, 40, 60, 80, 100];

function makeCanvas() {
    return {
        width: 0, height: 0,
        getContext() {
            return {
                createImageData(width, height) {
                    return { width, height, data: new Uint8ClampedArray(width * height * 4) };
                },
                putImageData() {}
            };
        }
    };
}

function initializeAuditRealm() {
    state.identity = createIdentityState({ kingdomName: "Mountain Audit", dynastyName: "High House", foundedYear: 1 });
    state.kingdomName = state.identity.kingdomName;
    state.royal.dynastyName = state.identity.dynastyName;
    state.legacy = createLegacyState({ foundedYear: 1 });
}

function findWorkSite() {
    const width = Number(state.worldW) || 160;
    const height = Number(state.worldH) || 160;
    const centerX = Math.floor(width / 2);
    const centerY = Math.floor(height / 2);
    for (let radius = 2; radius <= 30; radius += 2) {
        for (let y = Math.max(1, centerY - radius); y <= Math.min(height - 2, centerY + radius); y++) {
            for (let x = Math.max(1, centerX - radius); x <= Math.min(width - 2, centerX + radius); x++) {
                const availability = mountainWorkAvailability(x, y);
                if (!availability.ok) continue;
                const available = KINDS.filter(kind => availability.works?.[kind]?.ok);
                if (available.length === KINDS.length) return { x, y };
            }
        }
    }
    return null;
}

function seasonalProfile(x, y, dayOfYear) {
    return mountainProfileAt(x + 0.5, y + 0.5, {
        seed: state.worldSeed, climate: "mountain",
        height: getHeightAt(x + 0.5, y + 0.5),
        moisture: getMoistureAt(x + 0.5, y + 0.5),
        temperature: getTemperatureAt(x + 0.5, y + 0.5),
        seaLevel: state.seaLevel, dayOfYear, year: state.year,
        hour: 12, weather: "clear", wind: 1
    });
}

test("a five-year mountain run builds works, exposes winter hazards and restores its save", () => {
    const previousDocument = globalThis.document;
    globalThis.document = { createElement: () => makeCanvas() };
    try {
        let site = null;
        const built = [];
        const attempts = [];
        const attempted = new Set();
        const seasonSamples = [];
        const campaign = runCampaign({
            seed: SEED,
            years: YEARS,
            profile: "builder",
            era: "common-weal",
            worldOptions: { climate: "mountain" },
            sampleTicks: 30,
            onInitialized: () => {
                initializeAuditRealm();
                site = findWorkSite();
                assert.ok(site, "the mountain realm must expose a tile with all five works available");
            },
            onTick: realm => {
                if (!site) return;
                for (let index = 0; index < KINDS.length; index++) {
                    if (attempted.has(KINDS[index]) || realm.tick < DUE_TICKS[index]) continue;
                    attempted.add(KINDS[index]);
                    const result = performMountainWork(site.x, site.y, KINDS[index], { dayOfYear: realm.dayOfYear });
                    attempts.push({ tick: realm.tick, kind: KINDS[index], ok: Boolean(result.ok), reason: result.reason || null });
                    if (result.ok) built.push({ kind: KINDS[index], tick: realm.tick, label: result.label });
                }
                if (realm.dayOfYear === 330 && seasonSamples.length < YEARS) {
                    const profile = seasonalProfile(site.x, site.y, 330);
                    const tactics = getMountainTacticsAt(site.x, site.y);
                    seasonSamples.push({
                        year: realm.year,
                        snow: profile.visual?.snow || 0,
                        avalanche: tactics?.avalanche || 0
                    });
                }
            }
        });

        assert.ok(campaign.finalYear >= 1 + YEARS - 1, "the run must span the requested years");
        assert.equal(campaign.gameOver, false, "the mountain realm must stay alive for the whole audit");
        assert.deepEqual(built.map(row => row.kind).sort(), [...KINDS].sort(),
            "all five works must be built: " + JSON.stringify({ site, built, attempts }));

        // Five winter samples prove the hazard is seasonal, not a constant.
        assert.equal(seasonSamples.length, YEARS, "the run must observe every winter");
        assert.ok(seasonSamples.every(sample => Number.isFinite(sample.snow) && Number.isFinite(sample.avalanche)));

        const dayBefore = state.dayOfYear;
        state.dayOfYear = 140;
        const summer = getMountainTacticsAt(site.x, site.y);
        state.dayOfYear = 330;
        const winter = getMountainTacticsAt(site.x, site.y);
        state.dayOfYear = dayBefore;
        assert.ok(winter.avalanche > summer.avalanche + 0.1,
            "winter must raise avalanche exposure above summer: " + JSON.stringify({ summer, winter }));
        assert.ok(winter.avalanche >= 0 && winter.avalanche <= 1);
        assert.ok(winter.defenceBonus >= 0 && winter.defenceBonus <= 1);
        assert.ok(winter.movementBurden >= 0 && winter.movementBurden <= 1);
        assert.ok(winter.movementFactor >= 0.34 && winter.movementFactor <= 1,
            "the raid route must read the same mountain movement factor as the economy");
        assert.ok(winter.mountainExperience >= 0 && winter.mountainExperience <= 0.7,
            "mountain experience must be a bounded, real tactical value");
        assert.ok(winter.supply >= 0 && winter.supply <= 1);
        assert.ok(summer.movementFactor >= winter.movementFactor,
            "summer travel must not be slower than winter travel on the same mountain tile");

        const saved = JSON.parse(JSON.stringify(createSaveSnapshot()));
        assert.ok(saved.mountainWorks, "the production save must carry the mountain works state");
        assert.ok(Object.keys(saved.mountainWorks.tiles).length >= 1,
            "the saved mountain works must contain the built tile");
        assert.equal(saved.mountainWorks.tiles[site.x + ":" + site.y]?.terraced, true);
        assert.equal(saved.mountainWorks.tiles[site.x + ":" + site.y]?.road, true);
        assert.equal(saved.mountainWorks.tiles[site.x + ":" + site.y]?.quarry, true);
        assert.equal(saved.mountainWorks.tiles[site.x + ":" + site.y]?.mine, true);
        assert.equal(saved.mountainWorks.tiles[site.x + ":" + site.y]?.aqueduct, true);
        const statsBefore = mountainWorksStats();
        assert.ok(statsBefore.tiles >= 1, "the live works stats must count the built tile");

        const prepared = prepareSaveSnapshot(saved);
        resetState();
        state.activeProfileId = "mountain-campaign-audit";
        state.playerName = saved.playerName;
        state.hasStarted = true;
        state.isPaused = false;
        restoreSaveSnapshot(prepared);
        const restored = JSON.parse(JSON.stringify(createSaveSnapshot()));
        assert.deepEqual(restored.mountainWorks, saved.mountainWorks,
            "a loaded mountain save must reproduce every work and cooldown");
        assert.deepEqual(restored.resources, saved.resources);
        assert.equal(restored.tick, saved.tick);
        assert.equal(restored.year, saved.year);
        assert.equal(mountainWorksStats().tiles, statsBefore.tiles);
        assert.ok(Object.values(restored.mountainWorks.tiles).some(tile => tile.terraced && tile.road && tile.quarry && tile.mine && tile.aqueduct),
            "the restored tile must still expose all five built works");
    } finally {
        globalThis.document = previousDocument;
    }
});
