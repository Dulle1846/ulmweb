// Real-browser, resumable endurance audit.
//
// The run is split into real five-year blocks. Every block loads the save
// written by the previous block through the visible CONTINUE control, plays
// with Playwright's fake clock, verifies the complete save against the state
// it loaded, saves through the visible SAVE control and atomically writes a
// checkpoint (including the browser storage state and the saved snapshot).
//
// A runner restart therefore resumes at the first block after the last
// checkpoint instead of discarding the run. The final block runs the exact
// save/load audit through the schema-8 legacy adapter and measures FPS in a
// fresh real-time browser context. The final report is written to
// `reports/endurance-50y.json` and `reports/endurance-50y.md`.
//
// This is deliberately not part of `npm test`: it needs Chromium and is a
// long-running hardware check. Use `npm run test:endurance`.
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdir, readFile, rename, writeFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {chromium} from "playwright";
import {runCampaign} from "../campaign/campaign-driver.mjs";
import {state} from "../../js/core/state.js";
import {createSaveSnapshot} from "../../js/core/save-runtime.js";
import {createIdentityState} from "../../js/systems/identity.js";
import {createLegacyState} from "../../js/systems/legacy.js";
import {createLocalProfile, writeLocalSave} from "../../js/core/persistence.js";

const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const ORIGIN = new URL(BASE).origin;
const SEED = Number(process.env.ENDURANCE_SEED || 20261108);
const SAVE_YEARS = Math.max(5, Number(process.env.ENDURANCE_SAVE_YEARS || 25));
const YEARS = Math.max(50, Number(process.env.ENDURANCE_YEARS || 50));
const BLOCK_YEARS = Math.max(1, Number(process.env.ENDURANCE_BLOCK_YEARS || 5));
const FRAME_LIMIT = Number(process.env.ENDURANCE_FRAME_LIMIT || 30);
const RENDER_SCALE = Number(process.env.ENDURANCE_RENDER_SCALE || 50);
const MAX_BLOCKS_PER_PROCESS = Math.max(0, Number(process.env.ENDURANCE_MAX_BLOCKS || 0));
const MAX_UI_TICK_LAG = 12;
const PROFILE_ID = "browser-endurance-audit";
const TOTAL_BLOCKS = Math.ceil(YEARS / BLOCK_YEARS);
const OUT = resolve(process.cwd(), "..", "artifacts");
const STATE_DIR = process.env.ENDURANCE_STATE_DIR
    ? resolve(process.env.ENDURANCE_STATE_DIR)
    : resolve(OUT, "endurance-50y-state");
const CHECKPOINT_PATH = resolve(STATE_DIR, "checkpoint.json");
const PROGRESS_PATH = resolve(STATE_DIR, "progress.json");
const REPORT_DIR = resolve(process.cwd(), "reports");
const REPORT_JSON = resolve(REPORT_DIR, "endurance-50y.json");
const REPORT_MD = resolve(REPORT_DIR, "endurance-50y.md");
const MAX_CHUNKS_PER_BLOCK = Math.max(40, BLOCK_YEARS * 40 + 40);
const FPS_MINIMUM = Number(process.env.ENDURANCE_FPS_MIN || 18);
const CLOCK_START = new Date("2026-01-01T00:00:00Z");

class MemoryStorage {
    #values = new Map();
    get length() { return this.#values.size; }
    key(index) { return [...this.#values.keys()][index] ?? null; }
    getItem(key) { return this.#values.has(String(key)) ? this.#values.get(String(key)) : null; }
    setItem(key, value) { this.#values.set(String(key), String(value)); }
    removeItem(key) { this.#values.delete(String(key)); }
    clear() { this.#values.clear(); }
    entries() { return [...this.#values.entries()]; }
}

function canvasStub() {
    return {
        width: 0,
        height: 0,
        getContext() {
            return {
                createImageData(width, height) {
                    return {width, height, data: new Uint8ClampedArray(width * height * 4)};
                },
                putImageData() {}
            };
        }
    };
}

function initializeMatureRealm() {
    state.activeProfileId = PROFILE_ID;
    state.playerName = "Fifty Year Audit";
    state.identity = createIdentityState({
        kingdomName: "Fifty Year Realm",
        dynastyName: "Royal House",
        foundedYear: 1
    });
    state.kingdomName = state.identity.kingdomName;
    state.royal.dynastyName = state.identity.dynastyName;
    state.legacy = createLegacyState({foundedYear: 1});
}

const round2 = value => Math.round((Number(value) || 0) * 100) / 100;

function storageStateFromEntries(entries) {
    return {
        cookies: [],
        origins: [{
            origin: ORIGIN,
            localStorage: Object.entries(entries).map(([name, value]) => ({name, value}))
        }]
    };
}

function liveSignature(snapshot) {
    return (snapshot.entities || []).filter(entity => !entity.dead)
        .map(entity => entity.id + ":" + entity.x + ":" + entity.y).join("|");
}

function projectForRoundtrip(snapshot) {
    const copy = JSON.parse(JSON.stringify(snapshot));
    delete copy.eventLog;
    delete copy.eventSequence;
    return copy;
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

function uiYear(value) {
    const match = /^YEAR\s+(\d+)$/.exec(value || "");
    return match ? Number(match[1]) : null;
}

function uiTick(value) {
    const parsed = Number(String(value || "").replace(/[^0-9]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
}

function assertFinite(value, label) {
    assert.ok(Number.isFinite(Number(value)), label + " must be finite, got " + value);
}

function validate(snapshot, label) {
    assert.equal(snapshot.hasStarted, true, label + ": the realm must be started");
    assert.equal(snapshot.frameFaulted, false, label + ": the game loop must not fault");
    assert.equal(snapshot.gameOver, false, label + ": the realm must not end");
    assert.equal(snapshot.gameSpeed, 4, label + ": speed must remain 4x");
    assert.equal(snapshot.isPaused, false, label + ": the live audit must not pause");
    assert.equal(snapshot.year, Math.floor(snapshot.tick / 400) + 1,
        label + ": year must follow the 400-tick calendar");
    assert.equal(uiYear(snapshot.ui.year), snapshot.year, label + ": calendar year must match state");
    const displayedTick = uiTick(snapshot.ui.tick);
    assert.ok(displayedTick !== null, label + ": SIM TICK must be readable");
    assert.ok(displayedTick <= snapshot.tick, label + ": SIM TICK must not run ahead of state");
    assert.ok(snapshot.tick - displayedTick <= MAX_UI_TICK_LAG,
        label + ": SIM TICK lag " + (snapshot.tick - displayedTick) + " exceeds the throttled HUD budget");
    assert.equal(snapshot.ui.season, snapshot.season, label + ": season must match state");
    assert.ok(snapshot.tick > 0, label + ": tick must advance");
    assertFinite(snapshot.morale, label + ": morale");
    assert.ok(snapshot.morale >= 0 && snapshot.morale <= 100, label + ": morale out of range");
    assertFinite(snapshot.legitimacy, label + ": legitimacy");
    assert.ok(snapshot.legitimacy >= 0 && snapshot.legitimacy <= 100, label + ": legitimacy out of range");
    for (const resource of ["wood", "stone", "gold", "food"]) {
        const raw = snapshot.rawResources?.[resource] ?? snapshot.resources[resource];
        assertFinite(raw, label + ": " + resource);
        assert.ok(raw >= 0, label + ": " + resource + " must be non-negative");
        assert.equal(snapshot.ui.resources[resource], Math.floor(raw),
            label + ": " + resource + " DOM must match simulation");
    }
    assert.ok(snapshot.eventLog <= 100, label + ": eventLog exceeds its cap");
    assert.ok(snapshot.personArchive <= 500, label + ": personArchive exceeds its cap");
    assert.ok(snapshot.cityNeedsHistory == null || snapshot.cityNeedsHistory <= 24,
        label + ": city needs history exceeds its cap");
    assert.ok(snapshot.economyHistory == null || snapshot.economyHistory <= 24,
        label + ": economy history exceeds its cap");
    assert.equal(snapshot.activeSites, 0, label + ": no open construction site may survive");
    assert.ok(snapshot.renderStats && Number.isFinite(snapshot.renderStats.fps),
        label + ": render stats must be present");
    assert.equal(snapshot.frameLimit, FRAME_LIMIT, label + ": frame limit must match the selected profile");
    assert.equal(snapshot.renderScale, RENDER_SCALE / 100, label + ": render scale must match the selected profile");
}

async function atomicJson(path, value) {
    await mkdir(dirname(path), {recursive: true});
    const temporary = path + ".tmp-" + process.pid;
    await writeFile(temporary, JSON.stringify(value, null, 2));
    await rename(temporary, path);
}

async function readJson(path) {
    try {
        return JSON.parse(await readFile(path, "utf8"));
    } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
    }
}

function progressOf(checkpoint) {
    return {
        schema: 1,
        seed: checkpoint.seed,
        blockYears: checkpoint.blockYears,
        targetYear: checkpoint.targetYear,
        completedBlocks: checkpoint.completedBlocks,
        totalBlocks: TOTAL_BLOCKS,
        startYear: checkpoint.startYear,
        finalYear: checkpoint.finalYear,
        finalTick: checkpoint.finalTick,
        sampleCount: checkpoint.samples.length,
        loadChecks: checkpoint.loadChecks.length,
        updatedAt: new Date().toISOString()
    };
}

async function writeCheckpoint(checkpoint) {
    await atomicJson(CHECKPOINT_PATH, checkpoint);
    await atomicJson(PROGRESS_PATH, progressOf(checkpoint));
}

async function buildFixture() {
    const previousDocument = globalThis.document;
    const previousStorage = globalThis.localStorage;
    try {
        globalThis.document = {createElement: () => canvasStub()};
        globalThis.localStorage = new MemoryStorage();
        createLocalProfile("Fifty Year Audit", PROFILE_ID);
        const campaign = runCampaign({
            seed: SEED,
            years: SAVE_YEARS,
            profile: "builder",
            era: "common-weal",
            onInitialized: initializeMatureRealm
        });
        assert.equal(campaign.ok, true, "the mature fixture campaign must be healthy");
        const savedSnapshot = createSaveSnapshot();
        writeLocalSave(PROFILE_ID, savedSnapshot);
        const entries = Object.fromEntries(globalThis.localStorage.entries());
        const storageState = storageStateFromEntries(entries);
        const fixture = {
            seed: SEED,
            saveYears: SAVE_YEARS,
            targetYears: YEARS,
            blockYears: BLOCK_YEARS,
            tick: state.tick,
            year: state.year,
            dayOfYear: state.dayOfYear,
            seasonIndex: state.seasonIndex,
            population: savedSnapshot.totalPopulation,
            entities: savedSnapshot.entities.filter(entity => !entity.dead).length,
            entitySignature: liveSignature(savedSnapshot),
            resources: Object.fromEntries(Object.entries(savedSnapshot.resources).map(([key, value]) => [key, round2(value)])),
            morale: round2(savedSnapshot.morale),
            legitimacy: round2(savedSnapshot.politics?.legitimacy),
            saveBytes: JSON.stringify(savedSnapshot).length,
            profileId: PROFILE_ID
        };
        const checkpoint = {
            version: 1,
            runId: new Date().toISOString().replace(/[:.]/g, "-"),
            baseUrl: BASE,
            origin: ORIGIN,
            seed: SEED,
            saveYears: SAVE_YEARS,
            targetYears: YEARS,
            blockYears: BLOCK_YEARS,
            startYear: state.year,
            startTick: state.tick,
            targetYear: state.year + YEARS,
            completedBlocks: 0,
            finalYear: state.year,
            finalTick: state.tick,
            fixture,
            savedSnapshot,
            storageState,
            samples: [],
            blocks: [],
            loadChecks: [],
            panel: null,
            populationPanel: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        await writeCheckpoint(checkpoint);
        return checkpoint;
    } finally {
        globalThis.document = previousDocument;
        globalThis.localStorage = previousStorage;
    }
}

async function loadCheckpoint() {
    const checkpoint = await readJson(CHECKPOINT_PATH);
    if (!checkpoint) return null;
    assert.equal(checkpoint.version, 1, "unsupported endurance checkpoint version");
    assert.equal(checkpoint.baseUrl, BASE, "checkpoint belongs to a different base URL");
    assert.equal(checkpoint.seed, SEED, "checkpoint uses a different seed");
    assert.equal(checkpoint.saveYears, SAVE_YEARS, "checkpoint uses different fixture years");
    assert.equal(checkpoint.targetYears, YEARS, "checkpoint uses a different target year count");
    assert.equal(checkpoint.blockYears, BLOCK_YEARS, "checkpoint uses different block years");
    assert.ok(checkpoint.savedSnapshot && checkpoint.storageState, "checkpoint must carry a save and browser state");
    return checkpoint;
}

async function startSession(storageState, fakeClock, label) {
    const browser = await chromium.launch({
        headless: true,
        executablePath: process.env.E2E_CHROMIUM_EXECUTABLE || undefined,
        args: [
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-background-timer-throttling",
            "--disable-backgrounding-occluded-windows",
            "--disable-renderer-backgrounding",
            "--disable-features=CalculateNativeWinOcclusion"
        ]
    });
    const context = await browser.newContext({
        viewport: {width: 1400, height: 900},
        reducedMotion: "reduce",
        storageState
    });
    const page = await context.newPage();
    const pageErrors = [];
    const consoleErrors = [];
    page.on("pageerror", error => pageErrors.push(error.stack || error.message));
    page.on("console", message => {
        if (message.type() === "error") consoleErrors.push(message.text());
    });
    const runFor = fakeClock
        ? milliseconds => page.clock.runFor(milliseconds)
        : milliseconds => page.waitForTimeout(milliseconds);
    if (fakeClock) await page.clock.install({time: CLOCK_START});
    await page.goto(BASE + "/?endurance=" + encodeURIComponent(label), {waitUntil: "domcontentloaded", timeout: 60000});
    await page.bringToFront();
    let title = "";
    for (let guard = 0; guard < 40 && title !== "KINGS & CARDS • Eternal Realm"; guard++) {
        await runFor(100);
        title = await page.title();
    }
    assert.equal(title, "KINGS & CARDS • Eternal Realm", "the game page must finish loading");
    return {browser, context, page, pageErrors, consoleErrors, runFor, fakeClock};
}

async function closeSession(session) {
    await session.browser.close().catch(() => {});
}

async function syncUi(session) {
    await session.page.evaluate(async () => {
        const {renderUI} = await import("./js/presentation/rendering/ui.js");
        renderUI();
    });
}

async function probe(session) {
    const {page, runFor} = session;
    const wasPaused = await page.evaluate(async () => {
        const {state} = await import("./js/core/state.js");
        const previous = state.isPaused;
        state.isPaused = true;
        return previous;
    });
    await runFor(200);
    await page.evaluate(async () => {
        const {renderUI} = await import("./js/presentation/rendering/ui.js");
        renderUI();
    });
    await runFor(600);
    const snapshot = await page.evaluate(async () => {
        const [{state}, {SEASONS}, {TYPE}, {renderUI}] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/core/config.js"),
            import("./js/core/types.js"),
            import("./js/presentation/rendering/ui.js")
        ]);
        const uiStarted = performance.now();
        renderUI();
        const renderUiMs = Math.round((performance.now() - uiStarted) * 10) / 10;
        const text = id => document.getElementById(id)?.textContent?.trim() ?? "";
        const number = value => Number(String(value).replace(/[^0-9.-]/g, ""));
        const uiResources = Object.fromEntries(["wood", "stone", "gold", "food"].map(resource => [
            resource,
            number(text("res-" + resource))
        ]));
        return {
            tick: state.tick,
            year: state.year,
            dayOfYear: state.dayOfYear,
            seasonIndex: state.seasonIndex,
            season: SEASONS[state.seasonIndex] || "SPRING",
            gameSpeed: state.gameSpeed,
            isPaused: state.isPaused,
            gameOver: state.gameOver,
            frameFaulted: Boolean(state.frameFaulted),
            hasStarted: state.hasStarted,
            population: state.entities.filter(entity => !entity.dead && entity.type === TYPE.VILLAGER).length,
            populationRegister: state.population?.totals ? {
                total: Number(state.population.totals.population) || 0,
                civilians: Number(state.population.totals.civilians) || 0,
                soldiers: Number(state.population.totals.soldiers) || 0,
                employed: Number(state.population.totals.employed) || 0,
                households: Number(state.population.totals.households) || 0
            } : null,
            entities: state.entities.length,
            entitySignature: state.entities.filter(entity => !entity.dead)
                .map(entity => entity.id + ":" + entity.x + ":" + entity.y).join("|"),
            rawResources: Object.fromEntries(Object.entries(state.resources || {}).map(([key, value]) => [
                key, Number(value) || 0
            ])),
            resources: Object.fromEntries(Object.entries(state.resources || {}).map(([key, value]) => [
                key, Math.round((Number(value) || 0) * 100) / 100
            ])),
            morale: Math.round((Number(state.morale) || 0) * 100) / 100,
            legitimacy: Math.round((Number(state.politics?.legitimacy) || 0) * 100) / 100,
            eventLog: state.eventLog.length,
            economyHistory: state.economy?.history?.length ?? null,
            personArchive: state.personArchive.length,
            cityNeedsHistory: state.city?.needs?.history?.length ?? null,
            activeSites: state.entities.filter(entity => !entity.dead && entity.isBuilding?.() &&
                entity.construction && Number(entity.construction.stage) < 3).length,
            renderedFrames: Number(state.renderedFrames) || 0,
            renderStats: state.renderStats ? {...state.renderStats} : null,
            renderScale: Number(state.renderScale) || 1,
            frameLimit: Number(state.frameLimit) || 0,
            canvasWidth: state.canvas?.width || 0,
            canvasHeight: state.canvas?.height || 0,
            lastDrawMs: Number(state.lastDrawMs) || 0,
            lastWorldDrawMs: Number(state.lastWorldDrawMs) || 0,
            lastUiRenderMs: Number(state.lastUiRenderMs) || 0,
            renderUiMs,
            terrainCacheHits: Number(state.terrainCacheHits) || 0,
            terrainCacheMisses: Number(state.terrainCacheMisses) || 0,
            terrainDecorationBuildMs: Number(state.terrainDecorationBuildMs) || 0,
            zoom: Number(state.zoom) || 0,
            zoomLevel: Number(state.zoomLevel) || 0,
            activeEvent: Boolean(state.activeEvent),
            ui: {
                year: text("year"),
                tick: text("tick-count"),
                season: text("season"),
                resources: uiResources
            }
        };
    });
    await page.evaluate(async previous => {
        const {state} = await import("./js/core/state.js");
        state.isPaused = previous;
    }, wasPaused);
    return {...snapshot, isPaused: wasPaused};
}

async function settleOverlays(session) {
    const {page, runFor} = session;
    for (let guard = 0; guard < 4; guard++) {
        const action = await page.evaluate(() => {
            const visible = element => {
                if (!element) return false;
                const style = getComputedStyle(element);
                return style.display !== "none" && style.visibility !== "hidden" &&
                    element.getClientRects().length > 0;
            };
            const modal = document.getElementById("realm-event-modal");
            if (visible(modal)) {
                const choice = modal.querySelector("#realm-event-choices .event-choice:not([disabled])");
                if (choice) { choice.click(); return "event-choice"; }
                const dismiss = modal.querySelector("#realm-event-dismiss");
                if (dismiss) { dismiss.click(); return "event-dismiss"; }
            }
            if (visible(document.getElementById("big-message-close"))) {
                document.getElementById("big-message-close").click();
                return "big-message";
            }
            return "none";
        });
        if (action === "none") return;
        await runFor(100);
    }
}

async function checkPanel(session) {
    const {page, runFor} = session;
    const wasPaused = await page.evaluate(async () => {
        const {state} = await import("./js/core/state.js");
        const previous = state.isPaused;
        state.isPaused = true;
        return previous;
    });
    await runFor(200);
    await settleOverlays(session);
    const opened = await page.evaluate(() => {
        const chip = document.querySelector('[data-kac-panel="resources"][data-resource-detail="gold"]');
        if (!chip) return false;
        chip.click();
        return true;
    });
    assert.equal(opened, true, "the resource chip must exist");
    await runFor(300);
    const panel = await page.evaluate(async () => {
        const {state} = await import("./js/core/state.js");
        const modal = document.getElementById("command-modal");
        const content = document.getElementById("command-panel-content");
        const visible = modal && getComputedStyle(modal).display !== "none" &&
            getComputedStyle(modal).visibility !== "hidden" && modal.getClientRects().length > 0;
        return {
            visible: Boolean(visible),
            title: document.getElementById("command-title")?.textContent?.trim() || "",
            text: content?.innerText?.replace(/\s+/g, " ").trim() || "",
            resources: {gold: Number(state.resources.gold) || 0, food: Number(state.resources.food) || 0}
        };
    });
    assert.equal(panel.visible, true, "the management panel must open from the resource chip");
    assert.match(panel.text, /GOLD/i, "the resource panel must show a gold entry");
    const gold = Math.floor(panel.resources.gold).toLocaleString("en-US");
    const food = Math.floor(panel.resources.food).toLocaleString("en-US");
    assert.ok(panel.text.includes(gold), "the resource panel must show the live gold value " + gold);
    assert.ok(panel.text.includes(food), "the resource panel must show the live food value " + food);
    await page.evaluate(() => document.getElementById("command-close")?.click());
    await runFor(100);
    await page.evaluate(async previous => {
        const {state} = await import("./js/core/state.js");
        state.isPaused = previous;
    }, wasPaused);
    return {title: panel.title, gold, food, textLength: panel.text.length};
}

async function openCommandTab(session, tab) {
    const {page, runFor} = session;
    const opened = await page.evaluate(tab => {
        const visible = element => {
            if (!element) return false;
            const style = getComputedStyle(element);
            return style.display !== "none" && style.visibility !== "hidden" &&
                element.getClientRects().length > 0;
        };
        if (!visible(document.getElementById("command-modal"))) {
            const chip = document.querySelector('[data-kac-panel="resources"][data-resource-detail="gold"]');
            if (!chip) return false;
            chip.click();
        }
        const button = document.querySelector('[data-command-tab="' + tab + '"]');
        if (!button) return false;
        button.click();
        return true;
    }, tab);
    assert.equal(opened, true, "the " + tab + " command tab must open");
    await runFor(300);
    return page.evaluate(() => {
        const modal = document.getElementById("command-modal");
        const content = document.getElementById("command-panel-content");
        const visible = modal && getComputedStyle(modal).display !== "none" &&
            getComputedStyle(modal).visibility !== "hidden" && modal.getClientRects().length > 0;
        return {
            visible: Boolean(visible),
            title: document.getElementById("command-title")?.textContent?.trim() || "",
            text: content?.innerText?.replace(/\s+/g, " ").trim() || ""
        };
    });
}

async function checkPopulationPanel(session, snapshot) {
    const {page, runFor} = session;
    const panel = await openCommandTab(session, "population");
    assert.equal(panel.visible, true, "the population panel must be visible");
    assert.match(panel.text, /CITIZENS/i, "the population panel must show the citizen count");
    assert.match(panel.text, /HOUSEHOLDS/i, "the population panel must show households");
    assert.match(panel.text, /EMPLOYED/i, "the population panel must show employed labour");
    assert.match(panel.text, /WORKERS/i, "the population panel must expose the worker filter");
    const citizensMatch = /CITIZENS\s+([\d,]+)/.exec(panel.text);
    const employedMatch = /EMPLOYED\s+([\d,]+)\s*\/\s*([\d,]+)/.exec(panel.text);
    assert.ok(citizensMatch, "the population panel must expose a numeric citizen total");
    assert.ok(employedMatch, "the population panel must expose employed / civilians");
    const citizens = Number(citizensMatch[1].replace(/,/g, ""));
    const employed = Number(employedMatch[1].replace(/,/g, ""));
    const civilians = Number(employedMatch[2].replace(/,/g, ""));
    const expectedPopulation = snapshot.populationRegister?.total ?? snapshot.population;
    assert.equal(citizens, expectedPopulation, "displayed citizen total must match the population register");
    assert.equal(employed, snapshot.populationRegister?.employed ?? employed,
        "displayed employed labour must match the population register");
    assert.equal(civilians, snapshot.populationRegister?.civilians ?? civilians,
        "displayed civilians must match the population register");
    assert.ok(employed >= 0 && employed <= civilians, "employed labour must be within the civilian workforce");
    await page.evaluate(() => document.getElementById("command-close")?.click());
    await runFor(100);
    return {title: panel.title, citizens, employed, civilians, textLength: panel.text.length};
}

async function loadRealm(session) {
    const {page, runFor} = session;
    let ready = false;
    for (let guard = 0; guard < 100 && !ready; guard++) {
        await runFor(100);
        ready = await page.evaluate(() => {
            const button = document.getElementById("continue-game-btn");
            return Boolean(button && !button.disabled && (button.textContent || "").includes("CONTINUE"));
        });
    }
    assert.equal(ready, true, "the mature save must offer a visible continue control");
    const loaded = await page.evaluate(async () => {
        const button = document.getElementById("continue-game-btn");
        if (!button) return {ok: false};
        const started = performance.now();
        button.click();
        const loadMs = Math.round((performance.now() - started) * 10) / 10;
        const {state} = await import("./js/core/state.js");
        state.isPaused = true;
        return {
            ok: state.hasStarted === true,
            loadMs,
            tick: state.tick,
            year: state.year,
            status: document.getElementById("status-message")?.textContent?.trim() || ""
        };
    });
    assert.equal(loaded.ok, true, "the visible continue path must load the realm");
    assert.match(loaded.status, /Loaded realm/i, "the visible load path must report success");
    await syncUi(session);
    await runFor(300);
    const snapshot = await probe(session);
    const savedSnapshot = await page.evaluate(async () => {
        const {createSaveSnapshot} = await import("./js/core/save-runtime.js");
        return createSaveSnapshot();
    });
    return {loaded, snapshot, savedSnapshot};
}

async function setSettings(session) {
    const {page, runFor} = session;
    await page.locator("#settings-btn").click();
    await page.locator("#settings-frame-limit").selectOption(String(FRAME_LIMIT));
    await page.locator("#settings-render-scale").selectOption(String(RENDER_SCALE));
    await page.locator("#settings-close").click();
    await page.locator("#speed-4").click();
    assert.ok(await page.locator("#speed-4").evaluate(element => element.classList.contains("is-active")),
        "the visible speed control must select 4x");
    await runFor(500);
}

function sampleOf(snapshot, label) {
    return {
        label,
        year: snapshot.year,
        tick: snapshot.tick,
        population: snapshot.population,
        entities: snapshot.entities,
        fps: snapshot.renderStats.fps,
        frameMs: snapshot.renderStats.frameMs,
        lastDrawMs: snapshot.lastDrawMs,
        lastUiRenderMs: snapshot.lastUiRenderMs,
        renderScale: snapshot.renderScale,
        resources: snapshot.resources,
        morale: snapshot.morale,
        legitimacy: snapshot.legitimacy,
        eventLog: snapshot.eventLog,
        economyHistory: snapshot.economyHistory,
        personArchive: snapshot.personArchive,
        cityNeedsHistory: snapshot.cityNeedsHistory,
        activeSites: snapshot.activeSites,
        ui: snapshot.ui
    };
}

async function runBlock(checkpoint, blockIndex) {
    const fromYear = checkpoint.finalYear;
    const fromTick = checkpoint.finalTick;
    const blockTargetYear = Math.min(checkpoint.targetYear, fromYear + checkpoint.blockYears);
    const startedAt = Date.now();
    const session = await startSession(checkpoint.storageState, true, "block-" + blockIndex);
    try {
        const {loaded, snapshot: loadedProbe, savedSnapshot: loadedSnapshot} = await loadRealm(session);
        assert.equal(loadedProbe.tick, checkpoint.finalTick,
            "block " + blockIndex + " loaded a different tick than the checkpoint");
        assert.equal(loadedProbe.year, checkpoint.finalYear,
            "block " + blockIndex + " loaded a different year than the checkpoint");
        const differences = snapshotDiff(projectForRoundtrip(checkpoint.savedSnapshot),
            projectForRoundtrip(loadedSnapshot));
        assert.deepEqual(differences, [],
            "block " + blockIndex + " checkpoint save must load exactly: " + differences.join("; "));
        const loadCheck = {
            block: blockIndex,
            loadedYear: loadedProbe.year,
            loadedTick: loadedProbe.tick,
            loadMs: loaded.loadMs,
            exact: true,
            diffCount: 0
        };

        // The loaded save carries the speed from its own last session. Put the
        // visible controls back on the audit profile before validating the
        // start sample, otherwise a legitimate 1x save fails as if the audit
        // had changed speed in flight.
        await setSettings(session);
        if (checkpoint.samples.length === 0) {
            const startProbe = await probe(session);
            const startSnapshot = {...startProbe, isPaused: false};
            validate(startSnapshot, "start");
            checkpoint.samples.push(sampleOf(startSnapshot, "start"));
        }

        await session.page.evaluate(async () => {
            const {state} = await import("./js/core/state.js");
            state.isPaused = false;
        });
        await session.runFor(500);
        await settleOverlays(session);
        await syncUi(session);
        let snapshot = await probe(session);
        validate(snapshot, "block-" + blockIndex + "-live");

        let chunks = 0;
        while (snapshot.year < blockTargetYear && chunks < MAX_CHUNKS_PER_BLOCK) {
            await session.runFor(20000);
            chunks++;
            await settleOverlays(session);
            await session.runFor(500);
            snapshot = await probe(session);
            if (snapshot.gameOver || snapshot.frameFaulted) {
                validate(snapshot, "block-" + blockIndex + "-chunk-" + chunks);
            }
        }
        assert.ok(chunks < MAX_CHUNKS_PER_BLOCK,
            "block " + blockIndex + " must reach year " + blockTargetYear + " inside its chunk budget");
        assert.ok(snapshot.year >= blockTargetYear,
            "block " + blockIndex + " must complete its target year");
        await syncUi(session);
        snapshot = await probe(session);
        validate(snapshot, "block-" + blockIndex + "-final");

        await session.page.evaluate(async () => {
            const {state} = await import("./js/core/state.js");
            state.isPaused = true;
        });
        await settleOverlays(session);
        const panel = blockTargetYear >= checkpoint.targetYear ? await checkPanel(session) : null;
        const populationPanel = blockTargetYear >= checkpoint.targetYear
            ? await checkPopulationPanel(session, snapshot) : null;
        const finalProbe = await probe(session);
        const finalValidation = {...finalProbe, isPaused: false};
        validate(finalValidation, "block-" + blockIndex + "-saved");

        const saveClicked = await session.page.evaluate(() => {
            const button = document.getElementById("save-btn");
            if (!button) return false;
            button.click();
            return true;
        });
        assert.equal(saveClicked, true, "the visible save control must exist");
        await session.runFor(100);
        const saveStatus = await session.page.evaluate(() =>
            document.getElementById("save-status")?.textContent?.trim() || "");
        assert.match(saveStatus, /LAST SAVED/i, "the save control must report a successful local write");
        const saved = await session.page.evaluate(async () => {
            const {state} = await import("./js/core/state.js");
            const {readLocalSave} = await import("./js/core/persistence.js");
            return {profileId: state.activeProfileId, envelope: readLocalSave(state.activeProfileId)};
        });
        assert.ok(saved.envelope && saved.envelope.snapshot, "the save control must write a real local envelope");
        const savedSnapshot = saved.envelope.snapshot;
        assert.ok(Number(savedSnapshot.saveSchemaVersion) >= 8, "the real save must carry a schema");
        assert.equal(savedSnapshot.year, finalProbe.year, "the save must stay in the final checked year");
        assert.deepEqual(session.pageErrors, [], "block " + blockIndex + " must have no page errors");
        assert.deepEqual(session.consoleErrors, [], "block " + blockIndex + " must have no console errors");
        const storageState = await session.context.storageState();
        const sample = sampleOf(finalProbe, "year-" + finalProbe.year);
        checkpoint.samples.push(sample);
        const block = {
            block: blockIndex,
            fromYear,
            fromTick,
            toYear: savedSnapshot.year,
            toTick: savedSnapshot.tick,
            chunks,
            loadMs: loaded.loadMs,
            durationSeconds: Math.round((Date.now() - startedAt) / 100) / 10,
            saveBytes: JSON.stringify(saved.envelope).length,
            saveSchema: Number(savedSnapshot.saveSchemaVersion),
            exactLoad: loadCheck.exact,
            panel,
            populationPanel
        };
        checkpoint.blocks.push(block);
        checkpoint.loadChecks.push(loadCheck);
        checkpoint.completedBlocks += 1;
        checkpoint.finalYear = savedSnapshot.year;
        checkpoint.finalTick = savedSnapshot.tick;
        checkpoint.savedSnapshot = savedSnapshot;
        checkpoint.storageState = storageState;
        checkpoint.panel = panel || checkpoint.panel;
        checkpoint.populationPanel = populationPanel || checkpoint.populationPanel;
        checkpoint.updatedAt = new Date().toISOString();
        await writeCheckpoint(checkpoint);
        console.log("ENDURANCE_BLOCK " + JSON.stringify({
            block: blockIndex,
            fromYear,
            toYear: savedSnapshot.year,
            tick: savedSnapshot.tick,
            chunks,
            samples: checkpoint.samples.length,
            loadMs: loaded.loadMs,
            saveBytes: block.saveBytes,
            exact: true
        }));
        return checkpoint;
    } finally {
        await closeSession(session);
    }
}

async function measurePerformance(checkpoint) {
    const session = await startSession(checkpoint.storageState, false, "final-performance");
    try {
        const {loaded, snapshot: loadedProbe, savedSnapshot} = await loadRealm(session);
        const differences = snapshotDiff(projectForRoundtrip(checkpoint.savedSnapshot),
            projectForRoundtrip(savedSnapshot));
        assert.deepEqual(differences, [],
            "final performance load must match the checkpoint save: " + differences.join("; "));
        assert.equal(loadedProbe.tick, checkpoint.finalTick, "performance load must retain the final tick");
        assert.equal(loadedProbe.year, checkpoint.finalYear, "performance load must retain the final year");
        await session.page.evaluate(async ({frameLimit, renderScale}) => {
            const {state} = await import("./js/core/state.js");
            state.isPaused = true;
            state.frameLimit = frameLimit;
            state.renderScale = renderScale;
            state.gameSpeed = 4;
        }, {frameLimit: FRAME_LIMIT, renderScale: RENDER_SCALE / 100});
        await session.page.waitForTimeout(500);
        await session.page.bringToFront();
        await session.page.waitForFunction(() => document.visibilityState === "visible", null, {timeout: 5000});
        await session.page.evaluate(async () => {
            const {state} = await import("./js/core/state.js");
            state.isPaused = false;
        });
        await session.page.waitForTimeout(1200);

        const readFrameStats = async () => session.page.evaluate(async () => {
            const {state} = await import("./js/core/state.js");
            return {
                tick: state.tick,
                year: state.year,
                gameOver: state.gameOver,
                frameFaulted: Boolean(state.frameFaulted),
                renderedFrames: Number(state.renderedFrames) || 0,
                renderStats: state.renderStats ? {...state.renderStats} : null,
                lastDrawMs: Number(state.lastDrawMs) || 0,
                lastWorldDrawMs: Number(state.lastWorldDrawMs) || 0,
                lastUiRenderMs: Number(state.lastUiRenderMs) || 0,
                renderUiMs: Number(state.renderUiMs) || 0,
                terrainCacheHits: Number(state.terrainCacheHits) || 0,
                terrainCacheMisses: Number(state.terrainCacheMisses) || 0,
                terrainDecorationBuildMs: Number(state.terrainDecorationBuildMs) || 0,
                renderScale: Number(state.renderScale) || 0,
                canvasWidth: state.canvas?.width || 0,
                canvasHeight: state.canvas?.height || 0,
                zoom: Number(state.zoom) || 0,
                zoomLevel: Number(state.zoomLevel) || 0
            };
        });
        let beforeFps = await readFrameStats();
        let wallStarted = Date.now();
        await session.page.waitForTimeout(3000);
        let afterFps = await readFrameStats();
        if (afterFps.renderedFrames <= beforeFps.renderedFrames) {
            await session.page.waitForTimeout(1000);
            beforeFps = await readFrameStats();
            wallStarted = Date.now();
            await session.page.waitForTimeout(3000);
            afterFps = await readFrameStats();
        }
        const wallSeconds = Math.max(0.001, (Date.now() - wallStarted) / 1000);
        const renderedDelta = afterFps.renderedFrames - beforeFps.renderedFrames;
        const measuredFps = renderedDelta / wallSeconds;
        assert.deepEqual(session.pageErrors, [], "performance context must have no page errors");
        assert.deepEqual(session.consoleErrors, [], "performance context must have no console errors");
        assert.ok(measuredFps >= FPS_MINIMUM,
            "fresh real-time context must stay above " + FPS_MINIMUM + " FPS (got " + measuredFps.toFixed(2) + ")");
        assert.ok(afterFps.lastDrawMs <= 16.7, "per-frame draw work must fit 16.7 ms");
        assert.ok(afterFps.lastUiRenderMs <= 16.7, "UI refresh must fit 16.7 ms");
        assert.equal(afterFps.gameOver, false, "the realm must not end during the frame sample");
        assert.equal(afterFps.frameFaulted, false, "the frame loop must not fault during the sample");
        assert.ok(afterFps.year >= checkpoint.targetYear, "the performance sample must run after the target year");
        return {
            resumedRealTime: true,
            freshContext: true,
            loadMs: Math.round(loaded.loadMs * 10) / 10,
            wallSeconds: Math.round(wallSeconds * 1000) / 1000,
            renderedFrames: renderedDelta,
            measuredFps: Math.round(measuredFps * 100) / 100,
            renderStats: afterFps.renderStats,
            frameLimit: FRAME_LIMIT,
            renderScale: RENDER_SCALE,
            actualRenderScale: afterFps.renderScale,
            canvasWidth: afterFps.canvasWidth,
            canvasHeight: afterFps.canvasHeight,
            lastDrawMs: afterFps.lastDrawMs,
            lastWorldDrawMs: afterFps.lastWorldDrawMs,
            lastUiRenderMs: afterFps.lastUiRenderMs,
            renderUiMs: afterFps.renderUiMs,
            terrainCacheHits: afterFps.terrainCacheHits,
            terrainCacheMisses: afterFps.terrainCacheMisses,
            terrainDecorationBuildMs: afterFps.terrainDecorationBuildMs,
            zoom: afterFps.zoom,
            zoomLevel: afterFps.zoomLevel,
            postLoad: true,
            continuedYear: afterFps.year,
            continuedTick: afterFps.tick,
            pageErrors: session.pageErrors,
            consoleErrors: session.consoleErrors
        };
    } finally {
        await closeSession(session);
    }
}

async function verifyLegacyRoundtrip(checkpoint) {
    const session = await startSession(checkpoint.storageState, false, "final-legacy-load");
    try {
        const {loaded, snapshot: loadedProbe, savedSnapshot} = await loadRealm(session);
        const currentDifferences = snapshotDiff(projectForRoundtrip(checkpoint.savedSnapshot),
            projectForRoundtrip(savedSnapshot));
        assert.deepEqual(currentDifferences, [],
            "final load must match the checkpoint save: " + currentDifferences.join("; "));
        const savedSchema = Number(savedSnapshot.saveSchemaVersion);
        const legacySnapshot = JSON.parse(JSON.stringify(savedSnapshot));
        legacySnapshot.saveSchemaVersion = 8;
        const legacyBytes = JSON.stringify(legacySnapshot).length;
        await session.page.evaluate(async ({profileId, snapshot}) => {
            const {writeLocalSave} = await import("./js/core/persistence.js");
            writeLocalSave(profileId, snapshot);
        }, {profileId: PROFILE_ID, snapshot: legacySnapshot});
        await session.page.reload({waitUntil: "domcontentloaded", timeout: 60000});
        await session.page.bringToFront();
        await session.page.waitForTimeout(600);
        const migrated = await loadRealm(session);
        assert.equal(migrated.snapshot.tick, checkpoint.finalTick, "migrated load must retain the final tick");
        assert.equal(migrated.snapshot.year, checkpoint.finalYear, "migrated load must retain the final year");
        const migratedSnapshot = migrated.savedSnapshot;
        const migratedSchema = Number(migratedSnapshot.saveSchemaVersion);
        assert.equal(migratedSchema, savedSchema, "migrated load must use the current schema");
        const differences = snapshotDiff(projectForRoundtrip(checkpoint.savedSnapshot),
            projectForRoundtrip(migratedSnapshot));
        assert.deepEqual(differences, [],
            "schema-8 browser round-trip must reproduce the full saved state: " + differences.join("; "));
        assert.deepEqual(session.pageErrors, [], "legacy-load context must have no page errors");
        assert.deepEqual(session.consoleErrors, [], "legacy-load context must have no console errors");
        return {
            storedSchema: 8,
            savedSchema,
            loadedSchema: migratedSchema,
            saveBytes: JSON.stringify(checkpoint.savedSnapshot).length,
            legacyBytes,
            loadMs: migrated.loaded.loadMs,
            loadStatus: migrated.loaded.status,
            exact: true,
            diffCount: 0,
            eventLog: migratedSnapshot.eventLog.length,
            saved: {
                year: checkpoint.finalYear,
                tick: checkpoint.finalTick,
                entities: checkpoint.savedSnapshot.entities.length,
                liveEntities: checkpoint.savedSnapshot.entities.filter(entity => !entity.dead).length,
                population: checkpoint.savedSnapshot.totalPopulation,
                register: Number(checkpoint.savedSnapshot.population?.totals?.population)
            },
            loaded: {
                year: migrated.snapshot.year,
                tick: migrated.snapshot.tick,
                entities: migrated.snapshot.entities,
                population: migrated.snapshot.population,
                register: migrated.snapshot.populationRegister?.total
            },
            pageErrors: session.pageErrors,
            consoleErrors: session.consoleErrors
        };
    } finally {
        await closeSession(session);
    }
}

function currentCommit() {
    try {
        return execFileSync("git", ["rev-parse", "HEAD"], {encoding: "utf8"}).trim();
    } catch {
        return null;
    }
}

function reportMarkdown(report) {
    const lines = [
        "# Kings & Cards — 50-Year Endurance Report",
        "",
        `- Generated: **${report.generatedAt}**`,
        `- Source commit: \`${report.sourceCommit || "unknown"}\``,
        `- Harness: \`${report.harness}\``,
        `- Seed: \`${report.config.seed}\``,
        `- Command: \`npm run test:endurance\``,
        "",
        "## Result",
        "",
        `**${report.ok ? "PASS" : "FAIL"}** — ${report.period.yearsPlayed} years played, ` +
            `year ${report.period.startYear} → ${report.period.finalYear}, ` +
            `${report.period.ticksAdvanced.toLocaleString("en-US")} ticks.`,
        "",
        "| Measure | Value |",
        "| --- | --- |",
        `| Period | year ${report.period.startYear} → ${report.period.finalYear} |`,
        `| Ticks | ${report.period.startTick.toLocaleString("en-US")} → ${report.period.finalTick.toLocaleString("en-US")} |`,
        `| Samples | ${report.sampleCount} |`,
        `| Population at end | ${report.final.population} |`,
        `| Entities at end | ${report.final.entities} |`,
        `| Morale / legitimacy | ${report.final.morale} / ${report.final.legitimacy} |`,
        `| Page errors | ${report.errors.pageCount} |`,
        `| Console errors | ${report.errors.consoleCount} |`,
        `| Save/load blocks exact | ${report.saveLoad.allBlockChecksExact ? "yes" : "no"} |`,
        `| Final legacy round-trip | ${report.saveLoad.final.exact ? "exact" : "failed"} |`,
        `| Fresh-context FPS | ${report.performance.measuredFps} |`,
        `| Fresh-context draw / UI | ${report.performance.lastDrawMs} ms / ${report.performance.lastUiRenderMs} ms |`,
        "",
        "## Save/load",
        "",
        `The final save was exported with schema \`${report.saveLoad.final.savedSchema}\`, ` +
            `downgraded to schema \`8\`, reloaded through the visible CONTINUE control and ` +
            `migrated back to schema \`${report.saveLoad.final.loadedSchema}\`; ` +
            `all ${report.saveLoad.final.diffCount} structural differences were empty.`,
        "",
        `Every one of the ${report.saveLoad.blockChecks.length} block checkpoints loaded exactly.`,
        "",
        "## Blocks",
        "",
        "| Block | Years | Ticks | Load ms | Save bytes | Exact |",
        "| --- | --- | --- | --- | --- | --- |",
        ...report.blocks.map(block =>
            `| ${block.block} | ${block.fromYear} → ${block.toYear} | ${block.toTick.toLocaleString("en-US")} | ` +
            `${block.loadMs} | ${block.saveBytes.toLocaleString("en-US")} | ${block.exactLoad ? "yes" : "no"} |`),
        "",
        "## Method",
        "",
        "Each five-year block is a real browser session. It loads the previous save through",
        "the visible continue control, compares the complete restored snapshot with the",
        "checkpoint, plays at 4× with the shipped low-end profile, saves through the visible",
        "save control and atomically writes a checkpoint. The final performance sample runs",
        "in a separate foreground real-time context. The archived JSON contains every sample",
        "and every load check.",
        ""
    ];
    return lines.join("\n");
}

async function finalize(checkpoint) {
    const performance = await measurePerformance(checkpoint);
    const legacy = await verifyLegacyRoundtrip(checkpoint);
    const pageErrors = [...performance.pageErrors, ...legacy.pageErrors];
    const consoleErrors = [...performance.consoleErrors, ...legacy.consoleErrors];
    assert.deepEqual(pageErrors, [], "the final verification must have no page errors");
    assert.deepEqual(consoleErrors, [], "the final verification must have no console errors");
    assert.ok(checkpoint.finalYear - checkpoint.startYear >= YEARS,
        "the run must play at least " + YEARS + " years");
    assert.equal(checkpoint.completedBlocks, TOTAL_BLOCKS, "the run must complete every block");
    assert.ok(checkpoint.samples.length >= TOTAL_BLOCKS, "the run must keep every block sample");
    assert.ok(checkpoint.loadChecks.every(check => check.exact), "every block checkpoint must load exactly");
    const allBlocksExact = checkpoint.loadChecks.length === TOTAL_BLOCKS &&
        checkpoint.loadChecks.every(check => check.exact);
    assert.equal(allBlocksExact, true, "every block must have an exact load check");
    const finalSnapshot = checkpoint.savedSnapshot;
    const report = {
        schema: 1,
        ok: true,
        harness: "tests/browser/endurance-50y.mjs",
        generatedAt: new Date().toISOString(),
        sourceCommit: currentCommit(),
        config: {
            seed: checkpoint.seed,
            saveYears: checkpoint.saveYears,
            targetYears: checkpoint.targetYears,
            blockYears: checkpoint.blockYears,
            seedProfile: PROFILE_ID,
            frameLimit: FRAME_LIMIT,
            renderScale: RENDER_SCALE,
            fpsMinimum: FPS_MINIMUM
        },
        period: {
            startYear: checkpoint.startYear,
            finalYear: checkpoint.finalYear,
            yearsPlayed: checkpoint.finalYear - checkpoint.startYear,
            startTick: checkpoint.startTick,
            finalTick: checkpoint.finalTick,
            ticksAdvanced: checkpoint.finalTick - checkpoint.startTick
        },
        final: {
            year: finalSnapshot.year,
            tick: finalSnapshot.tick,
            dayOfYear: finalSnapshot.dayOfYear,
            seasonIndex: finalSnapshot.seasonIndex,
            population: finalSnapshot.totalPopulation,
            entities: finalSnapshot.entities.length,
            liveEntities: finalSnapshot.entities.filter(entity => !entity.dead).length,
            resources: Object.fromEntries(Object.entries(finalSnapshot.resources || {})
                .map(([key, value]) => [key, round2(value)])),
            morale: round2(finalSnapshot.morale),
            legitimacy: round2(finalSnapshot.politics?.legitimacy),
            saveSchema: Number(finalSnapshot.saveSchemaVersion)
        },
        samples: checkpoint.samples,
        sampleCount: checkpoint.samples.length,
        blocks: checkpoint.blocks,
        saveLoad: {
            blockChecks: checkpoint.loadChecks,
            allBlockChecksExact: allBlocksExact,
            final: legacy
        },
        errors: {
            pageCount: pageErrors.length,
            consoleCount: consoleErrors.length,
            page: pageErrors,
            console: consoleErrors
        },
        performance: {
            resumedRealTime: performance.resumedRealTime,
            freshContext: performance.freshContext,
            loadMs: performance.loadMs,
            wallSeconds: performance.wallSeconds,
            renderedFrames: performance.renderedFrames,
            measuredFps: performance.measuredFps,
            renderStats: performance.renderStats,
            frameLimit: performance.frameLimit,
            renderScale: performance.renderScale,
            actualRenderScale: performance.actualRenderScale,
            canvasWidth: performance.canvasWidth,
            canvasHeight: performance.canvasHeight,
            lastDrawMs: performance.lastDrawMs,
            lastWorldDrawMs: performance.lastWorldDrawMs,
            lastUiRenderMs: performance.lastUiRenderMs,
            renderUiMs: performance.renderUiMs,
            terrainCacheHits: performance.terrainCacheHits,
            terrainCacheMisses: performance.terrainCacheMisses,
            terrainDecorationBuildMs: performance.terrainDecorationBuildMs,
            zoom: performance.zoom,
            zoomLevel: performance.zoomLevel,
            postLoad: performance.postLoad,
            continuedYear: performance.continuedYear,
            continuedTick: performance.continuedTick
        },
        panels: {
            management: checkpoint.panel,
            population: checkpoint.populationPanel
        },
        fixture: checkpoint.fixture
    };
    await mkdir(REPORT_DIR, {recursive: true});
    await atomicJson(REPORT_JSON, report);
    await writeFile(REPORT_MD, reportMarkdown(report));
    await atomicJson(resolve(OUT, "browser-endurance-50y.json"), report);
    console.log("BROWSER_ENDURANCE " + JSON.stringify({
        ok: true,
        seed: report.config.seed,
        period: report.period,
        sampleCount: report.sampleCount,
        blocks: report.blocks.length,
        saveLoad: {
            allBlockChecksExact: report.saveLoad.allBlockChecksExact,
            final: {
                storedSchema: report.saveLoad.final.storedSchema,
                savedSchema: report.saveLoad.final.savedSchema,
                loadedSchema: report.saveLoad.final.loadedSchema,
                exact: report.saveLoad.final.exact,
                loadMs: report.saveLoad.final.loadMs
            }
        },
        errors: {pageCount: report.errors.pageCount, consoleCount: report.errors.consoleCount},
        performance: report.performance,
        report: "reports/endurance-50y.json"
    }));
    return report;
}

async function main() {
    await mkdir(STATE_DIR, {recursive: true});
    let checkpoint = await loadCheckpoint();
    if (!checkpoint) {
        console.log("ENDURANCE_FIXTURE building " + SAVE_YEARS + "-year realm");
        checkpoint = await buildFixture();
        console.log("ENDURANCE_FIXTURE " + JSON.stringify(checkpoint.fixture));
    } else {
        console.log("ENDURANCE_RESUME " + JSON.stringify(progressOf(checkpoint)));
    }
    const initialCompleted = checkpoint.completedBlocks;
    let blocksThisProcess = 0;
    while (checkpoint.completedBlocks < TOTAL_BLOCKS && checkpoint.finalYear < checkpoint.targetYear) {
        checkpoint = await runBlock(checkpoint, checkpoint.completedBlocks);
        blocksThisProcess++;
        if (MAX_BLOCKS_PER_PROCESS > 0 && blocksThisProcess >= MAX_BLOCKS_PER_PROCESS) {
            console.log("ENDURANCE_BLOCK_BUDGET " + JSON.stringify({
                completedBlocks: checkpoint.completedBlocks,
                initialCompleted,
                totalBlocks: TOTAL_BLOCKS,
                finalYear: checkpoint.finalYear,
                finalTick: checkpoint.finalTick,
                resumeCommand: "npm run test:endurance"
            }));
            return;
        }
    }
    await finalize(checkpoint);
}

try {
    await main();
} catch (error) {
    const failure = {
        ok: false,
        generatedAt: new Date().toISOString(),
        error: error.stack || error.message,
        checkpointPath: CHECKPOINT_PATH,
        checkpoint: await readJson(CHECKPOINT_PATH).then(checkpoint => checkpoint ? progressOf(checkpoint) : null).catch(() => null)
    };
    await atomicJson(resolve(OUT, "browser-endurance-50y-failure.json"), failure).catch(() => {});
    console.error("BROWSER_ENDURANCE_FAILED " + JSON.stringify(failure, null, 2));
    throw error;
}
