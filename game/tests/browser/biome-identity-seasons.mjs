// Cross-biome, cross-season player reference for 1.2.22.
//
// The regular seasonal audit follows one varied realm at district zoom. This
// reference covers the whole identity matrix: all twelve biomes, each captured
// at rooftop zoom in autumn and winter from real generated realms. It proves
// that the season reaches the ground under the camera, not only the panel, and
// leaves two contact sheets plus a JSON manifest in artifacts/biome-seasons/.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const outDir = resolve(root, "artifacts", "biome-seasons");
await mkdir(outDir, { recursive: true });
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml" };
const server = createServer(async (req, res) => {
    try {
        const pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
        const file = resolve(root, pathname === "/" ? "index.html" : pathname.slice(1));
        if (file !== root && !file.startsWith(root + sep)) return res.writeHead(403).end();
        const data = await readFile(file);
        res.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream", "cache-control": "no-store" }).end(data);
    } catch {
        res.writeHead(404, { "content-type": "text/plain" }).end("not found");
    }
});
await new Promise(done => server.listen(Number(process.env.E2E_PORT) || 4189, "127.0.0.1", done));
const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.E2E_CHROMIUM_EXECUTABLE,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));
page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });

const worlds = [
    { climate: "swamp", seed: "467514", label: "Wetland realm", targets: ["water", "beach", "forest", "meadow", "swamp", "dense-forest", "steppe", "rock", "taiga"] },
    { climate: "northern", seed: "427919", label: "Northern realm", targets: ["snow", "tundra"] },
    { climate: "savanna", seed: "467514", label: "Savanna realm", targets: ["desert"] }
];
const seasons = [
    { index: 2, day: 250, label: "autumn" },
    { index: 3, day: 330, label: "winter" }
];

async function dismissOverlays() {
    await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        if (state.activeEvent) state.activeEvent.dismissed = true;
        for (const id of ["realm-event-modal", "event-notification", "big-message", "action-toast", "placement-status"]) {
            document.getElementById(id)?.classList.add("hidden");
        }
    });
}

async function cacheMisses() {
    return page.evaluate(async () => Number((await import("./js/core/state.js")).state.terrainCacheMisses) || 0);
}

async function waitForRebuild(baseline) {
    try {
        await page.evaluate(async baseline => {
            const { state } = await import("./js/core/state.js");
            const deadline = performance.now() + 12000;
            while ((Number(state.terrainCacheMisses) || 0) <= baseline) {
                if (performance.now() > deadline) throw new Error("cache rebuild timeout");
                await new Promise(resolve => requestAnimationFrame(resolve));
            }
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        }, baseline);
    } catch {
        await page.waitForTimeout(1200);
    }
}

const captured = new Map();
const captures = [];
for (const world of worlds) {
    await page.goto("http://127.0.0.1:" + (Number(process.env.E2E_PORT) || 4189) + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.selectOption("#world-size", "standard");
    await page.selectOption("#world-climate", world.climate);
    await page.locator("#world-seed-input").fill(world.seed);
    await page.locator("#player-name-input").fill("Season Audit " + world.climate);
    await page.locator("#start-new-game-btn").click();
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.hasStarted, null, { timeout: 60000 });
    await page.locator("#pause-btn").click();
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.isPaused, null, { timeout: 5000 });
    const targets = await page.evaluate(async world => {
        const { state } = await import("./js/core/state.js");
        const { biomeLandmarkAnchors } = await import("./js/presentation/rendering/biome-identity-render.js");
        const { BIOME_MAP_ORDER } = await import("./js/world/biome-generation.js");
        state.isPaused = true;
        state.timeOfDay = 12;
        state.weather = "clear";
        state.biomeAtlas.regions.forEach(region => { region.discovered = true; });
        state.exploredRevision = (state.exploredRevision || 0) + 1;
        for (let x = 0; x < state.worldW; x++) {
            if (!state.explored[x]) state.explored[x] = [];
            for (let y = 0; y < state.worldH; y++) state.explored[x][y] = true;
        }
        const anchors = biomeLandmarkAnchors({ regions: state.biomeAtlas.regions, map: state.biomeIndexMap, explored: state.explored, limit: 36 });
        const anchorByBiome = new Map();
        for (const anchor of anchors) if (!anchorByBiome.has(anchor.biome)) anchorByBiome.set(anchor.biome, { ...anchor, source: "landmark" });
        const tiles = new Map();
        const map = state.biomeIndexMap;
        const stride = Math.max(1, Number(map.stride) || 4);
        for (let row = 0; row < map.height && tiles.size < 12; row++) {
            for (let column = 0; column < map.width; column++) {
                const biome = BIOME_MAP_ORDER[map.ids[row * map.width + column]];
                if (!biome || tiles.has(biome)) continue;
                tiles.set(biome, { x: (column + 0.5) * stride, y: (row + 0.5) * stride, biome, source: "tile", identity: null, seed: 1 });
            }
        }
        const wanted = world.targets.map(biome => anchorByBiome.get(biome) || tiles.get(biome)).filter(Boolean);
        return { wanted, allAnchors: anchors.length, available: anchors.map(anchor => anchor.biome) };
    }, world);
    console.log("WORLD", world.climate, world.seed, "anchors", targets.allAnchors, "biomes", [...new Set(targets.available)].join(","));
    for (const target of targets.wanted) {
        if (captured.has(target.biome)) continue;
        for (const season of seasons) {
            const baseline = await cacheMisses();
            await page.evaluate(async ({ target, season }) => {
                const { state } = await import("./js/core/state.js");
                const { setZoomLevel, clampCamera } = await import("./js/presentation/camera.js");
                const { CELL } = await import("./js/core/config.js");
                state.isPaused = true;
                state.weather = "clear";
                state.timeOfDay = 12;
                state.dayOfYear = season.day;
                state.seasonIndex = season.index;
                setZoomLevel(3);
                state.zoom = state.zoomTarget;
                state.zoomLevel = 3;
                state.zoomAnchor = null;
                state.camera.x = target.x * CELL * state.zoom - state.canvas.width / 2;
                state.camera.y = target.y * CELL * state.zoom - state.canvas.height / 2;
                clampCamera();
            }, { target, season });
            await waitForRebuild(baseline);
            await page.waitForTimeout(500);
            await dismissOverlays();
            const buffer = await page.locator("#canvas-wrapper").screenshot({ type: "png", animations: "disabled" });
            const file = resolve(outDir, target.biome + "-" + season.label + ".png");
            await writeFile(file, buffer);
            captures.push({
                biome: target.biome, season: season.label, day: season.day, world: world.climate,
                seed: world.seed, x: +target.x.toFixed(2), y: +target.y.toFixed(2), source: target.source,
                landmark: target.identity?.landmark?.id || null, file: "artifacts/biome-seasons/" + target.biome + "-" + season.label + ".png", buffer
            });
            console.log("SHOT", target.biome, season.label, target.source, Math.round(target.x) + "," + Math.round(target.y));
        }
        if (!captured.has(target.biome)) captured.set(target.biome, true);
    }
}

const allBiomes = ["water", "beach", "snow", "rock", "tundra", "taiga", "swamp", "desert", "steppe", "meadow", "forest", "dense-forest"];
const missing = allBiomes.filter(biome => !captures.some(row => row.biome === biome));
console.log("MISSING", missing.join(",") || "none");
if (missing.length) throw new Error("Missing biome captures: " + missing.join(", "));

async function sheet(season) {
    const rows = captures.filter(row => row.season === season);
    const sheetPage = await browser.newPage({ viewport: { width: 1840, height: 1200 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
    const dataUrl = buffer => "data:image/png;base64," + buffer.toString("base64");
    const cards = rows.map(row => `
        <figure>
            <img src="${dataUrl(row.buffer)}" alt="${row.biome}">
            <figcaption>
                <strong>${row.biome}</strong>
                <small>${row.landmark || "biome tile"} · ${row.world} · seed ${row.seed}</small>
                <span>${row.season.toUpperCase()} · DAY ${row.day} · ${row.source}</span>
            </figcaption>
        </figure>`).join("");
    await sheetPage.setContent(`<!doctype html><html lang="de"><head><meta charset="utf-8"><style>
        *{box-sizing:border-box}body{margin:0;background:#17130e;color:#ead7ae;font:14px/1.35 Georgia,serif}
        header{padding:22px 26px 10px;border-bottom:1px solid #5b4a33}
        h1{margin:0;font:700 24px/1.1 Georgia,serif;letter-spacing:.08em;color:#f2dfb7}
        p{margin:6px 0 0;color:#a99572;font:12px/1.5 ui-monospace,monospace}
        main{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:18px}
        figure{margin:0;border:1px solid #5b4a33;background:#211b14;padding:7px}
        img{display:block;width:100%;height:auto;border:1px solid #3d3125}
        figcaption{display:grid;gap:2px;padding:6px 2px 2px}
        strong{font:700 14px Georgia,serif;color:#f0dcb0;text-transform:capitalize}
        small{font:11px ui-monospace,monospace;color:#b9a37a}
        span{font:10px ui-monospace,monospace;color:#8c795b;letter-spacing:.05em}
    </style></head><body>
        <header><h1>KINGS &amp; CARDS · ${season.toUpperCase()} BIOME IDENTITY</h1>
        <p>Real game canvas · 12 generated biomes · 3 realms · noon, clear weather · ${rows.length} captures</p></header>
        <main>${cards}</main></body></html>`);
    await sheetPage.waitForTimeout(300);
    const file = resolve(outDir, season + "-sheet.png");
    await sheetPage.screenshot({ path: file, fullPage: true, animations: "disabled" });
    await sheetPage.close();
    return file;
}
const autumnSheet = await sheet("autumn");
const winterSheet = await sheet("winter");
await writeFile(resolve(outDir, "manifest.json"), JSON.stringify({
    generatedAt: new Date().toISOString(),
    seasons: seasons.map(season => season.label),
    worlds,
    pageErrors: [...new Set(pageErrors)],
    consoleErrors: [...new Set(consoleErrors)],
    captures: captures.map(({ buffer, ...row }) => row),
    sheets: { autumn: "artifacts/biome-seasons/autumn-sheet.png", winter: "artifacts/biome-seasons/winter-sheet.png" }
}, null, 2));
console.log("SHEETS", autumnSheet, winterSheet);
assert.equal(captures.length, 24, "every biome must be captured in autumn and winter");
assert.equal(new Set(captures.map(row => row.biome + ":" + row.season)).size, 24,
    "the capture matrix must not contain duplicate biome/season cells");
assert.equal(pageErrors.length, 0, "the real-game season pass must not throw");
assert.equal(consoleErrors.length, 0, "the real-game season pass must not log console errors");
console.log("OK 24 captures / 12 biomes / 2 seasons");
await browser.close();
server.close();
