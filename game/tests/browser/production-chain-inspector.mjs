// Real-browser proof for the production-chain inspector and warehouse profile
// hints. Found a realm, verified the HUD and workshop, placed a real warehouse,
// timber yard and mill, then used the player panels: BUILDINGS for the profile
// hint and a rejected/allowed profile click, STORES for five collapsed chains,
// a real carrier order from the bread chain, a SHOW BUILDING jump, the economy
// market, world map, biome atlas and Lexicon, then a save/restore roundtrip.
// No page or console errors are tolerated.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";
import { browserLaunchOptions } from "./browser-preflight.mjs";

const root = resolve(process.cwd());
const port = Number(process.env.E2E_PORT) || 4244;
const baseUrl = process.env.E2E_BASE_URL ? process.env.E2E_BASE_URL.replace(/\/$/, "") : null;
const label = process.env.E2E_LABEL || "local";
const artifact = name => label === "local" ? "artifacts/" + name : "artifacts/" + name.replace(/\.png$/, "-" + label + ".png");
const mime = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json",
    ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp"
};
const server = baseUrl ? null : createServer(async (req, res) => {
    try {
        const pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
        const file = resolve(root, pathname === "/" ? "index.html" : pathname.slice(1));
        if (file !== root && !file.startsWith(root + sep)) return res.writeHead(403).end("Forbidden");
        const data = await readFile(file);
        res.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
        res.end(data);
    } catch {
        res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
    }
});
if (server) await new Promise(done => server.listen(port, "127.0.0.1", done));

const browser = await chromium.launch(browserLaunchOptions());
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: "reduce" });
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));
page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
});

const url = baseUrl ? baseUrl + "/" : "http://127.0.0.1:" + port + "/";

async function openPanel(id) {
    if (await page.locator("#command-modal").evaluate(element => element.classList.contains("hidden"))) {
        await page.locator("#command-open-btn").click();
        await page.locator("#command-modal").waitFor({ state: "visible", timeout: 15000 });
    }
    await page.locator('[data-command-tab="' + id + '"]').click();
    await page.waitForFunction(tab => {
        const button = document.querySelector('[data-command-tab="' + tab + '"]');
        const content = document.querySelector("#command-panel-content");
        return Boolean(button?.classList.contains("is-active") && content?.textContent.trim().length > 40);
    }, id, { timeout: 15000 });
}

async function expandBuilding(id) {
    const record = page.locator('.building-record[data-building-id="' + id + '"]');
    await record.waitFor({ state: "visible", timeout: 15000 });
    const details = record.locator("details, .building-record-details").first();
    if (await record.evaluate(element => element.tagName === "DETAILS" && !element.open)) {
        await record.locator("summary").click();
    }
    await details.waitFor({ state: "attached", timeout: 15000 });
    return record;
}

async function storeState() {
    return page.evaluate(async () => {
        const [{ state }, { getLogisticsSnapshot, getWarehouseSnapshot, getGoodsAudit }] = await Promise.all([
            import("./js/core/state.js"), import("./js/systems/logistics.js")
        ]);
        const snapshot = getLogisticsSnapshot();
        const warehouses = getWarehouseSnapshot().rows;
        return {
            jobs: snapshot.jobs.map(job => ({ kind: job.kind, good: job.good, quantity: job.quantity, to: job.to?.id })),
            lastRejection: snapshot.lastRejection,
            warehouses: warehouses.map(row => ({ id: row.id, profile: row.profile, used: row.used, filters: row.filters.length })),
            auditBalanced: getGoodsAudit().balanced,
            tick: state.tick,
            gold: state.resources.gold,
            food: state.resources.food
        };
    });
}

let ids = {};
try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator("#world-seed-input").fill("20261126");
    await page.locator("#player-name-input").fill("Chain Inspector Proof");
    await page.locator("#start-new-game-btn").click({ noWaitAfter: true, timeout: 120000 });
    await page.locator("#start-screen").waitFor({ state: "hidden", timeout: 120000 });
    await page.evaluate(async () => { (await import("./js/core/state.js")).state.isPaused = true; });
    await page.waitForFunction(async () => {
        const { hasPendingAnnualMaintenance } = await import("./js/simulation/simulation.js");
        return !hasPendingAnnualMaintenance();
    }, null, { timeout: 20000 });

    const hud = await page.evaluate(() => ({
        season: document.querySelector("#season")?.textContent.trim() || "",
        year: document.querySelector("#year")?.textContent.trim() || "",
        gold: document.querySelector("#res-gold")?.textContent.trim() || "",
        food: document.querySelector("#res-food")?.textContent.trim() || "",
        tick: document.querySelector("#tick-count")?.textContent.trim() || ""
    }));
    assert.ok(hud.year.includes("YEAR 1") && hud.gold && hud.food && hud.tick, "the live HUD must show a started realm");

    if (!(await page.locator("#workshop-panel").isVisible())) await page.locator("#workshop-open-btn").click();
    await page.locator("#workshop-panel").waitFor({ state: "visible", timeout: 15000 });
    assert.ok((await page.locator("#workshop-title").textContent() || "").trim(), "the workshop must open with a real title");
    await page.locator("#workshop-close").click();

    const injected = await page.evaluate(async () => {
        const [{ state }, { TYPE }, { spawnEntity }, logistics] = await Promise.all([
            import("./js/core/state.js"), import("./js/core/types.js"),
            import("./js/world/entities.js"), import("./js/systems/logistics.js")
        ]);
        const warehouse = spawnEntity(60, 60, TYPE.WAREHOUSE);
        const mill = spawnEntity(62, 60, TYPE.MILL);
        const bakery = spawnEntity(64, 60, TYPE.BAKERY);
        if (!warehouse || !mill || !bakery) throw new Error("the proof structures could not be placed");
        for (const entity of [warehouse, mill, bakery]) logistics.ensureInventory(entity);
        const logs = logistics.depositGood("logs", 10, 60, 60);
        const changed = logistics.setWarehouseProfile(warehouse, "timber");
        const flour = logistics.addLocalOutput(mill, "flour", 5);
        logistics.addLocalOutput(bakery, "bread", 4);
        return {
            warehouseId: warehouse.id, millId: mill.id, bakeryId: bakery.id,
            logs, flour, profile: changed.profile,
            auditBalanced: logistics.getGoodsAudit().balanced
        };
    });
    ids = injected;
    assert.equal(injected.logs, 10);
    assert.equal(injected.flour, 5);
    assert.equal(injected.profile, "timber");
    assert.equal(injected.auditBalanced, true);

    await openPanel("buildings");
    const warehouseRecord = await expandBuilding(injected.warehouseId);
    const hint = warehouseRecord.locator('[data-profile-hint="timber"]');
    assert.equal(await hint.count(), 1, "the building record must show a warehouse profile hint");
    assert.match(await hint.textContent(), /Logs, planks, firewood and every regional timber/);
    assert.match(await warehouseRecord.textContent(), /Production chains/);
    await page.screenshot({ path: artifact("production-chain-warehouse-hint.png"), fullPage: false });

    await warehouseRecord.locator('[data-warehouse-profile="' + injected.warehouseId + '"]').selectOption("food");
    await page.waitForFunction(() => /STORE STILL HOLDS LOGS/.test(document.querySelector("#action-toast")?.textContent || ""), null, { timeout: 15000 });
    const rejected = await storeState();
    assert.equal(rejected.warehouses.find(row => row.id === injected.warehouseId)?.profile, "timber", "a rejected profile change must not mutate the store");
    await page.locator('[data-warehouse-profile="' + injected.warehouseId + '"]').selectOption("general");
    await page.waitForFunction(() => /WAREHOUSE PROFILE UPDATED/.test(document.querySelector("#action-toast")?.textContent || ""), null, { timeout: 15000 });
    const accepted = await storeState();
    assert.equal(accepted.warehouses.find(row => row.id === injected.warehouseId)?.profile, "general");
    const seededGrain = await page.evaluate(async () => {
        const logistics = await import("./js/systems/logistics.js");
        return logistics.depositGood("grain", 24, 60, 60);
    });
    assert.equal(seededGrain, 24, "the general store must now accept grain");

    await openPanel("resources");
    const resourcesText = await page.locator("#command-panel-content").textContent();
    assert.match(resourcesText, /PRODUCTION CHAINS · 5 ROUTES · 16 STAGES/);
    const storeCount = (await storeState()).warehouses.length;
    assert.ok(new RegExp("WAREHOUSE PROFILES · " + storeCount + " STORES").test(resourcesText), "the profile board must count every live store");
    assert.equal(await page.locator(".chain-record").count(), 5);
    assert.equal(await page.locator(".warehouse-profile-card").count(), 6);
    const bread = page.locator('.chain-record[data-chain-id="bread"]');
    await bread.locator("summary").click();
    await page.waitForFunction(() => document.querySelectorAll('.chain-record[data-chain-id="bread"] .chain-stage').length === 5, null, { timeout: 15000 });
    const stageText = await bread.textContent();
    assert.match(stageText, /FIELD TO LOAF|Field to loaf/);
    assert.match(stageText, /ORDER READY/);
    assert.equal(await bread.locator('.chain-stage[data-chain-stage="flour"] .chain-order[data-good="grain"][data-manual-order="supply"]').count(), 1);
    await page.screenshot({ path: artifact("production-chain-inspector-ready.png"), fullPage: false });

    const beforeOrder = await storeState();
    await bread.locator('.chain-stage[data-chain-stage="flour"] .chain-order[data-good="grain"][data-manual-order="supply"]').click();
    await page.waitForFunction(() => /SUPPLY ORDERED · 12 GRAIN/.test(document.querySelector("#action-toast")?.textContent || ""), null, { timeout: 15000 });
    const afterOrder = await storeState();
    assert.equal(afterOrder.jobs.length, beforeOrder.jobs.length + 1);
    assert.equal(afterOrder.jobs.some(job => job.kind === "supply" && job.good === "grain" && job.to === injected.millId), true);
    assert.equal(afterOrder.auditBalanced, true, "reserving a carrier job must not move goods");
    assert.match(await page.locator("#action-toast").textContent(), /SUPPLY ORDERED/);

    await openPanel("resources");
    await page.locator('.chain-record[data-chain-id="bread"] summary').click();
    const focusSelector = '.chain-stage[data-chain-stage="grain"] [data-chain-focus]';
    const focusId = await page.locator(focusSelector).getAttribute("data-chain-focus");
    assert.ok(focusId, "the grain stage must name a real structure");
    await page.locator(focusSelector).click();
    await page.waitForFunction(() => Boolean(document.querySelector('[data-command-tab="buildings"]')?.classList.contains("is-active")), null, { timeout: 15000 });
    const focused = await page.locator('.building-record[data-building-id="' + focusId + '"]').evaluate(element => element.open);
    assert.equal(focused, true, "SHOW BUILDING must open the first real stage structure");

    const panels = [];
    for (const panel of ["economy", "worldmap", "explore", "biome", "items", "chronicle"]) {
        await openPanel(panel);
        panels.push({ panel, preview: (await page.locator("#command-panel-content").textContent()).replace(/\s+/g, " ").trim().slice(0, 90) });
    }
    assert.equal(panels.length, 6);
    assert.ok(panels.every(entry => entry.preview.length > 40), "every opened panel must render real content");

    const roundtrip = await page.evaluate(async () => {
        const [{ state }, { createSaveSnapshot, prepareSaveSnapshot, restoreSaveSnapshot }] = await Promise.all([
            import("./js/core/state.js"), import("./js/core/save-runtime.js")
        ]);
        const snapshot = prepareSaveSnapshot(JSON.parse(JSON.stringify(createSaveSnapshot())));
        const before = { gold: state.resources.gold, food: state.resources.food, jobs: state.city.logistics.jobs.length };
        restoreSaveSnapshot(snapshot);
        state.isPaused = true;
        return { before, after: { gold: state.resources.gold, food: state.resources.food, jobs: state.city.logistics.jobs.length } };
    });
    assert.deepEqual(roundtrip.after, roundtrip.before, "a save/load must keep the ordered job and ledger");

    assert.deepEqual(pageErrors, [], "the chain inspector must not raise page errors");
    assert.deepEqual(consoleErrors, [], "the chain inspector must not raise console errors");
    console.log(JSON.stringify({
        ok: true, hud, injected, rejected, accepted, seededGrain, beforeOrder, afterOrder, panels, roundtrip,
        pageErrors, consoleErrors
    }, null, 2));
} finally {
    await browser.close();
    if (server) await new Promise(done => server.close(done));
}
