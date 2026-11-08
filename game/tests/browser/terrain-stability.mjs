// Regression test for the cached forest/terrain detail layer.
//
// It drives the real game in Chromium and checks the properties that made
// trees appear to blink out of existence:
//   1. decorations exist at landscape, district, rooftop and interior zoom;
//   2. the cached layer stays visible while the camera pans and zooms;
//   3. the cache is rebuilt once after the view settles, not on every frame;
//   4. a full-canvas pan no longer hides the layer.
//
// The run also records software-WebGL/Canvas draw times. They are diagnostic
// values for this container, not claims about a real GPU or a user's device.

import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { browserLaunchOptions, checkBrowser, printBrowserHelp } from "./browser-preflight.mjs";

const gameRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
process.chdir(gameRoot);

const seed = 20261108;
const viewport = { width: 1000, height: 700 };
const outputDir = path.resolve(process.env.TERRAIN_STABILITY_OUT || path.join(gameRoot, "docs/terrain-reference"));
const mimeTypes = {
    ".js": "text/javascript", ".html": "text/html", ".css": "text/css",
    ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
};

function createServer() {
    return http.createServer(async (request, response) => {
        const url = new URL(request.url || "/", "http://localhost");
        const file = path.join(gameRoot, decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
        if (!file.startsWith(gameRoot)) {
            response.statusCode = 403;
            response.end("forbidden");
            return;
        }
        try {
            const data = await fs.readFile(file);
            response.setHeader("content-type", mimeTypes[path.extname(file)] || "application/octet-stream");
            response.setHeader("cache-control", "no-store");
            response.end(data);
        } catch {
            response.statusCode = 404;
            response.end("missing");
        }
    });
}

const probe = await checkBrowser();
if (!probe.ok) {
    printBrowserHelp(probe.error);
    process.exit(1);
}

const { chromium } = await import("playwright");
const server = createServer();
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch(browserLaunchOptions());
const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
const page = await context.newPage();
const diagnostics = [];
page.on("console", message => {
    if (message.type() === "error" || message.type() === "warning") diagnostics.push(message.type() + ": " + message.text());
});
page.on("pageerror", error => diagnostics.push("pageerror: " + error.message));

async function viewState() {
    return page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const element = document.getElementById("terrain-canvas");
        return {
            opacity: element?.style.opacity ?? null,
            transform: element?.style.transform ?? null,
            cacheHits: Number(state.terrainCacheHits) || 0,
            cacheMisses: Number(state.terrainCacheMisses) || 0,
            treeDraws: Number(state.terrainTreeDraws) || 0,
            lastDrawMs: Number(state.lastDrawMs) || 0,
            peakDrawMs: Number(window.__terrainPeakDrawMs) || 0,
            zoom: state.zoom,
            zoomLevel: state.zoomLevel,
            camera: { x: state.camera.x, y: state.camera.y },
            terrainMode: state.terrainMode,
        };
    });
}

async function setView(level) {
    await page.evaluate(async ({ level }) => {
        const { state } = await import("./js/core/state.js");
        const { ZOOM_PRESETS } = await import("./js/core/zoom-model.js");
        const { CELL } = await import("./js/core/config.js");
        const { centerCamera } = await import("./js/presentation/camera.js");
        state.isPaused = true;
        state.weather = "clear";
        state.entities = [];
        state.particles = [];
        state.floaters = [];
        state.dayOfYear = 150;
        state.seasonIndex = 1;
        state.zoom = ZOOM_PRESETS[level - 1];
        state.zoomTarget = state.zoom;
        state.zoomLevel = level;
        state.zoomAnchor = null;
        state.camera.x = (Number(state.worldW) || 160) * CELL * state.zoom / 2 - state.canvas.width / 2;
        state.camera.y = (Number(state.worldH) || 160) * CELL * state.zoom / 2 - state.canvas.height / 2;
        centerCamera();
        window.__terrainPeakDrawMs = 0;
        state.terrainCacheRevision = (Number(state.terrainCacheRevision) || 0) + 1;
    }, { level });
    await page.waitForTimeout(520);
}

try {
    await page.goto("http://127.0.0.1:" + port + "/", { waitUntil: "networkidle" });
    await page.locator("#world-seed-input").fill(String(seed));
    await page.locator("#player-name-input").fill("Terrain Stability");
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 30000 });
    await page.waitForTimeout(1000);

    await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        state.isPaused = true;
        state.weather = "clear";
        state.entities = [];
        state.particles = [];
        state.floaters = [];
        const width = Number(state.worldW) || 160;
        const height = Number(state.worldH) || 160;
        state.explored = Array.from({ length: width }, () => Array(height).fill(true));
        state.fogDirty = true;
        // Explicit Canvas2D keeps this test independent of software WebGL and
        // lets it inspect the DOM layer transform directly.
        state.terrainRenderer = "canvas";
        state.terrainAutoMode = "canvas";
        state.terrainMode = "canvas";
        state.terrainCacheRevision = (Number(state.terrainCacheRevision) || 0) + 1;
        window.__terrainPeakDrawMs = 0;
        const watch = () => {
            window.__terrainPeakDrawMs = Math.max(Number(window.__terrainPeakDrawMs) || 0, Number(state.lastDrawMs) || 0);
            requestAnimationFrame(watch);
        };
        requestAnimationFrame(watch);
    });

    const levels = [];
    for (const level of [1, 2, 3, 4]) {
        await setView(level);
        const view = await viewState();
        levels.push(view);
        const screenshot = await page.locator("#canvas-wrapper").screenshot({ type: "png", animations: "disabled" });
        await fs.writeFile(path.join(outputDir, `terrain-stability-level-${level}.png`), screenshot);
        assert.equal(view.terrainMode, "canvas", "the stability test must run on the Canvas2D path");
        assert.equal(view.opacity, "1", "the cached detail layer must be visible at zoom level " + level);
        assert.ok(view.cacheMisses > 0, "the cache was never built at zoom level " + level);
        assert.ok(view.treeDraws > 0, "no trees were drawn at zoom level " + level);
        assert.ok(Number.isFinite(view.peakDrawMs) && view.peakDrawMs >= 0);
        console.log(`level ${level}: zoom ${view.zoom.toFixed(3)} · trees ${view.treeDraws} · miss ${view.cacheMisses} · peak draw ${view.peakDrawMs.toFixed(1)} ms`);
    }

    // Pan far enough that the old 45%-of-screen cutoff would have hidden the
    // whole decoration layer. It must stay visible and keep a transform.
    await setView(2);
    const beforePan = await viewState();
    await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        state.isPaused = true;
        state.terrainCacheRevision = Number(state.terrainCacheRevision) || 0;
        window.__panTimer = setInterval(() => {
            state.camera.x += 16;
            state.zoomAnchor = null;
        }, 16);
    });
    await page.waitForTimeout(220);
    const duringPan = await viewState();
    assert.equal(duringPan.opacity, "1", "the cached layer disappeared during a pan");
    assert.match(duringPan.transform, /translate\([^)]*px, [^)]*px\)/, "the cached layer was not transformed during a pan");
    assert.equal(duringPan.cacheMisses, beforePan.cacheMisses, "the cache rebuilt repeatedly while panning");
    await page.evaluate(() => clearInterval(window.__panTimer));
    await page.waitForTimeout(450);
    const afterPan = await viewState();
    assert.equal(afterPan.opacity, "1", "the cached layer disappeared after the pan settled");
    assert.ok(afterPan.cacheMisses > duringPan.cacheMisses, "the cache was not refreshed after the pan settled");
    console.log(`pan: hits ${beforePan.cacheHits} -> ${afterPan.cacheHits} · misses ${beforePan.cacheMisses} -> ${afterPan.cacheMisses}`);

    // A zoom must transform the old layer immediately, then rebuild once at
    // the settled scale. The old code cleared/hid it when the cache key changed.
    await setView(2);
    const beforeZoom = await viewState();
    await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        state.zoomTarget = state.zoom * 1.18;
        state.zoomAnchor = null;
    });
    await page.waitForTimeout(80);
    const duringZoom = await viewState();
    assert.equal(duringZoom.opacity, "1", "the cached layer disappeared during a zoom");
    assert.match(duringZoom.transform, /scale\(/, "the cached layer was not scaled during a zoom");
    assert.equal(duringZoom.cacheMisses, beforeZoom.cacheMisses, "the cache rebuilt on every zoom frame");
    const zoomTimeline = [];
    let afterZoom = duringZoom;
    // The software renderer runs the animation clock slower than a real GPU.
    // Wait for the actual rebuild instead of assuming a fixed 1.2 s budget; the
    // property under test is "one rebuild after the zoom settles", not a
    // particular wall-clock frame rate.
    for (let index = 0; index < 30; index++) {
        await page.waitForTimeout(100);
        afterZoom = await viewState();
        zoomTimeline.push({
            t: (index + 1) * 100,
            zoom: Number(afterZoom.zoom.toFixed(5)),
            misses: afterZoom.cacheMisses,
            opacity: afterZoom.opacity,
            transform: afterZoom.transform,
        });
        if (afterZoom.cacheMisses > duringZoom.cacheMisses) break;
    }
    console.log("Zoom timeline: " + JSON.stringify(zoomTimeline));
    assert.equal(afterZoom.opacity, "1", "the cached layer disappeared after the zoom settled");
    assert.ok(afterZoom.cacheMisses > duringZoom.cacheMisses, "the cache was not refreshed after the zoom settled");
    console.log(`zoom: ${beforeZoom.zoom.toFixed(3)} -> ${afterZoom.zoom.toFixed(3)} · misses ${beforeZoom.cacheMisses} -> ${afterZoom.cacheMisses}`);

    const fatal = diagnostics.filter(text => /Terrain|runtime paused|pageerror|TypeError|ReferenceError/i.test(text));
    if (diagnostics.length) console.log("Diagnostics: " + JSON.stringify(diagnostics, null, 2));
    assert.equal(fatal.length, 0, "terrain stability diagnostics were emitted:\n" + fatal.join("\n"));

    const metadata = {
        seed,
        viewport,
        generatedAt: new Date().toISOString(),
        levels: levels.map((view, index) => ({
            level: index + 1,
            zoom: view.zoom,
            treeDraws: view.treeDraws,
            peakDrawMs: view.peakDrawMs,
            cacheMisses: view.cacheMisses,
        })),
        pan: {
            beforeMisses: beforePan.cacheMisses,
            duringMisses: duringPan.cacheMisses,
            afterMisses: afterPan.cacheMisses,
            duringTransform: duringPan.transform,
        },
        zoom: {
            beforeZoom: beforeZoom.zoom,
            afterZoom: afterZoom.zoom,
            duringTransform: duringZoom.transform,
        },
        note: "Chromium in this container uses software rendering. Peak draw times are diagnostic, not device FPS claims.",
    };
    await fs.writeFile(path.join(outputDir, "terrain-stability.json"), JSON.stringify(metadata, null, 2) + "\n");
    console.log("Terrain stability metadata: " + path.relative(gameRoot, path.join(outputDir, "terrain-stability.json")));
} finally {
    await page.evaluate(() => clearInterval(window.__panTimer)).catch(() => {});
    await browser.close().catch(() => {});
    await new Promise(resolve => server.close(resolve));
}
