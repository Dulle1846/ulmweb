// Real browser proof for 1.2.19: open the atlas, survey, harvest, hunt, change
// policy, switch to the biome map layer and survive a save/reload with no
// page or console errors.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const port = Number(process.env.E2E_PORT) || 4181;
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
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, reducedMotion: "reduce" });
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));
page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
});

try {
    await page.goto("http://127.0.0.1:" + port + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator("#world-seed-input").fill("20261119");
    await page.locator("#player-name-input").fill("Biome Audit");
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 30000 });
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.hasStarted, null, { timeout: 15000 });
    await page.locator("#pause-btn").click();
    await page.waitForFunction(async () => (await import("./js/core/state.js")).state.isPaused, null, { timeout: 5000 });

    const initial = await page.evaluate(async () => {
        const { state } = await import("./js/core/state.js");
        state.resources.gold = 800;
        state.resources.wood = 300;
        const region = state.biomeAtlas.regions.find(entry => entry.discovered);
        return {
            atlas: Boolean(state.biomeAtlas),
            regions: state.biomeAtlas.regions.length,
            discovered: state.biomeAtlas.regions.filter(entry => entry.discovered).length,
            regionId: region.id,
            resources: region.resources.filter(row => row.discovered).length,
            fauna: region.fauna.filter(row => row.discovered).length
        };
    });
    assert.equal(initial.atlas, true);
    assert.equal(initial.regions, 36);
    assert.ok(initial.discovered >= 1);
    assert.ok(initial.resources >= 3);
    assert.ok(initial.fauna >= 1);

    await page.locator("#command-open-btn").click();
    await page.locator('[data-command-tab="biome"]').click();
    await page.waitForFunction(() => (document.querySelector("#command-panel-content")?.textContent || "").toLowerCase().includes("biome resources & wildlife"), null, { timeout: 15000 });
    const panel = await page.locator("#command-panel-content").evaluate(element => element.textContent || "");
    assert.match(panel, /REGIONS SURVEYED/);
    assert.match(panel, /REGIONAL ECONOMY/);
    assert.match(panel, /KNOWN RESOURCES/);
    assert.match(panel, /WILDLIFE/);

    const firstRegion = page.locator("[data-biome-region]").first();
    await firstRegion.locator('[data-command="biome-survey"]').click();
    await page.waitForFunction(async regionId => {
        const { state } = await import("./js/core/state.js");
        return state.biomeAtlas.regions.find(entry => entry.id === regionId)?.surveyLevel >= 1;
    }, initial.regionId, { timeout: 15000 });

    const harvestButton = page.locator('#command-panel-content [data-command="biome-harvest"]:not([disabled])').first();
    const harvestTarget = await harvestButton.evaluate(button => ({
        regionId: button.dataset.value, resourceId: button.dataset.biomeResource
    }));
    const stockBefore = await page.evaluate(async ({ regionId, resourceId }) => {
        const { state } = await import("./js/core/state.js");
        const region = state.biomeAtlas.regions.find(entry => entry.id === regionId);
        const row = region.resources.find(entry => entry.id === resourceId);
        return { id: row.id, stock: row.stock };
    }, harvestTarget);
    await harvestButton.click();
    await page.waitForFunction(async ({ regionId, resourceId, before }) => {
        const { state } = await import("./js/core/state.js");
        const region = state.biomeAtlas.regions.find(entry => entry.id === regionId);
        const row = region.resources.find(entry => entry.id === resourceId);
        return row && row.stock < before;
    }, { ...harvestTarget, before: stockBefore.stock }, { timeout: 15000 });

    const huntButton = page.locator('#command-panel-content [data-command="biome-hunt"]:not([disabled])').first();
    const huntTarget = await huntButton.evaluate(button => ({
        regionId: button.dataset.value, speciesId: button.dataset.biomeSpecies
    }));
    const faunaBefore = await page.evaluate(async ({ regionId, speciesId }) => {
        const { state } = await import("./js/core/state.js");
        const region = state.biomeAtlas.regions.find(entry => entry.id === regionId);
        const row = region.fauna.find(entry => entry.id === speciesId);
        return { id: row.id, population: row.population };
    }, huntTarget);
    await huntButton.click();
    await page.waitForFunction(async ({ regionId, speciesId, before }) => {
        const { state } = await import("./js/core/state.js");
        const region = state.biomeAtlas.regions.find(entry => entry.id === regionId);
        const row = region.fauna.find(entry => entry.id === speciesId);
        return row && row.population < before;
    }, { ...huntTarget, before: faunaBefore.population }, { timeout: 15000 });

    await page.locator('[data-biome-policy="conservation"]').first().click();
    await page.waitForFunction(async regionId => {
        const { state } = await import("./js/core/state.js");
        return state.biomeAtlas.regions.find(entry => entry.id === regionId)?.policy === "conservation";
    }, initial.regionId, { timeout: 15000 });

    await page.locator("#command-close").click();
    await page.locator("#map-layer-select").selectOption("biomes");
    await page.locator('[data-zoom-level="3"]').click();
    await page.waitForFunction(async () => {
        const { state } = await import("./js/core/state.js");
        const { shouldDrawForestPoints } = await import("./js/systems/biome-resource-state.js");
        return state.mapLayer === "biomes" && shouldDrawForestPoints(state.zoomLevel, state.mapLayer);
    }, null, { timeout: 5000 });

    const beforeSave = await page.evaluate(async regionId => {
        const { state } = await import("./js/core/state.js");
        const region = state.biomeAtlas.regions.find(entry => entry.id === regionId);
        return {
            policy: region.policy,
            surveyLevel: region.surveyLevel,
            stock: region.resources.map(row => [row.id, Math.round(row.stock)]),
            fauna: region.fauna.map(row => [row.id, Math.round(row.population * 10) / 10])
        };
    }, initial.regionId);
    await page.locator("#save-btn").click();
    await page.waitForFunction(() => (document.querySelector("#save-status")?.textContent || "").startsWith("LAST SAVED"), null, { timeout: 20000 });
    await page.reload({ waitUntil: "networkidle", timeout: 60000 });
    await page.locator("#start-screen").waitFor({ state: "visible", timeout: 30000 });
    await page.waitForFunction(() => {
        const button = document.querySelector("#continue-game-btn");
        return Boolean(button && !button.disabled);
    }, null, { timeout: 15000 });
    await page.locator("#continue-game-btn").click();
    await page.waitForFunction(() => {
        const message = document.querySelector("#status-message")?.textContent || "";
        return message.includes("Loaded realm") || message.includes("Load failed");
    }, null, { timeout: 20000 });
    const loadStatus = (await page.locator("#status-message").innerText()).trim();
    assert.ok(loadStatus.includes("Loaded realm"), "the biome realm must load; actual: " + loadStatus);
    await page.evaluate(async () => { (await import("./js/core/state.js")).state.isPaused = true; });

    // Give the save pipeline a beat to finish any sliced annual work before the
    // panel reads its restored records.
    await page.waitForTimeout(250);
    await page.locator("#command-open-btn").click();
    await page.locator('[data-command-tab="biome"]').click();
    await page.waitForFunction(() => (document.querySelector("#command-panel-content")?.textContent || "").toLowerCase().includes("biome resources & wildlife"), null, { timeout: 15000 });
    const restored = await page.evaluate(async regionId => {
        const { state } = await import("./js/core/state.js");
        const region = state.biomeAtlas.regions.find(entry => entry.id === regionId);
        return {
            policy: region.policy,
            surveyLevel: region.surveyLevel,
            stock: region.resources.map(row => [row.id, Math.round(row.stock)]),
            fauna: region.fauna.map(row => [row.id, Math.round(row.population * 10) / 10]),
            text: document.querySelector("#command-panel-content")?.textContent || ""
        };
    }, initial.regionId);
    assert.equal(restored.policy, "conservation");
    assert.ok(restored.surveyLevel >= 1);
    assert.deepEqual(restored.stock, beforeSave.stock);
    assert.deepEqual(restored.fauna, beforeSave.fauna);
    assert.match(restored.text, /CONSERVE/);
    assert.match(restored.text, /LOCAL CRAFTS/);

    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
    console.log(JSON.stringify({
        ok: true,
        seed: 20261119,
        region: initial.regionId,
        regions: initial.regions,
        harvest: stockBefore.id,
        hunted: faunaBefore.id,
        policy: restored.policy,
        loaded: loadStatus,
        pageErrors: pageErrors.length,
        consoleErrors: consoleErrors.length
    }));
} finally {
    await browser.close();
    await new Promise(resolveClose => server.close(resolveClose));
}
