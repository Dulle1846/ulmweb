// Climate visual reference and live climate audit.
//
// 1. climate-reference.png: the same grove, seed and camera under all five
//    climate curves at four seasonal days. The generated world is held fixed,
//    so only the climate-driven snow and foliage response changes.
// 2. climate-live.png + climate-live/<climate>.png: five real game views at
//    1280 x 800 after each climate has run a complete 400-day weather audit.
// 3. climate-reference.json and climate-live.json: the measured states behind
//    both sheets.
//
// Usage: npm run test:climate-reference
// Output: docs/terrain-reference/ (override with CLIMATE_REFERENCE_OUT)

import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { browserLaunchOptions, checkBrowser, printBrowserHelp } from "./browser-preflight.mjs";
import { seasonalState } from "../../js/world/season.js";
import { foliageState } from "../../js/presentation/rendering/seasonal-foliage.js";

const gameRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
process.chdir(gameRoot);

const outputDir = path.resolve(process.env.CLIMATE_REFERENCE_OUT || path.join(gameRoot, "docs/terrain-reference"));
const frameDir = path.resolve(process.env.CLIMATE_REFERENCE_FRAMES || path.join(os.tmpdir(), "kac-climate-reference-frames"));
const seed = 20261104;
const matrixViewport = { width: 560, height: 560 };
const liveViewport = { width: 1280, height: 800 };
const focus = { x: 90, y: 22 };
const matrixDays = [250, 280, 310, 50];
const species = ["broadleaf", "birch", "oak", "beech", "conifer", "shrub"];
const treeSeeds = [0.08, 0.22, 0.36, 0.5, 0.64, 0.78, 0.92];
const climates = [
    { id: "temperate", label: "TEMPERATE", note: "mixed forest, four full seasons" },
    { id: "northern", label: "NORTHERN", note: "early snow, long melt, late leaf-out" },
    { id: "mediterranean", label: "MEDITERRANEAN", note: "short snow window, early green-up" },
    { id: "arid", label: "ARID", note: "thin cover, fast melt, restrained autumn" },
    { id: "enchanted", label: "ENCHANTED", note: "mild winter with heavier snow load" },
];

const mimeTypes = {
    ".js": "text/javascript",
    ".html": "text/html",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".svg": "image/svg+xml",
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
await fs.rm(frameDir, { recursive: true, force: true });
await fs.mkdir(frameDir, { recursive: true });
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch(browserLaunchOptions());
const diagnostics = [];
const errors = [];

try {
    const matrixContext = await browser.newContext({ viewport: matrixViewport, deviceScaleFactor: 1 });
    const matrixPage = await matrixContext.newPage();
    attachDiagnostics(matrixPage, diagnostics, errors);
    await startRealm(matrixPage, "temperate", port);
    await matrixPage.addStyleTag({ content: matrixStyle() });
    const webgl = await matrixPage.evaluate(async () => {
        document.body.classList.add("climate-reference");
        const { state } = await import("./js/core/state.js");
        state.isPaused = true;
        state.weather = "clear";
        state.weatherTimer = 0;
        const width = Number(state.worldW) || 160;
        const height = Number(state.worldH) || 160;
        state.explored = Array.from({ length: width }, () => Array(height).fill(true));
        state.fogDirty = true;
        // The matrix is a tree reference, not a gameplay shot; villagers and
        // floating text would read as extra brown crowns at this zoom.
        state.entities = [];
        state.particles = [];
        state.floaters = [];
        const { resize, centerCamera } = await import("./js/presentation/camera.js");
        resize();
        centerCamera();
        // On a software renderer the automatic choice can lock the original
        // terrain surface to Canvas2D before this reference asks for WebGL2.
        // Force the WebGL path and replace the surface, exactly as the terrain
        // and forest references do, so SwiftShader is not misreported as a
        // missing WebGL implementation.
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
        };
    });
    if (!webgl.hasGl) throw new Error("The climate reference requires WebGL2; the terrain fell back to Canvas2D.");
    await matrixPage.waitForTimeout(300);

    const panels = [];
    for (const climate of climates) {
        for (const day of matrixDays) {
            await matrixPage.evaluate(async ({ day, climate, x, y }) => {
                const { state } = await import("./js/core/state.js");
                const { clampCamera, setZoomLevel } = await import("./js/presentation/camera.js");
                const { CELL } = await import("./js/core/config.js");
                state.isPaused = true;
                state.weather = "clear";
                state.weatherTimer = 0;
                state.worldOptions = { ...state.worldOptions, climate };
                state.dayOfYear = day;
                state.seasonIndex = Math.floor(day / 100) % 4;
                setZoomLevel(4);
                state.zoom = state.zoomTarget;
                state.zoomLevel = 4;
                state.zoomAnchor = null;
                state.camera.x = (x + 0.5) * CELL * state.zoom - state.canvas.width / 2;
                state.camera.y = (y + 0.5) * CELL * state.zoom - state.canvas.height / 2;
                clampCamera();
            }, { day, climate: climate.id, x: focus.x, y: focus.y });
            // A paused realm can hold the previous 2D overlay frame for a beat
            // while the WebGL ground has already moved on; wait for the tree
            // overlay to match the new day before capturing.
            await matrixPage.waitForTimeout(650);
            const buffer = await matrixPage.locator("#canvas-wrapper").screenshot({ type: "png", animations: "disabled" });
            const file = path.join(frameDir, "matrix-" + climate.id + "-" + day + ".png");
            await fs.writeFile(file, buffer);
            panels.push({
                climate: climate.id,
                label: climate.label,
                day,
                buffer,
                metrics: foliageSummary(day, climate.id),
            });
            console.log("Captured climate grove " + climate.id + " day " + day);
        }
    }

    const generatedAt = new Date().toISOString();
    const climateSheet = await renderClimateSheet(matrixContext, panels, {
        generatedAt,
        renderer: webgl.renderer,
        width: webgl.width,
        height: webgl.height,
    });
    const climatePath = path.join(outputDir, "climate-reference.png");
    await fs.writeFile(climatePath, climateSheet);
    const climateMetadata = {
        seed,
        focus,
        viewport: matrixViewport,
        canvas: { width: webgl.width, height: webgl.height },
        renderer: webgl.renderer,
        generatedAt,
        days: matrixDays,
        climates: climates.map(climate => ({ id: climate.id, label: climate.label, note: climate.note })),
        panels: panels.map(panel => ({
            climate: panel.climate,
            day: panel.day,
            ...panel.metrics,
        })),
        note: "The same generated world and tree group; only the climate curve is switched, so the seasonal response is directly comparable. HUD, entities, fog and weather hidden.",
    };
    await fs.writeFile(path.join(outputDir, "climate-reference.json"), JSON.stringify(climateMetadata, null, 2) + "\n");

    const liveResults = [];
    const liveDir = path.join(outputDir, "climate-live");
    await fs.mkdir(liveDir, { recursive: true });
    for (const climate of climates) {
        const liveContext = await browser.newContext({ viewport: liveViewport, deviceScaleFactor: 1 });
        const livePage = await liveContext.newPage();
        attachDiagnostics(livePage, diagnostics, errors);
        await startRealm(livePage, climate.id, port);
        const metrics = await livePage.evaluate(async () => {
            const { state } = await import("./js/core/state.js");
            const { updateWeather } = await import("./js/world/weather.js");
            const { seasonalState: readSeason } = await import("./js/world/season.js");
            state.isPaused = true;
            state.weather = "clear";
            state.weatherTimer = 0;
            if (!state.randomStreams || typeof state.randomStreams !== "object") state.randomStreams = {};
            state.randomStreams.weather = 0;

            const climate = state.worldOptions?.climate || "temperate";
            const counts = { clear: 0, rain: 0, snow: 0 };
            let changes = 0;
            let previous = state.weather;
            let snowDays = 0;
            let summerSnowDays = 0;
            let maxSnow = 0;
            for (let day = 0; day < 400; day++) {
                state.dayOfYear = day;
                state.seasonIndex = Math.floor(day / 100) % 4;
                updateWeather();
                if (state.weather !== previous) {
                    changes++;
                    previous = state.weather;
                }
                counts[state.weather] = (counts[state.weather] || 0) + 1;
                if (state.weather === "snow") {
                    snowDays++;
                    if (day >= 100 && day < 200) summerSnowDays++;
                }
                const season = readSeason(day, climate);
                maxSnow = Math.max(maxSnow, season.snowCover);
            }

            // Leave the live view on a representative winter day after the
            // audit, with the ground state authoritative and clear skies so the
            // screenshots stay legible.
            state.dayOfYear = 330;
            state.seasonIndex = 3;
            state.weather = "clear";
            state.weatherTimer = 0;
            state.explored = Array.from({ length: Number(state.worldW) || 160 }, () => Array(Number(state.worldH) || 160).fill(true));
            state.fogDirty = true;
            const { resize, centerCamera, setZoomLevel } = await import("./js/presentation/camera.js");
            resize();
            setZoomLevel(2);
            state.zoom = state.zoomTarget;
            state.zoomLevel = 2;
            state.zoomAnchor = null;
            centerCamera();
            return { climate, counts, changes, snowDays, summerSnowDays, maxSnow };
        });
        await livePage.waitForTimeout(900);
        const buffer = await livePage.screenshot({ type: "png", animations: "disabled" });
        const liveFile = path.join(liveDir, climate.id + ".png");
        await fs.writeFile(liveFile, buffer);
        const day30 = foliageSummary(30, climate.id);
        const day330 = foliageSummary(330, climate.id);
        liveResults.push({
            ...metrics,
            label: climate.label,
            note: climate.note,
            day30,
            day330,
            buffer,
            screenshot: path.relative(gameRoot, liveFile),
        });
        console.log("Captured live climate " + climate.id + " · snow days " + metrics.snowDays + " · changes " + metrics.changes);
        await liveContext.close();
    }

    const summary = checkLiveResults(liveResults);
    const liveGeneratedAt = new Date().toISOString();
    const liveSheet = await renderLiveSheet(matrixContext, liveResults, {
        generatedAt: liveGeneratedAt,
        renderer: webgl.renderer,
    });
    const livePath = path.join(outputDir, "climate-live.png");
    await fs.writeFile(livePath, liveSheet);
    await fs.writeFile(path.join(outputDir, "climate-live.json"), JSON.stringify({
        seed,
        generatedAt: liveGeneratedAt,
        viewport: liveViewport,
        screenshotDay: 330,
        climates: liveResults.map(result => ({
            climate: result.climate,
            label: result.label,
            note: result.note,
            weatherCounts: result.counts,
            weatherChanges: result.changes,
            snowDays: result.snowDays,
            summerSnowDays: result.summerSnowDays,
            maxSnow: round(result.maxSnow),
            day30: result.day30,
            day330: result.day330,
            screenshot: result.screenshot,
        })),
        checks: summary,
        note: "Each climate ran its own 400-day weather audit in a real realm. Screenshots show day 330 after the audit, with clear skies so the ground snow remains visible.",
    }, null, 2) + "\n");

    if (errors.length) throw new Error("Browser errors were emitted:\n" + errors.join("\n"));
    console.log("Climate reference: " + path.relative(gameRoot, climatePath));
    console.log("Climate live sheet: " + path.relative(gameRoot, livePath));
    console.log("Climate metadata: " + path.relative(gameRoot, path.join(outputDir, "climate-reference.json")));
    console.log("Climate live metadata: " + path.relative(gameRoot, path.join(outputDir, "climate-live.json")));
    console.log("Live screenshots: " + path.relative(gameRoot, liveDir));
    if (diagnostics.length) console.log("Diagnostics: " + JSON.stringify(diagnostics.slice(0, 12), null, 2));
} finally {
    await browser.close().catch(() => {});
    await new Promise(resolve => server.close(resolve));
}

function attachDiagnostics(page, diagnostics, errors) {
    page.on("console", message => {
        if (message.type() === "error") {
            diagnostics.push("console error: " + message.text());
            errors.push(message.text());
        } else if (message.type() === "warning") {
            diagnostics.push("warning: " + message.text());
        }
    });
    page.on("pageerror", error => {
        diagnostics.push("pageerror: " + error.message);
        errors.push(error.message);
    });
}

async function startRealm(page, climate, port) {
    await page.goto("http://127.0.0.1:" + port + "/", { waitUntil: "networkidle" });
    if (climate !== "temperate") await page.locator("#world-climate").selectOption(climate);
    await page.locator("#world-seed-input").fill(String(seed));
    await page.locator("#player-name-input").fill("Climate " + climate);
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 30000 });
    await page.waitForTimeout(900);
}

function matrixStyle() {
    return `
        body.climate-reference .topbar,
        body.climate-reference .realm-nav,
        body.climate-reference .side-panel { display: none !important; }
        body.climate-reference .game-shell,
        body.climate-reference .game-layout { display: block !important; height: 100vh !important; }
        body.climate-reference #canvas-wrapper {
            position: fixed !important; inset: 0 !important;
            width: 100vw !important; height: 100vh !important;
            background: #0c1415 !important;
        }
        body.climate-reference #canvas-wrapper > *:not(#terrain-canvas):not(#canvas) {
            visibility: hidden !important;
        }
        body.climate-reference #canvas-wrapper > #canvas {
            visibility: visible !important;
        }
    `;
}

function round(value, digits = 3) {
    return Math.round(Number(value) * 10 ** digits) / 10 ** digits;
}

function average(values) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function foliageSummary(day, climate) {
    const state = seasonalState(day, climate);
    const trees = {};
    for (const kind of species) {
        const samples = treeSeeds.map(treeSeed => foliageState(day, { seed: treeSeed, species: kind, climate }));
        trees[kind] = {
            leaf: round(average(samples.map(sample => sample.leaf))),
            turn: round(average(samples.map(sample => sample.turn))),
            snow: round(average(samples.map(sample => sample.snow))),
            bare: samples.filter(sample => sample.bare).length,
            holding: samples.filter(sample => sample.holding).length,
        };
    }
    return {
        snowCover: round(state.snowCover),
        foliageTurn: round(state.foliageTurn),
        greenUp: round(state.greenUp),
        trees,
    };
}

function checkLiveResults(results) {
    const byId = Object.fromEntries(results.map(result => [result.climate, result]));
    const failures = [];
    for (const result of results) {
        if (result.summerSnowDays !== 0) failures.push(result.climate + " had summer snow on " + result.summerSnowDays + " days");
        if (result.changes < 10) failures.push(result.climate + " changed weather only " + result.changes + " times");
        if (result.day330.trees.oak.holding === 0) failures.push(result.climate + " oaks never held leaves");
    }
    const northern = byId.northern;
    const arid = byId.arid;
    const temperate = byId.temperate;
    if (!northern || !arid || !temperate) {
        failures.push("missing one of the northern, arid or temperate climate results");
    } else {
        if (northern.snowDays <= arid.snowDays) failures.push("northern did not have more snow days than arid");
        if (northern.maxSnow < 0.9) failures.push("northern did not reach full snow cover");
        if (arid.maxSnow > 0.2) failures.push("arid held too much snow");
        if (northern.day30.trees.conifer.snow <= northern.day30.trees.birch.snow) failures.push("northern conifers did not hold snow longer than birches");
        if (temperate.day30.trees.conifer.snow <= temperate.day30.trees.birch.snow) failures.push("temperate conifers did not hold snow longer than birches");
    }
    if (failures.length) throw new Error("Climate audit failed:\n" + failures.join("\n"));
    return {
        summerSnowFree: true,
        weatherChangesAboveTen: true,
        oakMarcescence: true,
        northernSnowierThanArid: true,
        conifersHoldSnow: true,
    };
}

async function renderClimateSheet(context, panels, meta) {
    const sheet = await context.newPage();
    await sheet.setViewportSize({ width: 2600, height: 3550 });
    const dataUrl = buffer => "data:image/png;base64," + buffer.toString("base64");
    const columns = matrixDays.map(day =>
        `<div class="column-head"><strong>DAY ${day}</strong><small>${seasonName(day)}</small></div>`
    ).join("");
    const rows = climates.map(climate => {
        const cells = matrixDays.map(day => {
            const panel = panels.find(candidate => candidate.climate === climate.id && candidate.day === day);
            return `<figure>
                <img src="${dataUrl(panel.buffer)}" alt="${escapeHtml(climate.label)} grove on day ${day}">
                <figcaption><strong>SNOW ${panel.metrics.snowCover.toFixed(2)}</strong><small>TURN ${panel.metrics.foliageTurn.toFixed(2)} · CONIFER ${panel.metrics.trees.conifer.snow.toFixed(2)}</small></figcaption>
            </figure>`;
        }).join("");
        return `<div class="row-head"><strong>${escapeHtml(climate.label)}</strong><small>${escapeHtml(climate.note)}</small></div>${cells}`;
    }).join("");
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #080e10; color: #eadfc7; font-family: Georgia, "Times New Roman", serif; }
    .sheet {
        width: 2520px; padding: 34px 42px 30px;
        background:
            radial-gradient(circle at 50% 0%, rgba(170, 137, 79, .12), transparent 46%),
            linear-gradient(180deg, #0d1719, #081012);
    }
    .eyebrow { color: #b6935b; font: 700 11px/1.2 Arial, sans-serif; letter-spacing: .24em; }
    h1 { margin: 10px 0 8px; color: #f3e7ce; font-size: 34px; font-weight: 400; }
    .deck { margin: 0; color: #a8b4a8; font: 14px/1.5 Arial, sans-serif; }
    .grid {
        display: grid; grid-template-columns: 190px repeat(4, 1fr);
        gap: 14px; margin-top: 22px; align-items: stretch;
    }
    .column-head, .row-head {
        display: flex; flex-direction: column; justify-content: flex-end;
        padding: 0 0 9px 2px; border-bottom: 1px solid #4d3e29;
    }
    .column-head strong, .row-head strong { color: #e3c88f; font: 800 10px/1.3 Arial, sans-serif; letter-spacing: .16em; }
    .column-head small, .row-head small { margin-top: 4px; color: #8d9b90; font: 10px/1.3 Arial, sans-serif; letter-spacing: .08em; }
    .row-head { justify-content: flex-start; padding: 14px 8px 0 2px; border-bottom: 0; border-top: 1px solid #4d3e29; }
    .row-head strong { writing-mode: vertical-rl; transform: rotate(180deg); font-size: 12px; letter-spacing: .22em; }
    .row-head small { writing-mode: vertical-rl; transform: rotate(180deg); }
    figure {
        margin: 0; padding: 6px; border: 1px solid #4d3e29; border-radius: 4px;
        background: #101b1d; box-shadow: 0 8px 20px rgba(0, 0, 0, .28);
    }
    figure img { display: block; width: 100%; height: auto; border: 1px solid #263330; }
    figcaption { display: flex; flex-direction: column; gap: 3px; padding: 7px 2px 2px; }
    figcaption strong { color: #e3c88f; font: 800 9px/1.2 Arial, sans-serif; letter-spacing: .12em; }
    figcaption small { color: #8d9b90; font: 9px/1.2 Arial, sans-serif; letter-spacing: .08em; }
    footer { display: flex; justify-content: space-between; gap: 24px; margin-top: 22px; padding-top: 14px; border-top: 1px solid #4d3e29; color: #87958b; font: 11px/1.5 Arial, sans-serif; letter-spacing: .04em; }
    footer strong { color: #c9ab73; font-weight: 700; }
</style></head><body>
<div class="sheet">
    <div class="eyebrow">KINGS &amp; CARDS · CLIMATE VISUAL REFERENCE</div>
    <h1>The same grove under five climates</h1>
    <p class="deck">Seed ${seed} · tile ${focus.x}, ${focus.y} · rooftops zoom 2.40× · HUD, entities, fog and weather hidden · same generated world, climate curve switched</p>
    <div class="grid"><div></div>${columns}${rows}</div>
    <footer>
        <span><strong>Generated</strong> ${meta.generatedAt} · <strong>Renderer</strong> ${escapeHtml(meta.renderer || "software WebGL")} · ${meta.width} × ${meta.height} terrain</span>
        <span>Days 250 / 280 / 310 / 50 · human-review reference, not a pixel-diff test.</span>
    </footer>
</div>
</body></html>`;
    return screenshotSheet(sheet, html);
}

async function renderLiveSheet(context, results, meta) {
    const sheet = await context.newPage();
    await sheet.setViewportSize({ width: 2600, height: 1080 });
    const dataUrl = buffer => "data:image/png;base64," + buffer.toString("base64");
    const cells = results.map(result => `
        <figure>
            <img src="${dataUrl(result.buffer)}" alt="${escapeHtml(result.label)} realm at day 330">
            <figcaption>
                <strong>${escapeHtml(result.label)}</strong>
                <small>SNOW ${result.snowDays} DAYS · ${result.changes} CHANGES · MAX ${result.maxSnow.toFixed(2)}</small>
            </figcaption>
        </figure>`).join("");
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #080e10; color: #eadfc7; font-family: Georgia, "Times New Roman", serif; }
    .sheet {
        width: 2480px; padding: 34px 42px 30px;
        background:
            radial-gradient(circle at 50% 0%, rgba(170, 137, 79, .12), transparent 46%),
            linear-gradient(180deg, #0d1719, #081012);
    }
    .eyebrow { color: #b6935b; font: 700 11px/1.2 Arial, sans-serif; letter-spacing: .24em; }
    h1 { margin: 10px 0 8px; color: #f3e7ce; font-size: 34px; font-weight: 400; }
    .deck { margin: 0; color: #a8b4a8; font: 14px/1.5 Arial, sans-serif; }
    .strip { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-top: 24px; }
    figure { margin: 0; padding: 6px; border: 1px solid #4d3e29; border-radius: 4px; background: #101b1d; box-shadow: 0 8px 20px rgba(0, 0, 0, .28); }
    figure img { display: block; width: 100%; height: auto; border: 1px solid #263330; }
    figcaption { display: flex; flex-direction: column; gap: 4px; padding: 7px 2px 2px; }
    figcaption strong { color: #e3c88f; font: 800 10px/1.2 Arial, sans-serif; letter-spacing: .14em; }
    figcaption small { color: #8d9b90; font: 9px/1.35 Arial, sans-serif; letter-spacing: .06em; }
    footer { display: flex; justify-content: space-between; gap: 24px; margin-top: 22px; padding-top: 14px; border-top: 1px solid #4d3e29; color: #87958b; font: 11px/1.5 Arial, sans-serif; letter-spacing: .04em; }
    footer strong { color: #c9ab73; font-weight: 700; }
</style></head><body>
<div class="sheet">
    <div class="eyebrow">KINGS &amp; CARDS · CLIMATE LIVE CHECK</div>
    <h1>Five climates in play</h1>
    <p class="deck">Seed ${seed} · 1280 × 800 game view · day 330 after a 400-day weather audit · no forced weather overlay</p>
    <div class="strip">${cells}</div>
    <footer>
        <span><strong>Generated</strong> ${meta.generatedAt} · <strong>Renderer</strong> ${escapeHtml(meta.renderer || "software WebGL")}</span>
        <span>Each realm ran the real seeded weather stream. Snow remains governed by the climate's ground cover.</span>
    </footer>
</div>
</body></html>`;
    return screenshotSheet(sheet, html);
}

async function screenshotSheet(sheet, html) {
    await sheet.setContent(html, { waitUntil: "load" });
    await sheet.evaluate(() => Promise.all([...document.images].map(image => image.complete ? Promise.resolve() : new Promise(resolve => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
    }))));
    const png = await sheet.locator(".sheet").screenshot({ animations: "disabled" });
    await sheet.close();
    return png;
}

function seasonName(day) {
    return ["SPRING", "SUMMER", "AUTUMN", "WINTER"][Math.floor((((day % 400) + 400) % 400) / 100)];
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
    }[character]));
}
