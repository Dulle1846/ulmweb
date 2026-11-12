// Fifteen-round continuous campaign stress test with exact save/load audits.
//
// One realm is extended for 15 rounds (150 years each by default). After the
// midpoint round and the penultimate round, the live state is written through
// the real local-save envelope as a schema-8 legacy save, migrated to schema 9,
// validated and restored. The restored save snapshot must be byte-for-byte
// equivalent after JSON normalization, and the next round must continue from
// the same tick and year.
import { performance } from "node:perf_hooks";
import { readFile, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { runCampaign } from "../tests/campaign/campaign-driver.mjs";
import { resetState, state } from "../js/core/state.js";
import { TYPE } from "../js/core/types.js";
import { WORLD_W, WORLD_H } from "../js/core/config.js";
import { createSaveSnapshot, prepareSaveSnapshot, restoreSaveSnapshot } from "../js/core/save-runtime.js";
import { createIdentityState } from "../js/systems/identity.js";
import { createLegacyState } from "../js/systems/legacy.js";
import { createLocalProfile, readLocalSave, writeLocalSave } from "../js/core/persistence.js";

const ROUNDS = Math.max(1, Number(process.env.PLAYTEST_ROUNDS || 15));
const YEARS_PER_ROUND = Math.max(1, Number(process.env.PLAYTEST_YEARS || 150));
const SEED = Number(process.env.PLAYTEST_SEED || 20261108);
const ERA = process.env.PLAYTEST_ERA || "common-weal";
const PROFILE = process.env.PLAYTEST_PROFILE || "builder";
const SAVE_ROUNDS = new Set(String(process.env.PLAYTEST_SAVE_ROUNDS || "7,14")
    .split(",")
    .map(value => Math.floor(Number(value)))
    .filter(value => value >= 1 && value <= ROUNDS));
const PROFILE_ID = String(process.env.PLAYTEST_PROFILE_ID || "kings-cards-endurance-audit");
const MAX_ENTITIES = 900;
const FRESH = process.env.PLAYTEST_FRESH === "1";
const CHECKPOINT = resolve(process.env.PLAYTEST_CHECKPOINT || "artifacts/long-playtest-checkpoint.json");

class MemoryStorage {
    #values = new Map();
    get length() { return this.#values.size; }
    key(index) { return [...this.#values.keys()][index] ?? null; }
    getItem(key) { return this.#values.has(String(key)) ? this.#values.get(String(key)) : null; }
    setItem(key, value) { this.#values.set(String(key), String(value)); }
    removeItem(key) { this.#values.delete(String(key)); }
    clear() { this.#values.clear(); }
}

function makeCanvasStub() {
    return {
        width: 0,
        height: 0,
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

const previousDocument = globalThis.document;
const previousStorage = globalThis.localStorage;
globalThis.document = {
    createElement(tag) {
        if (tag !== "canvas") throw new Error("Unexpected DOM element in playtest: " + tag);
        return makeCanvasStub();
    }
};
globalThis.localStorage = new MemoryStorage();

const profile = createLocalProfile("Endurance Audit", PROFILE_ID);

const ignoredScanKeys = new Set([
    "canvas", "ctx", "terrainCanvasEl", "minimapCanvas", "minimapCtx",
    "heightMap", "moistureMap", "explored", "terrainCanvas", "fogCanvas",
    "entities", "randomStreams"
]);

function firstNonFinite(value, path = "state", seen = new Set(), depth = 0) {
    if (typeof value === "number") return Number.isFinite(value) ? null : path;
    if (!value || typeof value !== "object" || depth > 9) return null;
    if (seen.has(value) || ArrayBuffer.isView(value)) return null;
    seen.add(value);
    if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index++) {
            const found = firstNonFinite(value[index], path + "[" + index + "]", seen, depth + 1);
            if (found) return found;
        }
        return null;
    }
    for (const [key, entry] of Object.entries(value)) {
        if (ignoredScanKeys.has(key)) continue;
        const found = firstNonFinite(entry, path + "." + key, seen, depth + 1);
        if (found) return found;
    }
    return null;
}

function bounded(value, limit, label, failures) {
    if (!Array.isArray(value)) {
        failures.push(label + " is not an array");
        return;
    }
    if (value.length > limit) failures.push(label + " has " + value.length + " > " + limit);
}

function inspect(label, expectedYear) {
    const failures = [];
    const ids = state.entities.map(entity => entity.id).filter(id => id !== undefined && id !== null);
    if (state.entities.length > MAX_ENTITIES) failures.push("entities " + state.entities.length + " > " + MAX_ENTITIES);
    if (new Set(ids).size !== ids.length) failures.push("duplicate live entity ids");
    for (const entity of state.entities) {
        if (!Number.isFinite(entity.x) || !Number.isFinite(entity.y) ||
            entity.x < 0 || entity.y < 0 || entity.x >= WORLD_W || entity.y >= WORLD_H) {
            failures.push("entity outside finite world bounds: " + entity.id + " (" + entity.x + "," + entity.y + ")");
            break;
        }
        if (!Number.isFinite(Number(entity.hp))) {
            failures.push("entity hp is not finite: " + entity.id);
            break;
        }
    }
    for (const [resource, amount] of Object.entries(state.resources || {})) {
        if (!Number.isFinite(Number(amount)) || Number(amount) < 0) failures.push("resource " + resource + " invalid: " + amount);
    }
    if (!Number.isFinite(state.morale) || state.morale < 0 || state.morale > 100) failures.push("morale invalid: " + state.morale);
    if (!Number.isFinite(state.politics?.legitimacy) || state.politics.legitimacy < 0 || state.politics.legitimacy > 100) {
        failures.push("legitimacy invalid: " + state.politics?.legitimacy);
    }
    if (!Number.isFinite(state.economy?.debt) || state.economy.debt < 0) failures.push("debt invalid: " + state.economy?.debt);
    if (state.year < expectedYear) failures.push("year " + state.year + " < expected " + expectedYear);
    if (state.tick <= 0 || !Number.isFinite(state.tick)) failures.push("tick invalid: " + state.tick);
    if (state.gameOver) failures.push("realm ended unexpectedly");
    if (state.canvas || state.ctx) failures.push("headless state grew a DOM canvas");

    const nonFinite = firstNonFinite({
        resources: state.resources,
        morale: state.morale,
        politics: state.politics,
        economy: state.economy,
        population: state.population,
        market: state.market,
        court: state.court,
        faith: state.faith,
        justice: state.justice,
        research: state.research,
        government: state.government,
        statistics: state.statistics,
        ambitions: state.ambitions,
        legacy: state.legacy,
        diplomacy: state.diplomacy
    });
    if (nonFinite) failures.push("non-finite number at " + nonFinite);

    bounded(state.eventLog, 100, "eventLog", failures);
    bounded(state.economy?.history, 24, "economy.history", failures);
    bounded(state.personArchive, 500, "personArchive", failures);
    bounded(state.creatureArchive, 100, "creatureArchive", failures);
    bounded(state.court?.history, 40, "court.history", failures);
    bounded(state.research?.history, 24, "research.history", failures);
    bounded(state.government?.history, 40, "government.history", failures);
    bounded(state.legacy?.entries, 120, "legacy.entries", failures);
    bounded(state.population?.history, 25, "population.history", failures);
    bounded(state.diplomacy?.history, 30, "diplomacy.history", failures);
    bounded(state.city?.needs?.history, 24, "city.needs.history", failures);
    bounded(state.city?.logistics?.carriers, 24, "city.logistics.carriers", failures);

    const activeSites = state.entities.filter(entity => !entity.dead && entity.isBuilding?.() &&
        entity.construction && Number(entity.construction.stage) < 3).length;
    if (activeSites !== 0) failures.push("active construction sites at boundary: " + activeSites);

    return {
        label,
        tick: state.tick,
        year: state.year,
        population: state.entities.filter(entity => !entity.dead && entity.type === TYPE.VILLAGER).length,
        entities: state.entities.length,
        gold: Math.round((Number(state.resources.gold) || 0) * 100) / 100,
        food: Math.round((Number(state.resources.food) || 0) * 100) / 100,
        morale: Math.round((Number(state.morale) || 0) * 100) / 100,
        legitimacy: Math.round((Number(state.politics?.legitimacy) || 0) * 100) / 100,
        eventLog: state.eventLog.length,
        economyHistory: state.economy.history.length,
        personArchive: state.personArchive.length,
        cityNeedsHistory: state.city?.needs?.history?.length ?? null,
        carriers: state.city?.logistics?.carriers?.length ?? null,
        activeSites,
        failures
    };
}

function snapshotDiff(a, b, path = "snapshot", out = []) {
    if (out.length >= 30) return out;
    if (Object.is(a, b)) return out;
    if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") {
        out.push(path + ": " + JSON.stringify(a) + " != " + JSON.stringify(b));
        return out;
    }
    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
            out.push(path + ": array " + a?.length + " != " + b?.length);
            return out;
        }
        for (let index = 0; index < a.length; index++) snapshotDiff(a[index], b[index], path + "[" + index + "]", out);
        return out;
    }
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (!(key in a)) out.push(path + "." + key + ": missing on saved");
        else if (!(key in b)) out.push(path + "." + key + ": missing on restored");
        else snapshotDiff(a[key], b[key], path + "." + key, out);
        if (out.length >= 30) break;
    }
    return out;
}

function initializeRealm() {
    state.activeProfileId = profile.id;
    state.playerName = profile.displayName;
    state.identity = createIdentityState({
        kingdomName: "Endurance Realm",
        dynastyName: "Royal House",
        foundedYear: 1
    });
    state.kingdomName = state.identity.kingdomName;
    state.royal.dynastyName = state.identity.dynastyName;
    state.legacy = createLegacyState({ foundedYear: 1 });
}

async function loadCheckpoint() {
    if (FRESH) return null;
    try {
        const data = JSON.parse(await readFile(CHECKPOINT, "utf8"));
        if (data?.version !== 1 || data.seed !== SEED || data.profile !== PROFILE ||
            data.era !== ERA || data.yearsPerRound !== YEARS_PER_ROUND || !data.snapshot) {
            console.error("PLAYTEST_CHECKPOINT_IGNORED " + JSON.stringify({path: CHECKPOINT}));
            return null;
        }
        return data;
    } catch (error) {
        if (error?.code !== "ENOENT") console.error("PLAYTEST_CHECKPOINT_READ_FAILED", error?.stack || error);
        return null;
    }
}

async function writeCheckpoint(round, startedAt) {
    const data = {
        version: 1,
        seed: SEED,
        profile: PROFILE,
        era: ERA,
        yearsPerRound: YEARS_PER_ROUND,
        round,
        rounds,
        roundTrips,
        elapsedMs: Math.round(performance.now() - startedAt),
        snapshot: JSON.parse(JSON.stringify(createSaveSnapshot()))
    };
    const temporary = CHECKPOINT + ".tmp";
    await writeFile(temporary, JSON.stringify(data));
    await rename(temporary, CHECKPOINT);
    console.log("PLAYTEST_CHECKPOINT " + JSON.stringify({
        round, tick: state.tick, year: state.year, path: CHECKPOINT
    }));
}

function restoreLocalAudit(round) {
    const before = JSON.parse(JSON.stringify(createSaveSnapshot()));
    const legacy = JSON.parse(JSON.stringify(before));
    legacy.saveSchemaVersion = 8;
    const storedJson = JSON.stringify(legacy);
    const saveStarted = performance.now();
    writeLocalSave(profile.id, legacy);
    const envelope = readLocalSave(profile.id);
    if (!envelope) throw new Error("Saved realm could not be read back.");
    const migratedFrom = Number(envelope.snapshot.saveSchemaVersion);
    const prepared = prepareSaveSnapshot(envelope.snapshot);
    resetState();
    state.activeProfileId = profile.id;
    state.playerName = profile.displayName;
    state.hasStarted = true;
    state.isPaused = false;
    const restored = restoreSaveSnapshot(prepared);
    const restoreMs = performance.now() - saveStarted;
    state.isPaused = false;

    const after = JSON.parse(JSON.stringify(createSaveSnapshot()));
    const differences = snapshotDiff(before, after);
    const loadedInspection = inspect("load-round-" + round, before.year);
    if (differences.length) {
        loadedInspection.failures.push("exact snapshot mismatch after load: " + differences.join(" | "));
    }
    if (after.tick !== before.tick) loadedInspection.failures.push("tick changed across load: " + before.tick + " -> " + after.tick);
    if (after.year !== before.year) loadedInspection.failures.push("year changed across load: " + before.year + " -> " + after.year);
    if (after.totalPopulation !== before.totalPopulation) loadedInspection.failures.push("population changed across load");
    if (JSON.stringify(after.resources) !== JSON.stringify(before.resources)) loadedInspection.failures.push("resources changed across load");
    if (after.morale !== before.morale) loadedInspection.failures.push("morale changed across load");
    if (after.politics?.legitimacy !== before.politics?.legitimacy) loadedInspection.failures.push("legitimacy changed across load");
    if (after.entities.length !== before.entities.length) loadedInspection.failures.push("entity count changed across load");

    return {
        round,
        schemaStored: migratedFrom,
        schemaLoaded: prepared.saveSchemaVersion,
        tick: before.tick,
        year: before.year,
        resources: before.resources,
        morale: before.morale,
        legitimacy: before.politics?.legitimacy,
        population: before.totalPopulation,
        entities: before.entities.length,
        saveBytes: storedJson.length,
        restoreMs: Math.round(restoreMs * 100) / 100,
        exact: differences.length === 0,
        differences: differences.slice(0, 12),
        hasSavedCamera: restored.hasSavedCamera,
        inspection: loadedInspection
    };
}

const checkpoint = await loadCheckpoint();
const rounds = Array.isArray(checkpoint?.rounds) ? checkpoint.rounds : [];
const roundTrips = Array.isArray(checkpoint?.roundTrips) ? checkpoint.roundTrips : [];
const started = performance.now();
let failed = false;
let resumeRound = 0;
if (checkpoint) {
    try {
        const prepared = prepareSaveSnapshot(checkpoint.snapshot);
        resetState();
        state.activeProfileId = profile.id;
        state.playerName = profile.displayName;
        state.hasStarted = true;
        state.isPaused = false;
        restoreSaveSnapshot(prepared);
        state.isPaused = false;
        const after = JSON.parse(JSON.stringify(createSaveSnapshot()));
        const differences = snapshotDiff(checkpoint.snapshot, after);
        if (differences.length) throw new Error("checkpoint mismatch: " + differences.join(" | "));
        resumeRound = checkpoint.round;
        console.log("PLAYTEST_RESUMED " + JSON.stringify({
            round: resumeRound, tick: state.tick, year: state.year, checkpointPath: CHECKPOINT
        }));
    } catch (error) {
        console.error("PLAYTEST_RESUME_FAILED", error?.stack || error);
        failed = true;
    }
}
try {
    for (let round = resumeRound + 1; round <= ROUNDS && !failed; round++) {
        const beforeTick = state.tick;
        const beforeYear = state.year;
        const campaign = runCampaign({
            seed: SEED,
            profile: PROFILE,
            era: ERA,
            years: YEARS_PER_ROUND,
            initialize: round === 1,
            minAgendaStages: 1,
            onInitialized: round === 1 ? initializeRealm : null
        });
        const expectedYear = 1 + round * YEARS_PER_ROUND;
        const row = inspect("round-" + round, expectedYear);
        if (!campaign.ok) {
            row.failures.push("campaign requirements failed: " +
                Object.entries(campaign.requirements).filter(([, value]) => !value).map(([key]) => key).join(","));
        }
        if (state.tick <= beforeTick) row.failures.push("simulation did not advance");
        if (state.year <= beforeYear) row.failures.push("year did not advance");
        row.elapsedMs = campaign.elapsedMs;
        row.tickCostMs = campaign.tickCostMs;
        row.deltaYears = state.year - beforeYear;
        rounds.push(row);
        console.log("PLAYTEST_ROUND " + JSON.stringify(row));
        if (row.failures.length) {
            console.error("PLAYTEST_STOPPED_AT_ROUND " + round);
            failed = true;
            break;
        }

        if (SAVE_ROUNDS.has(round)) {
            const trip = restoreLocalAudit(round);
            roundTrips.push(trip);
            console.log("PLAYTEST_SAVELOAD " + JSON.stringify(trip));
            if (trip.inspection.failures.length) {
                console.error("PLAYTEST_STOPPED_AFTER_LOAD " + round);
                failed = true;
            }
        }
        if (!failed) {
            try {
                await writeCheckpoint(round, started);
            } catch (error) {
                console.error("PLAYTEST_CHECKPOINT_WRITE_FAILED", error?.stack || error);
                failed = true;
            }
        }
    }
} catch (error) {
    console.error("PLAYTEST_THREW", error?.stack || error);
    failed = true;
} finally {
    globalThis.document = previousDocument;
    globalThis.localStorage = previousStorage;
}

const elapsedMs = performance.now() - started;
const completed = rounds.filter(row => row.failures.length === 0).length;
const summary = {
    roundsRequested: ROUNDS,
    roundsCompleted: completed,
    yearsPerRound: YEARS_PER_ROUND,
    saveRounds: [...SAVE_ROUNDS],
    yearsReached: state.year,
    ticksReached: state.tick,
    elapsedMs: Math.round(elapsedMs),
    minTickCostMs: rounds.length ? Math.min(...rounds.map(row => row.tickCostMs)) : null,
    maxTickCostMs: rounds.length ? Math.max(...rounds.map(row => row.tickCostMs)) : null,
    avgTickCostMs: rounds.length ? Math.round(rounds.reduce((sum, row) => sum + row.tickCostMs, 0) / rounds.length * 1000) / 1000 : null,
    saveLoads: roundTrips.map(({ inspection, ...trip }) => ({ ...trip, failures: inspection.failures })),
    ok: !failed && completed === ROUNDS && roundTrips.length === SAVE_ROUNDS.size &&
        roundTrips.every(trip => trip.exact && trip.inspection.failures.length === 0),
    last: rounds.at(-1) || null,
    failures: [
        ...rounds.flatMap(row => row.failures.map(failure => "round " + row.label + ": " + failure)),
        ...roundTrips.flatMap(trip => trip.inspection.failures.map(failure => "load after round " + trip.round + ": " + failure))
    ]
};
console.log("PLAYTEST_SUMMARY " + JSON.stringify(summary));
if (!summary.ok) process.exitCode = 1;
