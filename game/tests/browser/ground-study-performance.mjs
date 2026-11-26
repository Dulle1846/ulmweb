// Maximum-zoom ground-study proof.
//
// This is the real game, not a synthetic canvas benchmark: a fixed seed founds
// a realm, the normal terrain pass is switched to WebGL2, and the camera is
// placed on a dense, dry forest tile that owns both a simulated herbivore herd
// and saved insect colonies. At 5.4× and 7.4× the script waits for the staged
// decoration cache, then records the real rAF/presentation intervals and the
// game loop's own draw/build timings. The previous raster is deliberately kept
// until the replacement is complete, so a rebuild is sliced rather than hidden
// behind a long task.
//
// Usage: npm run test:ground-study
// Output: docs/terrain-reference/ground-study-performance.json

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { browserLaunchOptions, checkBrowser, printBrowserHelp } from "./browser-preflight.mjs";

const gameRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
process.chdir(gameRoot);
const seed = Number(process.env.GROUND_STUDY_SEED || 20261104);
const viewport = { width: 1280, height: 800 };
const outputDir = path.resolve(process.env.GROUND_STUDY_OUT || path.join(gameRoot, "docs/terrain-reference"));
const sampleMs = Math.max(1500, Number(process.env.GROUND_STUDY_SAMPLE_MS || 4000));
const settleWaitMs = Math.max(300, Number(process.env.GROUND_STUDY_SETTLE_MS || 900));
const zooms = [5.4, 7.4];
const day = 150;
const BUDGET = Object.freeze({
    p95FrameMs: Number(process.env.GROUND_STUDY_P95_MS || 33),
    p95WorldDrawMs: Number(process.env.GROUND_STUDY_DRAW_MS || 16.7),
    maxBuildSliceMs: Number(process.env.GROUND_STUDY_BUILD_MAX_MS || 16.7),
});
const mimeTypes = {
    ".js": "text/javascript", ".html": "text/html", ".css": "text/css",
    ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
};

function createServer() {
    return http.createServer(async (request, response) => {
        const url = new URL(request.url || "/", "http://localhost");
        const file = path.join(gameRoot, decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
        if (!file.startsWith(gameRoot)) { response.statusCode = 403; response.end("forbidden"); return; }
        try {
            const data = await fs.readFile(file);
            response.setHeader("content-type", mimeTypes[path.extname(file)] || "application/octet-stream");
            response.setHeader("cache-control", "no-store");
            response.end(data);
        } catch { response.statusCode = 404; response.end("missing"); }
    });
}

function percentile(values, fraction) {
    const sorted = [...values].sort((a, b) => a - b);
    if (!sorted.length) return null;
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1))];
}

function summarize(frames, key) {
    const values = frames.map(frame => Number(frame[key]) || 0);
    return {
        p50: percentile(values, 0.5),
        p95: percentile(values, 0.95),
        p99: percentile(values, 0.99),
        max: values.length ? Math.max(...values) : null,
    };
}

const preflight = await checkBrowser();
if (!preflight.ok) { printBrowserHelp(preflight.error); process.exit(1); }
const { chromium } = await import("playwright");
const server = createServer();
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const browser = await chromium.launch(browserLaunchOptions());
const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
const page = await context.newPage();
const diagnostics = [];
page.on("console", message => {
    if (message.type() === "error" || message.type() === "warning") diagnostics.push(message.type() + ": " + message.text());
});
page.on("pageerror", error => diagnostics.push("pageerror: " + error.message));

try {
    await page.goto("http://127.0.0.1:" + port + "/", { waitUntil: "networkidle" });
    await page.locator("#world-seed-input").fill(String(seed));
    await page.locator("#player-name-input").fill("Ground Study Performance");
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 30000 });
    await page.waitForTimeout(1200);

    const webgl = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        state.isPaused = true;
        state.weather = "clear";
        const width = Number(state.worldW) || 160;
        const height = Number(state.worldH) || 160;
        state.explored = Array.from({ length: width }, () => Array(height).fill(true));
        state.fogDirty = true;
        state.entities = [];
        state.particles = [];
        state.floaters = [];
        const { resize, centerCamera } = await import("./js/presentation/camera.js");
        resize();
        centerCamera();
        const { resetTerrainWebGL } = await import("./js/presentation/rendering/terrain-webgl.js");
        resetTerrainWebGL();
        state.terrainRenderer = "webgl";
        state.terrainAutoMode = "webgl";
        state.terrainMode = "webgl";
        state.terrainFallback = false;
        const previousCanvas = document.getElementById("terrain-canvas");
        const canvas = previousCanvas.cloneNode(false);
        canvas.width = state.canvas.width;
        canvas.height = state.canvas.height;
        canvas.style.opacity = "";
        canvas.style.transform = "";
        previousCanvas.replaceWith(canvas);
        state.terrainCanvasEl = canvas;
        state.terrainCacheRevision = (Number(state.terrainCacheRevision) || 0) + 1;
        const gl = canvas.getContext("webgl2");
        return {
            hasGl: Boolean(gl),
            renderer: gl ? gl.getParameter(gl.RENDERER) : null,
            width: canvas.width,
            height: canvas.height,
            worldWidth: width,
            worldHeight: height,
        };
    });
    if (!webgl.hasGl) throw new Error("Ground-study proof requires WebGL2; the terrain fell back to Canvas2D.");

    const scan = await page.evaluate(async ({ day, viewport, zooms }) => {
        const { state } = await import("./js/core/state.js");
        const { getHeightAt, getMoistureAt, getTemperatureAt } = await import("./js/world/world.js");
        const { forestStandAt, forestFaunaFor, forestMicrofaunaAt } = await import("./js/world/forest-ecology.js");
        const { ensureForestFauna, forestFaunaAt, forestInsectAt } = await import("./js/systems/forest-fauna.js");
        const { getResourceNodeAt } = await import("./js/systems/resource-geography.js");
        ensureForestFauna();
        const width = Number(state.worldW) || 160;
        const height = Number(state.worldH) || 160;
        const worldSeed = Number(state.worldSeed) || 1;
        const climateKey = state.worldOptions?.climate || "temperate";
        const forests = state.worldOptions?.forests ?? 52;
        const sea = state.seaLevel ?? 0.33;

        function hasWaterInCrop(focusX, focusY, zoom) {
            const cellPx = 48 * zoom;
            const halfW = state.canvas.width / 2;
            const halfH = state.canvas.height / 2;
            const startX = Math.max(0, Math.floor((focusX * cellPx - halfW) / cellPx));
            const startY = Math.max(0, Math.floor((focusY * cellPx - halfH) / cellPx));
            const endX = Math.min(width, Math.ceil((focusX * cellPx + halfW) / cellPx) + 1);
            const endY = Math.min(height, Math.ceil((focusY * cellPx + halfH) / cellPx) + 1);
            for (let y = startY; y < endY; y++) {
                for (let x = startX; x < endX; x++) {
                    for (const [dx, dy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
                        if (getHeightAt(x + dx, y + dy) < sea + 0.002) return true;
                    }
                }
            }
            return false;
        }

        const candidates = [];
        for (let y = 4; y < height - 4; y++) {
            for (let x = 4; x < width - 4; x++) {
                const moisture = getMoistureAt(x + 0.5, y + 0.5);
                const temperature = getTemperatureAt(x + 0.5, y + 0.5);
                const h = getHeightAt(x + 0.5, y + 0.5);
                if (h < sea || temperature < 0.22 || h > 0.92) continue;
                const node = getResourceNodeAt(x, y);
                const stockRatio = node?.forestCapacity ? node.forestStock / node.forestCapacity : 1;
                const stand = forestStandAt(x + 0.5, y + 0.5, {
                    seed: worldSeed, moisture, temperature, height: h, climate: climateKey,
                    forests, stockRatio, rockLine: 0.92, succession: node?.forestSuccession || null,
                });
                if (!stand?.forest || stand.clearing > 0.05 || stand.canopy < 0.4) continue;
                const saved = forestInsectAt(x, y);
                const herds = forestFaunaAt(x, y, stand, day);
                if (!saved.length || !herds.length) continue;
                const hash = ((x * 73856093) ^ (y * 19349663)) >>> 0;
                const s1 = (hash % 1000) / 1000;
                const s2 = ((hash >>> 7) % 1000) / 1000;
                const s3 = ((hash >>> 13) % 1000) / 1000;
                const micro = forestMicrofaunaAt(stand, day, climateKey, s2);
                const habitat = forestFaunaFor(stand, day, climateKey, s2).filter(entry => entry.group === "insect");
                const insects = [...new Set([...saved.map(entry => entry.id), ...micro.map(entry => entry.id), ...habitat.map(entry => entry.id)])];
                if (!insects.length) continue;
                const dryAt = Object.fromEntries(zooms.map(zoom => [zoom, !hasWaterInCrop(x + 0.5, y + 0.5, zoom)]));
                if (!Object.values(dryAt).every(Boolean)) continue;
                const herd = herds[0];
                candidates.push({
                    x, y, s1, s2, s3,
                    type: stand.type, label: stand.label, age: stand.ageClass,
                    canopy: Number(stand.canopy.toFixed(3)), treeChance: Number(stand.treeChance.toFixed(3)),
                    clearing: Number(stand.clearing.toFixed(3)), trees: Boolean(s1 < stand.treeChance),
                    saved: saved.map(entry => entry.id + ":" + Number(entry.population).toFixed(2)),
                    herd: herds.map(entry => entry.id + ":" + Number(entry.population).toFixed(1)),
                    insects,
                    animal: { id: herd.id, label: herd.label, group: herd.group, population: herd.population },
                    dryAt,
                    score: Number((saved.length * 0.35 + (s1 > 0.95 ? 1 : 0)
                        + Math.min(1, Number(herd.population) / 30) + stand.canopy * 0.4
                        + stand.ground.litter * 0.2).toFixed(4)),
                });
            }
        }
        candidates.sort((a, b) => b.score - a.score || a.y - b.y || a.x - b.x);
        return { world: { width, height, climate: climateKey, forests }, candidates: candidates.slice(0, 12), totalCandidates: candidates.length };
    }, { day, viewport, zooms });

    console.log("Ground-study candidates: " + JSON.stringify(scan.candidates, null, 2));
    if (!scan.candidates.length) throw new Error("No dry dense forest tile with both a resident herd and saved insects was found.");

    const tile = scan.candidates[0];
    const focus = { x: tile.x + 0.5, y: tile.y + 0.5 };

    async function measure(zoom) {
        const before = await page.evaluate(async ({ zoom, focusX, focusY, day }) => {
            const { state } = await import("./js/core/state.js");
            const { clampCamera } = await import("./js/presentation/camera.js");
            const { CELL } = await import("./js/core/config.js");
            const { resolveZoomLevel } = await import("./js/core/zoom-model.js");
            state.isPaused = true;
            state.weather = "clear";
            state.dayOfYear = day;
            state.seasonIndex = Math.floor(day / 100) % 4;
            state.timeOfDay = 12;
            state.renderScale = 1;
            state.zoom = zoom;
            state.zoomTarget = zoom;
            state.zoomLevel = resolveZoomLevel(zoom, { district: 0.14, rooftops: 0.55, interiors: 1.55, ground: 4.4 });
            state.zoomAnchor = null;
            state.camera.x = focusX * CELL * zoom - state.canvas.width / 2;
            state.camera.y = focusY * CELL * zoom - state.canvas.height / 2;
            state.terrainCacheRevision = (Number(state.terrainCacheRevision) || 0) + 1;
            clampCamera();
            state.performanceProbe = { frames: [], limit: 200000, lastPresentedAt: 0, lastRenderedAt: 0 };
            return {
                misses: Number(state.terrainCacheMisses) || 0,
                groundMisses: Number(state.terrainGroundCacheMisses) || 0,
                width: state.canvas.width,
                height: state.canvas.height,
            };
        }, { zoom, focusX: focus.x, focusY: focus.y, day });
        let rebuilt = false;
        for (let attempt = 0; attempt < 100; attempt++) {
            rebuilt = await page.evaluate(async (before) => {
                const { state } = await import("./js/core/state.js");
                return (Number(state.terrainCacheMisses) || 0) > before;
            }, before.misses);
            if (rebuilt) break;
            await page.waitForTimeout(100);
        }
        if (!rebuilt) throw new Error("The close-detail cache did not finish at " + zoom + "×.");
        await page.waitForTimeout(settleWaitMs);

        const build = await page.evaluate(async ({ before, zoom }) => {
            const { state } = await import("./js/core/state.js");
            const frames = state.performanceProbe?.frames?.slice() || [];
            const buildFrames = frames.filter(frame => frame.terrainBuildMs > 0);
            const values = key => buildFrames.map(frame => Number(frame[key]) || 0);
            const max = list => list.length ? Math.max(...list) : 0;
            const { visibleTileBounds } = await import("./js/presentation/rendering/terrain-detail-grid.js");
            const { CELL } = await import("./js/core/config.js");
            const bounds = visibleTileBounds({
                cellPx: CELL * zoom, cameraX: state.camera.x, cameraY: state.camera.y,
                width: state.canvas.width, height: state.canvas.height,
                worldWidth: state.worldW, worldHeight: state.worldH,
            });
            return {
                sampledFrames: frames.length,
                buildFrames: buildFrames.length,
                buildSliceMs: {
                    p50: buildFrames.length ? [...values("terrainBuildMs")].sort((a, b) => a - b)[Math.floor(buildFrames.length / 2)] : null,
                    max: max(values("terrainBuildMs")),
                },
                buildDrawMsMax: max(values("drawMs")),
                totalBuildMs: Number(state.terrainDecorationBuildMs) || 0,
                cacheMisses: Number(state.terrainCacheMisses) || 0,
                groundCacheMisses: Number(state.terrainGroundCacheMisses) || 0,
                groundCacheHits: Number(state.terrainGroundCacheHits) || 0,
                treeDraws: Number(state.terrainTreeDraws) || 0,
                closeDetailTiles: Number(state.terrainCloseDetailTiles) || 0,
                closeGoodsTiles: Number(state.terrainCloseGoodsTiles) || 0,
                closeInsectTiles: Number(state.terrainCloseInsectTiles) || 0,
                closeFaunaTiles: Number(state.terrainCloseFaunaTiles) || 0,
                faunaDrawnTiles: Number(state.terrainFaunaDrawnTiles) || 0,
                detailTiles: Number(state.terrainDetailTiles) || 0,
                visibleTiles: (bounds.endX - bounds.startX) * (bounds.endY - bounds.startY),
                bounds,
                beforeGroundMisses: before.groundMisses,
            };
        }, { before, zoom });

        // The steady sample starts after the staged raster is complete and the
        // camera is static. This is exactly the inspection frame the player
        // holds while reading the insects and animals.
        await page.evaluate(async ({ day }) => {
            const { state } = await import("./js/core/state.js");
            state.isPaused = true;
            state.dayOfYear = day;
            state.performanceProbe = { frames: [], limit: 200000, lastPresentedAt: 0, lastRenderedAt: 0 };
        }, { day });
        await page.waitForTimeout(sampleMs);
        const steady = await page.evaluate(async () => {
            const { state } = await import("./js/core/state.js");
            return {
                frames: state.performanceProbe?.frames?.slice() || [],
                cacheMisses: Number(state.terrainCacheMisses) || 0,
                groundCacheMisses: Number(state.terrainGroundCacheMisses) || 0,
                groundCacheHits: Number(state.terrainGroundCacheHits) || 0,
                closeDetailTiles: Number(state.terrainCloseDetailTiles) || 0,
                closeGoodsTiles: Number(state.terrainCloseGoodsTiles) || 0,
                closeInsectTiles: Number(state.terrainCloseInsectTiles) || 0,
                closeFaunaTiles: Number(state.terrainCloseFaunaTiles) || 0,
                faunaDrawnTiles: Number(state.terrainFaunaDrawnTiles) || 0,
                treeDraws: Number(state.terrainTreeDraws) || 0,
                frameFaulted: Boolean(state.frameFaulted),
                frameErrors: Number(state.frameErrorCount) || 0,
                zoom: state.zoom,
                renderScale: state.renderScale,
                canvas: { width: state.canvas.width, height: state.canvas.height },
            };
        });
        const frames = steady.frames;
        // A headless software-composited browser occasionally stops presenting
        // for a frame or two while the host schedules another process. Keep
        // those samples visible, but also report the active-render distribution
        // so a host stall is not mistaken for game-loop work.
        const externalStalls = frames.filter(frame => (Number(frame.intervalMs) || 0) > 50
            && (Number(frame.drawMs) || 0) <= 2.5);
        const activeFrames = frames.filter(frame => !externalStalls.includes(frame));
        const slowFrames = [...frames]
            .sort((a, b) => (Number(b.intervalMs) || 0) - (Number(a.intervalMs) || 0))
            .slice(0, 8)
            .map(frame => ({
                intervalMs: Number(frame.intervalMs) || 0,
                drawMs: Number(frame.drawMs) || 0,
                worldDrawMs: Number(frame.worldDrawMs) || 0,
                uiMs: Number(frame.uiMs) || 0,
                simMs: Number(frame.simMs) || 0,
                terrainBuildMs: Number(frame.terrainBuildMs) || 0,
                external: externalStalls.includes(frame),
            }));
        return {
            zoom,
            canvas: steady.canvas,
            renderScale: steady.renderScale,
            sampledFrames: frames.length,
            frameMs: summarize(frames, "intervalMs"),
            activeFrameMs: summarize(activeFrames, "intervalMs"),
            externalStalls: externalStalls.length,
            slowFrames,
            drawMs: summarize(frames, "drawMs"),
            worldDrawMs: summarize(frames, "worldDrawMs"),
            uiMs: summarize(frames, "uiMs"),
            simMs: summarize(frames, "simMs"),
            terrainBuildMs: summarize(frames, "terrainBuildMs"),
            rebuild: build,
            steady: {
                cacheMisses: steady.cacheMisses,
                groundCacheMisses: steady.groundCacheMisses,
                groundCacheHits: steady.groundCacheHits,
                closeDetailTiles: steady.closeDetailTiles,
                closeGoodsTiles: steady.closeGoodsTiles,
                closeInsectTiles: steady.closeInsectTiles,
                closeFaunaTiles: steady.closeFaunaTiles,
                faunaDrawnTiles: steady.faunaDrawnTiles,
                treeDraws: steady.treeDraws,
                frameFaulted: steady.frameFaulted,
                frameErrors: steady.frameErrors,
            },
            checks: {
                closeDetailActive: build.closeDetailTiles > 0 && build.closeInsectTiles > 0,
                faunaDrawn: build.closeFaunaTiles > 0 && build.faunaDrawnTiles > 0,
                boundedToVisibleTiles: build.detailTiles <= build.visibleTiles
                    && build.closeDetailTiles <= build.visibleTiles
                    && build.treeDraws <= build.visibleTiles * 3,
                offTick: summarize(frames, "simMs").max === 0,
                buildSliced: build.buildSliceMs.max <= BUDGET.maxBuildSliceMs,
                noCacheChurn: steady.cacheMisses === build.cacheMisses,
                staticGroundCached: steady.groundCacheHits > 0 && steady.groundCacheMisses === build.groundCacheMisses,
                p95FrameWithinBudget: summarize(frames, "intervalMs").p95 <= BUDGET.p95FrameMs,
                activeP95FrameWithinBudget: summarize(activeFrames, "intervalMs").p95 <= BUDGET.p95FrameMs,
                p95WorldDrawWithinBudget: summarize(frames, "worldDrawMs").p95 <= BUDGET.p95WorldDrawMs,
            },
        };
    }

    const results = [];
    for (const zoom of zooms) results.push(await measure(zoom));
    const failed = results.flatMap(result => Object.entries(result.checks)
        .filter(([, ok]) => !ok)
        .map(([check]) => result.zoom + "× " + check));

    const report = {
        generatedAt: new Date().toISOString(),
        seed,
        viewport,
        renderer: webgl.renderer,
        world: scan.world,
        method: "Real Chromium WebGL2 game loop; HUD visible; camera static at the close tile; close-detail raster staged in bounded slices; frame intervals and game-loop draw/build timings sampled after the cache settles.",
        tile: {
            ...tile,
            focus,
            visibleTiles: results.map(result => ({ zoom: result.zoom, count: result.rebuild.visibleTiles })),
        },
        budgets: BUDGET,
        results,
        diagnostics,
        summary: results.map(result => ({
            zoom: result.zoom,
            frameP50: result.frameMs.p50,
            frameP95: result.frameMs.p95,
            frameP99: result.frameMs.p99,
            frameMax: result.frameMs.max,
            activeFrameP95: result.activeFrameMs.p95,
            externalStalls: result.externalStalls,
            worldDrawP95: result.worldDrawMs.p95,
            buildSliceMax: result.rebuild.buildSliceMs.max,
            totalBuildMs: result.rebuild.totalBuildMs,
            closeDetailTiles: result.rebuild.closeDetailTiles,
            visibleTiles: result.rebuild.visibleTiles,
            cacheHits: result.steady.groundCacheHits,
            checks: result.checks,
        })),
    };
    await fs.mkdir(outputDir, { recursive: true });
    const reportPath = path.join(outputDir, "ground-study-performance.json");
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
    console.log("Ground-study report: " + path.relative(gameRoot, reportPath));
    console.log("Renderer: " + (webgl.renderer || "unknown") + " · " + webgl.width + "×" + webgl.height);
    console.log("Build detail: " + JSON.stringify(results.map(result => ({ zoom: result.zoom, rebuild: result.rebuild, steady: result.steady })), null, 2));
    for (const result of results) {
        console.log([
            result.zoom + "×",
            "frame p50/p95/p99 " + [result.frameMs.p50, result.frameMs.p95, result.frameMs.p99].join("/") + "ms",
            "worldDraw p95 " + result.worldDrawMs.p95 + "ms",
            "build " + result.rebuild.totalBuildMs + "ms in slices max " + result.rebuild.buildSliceMs.max + "ms",
            "close tiles " + result.rebuild.closeDetailTiles + "/" + result.rebuild.visibleTiles,
            "ground cache hits " + result.steady.groundCacheHits,
        ].join(" · "));
    }
    if (diagnostics.length) console.log("Diagnostics: " + JSON.stringify(diagnostics, null, 2));
    if (failed.length) throw new Error("Ground-study performance checks failed: " + failed.join(", "));
} finally {
    await browser.close().catch(() => {});
    await new Promise(resolve => server.close(resolve));
}
