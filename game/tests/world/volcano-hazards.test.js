import test from "node:test";
import assert from "node:assert/strict";
import { resetState, state } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import {
    destroyVolcanicTargetAt, updateVolcanoHazards, VOLCANO_HAZARD_CANDIDATE_LIMIT,
} from "../../js/world/volcano-hazards.js";
import { volcanoProfileAt } from "../../js/world/volcano-ecology.js";
import { volcanicSiteVerdictAt } from "../../js/systems/construction.js";

const SEED = 20261212;
const BASE = Object.freeze({
    seed: SEED, climate: "volcanic", height: 0.72, moisture: 0.42,
    temperature: 0.7, seaLevel: 0.33, dayOfYear: 140,
    hour: 12, weather: "clear", wind: 1,
});

function prepareWorld() {
    resetState();
    state.worldSeed = SEED;
    state.worldW = 32;
    state.worldH = 32;
    state.terrainResolution = 1;
    state.terrainPixW = 32;
    state.terrainPixH = 32;
    state.seaLevel = 0.33;
    state.worldOptions = { landmass: 50, ruggedness: 70, forests: 40, water: 48, climate: "volcanic" };
    state.heightMap = new Float32Array(32 * 32).fill(0.72);
    state.moistureMap = new Float32Array(32 * 32).fill(0.42);
    state.temperatureMap = new Float32Array(32 * 32).fill(0.7);
    state.resources = { wood: 40, stone: 40, gold: 20, food: 10 };
    state.dayOfYear = 140;
    state.eventLog = [];
    state.entities = [];
    state.volcanoWorks = null;
}

function findSite(predicate) {
    for (let year = 1; year <= 30; year++) {
        for (let y = 0; y < 32; y++) {
            for (let x = 0; x < 32; x++) {
                const profile = volcanoProfileAt(x + 0.5, y + 0.5, {
                    ...BASE, year, use: { settlement: true },
                });
                if (predicate(profile)) return { x, y, year, profile };
            }
        }
    }
    return null;
}

function houseAt(site, id = 901) {
    return {
        id, x: site.x, y: site.y, type: TYPE.HOUSE, hp: 80, maxHp: 80,
        isBuilding() { return true; },
    };
}

test("an active eruption destroys a real building and logs the loss", () => {
    prepareWorld();
    const site = findSite(profile => profile.climate.active && profile.hazards.destruction > 0.5);
    assert.ok(site, "the deterministic survey needs an active eruption site");
    state.year = site.year;
    const house = houseAt(site);
    state.entities = [house];
    const result = updateVolcanoHazards({ force: true });
    assert.equal(result.candidates > 0, true);
    assert.ok(result.candidates <= VOLCANO_HAZARD_CANDIDATE_LIMIT);
    assert.equal(result.eruption?.x, site.x);
    assert.equal(result.eruption?.y, site.y);
    assert.equal(house.dead, true);
    assert.equal(result.destroyed?.kind, "building");
    assert.match(result.events.join(" "), /ERUPTION/);
    assert.match(state.eventLog.map(entry => entry.text).join(" "), /LAVA BURIES/);
    assert.ok(state.resources.food <= 9, "ashfall must consume a food unit on occupied ground");
});

test("earthquake destruction is a separate runtime cause and is logged", () => {
    prepareWorld();
    const site = findSite(profile => profile.hazards.earthquake > 0.65);
    assert.ok(site, "the deterministic survey needs an earthquake site");
    const house = houseAt(site, 902);
    state.entities = [house];
    const result = destroyVolcanicTargetAt(site.x, site.y, { cause: "earthquake" });
    assert.equal(result.ok, true);
    assert.equal(house.dead, true);
    assert.match(state.eventLog.map(entry => entry.text).join(" "), /EARTHQUAKE COLLAPSES/);
});

test("volcanic ground blocks uninhabitable and young-lava house sites but allows old ground", () => {
    prepareWorld();
    state.year = 1;
    const hostile = findSite(profile => profile.hazards.uninhabitable > 0.72);
    assert.ok(hostile);
    const denied = volcanicSiteVerdictAt(TYPE.HOUSE, hostile.x, hostile.y);
    assert.equal(denied.ok, false);
    assert.match(denied.reason, /UNINHABITABLE/);
    assert.equal(volcanicSiteVerdictAt(TYPE.KEEP, hostile.x, hostile.y).ok, true,
        "the protected keep must not be blocked by its volcanic founding tile");
    const young = findSite(profile => profile.economy.usability < 0.3 && profile.hazards.uninhabitable <= 0.7);
    assert.ok(young);
    assert.equal(volcanicSiteVerdictAt(TYPE.HOUSE, young.x, young.y).ok, false);
    const old = findSite(profile => profile.economy.usability > 0.3 && profile.hazards.uninhabitable <= 0.7);
    assert.ok(old);
    assert.equal(volcanicSiteVerdictAt(TYPE.HOUSE, old.x, old.y).ok, true);
});
