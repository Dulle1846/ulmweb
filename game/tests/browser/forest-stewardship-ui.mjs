// Browser proof for the player-facing forest-stewardship actions.
//
// This is deliberately narrower than the full E2E suite: it starts a real
// realm, prepares one real LUMBER building beside a real high-stock forest
// node, then drives DELIVER FOREST GOODS and THIN NEAREST STAND through the
// management UI. It also proves the full-store refusal is clickable (not
// silently disabled) and leaves both the stand and the inventory untouched.
//
// Usage: npm run test:forest-stewardship-ui
// Output: artifacts/forest-stewardship-ui/forest-stewardship-ui.png
//         artifacts/forest-stewardship-ui/forest-stewardship-ui.json

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { browserLaunchOptions, checkBrowser, printBrowserHelp } from "./browser-preflight.mjs";

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
process.chdir(gameRoot);
const outputDir = resolve(process.env.FOREST_STEWARDSHIP_OUT || "artifacts/forest-stewardship-ui");
const screenshotPath = resolve(outputDir, "forest-stewardship-ui.png");
const reportPath = resolve(outputDir, "forest-stewardship-ui.json");
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
await new Promise(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
const baseUrl = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch(browserLaunchOptions());
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, reducedMotion: "reduce" });
const page = await context.newPage();
const pageErrors = [];
const consoleErrors = [];
const evidence = { seed, ok: false, actions: {} };
page.on("pageerror", error => pageErrors.push(error.message));
page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
});

try {
    await page.goto(baseUrl + "/", { waitUntil: "networkidle" });
    await page.locator("#world-seed-input").fill(String(seed));
    await page.locator("#player-name-input").fill("Forest Stewardship UI");
    await page.locator("#start-new-game-btn").click();
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 30000 });

    // The realm can schedule an event immediately. It must not cover the
    // management dialog while the deterministic fixture is being inspected.
    if (await page.locator("#realm-event-modal").isVisible()) {
        await page.locator("#realm-event-dismiss").click();
    }
    const pauseText = (await page.locator("#pause-text").innerText()).trim();
    if (pauseText !== "RESUME") {
        await page.locator("#pause-btn").click();
        await page.waitForFunction(() => document.querySelector("#pause-text")?.textContent.trim() === "RESUME", null, { timeout: 3000 });
    }

    const fixture = await page.evaluate(async () => {
        const [
            { state },
            { TYPE },
            { spawnEntity },
            { ensureInventory, getOutputCapacity },
            { getResourceNodeAt },
            { ensureForestGathering },
            { GOOD_KEYS },
        ] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/core/types.js"),
            import("./js/world/entities.js"),
            import("./js/systems/logistics.js"),
            import("./js/systems/resource-geography.js"),
            import("./js/systems/forest-gathering.js"),
            import("./js/systems/city-config.js"),
        ]);

        const width = Number(state.worldW) || 0;
        const height = Number(state.worldH) || 0;
        let chosen = null;
        const geo = state.resourceGeography;
        for (let y = 1; y < height - 1 && !chosen; y++) {
            for (let x = 1; x < width - 1; x++) {
                const node = getResourceNodeAt(x, y);
                if (!node?.forestCapacity) continue;
                if (node.forestStock < node.forestCapacity * 0.55) continue;
                chosen = { x, y, node };
                break;
            }
        }
        if (!chosen) throw new Error("No high-stock forest node was available for the stewardship fixture");

        let building = state.entities.find(entity =>
            !entity.dead && entity.isBuilding?.() && entity.type === TYPE.LUMBER) || null;
        const original = building ? { x: building.x, y: building.y } : null;
        if (!building) {
            building = spawnEntity(chosen.x, chosen.y, TYPE.LUMBER);
            if (!building) throw new Error("The stewardship fixture could not create a lumber yard");
        }
        building.x = chosen.x;
        building.y = chosen.y;
        building.dead = false;
        building.construction = { stage: 3, progress: 100, reason: "COMPLETED" };
        building.hp = Math.max(1, Number(building.hp) || 1);
        building.maxHp = Math.max(building.hp, Number(building.maxHp) || building.hp);
        const inventory = ensureInventory(building);
        for (const key of GOOD_KEYS) {
            inventory.output[key] = 0;
            inventory.reservedOut[key] = 0;
        }

        const ledger = ensureForestGathering();
        ledger.stock = { timber: 6, firewood: 3, mushrooms: 4, "tanned-fur": 2 };
        ledger.history = [];
        state.resources.food = Math.max(100, Math.floor(Number(state.resources.food) || 0));
        state.resources.gold = Math.max(100, Math.floor(Number(state.resources.gold) || 0));

        return {
            buildingId: building.id,
            buildingType: building.type,
            original,
            node: { x: chosen.x, y: chosen.y },
            stockBefore: chosen.node.forestStock,
            capacity: chosen.node.forestCapacity,
            outputCapacity: getOutputCapacity(TYPE.LUMBER),
            foodBefore: state.resources.food,
            goldBefore: state.resources.gold,
            outputBefore: { ...inventory.output },
        };
    });
    evidence.fixture = fixture;
    assert.ok(fixture.outputCapacity > 0, "the lumber yard must have a real output store");

    async function openBuildingActions(buildingId) {
        const record = page.locator("#command-panel-content .building-record").filter({
            has: page.locator('[data-gather-forest="' + buildingId + '"]'),
        });
        await record.waitFor({ state: "visible", timeout: 5000 });
        if (!await record.evaluate(element => element.open)) {
            await record.locator("summary").click();
        }
        await record.evaluate(element => { element.open = true; });
        return record;
    }

    await page.locator("#command-open-btn").click();
    await page.locator('[data-command-tab="buildings"]').click();
    await page.locator("#command-panel-content .building-record").first().waitFor({ state: "visible", timeout: 5000 });
    await openBuildingActions(fixture.buildingId);

    const deliverButton = page.locator('[data-deliver-forest="' + fixture.buildingId + '"]');
    assert.equal(await deliverButton.count(), 1, "the lumber yard must expose a delivery action");
    assert.equal((await deliverButton.innerText()).trim(), "DELIVER FOREST GOODS");
    assert.equal(await deliverButton.isEnabled(), true, "delivery must be enabled while the ledger holds deliverable goods");
    await deliverButton.scrollIntoViewIfNeeded();
    await deliverButton.click();
    await page.waitForFunction(() => document.querySelector("#action-toast")?.textContent.includes("DELIVERED"), null, { timeout: 5000 });
    const deliveryToast = (await page.locator("#action-toast").innerText()).trim();
    assert.match(deliveryToast, /^DELIVERED /, "delivery must confirm through the shared toast");

    const afterDelivery = await page.evaluate(async buildingId => {
        const [{ state }, { getResourceNodeAt }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/resource-geography.js"),
        ]);
        const building = state.entities.find(entity => String(entity.id) === String(buildingId));
        const ledger = state.forestGathering;
        return {
            ledger: { ...(ledger?.stock || {}) },
            output: { ...(building?.inventory?.output || {}) },
            food: state.resources.food,
            gold: state.resources.gold,
            nodeStock: getResourceNodeAt(building.x, building.y).forestStock,
        };
    }, fixture.buildingId);
    evidence.actions.delivery = { toast: deliveryToast, after: afterDelivery };
    assert.ok(afterDelivery.output.logs >= 6, "delivered timber must land as logs in the lumber yard");
    assert.ok(afterDelivery.output.firewood >= 3, "delivered firewood must land in the lumber yard");
    assert.equal(afterDelivery.food - fixture.foodBefore, 4, "delivered food must enter the royal stores");
    assert.equal(afterDelivery.gold - fixture.goldBefore, 1, "delivered fur must be sold for gold");
    assert.equal(Object.values(afterDelivery.ledger).reduce((sum, value) => sum + Number(value || 0), 0), 0,
        "delivery must remove only goods accepted by their destination");
    await page.waitForFunction(buildingId => document.querySelector('[data-deliver-forest="' + buildingId + '"]')?.disabled === true,
        fixture.buildingId, { timeout: 5000 });

    await openBuildingActions(fixture.buildingId);
    const thinButton = page.locator('[data-thin-forest="' + fixture.buildingId + '"]');
    assert.equal(await thinButton.count(), 1, "the lumber yard must expose the thinning action");
    assert.equal(await thinButton.isEnabled(), true, "thinning must be enabled beside a crowded stand");
    const beforeThin = await page.evaluate(async ({ buildingId, node }) => {
        const [{ state }, { getResourceNodeAt }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/resource-geography.js"),
        ]);
        const building = state.entities.find(entity => String(entity.id) === String(buildingId));
        return {
            stock: getResourceNodeAt(node.x, node.y).forestStock,
            outputLogs: Number(building?.inventory?.output?.logs) || 0,
        };
    }, { buildingId: fixture.buildingId, node: fixture.node });
    await thinButton.scrollIntoViewIfNeeded();
    await thinButton.click();
    await page.waitForFunction(() => document.querySelector("#action-toast")?.textContent.includes("THINNED"), null, { timeout: 5000 });
    const thinToast = (await page.locator("#action-toast").innerText()).trim();
    assert.match(thinToast, /^THINNED /, "thinning must confirm through the shared toast");
    const afterThin = await page.evaluate(async ({ buildingId, node }) => {
        const [{ state }, { getResourceNodeAt }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/resource-geography.js"),
        ]);
        const building = state.entities.find(entity => String(entity.id) === String(buildingId));
        return {
            stock: getResourceNodeAt(node.x, node.y).forestStock,
            outputLogs: Number(building?.inventory?.output?.logs) || 0,
        };
    }, { buildingId: fixture.buildingId, node: fixture.node });
    evidence.actions.thinning = { toast: thinToast, before: beforeThin, after: afterThin };
    assert.ok(afterThin.stock < beforeThin.stock, "thinning must reduce the real forest node stock");
    assert.ok(afterThin.outputLogs > beforeThin.outputLogs, "thinning must add harvested logs to the lumber yard");

    await openBuildingActions(fixture.buildingId);
    await page.screenshot({ path: screenshotPath, animations: "disabled" });

    const fullStore = await page.evaluate(async buildingId => {
        const [{ state }, { TYPE }, { ensureInventory, getOutputCapacity }, { getResourceNodeAt }, { GOOD_KEYS }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/core/types.js"),
            import("./js/systems/logistics.js"),
            import("./js/systems/resource-geography.js"),
            import("./js/systems/city-config.js"),
        ]);
        const building = state.entities.find(entity => String(entity.id) === String(buildingId));
        const inventory = ensureInventory(building);
        for (const key of GOOD_KEYS) {
            inventory.output[key] = 0;
            inventory.reservedOut[key] = 0;
        }
        const capacity = getOutputCapacity(TYPE.LUMBER);
        inventory.output.logs = Math.max(1, capacity);
        return {
            capacity,
            logs: inventory.output.logs,
            nodeStock: getResourceNodeAt(building.x, building.y).forestStock,
        };
    }, fixture.buildingId);
    evidence.actions.fullStore = fullStore;
    assert.ok(fullStore.capacity > 0, "the full-store fixture must use a real capacity");

    await page.locator('[data-command-tab="buildings"]').click();
    await openBuildingActions(fixture.buildingId);
    const fullThinButton = page.locator('[data-thin-forest="' + fixture.buildingId + '"]');
    assert.equal(await fullThinButton.isEnabled(), true, "a full output store must remain clickable so the refusal can be reported");
    await fullThinButton.scrollIntoViewIfNeeded();
    await fullThinButton.click();
    await page.waitForFunction(() => document.querySelector("#action-toast")?.textContent.includes("OUTPUT STORE IS FULL"), null, { timeout: 5000 });
    const refusalToast = (await page.locator("#action-toast").innerText()).trim();
    const afterRefusal = await page.evaluate(async ({ buildingId, node }) => {
        const [{ state }, { getResourceNodeAt }] = await Promise.all([
            import("./js/core/state.js"),
            import("./js/systems/resource-geography.js"),
        ]);
        const building = state.entities.find(entity => String(entity.id) === String(buildingId));
        return {
            stock: getResourceNodeAt(node.x, node.y).forestStock,
            outputLogs: Number(building?.inventory?.output?.logs) || 0,
        };
    }, { buildingId: fixture.buildingId, node: fixture.node });
    evidence.actions.fullStore.refusal = { toast: refusalToast, after: afterRefusal };
    assert.match(refusalToast, /OUTPUT STORE IS FULL/i);
    assert.equal(afterRefusal.stock, fullStore.nodeStock, "a full-store refusal must not harvest the stand");
    assert.equal(afterRefusal.outputLogs, fullStore.logs, "a full-store refusal must not alter the full inventory");

    await page.evaluate(async buildingId => {
        const { state } = await import("./js/core/state.js");
        const building = state.entities.find(entity => String(entity.id) === String(buildingId));
        building.x = -999;
        building.y = -999;
    }, fixture.buildingId);
    await page.locator('[data-command-tab="buildings"]').click();
    await openBuildingActions(fixture.buildingId);
    const farThinButton = page.locator('[data-thin-forest="' + fixture.buildingId + '"]');
    evidence.actions.gating = {
        deliveryDisabledWhenEmpty: await page.locator('[data-deliver-forest="' + fixture.buildingId + '"]').isDisabled(),
        thinningDisabledWithoutForest: await farThinButton.isDisabled(),
        thinningTitle: await farThinButton.getAttribute("title"),
    };
    assert.equal(evidence.actions.gating.deliveryDisabledWhenEmpty, true, "empty deliveries must be disabled in the UI");
    assert.equal(evidence.actions.gating.thinningDisabledWithoutForest, true, "thinning must be disabled when no stand is in range");
    assert.match(evidence.actions.gating.thinningTitle, /No forest/i);

    assert.deepEqual(pageErrors, [], "the stewardship browser run must not emit uncaught page errors");
    assert.deepEqual(consoleErrors, [], "the stewardship browser run must not emit console errors");
    evidence.ok = true;
    console.log("Forest stewardship UI E2E passed:", JSON.stringify({
        fixture: { buildingId: fixture.buildingId, node: fixture.node, stockBefore: fixture.stockBefore },
        delivery: deliveryToast,
        thinning: thinToast,
        fullStoreRefusal: refusalToast,
        gating: evidence.actions.gating,
    }));
} finally {
    evidence.pageErrors = pageErrors;
    evidence.consoleErrors = consoleErrors;
    await writeFile(reportPath, JSON.stringify(evidence, null, 2) + "\n");
    console.log("Forest stewardship UI report:", reportPath);
    await browser.close().catch(() => {});
    await new Promise(resolveClose => server.close(resolveClose));
}
