// Browser proof for terrain-renderer recycling.
//
// The performance settings switch between Canvas2D and WebGL2. A canvas keeps
// its first context type forever, so the old implementation replaced the whole
// surface and forced a WebGL context loss on every switch. This audit drives
// the real settings handler through 20 full Canvas -> WebGL -> Canvas cycles
// and proves:
//   1. no WebGL context is lost, leaked or created per switch;
//   2. the same two canvases are reused;
//   3. the visible terrain is non-empty after every switch;
//   4. console and CDP stay free of WebGL/driver warnings.
//
// It also decodes each element screenshot in-process, so "not empty" means
// actual pixel variance rather than only a successful draw call.

import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { browserLaunchOptions, checkBrowser, printBrowserHelp } from "./browser-preflight.mjs";

const gameRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
process.chdir(gameRoot);

const seed = 20261112;
const viewport = { width: 900, height: 640 };
const cycles = 20;
const outputDir = path.resolve(process.env.RENDERER_RECYCLE_OUT || path.join(gameRoot, "artifacts/renderer-recycle-audit"));
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

// Minimal PNG decoder for Playwright's 8-bit, non-interlaced screenshots.
// Keeping it local avoids adding an image dependency just for this audit.
function decodePng(buffer) {
    assert.deepEqual(buffer.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), "not a PNG");
    let offset = 8;
    let width = 0, height = 0, bitDepth = 0, colorType = 0;
    const idat = [];
    while (offset < buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.toString("ascii", offset + 4, offset + 8);
        const data = buffer.subarray(offset + 8, offset + 8 + length);
        offset += 12 + length;
        if (type === "IHDR") {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            bitDepth = data[8];
            colorType = data[9];
            assert.equal(data[12], 0, "interlaced screenshots are not supported");
        } else if (type === "IDAT") {
            idat.push(data);
        } else if (type === "IEND") {
            break;
        }
    }
    const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : colorType === 0 ? 1 : 0;
    assert.ok(channels > 0, "unsupported PNG colour type " + colorType);
    assert.equal(bitDepth, 8, "unsupported PNG bit depth " + bitDepth);
    const raw = inflateSync(Buffer.concat(idat));
    const stride = width * channels;
    const pixels = Buffer.alloc(stride * height);
    let cursor = 0;
    for (let y = 0; y < height; y++) {
        const filter = raw[cursor++];
        const row = raw.subarray(cursor, cursor + stride);
        cursor += stride;
        const previous = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
        const target = pixels.subarray(y * stride, (y + 1) * stride);
        for (let x = 0; x < stride; x++) {
            const left = x >= channels ? target[x - channels] : 0;
            const up = previous ? previous[x] : 0;
            const upLeft = previous && x >= channels ? previous[x - channels] : 0;
            let value = row[x];
            if (filter === 1) value += left;
            else if (filter === 2) value += up;
            else if (filter === 3) value += (left + up) >> 1;
            else if (filter === 4) {
                const estimate = left + up - upLeft;
                const pa = Math.abs(estimate - left);
                const pb = Math.abs(estimate - up);
                const pc = Math.abs(estimate - upLeft);
                value += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
            } else {
                assert.equal(filter, 0, "unsupported PNG filter " + filter);
            }
            target[x] = value & 255;
        }
    }
    return { width, height, channels, pixels };
}

function imageStats(buffer) {
    const image = decodePng(buffer);
    const colors = new Set();
    let sum = 0;
    let squareSum = 0;
    let opaque = 0;
    const samples = image.width * image.height;
    for (let index = 0; index < image.pixels.length; index += image.channels) {
        const r = image.pixels[index];
        const g = image.channels >= 3 ? image.pixels[index + 1] : r;
        const b = image.channels >= 3 ? image.pixels[index + 2] : r;
        const alpha = image.channels === 4 ? image.pixels[index + 3] : 255;
        const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        sum += luminance;
        squareSum += luminance * luminance;
        if (alpha > 0) opaque++;
        if (colors.size < 4096) colors.add((r << 16) | (g << 8) | b);
    }
    const mean = sum / samples;
    return {
        width: image.width,
        height: image.height,
        mean: Number(mean.toFixed(2)),
        stdDev: Number(Math.sqrt(Math.max(0, squareSum / samples - mean * mean)).toFixed(2)),
        uniqueColors: colors.size,
        opaqueFraction: Number((opaque / samples).toFixed(3)),
    };
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
const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: "reduce" });
const page = await context.newPage();
const warnings = [];
const pageErrors = [];
const report = {
    switchPath: "Options > Terrain renderer select (change event)",
    seed,
    viewport,
    cycles,
    generatedAt: new Date().toISOString(),
    renderer: null,
    steps: [],
    warnings,
    pageErrors,
    contextBaseline: null,
    contextFinal: null,
    reusedCanvases: [],
};
let inCapture = false;
let client;
const captureWarning = (source, level, text) => {
    warnings.push({ source, level, text, duringScreenshot: inCapture });
};
try {
    client = await context.newCDPSession(page);
    await client.send("Log.enable");
    client.on("Log.entryAdded", event => {
        if (event.entry.level === "warning" || event.entry.level === "error") {
            captureWarning("cdp", event.entry.level, event.entry.text);
        }
    });
    page.on("console", message => {
        if (message.type() === "warning" || message.type() === "error") {
            captureWarning("console", message.type(), message.text());
        }
    });
    page.on("pageerror", error => pageErrors.push(error.message));

    await page.addInitScript(() => {
        const records = [];
        const lost = [];
        const restored = [];
        const canvasIds = new WeakMap();
        let nextCanvasId = 1;
        const canvasId = canvas => {
            if (!canvas) return null;
            if (!canvasIds.has(canvas)) canvasIds.set(canvas, nextCanvasId++);
            return canvasIds.get(canvas);
        };
        const originalGetContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(type, ...args) {
            const value = originalGetContext.call(this, type, ...args);
            if (value && (type === "webgl2" || type === "webgl") && !records.some(record => record.context === value)) {
                const record = { canvas: this, context: value, type, id: canvasId(this) };
                records.push(record);
                this.addEventListener("webglcontextlost", () => lost.push({ id: record.id, at: performance.now() }));
                this.addEventListener("webglcontextrestored", () => restored.push({ id: record.id, at: performance.now() }));
            }
            return value;
        };
        const identities = new Map();
        window.__rendererAudit = {
            canvasId,
            identity: (mode, canvas) => {
                if (!canvas) return { same: false, id: null };
                if (!identities.has(mode)) identities.set(mode, canvas);
                return { same: identities.get(mode) === canvas, id: canvasId(canvas) };
            },
            snapshot: () => ({
                created: records.length,
                lost: lost.length,
                restored: restored.length,
                active: records.filter(record => !record.context.isContextLost()).length,
                visible: records.filter(record => record.canvas.isConnected).length,
                contexts: records.map(record => ({
                    id: record.id,
                    type: record.type,
                    connected: record.canvas.isConnected,
                    width: record.canvas.width,
                    height: record.canvas.height,
                    lost: record.context.isContextLost(),
                })),
            }),
        };
    });

    await page.goto("http://127.0.0.1:" + port + "/", { waitUntil: "networkidle", timeout: 60000 });
    await page.locator("#world-seed-input").fill(String(seed));
    await page.locator("#player-name-input").fill("Renderer Recycle Audit");
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 45000 });
    await page.waitForTimeout(1800);
    const dismiss = page.locator("#realm-event-dismiss");
    if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
    await page.waitForTimeout(500);
    // Freeze a bright, clear midday scene. Otherwise 40 seconds of simulation
    // can turn the final capture into night rain and mask a blank terrain with
    // weather/entity pixels.
    await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        state.isPaused = true;
        state.weather = "clear";
        state.timeOfDay = 12;
        state.dayOfYear = 150;
        state.seasonIndex = 1;
        state.particles = [];
        state.floaters = [];
        state.entities = [];
        const width = Number(state.worldW) || 160;
        const height = Number(state.worldH) || 160;
        state.explored = Array.from({ length: width }, () => Array(height).fill(true));
        state.fogDirty = true;
        state.terrainCacheRevision = (Number(state.terrainCacheRevision) || 0) + 1;
    });
    await page.waitForTimeout(300);
    // Keep the layout intact but remove every overlay from the element
    // screenshot, including the interactive entity/weather canvas. The pixel
    // stats must describe the terrain backing store itself.
    await page.addStyleTag({
        content: `
            body.renderer-recycle-audit .topbar,
            body.renderer-recycle-audit .side-panel,
            body.renderer-recycle-audit .stage-topline,
            body.renderer-recycle-audit .zoom-panel,
            body.renderer-recycle-audit .placement-status,
            body.renderer-recycle-audit .minimap-frame,
            body.renderer-recycle-audit .stage-compass,
            body.renderer-recycle-audit .hint-box,
            body.renderer-recycle-audit #canvas-wrapper > #canvas {
                visibility: hidden !important;
            }
        `,
    });
    await page.evaluate(() => document.body.classList.add("renderer-recycle-audit"));
    await page.waitForTimeout(200);

    const baseState = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        return {
            mode: state.terrainMode,
            renderer: state.terrainRenderer,
            rendererName: state.terrainRendererName,
            fallback: state.terrainFallback,
            width: state.terrainCanvasEl?.width || 0,
            height: state.terrainCanvasEl?.height || 0,
        };
    });
    report.renderer = baseState.rendererName || null;
    assert.ok(baseState.width > 1 && baseState.height > 1, "the game did not create a terrain surface");

    const readState = () => page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const canvas = state.terrainCanvasEl;
        return {
            mode: state.terrainMode,
            renderer: state.terrainRenderer,
            auto: state.terrainAutoMode,
            fallback: state.terrainFallback,
            renderedFrames: state.renderedFrames,
            canvasId: window.__rendererAudit.canvasId(canvas),
            width: canvas?.width || 0,
            height: canvas?.height || 0,
            opacity: canvas ? Number(getComputedStyle(canvas).opacity) : 0,
        };
    });
    const readGl = () => page.evaluate(() => window.__rendererAudit.snapshot());

    const waitForMode = async (mode, previousFrames) => {
        let state = await readState();
        for (let attempt = 0; attempt < 120; attempt++) {
            state = await readState();
            if (state.mode === mode
                && state.renderedFrames >= previousFrames + 2
                && state.opacity > 0.5
                && state.width > 1
                && state.height > 1) {
                return state;
            }
            await page.waitForTimeout(100);
        }
        throw new Error("renderer did not become visible: " + mode + " :: " + JSON.stringify(state));
    };

    const openSettings = async () => {
        if (await page.locator("#settings-modal").isVisible().catch(() => false)) return;
        await page.locator('[data-kac-panel="settings"]').click();
        await page.locator("#settings-modal").waitFor({ state: "visible", timeout: 5000 });
        await page.locator("#settings-terrain-renderer").waitFor({ state: "visible", timeout: 5000 });
    };

    const closeSettings = async () => {
        if (!(await page.locator("#settings-modal").isVisible().catch(() => false))) return;
        await page.locator("#settings-close").click();
        await page.locator("#settings-modal").waitFor({ state: "hidden", timeout: 5000 });
    };

    const setRenderer = async (mode, label) => {
        const before = await readState();
        // Drive the same player-facing path as the game: Options, the visible
        // Terrain renderer select and its change handler. No audit shortcut
        // calls the renderer state or the reset hooks directly.
        await openSettings();
        await page.locator("#settings-terrain-renderer").selectOption(mode);
        await closeSettings();
        const after = await waitForMode(mode, before.renderedFrames);
        assert.equal(after.fallback, false, "renderer fallback while explicitly selecting " + mode);
        const gl = await readGl();
        assert.equal(gl.lost, 0, "a WebGL context was lost during " + label);
        assert.equal(gl.created, 1, "exactly one WebGL context is allowed during " + label + ": " + JSON.stringify(gl));
        assert.equal(gl.active, 1, "exactly one WebGL context must stay active during " + label + ": " + JSON.stringify(gl));
        assert.equal(gl.visible, mode === "webgl" ? 1 : 0,
            "the wrong number of WebGL surfaces was connected during " + label + ": " + JSON.stringify(gl));
        const identity = await page.evaluate(async mode => {
            const { state } = await import("./js/core/state.js");
            return window.__rendererAudit.identity(mode, state.terrainCanvasEl);
        }, mode);
        assert.equal(identity.same, true, "the " + mode + " canvas identity changed during " + label + ": " + JSON.stringify(identity));
        inCapture = true;
        let screenshot;
        try {
            screenshot = await page.locator("#terrain-canvas").screenshot({ animations: "disabled", timeout: 15000 });
        } finally {
            inCapture = false;
        }
        const stats = imageStats(screenshot);
        assert.ok(stats.opaqueFraction > 0.9, "terrain screenshot is transparent: " + JSON.stringify(stats));
        assert.ok(stats.uniqueColors >= 16, "terrain screenshot has too few colours: " + JSON.stringify(stats));
        assert.ok(stats.stdDev >= 1.5, "terrain screenshot is effectively blank: " + JSON.stringify(stats));
        assert.ok(stats.mean >= 4, "terrain screenshot is almost black: " + JSON.stringify(stats));
        const step = {
            label,
            mode: after.mode,
            canvasId: after.canvasId,
            width: after.width,
            height: after.height,
            opacity: after.opacity,
            stats,
            gl,
            identity,
        };
        report.steps.push(step);
        if (report.steps.length === 1
            || label.endsWith("-last")
            || label === "cycle-01-webgl"
            || label === "cycle-20-webgl") {
            await fs.writeFile(path.join(outputDir, label + ".png"), screenshot);
        }
        return step;
    };

    // Establish a deterministic Canvas baseline. On a software renderer the
    // automatic choice already is Canvas; on hardware this performs one switch.
    await setRenderer("canvas", "baseline-canvas");
    const baseline = await readGl();
    report.contextBaseline = baseline;
    assert.equal(baseline.created, 1, "initial Canvas mode must keep exactly one WebGL context: " + JSON.stringify(baseline));
    assert.equal(baseline.active, 1, "initial Canvas mode must keep the WebGL context active: " + JSON.stringify(baseline));
    assert.equal(baseline.lost, 0, "initial Canvas mode lost a WebGL context");

    const canvasIds = new Set([report.steps[0].canvasId]);
    for (let cycle = 1; cycle <= cycles; cycle++) {
        const webgl = await setRenderer("webgl", `cycle-${String(cycle).padStart(2, "0")}-webgl`);
        const canvas = await setRenderer("canvas", `cycle-${String(cycle).padStart(2, "0")}-canvas${cycle === cycles ? "-last" : ""}`);
        canvasIds.add(webgl.canvasId);
        canvasIds.add(canvas.canvasId);
        assert.equal(webgl.gl.created, 1, "cycle " + cycle + " created extra WebGL contexts: " + JSON.stringify(webgl.gl));
        assert.equal(canvas.gl.created, 1, "cycle " + cycle + " created extra WebGL contexts: " + JSON.stringify(canvas.gl));
    }

    const final = await readGl();
    report.contextFinal = final;
    report.reusedCanvases = [...canvasIds];
    report.activeContextCounts = [...new Set(report.steps.map(step => step.gl.active))];
    report.createdContextCounts = [...new Set(report.steps.map(step => step.gl.created))];
    report.maxActiveContexts = Math.max(...report.steps.map(step => step.gl.active));
    report.identities = {};
    for (const mode of ["canvas", "webgl"]) {
        const modeSteps = report.steps.filter(step => step.mode === mode);
        const ids = [...new Set(modeSteps.map(step => step.identity.id))];
        const stable = ids.length === 1 && modeSteps.every(step => step.identity.same);
        report.identities[mode] = { id: ids[0] ?? null, stable };
        assert.equal(stable, true, "the " + mode + " canvas was not reused: " + JSON.stringify(report.identities[mode]));
    }
    assert.deepEqual(warnings, [], "console/CDP warnings were emitted:\n" + JSON.stringify(warnings, null, 2));
    assert.deepEqual(pageErrors, [], "page errors were emitted:\n" + pageErrors.join("\n"));
    assert.equal(final.lost, 0, "WebGL contexts were lost: " + JSON.stringify(final));
    assert.equal(final.created, 1, "WebGL context count grew: " + JSON.stringify(final));
    assert.equal(final.active, 1, "a WebGL context became inactive: " + JSON.stringify(final));
    assert.equal(report.maxActiveContexts, 1, "more than one WebGL context was active at once");
    assert.deepEqual(report.activeContextCounts, [1], "the active WebGL context count changed over time");
    assert.deepEqual(report.createdContextCounts, [1], "the WebGL context count changed over time");
    assert.ok(canvasIds.size <= 2, "more than two canvases were used: " + JSON.stringify([...canvasIds]));
    assert.ok(report.steps.length === cycles * 2 + 1, "unexpected step count " + report.steps.length);
    report.minStdDev = Math.min(...report.steps.map(step => step.stats.stdDev));
    report.minUniqueColors = Math.min(...report.steps.map(step => step.stats.uniqueColors));
    report.allCapturesNonEmpty = report.steps.every(step =>
        step.stats.opaqueFraction > 0.9
        && step.stats.uniqueColors >= 16
        && step.stats.stdDev >= 1.5
        && step.stats.mean >= 4);
    assert.equal(report.allCapturesNonEmpty, true, "at least one terrain capture was empty");

    await fs.writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify({
        ok: true,
        cycles,
        switches: report.steps.length,
        renderer: report.renderer,
        contexts: final,
        reusedCanvases: report.reusedCanvases,
        warnings: warnings.length,
        minStdDev: Math.min(...report.steps.map(step => step.stats.stdDev)),
        minColors: Math.min(...report.steps.map(step => step.stats.uniqueColors)),
        output: path.relative(gameRoot, outputDir),
    }, null, 2));
} finally {
    await browser.close().catch(() => {});
    await new Promise(resolve => server.close(resolve));
}
