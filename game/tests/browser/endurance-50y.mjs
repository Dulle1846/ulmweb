// Real-browser endurance audit.
//
// A mature 25-year realm is produced by the shipped campaign player, written
// through the same local-save envelope as the browser, then loaded through the
// visible "CONTINUE LAST REALM" control. The audit advances the normal game
// loop with Playwright's fake clock at 4x, samples the live state and DOM every
// five years, then performs a real save, writes the same state with the
// previous schema through the real adapter, reloads, loads it through the
// visible continue control, compares the complete simulation state, checks the
// management/population panels and continues for another year before the
// real-time frame-rate sample.
//
// The fake clock changes only time, not simulation rules. All player-visible
// actions (continue, settings, speed, event choices, management panel) go
// through the real controls. This is deliberately not part of `npm test`: it
// needs Chromium and is a long-running hardware check.
import assert from "node:assert/strict";
import {mkdir, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {chromium} from "playwright";
import {runCampaign} from "../campaign/campaign-driver.mjs";
import {state} from "../../js/core/state.js";
import {createSaveSnapshot} from "../../js/core/save-runtime.js";
import {createIdentityState} from "../../js/systems/identity.js";
import {createLegacyState} from "../../js/systems/legacy.js";
import {createLocalProfile, writeLocalSave} from "../../js/core/persistence.js";

const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const SEED = Number(process.env.ENDURANCE_SEED || 20261108);
const SAVE_YEARS = Math.max(5, Number(process.env.ENDURANCE_SAVE_YEARS || 25));
const YEARS = Math.max(1, Number(process.env.ENDURANCE_YEARS || 50));
const SAMPLE_EVERY = Math.max(1, Number(process.env.ENDURANCE_SAMPLE_YEARS || 5));
// The audit uses the shipped low-end profile: a 30 FPS render cap and 50%
// internal resolution. Simulation runs at 4x; only presentation detail is low.
const FRAME_LIMIT = Number(process.env.ENDURANCE_FRAME_LIMIT || 30);
const RENDER_SCALE = Number(process.env.ENDURANCE_RENDER_SCALE || 50);
const PROFILE_ID = "browser-endurance-audit";
const OUT = resolve(process.cwd(), "..", "artifacts");
const MAX_CHUNKS = Math.max(100, YEARS * 20 + 100);
const TICK_MS = 400 * 750 / 4; // one game year at 4x
await mkdir(OUT, {recursive: true});

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

function makeCanvasStub() {
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

// Build the fixture with the real driver and write it through the real local
// save adapter. The browser receives the resulting storage entries verbatim.
const previousDocument = globalThis.document;
const previousStorage = globalThis.localStorage;
let entries;
let fixture;
try {
    globalThis.document = {createElement: () => makeCanvasStub()};
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
    const snapshot = createSaveSnapshot();
    writeLocalSave(PROFILE_ID, snapshot);
    entries = Object.fromEntries(globalThis.localStorage.entries());
    const liveEntities = snapshot.entities.filter(entity => !entity.dead);
    const round2 = value => Math.round((Number(value) || 0) * 100) / 100;
    fixture = {
        tick: state.tick,
        year: state.year,
        dayOfYear: state.dayOfYear,
        seasonIndex: state.seasonIndex,
        population: snapshot.totalPopulation,
        entities: liveEntities.length,
        entitySignature: liveEntities.map(entity => entity.id + ":" + entity.x + ":" + entity.y).join("|"),
        resources: Object.fromEntries(Object.entries(snapshot.resources).map(([key, value]) => [key, round2(value)])),
        morale: round2(state.morale),
        legitimacy: round2(state.politics?.legitimacy),
        saveBytes: JSON.stringify(snapshot).length,
        profileId: PROFILE_ID
    };
} finally {
    globalThis.document = previousDocument;
    globalThis.localStorage = previousStorage;
}

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
const page = await browser.newPage({viewport: {width: 1400, height: 900}, reducedMotion: "reduce"});
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", error => pageErrors.push(error.stack || error.message));
page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
});

const report = {
    seed: SEED,
    fixture,
    started: null,
    samples: [],
    final: null,
    panel: null,
    finalLoad: null,
    loadedPanel: null,
    populationPanel: null,
    continued: null,
    frameSeries: null,
    performance: null,
    pageErrors,
    consoleErrors
};

async function runFor(ms) {
    await page.clock.runFor(ms);
}

async function evalPage(fn, arg) {
    return page.evaluate(fn, arg);
}

async function syncUi() {
    // The simulation can advance one tick between presentation frames at 4x.
    // Force the normal renderer once before an exact checkpoint comparison; this
    // is a read-only UI refresh, not a simulation shortcut.
    await evalPage(async () => {
        const {renderUI} = await import("./js/presentation/rendering/ui.js");
        renderUI();
    });
}

async function probe() {
    return evalPage(async () => {
        const [{state}, {SEASONS}, {TYPE}, {renderUI}] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/core/config.js"),
            import("./js/core/types.js"),
            import("./js/presentation/rendering/ui.js")
        ]);
        // Render and read in the same task so a frame cannot advance the
        // simulation between the DOM update and this consistency probe.
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
    assert.equal(uiTick(snapshot.ui.tick), snapshot.tick, label + ": SIM TICK must match state");
    assert.equal(snapshot.ui.season, snapshot.season, label + ": season must match state");
    assert.ok(snapshot.tick > 0, label + ": tick must advance");
    assertFinite(snapshot.morale, label + ": morale");
    assert.ok(snapshot.morale >= 0 && snapshot.morale <= 100, label + ": morale out of range");
    assertFinite(snapshot.legitimacy, label + ": legitimacy");
    assert.ok(snapshot.legitimacy >= 0 && snapshot.legitimacy <= 100, label + ": legitimacy out of range");
    for (const resource of ["wood", "stone", "gold", "food"]) {
        assertFinite(snapshot.resources[resource], label + ": " + resource);
        assert.ok(snapshot.resources[resource] >= 0, label + ": " + resource + " must be non-negative");
        assert.equal(snapshot.ui.resources[resource], Math.floor(snapshot.resources[resource]),
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

function uiTickNumber(value) {
    const parsed = Number(String(value || "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
}

const round2 = value => Math.round((Number(value) || 0) * 100) / 100;

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

async function settleOverlays() {
    for (let guard = 0; guard < 4; guard++) {
        const action = await evalPage(() => {
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

async function checkPanel(snapshot) {
    await settleOverlays();
    const opened = await evalPage(() => {
        const chip = document.querySelector('[data-kac-panel="resources"][data-resource-detail="gold"]');
        if (!chip) return false;
        chip.click();
        return true;
    });
    assert.equal(opened, true, "the resource chip must exist");
    await runFor(300);
    const panel = await evalPage(() => {
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
    assert.equal(panel.visible, true, "the management panel must open from the resource chip");
    assert.match(panel.text, /GOLD/i, "the resource panel must show a gold entry");
    const gold = Math.floor(snapshot.resources.gold).toLocaleString("en-US");
    const food = Math.floor(snapshot.resources.food).toLocaleString("en-US");
    assert.ok(panel.text.includes(gold), "the resource panel must show the live gold value " + gold);
    assert.ok(panel.text.includes(food), "the resource panel must show the live food value " + food);
    await evalPage(() => document.getElementById("command-close")?.click());
    await runFor(100);
    return {title: panel.title, gold, food, textLength: panel.text.length};
}

async function readPanel() {
    return evalPage(() => {
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

async function openCommandTab(tab) {
    const opened = await evalPage(tab => {
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
    return readPanel();
}

async function checkPopulationPanel(snapshot) {
    const panel = await openCommandTab("population");
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
    await evalPage(() => document.getElementById("command-close")?.click());
    await runFor(100);
    return {title: panel.title, citizens, employed, civilians, textLength: panel.text.length};
}

try {
    await page.addInitScript(values => {
        if (sessionStorage.getItem("kac-endurance-seeded") === "1") return;
        for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
        sessionStorage.setItem("kac-endurance-seeded", "1");
    }, entries);
    await page.clock.install({time: new Date("2026-01-01T00:00:00Z")});
    await page.goto(BASE + "/", {waitUntil: "domcontentloaded", timeout: 60000});
    await page.bringToFront();
    await runFor(600);
    assert.equal(await page.title(), "KINGS & CARDS • Eternal Realm");
    assert.equal(await page.locator("#start-screen").isVisible(), true);

    const continueButton = page.locator("#continue-game-btn");
    assert.equal(await continueButton.isEnabled(), true, "the injected mature save must be loadable");
    assert.match(await continueButton.innerText(), /CONTINUE LAST REALM/);
    // Click and pause in the same page task. The continue handler loads the
    // realm synchronously and starts the loop; without this pause a movement
    // frame can run before the exact round-trip probe and shift carriers by a
    // fraction of a tile even though the tick is unchanged.
    const loadClicked = await evalPage(async () => {
        const button = document.getElementById("continue-game-btn");
        if (!button) return false;
        button.click();
        const {state} = await import("./js/core/state.js");
        state.isPaused = true;
        return state.hasStarted === true;
    });
    assert.equal(loadClicked, true, "the visible continue path must load the realm");
    await syncUi();
    const loadedProbe = await probe();
    assert.equal(loadedProbe.hasStarted, true);
    assert.equal(loadedProbe.tick, fixture.tick, "the browser load must retain the saved tick");
    assert.equal(loadedProbe.year, fixture.year, "the browser load must retain the saved year");
    assert.equal(loadedProbe.dayOfYear, fixture.dayOfYear, "the browser load must retain the saved day");
    assert.equal(loadedProbe.seasonIndex, fixture.seasonIndex, "the browser load must retain the saved season");
    assert.deepEqual(loadedProbe.resources, fixture.resources, "the browser load must retain every resource");
    assert.equal(loadedProbe.morale, fixture.morale, "the browser load must retain morale");
    assert.equal(loadedProbe.legitimacy, fixture.legitimacy, "the browser load must retain legitimacy");
    assert.equal(loadedProbe.population, fixture.population, "the browser load must retain population");
    assert.equal(loadedProbe.entities, fixture.entities, "the browser load must retain every live entity");
    assert.equal(loadedProbe.entitySignature, fixture.entitySignature, "the browser load must retain entity ids and coordinates");
    report.loaded = loadedProbe;
    report.started = loadedProbe;
    await evalPage(async () => {
        const {state} = await import("./js/core/state.js");
        state.isPaused = false;
    });
    await runFor(500);
    await settleOverlays();
    await syncUi();
    const loadDebug = await evalPage(async () => {
        const {state} = await import("./js/core/state.js");
        return {
            status: document.getElementById("status-message")?.textContent?.trim() || "",
            startClasses: document.getElementById("start-screen")?.className || "",
            hasStarted: state.hasStarted,
            tick: state.tick,
            year: state.year,
            activeProfileId: state.activeProfileId || null,
            playerName: state.playerName || null
        };
    });
    report.loadDebug = loadDebug;
    assert.equal(await page.locator("#start-screen").isVisible(), false,
        "loading must leave the start screen: " + JSON.stringify(loadDebug));
    const started = loadedProbe;

    await page.locator("#settings-btn").click();
    await page.locator("#settings-frame-limit").selectOption(String(FRAME_LIMIT));
    await page.locator("#settings-render-scale").selectOption(String(RENDER_SCALE));
    await page.locator("#settings-close").click();
    await page.locator("#speed-4").click();
    assert.ok(await page.locator("#speed-4").evaluate(element => element.classList.contains("is-active")),
        "the visible speed control must select 4x");
    await runFor(500);
    await syncUi();

    const targetYear = started.year + YEARS;
    let snapshot = await probe();
    validate(snapshot, "start");
    report.samples.push({label: "start", year: snapshot.year, tick: snapshot.tick,
        population: snapshot.population, fps: snapshot.renderStats.fps,
        frameMs: snapshot.renderStats.frameMs, lastDrawMs: snapshot.lastDrawMs,
        lastUiRenderMs: snapshot.lastUiRenderMs, renderScale: snapshot.renderScale,
        resources: snapshot.resources, ui: snapshot.ui});
    let sampledYear = snapshot.year;
    let chunks = 0;

    while (snapshot.year < targetYear && chunks < MAX_CHUNKS) {
        await runFor(20000);
        chunks++;
        await settleOverlays();
        await runFor(500);
        snapshot = await probe();
        if (snapshot.gameOver || snapshot.frameFaulted) {
            validate(snapshot, "chunk-" + chunks);
        }
        if (snapshot.year - sampledYear >= SAMPLE_EVERY || snapshot.year >= targetYear) {
            await syncUi();
            snapshot = await probe();
            const label = "year-" + snapshot.year;
            validate(snapshot, label);
            report.samples.push({
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
            });
            sampledYear = snapshot.year;
        }
    }

    assert.ok(chunks < MAX_CHUNKS, "the 4x loop must reach the target year before the chunk budget");
    assert.ok(snapshot.year >= targetYear, "the browser must complete " + YEARS + " years");
    await syncUi();
    snapshot = await probe();
    validate(snapshot, "final");
    report.final = snapshot;
    report.panel = await checkPanel(snapshot);

    // ---- real save, downgraded schema, reload and real load path ----
    const saveClicked = await evalPage(() => {
        const button = document.getElementById("save-btn");
        if (!button) return false;
        button.click();
        return true;
    });
    assert.equal(saveClicked, true, "the visible save control must exist");
    const saveStatus = await evalPage(() => document.getElementById("save-status")?.textContent?.trim() || "");
    assert.match(saveStatus, /LAST SAVED/i, "the save control must report a successful local write");
    const saved = await evalPage(async () => {
        const {state} = await import("./js/core/state.js");
        const {readLocalSave} = await import("./js/core/persistence.js");
        return {
            profileId: state.activeProfileId,
            envelope: readLocalSave(state.activeProfileId)
        };
    });
    assert.ok(saved.envelope && saved.envelope.snapshot, "the save control must write a real local envelope");
    const savedSnapshot = saved.envelope.snapshot;
    const savedSchema = Number(savedSnapshot.saveSchemaVersion);
    const saveBytes = JSON.stringify(saved.envelope).length;
    const snapshotBytes = JSON.stringify(savedSnapshot).length;
    assert.ok(Number.isInteger(savedSchema) && savedSchema >= 8, "the real save must carry a schema");
    // The management-panel check runs the normal UI for 400 ms; at 4x this can
    // advance the simulation a few ticks after the final sample. The round-trip
    // must be exact against the state actually written by the save button.
    assert.ok(savedSnapshot.year - started.year >= YEARS, "the real save must be written after the requested years");
    assert.equal(savedSnapshot.year, snapshot.year, "the save must remain in the final checked year");
    const savedLive = (savedSnapshot.entities || []).filter(entity => !entity.dead);
    assert.ok(savedLive.length > 0, "the saved realm must contain live entities");

    // Write the exact same state through the real save adapter with the
    // previous schema number. This forces prepareSaveSnapshot's migration on
    // the real CONTINUE path rather than testing a synthetic direct restore.
    const legacySnapshot = JSON.parse(JSON.stringify(savedSnapshot));
    legacySnapshot.saveSchemaVersion = 8;
    const legacyBytes = JSON.stringify(legacySnapshot).length;
    await evalPage(async ({profileId, snapshot}) => {
        const {writeLocalSave} = await import("./js/core/persistence.js");
        writeLocalSave(profileId, snapshot);
    }, {profileId: saved.profileId, snapshot: legacySnapshot});

    await page.reload({waitUntil: "domcontentloaded", timeout: 60000});
    await page.bringToFront();
    let clockAfterReload = true;
    try {
        await runFor(600);
    } catch {
        clockAfterReload = false;
        await page.waitForTimeout(600);
    }
    assert.equal(await page.title(), "KINGS & CARDS • Eternal Realm");
    assert.equal(await page.locator("#start-screen").isVisible(), true,
        "reload must return to the start screen");
    const finalContinue = page.locator("#continue-game-btn");
    assert.equal(await finalContinue.isEnabled(), true,
        "the real downgraded save must remain loadable after reload");
    const finalLoad = await evalPage(async () => {
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
    assert.equal(finalLoad.ok, true, "reload + continue must load the migrated save");
    assert.match(finalLoad.status, /Loaded realm/i, "the real load path must report success");
    await syncUi();
    const finalLoadedProbe = await probe();
    const finalLoadedSnapshot = await evalPage(async () => {
        const {createSaveSnapshot} = await import("./js/core/save-runtime.js");
        return createSaveSnapshot();
    });
    const loadedNonFinite = await evalPage(async () => {
        const {createSaveSnapshot} = await import("./js/core/save-runtime.js");
        const snapshot = createSaveSnapshot();
        const found = [];
        const walk = (value, path) => {
            if (found.length >= 20) return;
            if (typeof value === "number" && !Number.isFinite(value)) {
                found.push(path + ": " + String(value));
                return;
            }
            if (!value || typeof value !== "object") return;
            if (Array.isArray(value)) {
                value.forEach((item, index) => walk(item, path + "[" + index + "]"));
                return;
            }
            for (const [key, child] of Object.entries(value)) walk(child, path + "." + key);
        };
        walk(snapshot, "snapshot");
        return found;
    });
    assert.deepEqual(loadedNonFinite, [], "the loaded state must contain no NaN/Infinity");
    const loadedSchema = Number(finalLoadedSnapshot.saveSchemaVersion);
    assert.equal(loadedSchema, savedSchema, "the migrated load must use the current snapshot schema");
    assert.equal(finalLoadedProbe.tick, savedSnapshot.tick, "loaded tick must equal the saved tick");
    assert.equal(finalLoadedProbe.year, savedSnapshot.year, "loaded year must equal the saved year");
    assert.equal(finalLoadedProbe.dayOfYear, savedSnapshot.dayOfYear, "loaded day must equal the saved day");
    assert.equal(finalLoadedProbe.seasonIndex, savedSnapshot.seasonIndex, "loaded season must equal the saved season");
    assert.deepEqual(finalLoadedProbe.resources, Object.fromEntries(Object.entries(savedSnapshot.resources || {}).map(([key, value]) => [key, round2(value)])),
        "loaded resources must equal the saved resources");
    assert.equal(finalLoadedProbe.morale, round2(savedSnapshot.morale), "loaded morale must equal the saved morale");
    assert.equal(finalLoadedProbe.legitimacy, round2(savedSnapshot.politics?.legitimacy), "loaded legitimacy must equal the saved legitimacy");
    assert.equal(finalLoadedProbe.population, savedSnapshot.totalPopulation, "loaded villagers must equal the saved villager count");
    assert.equal(finalLoadedProbe.populationRegister.total, Number(savedSnapshot.population?.totals?.population),
        "loaded registered citizens must equal the saved citizen register");
    assert.equal(finalLoadedProbe.populationRegister.civilians, Number(savedSnapshot.population?.totals?.civilians),
        "loaded civilians must equal the saved civilian register");
    assert.equal(finalLoadedProbe.populationRegister.soldiers, Number(savedSnapshot.population?.totals?.soldiers),
        "loaded soldiers must equal the saved soldier register");
    assert.equal(finalLoadedProbe.populationRegister.employed, Number(savedSnapshot.population?.totals?.employed),
        "loaded employed citizens must equal the saved employed register");
    assert.equal(finalLoadedProbe.entities, savedSnapshot.entities.length, "loaded entity count must equal the saved entity count");
    assert.equal(finalLoadedProbe.entitySignature, liveSignature(savedSnapshot), "loaded entity ids and coordinates must equal the saved entities");
    assert.equal(finalLoadedProbe.gameSpeed, 4, "loaded game speed must equal the saved speed");
    assert.equal(uiYear(finalLoadedProbe.ui.year), savedSnapshot.year, "the year display must match the loaded state");
    assert.equal(uiTickNumber(finalLoadedProbe.ui.tick), savedSnapshot.tick, "the tick display must match the loaded state");
    assert.equal(finalLoadedProbe.ui.season, finalLoadedProbe.season, "the season display must match the loaded state");
    for (const resource of ["wood", "stone", "gold", "food"]) {
        assert.equal(finalLoadedProbe.ui.resources[resource], Math.floor(finalLoadedProbe.resources[resource]),
            "the loaded " + resource + " display must match the loaded state");
    }
    assert.equal(finalLoadedProbe.gameOver, false, "loading must not end the realm");
    assert.equal(finalLoadedProbe.frameFaulted, false, "loading must not fault the frame loop");
    for (const entity of savedSnapshot.entities) {
        assert.ok(Number.isFinite(Number(entity.x)) && Number.isFinite(Number(entity.y)),
            "saved entity " + entity.id + " must have finite coordinates");
        assert.ok(entity.x >= 0 && entity.y >= 0 && entity.x < 176 && entity.y < 176,
            "saved entity " + entity.id + " must stay inside the world");
    }
    for (const entity of finalLoadedSnapshot.entities) {
        assert.ok(Number.isFinite(Number(entity.x)) && Number.isFinite(Number(entity.y)),
            "loaded entity " + entity.id + " must have finite coordinates");
        assert.ok(entity.x >= 0 && entity.y >= 0 && entity.x < 176 && entity.y < 176,
            "loaded entity " + entity.id + " must stay inside the world");
    }
    assert.ok(finalLoadedSnapshot.eventLog.length <= 100, "loaded event log must respect its cap");
    assert.ok(finalLoadedSnapshot.eventLog.some(entry => /SAVE LOADED/i.test(String(entry?.text || ""))),
        "the real load path must record its visible system log");
    const roundtripDifferences = snapshotDiff(projectForRoundtrip(savedSnapshot), projectForRoundtrip(finalLoadedSnapshot));
    assert.deepEqual(roundtripDifferences, [],
        "the migrated browser round-trip must reproduce the full saved simulation state: " + roundtripDifferences.join("; "));
    const finalValidationProbe = {...finalLoadedProbe, isPaused: false};
    validate(finalValidationProbe, "final-load");
    report.finalLoad = {
        storedSchema: 8,
        savedSchema,
        loadedSchema,
        saveBytes,
        snapshotBytes,
        legacyBytes,
        loadMs: finalLoad.loadMs,
        loadStatus: finalLoad.status,
        clockAfterReload,
        exact: true,
        nonFinite: loadedNonFinite,
        eventLog: finalLoadedSnapshot.eventLog.length,
        saved: {year: savedSnapshot.year, tick: savedSnapshot.tick, entities: savedSnapshot.entities.length, liveEntities: savedLive.length, population: savedSnapshot.totalPopulation, register: Number(savedSnapshot.population?.totals?.population)},
        loaded: {year: finalLoadedProbe.year, tick: finalLoadedProbe.tick, entities: finalLoadedProbe.entities, population: finalLoadedProbe.population, register: finalLoadedProbe.populationRegister?.total}
    };
    report.loadedPanel = await checkPanel(savedSnapshot);
    report.populationPanel = await checkPopulationPanel(finalLoadedProbe);

    // Unpause through the real state transition and continue for a full year.
    await evalPage(async () => {
        const {state} = await import("./js/core/state.js");
        state.isPaused = false;
    });
    await runFor(500);
    await settleOverlays();
    await syncUi();
    let continued = await probe();
    validate(continued, "post-load");
    assert.ok(continued.tick > finalLoadedProbe.tick, "the simulation must visibly continue after load");
    const continuationTarget = finalLoadedProbe.year + 1;
    let continuationChunks = 0;
    while (continued.year < continuationTarget && continuationChunks < 20) {
        await runFor(20000);
        continuationChunks++;
        await settleOverlays();
        await runFor(500);
        continued = await probe();
        validate(continued, "post-load-chunk-" + continuationChunks);
    }
    await syncUi();
    continued = await probe();
    validate(continued, "post-load-final");
    assert.ok(continued.year >= continuationTarget, "the loaded realm must continue for a full year");
    report.continued = continued;
    report.samples.push({
        label: "after-load-year-" + continued.year,
        year: continued.year,
        tick: continued.tick,
        population: continued.population,
        fps: continued.renderStats.fps,
        frameMs: continued.renderStats.frameMs,
        lastDrawMs: continued.lastDrawMs,
        lastUiRenderMs: continued.lastUiRenderMs,
        renderScale: continued.renderScale,
        resources: continued.resources,
        ui: continued.ui
    });

    // Measure real render throughput after the virtual run and the round-trip. `clock.resume`
    // restores normal browser time; the game loop and renderer stay untouched.
    let resumed = true;
    try {
        await page.clock.resume();
    } catch {
        resumed = false;
    }
    // Let the first post-resume frame and the adaptive renderer settle before
    // taking the throughput sample; a one-frame resume stall is not a frame-rate
    // collapse.
    if (resumed) await page.waitForTimeout(1000);
    const beforeFps = await probe();
    const wallStarted = Date.now();
    if (resumed) {
        await page.waitForTimeout(3000);
    } else {
        await runFor(3000);
    }
    const afterFps = await probe();
    const wallSeconds = Math.max(0.001, (Date.now() - wallStarted) / 1000);
    const renderedDelta = afterFps.renderedFrames - beforeFps.renderedFrames;
    const measuredFps = resumed
        ? renderedDelta / wallSeconds
        : Number(afterFps.renderStats.fps) || 0;
    report.performance = {
        resumedRealTime: resumed,
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
        continuedYear: continued.year,
        continuedTick: continued.tick,
        chunks
    };
    // The headless Linux runner composites a full-page canvas in software and
    // caps the page loop near 20 FPS even though a blank page reaches 60 FPS.
    // Keep a hard floor for pacing, and separately assert that the application's
    // own per-frame work fits comfortably inside a 60 FPS budget. A GPU-backed
    // browser can reach the configured 30 FPS cap; this test does not pretend
    // the software compositor did.
    const fpsMinimum = Number(process.env.ENDURANCE_FPS_MIN || 18);
    assert.ok(measuredFps >= fpsMinimum, "the software-composited headless loop must stay above " +
        fpsMinimum + " FPS (got " + measuredFps.toFixed(2) + ")");
    assert.ok(Number(afterFps.lastDrawMs) <= 16.7, "per-frame draw work must fit a 60 FPS budget (got " +
        afterFps.lastDrawMs + " ms)");
    assert.ok(Number(afterFps.lastUiRenderMs) <= 16.7, "the UI refresh must fit a 60 FPS budget (got " +
        afterFps.lastUiRenderMs + " ms)");
    assert.ok(afterFps.year >= targetYear, "the realm must stay alive during the frame sample");
    assert.ok(afterFps.year >= continuationTarget, "the post-load frame sample must run after the continued year");
    const frameFps = report.samples.map(sample => Number(sample.fps)).filter(Number.isFinite);
    const strictlyFalling = frameFps.length >= 3 &&
        frameFps.slice(1).every((value, index) => value < frameFps[index]);
    const maxDrawMs = Math.max(Number(afterFps.lastDrawMs) || 0, ...report.samples.map(sample => Number(sample.lastDrawMs) || 0));
    const maxUiRenderMs = Math.max(Number(afterFps.lastUiRenderMs) || 0, ...report.samples.map(sample => Number(sample.lastUiRenderMs) || 0));
    report.frameSeries = {fps: frameFps, strictlyFalling, maxDrawMs, maxUiRenderMs};
    assert.equal(strictlyFalling, false, "the frame rate must not fall monotonically over the run");
    assert.ok(maxDrawMs <= 16.7, "every sampled draw pass must fit a 60 FPS budget (got " + maxDrawMs + " ms)");
    assert.ok(maxUiRenderMs <= 16.7, "every sampled UI refresh must fit a 60 FPS budget (got " + maxUiRenderMs + " ms)");

    await evalPage(async () => {
        const {state} = await import("./js/core/state.js");
        state.isPaused = true;
    });
    await settleOverlays();
    assert.deepEqual(pageErrors, [], "no page errors are allowed");
    assert.deepEqual(consoleErrors, [], "no application console errors are allowed");
    report.ok = true;
    await writeFile(resolve(OUT, "browser-endurance-50y.json"), JSON.stringify(report, null, 2));
    console.log("BROWSER_ENDURANCE " + JSON.stringify({
        ok: true,
        seed: SEED,
        fixture,
        yearsRequested: YEARS,
        yearsReached: snapshot.year - started.year,
        startYear: started.year,
        finalYear: snapshot.year,
        finalTick: snapshot.tick,
        chunks,
        samples: report.samples.length,
        panel: report.panel,
        finalLoad: report.finalLoad,
        loadedPanel: report.loadedPanel,
        populationPanel: report.populationPanel,
        continued: {year: report.continued?.year, tick: report.continued?.tick},
        frameSeries: report.frameSeries,
        performance: report.performance,
        pageErrors,
        consoleErrors
    }));
} catch (error) {
    report.ok = false;
    report.error = error.stack || error.message;
    await writeFile(resolve(OUT, "browser-endurance-50y.json"), JSON.stringify(report, null, 2)).catch(() => {});
    console.error("BROWSER_ENDURANCE_FAILED " + JSON.stringify({
        error: error.message,
        fixture,
        started: report.started ? {year: report.started.year, tick: report.started.tick} : null,
        final: report.final ? {year: report.final.year, tick: report.final.tick} : null,
        samples: report.samples.length,
        pageErrors,
        consoleErrors
    }, null, 2));
    throw error;
} finally {
    await browser.close().catch(() => {});
}
