// Deterministic visual reference for the terrain surface.
//
// This is a human-review artifact, not a pixel-diff test: WebGL rasterization
// can differ between GPUs. It captures the same seed at four season peaks and
// all four zoom presets with the HUD, entities, fog and weather hidden.
//
// Usage: npm run test:terrain-reference
// Output: docs/terrain-reference/contact-sheet.png and reference.json
// Frames: $TMPDIR/kac-terrain-reference-frames (override with
// TERRAIN_REFERENCE_FRAMES; the committed artifact is the contact sheet).

import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { browserLaunchOptions, checkBrowser, printBrowserHelp } from "./browser-preflight.mjs";

const gameRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
process.chdir(gameRoot);

const outputDir = path.resolve(process.env.TERRAIN_REFERENCE_OUT || path.join(gameRoot, "docs/terrain-reference"));
const frameDir = path.resolve(process.env.TERRAIN_REFERENCE_FRAMES || path.join(os.tmpdir(), "kac-terrain-reference-frames"));
const seed = 20261104;
const viewport = { width: 800, height: 800 };

// Capture the middle of each season, where the new continuous palettes reach
// their full colour. Day 0/100/200/300 are transition days between seasons.
const seasons = Object.freeze([
    { key: "spring", label: "SPRING", day: 50 },
    { key: "summer", label: "SUMMER", day: 150 },
    { key: "autumn", label: "AUTUMN", day: 250 },
    { key: "winter", label: "WINTER", day: 350 },
]);
// A single autumn-to-spring strip makes the gradual browning, whitening and
// green-up visible at a glance. The four-season sheet only shows endpoints.
const transitionDays = Object.freeze([210, 240, 270, 300, 330, 360, 0, 15, 30, 50]);
const zooms = Object.freeze([
    { level: 1, key: "landscape", label: "LANDSCAPE", scale: 0.09 },
    { level: 2, key: "districts", label: "DISTRICTS", scale: 0.30 },
    { level: 3, key: "rooftops", label: "ROOFTOPS", scale: 0.95 },
    { level: 4, key: "interiors", label: "INTERIORS", scale: 2.40 },
]);

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
const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
const page = await context.newPage();
const diagnostics = [];
page.on("console", message => {
    if (message.type() === "error" || message.type() === "warning") {
        diagnostics.push(message.type() + ": " + message.text());
    }
});
page.on("pageerror", error => diagnostics.push("pageerror: " + error.message));

try {
    await page.goto("http://127.0.0.1:" + port + "/", { waitUntil: "networkidle" });
    await page.locator("#world-seed-input").fill(String(seed));
    await page.locator("#player-name-input").fill("Terrain Reference");
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 30000 });
    await page.waitForTimeout(1200);

    await page.addStyleTag({
        content: `
            body.terrain-reference .topbar,
            body.terrain-reference .realm-nav,
            body.terrain-reference .side-panel { display: none !important; }
            body.terrain-reference .game-shell,
            body.terrain-reference .game-layout { display: block !important; height: 100vh !important; }
            body.terrain-reference #canvas-wrapper {
                position: fixed !important; inset: 0 !important;
                width: 100vw !important; height: 100vh !important;
                background: #0c1415 !important;
            }
            body.terrain-reference #canvas-wrapper > *:not(#terrain-canvas) {
                visibility: hidden !important;
            }
            /* Trees, fog and props are drawn on the interactive canvas above the
               WebGL surface. The grove strip needs both layers, not just terrain. */
            body.terrain-reference.terrain-tree #canvas-wrapper > #canvas {
                visibility: visible !important;
            }
        `,
    });

    const webgl = await page.evaluate(async () => {
        document.body.classList.add("terrain-reference");
        const { state } = await import("./js/core/state.js");
        state.isPaused = true;
        state.weather = "clear";
        const width = Number(state.worldW) || 160;
        const height = Number(state.worldH) || 160;
        state.explored = Array.from({ length: width }, () => Array(height).fill(true));
        state.fogDirty = true;
        const { resize, centerCamera } = await import("./js/presentation/camera.js");
        resize();
        centerCamera();
        const canvas = document.getElementById("terrain-canvas");
        const gl = canvas.getContext("webgl2");
        return {
            hasGl: Boolean(gl),
            width: canvas.width,
            height: canvas.height,
            renderer: gl ? gl.getParameter(gl.RENDERER) : null,
            maxTextureSize: gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : 0,
        };
    });
    if (!webgl.hasGl) throw new Error("The reference requires WebGL2; the terrain fell back to Canvas2D.");
    await page.waitForTimeout(300);

    const frames = [];
    for (const season of seasons) {
        for (const zoom of zooms) {
            await page.evaluate(async ({ day, seasonIndex, level }) => {
                const { state } = await import("./js/core/state.js");
                const { centerCamera, setZoomLevel } = await import("./js/presentation/camera.js");
                state.isPaused = true;
                state.weather = "clear";
                state.seasonIndex = seasonIndex;
                state.dayOfYear = day;
                setZoomLevel(level);
                state.zoom = state.zoomTarget;
                state.zoomAnchor = null;
                centerCamera();
            }, { day: season.day, seasonIndex: seasons.indexOf(season), level: zoom.level });
            await page.waitForTimeout(180);
            const file = path.join(frameDir, season.key + "-" + zoom.key + ".png");
            const buffer = await page.locator("#terrain-canvas").screenshot({ path: file, type: "png", animations: "disabled" });
            frames.push({ season, zoom, buffer, file });
            console.log("Captured " + seasonalCaption(season, zoom));
        }
    }

    const transitions = [];
    for (const day of transitionDays) {
        await page.evaluate(async ({ day }) => {
            const { state } = await import("./js/core/state.js");
            const { centerCamera, setZoomLevel } = await import("./js/presentation/camera.js");
            state.isPaused = true;
            state.weather = "clear";
            state.dayOfYear = day;
            state.seasonIndex = Math.floor(day / 100) % 4;
            setZoomLevel(2);
            state.zoom = state.zoomTarget;
            state.zoomAnchor = null;
            centerCamera();
        }, { day });
        await page.waitForTimeout(180);
        const buffer = await page.locator("#terrain-canvas").screenshot({ type: "png", animations: "disabled" });
        transitions.push({ day, buffer });
        console.log("Captured transition day " + day);
    }

    // A close-up on a wooded tile is the only way to see per-tree timing:
    // which crowns turn first, which go bare and which hold brown leaves.
    const forestFocus = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const { getHeightAt, getMoistureAt, getTemperatureAt } = await import("./js/world/world.js");
        const width = Number(state.worldW) || 160;
        const height = Number(state.worldH) || 160;
        const sea = state.seaLevel ?? 0.33;
        let best = { x: Math.floor(width / 2), y: Math.floor(height / 2), score: -1 };
        for (let y = 6; y < height - 6; y += 2) {
            for (let x = 6; x < width - 6; x += 2) {
                let score = 0;
                for (let dy = -3; dy <= 3; dy++) {
                    for (let dx = -3; dx <= 3; dx++) {
                        const h = getHeightAt(x + dx + 0.5, y + dy + 0.5);
                        const m = getMoistureAt(x + dx + 0.5, y + dy + 0.5);
                        const t = getTemperatureAt(x + dx + 0.5, y + dy + 0.5);
                        if (h > sea + 0.04 && h < 0.76 && m > 0.5 && t > 0.4) score++;
                    }
                }
                if (score > best.score) best = { x, y, score };
            }
        }
        return best;
    });

    await page.evaluate(() => document.body.classList.add("terrain-tree"));
    const treeDays = [220, 250, 280, 310, 340, 0, 30, 60];
    const treeFrames = [];
    for (const day of treeDays) {
        await page.evaluate(async ({ day, x, y }) => {
            const { state } = await import("./js/core/state.js");
            const { clampCamera, setZoomLevel } = await import("./js/presentation/camera.js");
            const { CELL } = await import("./js/core/config.js");
            state.isPaused = true;
            state.weather = "clear";
            state.dayOfYear = day;
            state.seasonIndex = Math.floor(day / 100) % 4;
            setZoomLevel(4);
            state.zoom = state.zoomTarget;
            state.zoomLevel = 4;
            state.zoomAnchor = null;
            state.camera.x = (x + 0.5) * CELL * state.zoom - state.canvas.width / 2;
            state.camera.y = (y + 0.5) * CELL * state.zoom - state.canvas.height / 2;
            clampCamera();
        }, { day, x: forestFocus.x, y: forestFocus.y });
        await page.waitForTimeout(180);
        // The wrapper composites the WebGL ground and the decoration canvas.
        const buffer = await page.locator("#canvas-wrapper").screenshot({ type: "png", animations: "disabled" });
        treeFrames.push({ day, buffer });
        console.log("Captured grove day " + day);
    }

    const generatedAt = new Date().toISOString();
    const contactSheet = await renderContactSheet(context, frames, {
        generatedAt,
        renderer: webgl.renderer,
        width: webgl.width,
        height: webgl.height,
    });
    const contactPath = path.join(outputDir, "contact-sheet.png");
    await fs.writeFile(contactPath, contactSheet);
    const transitionSheet = await renderTransitionSheet(context, transitions, {
        renderer: webgl.renderer,
        title: "Autumn browns, winter whitens, spring greens again",
        deck: "Seed " + seed + " · district zoom 0.30× · one frame every 15–30 days · weather, HUD, entities and fog hidden",
        note: "Snow accumulates through late autumn, peaks in winter and melts through early spring.",
    });
    const transitionPath = path.join(outputDir, "season-transition.png");
    await fs.writeFile(transitionPath, transitionSheet);
    const treeSheet = await renderTransitionSheet(context, treeFrames, {
        renderer: webgl.renderer,
        title: "The same grove through the year",
        deck: "Seed " + seed + " · wooded tile " + forestFocus.x + ", " + forestFocus.y + " · rooftops zoom 2.40× · weather, HUD, entities and fog hidden",
        note: "Each tree has its own timing; oaks keep brown leaves into winter while conifers stay green.",
    });
    const treePath = path.join(outputDir, "tree-seasons.png");
    await fs.writeFile(treePath, treeSheet);

    const metadata = {
        seed,
        viewport,
        canvas: { width: webgl.width, height: webgl.height },
        renderer: webgl.renderer,
        maxTextureSize: webgl.maxTextureSize,
        generatedAt,
        seasons: seasons.map(season => ({ key: season.key, label: season.label, day: season.day })),
        zooms: zooms.map(zoom => ({ key: zoom.key, label: zoom.label, level: zoom.level, scale: zoom.scale })),
        framesDirectory: frameDir,
        frames: frames.map(frame => path.basename(frame.file)),
        transitions: transitions.map(frame => ({ day: frame.day })),
        transitionNote: "Autumn to spring at district zoom (0.30×); one frame every 15–30 days across the darkest and the greenest month.",
        treeFocus: forestFocus,
        treeDays,
        treeFrames: treeFrames.map(frame => ({ day: frame.day })),
        note: "HUD, entities, fog and weather hidden; paused simulation; camera centred. Not a GPU performance benchmark.",
    };
    await fs.writeFile(path.join(outputDir, "reference.json"), JSON.stringify(metadata, null, 2) + "\n");

    const fatal = diagnostics.filter(text => /Terrain WebGL|atlas upload|shader compilation/i.test(text));
    console.log("Contact sheet: " + path.relative(gameRoot, contactPath));
    console.log("Season transition: " + path.relative(gameRoot, transitionPath));
    console.log("Tree seasons: " + path.relative(gameRoot, treePath));
    console.log("Reference metadata: " + path.relative(gameRoot, path.join(outputDir, "reference.json")));
    console.log("Frames: " + frameDir);
    console.log("Renderer: " + (webgl.renderer || "unknown") + " · canvas " + webgl.width + "×" + webgl.height);
    if (diagnostics.length) console.log("Diagnostics: " + JSON.stringify(diagnostics, null, 2));
    if (fatal.length) throw new Error("Terrain rendering diagnostics were emitted:\n" + fatal.join("\n"));
} finally {
    await browser.close().catch(() => {});
    await new Promise(resolve => server.close(resolve));
}

function seasonalCaption(season, zoom) {
    return season.label + " · " + zoom.label;
}

async function renderContactSheet(browserContext, frames, meta) {
    const sheet = await browserContext.newPage();
    await sheet.setViewportSize({ width: 1900, height: 2200 });
    const dataUrl = buffer => "data:image/png;base64," + buffer.toString("base64");
    const columns = zooms.map((zoom, index) =>
        `<div class="column-head"><strong>${String(index + 1).padStart(2, "0")} · ${zoom.label}</strong><small>${zoom.scale.toFixed(2)}× zoom</small></div>`
    ).join("");
    const rows = seasons.map(season => {
        const cells = zooms.map(zoom => {
            const frame = frames.find(candidate => candidate.season.key === season.key && candidate.zoom.key === zoom.key);
            return `<figure><img src="${dataUrl(frame.buffer)}" alt="${season.label} at ${zoom.label} zoom"></figure>`;
        }).join("");
        return `<div class="row-head"><strong>${season.label}</strong><small>DAY ${season.day}</small></div>${cells}`;
    }).join("");
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
        margin: 0; background: #080e10; color: #eadfc7;
        font-family: Georgia, "Times New Roman", serif;
    }
    .sheet {
        width: 1840px; padding: 34px 42px 28px;
        background:
            radial-gradient(circle at 50% 0%, rgba(170, 137, 79, .12), transparent 46%),
            linear-gradient(180deg, #0d1719, #081012);
    }
    .eyebrow { color: #b6935b; font: 700 11px/1.2 Arial, sans-serif; letter-spacing: .24em; }
    h1 { margin: 10px 0 8px; color: #f3e7ce; font-size: 34px; font-weight: 400; letter-spacing: .01em; }
    .deck { margin: 0; color: #a8b4a8; font: 14px/1.5 Arial, sans-serif; }
    .grid {
        display: grid; grid-template-columns: 120px repeat(4, 1fr);
        gap: 14px; margin-top: 22px; align-items: stretch;
    }
    .column-head, .row-head {
        display: flex; flex-direction: column; justify-content: flex-end;
        padding: 0 0 9px 2px; border-bottom: 1px solid #4d3e29;
    }
    .column-head strong, .row-head strong { color: #e3c88f; font: 800 10px/1.3 Arial, sans-serif; letter-spacing: .16em; }
    .column-head small, .row-head small { margin-top: 4px; color: #8d9b90; font: 10px/1.3 Arial, sans-serif; letter-spacing: .08em; }
    .row-head { justify-content: flex-start; padding: 12px 8px 0 2px; border-bottom: 0; border-top: 1px solid #4d3e29; }
    .row-head strong { writing-mode: vertical-rl; transform: rotate(180deg); font-size: 12px; letter-spacing: .22em; }
    .row-head small { writing-mode: vertical-rl; transform: rotate(180deg); }
    figure {
        margin: 0; padding: 6px; border: 1px solid #4d3e29; border-radius: 4px;
        background: #101b1d; box-shadow: 0 8px 20px rgba(0, 0, 0, .28);
    }
    figure img { display: block; width: 100%; height: auto; border: 1px solid #263330; }
    footer {
        display: flex; justify-content: space-between; gap: 24px; margin-top: 22px;
        padding-top: 14px; border-top: 1px solid #4d3e29;
        color: #87958b; font: 11px/1.5 Arial, sans-serif; letter-spacing: .04em;
    }
    footer strong { color: #c9ab73; font-weight: 700; }
</style></head><body>
<div class="sheet">
    <div class="eyebrow">KINGS &amp; CARDS · TERRAIN VISUAL REFERENCE</div>
    <h1>Four seasons, four zoom levels</h1>
    <p class="deck">Seed ${seed} · ${meta.width} × ${meta.height} terrain capture · HUD, entities, fog and weather hidden · simulation paused · camera centred</p>
    <div class="grid">
        <div></div>${columns}
        ${rows}
    </div>
    <footer>
        <span><strong>Generated</strong> ${meta.generatedAt} · <strong>Renderer</strong> ${escapeHtml(meta.renderer || "unknown")}</span>
        <span>Human-review reference, not a pixel-diff test. WebGL colors may differ on real GPUs.</span>
    </footer>
</div>
</body></html>`;
    await sheet.setContent(html, { waitUntil: "load" });
    await sheet.evaluate(() => Promise.all([...document.images].map(image => image.complete ? Promise.resolve() : new Promise(resolve => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
    }))));
    const png = await sheet.locator(".sheet").screenshot({ animations: "disabled" });
    await sheet.close();
    return png;
}

async function renderTransitionSheet(browserContext, frames, meta) {
    const sheet = await browserContext.newPage();
    await sheet.setViewportSize({ width: 1900, height: 900 });
    const dataUrl = buffer => "data:image/png;base64," + buffer.toString("base64");
    const seasonName = day => ["SPRING", "SUMMER", "AUTUMN", "WINTER"][Math.floor((((day % 400) + 400) % 400) / 100)];
    const cells = frames.map(frame => `
        <figure>
            <img src="${dataUrl(frame.buffer)}" alt="Terrain on day ${frame.day}">
            <figcaption><strong>DAY ${frame.day}</strong><small>${seasonName(frame.day)}</small></figcaption>
        </figure>`).join("");
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #080e10; color: #eadfc7; font-family: Georgia, "Times New Roman", serif; }
    .sheet {
        width: 1840px; padding: 34px 42px 30px;
        background:
            radial-gradient(circle at 50% 0%, rgba(170, 137, 79, .12), transparent 46%),
            linear-gradient(180deg, #0d1719, #081012);
    }
    .eyebrow { color: #b6935b; font: 700 11px/1.2 Arial, sans-serif; letter-spacing: .24em; }
    h1 { margin: 10px 0 8px; color: #f3e7ce; font-size: 34px; font-weight: 400; }
    .deck { margin: 0; color: #a8b4a8; font: 14px/1.5 Arial, sans-serif; }
    .strip { display: grid; grid-template-columns: repeat(${frames.length}, 1fr); gap: 12px; margin-top: 24px; }
    figure { margin: 0; padding: 6px; border: 1px solid #4d3e29; border-radius: 4px; background: #101b1d; box-shadow: 0 8px 20px rgba(0, 0, 0, .28); }
    figure img { display: block; width: 100%; height: auto; border: 1px solid #263330; }
    figcaption { display: flex; flex-direction: column; gap: 3px; padding: 7px 2px 2px; }
    figcaption strong { color: #e3c88f; font: 800 10px/1.2 Arial, sans-serif; letter-spacing: .14em; }
    figcaption small { color: #8d9b90; font: 9px/1.2 Arial, sans-serif; letter-spacing: .12em; }
    footer { display: flex; justify-content: space-between; gap: 24px; margin-top: 22px; padding-top: 14px; border-top: 1px solid #4d3e29; color: #87958b; font: 11px/1.5 Arial, sans-serif; letter-spacing: .04em; }
    footer strong { color: #c9ab73; font-weight: 700; }
</style></head><body>
<div class="sheet">
    <div class="eyebrow">KINGS &amp; CARDS · TERRAIN SEASON TRANSITION</div>
    <h1>${escapeHtml(meta.title || "Autumn browns, winter whitens, spring greens again")}</h1>
    <p class="deck">${escapeHtml(meta.deck || "Season transition")} · simulation paused</p>
    <div class="strip">${cells}</div>
    <footer>
        <span><strong>Generated</strong> ${new Date().toISOString()} · <strong>Renderer</strong> ${escapeHtml(meta.renderer || "software WebGL")}</span>
        <span>${escapeHtml(meta.note || "Snow accumulates through late autumn, peaks in winter and melts through early spring.")}</span>
    </footer>
</div>
</body></html>`;
    await sheet.setContent(html, { waitUntil: "load" });
    await sheet.evaluate(() => Promise.all([...document.images].map(image => image.complete ? Promise.resolve() : new Promise(resolve => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
    }))));
    const png = await sheet.locator(".sheet").screenshot({ animations: "disabled" });
    await sheet.close();
    return png;
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
    }[character]));
}
