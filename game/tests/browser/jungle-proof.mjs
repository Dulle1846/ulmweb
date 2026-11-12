// Real-browser proof for the 1.2.5 jungle interior.
//
// This runs the compiled runtime bundle (not the source tree), starts a real
// tropical realm through the shipped start screen, drives a real villager over
// dense jungle and open ground, triggers the live combat loop, gathers through
// the production forest ledger, opens the actual lumber-yard management panel,
// and samples the real game loop at the interior zoom band on a deliberately
// weak profile.
//
// Usage:
//   npm run build:runtime
//   npm run test:jungle-proof
//
// Environment:
//   E2E_CHROMIUM_EXECUTABLE  optional Chromium executable
//   JUNGLE_PROOF_OUT         output directory (default artifacts/jungle-proof)
//   JUNGLE_PROOF_SEED        realm seed (default 20261104)
//   JUNGLE_PROOF_CPU_THROTTLE  CDP CPU throttle (default 4)
//   JUNGLE_PROOF_SOFTWARE_GL   set 0 to use the host GPU instead of SwiftShader
//   JUNGLE_PROOF_ZOOM          world zoom (default 4.2; use 2.4 for the interior band)

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { browserLaunchOptions, printBrowserHelp } from "./browser-preflight.mjs";

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
process.chdir(gameRoot);
const outputDir = resolve(process.env.JUNGLE_PROOF_OUT || "artifacts/jungle-proof");
const builtRoot = resolve("artifacts/kings-and-cards-deploy/public");
const externalBase = process.env.JUNGLE_PROOF_BASE_URL || "";
const seed = Number(process.env.JUNGLE_PROOF_SEED || 20261104);
const cpuThrottle = Math.max(1, Number(process.env.JUNGLE_PROOF_CPU_THROTTLE || 4));
const zoom = Math.min(4.2, Math.max(0.055, Number(process.env.JUNGLE_PROOF_ZOOM || 4.2)));
// The 2.4x understory audit adds a revealed viewport, a cold cache sample and
// explicit understory timing. Keep those additions out of the canonical 4.2x
// proof so its long-standing profile and report stay comparable.
const measureUnderstory = zoom === 2.4 || process.env.JUNGLE_PROOF_UNDERSTORY === "1";
const viewport = { width: 720, height: 540 };
const frameBudgetMs = Number(process.env.JUNGLE_PROOF_FRAME_BUDGET_MS || 50);
const drawBudgetMs = Number(process.env.JUNGLE_PROOF_DRAW_BUDGET_MS || 16.7);
const uiBudgetMs = Number(process.env.JUNGLE_PROOF_UI_BUDGET_MS || 16.7);
const seasonDays = [50, 150, 250, 350];
const report = {
    ok: false,
    proof: "real-browser-runtime-bundle",
    seed,
    generatedAt: new Date().toISOString(),
    environment: {
        viewport,
        devicePixelRatio: 1,
        cpuThrottle,
        zoom,
        softwareGL: process.env.JUNGLE_PROOF_SOFTWARE_GL !== "0",
        frameBudgetMs,
        drawBudgetMs,
        uiBudgetMs,
    },
    diagnostics: {},
};

await mkdir(outputDir, { recursive: true });
if (!externalBase) {
    try {
        await access(resolve(builtRoot, "index.html"));
    } catch {
        throw new Error("The compiled runtime bundle is missing. Run `npm run build:runtime` first.");
    }
}

const mimeTypes = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
};

function createStaticServer() {
    return createServer(async (request, response) => {
        try {
            const url = new URL(request.url || "/", "http://localhost");
            const relative = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname).slice(1);
            const root = externalBase ? gameRoot : builtRoot;
            const file = resolve(root, relative);
            if (file !== root && !file.startsWith(root + sep)) {
                response.writeHead(403, { "content-type": "text/plain" });
                response.end("Forbidden");
                return;
            }
            const body = await readFile(file);
            response.writeHead(200, {
                "content-type": mimeTypes[extname(file)] || "application/octet-stream",
                "cache-control": "no-store",
            });
            response.end(body);
        } catch {
            response.writeHead(404, { "content-type": "text/plain" });
            response.end("Not found");
        }
    });
}

const server = externalBase ? null : createStaticServer();
if (server) await new Promise(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
const baseUrl = externalBase || ("http://127.0.0.1:" + server.address().port);
const { chromium } = await import("playwright");

const launchArgs = ["--no-sandbox", "--disable-dev-shm-usage"];
if (process.env.JUNGLE_PROOF_SOFTWARE_GL !== "0") {
    launchArgs.push(
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--disable-gpu-sandbox"
    );
}

let browser;
try {
    browser = await chromium.launch({
        ...browserLaunchOptions(),
        args: [...(browserLaunchOptions().args || []), ...launchArgs],
        executablePath: process.env.E2E_CHROMIUM_EXECUTABLE || undefined,
    });
} catch (error) {
    printBrowserHelp(error);
    report.ok = false;
    report.failures = ["browser launch failed: " + String(error?.message || error)];
    await writeFile(resolve(outputDir, "jungle-proof.json"), JSON.stringify(report, null, 2) + "\n").catch(() => {});
    if (server) await new Promise(resolveClose => server.close(resolveClose));
    process.exit(1);
}

const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
const client = await context.newCDPSession(page);
await client.send("Emulation.setCPUThrottlingRate", { rate: cpuThrottle });
const pageErrors = [];
const consoleErrors = [];
const failedRequests = [];
const badResponses = [];
page.on("pageerror", error => pageErrors.push(error.message));
page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("requestfailed", request => {
    const url = request.url();
    if (!url.startsWith("data:") && !url.startsWith("blob:")) {
        failedRequests.push({ url, reason: request.failure()?.errorText || "request failed" });
    }
});
page.on("response", response => {
    if (response.status() >= 400 && response.url().startsWith(baseUrl)) {
        badResponses.push({ url: response.url(), status: response.status() });
    }
});

function round(value, digits = 2) {
    const factor = 10 ** digits;
    return Math.round((Number(value) || 0) * factor) / factor;
}

function stats(values) {
    const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return { count: 0, median: null, p95: null, max: null, mean: null };
    const at = p => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
    return {
        count: sorted.length,
        median: round(at(0.5), 3),
        p95: round(at(0.95), 3),
        max: round(sorted[sorted.length - 1], 3),
        mean: round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length, 3),
    };
}
function classifyPerformance(sample, durationMs) {
    const frames = sample.frames.slice();
    const longTasks = sample.longTasks || [];
    const application = [];
    const external = [];
    const rebuilds = [];
    for (const frame of frames) {
        const work = (Number(frame.drawMs) || 0) + (Number(frame.simMs) || 0) + (Number(frame.uiMs) || 0);
        const gapStart = Number(frame.presentedAt) - Number(frame.intervalMs);
        const overlapsLongTask = longTasks.some(task =>
            Number(task.start) < Number(frame.presentedAt)
            && Number(task.start) + Number(task.duration) > gapStart + 0.5);
        const externalGap = Number(frame.intervalMs) > frameBudgetMs
            && work < 12
            && !overlapsLongTask;
        if (externalGap) {
            external.push({ ...frame, appWorkMs: round(work, 3) });
        } else if (Number(frame.terrainBuildMs) > 0) {
            rebuilds.push({ ...frame, appWorkMs: round(work, 3) });
        } else {
            application.push({ ...frame, appWorkMs: round(work, 3) });
        }
    }
    const externalGapMs = external.reduce((sum, frame) => sum + Math.max(0, Number(frame.intervalMs) || 0), 0);
    const activeWallMs = Math.max(1, Number(sample.wallMs) - externalGapMs);
    const pick = (entries, field) => entries.map(entry => entry[field]);
    const rawFps = round(frames.length / Math.max(0.001, Number(sample.wallMs) / 1000), 3);
    return {
        interval: stats(pick(application, "intervalMs")),
        rawInterval: stats(pick(frames, "intervalMs")),
        rafInterval: stats(pick(frames, "rafIntervalMs")),
        // Steady per-frame draw excludes only a frame that actually rebuilt
        // the cached detail layer. That one-time rebuild is reported in
        // `rebuild`/`cold`; counting it as a steady draw would make a cache
        // raster event indistinguishable from a per-frame understory cost.
        draw: stats(pick(application, "drawMs")),
        drawAll: stats(pick([...application, ...rebuilds], "drawMs")),
        rebuilds: stats(pick(rebuilds, "drawMs")),
        rebuildFrames: rebuilds.length,
        ui: stats(pick(application, "uiMs")),
        simulation: stats(pick(application, "simMs")),
        applicationFrames: application.length,
        rawFrames: frames.length,
        externalGaps: external.map(frame => ({
            intervalMs: frame.intervalMs,
            rafIntervalMs: frame.rafIntervalMs,
            appWorkMs: frame.appWorkMs,
            drawMs: frame.drawMs,
            simMs: frame.simMs,
            uiMs: frame.uiMs,
        })),
        externalGapCount: external.length,
        externalGapMs: round(externalGapMs, 3),
        activeWallMs: round(activeWallMs, 3),
        rawFps,
        // Primary presentation rate: every presented frame over the actual
        // first-to-last wall clock. A long no-work gap is inside this
        // denominator and lowers the number; no external-gap time is
        // subtracted and no catch-up frame is invented.
        presentationSpanMs: round(Number(sample.presentationSpanMs) || 0, 3),
        presentationFps: frames.length > 1
            ? round(frames.length / Math.max(0.001, Number(sample.presentationSpanMs) / 1000), 3)
            : 0,
        frameSpanFps: frames.length > 1
            ? round(frames.length / Math.max(0.001, Number(sample.presentationSpanMs) / 1000), 3)
            : 0,
        // Diagnostic only. This is the rate while JavaScript had CPU; it is
        // never used for the >=30 FPS gate because that would erase stalls.
        workFps: round(frames.length / Math.max(0.001, (Number(durationMs) - externalGapMs) / 1000), 3),
        longTaskCount: longTasks.length,
        longTaskMs: round(longTasks.reduce((sum, task) => sum + Number(task.duration || 0), 0), 3),
        jungle: sample.jungle || null,
    };
}

// Run the entire measurement inside one page.evaluate. No CDP interaction
// happens between the start and end markers, so a wall-clock gap cannot be
// caused by a harness navigation/read. The independent rAF counter and
// PerformanceObserver long-task list are returned with the frames.
async function measureInPage({ day, seasonIndex, tile, kind, durationMs = 2200, forceDetailRebuild = false, prewarmDetail = true }) {
    return page.evaluate(async ({ day, seasonIndex, tile, kind, durationMs, zoom, forceDetailRebuild, prewarmDetail, understoryMode }) => {
        const [
            { state }, { clampCamera }, { CELL }, { revealArea },
        ] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/presentation/camera.js"),
            import("./js/core/config.js"),
            import("./js/world/world.js"),
        ]);
        state.isPaused = false;
        state.gameOver = false;
        state.weather = "clear";
        state.timeOfDay = 12;
        state.frameLimit = 30;
        state.renderScale = 0.5;
        state.adaptiveQuality = true;
        state.showFps = false;
        state.entities = state.entities.filter(entity => entity.dead || entity.type === 0);
        state.dayOfYear = day;
        state.seasonIndex = seasonIndex;
        state.zoom = zoom;
        state.zoomTarget = zoom;
        state.zoomLevel = 4;
        state.zoomAnchor = null;
        state.camera.x = (tile.x + 0.5) * CELL * state.zoom - state.canvas.width / 2;
        state.camera.y = (tile.y + 0.5) * CELL * state.zoom - state.canvas.height / 2;
        clampCamera();
        if (understoryMode) {
            // The understory sample must see real jungle art, not fog of war.
            // The selected tile can be far from the starting district, so
            // reveal the measured viewport through the production exploration
            // function.
            revealArea(tile.x, tile.y, 10);
            // Season changes and exploration invalidate the detail layer. Build
            // it before opening the measured window; the cold rebuild has its
            // own sample below. A small camera move makes the settled-view
            // guard carry out the rebuild even when a previous layer exists.
            if (prewarmDetail) {
                state.camera.x += CELL * 0.25;
                clampCamera();
                state.terrainCacheRevision = (Number(state.terrainCacheRevision) || 0) + 1;
            }
        }
        // Let the camera/settle window finish before opening the measured
        // window. This wait is outside the probe and is therefore not counted.
        await new Promise(resolve => setTimeout(resolve, understoryMode && prewarmDetail ? 520 : 280));

        const longTasks = [];
        let observer = null;
        try {
            if (typeof PerformanceObserver === "function"
                && PerformanceObserver.supportedEntryTypes?.includes("longtask")) {
                observer = new PerformanceObserver(list => {
                    for (const entry of list.getEntries()) {
                        longTasks.push({ start: entry.startTime, duration: entry.duration });
                    }
                });
                observer.observe({ entryTypes: ["longtask"] });
            }
        } catch { /* longtask is a diagnostic, not a prerequisite */ }

        const probe = {
            frames: [], limit: 1000,
            lastPresentedAt: performance.now(), lastRenderedAt: 0,
            jungle: { understoryCalls: 0, understoryDirectCalls: 0, understoryTropicalCalls: 0, understoryMs: 0, understoryMaxMs: 0 },
        };
        state.performanceProbe = probe;
        // A fixed camera normally keeps the baked detail layer cached, which
        // means the understory pass runs only on the cold rebuild. This option
        // makes that rebuild visible in a dedicated sample instead of letting
        // the cached steady state hide its cost.
        if (forceDetailRebuild) {
            // Change both the cache revision and the camera signature. The
            // latter makes the settled-view guard schedule a real detail
            // rebuild even when a previous cached layer exists.
            state.camera.x += CELL * 0.25;
            clampCamera();
            state.terrainCacheRevision = (Number(state.terrainCacheRevision) || 0) + 1;
        }
        const wallStart = performance.now();
        const renderedStart = Number(state.renderedFrames) || 0;
        let rafTicks = 0;
        let lastRafAt = 0;
        const rafGaps = [];
        let running = true;
        const rafTick = timestamp => {
            if (!running) return;
            rafTicks++;
            if (lastRafAt > 0) rafGaps.push(timestamp - lastRafAt);
            lastRafAt = timestamp;
            requestAnimationFrame(rafTick);
        };
        requestAnimationFrame(rafTick);
        await new Promise(resolve => setTimeout(resolve, durationMs));
        running = false;
        observer?.disconnect();
        const wallMs = performance.now() - wallStart;
        const renderedEnd = Number(state.renderedFrames) || 0;
        const frames = probe.frames.slice();
        const jungle = probe.jungle ? {
            understoryCalls: Number(probe.jungle.understoryCalls) || 0,
            understoryDirectCalls: Number(probe.jungle.understoryDirectCalls) || 0,
            understoryTropicalCalls: Number(probe.jungle.understoryTropicalCalls) || 0,
            understoryMs: Math.round((Number(probe.jungle.understoryMs) || 0) * 1000) / 1000,
            understoryMaxMs: Math.round((Number(probe.jungle.understoryMaxMs) || 0) * 1000) / 1000,
            understoryAvgMs: probe.jungle.understoryCalls
                ? Math.round((Number(probe.jungle.understoryMs) / probe.jungle.understoryCalls) * 1000) / 1000
                : 0,
        } : null;
        const presentationSpanMs = frames.length > 1
            ? Math.max(0, Number(frames[frames.length - 1].presentedAt) - Number(frames[0].presentedAt))
            : 0;
        state.performanceProbe = null;
        return {
            kind, day, tile, durationMs, wallMs: Math.round(wallMs * 1000) / 1000,
            presentationSpanMs: Math.round(presentationSpanMs * 1000) / 1000,
            frames, renderedFramesDelta: Math.max(0, renderedEnd - renderedStart),
            rafTicks, rafGaps: rafGaps.map(value => Math.round(value * 1000) / 1000),
            longTasks, visibilityState: document.visibilityState,
            autonomous: true, harnessPauses: 0,
            cacheMisses: Number(state.terrainCacheMisses) || 0,
            cacheHits: Number(state.terrainCacheHits) || 0,
            terrainRevision: Number(state.terrainCacheRevision) || 0,
            terrainBuildMs: Number(state.terrainDecorationBuildMs) || 0,
            terrainTreeDraws: Number(state.terrainTreeDraws) || 0,
            terrainSurface: Boolean(state.terrainCanvasEl),
            renderCatchups: Number(state.renderCatchups) || 0,
            buildMs: Number(state.terrainDecorationBuildMs) || 0,
            renderStats: { ...(state.renderStats || {}) },
            terrainMode: state.terrainMode,
            terrainFallback: state.terrainFallback === true,
            renderScale: state.renderScale,
            canvas: state.canvas ? { width: state.canvas.width, height: state.canvas.height } : null,
            lastDrawMs: Number(state.lastDrawMs) || 0,
            lastWorldDrawMs: Number(state.lastWorldDrawMs) || 0,
            lastUiRenderMs: Number(state.lastUiRenderMs) || 0,
            jungle,
        };
    }, { day, seasonIndex, tile, kind, durationMs, zoom, forceDetailRebuild, prewarmDetail, understoryMode: measureUnderstory });
}

async function dismissBlockingMessage() {
    const eventDismiss = page.locator("#realm-event-dismiss");
    if (await eventDismiss.isVisible().catch(() => false)) {
        await eventDismiss.click();
        await page.waitForTimeout(100);
    }
    const close = page.locator("#big-message-close");
    if (await close.isVisible().catch(() => false)) await close.click();
}

async function openManagementBuildings() {
    await page.locator("#command-open-btn").click();
    await page.waitForTimeout(180);
    const tab = page.locator('[data-command-tab="buildings"]');
    if (await tab.isVisible().catch(() => false)) {
        await tab.click();
    } else {
        const select = page.locator("#command-tab-select");
        if (await select.isVisible().catch(() => false)) {
            await select.selectOption({ label: "BUILDINGS" }).catch(async () => {
                await select.selectOption({ value: "buildings" });
            });
        } else {
            await page.evaluate(() => document.querySelector('[data-command-tab="buildings"]')?.click());
        }
    }
    await page.locator("#command-panel-content .building-record").first().waitFor({ state: "visible", timeout: 8000 });
}

async function readBuildingRecord(id) {
    const record = page.locator(`#command-panel-content .building-record[data-building-id="${id}"]`);
    await record.waitFor({ state: "attached", timeout: 8000 });
    await record.evaluate(element => { element.open = true; });
    // The records can sit below the dialog scroll fold; innerText is empty for
    // those, so read the rendered DOM text directly.
    return (await record.evaluate(element => element.textContent || "")).replace(/\s+/g, " ").trim();
}

const phase = name => console.log("[jungle-proof] " + name);

try {
    phase("starting bundled game");
    await page.goto(baseUrl + "/", { waitUntil: "networkidle", timeout: 60000 });
    await page.locator("#world-seed-input").fill(String(seed));
    await page.locator("#player-name-input").fill("Jungle Browser Proof");
    if (await page.locator("#world-climate").count()) {
        await page.locator("#world-climate").selectOption("tropical");
    }
    await page.locator("#world-forests").evaluate(element => {
        element.value = "78";
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 45000 });
    await page.waitForTimeout(900);
    await dismissBlockingMessage();

    phase("game started");
    report.environment.bundle = externalBase || "artifacts/kings-and-cards-deploy/public";
    report.environment.bundleIndexSha256 = createHash("sha256")
        .update(await readFile(resolve(builtRoot, "index.html")))
        .digest("hex");

    // Select real tiles once, on the generated tropical map. The scenario is
    // built from production stands, never from hand-authored coordinates.
    const selection = await page.evaluate(async ({ seedValue }) => {
        const [
            { state },
            { TYPE },
            { getResourceNodeAt },
            { forestSightBlock, forestSightProfile },
            { isWalkable },
            { getForestMovementFactorAt },
            { isWaterAt },
        ] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/core/types.js"),
            import("./js/systems/resource-geography.js"),
            import("./js/world/forest-ecology.js"),
            import("./js/simulation/villagers.js"),
            import("./js/systems/resource-geography.js"),
            import("./js/world/world.js"),
        ]);
        state.isPaused = true;
        state.gameOver = false;
        state.entities = state.entities.filter(entity => entity.dead || entity.isBuilding?.());
        state.pendingPresentationEffects = [];
        const width = Number(state.worldW);
        const height = Number(state.worldH);
        const runClear = (x, y, dx, dy, length, forestOnly = false, nonForest = false) => {
            for (let step = 1; step <= length; step++) {
                const tx = x + dx * step;
                const ty = y + dy * step;
                if (!isWalkable(tx + 0.5, ty + 0.5)) return false;
                if (forestOnly || nonForest) {
                    const candidate = getResourceNodeAt(tx, ty);
                    const hasForest = Boolean(candidate?.forestCapacity);
                    if (forestOnly && !hasForest) return false;
                    if (nonForest && hasForest) return false;
                }
            }
            return true;
        };
        const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        let dense = null;
        let open = null;
        let trail = null;
        let openCombat = null;
        let hidden = null;
        let control = null;
        let denseCount = 0;
        let trailCount = 0;
        let hiddenCount = 0;
        for (let y = 2; y < height - 2; y++) {
            for (let x = 2; x < width - 2; x++) {
                const node = getResourceNodeAt(x, y);
                if (!node?.forestJungle || !(node.forestStock > 0)) continue;
                const jungle = node.forestJungle;
                const stand = node.forestStand;
                const block = forestSightBlock(stand);
                const denseScore = Number(jungle.features["1.2.5.10"] || 0) * 2
                    + Number(jungle.features["1.2.5.14"] || 0)
                    + block;
                if (block > 0.2 && denseScore > (dense?.score || 0) && isWalkable(x + 0.5, y + 0.5)) {
                    denseCount++;
                    for (const [dx, dy] of directions) {
                        if (runClear(x, y, dx, dy, 6, true, false)) {
                            dense = {
                                x, y, dx, dy, score: denseScore,
                                factor: getForestMovementFactorAt(x + 0.5, y + 0.5),
                                sight: forestSightProfile(stand),
                                sightBlock: block,
                                sightRadius: Number(stand?.sightRadius) || 0,
                                visibility: Number(stand?.visibility) || 0,
                                jungle: {
                                    summary: jungle.summary, type: jungle.type,
                                    impenetrable: jungle.features["1.2.5.10"],
                                    walls: jungle.features["1.2.5.14"],
                                    ambush: jungle.navigation.ambushChance,
                                    supply: jungle.navigation.supplyFactor,
                                    defence: jungle.navigation.defenceBonus,
                                    guerrilla: jungle.navigation.guerrillaBonus,
                                    local: jungle.navigation.localAdvantage,
                                    sightRadius: stand.sightRadius,
                                },
                            };
                            break;
                        }
                    }
                }
                const openSight = Boolean(jungle.landscape?.clearing || jungle.landscape?.animalTrail || jungle.landscape?.passage);
                if (openSight && block === 0 && forestSightBlock(stand) === 0) {
                    trailCount++;
                    if (!trail || (jungle.landscape?.animalTrail && !trail.animalTrail)) {
                        trail = {
                            x, y,
                            animalTrail: Boolean(jungle.landscape?.animalTrail),
                            clearing: Boolean(jungle.landscape?.clearing),
                            passage: Boolean(jungle.landscape?.passage),
                            factor: getForestMovementFactorAt(x + 0.5, y + 0.5),
                            sight: forestSightProfile(stand),
                            sightBlock: forestSightBlock(stand),
                            sightRadius: stand.sightRadius,
                            visibility: stand.visibility,
                            ambush: jungle.navigation.ambushChance,
                            supply: jungle.navigation.supplyFactor,
                        };
                    }
                }
                const rare = jungle.resources?.hiddenRareResources || [];
                if (jungle.landscape?.hiddenGlade && rare.length) {
                    hiddenCount++;
                    if (!hidden) {
                        hidden = {
                            x, y,
                            rare: rare.map(entry => entry.id),
                            sight: forestSightProfile(stand),
                            sightBlock: forestSightBlock(stand),
                            sightRadius: stand.sightRadius,
                            hasWaterfall: Boolean(jungle.landscape?.waterfall),
                            resources: jungle.resources,
                        };
                    }
                }
                if (!openCombat && !node.forestCapacity && isWalkable(x + 0.5, y + 0.5)) {
                    openCombat = { x, y };
                }
                if (!open) {
                    const isOpen = !node.forestCapacity && isWalkable(x + 0.5, y + 0.5);
                    if (isOpen) {
                        for (const length of [6, 4, 3]) {
                            for (const [dx, dy] of directions) {
                                if (runClear(x, y, dx, dy, length, false, true)) {
                                    open = {
                                        x, y, dx, dy,
                                        factor: getForestMovementFactorAt(x + 0.5, y + 0.5),
                                        sight: forestSightProfile(stand),
                                        sightBlock: 0,
                                        fallbackTrail: false,
                                    };
                                    break;
                                }
                            }
                            if (open) break;
                        }
                    }
                }
            }
        }
        if (!dense) throw new Error("No dense walkable jungle tile was found (count=" + denseCount + ")");
        if (!trail) throw new Error("No open trail/clearing jungle tile was found (count=" + trailCount + ")");
        if (!open && trail) {
            for (const length of [5, 4, 3]) {
                for (const [dx, dy] of directions) {
                    if (runClear(trail.x, trail.y, dx, dy, length, false, false)) {
                        open = {
                            x: trail.x, y: trail.y, dx, dy,
                            factor: getForestMovementFactorAt(trail.x + 0.5, trail.y + 0.5),
                            sight: trail.sight,
                            sightBlock: trail.sightBlock,
                            fallbackTrail: true,
                        };
                        break;
                    }
                }
                if (open) break;
            }
        }
        if (!control) {
            for (let y = 3; y < height - 3 && !control; y++) {
                for (let x = 3; x < width - 3; x++) {
                    if (isWaterAt(x + 0.5, y + 0.5)) { control = { x, y }; break; }
                }
            }
        }
        if (!open) throw new Error("No open walkable path could be found for the movement control");
        if (!control) throw new Error("No water/empty control tile was found");
        // This tropical realm can be fully wooded up to the waterline. The
        // open-trail/clearing tile is then the genuine exposed control: it has
        // no jungle sight wall and a lower cover profile than the closed wall.
        if (!openCombat) openCombat = trail;
        if (!hidden) throw new Error("No hidden glade with rare resources was found (count=" + hiddenCount + ")");
        if (Number(dense.factor) >= Number(open.factor)) {
            throw new Error("The selected dense jungle tile is not slower than open ground: dense="
                + JSON.stringify({ x: dense.x, y: dense.y, factor: dense.factor, trail: dense.jungle })
                + " open=" + JSON.stringify({ x: open.x, y: open.y, factor: open.factor, fallbackTrail: open.fallbackTrail }));
        }
        return {
            seed: seedValue,
            world: { width, height },
            climate: state.worldOptions?.climate || null,
            forests: state.worldOptions?.forests ?? null,
            dense, trail, hidden, open, openCombat, control,
            counts: { dense: denseCount, trail: trailCount, hidden: hiddenCount },
        };
    }, { seedValue: seed });
    phase("scenario selected: dense " + selection.dense.x + "," + selection.dense.y
        + " / trail " + selection.trail.x + "," + selection.trail.y
        + " / hidden " + selection.hidden.x + "," + selection.hidden.y);
    report.world = selection.world;
    report.tiles = selection;

    // Real villager movement through the production movement engine.
    const movement = await page.evaluate(async ({ dense, open }) => {
        const [
            { state }, { TYPE }, { spawnEntity },
            { updateFriendlyMovement }, { ROUTINE },
            { getForestMovementFactorAt },
        ] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/core/types.js"),
            import("./js/world/entities.js"),
            import("./js/simulation/villagers.js"),
            import("./js/core/config.js"),
            import("./js/systems/resource-geography.js"),
        ]);
        const run = tile => {
            const unit = spawnEntity(tile.x, tile.y, TYPE.VILLAGER);
            if (!unit) throw new Error("Could not spawn the movement villager");
            unit.x = tile.x + 0.5;
            unit.y = tile.y + 0.5;
            unit.anchor = { x: unit.x, y: unit.y };
            unit.home = { ...unit.anchor };
            unit.targetX = tile.x + tile.dx * 5 + 0.5;
            unit.targetY = tile.y + tile.dy * 5 + 0.5;
            unit.routinePhase = ROUTINE.ON_BREAK;
            unit.routineTimer = 99999;
            unit.movePause = 0;
            unit.path = null;
            unit.velocityX = 0;
            unit.velocityY = 0;
            return unit;
        };
        state.isPaused = false;
        state.gameOver = false;
        state.entities = state.entities.filter(entity => entity.dead || entity.isBuilding?.());
        const denseUnit = run(dense);
        const openUnit = run(open);
        const denseStart = { x: denseUnit.x, y: denseUnit.y };
        const openStart = { x: openUnit.x, y: openUnit.y };
        for (let step = 0; step < 100; step++) updateFriendlyMovement(1 / 30);
        const distance = (from, unit) => Math.hypot(unit.x - from.x, unit.y - from.y);
        const result = {
            dense: {
                start: denseStart,
                end: { x: denseUnit.x, y: denseUnit.y },
                distance: distance(denseStart, denseUnit),
                factor: getForestMovementFactorAt(dense.x + 0.5, dense.y + 0.5),
            },
            open: {
                start: openStart,
                end: { x: openUnit.x, y: openUnit.y },
                distance: distance(openStart, openUnit),
                factor: getForestMovementFactorAt(open.x + 0.5, open.y + 0.5),
            },
            updates: 100,
            stepSeconds: 1 / 30,
        };
        denseUnit.dead = true;
        openUnit.dead = true;
        state.isPaused = true;
        return result;
    }, { dense: selection.dense, open: selection.open });
    phase("movement driven through production engine");
    report.movement = movement;

    // Live combat with a local levy, a jungle defender and supply attrition.
    const combat = await page.evaluate(async ({ dense, open }) => {
        const [
            { state }, { TYPE }, { spawnEntity }, { updateCombat },
        ] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/core/types.js"),
            import("./js/world/entities.js"),
            import("./js/simulation/combat.js"),
        ]);
        state.isPaused = true;
        state.gameOver = false;
        state.entities = state.entities.filter(entity => entity.dead || entity.isBuilding?.());
        state.pendingPresentationEffects = [];
        const spawnPair = (tile, local) => {
            const guard = spawnEntity(tile.x, tile.y, TYPE.GUARD);
            const enemy = spawnEntity(tile.x + 0.7, tile.y + 0.1, TYPE.TROLL);
            if (!guard || !enemy) throw new Error("Could not spawn the combat pair");
            guard.x = tile.x + 0.5;
            guard.y = tile.y + 0.5;
            guard.hp = 10000;
            guard.maxHp = 10000;
            guard.military = {
                origin: local ? "levy" : "opening-garrison",
                name: local ? "Jungle Levy" : "Foreign Guard",
            };
            enemy.x = tile.x + 0.7;
            enemy.y = tile.y + 0.1;
            enemy.hp = 10000;
            enemy.maxHp = 10000;
            enemy.dead = false;
            return { guard, enemy };
        };
        const densePair = spawnPair(dense, true);
        const openPair = spawnPair(open, false);
        const floaters = () => (state.pendingPresentationEffects || [])
            .filter(effect => effect?.type === "floater")
            .map(effect => String(effect.text));
        let ambush = null;
        for (let tick = 23; tick <= 23 * 8 && !ambush; tick += 23) {
            state.tick = tick;
            state.pendingPresentationEffects = [];
            updateCombat();
            if (floaters().includes("AMBUSH")) {
                ambush = { tick, floaters: floaters(), enemyHpAfter: densePair.enemy.hp };
            }
        }
        if (!ambush) throw new Error("The live combat loop never emitted an AMBUSH event");
        state.tick = 37;
        state.pendingPresentationEffects = [];
        const supplyBefore = densePair.enemy.hp;
        updateCombat();
        const supplyAfter = densePair.enemy.hp;
        const supplyFloaters = floaters();

        state.tick = 13;
        state.pendingPresentationEffects = [];
        const denseGuardBefore = densePair.guard.hp;
        const openGuardBefore = openPair.guard.hp;
        updateCombat();
        const coverDamageDense = denseGuardBefore - densePair.guard.hp;
        const coverDamageOpen = openGuardBefore - openPair.guard.hp;

        state.tick = 14;
        state.pendingPresentationEffects = [];
        const denseEnemyBefore = densePair.enemy.hp;
        const openEnemyBefore = openPair.enemy.hp;
        updateCombat();
        const localDamage = denseEnemyBefore - densePair.enemy.hp;
        const foreignDamage = openEnemyBefore - openPair.enemy.hp;

        densePair.guard.dead = true;
        openPair.guard.dead = true;
        densePair.enemy.dead = true;
        openPair.enemy.dead = true;
        state.pendingPresentationEffects = [];
        return {
            ambush,
            supply: { tick: 37, before: supplyBefore, after: supplyAfter, damage: supplyBefore - supplyAfter, floaters: supplyFloaters },
            cover: { denseDamage: coverDamageDense, openDamage: coverDamageOpen },
            localDamage: { jungleLevy: localDamage, openGuard: foreignDamage },
            tactics: {
                dense: dense,
                open: open,
            },
        };
    }, { dense: selection.dense, open: selection.openCombat });
    phase("combat tick loop produced ambush/supply/cover");
    report.combat = combat;

    // Gather the eight jungle resource families through the production ledger.
    const gathering = await page.evaluate(async ({ dense, trail, hidden }) => {
        const [
            { state }, { getResourceNodeAt }, { forestProductsAt, gatherForestProducts, ensureForestGathering },
            { JUNGLE_RESOURCE_GROUPS },
        ] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/resource-geography.js"),
            import("./js/systems/forest-gathering.js"),
            import("./js/world/jungle-ecology.js"),
        ]);
        const ledger = ensureForestGathering();
        ledger.stock = {};
        ledger.lastGather = {};
        ledger.history = [];
        // Keep the scan bounded: an exhaustive 176x176 product rebuild on a
        // 4x-throttled CPU is a harness stall, not a game cost. The selected
        // glade and its surroundings carry every resource family.
        const candidates = [];
        const seen = new Set();
        const addWindow = (cx, cy, radius) => {
            for (let y = Math.max(2, cy - radius); y <= Math.min(Number(state.worldH) - 2, cy + radius); y++) {
                for (let x = Math.max(2, cx - radius); x <= Math.min(Number(state.worldW) - 2, cx + radius); x++) {
                    const key = x + ":" + y;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    const node = getResourceNodeAt(x, y);
                    if (!node?.forestJungle || !(node.forestStock > 0)) continue;
                    candidates.push({ x, y, node });
                }
            }
        };
        addWindow(hidden.x, hidden.y, 14);
        addWindow(dense.x, dense.y, 6);
        addWindow(trail.x, trail.y, 6);
        const groupResults = {};
        for (const [group, ids] of Object.entries(JUNGLE_RESOURCE_GROUPS)) {
            const groupTiles = candidates.filter(candidate => candidate.node.forestJungle.resources?.[group]?.length);
            let chosen = null;
            let result = null;
            for (const candidate of groupTiles.slice(0, 24)) {
                const attempt = gatherForestProducts(candidate.x, candidate.y, { dayOfYear: 120, year: 1 });
                ledger.lastGather = {};
                if (attempt.ok && attempt.goods.some(good => ids.includes(good.id))) {
                    chosen = { x: candidate.x, y: candidate.y };
                    result = attempt;
                    break;
                }
            }
            if (!chosen || !result) throw new Error("No real tile produced the resource group " + group);
            groupResults[group] = {
                tile: chosen,
                goods: result.goods.map(good => ({ id: good.id, amount: good.amount, label: good.label })),
            };
        }
        const hiddenProducts = forestProductsAt(hidden.x, hidden.y, 150);
        const hiddenResult = gatherForestProducts(hidden.x, hidden.y, { dayOfYear: 130, year: 1 });
        if (!hiddenResult.ok) throw new Error("Hidden-location gathering failed: " + hiddenResult.reason);
        ledger.lastGather = {};
        const flatStock = Object.entries(ledger.stock).filter(([, amount]) => Number(amount) > 0);
        return {
            groups: groupResults,
            hidden: {
                tile: { x: hidden.x, y: hidden.y },
                products: (hiddenProducts?.goods || []).map(good => ({ id: good.id, category: good.category, abundance: good.abundance })),
                gathered: hiddenResult.goods.map(good => ({ id: good.id, amount: good.amount, label: good.label })),
                resources: hidden.resources,
            },
            stock: Object.fromEntries(flatStock),
            stockCount: flatStock.length,
            history: ledger.history.length,
        };
    }, { dense: selection.dense, trail: selection.trail, hidden: selection.hidden });
    phase("gathering written to production ledger");
    report.gathering = gathering;

    // Open the real building register and read the jungle fields from the same
    // lumber-yard record a player sees.
    const uiFixture = await page.evaluate(async ({ dense, trail, hidden }) => {
        const [
            { state }, { TYPE }, { spawnEntity },
        ] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/core/types.js"),
            import("./js/world/entities.js"),
        ]);
        state.isPaused = true;
        state.entities = state.entities.filter(entity => entity.dead || entity.isBuilding?.());
        const create = tile => {
            const building = spawnEntity(tile.x, tile.y, TYPE.LUMBER);
            if (!building) throw new Error("Could not create the jungle lumber-yard UI fixture");
            building.x = tile.x;
            building.y = tile.y;
            building.dead = false;
            building.hp = Math.max(1, Number(building.hp) || 1);
            building.maxHp = Math.max(building.hp, Number(building.maxHp) || building.hp);
            building.construction = { stage: 3, progress: 100, reason: "COMPLETED" };
            return { id: building.id, x: tile.x, y: tile.y };
        };
        const result = { dense: create(dense), trail: create(trail), hidden: create(hidden) };
        state.buildingCollisionVersion = (Number(state.buildingCollisionVersion) || 0) + 1;
        return result;
    }, { dense: selection.dense, trail: selection.trail, hidden: selection.hidden });
    phase("lumber-yard UI fixtures created");
    report.uiFixture = uiFixture;

    await openManagementBuildings();
    const ui = {
        dense: await readBuildingRecord(uiFixture.dense.id),
        trail: await readBuildingRecord(uiFixture.trail.id),
        hidden: await readBuildingRecord(uiFixture.hidden.id),
    };
    const hiddenButton = page.locator(`[data-gather-forest="${uiFixture.hidden.id}"]`);
    assert.equal(await hiddenButton.count(), 1, "the hidden-glade lumber yard must expose its gather action");
    await hiddenButton.evaluate(button => button.click());
    await page.waitForFunction(() => /GATHERED/i.test(document.querySelector("#action-toast")?.textContent || ""), null, { timeout: 8000 }).catch(() => {});
    const hiddenToast = (await page.locator("#action-toast").innerText()).trim();
    const hiddenAfterClick = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        return {
            stock: { ...(state.forestGathering?.stock || {}) },
            toast: document.querySelector("#action-toast")?.textContent || "",
        };
    });
    phase("real management panel read and hidden gather clicked");
    report.ui = { ...ui, hiddenGatherToast: hiddenToast, hiddenStockAfterClick: hiddenAfterClick.stock };
    await page.locator("#command-close").click();
    await page.locator("#command-modal").waitFor({ state: "hidden", timeout: 8000 });
    await page.waitForFunction(() => !document.body.classList.contains("ui-modal-open"), null, { timeout: 5000 }).catch(() => {});
    phase("management modal closed; world drawing resumed");
    await page.waitForTimeout(300);

    // Performance setup: one fixed camera and the same weak profile for every
    // window. No harness call happens inside the windows themselves.
    await page.evaluate(async ({ dense, days, zoom, understoryMode }) => {
        const [
            { state }, { setZoomLevel, clampCamera, resize }, { CELL }, { revealArea },
        ] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/presentation/camera.js"),
            import("./js/core/config.js"),
            import("./js/world/world.js"),
        ]);
        state.isPaused = false;
        state.gameOver = false;
        state.weather = "clear";
        state.timeOfDay = 12;
        state.frameLimit = 30;
        state.renderScale = 0.5;
        state.adaptiveQuality = true;
        state.showFps = false;
        state.entities = state.entities.filter(entity => entity.dead || entity.type === 0);
        resize();
        setZoomLevel(4);
        state.zoom = zoom;
        state.zoomTarget = zoom;
        state.zoomLevel = 4;
        state.zoomAnchor = null;
        state.camera.x = (dense.x + 0.5) * CELL * state.zoom - state.canvas.width / 2;
        state.camera.y = (dense.y + 0.5) * CELL * state.zoom - state.canvas.height / 2;
        clampCamera();
        if (understoryMode) revealArea(dense.x, dense.y, 10);
        state.dayOfYear = days[0];
        state.seasonIndex = 0;
        state.renderCatchups = 0;
        state.renderCatchupCredit = 0;
        state.terrainCacheRevision = (Number(state.terrainCacheRevision) || 0) + 1;
        await new Promise(resolve => setTimeout(resolve, 1200));
    }, { dense: selection.dense, days: seasonDays, zoom, understoryMode: measureUnderstory });

    phase("performance camera fixed at dense interior");
    // The normal camera is cached after the first detail build. Measure the
    // cold rebuild explicitly so the post-crown understory pass cannot be
    // hidden by the cache, then keep the season windows in the same steady
    // state used by the FPS gate.
    let cold = null;
    if (measureUnderstory) {
    const coldSample = await measureInPage({
        day: seasonDays[0], seasonIndex: 0, tile: selection.dense,
        kind: "cold-detail", durationMs: 1200, forceDetailRebuild: true, prewarmDetail: false,
    });
    const coldClassified = classifyPerformance(coldSample, coldSample.durationMs);
    cold = {
        kind: coldSample.kind,
        durationMs: coldSample.durationMs,
        frames: coldSample.frames.length,
        wallMs: coldSample.wallMs,
        presentationFps: coldClassified.presentationFps,
        draw: coldClassified.drawAll,
        drawSteady: coldClassified.draw,
        rebuilds: coldClassified.rebuilds,
        rebuildFrames: coldClassified.rebuildFrames,
        ui: coldClassified.ui,
        simulation: coldClassified.simulation,
        buildMs: coldSample.buildMs,
        jungle: coldSample.jungle,
        cacheMisses: coldSample.cacheMisses,
        terrainMode: coldSample.terrainMode,
        lastDrawMs: coldSample.lastDrawMs,
        lastWorldDrawMs: coldSample.lastWorldDrawMs,
    };
    console.log("[jungle-proof] cold detail rebuild: build " + cold.buildMs + " ms, understory "
        + cold.jungle?.understoryMs + " ms across " + cold.jungle?.understoryCalls + " calls, max "
        + cold.jungle?.understoryMaxMs + " ms, draw p95 " + cold.draw.p95
        + " ms, draw max " + cold.draw.max + " ms");
    }

    const performanceSeasons = [];
    for (let index = 0; index < seasonDays.length; index++) {
        const day = seasonDays[index];
        const sampled = await measureInPage({
            day, seasonIndex: Math.floor(day / 100) % 4,
            tile: selection.dense, kind: "season", durationMs: 2200,
        });
        const classified = classifyPerformance(sampled, sampled.durationMs);
        performanceSeasons.push({
            day,
            seasonIndex: Math.floor(day / 100) % 4,
            frames: sampled.frames.length,
            applicationFrames: classified.applicationFrames,
            interval: classified.interval,
            rawInterval: classified.rawInterval,
            rafInterval: classified.rafInterval,
            draw: classified.draw,
            drawAll: classified.drawAll,
            rebuilds: classified.rebuilds,
            rebuildFrames: classified.rebuildFrames,
            ui: classified.ui,
            simulation: classified.simulation,
            externalGapCount: classified.externalGapCount,
            externalGaps: classified.externalGaps,
            externalGapMs: classified.externalGapMs,
            activeWallMs: classified.activeWallMs,
            durationMs: sampled.durationMs,
            wallMs: sampled.wallMs,
            renderedFramesDelta: sampled.renderedFramesDelta,
            rawFps: classified.rawFps,
            presentationSpanMs: classified.presentationSpanMs,
            presentationFps: classified.presentationFps,
            workFps: classified.workFps,
            rafTicks: sampled.rafTicks,
            rafGapP95: stats(sampled.rafGaps).p95,
            rafIntervalP95: classified.rafInterval.p95,
            longTaskCount: classified.longTaskCount,
            longTaskMs: classified.longTaskMs,
            jungle: classified.jungle,
            visibilityState: sampled.visibilityState,
            autonomous: sampled.autonomous,
            harnessPauses: sampled.harnessPauses,
            rebuildMs: sampled.buildMs,
            cacheMisses: sampled.cacheMisses,
            renderCatchups: sampled.renderCatchups,
            renderStats: sampled.renderStats,
            terrainMode: sampled.terrainMode,
            terrainFallback: sampled.terrainFallback,
            renderScale: sampled.renderScale,
            canvas: sampled.canvas,
            lastDrawMs: sampled.lastDrawMs,
            lastWorldDrawMs: sampled.lastWorldDrawMs,
            lastUiRenderMs: sampled.lastUiRenderMs,
        });
        console.log("[jungle-proof] season " + day + ": " + sampled.frames.length + " frames, "
            + "raw p95 " + classified.rawInterval.p95 + " ms, app p95 " + classified.interval.p95
            + " ms, presentationFps " + classified.presentationFps + ", external gaps "
            + classified.externalGapCount + ", draw p95 " + classified.draw.p95
            + " ms, understory " + (classified.jungle?.understoryAvgMs ?? "?") + " ms/call x "
            + (classified.jungle?.understoryCalls ?? 0) + ", rebuild " + sampled.buildMs + " ms");
    }

    // Control: identical page, profile, camera mechanics and renderer, but a
    // static water tile with no jungle understorey. If the same no-work gaps
    // occur here, they are browser/CDP scheduling; if they disappear, the
    // winter result is a jungle bottleneck and must be fixed instead.
    phase("empty-water control window");
    const controlRuns = [];
    for (let attempt = 0; attempt < 3; attempt++) {
        const sample = await measureInPage({
            day: 350, seasonIndex: 3, tile: selection.control, kind: "empty-water", durationMs: 4000,
        });
        const classified = classifyPerformance(sample, sample.durationMs);
        const run = {
            attempt: attempt + 1,
            kind: "empty-water",
            tile: selection.control,
            frames: sample.frames.length,
            applicationFrames: classified.applicationFrames,
            interval: classified.interval,
            rawInterval: classified.rawInterval,
            rafInterval: classified.rafInterval,
            draw: classified.draw,
            ui: classified.ui,
            simulation: classified.simulation,
            externalGapCount: classified.externalGapCount,
            externalGaps: classified.externalGaps,
            externalGapMs: classified.externalGapMs,
            durationMs: sample.durationMs,
            wallMs: sample.wallMs,
            presentationSpanMs: classified.presentationSpanMs,
            presentationFps: classified.presentationFps,
            rawFps: classified.rawFps,
            workFps: classified.workFps,
            rafTicks: sample.rafTicks,
            rafGapP95: stats(sample.rafGaps).p95,
            rafIntervalP95: classified.rafInterval.p95,
            longTaskCount: classified.longTaskCount,
            longTaskMs: classified.longTaskMs,
            visibilityState: sample.visibilityState,
            autonomous: sample.autonomous,
            harnessPauses: sample.harnessPauses,
            renderStats: sample.renderStats,
            terrainMode: sample.terrainMode,
            canvas: sample.canvas,
        };
        controlRuns.push(run);
        if (run.externalGapCount > 0) break;
    }
    const control = controlRuns.reduce((best, run) =>
        (run.externalGapMs > best.externalGapMs ? run : best), controlRuns[0]);
    control.attempts = controlRuns.length;
    control.runs = controlRuns.map(run => ({
        attempt: run.attempt, frames: run.frames, applicationFrames: run.applicationFrames,
        presentationFps: run.presentationFps, rawFps: run.rawFps, wallMs: run.wallMs,
        externalGapCount: run.externalGapCount, externalGapMs: run.externalGapMs,
        externalGaps: run.externalGaps, longTaskCount: run.longTaskCount,
    }));
    console.log("[jungle-proof] empty-water control: attempts " + control.attempts
        + ", selected raw p95 " + control.rawInterval.p95 + " ms, app p95 "
        + control.interval.p95 + " ms, external gaps " + control.externalGapCount
        + ", presentationFps " + control.presentationFps);

    phase("season and control sampling complete; taking overall window");
    const overallSample = await measureInPage({
        day: 350, seasonIndex: 3, tile: selection.dense, kind: "overall", durationMs: 1600,
    });
    const overallClassified = classifyPerformance(overallSample, overallSample.durationMs);
    const overall = {
        frames: overallSample.frames.length,
        applicationFrames: overallClassified.applicationFrames,
        interval: overallClassified.interval,
        rawInterval: overallClassified.rawInterval,
        rafInterval: overallClassified.rafInterval,
        draw: overallClassified.draw,
        ui: overallClassified.ui,
        simulation: overallClassified.simulation,
        externalGapCount: overallClassified.externalGapCount,
        externalGaps: overallClassified.externalGaps,
        externalGapMs: overallClassified.externalGapMs,
        durationMs: overallSample.durationMs,
        wallMs: overallSample.wallMs,
        rawFps: overallClassified.rawFps,
        presentationSpanMs: overallClassified.presentationSpanMs,
        presentationFps: overallClassified.presentationFps,
        workFps: overallClassified.workFps,
        rafTicks: overallSample.rafTicks,
        rafGapP95: stats(overallSample.rafGaps).p95,
        rafIntervalP95: overallClassified.rafInterval.p95,
        longTaskCount: overallClassified.longTaskCount,
        longTaskMs: overallClassified.longTaskMs,
        visibilityState: overallSample.visibilityState,
        autonomous: overallSample.autonomous,
        harnessPauses: overallSample.harnessPauses,
        renderStats: overallSample.renderStats,
        terrainMode: overallSample.terrainMode,
        renderScale: overallSample.renderScale,
        canvas: overallSample.canvas,
        lastDrawMs: overallSample.lastDrawMs,
        lastUiRenderMs: overallSample.lastUiRenderMs,
    };

    report.performance = {
        profile: {
            viewport,
            devicePixelRatio: 1,
            cpuThrottle,
            frameLimit: 30,
            renderScale: 0.5,
            zoom,
            softwareGL: process.env.JUNGLE_PROOF_SOFTWARE_GL !== "0",
        },
        metric: {
            description: "Frame interval is the wall-clock performance.now() gap between frames actually presented by the game loop. Each 2.2 s window is one autonomous page.evaluate; no harness read, navigation or click occurs inside it. A gap is separated as an external no-work stall only when it exceeds the frame budget, the measured draw+sim+UI work is below 12 ms, and no PerformanceObserver long task overlaps it. Raw p95 is retained for every window, and the empty-water control uses exactly the same profile and code path.",
            rawAndApplication: "The p95 frame gate uses application frames, so a no-work scheduler gap cannot masquerade as application work. The required FPS gate instead uses presentationFps = all presented frames / wall-clock span from the first to the last presented frame, which includes every stall; no external-gap time is subtracted. workFps is shown only as a diagnostic and is never used for the gate.",
            limitations: "PerformanceObserver long tasks and CDP scheduling are browser diagnostics. The control does not prove intent, only that the same no-work gap occurs without jungle geometry; a real canvas/GPU or a browser without CDP throttling may produce a different distribution. The presentation span excludes the final rAF tail after the last frame, but includes every stall between presented frames.",
        },
        seasons: performanceSeasons,
        cold: cold,
        control: control,
        overall: overall,
        budgets: {
            frameP95Ms: frameBudgetMs,
            drawP95Ms: drawBudgetMs,
            uiP95Ms: uiBudgetMs,
            rationale: "The project already requires every draw pass and UI refresh to stay inside 16.7 ms (endurance audit), checked here at both p95 and max. The 50 ms frame-pacing p95 is the low-end floor for a 720x540, DPR-1, 50%-scale, SwiftShader, 30-FPS-cap run under CDP 4x CPU throttling; the empty-water control uses the same profile to distinguish an application stall from a scheduler gap. Application frames must also sustain at least 30 FPS over the measured window.",
        },
    };
    const aggregateFrames = performanceSeasons.reduce((sum, entry) => sum + entry.frames, 0);
    const aggregateApplicationFrames = performanceSeasons.reduce((sum, entry) => sum + entry.applicationFrames, 0);
    const aggregatePresentationSpanMs = performanceSeasons.reduce((sum, entry) => sum + Number(entry.presentationSpanMs || 0), 0);
    const aggregateWallMs = performanceSeasons.reduce((sum, entry) => sum + Number(entry.wallMs || 0), 0);
    const aggregatePresentationFrames = performanceSeasons.reduce((sum, entry) => sum + Math.max(0, entry.frames - 1), 0);
    report.performance.aggregate = {
        seasons: performanceSeasons.length,
        frames: aggregateFrames,
        applicationFrames: aggregateApplicationFrames,
        presentationSpanMs: round(aggregatePresentationSpanMs, 3),
        wallMs: round(aggregateWallMs, 3),
        presentationFps: round(aggregateFrames / Math.max(0.001, aggregatePresentationSpanMs / 1000), 3),
        windowFps: round(aggregateFrames / Math.max(0.001, aggregateWallMs / 1000), 3),
        frameSpanFps: round(aggregateFrames / Math.max(0.001, aggregatePresentationSpanMs / 1000), 3),
        method: "The four 2.2 s season windows are sampled sequentially. presentationFps = total presented frames / the sum of each window's first-to-last presented-frame wall span. Every no-work stall inside a window lies in its span and lowers the rate; no external-gap time is subtracted. Harness gaps between windows and the four start/end tails are not part of that span. windowFps sums the four full window walls and includes those tails; it is reported separately.",
    };

    phase("overall performance window complete");
    report.diagnostics = {
        pageErrors,
        consoleErrors,
        failedRequests,
        badResponses,
    };

    const denseText = ui.dense;
    const trailText = ui.trail;
    const parsePercent = (text, label) => {
        const match = text.match(new RegExp(label + "\\s+(\\d+)%", "i"));
        return match ? Number(match[1]) : null;
    };
    const parseSight = text => {
        const match = text.match(/Sight:\s*(\d+)\s*tiles/i);
        return match ? Number(match[1]) : null;
    };
    const denseUi = {
        hasJungle: /JUNGLE INTERIOR/i.test(denseText),
        layers: /Layers:/i.test(denseText),
        sight: parseSight(denseText),
        ambush: parsePercent(denseText, "Ambush"),
        cover: parsePercent(denseText, "Cover"),
        supply: parsePercent(denseText, "Supply"),
        guerrilla: parsePercent(denseText, "Guerrilla"),
        local: parsePercent(denseText, "Local"),
        disease: parsePercent(denseText, "Disease"),
        parasites: parsePercent(denseText, "Parasites"),
    };
    report.ui.fields = { dense: denseUi, trail: { sight: parseSight(trailText), hasJungle: /JUNGLE INTERIOR/i.test(trailText) } };

    const groupsFound = Object.fromEntries(Object.entries(gathering.groups).map(([group, result]) => [group, result.goods.map(good => good.id)]));
    const hiddenGoods = gathering.hidden.gathered.map(good => good.id);
    const stockIds = Object.keys(gathering.stock);
    report.evidence = {
        movement: {
            denseFactor: movement.dense.factor,
            openFactor: movement.open.factor,
            denseDistance: round(movement.dense.distance, 3),
            openDistance: round(movement.open.distance, 3),
            ratio: movement.open.distance > 0 ? round(movement.dense.distance / movement.open.distance, 3) : null,
        },
        sight: {
            denseBlock: selection.dense.sightBlock,
            trailBlock: selection.trail.sightBlock,
            denseSightRadius: selection.dense.sightRadius,
            trailSightRadius: selection.trail.sightRadius,
            denseLimited: selection.dense.sight.limited,
            trailLimited: selection.trail.sight.limited,
        },
        combat: {
            ambush: combat.ambush,
            supply: combat.supply,
            cover: combat.cover,
            localDamage: combat.localDamage,
        },
        gathering: { groups: groupsFound, hiddenGoods, stockIds },
        ui: report.ui.fields,
        performance: {
            seasons: performanceSeasons.map(entry => ({
                day: entry.day,
                frames: entry.frames,
                applicationFrames: entry.applicationFrames,
                rawIntervalP95: entry.rawInterval.p95,
                intervalP95: entry.interval.p95,
                presentationFps: entry.presentationFps,
                workFps: entry.workFps,
                rawFps: entry.rawFps,
                externalGapCount: entry.externalGapCount,
                externalGaps: entry.externalGaps,
                longTaskCount: entry.longTaskCount,
                drawP95: entry.draw.p95,
                drawMax: entry.draw.max,
                drawAllP95: entry.drawAll.p95,
                drawAllMax: entry.drawAll.max,
                rebuildFrames: entry.rebuildFrames,
                uiP95: entry.ui.p95,
                uiMax: entry.ui.max,
                simP95: entry.simulation.p95,
                simMax: entry.simulation.max,
                rebuildMs: entry.rebuildMs,
                mode: entry.terrainMode,
            })),
            aggregate: report.performance.aggregate,
            control: report.performance.control,
            overall: report.performance.overall,
        },
    };

    const failures = [];
    if (!(movement.dense.factor >= 0.55 && movement.dense.factor <= 1)) failures.push("dense movement factor is outside the documented 0.55-1 cap");
    if (!(movement.open.factor > movement.dense.factor && movement.open.factor <= 1)) failures.push("open tropical movement is not faster than dense jungle");
    if (!(movement.dense.distance < movement.open.distance * 0.85)) failures.push("the real villager did not move measurably slower through dense jungle");
    if (!(selection.dense.sightBlock > 0.2 && selection.dense.sight.limited === true)) failures.push("dense jungle does not restrict sight");
    if (!(selection.trail.sightBlock === 0 && selection.trail.sight.limited === false)) failures.push("trail/clearing sight is still blocked");
    if (!(selection.trail.sightRadius > selection.dense.sightRadius)) failures.push("trail sight radius is not more open than dense jungle");
    if (!(combat.ambush.tick > 0)) failures.push("ambush did not trigger");
    if (!(combat.supply.damage > 0 && combat.supply.floaters.includes("SUPPLY"))) failures.push("supply attrition did not trigger visibly");
    if (!(combat.cover.denseDamage < combat.cover.openDamage)) failures.push("jungle cover did not reduce incoming damage");
    if (!(combat.localDamage.jungleLevy > 0 && selection.dense.jungle.local > 0)) failures.push("local levy bonus was not exercised");
    for (const group of Object.keys(gathering.groups)) {
        if (!gathering.groups[group].goods.length) failures.push("no gathered goods for " + group);
    }
    if (!hiddenGoods.length) failures.push("the hidden location yielded no goods");
    if (!stockIds.length) failures.push("gathered goods never reached the production ledger stock");
    for (const field of ["layers", "sight", "ambush", "supply", "guerrilla", "disease", "parasites"]) {
        if (denseUi[field] === null || denseUi[field] === false) failures.push("the real UI is missing jungle field " + field);
    }
    if (!(Number(denseUi.sight) <= Number(report.ui.fields.trail.sight))) failures.push("the UI does not show a more open sight on the trail");
    if (!/HIDDEN GLADE|HIDDEN WATERFALL|RAVINE/i.test(ui.hidden)) failures.push("the hidden location is not labelled in the UI");
    if (!performanceSeasons.length) failures.push("no season performance samples were recorded");
    for (const entry of performanceSeasons) {
        const seasonLabel = "season " + entry.day;
        for (const field of ["interval", "draw", "ui"]) {
            const value = Number(entry[field]?.p95);
            const budget = field === "interval" ? frameBudgetMs : field === "draw" ? drawBudgetMs : uiBudgetMs;
            if (!Number.isFinite(value)) {
                failures.push(seasonLabel + " has no finite " + field + " p95");
            } else if (!(value <= budget)) {
                failures.push(seasonLabel + " " + field + " p95 " + value + " ms exceeds budget " + budget + " ms");
            }
        }
    }
    if (!(Number(report.performance.aggregate.presentationFps) >= 30)) {
        failures.push("aggregate presentation FPS " + report.performance.aggregate.presentationFps + " is below 30");
    }
    // A control gap with no season gap is informative, not an application
    // failure: the scheduler pause can occur in either window. The required
    // evidence is that a control attempt reproduces a gap at least once.
    if (controlRuns.every(run => run.externalGapCount === 0)
        && performanceSeasons.some(entry => entry.externalGapCount > 0)) {
        failures.push("no empty-water control attempt reproduced a scheduler stall; external-gap attribution is unproven");
    }
    for (const entry of performanceSeasons) {
        for (const field of ["draw", "ui"]) {
            const value = Number(entry[field]?.max);
            const budget = field === "draw" ? drawBudgetMs : uiBudgetMs;
            if (!Number.isFinite(value)) {
                failures.push("season " + entry.day + " has no finite " + field + " max");
            } else if (!(value <= budget)) {
                failures.push("season " + entry.day + " " + field + " max " + value + " ms exceeds the project's 16.7 ms per-pass budget");
            }
        }
        // The staged rebuild must not be hidden by the steady-only draw
        // bucket. Every frame, including a cache chunk and its swap, is
        // checked against the same 16.7 ms per-pass budget.
        const drawAllMax = Number(entry.drawAll?.max);
        if (!Number.isFinite(drawAllMax)) {
            failures.push("season " + entry.day + " has no finite drawAll max");
        } else if (!(drawAllMax <= drawBudgetMs)) {
            failures.push("season " + entry.day + " drawAll max " + drawAllMax + " ms exceeds the project's 16.7 ms per-pass budget");
        }
    }
    if (cold) {
        const coldDrawMax = Number(cold.draw?.max);
        if (!Number.isFinite(coldDrawMax)) {
            failures.push("cold detail rebuild has no finite draw max");
        } else if (!(coldDrawMax <= drawBudgetMs)) {
            failures.push("cold detail rebuild draw max " + coldDrawMax + " ms exceeds the project's 16.7 ms per-pass budget");
        }
    }
    if (pageErrors.length) failures.push("page errors: " + pageErrors.join(" | "));
    if (consoleErrors.length) failures.push("console errors: " + consoleErrors.join(" | "));
    if (failedRequests.length) failures.push("failed requests: " + failedRequests.map(entry => entry.url).join(" | "));
    if (badResponses.length) failures.push("HTTP errors: " + badResponses.map(entry => entry.status + " " + entry.url).join(" | "));

    report.failures = failures;
    report.ok = failures.length === 0;
    await writeFile(resolve(outputDir, "jungle-proof.json"), JSON.stringify(report, null, 2) + "\n");
    phase("report written: " + resolve(outputDir, "jungle-proof.json"));
    console.log("JUNGLE_BROWSER_PROOF " + JSON.stringify({
        ok: report.ok,
        bundle: report.environment.bundle,
        world: report.world,
        tiles: { dense: selection.dense, trail: selection.trail, hidden: selection.hidden, open: selection.open },
        movement: report.evidence.movement,
        sight: report.evidence.sight,
        combat: report.evidence.combat,
        gathering: report.evidence.gathering,
        ui: report.evidence.ui,
        performance: report.evidence.performance,
        failures,
    }, null, 2));
    if (failures.length) throw new Error("Jungle browser proof failed:\n" + failures.join("\n"));
} catch (error) {
    report.ok = false;
    const prior = Array.isArray(report.failures) ? report.failures : [];
    report.failures = [...prior, "fatal: " + String(error?.message || error)];
    await writeFile(resolve(outputDir, "jungle-proof.json"), JSON.stringify(report, null, 2) + "\n").catch(() => {});
    throw error;
} finally {
    // The report is a required artifact even when the proof aborts. A second
    // write is harmless on the success path and guarantees the file exists
    // with the latest failure state on every other path.
    await writeFile(resolve(outputDir, "jungle-proof.json"), JSON.stringify(report, null, 2) + "\n").catch(() => {});
    await browser.close().catch(() => {});
    if (server) await new Promise(resolveClose => server.close(resolveClose));
}
