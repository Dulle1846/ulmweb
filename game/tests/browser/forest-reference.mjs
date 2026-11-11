// Deterministic visual reference for the forest ecology.
//
// This is a human-review artifact, not a pixel-diff test. It finds one real
// tile for each target formation in a fixed realm, captures the same 0.95x
// rooftop view for every formation, and then follows one woodland through the
// four seasons. The profile selects the 15 broadleaf, 12 conifer or 12 mixed
// formations; the camera, seed and renderer are recorded in the JSON file.
//
// Usage: npm run test:forest-reference
// Output: docs/terrain-reference/forest-reference.png
//         docs/terrain-reference/forest-seasons.png
//         docs/terrain-reference/forest-reference.json

import http from "node:http";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { browserLaunchOptions, checkBrowser, printBrowserHelp } from "./browser-preflight.mjs";

const gameRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
process.chdir(gameRoot);

const outputDir = path.resolve(process.env.FOREST_REFERENCE_OUT || path.join(gameRoot, "docs/terrain-reference"));
const seed = 20261104;
const coniferMode = process.env.FOREST_REFERENCE_PROFILE === "conifer";
const mixedMode = process.env.FOREST_REFERENCE_PROFILE === "mixed";
const viewport = { width: 800, height: 800 };
const broadleafTargets = Object.freeze([
    "oakwood", "beechwood", "birchwood", "maplewood", "chestnut-grove",
    "linden-elm", "mixed", "alluvial", "hillside", "ancient",
    "regenerating", "burned", "windthrow", "diseased", "cutover",
]);
const coniferTargets = Object.freeze([
    "sprucewood", "firwood", "pinewood", "larchwood",
    "pine-heath", "wet-conifer", "mountain-conifer", "subalpine-scrub",
    "mixed-conifer", "bark-beetle", "snowbreak", "drought-stressed",
]);
const mixedTargets = Object.freeze([
    "mixed-oak-beech-spruce", "mixed-fir-beech-maple", "pine-broadleaf",
    "mixed-alluvial", "mixed-montane", "mixed-open", "mixed-dense",
    "mixed-ancient", "mixed-young", "mixed-ecotone",
    "coppice-with-standards", "selection-forest",
]);
const targetTypes = Object.freeze(coniferMode ? coniferTargets : mixedMode ? mixedTargets : broadleafTargets);
const seasonDays = Object.freeze([50, 150, 250, 350]);
const outputNames = coniferMode
    ? { formation: "conifer-reference.png", seasonal: "conifer-seasons.png", species: "conifer-species.png", metadata: "conifer-reference.json" }
    : mixedMode
        ? { formation: "mixed-reference.png", seasonal: "mixed-seasons.png", metadata: "mixed-reference.json" }
        : { formation: "forest-reference.png", seasonal: "forest-seasons.png", metadata: "forest-reference.json" };

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
            // A new browser must always see the code under review, never a
            // stale module from an earlier reference run.
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
    await page.locator("#player-name-input").fill(coniferMode ? "Conifer Reference" : mixedMode ? "Mixed Forest Reference" : "Forest Reference");
    if (coniferMode) {
        await page.locator("#world-climate").selectOption("northern");
        await page.locator("#world-forests").evaluate(element => {
            element.value = "82";
            element.dispatchEvent(new Event("input", { bubbles: true }));
            element.dispatchEvent(new Event("change", { bubbles: true }));
        });
    }
    if (mixedMode) {
        await page.locator("#world-forests").evaluate(element => {
            element.value = "64";
            element.dispatchEvent(new Event("input", { bubbles: true }));
            element.dispatchEvent(new Event("change", { bubbles: true }));
        });
    }
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 30000 });
    await page.waitForTimeout(1200);

    await page.addStyleTag({
        content: `
            body.forest-reference .topbar,
            body.forest-reference .realm-nav,
            body.forest-reference .side-panel { display: none !important; }
            body.forest-reference .game-shell,
            body.forest-reference .game-layout { display: block !important; height: 100vh !important; }
            body.forest-reference #canvas-wrapper {
                position: fixed !important; inset: 0 !important;
                width: 100vw !important; height: 100vh !important;
                background: #0b1310 !important;
            }
            body.forest-reference #canvas-wrapper > *:not(#terrain-canvas):not(#canvas) {
                visibility: hidden !important;
            }
        `,
    });

    const webgl = await page.evaluate(async () => {
        document.body.classList.add("forest-reference");
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
        // This reference specifically audits the WebGL ground and its Canvas
        // decoration overlay. On a software renderer the automatic setting may
        // have chosen Canvas2D and locked the original surface to a 2D context;
        // force the renderer and replace that surface with a fresh one before
        // asking for WebGL2. Without this, a valid SwiftShader browser looks
        // like it has no WebGL support.
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
            worldWidth: width,
            worldHeight: height,
            renderer: gl ? gl.getParameter(gl.RENDERER) : null,
            maxTextureSize: gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : 0,
        };
    });
    if (!webgl.hasGl) throw new Error("The forest reference requires WebGL2; the terrain fell back to Canvas2D.");

    const scan = await page.evaluate(async ({ targets }) => {
        const { state } = await import("./js/core/state.js");
        const { getHeightAt, getMoistureAt, getTemperatureAt } = await import("./js/world/world.js");
        const { forestSnowDepthAt, forestStandAt } = await import("./js/world/forest-ecology.js");
        const { getResourceNodeAt } = await import("./js/systems/resource-geography.js");
        const width = Number(state.worldW) || 160;
        const height = Number(state.worldH) || 160;
        const climate = state.worldOptions?.climate || "temperate";
        const forests = state.worldOptions?.forests ?? 52;
        const found = {}, scores = {};
        const note = (tile, stockOverride = null) => {
            const node = getResourceNodeAt(tile.x, tile.y);
            const moisture = getMoistureAt(tile.x + 0.5, tile.y + 0.5);
            const temperature = getTemperatureAt(tile.x + 0.5, tile.y + 0.5);
            const h = getHeightAt(tile.x + 0.5, tile.y + 0.5);
            const stockRatio = stockOverride === null
                ? (node?.forestCapacity ? node.forestStock / node.forestCapacity : 1)
                : stockOverride;
            const stand = forestStandAt(tile.x + 0.5, tile.y + 0.5, {
                seed: Number(state.worldSeed) || 1, moisture, temperature, height: h,
                climate, forests, stockRatio, rockLine: 0.92,
            });
            const snow = forestSnowDepthAt(stand, 350, climate);
            return { ...tile, node, stand, moisture, temperature, height: h, stockRatio, snow };
        };
        for (let y = 4; y < height - 4; y += 2) {
            for (let x = 4; x < width - 4; x += 2) {
                const tile = note({ x, y });
                if (!tile.stand.forest || !tile.node?.forestCapacity) continue;
                if (!targets.includes(tile.stand.type)) continue;
                // Capture the most wooded tile of a formation rather than the
                // first one. The first hit was often a clearing, which made a
                // larchwood sheet look like open snow with a few caps.
                const score = Number(tile.stand.treeChance) + (1 - Number(tile.stand.clearing)) * 0.25;
                if (!found[tile.stand.type] || score > (scores[tile.stand.type] ?? -Infinity)) {
                    found[tile.stand.type] = tile;
                    scores[tile.stand.type] = score;
                }
            }
        }
        // Cutover is a management state rather than a weather event. Reuse a
        // wooded tile and force stock to zero only for that one frame, after the
        // real formation frames have already been captured. The generator's
        // cutover branch then supplies the stumps and regrowth.
        if (!found.cutover) {
            const donor = found.oakwood || found.beechwood || found.mixed || Object.values(found)[0];
            if (donor) found.cutover = note({ x: donor.x, y: donor.y }, 0);
        }
        return {
            world: { width, height, climate, forests },
            found: Object.fromEntries(Object.entries(found).map(([type, tile]) => [type, {
                x: tile.x, y: tile.y, type: tile.stand.type, label: tile.stand.label,
                age: tile.stand.ageClass, species: tile.stand.species.map(entry => entry.label),
                goods: tile.stand.goods, fauna: tile.stand.fauna,
                mixed: Boolean(tile.stand.mixed),
                mixtureLabel: tile.stand.mixture?.label || null,
                mixturePattern: tile.stand.mixture?.pattern || null,
                broadleafShare: Number((tile.stand.mixture?.broadleafShare || 0).toFixed(3)),
                coniferShare: Number((tile.stand.mixture?.coniferShare || 0).toFixed(3)),
                dominantSpecies: tile.stand.mixture?.dominant || null,
                canopyLayers: (tile.stand.canopyLayers || []).map(layer => layer.label),
                understoryType: tile.stand.understoryType || null,
                silviculture: tile.stand.silviculture || [],
                autumnPalette: tile.stand.autumnPalette || [],
                moisture: Number(tile.moisture.toFixed(3)), temperature: Number(tile.temperature.toFixed(3)),
                height: Number(tile.height.toFixed(3)), stockRatio: Number(tile.stockRatio.toFixed(3)),
                treeChance: Number((tile.stand.treeChance || 0).toFixed(3)),
                clearing: Number((tile.stand.clearing || 0).toFixed(3)),
                exposure: Number((tile.stand.exposure || 0).toFixed(3)),
                snowPotential: Number((tile.stand.snowPotential || 0).toFixed(3)),
                groundShade: Number((tile.stand.groundShade || 0).toFixed(3)),
                visibility: Number((tile.stand.visibility || 0).toFixed(3)),
                sightRadius: tile.stand.sightRadius,
                winterSnowDepthCm: tile.snow.cm,
            }])),
        };
    }, { targets: targetTypes });

    const missing = targetTypes.filter(type => !scan.found[type]);
    if (missing.length) throw new Error("No real tile found for forest formations: " + missing.join(", "));

    const frames = [];
    for (const type of targetTypes) {
        const tile = scan.found[type];
        if (type === "cutover") {
            // The captured frame really has its stock forced to zero; make the
            // caption report the state that was rendered, not the donor tile's
            // pre-capture stock.
            tile.stockRatio = 0;
            await page.evaluate(async ({ x, y }) => {
                const { state } = await import("./js/core/state.js");
                const width = Number(state.worldW) || 160;
                const index = y * width + x;
                if (state.resourceGeography?.forestStock) state.resourceGeography.forestStock[index] = 0;
            }, { x: tile.x, y: tile.y });
        }
        await page.evaluate(async ({ x, y, day }) => {
            const { state } = await import("./js/core/state.js");
            const { setZoomLevel, clampCamera } = await import("./js/presentation/camera.js");
            const { CELL } = await import("./js/core/config.js");
            state.isPaused = true;
            state.weather = "clear";
            // Midday removes the morning mist layer from the evidence frame so
            // the canopy shade and the reduced sight wall can be judged apart
            // from weather haze. It also makes the comparison deterministic.
            state.timeOfDay = 12;
            state.dayOfYear = day;
            state.seasonIndex = 1;
            setZoomLevel(3);
            state.zoom = state.zoomTarget;
            state.zoomLevel = 3;
            state.zoomAnchor = null;
            state.camera.x = (x + 0.5) * CELL * state.zoom - state.canvas.width / 2;
            state.camera.y = (y + 0.5) * CELL * state.zoom - state.canvas.height / 2;
            clampCamera();
        }, { x: tile.x, y: tile.y, day: 150 });
        await page.waitForTimeout(220);
        const buffer = await page.locator("#canvas-wrapper").screenshot({ type: "png", animations: "disabled" });
        frames.push({ type, tile, buffer });
        console.log("Captured " + tile.label + " at " + tile.x + ", " + tile.y);
        if (type === "cutover") {
            await page.evaluate(async ({ x, y }) => {
                const { state } = await import("./js/core/state.js");
                const width = Number(state.worldW) || 160;
                const index = y * width + x;
                if (state.resourceGeography?.forestStock) state.resourceGeography.forestStock[index] = state.resourceGeography.forestCapacity[index];
            }, { x: tile.x, y: tile.y });
        }
    }

    const seasonalTile = coniferMode
        ? (scan.found.larchwood || scan.found.sprucewood)
        : mixedMode
            ? (scan.found["mixed-oak-beech-spruce"] || scan.found["mixed-fir-beech-maple"] || scan.found["mixed-ancient"])
            : (scan.found.ancient || scan.found.oakwood || scan.found.beechwood);
    const seasonal = [];
    for (const day of seasonDays) {
        await page.evaluate(async ({ x, y, day }) => {
            const { state } = await import("./js/core/state.js");
            const { setZoomLevel, clampCamera } = await import("./js/presentation/camera.js");
            const { CELL } = await import("./js/core/config.js");
            state.isPaused = true;
            state.weather = "clear";
            state.timeOfDay = 12;
            state.dayOfYear = day;
            state.seasonIndex = Math.floor(day / 100) % 4;
            setZoomLevel(3);
            state.zoom = state.zoomTarget;
            state.zoomLevel = 3;
            state.zoomAnchor = null;
            state.camera.x = (x + 0.5) * CELL * state.zoom - state.canvas.width / 2;
            state.camera.y = (y + 0.5) * CELL * state.zoom - state.canvas.height / 2;
            clampCamera();
        }, { x: seasonalTile.x, y: seasonalTile.y, day });
        await page.waitForTimeout(220);
        const buffer = await page.locator("#canvas-wrapper").screenshot({ type: "png", animations: "disabled" });
        seasonal.push({ day, buffer });
        console.log("Captured seasonal forest day " + day);
    }

    // The formation sheets prove that the new species occur in real stands,
    // but a stand mixes several trees. This plate draws every conifer through
    // the production drawConifer() path with identical seed, day and scale, so
    // the pixel hashes can prove that yew and dwarf pine have their own
    // silhouette and palette instead of a relabelled spruce.
    const speciesPlate = coniferMode ? await captureConiferSpecies(page) : null;

    const formationSheet = await renderFormationSheet(context, frames, {
        seed, renderer: webgl.renderer, world: scan.world,
        conifer: coniferMode, mixed: mixedMode, columns: coniferMode || mixedMode ? 4 : 5,
        generatedAt: new Date().toISOString(),
    });
    const formationPath = path.join(outputDir, outputNames.formation);
    await fs.writeFile(formationPath, formationSheet);

    const seasonSheet = await renderSeasonSheet(context, seasonal, {
        seed, renderer: webgl.renderer, tile: seasonalTile, conifer: coniferMode, mixed: mixedMode,
        generatedAt: new Date().toISOString(),
    });
    const seasonPath = path.join(outputDir, outputNames.seasonal);
    await fs.writeFile(seasonPath, seasonSheet);

    let speciesPath = null;
    let speciesSheet = null;
    if (speciesPlate) {
        speciesPath = path.join(outputDir, outputNames.species);
        speciesSheet = await renderSpeciesSheet(context, speciesPlate, {
            seed, renderer: webgl.renderer, generatedAt: new Date().toISOString(),
        });
        await fs.writeFile(speciesPath, speciesSheet);
    }
    const hashArtifact = buffer => createHash("sha256").update(buffer).digest("hex");

    const metadata = {
        seed,
        viewport,
        timeOfDay: 12,
        canvas: { width: webgl.width, height: webgl.height },
        renderer: webgl.renderer,
        maxTextureSize: webgl.maxTextureSize,
        generatedAt: new Date().toISOString(),
        world: scan.world,
        formations: frames.map(frame => ({
            type: frame.type,
            ...scan.found[frame.type],
            frame: outputNames.formation,
        })),
        seasonalFocus: scan.found[seasonalTile.type],
        seasonalDays: seasonDays,
        seasonalFrames: seasonDays.map(day => ({ day })),
        artifactHashes: {
            formation: hashArtifact(formationSheet),
            seasonal: hashArtifact(seasonSheet),
            ...(speciesSheet ? { species: hashArtifact(speciesSheet) } : {}),
        },
        speciesPlate: speciesPlate ? {
            image: outputNames.species,
            day: 150,
            climate: "northern",
            scale: 3.4,
            canvas: { width: 220, height: 260 },
            species: speciesPlate.map(({ dataUrl, ...entry }) => entry),
            note: "Every conifer is drawn by the production drawConifer() path with the same seed, day, scale and climate. Distinct pixel hashes prove yew and dwarf pine carry their own rendered form and palette, not a relabelled spruce.",
        } : undefined,
        note: coniferMode
            ? "Northern realm, HUD, entities, fog and weather hidden; paused simulation; camera centred at the 0.95x rooftop level at midday, so morning mist does not obscure the canopy shade or the sight wall. All twelve conifer formations are real generated tiles, not hand-placed demo props. The seasonal strip follows a larch stand through needle-out, summer, golden autumn and bare winter. groundShade, visibility and sightRadius record the local canopy shade and stand-dependent sight profile; winterSnowDepthCm is the derived local snow depth on day 350. Not a GPU performance benchmark."
            : mixedMode
                ? "Temperate realm at 64% forest cover, HUD, entities, fog and weather hidden; paused simulation; camera centred at the 0.95x rooftop level at midday. All twelve mixed formations are real generated tiles, not hand-placed demo props. The seasonal strip follows one mixed stand through spring, high summer, autumn colour and winter. Each tile records the actual mixture ratio, distribution pattern, dominant species, canopy layers, understorey, silviculture and winter goods. Not a GPU performance benchmark."
                : "HUD, entities, fog and weather hidden; paused simulation; camera centred at the 0.95x rooftop level. Forest formations are real generated tiles, not hand-placed demo props. The cutover frame uses a wooded tile with stock set to zero. Not a GPU performance benchmark.",
    };
    await fs.writeFile(path.join(outputDir, outputNames.metadata), JSON.stringify(metadata, null, 2) + "\n");

    const fatal = diagnostics.filter(text => /Terrain WebGL|atlas upload|shader compilation|runtime paused|pageerror/i.test(text));
    console.log("Formation sheet: " + path.relative(gameRoot, formationPath));
    console.log("Seasonal forest: " + path.relative(gameRoot, seasonPath));
    if (speciesPath) console.log("Conifer species plate: " + path.relative(gameRoot, speciesPath));
    console.log("Forest metadata: " + path.relative(gameRoot, path.join(outputDir, outputNames.metadata)));
    console.log("Renderer: " + (webgl.renderer || "unknown") + " · canvas " + webgl.width + "×" + webgl.height);
    if (diagnostics.length) console.log("Diagnostics: " + JSON.stringify(diagnostics, null, 2));
    if (fatal.length) throw new Error("Forest rendering diagnostics were emitted:\n" + fatal.join("\n"));
} finally {
    await browser.close().catch(() => {});
    await new Promise(resolve => server.close(resolve));
}

async function captureConiferSpecies(page) {
    const entries = await page.evaluate(async () => {
        const { drawConifer } = await import("./js/presentation/rendering/terrain.js");
        const { FOREST_SPECIES } = await import("./js/world/forest-ecology.js");
        const width = 220, height = 260, scale = 3.4, baseline = height - 32;
        const ids = Object.keys(FOREST_SPECIES).filter(id => FOREST_SPECIES[id]?.conifer === true);
        const hashPixels = data => {
            let hash = 2166136261 >>> 0;
            for (let index = 0; index < data.length; index++) {
                hash ^= data[index];
                hash = Math.imul(hash, 16777619) >>> 0;
            }
            return hash.toString(16).padStart(8, "0");
        };
        return ids.map(id => {
            const definition = FOREST_SPECIES[id];
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext("2d", { willReadFrequently: true });
            drawConifer(context, width / 2, baseline, scale, 0, 0.5, 150, "northern", 1, id, null, null);
            const pixels = context.getImageData(0, 0, width, height).data;
            let ink = 0, minX = width, minY = height, maxX = -1, maxY = -1;
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    if (pixels[(y * width + x) * 4 + 3] <= 8) continue;
                    ink++;
                    minX = Math.min(minX, x);
                    minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x);
                    maxY = Math.max(maxY, y);
                }
            }
            if (ink === 0) throw new Error("Conifer species " + id + " rendered no visible pixels.");
            return {
                id,
                label: definition.label,
                crownShape: definition.crownShape,
                summer: definition.summer[0],
                autumn: definition.autumn[0],
                hash: hashPixels(pixels),
                ink,
                bbox: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
                dataUrl: canvas.toDataURL("image/png"),
            };
        });
    });
    const hashes = new Set(entries.map(entry => entry.hash));
    if (hashes.size !== entries.length) {
        throw new Error("The conifer species plate must render a distinct silhouette per species: "
            + JSON.stringify(entries.map(entry => [entry.id, entry.hash])));
    }
    for (const required of ["spruce", "fir", "pine", "larch", "juniper", "yew", "dwarf-pine"]) {
        if (!entries.some(entry => entry.id === required)) throw new Error("The conifer species plate is missing " + required + ".");
    }
    return entries;
}

async function renderFormationSheet(browserContext, frames, meta) {
    const sheet = await browserContext.newPage();
    await sheet.setViewportSize({ width: 1900, height: 1900 });
    const dataUrl = buffer => "data:image/png;base64," + buffer.toString("base64");
    const cells = frames.map(frame => `
        <figure>
            <img src="${dataUrl(frame.buffer)}" alt="${escapeHtml(frame.tile.label)} forest">
            <figcaption>
                <strong>${escapeHtml(frame.tile.label)}</strong>
                <small>${escapeHtml(frame.tile.age)} · ${escapeHtml(frame.tile.species.slice(0, 3).join(" · ") || "mixed")}</small>
                <em>${escapeHtml(frame.tile.goods.slice(0, 4).join(" · ") || "woodland produce")}</em>
                <span>TILE ${frame.tile.x}, ${frame.tile.y} · STOCK ${Math.round(frame.tile.stockRatio * 100)}% · SHADE ${Math.round((frame.tile.groundShade || 0) * 100)}% · SIGHT ${frame.tile.sightRadius}</span>
            </figcaption>
        </figure>`).join("");
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #080e10; color: #eadfc7; font-family: Georgia, "Times New Roman", serif; }
    .sheet { width: 1840px; padding: 34px 42px 30px; background: radial-gradient(circle at 50% 0%, rgba(170, 137, 79, .13), transparent 48%), linear-gradient(180deg, #0d1719, #081012); }
    .eyebrow { color: #b6935b; font: 700 11px/1.2 Arial, sans-serif; letter-spacing: .24em; }
    h1 { margin: 10px 0 8px; color: #f3e7ce; font-size: 34px; font-weight: 400; }
    .deck { margin: 0; color: #a8b4a8; font: 14px/1.5 Arial, sans-serif; max-width: 1480px; }
    .grid { display: grid; grid-template-columns: repeat(${meta.columns || 5}, 1fr); gap: 14px; margin-top: 24px; }
    figure { margin: 0; padding: 6px; border: 1px solid #4d3e29; border-radius: 4px; background: #101b1d; box-shadow: 0 8px 20px rgba(0, 0, 0, .28); }
    figure img { display: block; width: 100%; aspect-ratio: 1; object-fit: cover; border: 1px solid #263330; }
    figcaption { display: flex; flex-direction: column; gap: 4px; padding: 8px 3px 2px; min-height: 76px; }
    figcaption strong { color: #e3c88f; font: 800 11px/1.2 Arial, sans-serif; letter-spacing: .12em; text-transform: uppercase; }
    figcaption small { color: #b9c5b3; font: 10px/1.25 Arial, sans-serif; }
    figcaption em { color: #8eaa7a; font: italic 10px/1.25 Georgia, serif; }
    figcaption span { color: #7f8d83; font: 9px/1.2 Arial, sans-serif; letter-spacing: .08em; margin-top: auto; }
    footer { display: flex; justify-content: space-between; gap: 24px; margin-top: 22px; padding-top: 14px; border-top: 1px solid #4d3e29; color: #87958b; font: 11px/1.5 Arial, sans-serif; letter-spacing: .04em; }
    footer strong { color: #c9ab73; }
</style></head><body>
<div class="sheet">
    <div class="eyebrow">KINGS &amp; CARDS · ${meta.conifer ? "CONIFER" : meta.mixed ? "MISCHWALD" : "LAUBWALD"} ECOLOGY</div>
    <h1>${meta.conifer ? "Twelve conifer formations, one deterministic model" : meta.mixed ? "Twelve mixed formations, one deterministic model" : "Fifteen woodland formations, one deterministic model"}</h1>
    <p class="deck">Seed ${seed} · ${meta.world.width} × ${meta.world.height} world · ${escapeHtml(meta.world.climate)} climate · ${meta.world.forests}% forest slider · 0.95× rooftop view · midday · HUD, entities, fog and weather hidden · simulation paused</p>
    <div class="grid">${cells}</div>
    <footer>
        <span><strong>Generated</strong> ${meta.generatedAt} · <strong>Renderer</strong> ${escapeHtml(meta.renderer || "unknown")}</span>
        <span>${meta.conifer ? "Twelve conifer formations; winter local snow depth is recorded per tile." : meta.mixed ? "Twelve mixed formations; each tile records its real mixture, canopy layers, understorey and silviculture." : "Human-review reference, not a pixel-diff test. Real generated tiles, not hand-placed demo props."}</span>
    </footer>
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
    await sheet.setViewportSize({ width: 1900, height: 760 });
    const dataUrl = buffer => "data:image/png;base64," + buffer.toString("base64");
    const labels = ["SPRING", "SUMMER", "AUTUMN", "WINTER"];
    const cells = frames.map((frame, index) => `
        <figure>
            <img src="${dataUrl(frame.buffer)}" alt="Forest on day ${frame.day}">
            <figcaption><strong>DAY ${frame.day}</strong><small>${labels[index]}</small></figcaption>
        </figure>`).join("");
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #080e10; color: #eadfc7; font-family: Georgia, "Times New Roman", serif; }
    .sheet { width: 1840px; padding: 34px 42px 30px; background: radial-gradient(circle at 50% 0%, rgba(170, 137, 79, .13), transparent 48%), linear-gradient(180deg, #0d1719, #081012); }
    .eyebrow { color: #b6935b; font: 700 11px/1.2 Arial, sans-serif; letter-spacing: .24em; }
    h1 { margin: 10px 0 8px; color: #f3e7ce; font-size: 34px; font-weight: 400; }
    .deck { margin: 0; color: #a8b4a8; font: 14px/1.5 Arial, sans-serif; }
    .strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-top: 24px; }
    figure { margin: 0; padding: 6px; border: 1px solid #4d3e29; border-radius: 4px; background: #101b1d; box-shadow: 0 8px 20px rgba(0, 0, 0, .28); }
    figure img { display: block; width: 100%; aspect-ratio: 1; object-fit: cover; border: 1px solid #263330; }
    figcaption { display: flex; flex-direction: column; gap: 3px; padding: 8px 3px 2px; }
    figcaption strong { color: #e3c88f; font: 800 11px/1.2 Arial, sans-serif; letter-spacing: .14em; }
    figcaption small { color: #8d9b90; font: 10px/1.2 Arial, sans-serif; letter-spacing: .12em; }
    footer { display: flex; justify-content: space-between; gap: 24px; margin-top: 22px; padding-top: 14px; border-top: 1px solid #4d3e29; color: #87958b; font: 11px/1.5 Arial, sans-serif; letter-spacing: .04em; }
    footer strong { color: #c9ab73; }
</style></head><body>
<div class="sheet">
    <div class="eyebrow">KINGS &amp; CARDS · ${meta.conifer ? "LARCH SEASONS" : meta.mixed ? "MIXED FOREST SEASONS" : "FOREST SEASONS"}</div>
    <h1>${meta.conifer ? "One larch stand through the year" : meta.mixed ? "One mixed wood through the year" : "One ancient wood through the year"}</h1>
    <p class="deck">Seed ${seed} · tile ${meta.tile.x}, ${meta.tile.y} · ${escapeHtml(meta.tile.label)} · ${escapeHtml(meta.tile.species.slice(0, 4).join(" · "))} · 0.95× rooftop view · weather and entities hidden</p>
    <div class="strip">${cells}</div>
    <footer>
        <span><strong>Generated</strong> ${meta.generatedAt} · <strong>Renderer</strong> ${escapeHtml(meta.renderer || "unknown")}</span>
        <span>${meta.conifer ? "Fresh needles, closed summer tiers, golden autumn and the bare larch winter skeleton." : meta.mixed ? "Spring leaf-out, a layered summer canopy, the mixed autumn palette and the winter crown structure." : "Fresh leaf-out, closed summer canopy, autumn turn, bare winter crowns and leaf carpet."}</span>
    </footer>
</div>
</body></html>`;
    await sheet.setContent(html, { waitUntil: "load" });
    await waitForImages(sheet);
    const png = await sheet.locator(".sheet").screenshot({ animations: "disabled" });
    await sheet.close();
    return png;
}

async function renderSpeciesSheet(browserContext, entries, meta) {
    const sheet = await browserContext.newPage();
    await sheet.setViewportSize({ width: 1500, height: 900 });
    const cells = entries.map(entry => `
        <figure>
            <img src="${entry.dataUrl}" alt="${escapeHtml(entry.label)} silhouette">
            <figcaption>
                <strong>${escapeHtml(entry.label)}</strong>
                <small>${escapeHtml(entry.id)} · ${escapeHtml(entry.crownShape)} · hash ${entry.hash}</small>
                <span>INK ${entry.ink} PX · BBOX ${entry.bbox.width}×${entry.bbox.height}</span>
            </figcaption>
        </figure>`).join("");
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #080e10; color: #eadfc7; font-family: Georgia, "Times New Roman", serif; }
    .sheet { width: 1440px; padding: 34px 42px 30px; background: radial-gradient(circle at 50% 0%, rgba(170, 137, 79, .13), transparent 48%), linear-gradient(180deg, #0d1719, #081012); }
    .eyebrow { color: #b6935b; font: 700 11px/1.2 Arial, sans-serif; letter-spacing: .24em; }
    h1 { margin: 10px 0 8px; color: #f3e7ce; font-size: 34px; font-weight: 400; }
    .deck { margin: 0; color: #a8b4a8; font: 14px/1.5 Arial, sans-serif; max-width: 1320px; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-top: 24px; }
    figure { margin: 0; padding: 6px; border: 1px solid #4d3e29; border-radius: 4px; background: #101b1d; box-shadow: 0 8px 20px rgba(0, 0, 0, .28); }
    figure img { display: block; width: 100%; aspect-ratio: 220 / 260; object-fit: contain; background: #d9dfcc; border: 1px solid #263330; }
    figcaption { display: flex; flex-direction: column; gap: 4px; padding: 8px 3px 2px; min-height: 58px; }
    figcaption strong { color: #e3c88f; font: 800 11px/1.2 Arial, sans-serif; letter-spacing: .12em; text-transform: uppercase; }
    figcaption small { color: #b9c5b3; font: 10px/1.25 Arial, sans-serif; }
    figcaption span { color: #7f8d83; font: 9px/1.2 Arial, sans-serif; letter-spacing: .08em; margin-top: auto; }
    footer { display: flex; justify-content: space-between; gap: 24px; margin-top: 22px; padding-top: 14px; border-top: 1px solid #4d3e29; color: #87958b; font: 11px/1.5 Arial, sans-serif; letter-spacing: .04em; }
    footer strong { color: #c9ab73; }
</style></head><body>
<div class="sheet">
    <div class="eyebrow">KINGS &amp; CARDS · CONIFER SPECIES RENDER</div>
    <h1>Seven conifers, seven production silhouettes</h1>
    <p class="deck">Seed ${seed} · production drawConifer() path · day 150 · northern climate · scale 3.4 · identical seed and origin · transparent plate shown on a light ground so the crown is readable</p>
    <div class="grid">${cells}</div>
    <footer>
        <span><strong>Generated</strong> ${meta.generatedAt} · <strong>Renderer</strong> ${escapeHtml(meta.renderer || "unknown")}</span>
        <span>Distinct FNV pixel hashes prove a distinct rendered form and palette. Yew and dwarf pine are not relabelled spruce.</span>
    </footer>
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
