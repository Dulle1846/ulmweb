// Runs the in-game Device Benchmark in a real browser and stores its rows.
//
// This is the same benchmark a player starts from Settings. It is not a GPU
// comparison: in this container Chromium uses SwiftShader, so the numbers are
// diagnostic. The value of the artifact is that the benchmark actually ran
// through the product UI and measured rendered frames, not synthetic sleeps.

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
const outputDir = path.resolve(process.env.DEVICE_BENCHMARK_OUT || path.join(gameRoot, "docs/terrain-reference"));
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

try {
    await page.goto("http://127.0.0.1:" + port + "/", { waitUntil: "networkidle" });
    await page.locator("#world-seed-input").fill(String(seed));
    await page.locator("#player-name-input").fill("Device Benchmark");
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 30000 });
    await page.waitForTimeout(800);

    // Benchmark the landscape view as a player sees it, not the default
    // close-up. The in-game plan still cycles Auto/WebGL/Canvas and all scales.
    await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const { ZOOM_PRESETS } = await import("./js/core/zoom-model.js");
        const { CELL } = await import("./js/core/config.js");
        const { centerCamera } = await import("./js/presentation/camera.js");
        state.isPaused = true;
        state.weather = "clear";
        state.dayOfYear = 150;
        state.seasonIndex = 1;
        state.zoom = ZOOM_PRESETS[0];
        state.zoomTarget = state.zoom;
        state.zoomLevel = 1;
        state.zoomAnchor = null;
        state.camera.x = (Number(state.worldW) || 160) * CELL * state.zoom / 2 - state.canvas.width / 2;
        state.camera.y = (Number(state.worldH) || 160) * CELL * state.zoom / 2 - state.canvas.height / 2;
        centerCamera();
        state.terrainCacheRevision = (Number(state.terrainCacheRevision) || 0) + 1;
        window.__landscapePeakDrawMs = 0;
        const watch = () => {
            window.__landscapePeakDrawMs = Math.max(
                Number(window.__landscapePeakDrawMs) || 0,
                Number(state.lastDrawMs) || 0
            );
            requestAnimationFrame(watch);
        };
        requestAnimationFrame(watch);
    });
    await page.waitForTimeout(700);
    const before = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        return {
            zoom: state.zoom,
            zoomLevel: state.zoomLevel,
            terrainMode: state.terrainMode,
            cacheMisses: Number(state.terrainCacheMisses) || 0,
            landscapePeakDrawMs: Number(window.__landscapePeakDrawMs) || 0,
            renderer: state.terrainRenderer,
            renderScale: state.renderScale,
        };
    });

    await page.locator("#settings-btn").click();
    await page.locator("#settings-modal").waitFor({ state: "visible", timeout: 5000 });
    const runButton = page.locator("#run-performance-benchmark");
    await runButton.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
        const button = document.getElementById("run-performance-benchmark");
        return button && !button.disabled;
    }, { timeout: 10000 });
    await runButton.click();
    await page.locator("#performance-benchmark-live").waitFor({ state: "visible", timeout: 5000 });
    await page.locator("#performance-benchmark-results").waitFor({ state: "visible", timeout: 240000 });

    const results = await page.evaluate(() => {
        const summary = document.getElementById("performance-benchmark-summary")?.innerText || "";
        const meta = document.getElementById("performance-benchmark-meta")?.innerText || "";
        const rows = [...document.querySelectorAll("#performance-benchmark-body tr")].map(row => ({
            text: row.innerText.replace(/\s+/g, " ").trim(),
            cells: [...row.querySelectorAll("td")].map(cell => cell.innerText.replace(/\s+/g, " ").trim()),
            best: row.classList.contains("is-best"),
        }));
        return { summary, meta, rows };
    });
    assert.ok(results.rows.length >= 12, "the live benchmark did not return all renderer/scale rows");
    assert.ok(results.rows.some(row => row.cells.length >= 3), "benchmark rows have no metrics");

    const screenshot = await page.locator("#settings-modal").screenshot({ type: "png", animations: "disabled" });
    await fs.writeFile(path.join(outputDir, "device-benchmark.png"), screenshot);

    const metadata = {
        seed,
        viewport,
        generatedAt: new Date().toISOString(),
        scene: before,
        summary: results.summary,
        device: results.meta,
        rows: results.rows,
        note: "The product's live Device Benchmark was run through the Settings UI on the landscape view. Chromium here uses software rendering; the values are diagnostic and not a claim about a user's GPU or monitor.",
    };
    await fs.writeFile(path.join(outputDir, "device-benchmark.json"), JSON.stringify(metadata, null, 2) + "\n");
    console.log("Landscape scene: " + JSON.stringify(before));
    console.log("Benchmark summary: " + results.summary);
    for (const row of results.rows) console.log((row.best ? "* " : "  ") + row.text);
    console.log("Device benchmark: " + path.relative(gameRoot, path.join(outputDir, "device-benchmark.json")));

    const fatal = diagnostics.filter(text => /pageerror|TypeError|ReferenceError|Benchmark failed/i.test(text));
    if (diagnostics.length) console.log("Diagnostics: " + JSON.stringify(diagnostics, null, 2));
    assert.equal(fatal.length, 0, "device benchmark diagnostics were emitted:\n" + fatal.join("\n"));
} finally {
    await browser.close().catch(() => {});
    await new Promise(resolve => server.close(resolve));
}
