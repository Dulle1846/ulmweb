// Low-end performance proof for the live game loop.
//
// This is deliberately not a synthetic benchmark: Chromium runs the real start
// screen and the normal requestAnimationFrame loop against a CPU-throttled
// renderer. The run advances the real simulation for multiple in-game years at
// an accelerated game speed, then samples quiet, dense, command-panel and
// war/diplomacy phases separately. A test-only response transform times the
// real updateSimulation() call per tick; it does not alter game state.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { chromium } from "playwright";
import { browserLaunchOptions, checkBrowser, printBrowserHelp } from "./browser-preflight.mjs";

const ROOT = resolve(process.cwd());
const SEED = Number(process.env.PERF_SEED || 20261108);
const CLIMATE = process.env.PERF_CLIMATE || "temperate";
const FORESTS = Number(process.env.PERF_FORESTS || 52);
const VIEWPORT = { width: 1366, height: 768 };
const CPU_THROTTLE = Number(process.env.PERF_CPU_THROTTLE || 4);
const FRAME_LIMIT = Number(process.env.PERF_FRAME_LIMIT || 60);
const RENDER_SCALE = Number(process.env.PERF_RENDER_SCALE || 70);
const GAME_SPEED = Number(process.env.PERF_GAME_SPEED || 4);
const TARGET_YEARS = Number(process.env.PERF_YEARS || 2);
const QUIET_MS = Number(process.env.PERF_QUIET_MS || 8000);
const DENSE_MS = Number(process.env.PERF_DENSE_MS || 10000);
const PANEL_MS = Number(process.env.PERF_PANEL_MS || 8000);
const WAR_MS = Number(process.env.PERF_WAR_MS || 8000);
const SIM_ONLY_MS = Number(process.env.PERF_SIM_ONLY_MS || 0);
const REPORT_ONLY = process.env.PERF_REPORT_ONLY === "1";
const TAIGA_SCENES = process.env.PERF_TAIGA_SCENES === "1";
const TAIGA_SCENE_MS = Number(process.env.PERF_TAIGA_SCENE_MS || 6000);
const TAIGA_TRANSITION_MS = Number(process.env.PERF_TAIGA_TRANSITION_MS || 2500);
const TAIGA_SETTLE_MS = Number(process.env.PERF_TAIGA_SETTLE_MS || 2500);
const WARMUP_MS = Number(process.env.PERF_WARMUP_MS || 0);
const TAIGA_DRAW_CALL_BUDGET = Number(process.env.PERF_BUDGET_DRAW_CALLS || 1500);
const TAIGA_ENTITY_BUDGET = Number(process.env.PERF_BUDGET_ENTITIES || 120);
const TAIGA_DRAW_MS_BUDGET = Number(process.env.PERF_BUDGET_DRAW_MS || 16.7);
const OUT = resolve(ROOT, "..", "artifacts", "low-end-performance.json");

// A 60 Hz presentation target on a low-end desktop. The budget is intentionally
// expressed in wall-clock frame intervals, not renderer draw time: a slow main
// thread and a slow draw both count as dropped frames.
const BUDGET = Object.freeze({
    p95FrameMs: Number(process.env.PERF_BUDGET_P95_MS || 33),
    over33Pct: Number(process.env.PERF_BUDGET_OVER33 || 0.15),
    over50Pct: Number(process.env.PERF_BUDGET_OVER50 || 0.03),
    longTasks: Number(process.env.PERF_BUDGET_LONG_TASKS || 0),
    saveMs: Number(process.env.PERF_BUDGET_SAVE_MS || 1000),
    loadMs: Number(process.env.PERF_BUDGET_LOAD_MS || 2500),
    taigaDrawCalls: TAIGA_DRAW_CALL_BUDGET,
    taigaEntities: TAIGA_ENTITY_BUDGET,
    taigaDrawMs: TAIGA_DRAW_MS_BUDGET
});

const mime = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav"
};

function serveGame() {
    return createServer(async (request, response) => {
        try {
            const pathname = decodeURIComponent(new URL(request.url || "/", "http://127.0.0.1").pathname);
            const relative = pathname === "/" ? "index.html" : pathname.slice(1);
            const file = resolve(ROOT, relative);
            if (file !== ROOT && !file.startsWith(ROOT + sep)) {
                response.writeHead(403).end("Forbidden");
                return;
            }
            const data = await readFile(file);
            response.writeHead(200, {
                "content-type": mime[extname(file)] || "application/octet-stream",
                "cache-control": "no-store"
            });
            response.end(data);
        } catch {
            response.writeHead(404, { "content-type": "text/plain" }).end("Not found");
        }
    });
}

const probe = await checkBrowser();
if (!probe.ok) {
    printBrowserHelp(probe.error);
    process.exit(1);
}

const server = serveGame();
await new Promise(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
const port = server.address().port;
const browser = await chromium.launch({
    ...browserLaunchOptions(),
    args: [
        ...browserLaunchOptions().args,
        "--disable-background-timer-throttling",
        "--disable-renderer-backgrounding",
        "--disable-backgrounding-occluded-windows",
        ...(process.env.PERF_DISABLE_GPU === "1" ? ["--disable-gpu"] : []),
        ...(process.env.PERF_SOFTWARE_CANVAS === "1" ? ["--disable-accelerated-2d-canvas", "--disable-gpu-compositing"] : [])
    ]
});
const page = await browser.newPage({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    reducedMotion: "reduce"
});
const cdp = await page.context().newCDPSession(page);
await cdp.send("Performance.enable");
await cdp.send("HeapProfiler.enable");
await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE });

const errors = [];
const consoleErrors = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
});

// Independent rAF sampler: unlike the game's render probe it also records
// frames while a management dialog suppresses world drawing. It only stores
// timestamps, so it cannot affect layout or gameplay.
await page.addInitScript(() => {
    window.__KAC_PERF = { raf: [], longTasks: [], tickMs: [], uiChunkMs: [], friendlyMs: [], logisticsMs: [], workMs: [], draws: [] };
    window.__KAC_LOAD_TIMES = {};
    const sample = timestamp => {
        const frames = window.__KAC_PERF.raf;
        if (frames.length < 200000) frames.push(timestamp);
        requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    try {
        new PerformanceObserver(list => {
            for (const entry of list.getEntries()) {
                window.__KAC_PERF.longTasks.push({
                    name: entry.name,
                    startTime: entry.startTime,
                    duration: entry.duration
                });
            }
        }).observe({ entryTypes: ["longtask"] });
    } catch {
        // Long Task entries are Chromium-only; the test reports the absence as
        // a limitation instead of pretending a timer measures the same thing.
    }
    // Count real Canvas2D primitives, not JS calls that draw nothing. The
    // wrappers are inert unless the harness is inside drawWorld(), so the
    // setting, start screen and management UI are not charged to the world.
    window.__KAC_DRAW_ACTIVE = false;
    window.__KAC_DRAW_CALLS = {};
    try {
        const proto = CanvasRenderingContext2D.prototype;
        for (const name of ["fill", "stroke", "fillRect", "strokeRect", "drawImage", "fillText"]) {
            const original = proto[name];
            proto[name] = function (...args) {
                if (window.__KAC_DRAW_ACTIVE) {
                    window.__KAC_DRAW_CALLS.total = (window.__KAC_DRAW_CALLS.total || 0) + 1;
                    window.__KAC_DRAW_CALLS[name] = (window.__KAC_DRAW_CALLS[name] || 0) + 1;
                }
                return original.apply(this, args);
            };
        }
    } catch {
        // A browser without a writable Canvas2D prototype still reports frame
        // timing; the draw-call reading is then explicitly absent.
    }
});

if (process.env.PERF_LOAD_BREAKDOWN === "1") {
    await page.route("**/js/app/main.js", async route => {
        const response = await route.fetch();
        let source = await response.text();
        const replaceTimed = (marker, key) => {
            if (!source.includes(marker)) throw new Error("Could not instrument load: " + marker);
            source = source.replace(marker, `{const __kacT=performance.now();${marker}globalThis.__KAC_LOAD_TIMES.${key}=performance.now()-__kacT;}`);
        };
        if (!source.includes("prepared=prepareSaveSnapshot(snapshot);")) throw new Error("Could not instrument save preparation");
        source = source.replace("prepared=prepareSaveSnapshot(snapshot);",
            "const __kacPrepareStarted=performance.now();prepared=prepareSaveSnapshot(snapshot);globalThis.__KAC_LOAD_TIMES.prepareMs=performance.now()-__kacPrepareStarted;");
        replaceTimed("resetForRun(profile);", "resetForRunMs");
        if (!source.includes("const restored=restoreSaveSnapshot(prepared);")) throw new Error("Could not instrument snapshot restore");
        source = source.replace("const restored=restoreSaveSnapshot(prepared);",
            "const __kacRestoreStarted=performance.now();const restored=restoreSaveSnapshot(prepared);globalThis.__KAC_LOAD_TIMES.restoreMs=performance.now()-__kacRestoreStarted;");
        if (!source.includes("const save=readLocalSave(profile.id);")) throw new Error("Could not instrument save read");
        source = source.replace("const save=readLocalSave(profile.id);",
            "const __kacReadStarted=performance.now();const save=readLocalSave(profile.id);globalThis.__KAC_LOAD_TIMES.readSaveMs=performance.now()-__kacReadStarted;");
        source = source.replace("    renderUI();\n    startSoundtrack().catch(()=>{});",
            "    {const __kacT=performance.now();renderUI();globalThis.__KAC_LOAD_TIMES.renderUiMs=performance.now()-__kacT;}\n    startSoundtrack().catch(()=>{});");
        await route.fulfill({ response, body: source });
    });
    await page.route("**/js/core/save-runtime.js", async route => {
        const response = await route.fetch();
        let source = await response.text();
        for (const [marker, key] of [
            ["initWorld(state.worldSeed, state.worldOptions, state.terrainVersion);", "initWorldMs"],
            ["restoreCity(snapshot.city);", "restoreCityMs"],
            ["normalizeFamilyLinks();", "familyLinksMs"]
        ]) {
            if (!source.includes(marker)) throw new Error("Could not instrument save runtime: " + marker);
            source = source.replace(marker, `{const __kacT=performance.now();${marker}globalThis.__KAC_LOAD_TIMES.${key}=performance.now()-__kacT;}`);
        }
        await route.fulfill({ response, body: source });
    });
}

await page.route("**/js/app/game-loop.js", async route => {
    const response = await route.fetch();
    let source = await response.text();
    const rendererImport = 'import { drawWorld } from "../presentation/rendering/renderer.js";';
    if (!source.includes(rendererImport)) throw new Error("Could not instrument renderer diagnostics");
    source = source.replace(rendererImport,
        'import { drawWorld, visibleEntityIdsForTest, visibleCarrierIdsForTest } from "../presentation/rendering/renderer.js";');
    const tickMarker = "updateSimulation();updateParticles();updateFloaters();";
    if (!source.includes(tickMarker)) throw new Error("Could not instrument the live tick loop");
    source = source.replace(tickMarker,
        "{const __kacTickStarted=performance.now();updateSimulation();" +
        "const __kacTickMs=performance.now()-__kacTickStarted;" +
        "if(globalThis.__KAC_PERF&&globalThis.__KAC_PERF.tickMs.length<200000)globalThis.__KAC_PERF.tickMs.push(__kacTickMs);}" +
        "updateParticles();updateFloaters();"
    );
    const friendlyMarker = "updateFriendlyMovement(stepDelta);";
    if (!source.includes(friendlyMarker)) throw new Error("Could not instrument villager movement");
    source = source.replace(friendlyMarker,
        "{const __kacMoveStarted=performance.now();updateFriendlyMovement(stepDelta);" +
        "if(globalThis.__KAC_PERF&&globalThis.__KAC_PERF.friendlyMs.length<200000)globalThis.__KAC_PERF.friendlyMs.push(performance.now()-__kacMoveStarted);}"
    );
    const logisticsMarker = "updateLogisticsMovement(stepDelta);";
    if (!source.includes(logisticsMarker)) throw new Error("Could not instrument carrier movement");
    source = source.replace(logisticsMarker,
        "{const __kacLogisticsStarted=performance.now();updateLogisticsMovement(stepDelta);" +
        "if(globalThis.__KAC_PERF&&globalThis.__KAC_PERF.logisticsMs.length<200000)globalThis.__KAC_PERF.logisticsMs.push(performance.now()-__kacLogisticsStarted);}"
    );
    const drawCallMarker = "     drawWorld();\n";
    if (!source.includes(drawCallMarker)) throw new Error("Could not instrument the world draw call");
    source = source.replace(drawCallMarker,
        "     if(!globalThis.__KAC_PERF_SKIP_WORLD){" +
        "globalThis.__KAC_DRAW_ACTIVE=true;globalThis.__KAC_DRAW_CALLS={total:0};" +
        "const __kacDrawStarted=performance.now();" +
        "try{drawWorld();}finally{" +
        "const __kacDrawMs=performance.now()-__kacDrawStarted;" +
        "globalThis.__KAC_DRAW_ACTIVE=false;" +
        "const __kacDrawCalls=Number(globalThis.__KAC_DRAW_CALLS.total)||0;" +
        "const __kacEntities=visibleEntityIdsForTest().length;" +
        "const __kacCarriers=visibleCarrierIdsForTest().length;" +
        "if(globalThis.__KAC_PERF&&globalThis.__KAC_PERF.draws.length<200000)" +
        "globalThis.__KAC_PERF.draws.push({ms:__kacDrawMs,calls:__kacDrawCalls,entities:__kacEntities,carriers:__kacCarriers});" +
        "}}\n"
    );
    const uiCallMarker = "      renderUI();\n";
    if (!source.includes(uiCallMarker)) throw new Error("Could not instrument the HUD refresh call");
    source = source.replace(uiCallMarker,
        "      if(!globalThis.__KAC_PERF_SKIP_UI) renderUI();\n"
    );
    const workMarker = "state.lastSimulationMs=simulationMs;";
    if (!source.includes(workMarker)) throw new Error("Could not instrument frame work");
    source = source.replace(workMarker,
        "state.lastSimulationMs=simulationMs;" +
        "if(globalThis.__KAC_PERF&&globalThis.__KAC_PERF.workMs.length<200000)globalThis.__KAC_PERF.workMs.push(simulationMs);"
    );
    const headers = { ...response.headers() };
    delete headers["content-encoding"];
    delete headers["content-length"];
    delete headers["transfer-encoding"];
    await route.fulfill({ status: response.status(), headers, body: source });
});

await page.route("**/js/presentation/rendering/renderer.js", async route => {
    const response = await route.fetch();
    let source = await response.text();
    const staticCalls = [
        "drawRoadNetwork(ctx,zoom,camera,canvas);",
        "drawFieldPatches(ctx,zoom,camera,canvas);",
        "drawMapLayer(ctx,zoom,camera,canvas);",
        "drawForesterStewardshipOverlay(ctx,zoom,camera,canvas);",
        "drawLogisticsRoutes(ctx,zoom,camera,canvas);"
    ];
    for (const call of staticCalls) {
        if (!source.includes(call)) throw new Error("Could not instrument world layer " + call);
        source = source.replace(call, "if(!globalThis.__KAC_PERF_SKIP_STATIC)" + call);
    }
    const entityCalls = [
        "drawEntity(ctx, entity, tick, zoom, camera);",
        "drawConstructionSites(ctx,zoom,camera,canvas);",
        "drawCarriers(ctx,zoom,camera,canvas);"
    ];
    for (const call of entityCalls) {
        if (!source.includes(call)) throw new Error("Could not instrument world layer " + call);
        source = source.replace(call, "if(!globalThis.__KAC_PERF_SKIP_ENTITIES)" + call);
    }
    const screenCalls = [
        "drawForestVisibility(ctx, canvas, camera, zoom);",
        "drawDaylightOverlay(ctx, canvas, state.timeOfDay, seasonName);",
        "drawWeatherOverlay(ctx, canvas);"
    ];
    for (const call of screenCalls) {
        if (!source.includes(call)) throw new Error("Could not instrument world layer " + call);
        source = source.replace(call, "if(!globalThis.__KAC_PERF_SKIP_SCREEN)" + call);
    }
    const headers = { ...response.headers() };
    delete headers["content-encoding"];
    delete headers["content-length"];
    delete headers["transfer-encoding"];
    await route.fulfill({ status: response.status(), headers, body: source });
});

await page.route("**/js/presentation/rendering/ui.js", async route => {
    const response = await route.fetch();
    let source = await response.text();
    const chunkMarker = "try{chunk();}catch(error){console.error(error);}";
    if (!source.includes(chunkMarker)) throw new Error("Could not instrument the HUD refresh chunks");
    source = source.replace(chunkMarker,
        "try{const __kacUiStarted=performance.now();chunk();const __kacUiMs=performance.now()-__kacUiStarted;" +
        "if(globalThis.__KAC_PERF&&globalThis.__KAC_PERF.uiChunkMs.length<200000)globalThis.__KAC_PERF.uiChunkMs.push(__kacUiMs);}" +
        "catch(error){console.error(error);}"
    );
    const headers = { ...response.headers() };
    delete headers["content-encoding"];
    delete headers["content-length"];
    delete headers["transfer-encoding"];
    await route.fulfill({ status: response.status(), headers, body: source });
});

async function heapUsed() {
    await cdp.send("HeapProfiler.collectGarbage");
    const usage = await cdp.send("Runtime.getHeapUsage");
    return Math.round(Number(usage.usedSize) || 0);
}

async function applyLowEndSettings() {
    // Drive the real settings listeners directly. A realm event can open over
    // the settings button at any moment; that is valid gameplay, but waiting
    // for the overlay would make this measurement depend on event timing.
    await page.evaluate(({ frameLimit, renderScale }) => {
        const set = (id, value) => {
            const select = document.getElementById(id);
            if (!select) throw new Error("Missing settings control " + id);
            select.value = String(value);
            select.dispatchEvent(new Event("change", { bubbles: true }));
        };
        set("settings-frame-limit", frameLimit);
        set("settings-render-scale", renderScale);
    }, { frameLimit: FRAME_LIMIT, renderScale: RENDER_SCALE });
    await page.waitForTimeout(300);
}

async function setLiveSettings() {
    await page.evaluate(async ({ frameLimit, gameSpeed }) => {
        const { state } = await import("./js/core/state.js");
        state.frameLimit = frameLimit;
        state.gameSpeed = gameSpeed;
        state.isPaused = false;
        state.showFps = false;
        state.performanceProbe = {
            frames: [], limit: 200000, lastPresentedAt: 0, lastRenderedAt: 0
        };
    }, { frameLimit: FRAME_LIMIT, gameSpeed: GAME_SPEED });
}

async function installAutoResolver() {
    await page.evaluate(async () => {
        const [{ state }, { resolveEventChoice }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/events.js")
        ]);
        const tick = () => {
            if (state.activeEvent && !state.activeEvent.dismissed) {
                resolveEventChoice(0);
                // An unaffordable issue can reject the first choice. The
                // performance run must not leave a blocking modal that makes
                // the game loop skip world drawing; dismiss it instead.
                if (state.activeEvent) state.activeEvent.dismissed = true;
            }
            document.getElementById("realm-event-modal")?.classList.add("hidden");
        };
        window.__KAC_PERF_AUTO_RESOLVE = setInterval(tick, 250);
        tick();
    });
}

async function pauseForPanel() {
    // A realm event can open between the auto-resolver tick and Playwright's
    // actionability check. Pause the clock and resolve once more so the
    // management panel measurement is not rejected by a transient modal.
    await page.evaluate(async () => {
        const [{ state }, { resolveEventChoice }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/events.js")
        ]);
        state.isPaused = true;
        if (state.activeEvent && !state.activeEvent.dismissed) {
            resolveEventChoice(0);
            // Some issues cannot be paid for with the current stores. The
            // benchmark is measuring the panel, not resolving that event, so
            // dismiss it rather than leaving a blocking modal on screen.
            if (state.activeEvent) state.activeEvent.dismissed = true;
        }
        document.getElementById("realm-event-modal")?.classList.add("hidden");
    });
    await page.waitForTimeout(150);
}

async function resumeAfterPanel() {
    await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        state.isPaused = false;
    });
}

function percentile(sorted, fraction) {
    if (!sorted.length) return null;
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
    return Math.round(sorted[index] * 1000) / 1000;
}

function summarizePhase(name, payload) {
    const intervals = payload.raf.slice(1).map((value, index) => value - payload.raf[index])
        .filter(value => Number.isFinite(value) && value > 0);
    const sorted = intervals.slice().sort((a, b) => a - b);
    const tickSorted = payload.tickMs.slice().sort((a, b) => a - b);
    const uiSorted = payload.uiChunkMs.slice().sort((a, b) => a - b);
    const friendlySorted = payload.friendlyMs.slice().sort((a, b) => a - b);
    const logisticsSorted = payload.logisticsMs.slice().sort((a, b) => a - b);
    const workSorted = payload.workMs.slice().sort((a, b) => a - b);
    const drawRows = Array.isArray(payload.draws) ? payload.draws : [];
    const drawCallSorted = drawRows.map(row => Number(row.calls) || 0).sort((a, b) => a - b);
    const drawCallMsSorted = drawRows.map(row => Number(row.ms) || 0).sort((a, b) => a - b);
    const entitySorted = drawRows.map(row => (Number(row.entities) || 0) + (Number(row.carriers) || 0))
        .sort((a, b) => a - b);
    const probe = Array.isArray(payload.probeFrames) ? payload.probeFrames : [];
            const presented = probe.filter(frame => Number(frame.intervalMs) > 0);
        const slowFrames = presented.slice()
            .sort((a, b) => (Number(b.intervalMs) || 0) - (Number(a.intervalMs) || 0))
            .slice(0, 8)
            .map(frame => ({
                intervalMs: Number(frame.intervalMs) || 0,
                drawMs: Number(frame.drawMs) || 0,
                worldDrawMs: Number(frame.worldDrawMs) || 0,
                simMs: Number(frame.simMs) || 0,
                uiMs: Number(frame.uiMs) || 0
            }));
        const frameCost = frame => Math.max(0, Number(frame.drawMs) || 0) + Math.max(0, Number(frame.simMs) || 0) + Math.max(0, Number(frame.uiMs) || 0);
    // A long wall-clock frame with almost no main-thread work is a browser or
    // host scheduling gap, not an app frame. Keep both readings: the raw wall
    // interval is reported, and the budget is applied to frames where the app
    // actually did work. Long tasks are still counted against the app.
    const external = presented.filter(frame => Number(frame.intervalMs) > 50 && frameCost(frame) <= 2.5);
    const active = presented.filter(frame => !external.includes(frame));
    const intervalOf = frame => Number(frame.intervalMs);
    const activeSorted = active.map(intervalOf).sort((a, b) => a - b);
    const presentedSorted = presented.map(intervalOf).sort((a, b) => a - b);
    const costSorted = presented.map(frameCost).sort((a, b) => a - b);
    const drawSorted = presented.map(frame => Number(frame.worldDrawMs) || 0).sort((a, b) => a - b);
    const simSorted = presented.map(frame => Number(frame.simMs) || 0).sort((a, b) => a - b);
    const pctOver = (values, threshold) => values.length
        ? Math.round(values.filter(value => value > threshold).length / values.length * 100000) / 1000 : null;
    return {
        name,
        year: payload.state.year,
        tick: payload.state.tick,
        population: payload.state.population,
        buildings: payload.state.buildings,
        frameCount: intervals.length,
        medianFrameMs: percentile(sorted, 0.5),
        p95FrameMs: percentile(sorted, 0.95),
        p99FrameMs: percentile(sorted, 0.99),
        over33Pct: intervals.length ? Math.round(intervals.filter(value => value > 33).length / intervals.length * 100000) / 1000 : null,
        over50Pct: intervals.length ? Math.round(intervals.filter(value => value > 50).length / intervals.length * 100000) / 1000 : null,
        longTasks: payload.longTasks.length,
        longTaskMaxMs: payload.longTasks.length ? Math.round(Math.max(...payload.longTasks.map(entry => entry.duration)) * 1000) / 1000 : 0,
        tickSamples: tickSorted.length,
        medianTickMs: percentile(tickSorted, 0.5),
        p95TickMs: percentile(tickSorted, 0.95),
        medianUiChunkMs: percentile(uiSorted, 0.5),
        p95UiChunkMs: percentile(uiSorted, 0.95),
        medianFriendlyMs: percentile(friendlySorted, 0.5),
        p95FriendlyMs: percentile(friendlySorted, 0.95),
        medianLogisticsMs: percentile(logisticsSorted, 0.5),
        p95LogisticsMs: percentile(logisticsSorted, 0.95),
        medianWorkMs: percentile(workSorted, 0.5),
        p95WorkMs: percentile(workSorted, 0.95),
        drawCallSamples: drawRows.length,
        drawCallsP95: percentile(drawCallSorted, 0.95),
        drawCallsMax: drawCallSorted.length ? drawCallSorted[drawCallSorted.length - 1] : null,
        canvasDrawP95Ms: percentile(drawCallMsSorted, 0.95),
        canvasDrawMaxMs: drawCallMsSorted.length ? drawCallMsSorted[drawCallMsSorted.length - 1] : null,
        entitiesP95: percentile(entitySorted, 0.95),
        entitiesMax: entitySorted.length ? entitySorted[entitySorted.length - 1] : null,
        lastDrawMs: payload.state.lastDrawMs,
        lastWorldDrawMs: payload.state.lastWorldDrawMs,
        lastUiRenderMs: payload.state.lastUiRenderMs,
        lastSimulationMs: payload.state.lastSimulationMs,
        heapUsedBytes: payload.heapUsedBytes,
        renderer: payload.state.renderer,
        renderScale: payload.state.renderScale,
        gameSpeed: payload.state.gameSpeed,
        terrainMode: payload.state.terrainMode,
        terrainCacheHits: payload.state.terrainCacheHits,
        terrainCacheMisses: payload.state.terrainCacheMisses,
        terrainBuildMs: payload.state.terrainBuildMs,
        dayOfYear: payload.state.dayOfYear,
        seasonIndex: payload.state.seasonIndex,
        weather: payload.state.weather,
        zoom: payload.state.zoom,
        camera: { x: payload.state.cameraX, y: payload.state.cameraY },
        slowFrames,
        probe: presented.length ? {
            samples: presented.length,
            rawP95Ms: percentile(presentedSorted, 0.95),
            rawMaxMs: presentedSorted[presentedSorted.length - 1],
            activeP95Ms: percentile(activeSorted, 0.95),
            activeMaxMs: activeSorted.length ? activeSorted[activeSorted.length - 1] : null,
            activeOver33Pct: pctOver(activeSorted, 33),
            activeOver50Pct: pctOver(activeSorted, 50),
            appWorkP95Ms: percentile(costSorted, 0.95),
            appWorkMaxMs: costSorted[costSorted.length - 1],
            drawP95Ms: percentile(drawSorted, 0.95),
            simP95Ms: percentile(simSorted, 0.95),
            externalGaps: external.length,
            externalGapPct: pctOver(presented.map(intervalOf), 50),
            externalGapMaxMs: external.length ? Math.max(...external.map(intervalOf)) : 0
        } : null
    };
}

async function samplePhase(name, durationMs) {
    // Reset on a clean frame boundary. Clearing the sampler in a separate
    // evaluation could charge a frame that was already in flight to the new
    // phase: its draw landed in perf.draws after the clear while its long task
    // started after phaseStarted, even though the game probe had already
    // discarded that frame. Starting after two rAF callbacks removes the race.
    await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const perf = window.__KAC_PERF;
        perf.raf.length = 0;
        perf.tickMs.length = 0;
        perf.uiChunkMs.length = 0;
        perf.friendlyMs.length = 0;
        perf.logisticsMs.length = 0;
        perf.workMs.length = 0;
        perf.draws.length = 0;
        perf.longTasks.length = 0;
        if (state.performanceProbe) {
            state.performanceProbe.frames.length = 0;
            state.performanceProbe.lastPresentedAt = 0;
            state.performanceProbe.lastRenderedAt = 0;
        }
        perf.phaseStarted = performance.now();
    });
    await page.waitForTimeout(durationMs);
    const payload = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const perf = window.__KAC_PERF;
        const phaseStarted = Number(perf.phaseStarted) || 0;
        return {
            raf: perf.raf.slice(),
            tickMs: perf.tickMs.slice(),
            uiChunkMs: perf.uiChunkMs.slice(),
            friendlyMs: perf.friendlyMs.slice(),
            logisticsMs: perf.logisticsMs.slice(),
            workMs: perf.workMs.slice(),
            draws: perf.draws.slice(),
            probeFrames: state.performanceProbe?.frames?.slice() || [],
            longTasks: perf.longTasks.filter(entry => entry.startTime >= phaseStarted),
            state: {
                year: Number(state.year) || 0,
                tick: Number(state.tick) || 0,
                population: state.entities.filter(entity => !entity.dead && entity.type === 20).length,
                buildings: state.entities.filter(entity => !entity.dead && entity.isBuilding?.()).length,
                lastDrawMs: Number(state.lastDrawMs) || 0,
                lastWorldDrawMs: Number(state.lastWorldDrawMs) || 0,
                lastUiRenderMs: Number(state.lastUiRenderMs) || 0,
                lastSimulationMs: Number(state.lastSimulationMs) || 0,
                renderer: state.terrainRendererName || state.renderStats?.mode || "unknown",
                renderScale: Number(state.renderScale) || 1,
                gameSpeed: Number(state.gameSpeed) || 0,
                terrainMode: state.terrainMode || "unknown",
                terrainCacheHits: Number(state.terrainCacheHits) || 0,
                terrainCacheMisses: Number(state.terrainCacheMisses) || 0,
                terrainBuildMs: Number(state.terrainDecorationBuildMs) || 0,
                dayOfYear: Number(state.dayOfYear) || 0,
                seasonIndex: Number(state.seasonIndex) || 0,
                weather: state.weather || "clear",
                zoom: Number(state.zoom) || 0,
                cameraX: Number(state.camera?.x) || 0,
                cameraY: Number(state.camera?.y) || 0
            },
            heapUsedBytes: 0
        };
    });
    payload.heapUsedBytes = await heapUsed();
    return summarizePhase(name, payload);
}

async function measureSaveLoad() {
    if (process.env.PERF_LOAD_BREAKDOWN === "1") {
        await page.evaluate(() => { globalThis.__KAC_LOAD_TIMES = {}; });
    }
    // Invoke the real controls from inside the page. Playwright's click waits
    // for actionability frames, which would charge driver latency to a
    // synchronous save/load path and make the measurement depend on harness
    // scheduling rather than on the game.
    const saveMs = await page.evaluate(() => {
        const started = performance.now();
        document.querySelector("#save-btn").click();
        return performance.now() - started;
    });
    await page.waitForFunction(() => (document.querySelector("#status-message")?.textContent || "").includes("Realm saved"), null, { timeout: 30000 });
    const saveStatus = await page.locator("#status-message").innerText();
    const bytes = await page.evaluate(() => {
        let total = 0;
        for (let index = 0; index < localStorage.length; index++) {
            const key = localStorage.key(index) || "";
            if (key.startsWith("kings-and-cards:save")) total += (localStorage.getItem(key) || "").length;
        }
        return total;
    });
    const loadMs = await page.evaluate(() => {
        const started = performance.now();
        document.querySelector("#load-btn").click();
        return performance.now() - started;
    });
    await page.waitForFunction(() => {
        const message = document.querySelector("#status-message")?.textContent || "";
        return message.includes("Loaded realm") || message.includes("Load failed") || message.includes("No valid saved realm");
    }, null, { timeout: 30000 });
    const status = await page.locator("#status-message").innerText();
    const breakdown = process.env.PERF_LOAD_BREAKDOWN === "1"
        ? await page.evaluate(() => ({ ...(globalThis.__KAC_LOAD_TIMES || {}) }))
        : null;
    return {
        saveMs,
        loadMs,
        roundTripMs: saveMs + loadMs,
        bytes,
        saveStatus,
        status,
        breakdown
    };
}

async function waitForYear(year) {
    const deadline = Date.now() + Math.max(60000, (year + 1) * 45000);
    while (Date.now() < deadline) {
        const current = await page.evaluate(async () => {
            const { state } = await import("./js/core/state.js");
            return Number(state.year) || 0;
        });
        if (current >= year) return current;
        await page.waitForTimeout(500);
    }
    throw new Error("The live realm did not reach year " + year + " before the performance timeout");
}

// Pick a real lake and the centre of the built settlement from the generated
// realm. The scene only moves the presentation camera and reveals the chosen
// area; it never places buildings, water or residents.
async function prepareTaigaScenes() {
    return page.evaluate(async () => {
        const [{ state }, { CELL }, { isWaterAt }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/core/config.js"),
            import("./js/world/world.js")
        ]);
        const W = Math.max(1, Number(state.worldW) || 0);
        const H = Math.max(1, Number(state.worldH) || 0);
        let lake = null;
        for (let y = 10; y < H - 10; y++) {
            for (let x = 10; x < W - 10; x++) {
                if (!isWaterAt(x, y)) continue;
                let water = 0;
                for (let dy = -4; dy <= 4; dy += 2) {
                    for (let dx = -7; dx <= 7; dx += 2) {
                        if (isWaterAt(x + dx, y + dy)) water++;
                    }
                }
                // Prefer a substantial body away from the map edge; the camera
                // must show a lake with taiga shore, not the clamp at a corner.
                const edge = Math.min(x, y, W - x - 1, H - y - 1);
                const score = water * 4 + Math.min(20, edge);
                if (!lake || score > lake.score) lake = { x, y, water, edge, score };
            }
        }
        if (!lake) throw new Error("The generated taiga realm has no water for the winter-ice scene");
        const reveal = (cx, cy, radius) => {
            for (let y = Math.max(0, cy - radius); y <= Math.min(H - 1, cy + radius); y++) {
                for (let x = Math.max(0, cx - radius); x <= Math.min(W - 1, cx + radius); x++) {
                    state.explored[x][y] = true;
                }
            }
        };
        reveal(lake.x, lake.y, 22);
        const buildings = state.entities.filter(entity => !entity.dead && entity.isBuilding?.());
        const centre = buildings.length
            ? {
                x: buildings.reduce((sum, entity) => sum + Number(entity.x || 0), 0) / buildings.length,
                y: buildings.reduce((sum, entity) => sum + Number(entity.y || 0), 0) / buildings.length
            }
            : { x: W / 2, y: H / 2 };
        reveal(Math.floor(centre.x), Math.floor(centre.y), 20);
        // Pick a land tile that is still unexplored and far from both revealed
        // scenes. Reveal only a small island of ground so the camera jump has a
        // real fog boundary; the rest of the view exercises the active fog path.
        let wilderness = null;
        for (let y = 8; y < H - 8; y += 2) {
            for (let x = 8; x < W - 8; x += 2) {
                if (state.explored[x][y] || isWaterAt(x, y)) continue;
                const distance = Math.abs(x - lake.x) + Math.abs(y - lake.y)
                    + Math.abs(x - centre.x) + Math.abs(y - centre.y);
                const edge = Math.min(x, y, W - x - 1, H - y - 1);
                const score = distance + Math.min(12, edge);
                if (!wilderness || score > wilderness.score) wilderness = { x, y, distance, edge, score };
            }
        }
        if (!wilderness) throw new Error("The generated taiga realm has no unexplored land for the fog transition");
        reveal(wilderness.x, wilderness.y, 4);
        state.fogDirty = true;
        state.fogExploredRef = null;
        return {
            lake,
            settlement: { x: centre.x, y: centre.y, buildings: buildings.length },
            wilderness,
            world: { width: W, height: H, cell: CELL },
            population: state.entities.filter(entity => !entity.dead && entity.type === 20).length
        };
    });
}

async function applyTaigaScene(target, season, zoom) {
    return page.evaluate(async ({ target, season, zoom }) => {
        const [{ state }, { CELL }, { taigaProfileAt }, { getHeightAt, getMoistureAt, getTemperatureAt }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/core/config.js"),
            import("./js/world/taiga-ecology.js"),
            import("./js/world/world.js")
        ]);
        const winter = season === "winter";
        state.dayOfYear = winter ? 340 : 140;
        state.seasonIndex = winter ? 3 : 1;
        state.weather = "clear";
        state.timeOfDay = 12;
        state.zoom = zoom;
        state.zoomTarget = zoom;
        state.zoomAnchor = null;
        const canvas = state.canvas;
        const maxX = Math.max(0, (Number(state.worldW) || 0) * CELL * zoom - canvas.width);
        const maxY = Math.max(0, (Number(state.worldH) || 0) * CELL * zoom - canvas.height);
        state.camera.x = Math.max(0, Math.min(maxX, target.x * CELL * zoom - canvas.width / 2));
        state.camera.y = Math.max(0, Math.min(maxY, target.y * CELL * zoom - canvas.height / 2));
        // A camera or season change does not alter the exploration mask. Keep
        // the fog canvas warm instead of charging a mask rebuild to the jump.
        const profile = taigaProfileAt(target.x + 0.5, target.y + 0.5, {
            climate: "taiga",
            dayOfYear: state.dayOfYear,
            seasonIndex: state.seasonIndex,
            year: state.year,
            height: getHeightAt(Math.floor(target.x), Math.floor(target.y)),
            moisture: getMoistureAt(Math.floor(target.x), Math.floor(target.y)),
            temperature: getTemperatureAt(Math.floor(target.x), Math.floor(target.y)),
            weather: state.weather,
            use: { state: "wild" }
        });
        const cellPx = CELL * zoom;
        let fogTiles = 0;
        if (cellPx > 0 && state.explored) {
            const x0 = Math.max(0, Math.floor(state.camera.x / cellPx));
            const y0 = Math.max(0, Math.floor(state.camera.y / cellPx));
            const x1 = Math.min(state.worldW - 1, Math.floor((state.camera.x + canvas.width) / cellPx));
            const y1 = Math.min(state.worldH - 1, Math.floor((state.camera.y + canvas.height) / cellPx));
            for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
                if (!state.explored[x]?.[y]) fogTiles++;
            }
        }
        return {
            scene: winter ? "winter-ice" : "summer-lake",
            formation: profile?.formation || null,
            ice: Boolean(profile?.water?.ice),
            water: {
                lake: Number(profile?.water?.lake) || 0,
                river: Number(profile?.water?.river) || 0,
                marsh: Number(profile?.water?.marsh) || 0
            },
            dayOfYear: state.dayOfYear,
            seasonIndex: state.seasonIndex,
            weather: state.weather,
            zoom: state.zoom,
            camera: { x: state.camera.x, y: state.camera.y },
            canvas: { width: canvas.width, height: canvas.height },
            fogTiles,
            terrainCacheMisses: Number(state.terrainCacheMisses) || 0
        };
    }, { target, season, zoom });
}

async function settleTaigaScene(beforeMisses) {
    await page.waitForFunction(async before => {
        const [{ state }, { isTerrainDetailSettled }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/presentation/rendering/terrain.js")
        ]);
        return Number(state.terrainCacheMisses) > before && isTerrainDetailSettled();
    }, beforeMisses, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(TAIGA_SETTLE_MS);
}

await mkdir(resolve(ROOT, "..", "artifacts"), { recursive: true });
let summary;
try {
    // Preload the low-end profile before the realm is founded. The production
    // settings path reads the same localStorage record on startup; applying
    // these values after the first frame invalidates the terrain cache and
    // measures a settings change rather than the device profile.
    await page.addInitScript(({ renderScale, frameLimit }) => {
        try {
            localStorage.setItem("kings-and-cards:settings:v1", JSON.stringify({
                renderScale: renderScale / 100,
                frameLimit,
            }));
        } catch { /* storage is optional in hardened browser profiles */ }
    }, { renderScale: RENDER_SCALE, frameLimit: FRAME_LIMIT });
    await page.goto("http://127.0.0.1:" + port + "/", { waitUntil: "networkidle", timeout: 120000 });
    assert.equal(await page.title(), "KINGS & CARDS • Eternal Realm");
    await page.locator("#world-seed-input").fill(String(SEED));
    await page.selectOption("#world-climate", CLIMATE);
    await page.evaluate(value => {
        const slider = document.getElementById("world-forests");
        if (!slider) return;
        slider.value = String(value);
        slider.dispatchEvent(new Event("input", { bubbles: true }));
        slider.dispatchEvent(new Event("change", { bubbles: true }));
    }, FORESTS);
    await page.locator("#player-name-input").fill("Low-End Performance");
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 120000 });
    await page.waitForFunction(async () => {
        const { state } = await import("./js/core/state.js");
        return state.hasStarted === true;
    }, null, { timeout: 120000 });
    await installAutoResolver();
    await applyLowEndSettings();
    // Applying settings invalidates the terrain detail cache. Let the one-time
    // rebuild settle before sampling steady play; otherwise the quiet sample
    // measures a settings change, not the game's normal frame budget.
    await page.waitForFunction(async () => {
        const { isTerrainDetailSettled } = await import("./js/presentation/rendering/terrain.js");
        return isTerrainDetailSettled();
    }, null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await setLiveSettings();
    if (WARMUP_MS > 0) await page.waitForTimeout(WARMUP_MS);
    await page.evaluate(({ skipWorld, skipUi, skipStatic, skipEntities, skipScreen, skipVignette }) => {
        globalThis.__KAC_PERF_SKIP_WORLD = skipWorld;
        globalThis.__KAC_PERF_SKIP_UI = skipUi;
        globalThis.__KAC_PERF_SKIP_STATIC = skipStatic;
        globalThis.__KAC_PERF_SKIP_ENTITIES = skipEntities;
        globalThis.__KAC_PERF_SKIP_SCREEN = skipScreen;
        globalThis.__KAC_PERF_SKIP_VIGNETTE = skipVignette;
    }, {
        skipWorld: process.env.PERF_SKIP_WORLD === "1",
        skipUi: process.env.PERF_SKIP_UI === "1",
        skipStatic: process.env.PERF_SKIP_STATIC === "1",
        skipEntities: process.env.PERF_SKIP_ENTITIES === "1",
        skipScreen: process.env.PERF_SKIP_SCREEN === "1",
        skipVignette: process.env.PERF_SKIP_VIGNETTE === "1"
    });
    if (process.env.PERF_HIDE_STAGE_GRAIN === "1") {
        await page.addStyleTag({ content: ".stage-grain{display:none!important}" });
    }
    if (process.env.PERF_HIDE_UI === "1") {
        await page.addStyleTag({ content: ".topbar,.side-panel,.hand-dock,#hint-box,.zoom-panel,.stage-topline,.minimap-frame,.command-deck{display:none!important}" });
    }
    if (process.env.PERF_DISABLE_BLUR === "1") {
        await page.addStyleTag({ content: "*,*::before,*::after{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}" });
    }
    if (process.env.PERF_HIDE_TERRAIN === "1") {
        await page.evaluate(() => {
            const terrain = document.getElementById("terrain-canvas");
            if (terrain) terrain.style.display = "none";
        });
    }

    const heapStart = await heapUsed();
    const trace = process.env.PERF_TRACE === "1" ? { groups: null } : null;
    if (trace) {
        trace.events = [];
        cdp.on("Tracing.dataCollected", event => {
            if (Array.isArray(event.value)) trace.events.push(...event.value);
        });
        await cdp.send("Tracing.start", {
            categories: "devtools.timeline,blink,cc,gpu,skia,disabled-by-default-devtools.timeline",
            transferMode: "ReportEvents"
        });
    }
    const quiet = await samplePhase("quiet-early-realm", QUIET_MS);
    if (trace) {
        await cdp.send("Tracing.end");
        await page.waitForTimeout(500);
        const traceEvents = trace.events || [];
        const traceText = JSON.stringify({ traceEvents });
        const events = traceEvents;
        const groups = new Map();
        for (const entry of events) {
            if (entry.ph !== "X" || !(entry.dur > 3000)) continue;
            const name = entry.name + (entry.cat ? " [" + entry.cat.split(",")[0] + "]" : "");
            const current = groups.get(name) || { count: 0, totalMs: 0, maxMs: 0 };
            current.count += 1;
            current.totalMs += entry.dur / 1000;
            current.maxMs = Math.max(current.maxMs, entry.dur / 1000);
            groups.set(name, current);
        }
        trace.groups = [...groups.entries()].sort((a, b) => b[1].totalMs - a[1].totalMs).slice(0, 30);
        await writeFile(resolve(ROOT, "..", "artifacts", "low-end-trace.json"), traceText);
    }
    let simOnly = null;
    if (SIM_ONLY_MS > 0) {
        await page.evaluate(() => document.body.classList.add("ui-modal-open"));
        simOnly = await samplePhase("diagnostic-simulation-only", SIM_ONLY_MS);
        await page.evaluate(() => document.body.classList.remove("ui-modal-open"));
    }
    const advanceStarted = Date.now();
    await waitForYear(1 + TARGET_YEARS);
    console.log("advanced to target year in " + (Date.now() - advanceStarted) + "ms");
    const dense = await samplePhase("dense-mature-realm", DENSE_MS);
    // Caches (forest habitat, terrain detail, pathing) are part of the warm
    // realm. Measure leak growth after that bounded warm-up instead of charging
    // one-time cache fill to the steady-state heap budget. The cold-start
    // growth remains reported for visibility.
    const heapWarmStart = await heapUsed();

    let taigaInfo = null;
    const taigaPhases = [];
    if (TAIGA_SCENES) {
        taigaInfo = await prepareTaigaScenes();
        taigaInfo.scenes = [];
        const scenes = [
            { target: taigaInfo.lake, season: "summer", zoom: 1.05, name: "taiga-summer-lake" },
            { target: taigaInfo.lake, season: "winter", zoom: 1.05, name: "taiga-winter-ice" },
            // The settlement scene is a real camera and season jump. Sample it
            // immediately, before waiting for the staged terrain-detail build,
            // then wait and sample the settled view as its own scene.
            { target: taigaInfo.settlement, season: "summer", zoom: 1.0, name: "taiga-populated-settlement", transition: true },
            // A second jump goes from the settled settlement into a mostly
            // unexplored wilderness. The small revealed island gives the view
            // a real fog boundary; the immediate transition sample proves the
            // active fog path is not skipped for a nearly empty view.
            { target: taigaInfo.wilderness, season: "winter", zoom: 1.0, name: "taiga-unexplored-fog", transition: true, transitionName: "taiga-unexplored-transition", settled: false }
        ];
        for (const scene of scenes) {
            const applied = await applyTaigaScene(scene.target, scene.season, scene.zoom);
            if (scene.transition) {
                const transitionName = scene.transitionName || "taiga-transition-jump";
                const transitionPhase = await samplePhase(transitionName, TAIGA_TRANSITION_MS);
                transitionPhase.fogTiles = applied.fogTiles;
                taigaInfo.scenes.push({ ...applied, phase: transitionName, transition: true });
                taigaPhases.push(transitionPhase);
            }
            await settleTaigaScene(applied.terrainCacheMisses);
            if (scene.settled === false) continue;
            const settledPhase = await samplePhase(scene.name, TAIGA_SCENE_MS);
            settledPhase.fogTiles = applied.fogTiles;
            taigaInfo.scenes.push({ ...applied, phase: scene.name });
            taigaPhases.push(settledPhase);
        }
    }

    await pauseForPanel();
    await page.locator("#command-open-btn").click();
    await page.locator('[data-command-tab="population"]').click();
    await page.waitForTimeout(600);
    const panel = await samplePhase("population-panel-open", PANEL_MS);
    await page.locator("#command-close").click();
    await resumeAfterPanel();

    const war = await page.evaluate(async () => {
        const [{ getDiplomacySnapshot, declareWar }, { state }] = await Promise.all([
            import("./js/systems/diplomacy.js"),
            import("./js/core/state.js")
        ]);
        const partner = getDiplomacySnapshot().realms[0];
        const result = partner ? declareWar(partner.id) : { ok: false, reason: "no-partner" };
        state.isPaused = false;
        return { ok: result.ok, partnerId: partner?.id || null };
    });
    await pauseForPanel();
    await page.locator("#command-open-btn").click();
    await page.locator('[data-command-tab="diplomacy"]').click();
    await page.waitForTimeout(600);
    const warPhase = await samplePhase("war-diplomacy-panel", WAR_MS);
    await page.locator("#command-close").click().catch(() => {});
    await resumeAfterPanel();
    const saveLoad = await measureSaveLoad();
    const heapEnd = await heapUsed();

    summary = {
        seed: SEED,
        climate: CLIMATE,
        forests: FORESTS,
        viewport: VIEWPORT,
        cpuThrottle: CPU_THROTTLE,
        softwareCanvas: process.env.PERF_SOFTWARE_CANVAS === "1",
        frameLimit: FRAME_LIMIT,
        renderScale: RENDER_SCALE,
        gameSpeed: GAME_SPEED,
        targetYears: TARGET_YEARS,
        budget: BUDGET,
        war,
        trace: trace?.groups || null,
        heap: {
            startBytes: heapStart,
            warmStartBytes: heapWarmStart,
            endBytes: heapEnd,
            growthBytes: heapEnd - heapStart,
            growthPct: heapStart ? Math.round((heapEnd - heapStart) / heapStart * 10000) / 100 : null,
            steadyGrowthBytes: heapEnd - heapWarmStart,
            steadyGrowthPct: heapWarmStart ? Math.round((heapEnd - heapWarmStart) / heapWarmStart * 10000) / 100 : null
        },
        taiga: taigaInfo ? { ...taigaInfo, phases: taigaPhases.map(phase => phase.name) } : null,
        phases: [...(simOnly ? [simOnly] : []), quiet, dense, ...taigaPhases, panel, warPhase],
        saveLoad,
        pageErrors: errors,
        consoleErrors,
        generatedAt: new Date().toISOString()
    };
    await writeFile(OUT, JSON.stringify(summary, null, 2) + "\n");
    console.log(JSON.stringify(summary, null, 2));
} finally {
    await browser.close().catch(() => {});
    await new Promise(resolveClose => server.close(resolveClose));
}

const failures = [];
if (errors.length) failures.push("page errors: " + errors.join(" | "));
if (consoleErrors.length) failures.push("console errors: " + consoleErrors.join(" | "));
if (!summary) failures.push("no performance summary was produced");
if (summary) {
    for (const phase of summary.phases.filter(entry => entry.name !== "population-panel-open" && entry.name !== "war-diplomacy-panel")) {
        if (phase.frameCount < 20) failures.push(phase.name + " collected too few frames: " + phase.frameCount);
        if (phase.p95FrameMs === null || phase.p95FrameMs > BUDGET.p95FrameMs) failures.push(phase.name + " p95 frame time " + phase.p95FrameMs + "ms exceeds " + BUDGET.p95FrameMs + "ms");
        if (phase.over33Pct === null || phase.over33Pct > BUDGET.over33Pct * 100) failures.push(phase.name + " frames over 33ms " + phase.over33Pct + "% exceeds " + (BUDGET.over33Pct * 100) + "%");
        if (phase.over50Pct === null || phase.over50Pct > BUDGET.over50Pct * 100) failures.push(phase.name + " frames over 50ms " + phase.over50Pct + "% exceeds " + (BUDGET.over50Pct * 100) + "%");
        if (phase.longTasks > BUDGET.longTasks) failures.push(phase.name + " has " + phase.longTasks + " long tasks");
        if (TAIGA_SCENES && phase.name.startsWith("taiga-")) {
            if (phase.drawCallsP95 === null || phase.drawCallsP95 > BUDGET.taigaDrawCalls) failures.push(phase.name + " draw calls p95 " + phase.drawCallsP95 + " exceeds " + BUDGET.taigaDrawCalls);
            if (phase.entitiesP95 === null || phase.entitiesP95 > BUDGET.taigaEntities) failures.push(phase.name + " visible entities p95 " + phase.entitiesP95 + " exceeds " + BUDGET.taigaEntities);
            if (phase.canvasDrawP95Ms === null || phase.canvasDrawP95Ms > BUDGET.taigaDrawMs) failures.push(phase.name + " canvas draw p95 " + phase.canvasDrawP95Ms + "ms exceeds " + BUDGET.taigaDrawMs + "ms");
            if (phase.name.startsWith("taiga-unexplored") && !(phase.fogTiles > 0)) failures.push(phase.name + " did not exercise the active fog path: fogTiles=" + phase.fogTiles);
        }
    }
    if (summary.heap.steadyGrowthPct !== null && summary.heap.steadyGrowthPct > 25) failures.push("warm retained JS heap grew by " + summary.heap.steadyGrowthPct + "%");
    if (summary.saveLoad) {
        if (!(summary.saveLoad.saveMs <= BUDGET.saveMs)) failures.push("save took " + summary.saveLoad.saveMs + "ms, budget " + BUDGET.saveMs + "ms");
        if (!(summary.saveLoad.loadMs <= BUDGET.loadMs)) failures.push("load took " + summary.saveLoad.loadMs + "ms, budget " + BUDGET.loadMs + "ms");
        if (!(summary.saveLoad.status || "").includes("Loaded realm")) failures.push("load did not report a loaded realm: " + summary.saveLoad.status);
    }
}
if (failures.length && !REPORT_ONLY) {
    console.error("LOW-END PERFORMANCE AUDIT FAILED\n" + failures.join("\n"));
    process.exitCode = 1;
} else if (failures.length) {
    console.log("PERF_REPORT_ONLY: " + failures.join("\n"));
}
