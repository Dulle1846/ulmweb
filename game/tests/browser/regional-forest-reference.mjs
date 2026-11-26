// Player-facing browser proof for the sixty regional forest types.
//
// Starts a real tropical realm, confirms that every harvestable woodland tile
// resolves a regional type and a profile, opens a real lumber yard inspector,
// and captures three different regional stands through the production terrain
// renderer. The three frame hashes must differ, which is the browser-side
// complement to the palette test in tests/world/regional-forests.test.js.
//
// Usage: node tests/browser/regional-forest-reference.mjs
// Output: artifacts/regional-forests/regional-forests.json
//         artifacts/regional-forests/regional-forests.png
//         artifacts/regional-forests/stand-<id>.png

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { browserLaunchOptions, checkBrowser, printBrowserHelp } from "./browser-preflight.mjs";

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
process.chdir(gameRoot);
const outputDir = resolve(process.env.REGIONAL_FOREST_OUT || "artifacts/regional-forests");
const seed = 20261104;
const mimeTypes = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
};

function createStaticServer() {
    return createServer(async (request, response) => {
        try {
            const url = new URL(request.url || "/", "http://localhost");
            const relative = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname).slice(1);
            const file = resolve(gameRoot, relative);
            if (file !== gameRoot && !file.startsWith(gameRoot + sep)) {
                response.writeHead(403);
                response.end("Forbidden");
                return;
            }
            const body = await readFile(file);
            response.writeHead(200, {
                "content-type": mimeTypes[extname(file)] || "application/octet-stream",
                "cache-control": "no-store",
            });
            response.end(body);
        } catch {
            response.writeHead(404, { "content-type": "text/plain" });
            response.end("Not found");
        }
    });
}

const probe = await checkBrowser();
if (!probe.ok) {
    printBrowserHelp(probe.error);
    process.exit(1);
}

await mkdir(outputDir, { recursive: true });
const { chromium } = await import("playwright");
const server = createStaticServer();
await new Promise(listen => server.listen(0, "127.0.0.1", listen));
const baseUrl = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch(browserLaunchOptions());
const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: "reduce" });
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
const evidence = { seed, climate: "tropical", ok: false };
page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", error => pageErrors.push(error.message));

try {
    await page.goto(baseUrl + "/", { waitUntil: "networkidle" });
    await page.locator("#world-seed-input").fill(String(seed));
    await page.locator("#player-name-input").fill("Regional Forest Reference");
    await page.locator("#world-climate").selectOption("tropical");
    await page.locator("#world-forests").evaluate(element => {
        element.value = "78";
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 30000 });
    await page.waitForTimeout(800);
    if (await page.locator("#realm-event-modal").isVisible()) {
        await page.locator("#realm-event-dismiss").click();
    }
    const pauseText = (await page.locator("#pause-text").innerText()).trim();
    if (pauseText !== "RESUME") {
        await page.locator("#pause-btn").click();
        await page.waitForFunction(() => document.querySelector("#pause-text")?.textContent.trim() === "RESUME", null, { timeout: 3000 });
    }

    const scan = await page.evaluate(async () => {
        const [{ state }, { getResourceNodeAt }, { TYPE }, { spawnEntity }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/resource-geography.js"),
            import("./js/core/types.js"),
            import("./js/world/entities.js"),
        ]);
        state.isPaused = true;
        const width = Number(state.worldW) || 0;
        const height = Number(state.worldH) || 0;
        const byType = {};
        let forestTiles = 0;
        let untyped = 0;
        for (let y = 2; y < height - 2; y++) {
            for (let x = 2; x < width - 2; x++) {
                const node = getResourceNodeAt(x, y);
                if (!node?.forestCapacity) continue;
                forestTiles++;
                if (!node.forestRegionalType) {
                    untyped++;
                    continue;
                }
                const previous = byType[node.forestRegionalType];
                const treeChance = Number(node.forestStand?.treeChance) || 0;
                const clearing = Number(node.forestStand?.clearing) || 0;
                const score = treeChance + (1 - clearing) * 0.18
                    + (Number(node.forestStock) / Math.max(1, Number(node.forestCapacity))) * 0.08;
                if (!previous || score > previous.score) {
                    byType[node.forestRegionalType] = {
                        id: node.forestRegionalType,
                        x, y,
                        label: node.forestRegionalLabel,
                        short: node.forestRegionalShortLabel,
                        profile: node.forestRegionalProfile,
                        effects: node.forestRegionalEffects,
                        palette: node.forestRegionalRender?.palette || [],
                        silhouette: node.forestRegionalSilhouette,
                        standType: node.forestType,
                        stock: node.forestStock,
                        capacity: node.forestCapacity,
                        score,
                        treeChance,
                        clearing,
                    };
                }
            }
        }
        const types = Object.values(byType).sort((a, b) => a.id.localeCompare(b.id));
        const inspectorType = types.find(entry => entry.id === "1.2.23.1.024") || types[0];
        let building = state.entities.find(entity => !entity.dead && entity.isBuilding?.() && entity.type === TYPE.LUMBER) || null;
        if (!building) building = spawnEntity(inspectorType.x, inspectorType.y, TYPE.LUMBER);
        if (!building) throw new Error("Could not create a lumber yard for the regional inspector fixture");
        building.x = inspectorType.x;
        building.y = inspectorType.y;
        building.dead = false;
        building.construction = { stage: 3, progress: 100, reason: "COMPLETED" };
        building.hp = Math.max(1, Number(building.hp) || 1);
        building.maxHp = Math.max(building.hp, Number(building.maxHp) || building.hp);
        return { width, height, forestTiles, untyped, types, inspectorType, buildingId: building.id };
    });
    evidence.world = { width: scan.width, height: scan.height, forestTiles: scan.forestTiles, untyped: scan.untyped };
    evidence.types = scan.types.map(entry => ({
        id: entry.id, label: entry.label, x: entry.x, y: entry.y,
        standType: entry.standType, silhouette: entry.silhouette,
        palette: entry.palette, effects: entry.effects,
    }));
    assert.equal(scan.untyped, 0, "no harvestable tropical forest tile may be untyped");
    assert.ok(scan.types.length >= 6, "the tropical reference realm must contain a real spread of regional types");
    assert.ok(scan.types.every(entry => entry.label && entry.profile && entry.effects), "every type needs label, profile and effects");
    assert.ok(scan.types.every(entry => new Set(entry.palette).size >= 3), "every type needs a distinct palette");

    await page.locator("#command-open-btn").click();
    await page.locator('[data-command-tab="buildings"]').click();
    const record = page.locator("#command-panel-content .building-record").filter({
        has: page.locator('[data-gather-forest="' + scan.buildingId + '"]'),
    });
    await record.waitFor({ state: "visible", timeout: 5000 });
    if (!await record.evaluate(element => element.open)) await record.locator("summary").click();
    await record.evaluate(element => { element.open = true; });
    await page.waitForTimeout(500);
    const inspectorText = (await record.innerText()).trim();
    evidence.inspector = { id: scan.inspectorType.id, label: scan.inspectorType.label, text: inspectorText };
    assert.match(inspectorText, /Forest type:/, "the lumber inspector must name the regional forest type");
    assert.ok(inspectorText.includes(scan.inspectorType.label), "the inspector must show the selected regional label");
    assert.ok(inspectorText.includes("Timber yield"), "the inspector must show the timber effect");
    assert.ok(inspectorText.includes("Regrowth"), "the inspector must show the regrowth effect");
    assert.ok(inspectorText.includes("Wildlife"), "the inspector must show the fauna effect");
    assert.ok(inspectorText.includes("Forage"), "the inspector must show the forage effect");
    assert.match(inspectorText, /Mix class:/, "the inspector must show the real mixture class");
    assert.match(inspectorText, /Phase:/, "the inspector must show the succession phase");
    assert.match(inspectorText, /Seed bank:/, "the inspector must show the seed bank");
    assert.match(inspectorText, /System:/, "the inspector must show the silvicultural system");
    assert.match(inspectorText, /Lianas\/epiphytes:/, "the inspector must show liana and epiphyte cover");
    await page.screenshot({ path: resolve(outputDir, "regional-forests.png"), fullPage: false });

    // The forest atlas is the player-facing catalogue of all 60 types. Open it
    // through the real tab and assert the complete catalogue is mounted.
    await page.locator('[data-command-tab="forest"]').click();
    await page.locator("#command-panel-content .forest-atlas__card").first().waitFor({ state: "visible", timeout: 5000 });
    const atlasCards = await page.locator("#command-panel-content .forest-atlas__card").count();
    const atlasText = (await page.locator("#command-panel-content").innerText()).trim();
    assert.equal(atlasCards, 60, "the atlas must list all 60 regional forest types");
    assert.match(atlasText, /Sixty regional woodlands/);
    assert.match(atlasText, /SURVEYED/);
    // Cards are collapsed by default, so open the two tropical/conifer profiles
    // a player would inspect and read the named timber line inside them.
    await page.locator('details[data-forest-type="1.2.23.1.024"] summary').click();
    await page.locator('details[data-forest-type="1.2.23.1.024"] .forest-atlas__timber').waitFor({ state: "visible", timeout: 5000 });
    const mangroveText = await page.locator('details[data-forest-type="1.2.23.1.024"]').innerText();
    assert.match(mangroveText, /Mangrove Timber/);
    assert.match(mangroveText, /planks/);
    await page.locator('details[data-forest-type="1.2.23.1.016"] summary').click();
    await page.locator('details[data-forest-type="1.2.23.1.016"] .forest-atlas__timber').waitFor({ state: "visible", timeout: 5000 });
    const redwoodText = await page.locator('details[data-forest-type="1.2.23.1.016"]').innerText();
    assert.match(redwoodText, /Redwood Timber/);
    // At least one surveyed type must carry the new ten-cell ecology block.
    const ecologyCard = page.locator('#command-panel-content .forest-atlas__card')
        .filter({ has: page.locator('.forest-atlas__dynamics') }).first();
    await ecologyCard.waitFor({ state: "visible", timeout: 5000 });
    if (!await ecologyCard.evaluate(element => element.open)) {
        await ecologyCard.locator("summary").click();
    }
    const ecologyText = (await ecologyCard.innerText()).trim();
    assert.match(ecologyText, /SEED BANK/, "a surveyed atlas card must show the seed bank");
    assert.match(ecologyText, /GENETICS/, "a surveyed atlas card must show genetic breadth");
    assert.match(ecologyText, /SYSTEM/, "a surveyed atlas card must show the silvicultural system");
    assert.match(ecologyText, /REGIME/, "a surveyed atlas card must show the disturbance regime");
    assert.match(ecologyText, /STRUCTURE/, "a surveyed atlas card must show understorey and epiphytes");
    assert.match(ecologyText, /LIGHT/, "a surveyed atlas card must show light woodland and gap age");
    assert.match(ecologyText, /GAPS/, "a surveyed atlas card must show canopy gaps and medicine");
    assert.match(ecologyText, /MODEL/, "a surveyed atlas card must show the stable model id and site envelope");
    assert.match(ecologyText, /SOIL \/ WATER/, "a surveyed atlas card must show soil, pH and water storage");
    assert.match(ecologyText, /DISTURBANCE/, "a surveyed atlas card must show the disturbance matrix");
    assert.match(ecologyText, /PERFORMANCE/, "a surveyed atlas card must show the LOD and biodiversity budget");
    assert.match(ecologyText, /LOD detail · \d+ trees\/chunk/, "the atlas must expose the real LOD tier and tree cap");
    assert.match(ecologyText, /biodiversity \d+% · \d+y regen · forest-vegetation/, "the atlas must expose biodiversity, regeneration and the named RNG stream");
    const modelCards = await page.locator('#command-panel-content [data-forest-model]').count();
    assert.ok(modelCards > 0, "at least one present type must render the shared forest model block");
    const modelText = await page.locator('#command-panel-content [data-forest-model]').first().innerText();
    assert.doesNotMatch(modelText, /undefined|NaN/, "the model block must not leak placeholders");
    assert.match(ecologyText, /fire \d+% · wind \d+%/, "the regime must expose both fire and wind shares");
    assert.match(ecologyText, /uptake \d+%/, "the soil block must expose water uptake");
    assert.match(ecologyText, /decomposition \d+%/, "the soil block must expose decomposition");
    assert.match(ecologyText, /gap age \d+d/, "the light block must expose a real gap age");
    assert.match(ecologyText, /medicine \d+%/, "the gap block must expose medicinal herbs");
    evidence.atlas = {
        cards: atlasCards, sampled: /SURVEYED/.test(atlasText), mangrove: true, redwood: true, ecology: true,
        model: modelCards,
    };
    await page.screenshot({ path: resolve(outputDir, "forest-atlas.png"), fullPage: false });
    await ecologyCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.screenshot({ path: resolve(outputDir, "forest-atlas-ecology.png"), fullPage: false });

    // The regional timber market is physical warehouse stock. Deposit a real
    // lot into the royal store, sell it through the player button and prove the
    // treasury rose while the goods actually left the store.
    const deposit = await page.evaluate(async () => {
        const [{ state }, { depositGood }, { getPhysicalStock }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/logistics.js"),
            import("./js/systems/logistics.js"),
        ]);
        const keep = state.entities.find(entity => !entity.dead && entity.type === 0);
        const amount = depositGood("mangrove-timber", 6, keep?.x || 0, keep?.y || 0);
        return { amount, stock: getPhysicalStock("mangrove-timber"), gold: Number(state.resources.gold) || 0 };
    });
    assert.equal(deposit.amount, 6, "the royal store must accept the regional timber");
    await page.locator('[data-command-tab="resources"]').click();
    const marketRows = page.locator("#command-panel-content .timber-market__row");
    await marketRows.first().waitFor({ state: "visible", timeout: 5000 });
    assert.equal(await marketRows.count(), 18, "the timber market must list all 18 regional timbers");
    const mangroveRow = page.locator('#command-panel-content .timber-market__row[data-timber-good="mangrove-timber"]');
    await mangroveRow.waitFor({ state: "visible", timeout: 5000 });
    const rowText = (await mangroveRow.innerText()).trim();
    assert.match(rowText, /6 in store/);
    await mangroveRow.locator("button.timber-market__sell").click();
    await page.waitForTimeout(500);
    const sale = await page.evaluate(async () => {
        const [{ state }, { getPhysicalStock }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/logistics.js"),
        ]);
        return { stock: getPhysicalStock("mangrove-timber"), gold: Number(state.resources.gold) || 0 };
    });
    assert.ok(sale.gold > deposit.gold, "selling timber must pay the treasury");
    assert.equal(sale.stock, deposit.stock - 5, "the sale removes five real units from the store");
    const toastText = (await page.locator("#action-toast").innerText()).trim();
    assert.match(toastText, /TIMBER SOLD/);
    evidence.market = { rows: 18, deposited: deposit.amount, sold: 5, goldGained: sale.gold - deposit.gold, stockLeft: sale.stock };
    await page.screenshot({ path: resolve(outputDir, "timber-market.png"), fullPage: false });
    await page.locator("#command-close").click();
    await page.waitForFunction(() => document.getElementById("command-modal")?.classList.contains("hidden"), null, { timeout: 5000 });
    if (await page.locator("#realm-event-modal").isVisible()) await page.locator("#realm-event-dismiss").click();
    // The running game may be paused with a stale, fog-covered terrain
    // surface. Replace it with a known Canvas2D surface and reveal the world,
    // exactly as the forest reference does, so the frames show tree geometry
    // rather than the dark pre-render stage.
    await page.evaluate(async () => {
        const [{ state }, { resize, centerCamera }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/presentation/camera.js"),
        ]);
        state.isPaused = true;
        state.weather = "clear";
        const width = Number(state.worldW) || 160;
        const height = Number(state.worldH) || 160;
        state.explored = Array.from({ length: width }, () => Array(height).fill(true));
        state.fogDirty = true;
        state.fogExploredRef = null;
        state.entities = [];
        state.particles = [];
        state.floaters = [];
        const previous = document.getElementById("terrain-canvas");
        const canvas = previous.cloneNode(false);
        canvas.width = state.canvas.width;
        canvas.height = state.canvas.height;
        canvas.style.opacity = "";
        canvas.style.transform = "";
        previous.replaceWith(canvas);
        state.terrainCanvasEl = canvas;
        state.terrainCacheRevision = (Number(state.terrainCacheRevision) || 0) + 1;
        state.terrainRenderer = "canvas";
        state.terrainAutoMode = "canvas";
        state.terrainMode = "canvas";
        state.terrainFallback = false;
        canvas.getContext("2d", { alpha: false });
        resize();
        centerCamera();
    });
    await page.addStyleTag({
        content: `#realm-event-modal, .event-notification, #realm-action-dock { display: none !important; }`,
    });
    await page.waitForTimeout(500);

    const frames = [];
    const targets = ["1.2.23.1.024", "1.2.23.1.028", "1.2.23.1.025"]
        .map(id => scan.types.find(entry => entry.id === id))
        .filter(Boolean);
    const fallback = scan.types.filter(entry => !targets.some(target => target.id === entry.id)).slice(0, 3 - targets.length);
    targets.push(...fallback);
    for (const target of targets) {
        await page.evaluate(async ({ x, y }) => {
            const [{ state }, { setZoomLevel, clampCamera }, { CELL }, { drawWorld }] = await Promise.all([
                import("./js/core/state.js"),
                import("./js/presentation/camera.js"),
                import("./js/core/config.js"),
                import("./js/presentation/rendering/renderer.js"),
            ]);
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
            drawWorld();
        }, { x: target.x, y: target.y });
        await page.waitForTimeout(700);
        const buffer = await page.locator("#canvas-wrapper").screenshot({ type: "png", animations: "disabled" });
        const file = "stand-" + target.id.slice(-3) + ".png";
        await writeFile(resolve(outputDir, file), buffer);
        frames.push({
            id: target.id,
            label: target.label,
            x: target.x,
            y: target.y,
            file,
            hash: createHash("sha256").update(buffer).digest("hex"),
        });
    }
    evidence.frames = frames;
    assert.ok(new Set(frames.map(frame => frame.hash)).size === frames.length, "captured regional stands must not be pixel-identical");
    assert.equal(consoleErrors.length, 0, "console errors: " + consoleErrors.join(" | "));
    assert.equal(pageErrors.length, 0, "page errors: " + pageErrors.join(" | "));
    evidence.ok = true;
    console.log("REGIONAL FOREST REFERENCE", JSON.stringify(evidence, null, 2));
} finally {
    await writeFile(resolve(outputDir, "regional-forests.json"), JSON.stringify({
        ...evidence, consoleErrors, pageErrors, generatedAt: new Date().toISOString(),
    }, null, 2));
    await browser.close();
    await new Promise(resolveClose => server.close(resolveClose));
}
