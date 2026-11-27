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
    SITE_CHAINS, armSiteChainFollowUp, MAX_SITES, MAX_HISTORY, MAX_LORE,
    MAX_SITE_NOTES, MAX_SITE_NOTE_CHARS
} from "../../js/systems/expeditions.js";
import { createSaveSnapshot } from "../../js/core/save-runtime.js";
import { MANAGEMENT_TABS } from "../../js/presentation/management-tabs.js";

const managementTabIds = new Set(MANAGEMENT_TABS.map(tab => tab.id));

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

test("follow-up chains survive a save round-trip and old saves normalize without a schema bump", () => {
    setupWorld();
    const armed = armSiteChainFollowUp("quarantine", { x: 18, y: 78 });
    const snapshot = createSaveSnapshot();
    assert.ok(snapshot.expeditions, "the save must carry the expedition block");
    const restored = normalizeExpeditionsState(JSON.parse(JSON.stringify(snapshot.expeditions)));
    const site = restored.sites.find(entry => entry.id === armed.siteId);
    assert.equal(site.chainStage, 2);
    assert.equal(site.claim, "quarantine");
    assert.equal(site.notes[0], SITE_CHAINS[site.type].quarantine.opening);
    assert.equal(validateExpeditionsState(restored), true);

    const legacySites = restored.sites.map(({ chainStage, claim, notes, ...rest }) => rest);
    const legacy = normalizeExpeditionsState({ ...restored, sites: legacySites });
    const legacySite = legacy.sites.find(entry => entry.id === armed.siteId);
    assert.equal(legacySite.chainStage, 0);
    assert.equal(legacySite.claim, null);
    assert.deepEqual(legacySite.notes, []);
    assert.equal(validateExpeditionsState(legacy), true);
});

test("the save, simulation and UI source contracts include the expedition layer", async () => {
    const source = async path => readFile(new URL("../../" + path, import.meta.url), "utf8");
    const [module, couplings, saveRuntime, validation, simulation, html, ui, panel, css] = await Promise.all([
        source("js/systems/expeditions.js"),
        source("js/systems/special-biome-couplings.js"),
        source("js/core/save-runtime.js"),
        source("js/core/save-validation.js"),
        source("js/simulation/simulation.js"),
        source("index.html"),
        source("js/presentation/management-ui.js"),
        source("js/presentation/expeditions-panel.js"),
        source("css/diplomacy.css")
    ]);
    assert.match(module, /export function updateExpeditions/, "the expedition layer must expose its tick entry point");
    assert.doesNotMatch(module, /Math\.random\s*\(/, "expedition outcomes must use the local deterministic stream");
    assert.ok(saveRuntime.replace(/\s+/g, "").includes("expeditions:JSON.parse"), "the save snapshot must persist expeditions");
    assert.ok(saveRuntime.replace(/\s+/g, "").includes("state.expeditions=normalizeExpeditionsState"), "loading must normalize expeditions");
    assert.ok(validation.includes("validateExpeditionsState"), "the save validator must check the expedition block");
    assert.ok(simulation.includes("updateExpeditions()"), "the simulation must advance travel from its normal tick");
    assert.equal((html.match(/data-command-tab=/g) || []).length, 0, "the deck must be rendered from the shared tab contract");
    assert.ok(managementTabIds.has("explore"), "the shared contract must expose the Explore tab");
    assert.ok(ui.includes("explore:renderExpeditionsPanel") && ui.includes("expedition-start"), "the Explore panel and launch action must be wired");
    assert.ok(ui.includes("kac:expedition-change"), "the open panel must refresh when travel resolves");
    assert.ok(ui.includes("stepTransitionSurvey") && ui.includes("refreshTransitionSurvey"), "the ecotone survey must step its tile cursor and refresh in place");
    assert.ok(css.includes(".expedition-site") && css.includes(".expedition-active"), "the expedition panel must have a real visual treatment");
    assert.ok(module.includes("export const SITE_CHAINS") && module.includes("export function armSiteChainFollowUp"),
        "the expedition layer must expose the bounded follow-up chain");
    assert.ok(couplings.includes("armSiteChainFollowUp(choiceId, region)"), "blight decrees must arm real expedition follow-ups");
    assert.ok(panel.includes("data-chain-stage") && panel.includes("expedition-site__notes"), "the Explore card must render chain state and field notes");
    assert.ok(panel.includes("FOLLOW-UPS READY") && panel.includes("CHAINS CLOSED"), "the summary must expose chain progress");
    assert.ok(ui.includes("r.siteChain") && css.includes(".expedition-site__chain") && css.includes(".expedition-site__notes"),
        "the decree toast and chain styling must be wired");
    assert.ok(couplings.includes("export function resolveBiomeQuestFollowUp") &&
        couplings.includes("export function getBiomeFollowUpSnapshot"),
        "completed atlas quests must arm a bounded, readable follow-up chain");
    assert.ok(panel.includes("data-special-follow-up") && panel.includes("data-command=\"special-biome-quest-followup\"") &&
        panel.includes("QUEST FOLLOW-UPS"),
        "the Explore panel must render real follow-up cards and choices");
    assert.ok(ui.includes("special-biome-quest-followup") && ui.includes("ATLAS FOLLOW-UP CLOSED"),
        "the command deck must dispatch and report atlas follow-up choices");
    assert.doesNotMatch(couplings, /Math\.random\s*\(/,
        "atlas follow-ups must stay on the deterministic coupling path");
});

test("all eight landmarks carry one bounded, deterministic follow-up chain", () => {
    const expectedTypes = ["ruins", "cave", "shrine", "tower", "crater", "grove", "barrow", "caravanserai"];
    assert.deepEqual(Object.keys(SITE_CHAINS), expectedTypes);
    for (const type of expectedTypes) {
        const chain = SITE_CHAINS[type];
        assert.ok(chain.title && chain.title.length >= 12, type + " needs a readable chain title");
        for (const claim of ["study", "quarantine"]) {
            const entry = chain[claim];
            assert.ok(entry.label && entry.label.length >= 10, type + "/" + claim + " needs a readable order");
            assert.equal(entry.score, claim === "study" ? 6 : 3);
            assert.equal(entry.reward, claim === "study" ? 0.12 : 0.05);
            assert.ok(entry.opening.length >= 60, type + "/" + claim + " needs a real opening note");
            assert.ok(entry.closure.length >= 60, type + "/" + claim + " needs a real closure note");
            assert.ok(entry.opening.length <= MAX_SITE_NOTE_CHARS);
            assert.ok(entry.closure.length <= MAX_SITE_NOTE_CHARS);
        }
    }
});

test("a blight claim arms one existing site without inventing landmarks or extra randomness", () => {
    setupWorld();
    const expedition = ensureExpeditions();
    const originalIds = expedition.sites.map(site => site.id);
    const region = { x: 24, y: 31 };
    const first = armSiteChainFollowUp("study", region);
    assert.ok(first, "study must place a field order");
    assert.equal(expedition.sites.length, MAX_SITES);
    assert.deepEqual(expedition.sites.map(site => site.id), originalIds, "follow-ups must reuse the eight landmarks");
    assert.equal(first.claim, "study");
    assert.equal(first.claimLabel, SITE_CHAINS[expedition.sites.find(site => site.id === first.siteId).type].study.label);
    const site = expedition.sites.find(entry => entry.id === first.siteId);
    assert.equal(site.chainStage, 2);
    assert.equal(site.claim, "study");
    assert.equal(site.notes.length, 1);
    const second = armSiteChainFollowUp("quarantine", region);
    assert.ok(second, "quarantine must place a different field order");
    assert.notEqual(second.siteId, first.siteId, "an armed site cannot be armed twice");
    assert.equal(armSiteChainFollowUp("purge"), null);
    assert.equal(armSiteChainFollowUp("ignore"), null);
    assert.equal(expedition.sites.filter(entry => entry.chainStage === 2).length, 2);
    const snapshot = getExpeditionSnapshot();
    assert.equal(snapshot.stats.chainReady, 2);
    assert.equal(snapshot.stats.chainClosed, 0);
    assert.equal(snapshot.sites.find(entry => entry.id === first.siteId).claimLabel, first.claimLabel);
    site.notes = Array.from({ length: MAX_SITE_NOTES + 6 }, (_, index) => "x".repeat(MAX_SITE_NOTE_CHARS + 8) + index);
    const normalized = normalizeExpeditionsState(expedition);
    const normalizedSite = normalized.sites.find(entry => entry.id === first.siteId);
    assert.equal(normalizedSite.notes.length, MAX_SITE_NOTES);
    assert.equal(normalizedSite.notes.every(note => note.length === MAX_SITE_NOTE_CHARS), true);
    assert.equal(validateExpeditionsState(normalized), true);
});

function runFollowUpExpedition(siteId, claim, region = null) {
    setupWorld();
    const expedition = ensureExpeditions();
    if (claim) {
        const armed = armSiteChainFollowUp(claim, region);
        assert.equal(armed.siteId, siteId, "the deterministic claim must land on the selected landmark");
    }
    const site = expedition.sites.find(entry => entry.id === siteId);
    const candidate = expeditionCandidates()[0];
    const leader = state.entities.find(entity => String(entity.personId || entity.id) === candidate.personId);
    const person = ensurePersonProfile(leader);
    person.skills = { command: 95, learning: 95, care: 95, trade: 95 };
    state.resources = { wood: 100, stone: 100, gold: 100, food: 200 };
    state.tick = 100;
    const started = startExpedition(site.id, candidate.personId, "grand");
    assert.equal(started.ok, true);
    const active = expedition.active;
    state.tick = active.arriveTick;
    updateExpeditions();
    state.tick = active.returnTick;
    const outcome = updateExpeditions();
    assert.ok(outcome);
    return { expedition, site, outcome };
}

test("a successful follow-up closes its chain and pays the advertised fixed bonus", () => {
    setupWorld();
    const region = { x: 12, y: 44 };
    const seeded = armSiteChainFollowUp("study", region);
    const siteId = seeded.siteId;
    const baseline = runFollowUpExpedition(siteId, null, region);
    const claimed = runFollowUpExpedition(siteId, "study", region);
    assert.equal(baseline.site.chainStage, 1, "an ordinary successful survey is merely surveyed");
    assert.equal(baseline.outcome.chainBonus, 0);
    assert.equal(claimed.outcome.tier, "triumph");
    assert.equal(claimed.outcome.chainClaim, "study");
    assert.equal(claimed.outcome.chainBonus, 6);
    assert.equal(claimed.site.chainStage, 3);
    assert.equal(claimed.site.claim, "study");
    assert.ok(claimed.site.notes.includes(SITE_CHAINS[claimed.site.type].study.closure),
        "closure must be written to the field notes");
    assert.equal(claimed.expedition.history[0].chainClaim, "study");
    assert.equal(claimed.expedition.history.length, 1);
    assert.equal(getExpeditionSnapshot().stats.chainClosed, 1);
    assert.equal(getExpeditionSnapshot().stats.chainReady, 0);
    const claimedGold = claimed.outcome.loot.gold || 0;
    const baselineGold = baseline.outcome.loot.gold || 0;
    assert.ok(claimedGold > baselineGold, "the claimed cache must exceed the same ordinary visit");
});

test("a failed follow-up stays armed and can be attempted again", () => {
    setupWorld();
    const armed = armSiteChainFollowUp("quarantine");
    const site = ensureExpeditions().sites.find(entry => entry.id === armed.siteId);
    site.danger = 3;
    const candidate = expeditionCandidates()[0];
    const leader = state.entities.find(entity => String(entity.personId || entity.id) === candidate.personId);
    const person = ensurePersonProfile(leader);
    person.skills = { command: 1, learning: 1, care: 1, trade: 1, farming: 1, crafting: 1, labour: 1 };
    state.resources = { wood: 100, stone: 100, gold: 100, food: 200 };
    state.tick = 400;
    const started = startExpedition(site.id, candidate.personId, "light");
    assert.equal(started.ok, true);
    const active = ensureExpeditions().active;
    state.tick = active.arriveTick;
    updateExpeditions();
    state.tick = active.returnTick;
    const outcome = updateExpeditions();
    assert.equal(outcome.tier, "disaster");
    assert.equal(outcome.chainClaim, "quarantine");
    assert.equal(site.chainStage, 2, "a failed follow-up must remain open");
    assert.equal(site.claim, "quarantine");
    assert.ok(site.notes.some(note => note.includes("driven back")));
    assert.equal(getExpeditionSnapshot().stats.chainReady, 1);
    assert.equal(getExpeditionSnapshot().stats.chainClosed, 0);
});
