// Visual proof for 1.2.19. This script renders real pixels from the actual
// static game, not DOM assertions. It captures the biome atlas at zoom levels
// 1-3, the panel before/after a rare-site survey, and the resource/wildlife/
// trade sections. Images land in game/artifacts/biome-atlas-visual/.
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const outDir = resolve(root, "artifacts", "biome-atlas-visual");
await mkdir(outDir, { recursive: true });
const port = Number(process.env.E2E_PORT) || 4183;
const mime = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json",
    ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp"
};
const server = createServer(async (req, res) => {
    try {
        const pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
        const relative = pathname === "/" ? "index.html" : pathname.slice(1);
        const file = resolve(root, relative);
        if (file !== root && !file.startsWith(root + sep)) {
            res.writeHead(403).end("Forbidden");
            return;
        }
        const data = await readFile(file);
        res.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
        res.end(data);
    } catch {
        res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
    }
});
await new Promise(resolveListen => server.listen(port, "127.0.0.1", resolveListen));
const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.E2E_CHROMIUM_EXECUTABLE || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
const cdp = await page.context().newCDPSession(page);
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));
page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
});

async function dismissOverlays() {
    await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        if (state.activeEvent) state.activeEvent.dismissed = true;
        document.getElementById("realm-event-modal")?.classList.add("hidden");
        document.getElementById("event-notification")?.classList.add("hidden");
        document.getElementById("big-message")?.classList.add("hidden");
        const placement = document.getElementById("placement-status");
        if (placement && !state.currentCard && !state.directBuildType) placement.classList.add("hidden");
    });
    await page.waitForTimeout(60);
}
async function shot(name) {
    await dismissOverlays();
    const path = resolve(outDir, name + ".png");
    await page.screenshot({ path, animations: "disabled" });
    return path;
}
async function scrollPanelTo(text) {
    await page.locator("#command-panel-content").evaluate((element, needle) => {
        const heading = [...element.querySelectorAll(".command-section-title")]
            .find(node => (node.textContent || "").toUpperCase().includes(needle));
        if (heading) heading.scrollIntoView({ block: "start" });
    }, text);
    await page.waitForTimeout(180);
}
async function scrollRegionToSection(regionId, text) {
    await page.locator("#command-panel-content").evaluate((element, { regionId, needle }) => {
        const region = element.querySelector('[data-biome-region="' + regionId + '"]');
        const heading = region && [...region.querySelectorAll(".command-section-title")]
            .find(node => (node.textContent || "").toUpperCase().includes(needle));
        if (heading) heading.scrollIntoView({ block: "start" });
    }, { regionId, needle: text });
    await page.waitForTimeout(180);
}
async function scrollRegionToTop(regionId) {
    const region = page.locator('[data-biome-region="' + regionId + '"]');
    await region.locator("summary").evaluate(element => element.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(180);
}
async function ensureRegionOpen(regionId) {
    const region = page.locator('[data-biome-region="' + regionId + '"]');
    if (!(await region.evaluate(element => element.open))) await region.locator("summary").click();
    await page.waitForTimeout(150);
}
async function setZoom(level, worldX, worldY) {
    await page.evaluate(async ({ level, worldX, worldY }) => {
        const { state } = await import("./js/core/state.js");
        const { ZOOM_PRESETS } = await import("./js/core/zoom-model.js");
        const { clampCamera } = await import("./js/presentation/camera.js");
        const { CELL } = await import("./js/core/config.js");
        const zoom = ZOOM_PRESETS[level - 1];
        state.zoom = zoom;
        state.zoomTarget = zoom;
        state.zoomLevel = level;
        state.zoomAnchor = null;
        state.camera.x = worldX * CELL * zoom - state.canvas.width / 2;
        state.camera.y = worldY * CELL * zoom - state.canvas.height / 2;
        clampCamera();
        const { renderUI } = await import("./js/presentation/rendering/ui.js");
        renderUI();
    }, { level, worldX, worldY });
    const labels = ["", "LANDSCAPE", "DISTRICTS", "ROOFTOPS", "INTERIORS"];
    await page.waitForFunction(async ({ level, label }) => {
        const { state } = await import("./js/core/state.js");
        return state.zoomLevel === level && (document.querySelector("#zoom-level-name")?.textContent || "") === label;
    }, { level, label: labels[level] }, { timeout: 5000 });
    await page.waitForTimeout(500);
}

try {
    await page.goto("http://127.0.0.1:" + port + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator("#world-seed-input").fill("20261119");
    await page.locator("#player-name-input").fill("Biome Visual Proof");
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 30000 });
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.hasStarted, null, { timeout: 15000 });
    await page.locator("#pause-btn").click();
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.isPaused, null, { timeout: 5000 });
    for (const selector of ["#realm-event-dismiss", "#big-message-close"]) {
        const button = page.locator(selector);
        if (await button.isVisible().catch(() => false)) await button.click();
    }
    await page.waitForTimeout(180);
    const skip = page.locator("#skip-card-btn");
    if (await skip.isVisible().catch(() => false)) await skip.click();
    await page.waitForTimeout(180);

    // A fully explored atlas makes the comparison legible: level 1/2 can show
    // the whole realm and level 3 can sit on a forest/meadow boundary. Rare
    // deposits remain hidden until their dedicated survey regardless.
    await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        for (let x = 0; x < state.worldW; x++) {
            for (let y = 0; y < state.worldH; y++) state.explored[x][y] = true;
        }
        const { syncBiomeDiscovery } = await import("./js/systems/biome-resource-state.js");
        syncBiomeDiscovery({ silent: true });
    });
    await page.waitForTimeout(250);

    const atlas = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        const { BIOME_RESOURCE_BY_ID } = await import("./js/world/biome-resource-data.js");
        state.resources.gold = 1200;
        state.resources.wood = 300;
        const discovered = state.biomeAtlas.regions.filter(region => region.discovered);
        const geo = state.resourceGeography;
        const W = Number(state.worldW) || 160;
        const H = Number(state.worldH) || 160;
        let best = { score: -1, x: W / 2, y: H / 2 };
        for (let y = 10; y < H - 10; y += 4) {
            for (let x = 10; x < W - 10; x += 4) {
                if (!state.explored?.[x]?.[y]) continue;
                let count = 0;
                let share = 0;
                for (let dy = -8; dy <= 8; dy += 2) {
                    for (let dx = -8; dx <= 8; dx += 2) {
                        const tx = x + dx, ty = y + dy;
                        if (!state.explored?.[tx]?.[ty]) continue;
                        const index = ty * W + tx;
                        const capacity = geo?.forestCapacity?.[index] || 0;
                        if (!capacity) continue;
                        count++;
                        share += (geo.forestStock[index] || 0) / capacity;
                    }
                }
                const score = count * 10 + share;
                if (score > best.score) best = { score, x, y };
            }
        }
        const rareIdsFor = region => {
            const resourceIds = new Set(region.resources.map(row => row.id));
            return [...resourceIds].filter(id => {
                const resource = BIOME_RESOURCE_BY_ID[id];
                return Boolean(resource?.rare);
            });
        };
        const rareRegions = discovered.filter(region => rareIdsFor(region).length > 0);
        const forestRegion = rareRegions[0] || discovered.find(region => ["forest", "taiga", "rainforest", "woodland"].includes(region.rawBiome)) || discovered[0];
        // Put the third-tier camera on the densest forest patch, then shift it
        // toward the neighbouring water so the frame proves both the dense
        // stipple and its contrast with non-forest terrain. The first rare
        // region is still the panel target; it can be a sparse forest edge.
        const mapTarget = {
            x: Math.min(W - 4, best.x + 12),
            y: best.y
        };
        return {
            regionCount: state.biomeAtlas.regions.length,
            discovered: discovered.map(region => ({
                id: region.id, name: region.name, biome: region.rawBiome,
                x: region.x, y: region.y, width: region.width, height: region.height,
                vegetation: region.vegetation,
                rare: rareIdsFor(region)
            })),
            rareRegionId: rareRegions[0]?.id || null,
            allRegions: state.biomeAtlas.regions.map(region => [region.id, region.rawBiome, region.discovered]),
            potentialYield: state.biomeAtlas.stats.potentialYield,
            target: { x: mapTarget.x, y: mapTarget.y, score: best.score }
        };
    });
    console.log("ATLAS " + JSON.stringify(atlas));

    await page.locator("#map-layer-select").selectOption("biomes");
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.mapLayer === "biomes", null, { timeout: 5000 });
    for (const level of [1, 2, 3]) {
        await setZoom(level, atlas.target.x, atlas.target.y);
        await shot("atlas-level-" + level);
        const meta = await page.evaluate(async () => {
            const { state } = await import("./js/core/state.js");
            return {
                zoomLevel: state.zoomLevel, zoom: state.zoom,
                camera: { x: state.camera.x, y: state.camera.y },
                canvas: { width: state.canvas.width, height: state.canvas.height },
                label: document.querySelector("#zoom-level-name")?.textContent,
                layer: state.mapLayer
            };
        });
        console.log("LEVEL " + level + " " + JSON.stringify(meta));
    }

    // Compare the added forest stipple against the ordinary terrain layer on
    // the same CPU-throttled level-3 camera. This is a measurement, not a hard
    // CI gate: the visual harness is a manual proof, while the game's low-end
    // audit owns the budget.
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const frameSample = layer => page.evaluate(async layerName => {
        const { state } = await import("./js/core/state.js");
        state.mapLayer = layerName;
        const select = document.getElementById("map-layer-select");
        if (select) select.value = layerName;
        await new Promise(resolveReady => requestAnimationFrame(() => requestAnimationFrame(resolveReady)));
        return new Promise(resolveSample => {
            const times = [];
            let previous = 0;
            const frame = now => {
                if (previous) times.push(now - previous);
                previous = now;
                if (times.length < 120) requestAnimationFrame(frame);
                else {
                    times.sort((a, b) => a - b);
                    const p95 = times[Math.min(times.length - 1, Math.floor(times.length * 0.95))];
                    resolveSample({ layer: layerName, frames: times.length, p95, average: times.reduce((a, b) => a + b, 0) / times.length });
                }
            };
            requestAnimationFrame(frame);
        });
    }, layer);
    const biomeFrames = await frameSample("biomes");
    const terrainFrames = await frameSample("terrain");
    console.log("FRAME_PERF " + JSON.stringify({ biomeFrames, terrainFrames }));
    await page.locator("#map-layer-select").selectOption("biomes");
    await page.waitForTimeout(250);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });

    // Tall viewport so the whole region card, its survey controls and the
    // resource table fit in one readable capture.
    await page.setViewportSize({ width: 1600, height: 1600 });
    await page.locator("#command-open-btn").click();
    await page.locator('[data-command-tab="biome"]').click();
    await page.waitForFunction(() => (document.querySelector("#command-panel-content")?.textContent || "").toLowerCase().includes("biome resources & wildlife"), null, { timeout: 15000 });
    await page.waitForTimeout(300);
    await shot("biomes-panel-overview-before-survey");

    const firstRegionId = atlas.rareRegionId || await page.locator("[data-biome-region]").first().getAttribute("data-biome-region");
    await ensureRegionOpen(firstRegionId);
    const firstRegion = page.locator('[data-biome-region="' + firstRegionId + '"]');
    const before = await page.evaluate(async regionId => {
        const { state } = await import("./js/core/state.js");
        const { BIOME_RESOURCE_BY_ID } = await import("./js/world/biome-resource-data.js");
        const { getBiomeAtlasSnapshot } = await import("./js/systems/biome-resource-state.js");
        const region = state.biomeAtlas.regions.find(entry => entry.id === regionId);
        return {
            surveyLevel: region.surveyLevel,
            rareKnown: getBiomeAtlasSnapshot().rareKnown,
            rareRows: region.resources.filter(row => BIOME_RESOURCE_BY_ID[row.id]?.rare)
                .map(row => ({ id: row.id, discovered: row.discovered })),
            visibleRows: region.resources.filter(row => row.discovered).length
        };
    }, firstRegionId);
    console.log("BEFORE " + JSON.stringify({ regionId: firstRegionId, ...before }));

    await scrollRegionToTop(firstRegionId);
    await shot("biomes-region-actions-before-survey");
    await scrollRegionToSection(firstRegionId, "KNOWN RESOURCES");
    await firstRegion.locator(".biome-resource-row").last().scrollIntoViewIfNeeded();
    await page.waitForTimeout(120);
    await shot("biomes-resources-before-survey");

    // First survey reveals the ordinary economy. The dedicated rare survey is
    // deliberately a second action so rare deposits stay hidden beforehand.
    await firstRegion.locator('[data-command="biome-survey"]').click();
    await page.waitForFunction(async regionId => {
        const { state } = await import("./js/core/state.js");
        return state.biomeAtlas.regions.find(entry => entry.id === regionId)?.surveyLevel >= 1;
    }, firstRegionId, { timeout: 15000 });
    await page.waitForTimeout(250);
    await ensureRegionOpen(firstRegionId);
    await page.locator('[data-biome-region="' + firstRegionId + '"]').locator('[data-command="biome-survey"]').click();
    await page.waitForFunction(async regionId => {
        const { state } = await import("./js/core/state.js");
        return state.biomeAtlas.regions.find(entry => entry.id === regionId)?.surveyLevel >= 2;
    }, firstRegionId, { timeout: 15000 });
    await page.waitForTimeout(300);
    await ensureRegionOpen(firstRegionId);
    const after = await page.evaluate(async regionId => {
        const { state } = await import("./js/core/state.js");
        const { BIOME_RESOURCE_BY_ID } = await import("./js/world/biome-resource-data.js");
        const { getBiomeAtlasSnapshot } = await import("./js/systems/biome-resource-state.js");
        const region = state.biomeAtlas.regions.find(entry => entry.id === regionId);
        return {
            surveyLevel: region.surveyLevel,
            rareKnown: getBiomeAtlasSnapshot().rareKnown,
            rareRows: region.resources.filter(row => BIOME_RESOURCE_BY_ID[row.id]?.rare)
                .map(row => ({ id: row.id, discovered: row.discovered })),
            visibleRows: region.resources.filter(row => row.discovered).length
        };
    }, firstRegionId);
    console.log("AFTER " + JSON.stringify({ regionId: firstRegionId, ...after }));

    await scrollRegionToTop(firstRegionId);
    await shot("biomes-region-actions-after-survey");
    await scrollRegionToSection(firstRegionId, "KNOWN RESOURCES");
    const rareRow = firstRegion.locator('.biome-resource-row').filter({ has: page.locator(".biome-badge.is-rare") }).last();
    if (await rareRow.count()) await rareRow.scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    await shot("biomes-resources-after-survey");

    await page.locator("#command-panel-content").evaluate(element => { element.scrollTop = 0; });
    await page.waitForTimeout(180);
    await shot("biomes-panel-summary-after-survey");
    await scrollPanelTo("REGIONAL ECONOMY");
    await shot("biomes-panel-overview-after-survey");

    // Harvest two non-ledger goods so a row actually stores a good. Only a
    // stored good exposes the real Sell control and populates trade revenue.
    const tradeTargets = await page.evaluate(async regionId => {
        const { state } = await import("./js/core/state.js");
        const { BIOME_RESOURCE_BY_ID } = await import("./js/world/biome-resource-data.js");
        const region = state.biomeAtlas.regions.find(entry => entry.id === regionId);
        return region.resources
            .filter(row => {
                const resource = BIOME_RESOURCE_BY_ID[row.id];
                return row.discovered && row.stock > 3 && resource
                    && !resource.yieldResource
                    && resource.seasons.includes(Number(state.seasonIndex) || 0);
            })
            .slice(0, 2)
            .map(row => row.id);
    }, firstRegionId);
    console.log("TRADE TARGETS " + JSON.stringify(tradeTargets));
    for (const resourceId of tradeTargets) {
        await ensureRegionOpen(firstRegionId);
        const button = page.locator('#command-panel-content [data-command="biome-harvest"][data-value="' + firstRegionId + '"][data-biome-resource="' + resourceId + '"]');
        if (await button.count()) {
            await button.click();
            await page.waitForTimeout(300);
        }
    }
    await ensureRegionOpen(firstRegionId);
    await scrollRegionToSection(firstRegionId, "KNOWN RESOURCES");
    const sell = page.locator('#command-panel-content [data-command="biome-sell"]').first();
    if (await sell.count()) await sell.scrollIntoViewIfNeeded();
    await page.waitForTimeout(180);
    await shot("biomes-harvest-trade");

    if (await sell.count()) {
        await sell.click();
        await page.waitForTimeout(300);
        await page.locator("#command-panel-content").evaluate(element => { element.scrollTop = 0; });
        await page.waitForTimeout(180);
        await shot("biomes-trade-sale");
    }

    await ensureRegionOpen(firstRegionId);
    await scrollRegionToSection(firstRegionId, "WILDLIFE");
    await page.waitForTimeout(120);
    await shot("biomes-wildlife-hunt");

    await scrollPanelTo("REGIONAL ECONOMY");
    await shot("biomes-regional-economy");

    console.log(JSON.stringify({
        ok: true,
        outDir,
        region: firstRegionId,
        potentialYield: atlas.potentialYield,
        beforeSurveyLevel: before.surveyLevel,
        afterSurveyLevel: after.surveyLevel,
        beforeVisibleRows: before.visibleRows,
        afterVisibleRows: after.visibleRows,
        beforeRareKnown: before.rareKnown,
        afterRareKnown: after.rareKnown,
        rareRows: after.rareRows,
        pageErrors,
        consoleErrors
    }));
} finally {
    await browser.close();
    await new Promise(resolveClose => server.close(resolveClose));
}
