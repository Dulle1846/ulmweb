import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { state, resetState } from "../../js/core/state.js";
import { TYPE } from "../../js/core/types.js";
import { spawnEntity } from "../../js/world/entities.js";
import { generateResourceGeography } from "../../js/systems/resource-geography.js";
import { isWaterAt } from "../../js/world/world.js";
import { ensurePersonProfile } from "../../js/systems/people.js";
import {
    ensureExpeditions, getExpeditionSnapshot, startExpedition, updateExpeditions,
    expeditionCandidates, normalizeExpeditionsState, validateExpeditionsState,
    MAX_SITES, MAX_HISTORY, MAX_LORE
} from "../../js/systems/expeditions.js";
import { createSaveSnapshot } from "../../js/core/save-runtime.js";

const SEED = 20261113;

function setupWorld(seed = SEED) {
    resetState();
    state.hasStarted = true;
    state.worldSeed = seed;
    state.worldOptions = { size: "standard", shape: "continent", climate: "temperate", landmass: 64, ruggedness: 55, forests: 46, water: 34, fertility: 58, resources: 55 };
    // A flat dry fixture keeps the domain cheap to test. The real generator
    // supplies the same query contract in the browser and campaign runs.
    const size = 120;
    state.worldW = size;
    state.worldH = size;
    state.seaLevel = 0.33;
    state.terrainResolution = 1;
    state.terrainPixW = size;
    state.terrainPixH = size;
    state.heightMap = new Float32Array(size * size).fill(0.62);
    state.moistureMap = new Float32Array(size * size).fill(0.45);
    state.temperatureMap = new Float32Array(size * size).fill(0.55);
    state.explored = Array.from({ length: size }, () => Array(size).fill(false));
    state.explored[60][60] = true;
    generateResourceGeography(seed);
    const keep = spawnEntity(60, 60, TYPE.KEEP);
    const villagers = [];
    for (let index = 0; index < 4; index++) {
        const villager = spawnEntity(58 + index, 62, TYPE.VILLAGER);
        const person = ensurePersonProfile(villager);
        person.ageYears = 26 + index;
        person.lifeStage = "adult";
        villagers.push(villager);
    }
    return { keep, villagers };
}

function setupRealm(seed = SEED) {
    setupWorld(seed);
    state.resources = { wood: 300, stone: 300, gold: 200, food: 300 };
    return state.entities.find(entity => entity.type === TYPE.VILLAGER && !entity.isKing);
}

test("eight landmarks are deterministic, on land and distinct for the same world", () => {
    setupWorld();
    const first = ensureExpeditions();
    assert.equal(first.sites.length, MAX_SITES);
    assert.equal(new Set(first.sites.map(site => site.id)).size, MAX_SITES);
    assert.equal(new Set(first.sites.map(site => `${site.x},${site.y}`)).size, MAX_SITES);
    for (const site of first.sites) {
        assert.equal(isWaterAt(site.x + 0.5, site.y + 0.5), false, site.id + " must be on dry land");
        assert.ok(site.distance >= 1);
        assert.ok(site.danger >= 1 && site.danger <= 3);
    }
    const ids = first.sites.map(site => site.id);

    setupWorld();
    const second = ensureExpeditions();
    assert.deepEqual(second.sites.map(site => site.id), ids);
    assert.deepEqual(second.sites.map(site => [site.x, site.y, site.type]), first.sites.map(site => [site.x, site.y, site.type]));
});

test("a named adult leader can be sent once and pays the displayed supplies", () => {
    setupWorld();
    const expedition = ensureExpeditions();
    const site = expedition.sites[0];
    const candidate = expeditionCandidates()[0];
    assert.ok(candidate, "the starter fixture must contain an adult villager");
    state.resources = { wood: 100, stone: 100, gold: 100, food: 200 };
    state.tick = 40;
    const foodBefore = state.resources.food;
    const goldBefore = state.resources.gold;
    const result = startExpedition(site.id, candidate.personId, "standard");
    assert.equal(result.ok, true);
    assert.ok(result.expedition.active);
    assert.equal(result.expedition.active.phase, "outbound");
    assert.equal(state.resources.food, foodBefore - (24 + Math.ceil(site.distance * 0.35)));
    assert.equal(state.resources.gold, goldBefore - 12);
    assert.equal(expeditionCandidates().some(entry => entry.personId === candidate.personId), false);
    const leader = state.entities.find(entity => String(entity.personId || entity.id) === candidate.personId);
    assert.equal(leader.expeditionId, result.expedition.active.id);
    assert.equal(startExpedition(site.id, candidate.personId, "standard").reason, "expedition-already-active");
});

test("travel advances in bounded phases, reveals the site and pays loot only on return", () => {
    setupWorld();
    const expedition = ensureExpeditions();
    const site = expedition.sites.find(item => item.danger <= 2) || expedition.sites[0];
    const candidate = expeditionCandidates()[0];
    const leader = state.entities.find(entity => String(entity.personId || entity.id) === candidate.personId);
    const person = ensurePersonProfile(leader);
    person.skills = { ...person.skills, command: 95, learning: 95, care: 95, trade: 95 };
    state.resources = { wood: 100, stone: 100, gold: 100, food: 200 };
    state.tick = 100;
    const start = startExpedition(site.id, candidate.personId, "grand");
    assert.equal(start.ok, true);
    const active = expedition.active;
    const goldBefore = state.resources.gold;
    state.tick = active.arriveTick - 1;
    assert.equal(updateExpeditions(), null);
    assert.equal(expedition.active.phase, "outbound");
    state.tick = active.arriveTick;
    assert.equal(updateExpeditions(), null);
    assert.equal(expedition.active.phase, "returning");
    assert.ok(expedition.active.outcome);
    assert.equal(state.explored[site.x][site.y], true);
    assert.equal(state.resources.gold, goldBefore, "loot must not be credited before the party returns");
    state.tick = active.returnTick;
    const outcome = updateExpeditions();
    assert.ok(outcome);
    assert.equal(expedition.active, null);
    assert.equal(expedition.history.length, 1);
    assert.equal(expedition.completed, 1, "a returned party must increment the completed stat exactly once");
    assert.equal(expedition.history[0].siteId, site.id);
    assert.ok(expedition.lore.length >= 1);
    assert.ok(state.resources.gold >= goldBefore + (outcome.loot.gold || 0));
    assert.equal(state.entities.find(entity => String(entity.personId || entity.id) === candidate.personId).expeditionId, undefined);
    const historyLength = expedition.history.length;
    const reward = state.resources.gold;
    state.tick += 30;
    updateExpeditions();
    assert.equal(expedition.history.length, historyLength, "a finished expedition cannot run twice");
    assert.equal(state.resources.gold, reward);
});

test("a badly led light expedition can fail, wound the leader and lower morale", () => {
    setupWorld();
    const expedition = ensureExpeditions();
    const site = expedition.sites.find(item => item.danger === 3) || expedition.sites[0];
    site.danger = 3;
    const candidate = expeditionCandidates()[0];
    const leader = state.entities.find(entity => String(entity.personId || entity.id) === candidate.personId);
    const person = ensurePersonProfile(leader);
    person.skills = { command: 1, learning: 1, care: 1, trade: 1, farming: 1, crafting: 1, labour: 1 };
    state.resources = { wood: 100, stone: 100, gold: 100, food: 200 };
    state.tick = 400;
    const morale = state.morale;
    const start = startExpedition(site.id, candidate.personId, "light");
    assert.equal(start.ok, true);
    const active = expedition.active;
    state.tick = active.arriveTick;
    updateExpeditions();
    state.tick = active.returnTick;
    const outcome = updateExpeditions();
    assert.equal(outcome.tier, "disaster");
    assert.deepEqual(outcome.loot, {});
    assert.ok(leader.illnessUntilTick > state.tick);
    assert.equal(state.morale, Math.max(0, morale - 2));
    assert.ok(expedition.history[0].tier === "disaster");
    assert.equal(expedition.discoveries, 0);
});

test("malformed expedition state is normalized and its logs are bounded", () => {
    resetState();
    state.expeditions = {
        seed: SEED,
        sites: [
            { id: "site-1", type: "ruins", x: 10, y: 10, danger: 2, distance: 5, known: true },
            { id: "site-1", type: "ruins", x: 11, y: 11, danger: 2, distance: 5 },
            { id: "bad", type: "unknown", x: 1, y: 1 },
            { id: "site-2", type: "cave", x: 20, y: 20, danger: 9, distance: 8 }
        ],
        history: Array.from({ length: 40 }, (_, index) => ({ id: "expedition-" + (index + 1), siteId: "site-1", title: "Return " + index })),
        lore: Array.from({ length: 60 }, (_, index) => ({ id: "lore-" + index, text: "Fragment " + index })),
        active: { id: "expedition-1", siteId: "site-1", leaderId: "missing", departTick: 1, arriveTick: 2, returnTick: 3 },
        nextId: 4
    };
    const normalized = normalizeExpeditionsState();
    assert.equal(normalized.sites.length, 2);
    assert.equal(normalized.sites[1].danger, 3);
    assert.equal(normalized.history.length, MAX_HISTORY);
    assert.equal(normalized.lore.length, MAX_LORE);
    assert.equal(validateExpeditionsState(normalized), true);
    assert.throws(() => validateExpeditionsState({ sites: [{ type: "unknown" }], history: [], lore: [] }));
});

test("the save snapshot carries the active expedition and its leader link", () => {
    setupRealm();
    const expedition = ensureExpeditions();
    const candidate = expeditionCandidates()[0];
    state.resources = { wood: 300, stone: 300, gold: 200, food: 300 };
    state.tick = 120;
    const started = startExpedition(expedition.sites[0].id, candidate.personId, "standard");
    assert.equal(started.ok, true);
    const snapshot = createSaveSnapshot();
    assert.ok(snapshot.expeditions, "the save must carry the expedition state");
    assert.equal(snapshot.expeditions.active.id, expedition.active.id);
    assert.equal(snapshot.expeditions.active.siteId, expedition.active.siteId);
    assert.equal(snapshot.expeditions.sites.length, expedition.sites.length);
    const normalized = normalizeExpeditionsState(snapshot.expeditions);
    assert.equal(normalized.active.id, expedition.active.id);
    assert.deepEqual(normalized.sites.map(site => site.id), expedition.sites.map(site => site.id));
});

test("the save, simulation and UI source contracts include the expedition layer", async () => {
    const source = async path => readFile(new URL("../../" + path, import.meta.url), "utf8");
    const [module, saveRuntime, validation, simulation, html, ui, css] = await Promise.all([
        source("js/systems/expeditions.js"),
        source("js/core/save-runtime.js"),
        source("js/core/save-validation.js"),
        source("js/simulation/simulation.js"),
        source("index.html"),
        source("js/presentation/management-ui.js"),
        source("css/diplomacy.css")
    ]);
    assert.match(module, /export function updateExpeditions/, "the expedition layer must expose its tick entry point");
    assert.doesNotMatch(module, /Math\.random\s*\(/, "expedition outcomes must use the local deterministic stream");
    assert.ok(saveRuntime.replace(/\s+/g, "").includes("expeditions:JSON.parse"), "the save snapshot must persist expeditions");
    assert.ok(saveRuntime.replace(/\s+/g, "").includes("state.expeditions=normalizeExpeditionsState"), "loading must normalize expeditions");
    assert.ok(validation.includes("validateExpeditionsState"), "the save validator must check the expedition block");
    assert.ok(simulation.includes("updateExpeditions()"), "the simulation must advance travel from its normal tick");
    assert.ok(html.includes('data-command-tab="explore"'), "the command deck must expose the Explore tab");
    assert.ok(ui.includes("explore:renderExpeditionsPanel") && ui.includes("expedition-start"), "the Explore panel and launch action must be wired");
    assert.ok(ui.includes("kac:expedition-change"), "the open panel must refresh when travel resolves");
    assert.ok(css.includes(".expedition-site") && css.includes(".expedition-active"), "the expedition panel must have a real visual treatment");
});
