// Deterministic visual reference for desert and semi-desert ecology (1.2.8).
//
// This is a human-review artifact, not a pixel-diff test. It builds one arid
// realm, finds a real generated tile for every desert formation, captures the
// same 2.4x interior view, and follows one oasis through four seasons.
//
// Usage: npm run test:desert-reference
// Output: docs/terrain-reference/desert-reference.png
//         docs/terrain-reference/desert-seasons.png
//         docs/terrain-reference/desert-reference.json

import http from "node:http";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { browserLaunchOptions, checkBrowser, printBrowserHelp } from "./browser-preflight.mjs";

const gameRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
process.chdir(gameRoot);

const outputDir = path.resolve(process.env.DESERT_REFERENCE_OUT || path.join(gameRoot, "docs/terrain-reference"));
const seed = 20261100;
const viewport = { width: 800, height: 800 };
const formations = Object.freeze([
    "sand-sea", "dune-field", "rock-desert", "gravel-desert", "pebble-plain",
    "salt-flat", "semi-desert", "cold-desert", "mountain-desert", "dry-basin",
]);
const seasonDays = Object.freeze([50, 150, 250, 350]);

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
    await page.locator("#player-name-input").fill("Desert Reference");
    await page.locator("#world-climate").selectOption("arid");
    for (const [selector, value] of [
        ["#world-water", "15"], ["#world-landmass", "62"],
        ["#world-fertility", "18"], ["#world-wetlands", "0"],
        ["#world-mountains", "78"], ["#world-ruggedness", "78"],
        ["#world-aridity", "100"], ["#world-forests", "8"],
    ]) {
        await page.locator(selector).evaluate((element, next) => {
            element.value = next;
            element.dispatchEvent(new Event("input", { bubbles: true }));
            element.dispatchEvent(new Event("change", { bubbles: true }));
        }, value);
    }
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 30000 });
    await page.waitForTimeout(1200);
    // A first-day micro-event can open over the world. It is real gameplay, not
    // terrain detail, so remove it from this visual-reference page.
    await page.evaluate(() => {
        const removeOverlays = () => {
            for (const overlay of document.querySelectorAll(".screen-overlay")) overlay.remove();
        };
        removeOverlays();
        new MutationObserver(removeOverlays).observe(document.body, {
            childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"],
        });
    });

    await page.addStyleTag({
        content: `
            body.desert-reference .topbar,
            body.desert-reference .realm-nav,
            body.desert-reference .side-panel,
            body.desert-reference .screen-overlay,
            body.desert-reference #realm-event-modal,
            body.desert-reference #event-notification,
            body.desert-reference #command-modal,
            body.desert-reference #build-modal { display: none !important; }
            body.desert-reference .game-shell,
            body.desert-reference .game-layout { display: block !important; height: 100vh !important; }
            body.desert-reference #canvas-wrapper {
                position: fixed !important; inset: 0 !important;
                width: 100vw !important; height: 100vh !important;
                background: #17130e !important;
            }
            body.desert-reference #canvas-wrapper > *:not(#terrain-canvas):not(#canvas) {
                visibility: hidden !important;
            }
        `,
    });

    const webgl = await page.evaluate(async () => {
        document.body.classList.add("desert-reference");
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
            width: canvas.width,
            height: canvas.height,
            renderer: gl ? gl.getParameter(gl.RENDERER) : null,
        };
    });
    if (!webgl.hasGl) throw new Error("The desert reference requires WebGL2; the terrain fell back to Canvas2D.");

    const scan = await page.evaluate(async ({ targetFormations }) => {
        const { state } = await import("./js/core/state.js");
        const { getHeightAt, getMoistureAt, getTemperatureAt } = await import("./js/world/world.js");
        const { desertProfileAt, isDesertSite } = await import("./js/world/desert-ecology.js");
        const width = Number(state.worldW) || 160;
        const height = Number(state.worldH) || 160;
        const seaLevel = Number(state.seaLevel) || 0.33;
        const climate = state.worldOptions?.climate || "arid";
        const aridity = state.worldOptions?.aridity ?? 100;
        const dayOfYear = Number(state.dayOfYear) || 150;
        const found = {};
        for (let y = 4; y < height - 4; y += 1) {
            for (let x = 4; x < width - 4; x += 1) {
                const profileContext = {
                    seed: Number(state.worldSeed) || 1,
                    moisture: getMoistureAt(x + 0.5, y + 0.5),
                    temperature: getTemperatureAt(x + 0.5, y + 0.5),
                    height: getHeightAt(x + 0.5, y + 0.5),
                    seaLevel, climate, aridity, dayOfYear,
                    year: Number(state.year) || 1,
                    hour: 12, weather: "clear", wind: 1.1,
                };
                if (!isDesertSite(x + 0.5, y + 0.5, profileContext)) continue;
                const profile = desertProfileAt(x + 0.5, y + 0.5, profileContext);
                if (!targetFormations.includes(profile.formation)) continue;
                const score = profile.features.length + (profile.water.oasis ? 12 : 0) + profile.vegetation.palms.length * 2;
                if (!found[profile.formation] || score > found[profile.formation].score) {
                    found[profile.formation] = {
                        x, y, score,
                        formation: profile.formation,
                        label: profile.label,
                        sand: profile.sand.colour,
                        dunes: profile.dunes.types,
                        water: profile.water.source,
                        fields: profile.settlement.fields,
                        palms: profile.vegetation.palms.map(palm => palm.label),
                        goods: profile.goods.map(good => good.label),
                        fauna: profile.fauna.map(animal => animal.label),
                        features: profile.features,
                    };
                }
            }
        }
        return {
            world: { width, height, climate, aridity, seaLevel },
            found,
        };
    }, { targetFormations: formations });

    const missing = formations.filter(formation => !scan.found[formation]);
    if (missing.length) throw new Error("No real desert tile found for formations: " + missing.join(", "));

    const frames = [];
    for (const formation of formations) {
        const tile = scan.found[formation];
        const missesBeforeMove = await terrainCacheMisses(page);
        await page.evaluate(async ({ x, y }) => {
            const { state } = await import("./js/core/state.js");
            const { setZoomLevel, clampCamera } = await import("./js/presentation/camera.js");
            const { CELL } = await import("./js/core/config.js");
            state.isPaused = true;
            state.weather = "clear";
            state.timeOfDay = 12;
            state.dayOfYear = 150;
            state.seasonIndex = 1;
            setZoomLevel(4);
            state.zoom = state.zoomTarget;
            state.zoomLevel = 4;
            state.zoomAnchor = null;
            state.camera.x = (x + 0.5) * CELL * state.zoom - state.canvas.width / 2;
            state.camera.y = (y + 0.5) * CELL * state.zoom - state.canvas.height / 2;
            clampCamera();
        }, { x: tile.x, y: tile.y });
        await waitForDecorationOverlay(page, missesBeforeMove);
        const buffer = await page.locator("#canvas-wrapper").screenshot({ type: "png", animations: "disabled" });
        frames.push({ formation, tile, buffer });
        console.log("Captured " + tile.label + " at " + tile.x + ", " + tile.y);
    }

    const oasisTile = Object.values(scan.found).sort((a, b) => (b.water ? 1 : 0) - (a.water ? 1 : 0) || b.features.length - a.features.length)[0];
    const seasonal = [];
    for (const day of seasonDays) {
        const missesBeforeMove = await terrainCacheMisses(page);
        await page.evaluate(async ({ x, y, day }) => {
            const { state } = await import("./js/core/state.js");
            const { setZoomLevel, clampCamera } = await import("./js/presentation/camera.js");
            const { CELL } = await import("./js/core/config.js");
            state.isPaused = true;
            state.weather = "clear";
            state.timeOfDay = 12;
            state.dayOfYear = day;
            state.seasonIndex = Math.floor(day / 100) % 4;
            setZoomLevel(4);
            state.zoom = state.zoomTarget;
            state.zoomLevel = 4;
            state.zoomAnchor = null;
            state.camera.x = (x + 0.5) * CELL * state.zoom - state.canvas.width / 2;
            state.camera.y = (y + 0.5) * CELL * state.zoom - state.canvas.height / 2;
            clampCamera();
        }, { x: oasisTile.x, y: oasisTile.y, day });
        await waitForDecorationOverlay(page, missesBeforeMove);
        const buffer = await page.locator("#canvas-wrapper").screenshot({ type: "png", animations: "disabled" });
        seasonal.push({ day, buffer });
        console.log("Captured desert season day " + day);
    }

    const generatedAt = new Date().toISOString();
    const formationSheet = await renderSheet(context, frames, {
        generatedAt,
        renderer: webgl.renderer,
        world: scan.world,
        columns: 5,
        title: "Ten desert formations, one deterministic model",
        eyebrow: "KINGS & CARDS · WÜSTEN UND HALBWÜSTEN 1.2.8",
        note: "Human-review reference, not a pixel-diff test. Real generated tiles, not hand-placed demo props.",
    });
    const formationPath = path.join(outputDir, "desert-reference.png");
    await fs.writeFile(formationPath, formationSheet);

    const seasonSheet = await renderSeasonSheet(context, seasonal, {
        generatedAt,
        renderer: webgl.renderer,
        tile: oasisTile,
        title: "One oasis through the desert year",
        eyebrow: "KINGS & CARDS · DESERT SEASONS",
    });
    const seasonPath = path.join(outputDir, "desert-seasons.png");
    await fs.writeFile(seasonPath, seasonSheet);

    const hashArtifact = buffer => createHash("sha256").update(buffer).digest("hex");
    const metadata = {
        seed,
        viewport,
        timeOfDay: 12,
        canvas: { width: webgl.width, height: webgl.height },
        renderer: webgl.renderer,
        generatedAt,
        world: scan.world,
        formations: frames.map(frame => ({
            formation: frame.formation,
            x: frame.tile.x,
            y: frame.tile.y,
            label: frame.tile.label,
            sand: frame.tile.sand,
            dunes: frame.tile.dunes,
            water: frame.tile.water,
            fields: frame.tile.fields,
            palms: frame.tile.palms,
            goods: frame.tile.goods,
            fauna: frame.tile.fauna,
            featureCount: frame.tile.features.length,
        })),
        seasonalFocus: { x: oasisTile.x, y: oasisTile.y, label: oasisTile.label, formation: oasisTile.formation },
        seasonalDays: seasonDays,
        artifactHashes: {
            formations: hashArtifact(formationSheet),
            seasons: hashArtifact(seasonSheet),
        },
        note: "Arid realm, 100 aridity, 8% forest cover; HUD, entities, fog and weather hidden; paused simulation; 2.4x interior view at midday. Every formation is a real generated tile. The seasonal strip follows a water-bearing tile through four seasons. Not a GPU performance benchmark.",
    };
    await fs.writeFile(path.join(outputDir, "desert-reference.json"), JSON.stringify(metadata, null, 2) + "\n");

    console.log("Formation sheet: " + path.relative(gameRoot, formationPath));
    console.log("Seasonal desert: " + path.relative(gameRoot, seasonPath));
    console.log("Renderer: " + (webgl.renderer || "unknown") + " · canvas " + webgl.width + "×" + webgl.height);
    if (diagnostics.length) console.log("Diagnostics: " + JSON.stringify(diagnostics, null, 2));
    const fatal = diagnostics.filter(text => /Terrain WebGL|atlas upload|shader compilation|pageerror/i.test(text));
    if (fatal.length) throw new Error("Desert rendering diagnostics were emitted:\n" + fatal.join("\n"));
} finally {
    await browser.close().catch(() => {});
    await new Promise(resolve => server.close(resolve));
}

async function terrainCacheMisses(page) {
    return page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        return Number(state.terrainCacheMisses) || 0;
    });
}

async function waitForDecorationOverlay(page, baselineMisses) {
    await page.evaluate(async baseline => {
        const { state } = await import("./js/core/state.js");
        const deadline = performance.now() + 10000;
        while ((Number(state.terrainCacheMisses) || 0) <= baseline) {
            if (performance.now() > deadline) {
                throw new Error("The desert decoration overlay did not rebuild after the camera move. misses="
                    + (Number(state.terrainCacheMisses) || 0)
                    + " treeDraws=" + (Number(state.terrainTreeDraws) || 0));
            }
            await new Promise(resolve => requestAnimationFrame(resolve));
        }
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, baselineMisses);
}

async function renderSheet(browserContext, frames, meta) {
    const sheet = await browserContext.newPage();
    await sheet.setViewportSize({ width: 1900, height: 1900 });
    const dataUrl = buffer => "data:image/png;base64," + buffer.toString("base64");
    const cells = frames.map(frame => `
        <figure>
            <img src="${dataUrl(frame.buffer)}" alt="${escapeHtml(frame.tile.label)}">
            <figcaption>
                <strong>${escapeHtml(frame.tile.label)}</strong>
                <small>${escapeHtml(frame.tile.sand)} sand · ${escapeHtml(frame.tile.dunes.join(" · ") || "rock / gravel ground")}</small>
                <em>${escapeHtml(frame.tile.goods.slice(0, 4).join(" · ") || "no surface harvest")}</em>
                <span>TILE ${frame.tile.x}, ${frame.tile.y} · ${frame.tile.features.length} / 75 FEATURES${frame.tile.water ? " · WATER " + escapeHtml(frame.tile.water) : ""}</span>
            </figcaption>
        </figure>`).join("");
    const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><style>
        :root { color-scheme: dark; }
        * { box-sizing: border-box; }
        body { margin: 0; background: #0c0b09; color: #eadfc7; font-family: Georgia, "Times New Roman", serif; }
        .sheet { width: 1840px; padding: 34px 42px 30px; background: radial-gradient(circle at 50% 0%, rgba(187, 139, 73, .16), transparent 48%), linear-gradient(180deg, #1b1610, #0b0b09); }
        .eyebrow { color: #c19a5d; font: 700 11px/1.2 Arial, sans-serif; letter-spacing: .24em; }
        h1 { margin: 10px 0 8px; color: #f3e7ce; font-size: 34px; font-weight: 400; }
        .deck { margin: 0; color: #b6b09e; font: 14px/1.5 Arial, sans-serif; }
        .grid { display: grid; grid-template-columns: repeat(${meta.columns}, 1fr); gap: 14px; margin-top: 24px; }
        figure { margin: 0; padding: 6px; border: 1px solid #56402a; border-radius: 4px; background: #17120d; box-shadow: 0 8px 20px rgba(0, 0, 0, .3); }
        figure img { display: block; width: 100%; aspect-ratio: 1; object-fit: cover; border: 1px solid #35291e; }
        figcaption { display: flex; flex-direction: column; gap: 4px; padding: 8px 3px 2px; min-height: 78px; }
        figcaption strong { color: #e3c88f; font: 800 11px/1.2 Arial, sans-serif; letter-spacing: .12em; text-transform: uppercase; }
        figcaption small { color: #c1b9a5; font: 10px/1.25 Arial, sans-serif; }
        figcaption em { color: #b5a06d; font: italic 10px/1.25 Georgia, serif; }
        figcaption span { color: #8d8472; font: 9px/1.2 Arial, sans-serif; letter-spacing: .08em; margin-top: auto; }
        footer { display: flex; justify-content: space-between; gap: 24px; margin-top: 22px; padding-top: 14px; border-top: 1px solid #56402a; color: #938b78; font: 11px/1.5 Arial, sans-serif; }
        footer strong { color: #c9ab73; }
    </style></head><body>
    <div class="sheet">
        <div class="eyebrow">${escapeHtml(meta.eyebrow)}</div>
        <h1>${escapeHtml(meta.title)}</h1>
        <p class="deck">Seed ${seed} · ${meta.world.width} × ${meta.world.height} world · ${escapeHtml(meta.world.climate)} climate · aridity ${meta.world.aridity} · 2.4× interior view · midday · HUD, entities, fog and weather hidden · simulation paused</p>
        <div class="grid">${cells}</div>
        <footer><span><strong>Generated</strong> ${meta.generatedAt} · <strong>Renderer</strong> ${escapeHtml(meta.renderer || "unknown")}</span><span>${escapeHtml(meta.note)}</span></footer>
    </div>
    </body></html>`;
    await sheet.setContent(html, { waitUntil: "load" });
    await waitForImages(sheet);
    const png = await sheet.locator(".sheet").screenshot({ animations: "disabled" });
    await sheet.close();
    return png;
}

async function renderSeasonSheet(browserContext, frames, meta) {
    const sheet = await browserContext.newPage();
    await sheet.setViewportSize({ width: 1900, height: 820 });
    const dataUrl = buffer => "data:image/png;base64," + buffer.toString("base64");
    const labels = ["FRÜHLING", "SOMMER", "HERBST", "WINTER"];
    const cells = frames.map((frame, index) => `
        <figure>
            <img src="${dataUrl(frame.buffer)}" alt="Desert on day ${frame.day}">
            <figcaption><strong>DAY ${frame.day}</strong><small>${labels[index]}</small></figcaption>
        </figure>`).join("");
    const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><style>
        :root { color-scheme: dark; }
        * { box-sizing: border-box; }
        body { margin: 0; background: #0c0b09; color: #eadfc7; font-family: Georgia, "Times New Roman", serif; }
        .sheet { width: 1840px; padding: 34px 42px 30px; background: radial-gradient(circle at 50% 0%, rgba(187, 139, 73, .16), transparent 48%), linear-gradient(180deg, #1b1610, #0b0b09); }
        .eyebrow { color: #c19a5d; font: 700 11px/1.2 Arial, sans-serif; letter-spacing: .24em; }
        h1 { margin: 10px 0 8px; color: #f3e7ce; font-size: 34px; font-weight: 400; }
        .deck { margin: 0; color: #b6b09e; font: 14px/1.5 Arial, sans-serif; }
        .strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-top: 24px; }
        figure { margin: 0; padding: 6px; border: 1px solid #56402a; border-radius: 4px; background: #17120d; box-shadow: 0 8px 20px rgba(0, 0, 0, .3); }
        figure img { display: block; width: 100%; aspect-ratio: 1; object-fit: cover; border: 1px solid #35291e; }
        figcaption { display: flex; flex-direction: column; gap: 3px; padding: 8px 3px 2px; }
        figcaption strong { color: #e3c88f; font: 800 11px/1.2 Arial, sans-serif; letter-spacing: .14em; }
        figcaption small { color: #8d8472; font: 10px/1.2 Arial, sans-serif; letter-spacing: .12em; }
        footer { display: flex; justify-content: space-between; gap: 24px; margin-top: 22px; padding-top: 14px; border-top: 1px solid #56402a; color: #938b78; font: 11px/1.5 Arial, sans-serif; }
        footer strong { color: #c9ab73; }
    </style></head><body>
    <div class="sheet">
        <div class="eyebrow">${escapeHtml(meta.eyebrow)}</div>
        <h1>${escapeHtml(meta.title)}</h1>
        <p class="deck">Seed ${seed} · tile ${meta.tile.x}, ${meta.tile.y} · ${escapeHtml(meta.tile.label)} · ${escapeHtml(meta.tile.sand)} sand · 2.4× interior view · weather and entities hidden</p>
        <div class="strip">${cells}</div>
        <footer><span><strong>Generated</strong> ${meta.generatedAt} · <strong>Renderer</strong> ${escapeHtml(meta.renderer || "unknown")}</span><span>Rare desert bloom, summer heat haze, dry autumn ground and cold winter light on the same oasis.</span></footer>
    </div>
    </body></html>`;
    await sheet.setContent(html, { waitUntil: "load" });
    await waitForImages(sheet);
    const png = await sheet.locator(".sheet").screenshot({ animations: "disabled" });
    await sheet.close();
    return png;
}

async function waitForImages(sheet) {
    await sheet.evaluate(() => Promise.all([...document.images].map(image => image.complete
        ? Promise.resolve()
        : new Promise(resolve => {
            image.addEventListener("load", resolve, { once: true });
            image.addEventListener("error", resolve, { once: true });
        }))));
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
    }[character]));
}
